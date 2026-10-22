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
