<?php
declare(strict_types=1);

/**
 * Fotos dos produtos.
 * - O navegador já reduz a foto (máx. 800 px) antes de enviar.
 * - Aqui a imagem é conferida e REGRAVADA (GD) como JPEG: some qualquer coisa escondida no arquivo.
 * - Arquivos em /uploads/produtos/ (na raiz do site), com nome aleatório. O .htaccess da pasta só serve imagens.
 * - As fotos NÃO vão no backup .sql: baixe a pasta /uploads pelo FileZilla de vez em quando.
 *
 * @var Router $r
 */

const FOTO_MAX_BYTES = 6 * 1024 * 1024;
const FOTO_MAX_LADO = 1000;

function pastaFotos(): string
{
    $dir = dirname(__DIR__, 2) . '/uploads/produtos';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) throw new HttpError(500, 'Não foi possível criar a pasta de fotos no servidor.');
    $ht = dirname($dir) . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "# Só imagens; nada aqui é executado\nOptions -Indexes\n<IfModule mod_rewrite.c>\n  RewriteEngine Off\n</IfModule>\n"
            . "<FilesMatch \"(?i)\\.(php|phtml|phar|pl|py|cgi|sh|htm|html|js|svg)$\">\n  Require all denied\n</FilesMatch>\n"
            . "<IfModule mod_headers.c>\n  Header set X-Content-Type-Options nosniff\n</IfModule>\n");
    }
    return $dir;
}

function apagarFoto(?string $rel): void
{
    if (!$rel || !preg_match('#^uploads/produtos/[a-f0-9]{24}\.(jpg|png|webp)$#', $rel)) return;
    @unlink(dirname(__DIR__, 2) . '/' . $rel);
}

/** Valida e regrava a imagem. Retorna o caminho relativo salvo. */
function salvarFoto(string $tmp): string
{
    if (filesize($tmp) > FOTO_MAX_BYTES) throw new HttpError(422, 'Foto muito grande (máx. 6 MB).');
    $info = @getimagesize($tmp);
    $tipos = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
    if (!$info || !isset($tipos[$info[2]])) throw new HttpError(422, 'Envie uma foto em JPG, PNG ou WEBP.');
    [$w, $h] = $info;
    if ($w < 16 || $h < 16 || $w * $h > 40_000_000) throw new HttpError(422, 'Tamanho de imagem inválido.');

    $nome = bin2hex(random_bytes(12));
    $dir = pastaFotos();

    if (function_exists('imagecreatefromstring')) {
        $src = @imagecreatefromstring((string)file_get_contents($tmp));
        if (!$src) throw new HttpError(422, 'Não foi possível ler a foto.');
        $esc = min(1, FOTO_MAX_LADO / max($w, $h));
        $nw = max(1, (int)round($w * $esc));
        $nh = max(1, (int)round($h * $esc));
        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));   // fundo branco para PNG transparente
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        $arq = "$dir/$nome.jpg";
        if (!imagejpeg($dst, $arq, 82)) throw new HttpError(500, 'Não foi possível salvar a foto.');
        imagedestroy($src);
        imagedestroy($dst);
        return "uploads/produtos/$nome.jpg";
    }
    // Hospedagem sem GD: guarda o arquivo como veio (já validado como imagem)
    $ext = $tipos[$info[2]];
    if (!move_uploaded_file($tmp, "$dir/$nome.$ext") && !copy($tmp, "$dir/$nome.$ext")) throw new HttpError(500, 'Não foi possível salvar a foto.');
    return "uploads/produtos/$nome.$ext";
}

$r->post('/produtos/{id}/foto', function (int $id) {
    Auth::admin();
    $prod = buscarProduto($id);
    $f = $_FILES['foto'] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $msg = match ($f['error'] ?? UPLOAD_ERR_NO_FILE) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'Foto muito grande para o servidor.',
            UPLOAD_ERR_NO_FILE => 'Escolha uma foto.',
            default => 'A foto não chegou inteira. Tente de novo.',
        };
        throw new HttpError(422, $msg);
    }
    if (!is_uploaded_file($f['tmp_name'])) throw new HttpError(422, 'Envio inválido.');
    $rel = salvarFoto($f['tmp_name']);
    Db::exec('UPDATE produtos SET imagem = ? WHERE id = ?', [$rel, $id]);
    apagarFoto($prod['imagem']);
    return produtoOut(buscarProduto($id));
});

$r->delete('/produtos/{id}/foto', function (int $id) {
    Auth::admin();
    $prod = buscarProduto($id);
    Db::exec('UPDATE produtos SET imagem = NULL WHERE id = ?', [$id]);
    apagarFoto($prod['imagem']);
    return produtoOut(buscarProduto($id));
});

// ---------------------------------------------------------------------
// Fotos automáticas pelo código de barras (Open Food Facts — base aberta, fotos com licença CC BY-SA)
// ---------------------------------------------------------------------

/** Base da API (pode trocar no config.php: 'open_food_facts' => 'https://world.openfoodfacts.org'). */
function offBase(): string
{
    global $config;
    return rtrim((string)($config['open_food_facts'] ?? 'https://world.openfoodfacts.org'), '/');
}

function baixarHttp(string $url, int $maxBytes, int $timeout = 8, bool $aceitar404 = false): ?string
{
    $ch = curl_init($url);
    $dados = '';
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false,   // sem redirecionar: só o endereço conferido
        CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
        CURLOPT_USERAGENT => 'ParadaObrigatoria-Sistema/1.0 (sistema de bar e mercadinho)',
        CURLOPT_WRITEFUNCTION => function ($ch, $parte) use (&$dados, $maxBytes) {
            $dados .= $parte;
            return strlen($dados) > $maxBytes ? 0 : strlen($parte);   // corta arquivo grande demais
        },
    ]);
    $ok = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    // a API responde 404 (com JSON) quando não conhece o código
    return $ok && (($status >= 200 && $status < 300) || ($aceitar404 && $status === 404)) ? $dados : null;
}

/** Procura o produto pelo código e devolve nome e foto sugerida (ou achou=false). */
function sugestaoOff(string $codigo): array
{
    if (!preg_match('/^\d{8,14}$/', $codigo)) return ['achou' => false, 'motivo' => 'codigo'];
    $json = baixarHttp(offBase() . "/api/v2/product/$codigo.json?fields=product_name,product_name_pt,brands,quantity,image_front_url,image_url,selected_images", 400_000, 8, true);
    if ($json === null) return ['achou' => false, 'motivo' => 'conexao'];
    $d = json_decode($json, true);
    $p = $d['product'] ?? null;
    if (!is_array($p) || !$p || (isset($d['status']) && (int)$d['status'] !== 1)) return ['achou' => false, 'motivo' => 'nao_encontrado'];
    $sel = $p['selected_images']['front']['display'] ?? [];
    $img = $p['image_front_url'] ?? ($sel['pt'] ?? null) ?? (is_array($sel) && $sel ? reset($sel) : null) ?? $p['image_url'] ?? null;
    if (!is_string($img) || $img === '') $img = null;
    $nome = trim(implode(' ', array_filter([$p['product_name_pt'] ?? $p['product_name'] ?? null, $p['brands'] ?? null, $p['quantity'] ?? null])));
    if ($img && !fotoOffPermitida($img)) $img = null;   // só aceita foto hospedada no próprio Open Food Facts
    return [
        'achou' => (bool)$img,
        'motivo' => $img ? null : 'sem_foto',
        'nome' => $nome ?: null,
        'imagem_url' => $img,
    ];
}

/** Só baixa imagens do próprio Open Food Facts (nunca de um endereço qualquer). */
function fotoOffPermitida(string $url): bool
{
    $h = strtolower((string)parse_url($url, PHP_URL_HOST));
    $base = strtolower((string)parse_url(offBase(), PHP_URL_HOST));
    return in_array(parse_url($url, PHP_URL_SCHEME), ['https', 'http'], true)
        && ($h === $base || preg_match('/(^|\.)openfoodfacts\.(org|net)$/', $h));
}

$r->get('/produtos/foto-sugerida', function () {
    Auth::admin();
    $c = normalizarCodigo(Http::query('codigo'));
    if (!$c) throw new HttpError(422, 'Informe o código.');
    return sugestaoOff($c);
});

/** Usa a foto sugerida: baixa do Open Food Facts, regrava e liga ao produto. */
$r->post('/produtos/{id}/foto-url', function (int $id) {
    Auth::admin();
    $prod = buscarProduto($id);
    $url = (string)(Http::body()['url'] ?? '');
    if (!fotoOffPermitida($url)) throw new HttpError(422, 'Endereço de foto não permitido.');
    $bin = baixarHttp($url, FOTO_MAX_BYTES, 15);
    if ($bin === null) throw new HttpError(502, 'Não foi possível baixar a foto agora. Tente de novo.');
    $tmp = tempnam(sys_get_temp_dir(), 'foto');
    file_put_contents($tmp, $bin);
    try { $rel = salvarFoto($tmp); } finally { @unlink($tmp); }
    Db::exec('UPDATE produtos SET imagem = ? WHERE id = ?', [$rel, $id]);
    Db::exec("INSERT INTO configuracoes (chave, valor) VALUES ('fotos_open_food_facts', '1') ON DUPLICATE KEY UPDATE valor = '1'");
    apagarFoto($prod['imagem']);
    return produtoOut(buscarProduto($id));
});

/** Liga um código de barras a um produto (modo "passar a prateleira"). */
$r->post('/produtos/{id}/codigo', function (int $id) {
    Auth::admin();
    buscarProduto($id);
    $c = normalizarCodigo(Http::body()['codigo_barras'] ?? null);
    if (!$c) throw new HttpError(422, 'Código inválido.');
    checarCodigoUnico($c, $id);
    Db::exec('UPDATE produtos SET codigo_barras = ? WHERE id = ?', [$c, $id]);
    return produtoOut(buscarProduto($id));
});

/** Produtos com código e sem foto (para a busca automática em lote). */
$r->get('/produtos/sem-foto', function () {
    Auth::admin();
    $rows = Db::all(SQL_PRODUTO . " WHERE p.ativo = 1 AND (p.imagem IS NULL OR p.imagem = '') ORDER BY p.codigo_barras IS NULL, c.nome, p.nome LIMIT 1000");
    return array_map('produtoOut', $rows);
});
