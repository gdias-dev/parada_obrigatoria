<?php
declare(strict_types=1);

/** @var Router $r */

const UNIDADES = ['UN', 'KG', 'L', 'CX', 'PCT'];

/**
 * SELECT padrão do produto, já trazendo a unidade-base quando o produto
 * é uma embalagem (engradado/fardo/pack).
 */
const SQL_PRODUTO = 'SELECT p.*, c.nome AS categoria,
        b.nome AS base_nome, b.estoque AS base_estoque, b.preco_custo AS base_custo, b.unidade AS base_unidade,
        b.controla_estoque AS base_controla, b.usa_casco AS base_usa_casco, b.valor_casco AS base_valor_casco
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    LEFT JOIN produtos b ON b.id = p.produto_base_id';

function ehEmbalagem(array $p): bool
{
    return $p['produto_base_id'] !== null && (float)$p['fator'] > 0;
}

/** Custo real: embalagem custa (custo da unidade × quantidade). */
function custoProduto(array $p): float
{
    return ehEmbalagem($p) ? round((float)$p['base_custo'] * (float)$p['fator'], 2) : (float)$p['preco_custo'];
}

/** Funcionário não recebe custo nem margem. */
function produtoOut(array $p): array
{
    $venda = (float)$p['preco_venda'];
    $emb = ehEmbalagem($p);
    $out = [
        'id'               => (int)$p['id'],
        'codigo_barras'    => $p['codigo_barras'],
        'nome'             => $p['nome'],
        'categoria_id'     => $p['categoria_id'] !== null ? (int)$p['categoria_id'] : null,
        'categoria'        => $p['categoria'] ?? null,
        'unidade'          => $p['unidade'],
        'preco_venda'      => $venda,
        'estoque'          => (float)$p['estoque'],
        'estoque_minimo'   => (float)$p['estoque_minimo'],
        'controla_estoque' => (bool)$p['controla_estoque'],
        'visivel_online'   => (bool)$p['visivel_online'],
        'descricao'        => $p['descricao'],
        'ativo'            => (bool)$p['ativo'],
        'atualizado_em'    => $p['atualizado_em'],
        // engradado / fardo / pack
        'produto_base_id'  => $emb ? (int)$p['produto_base_id'] : null,
        'fator'            => $emb ? (float)$p['fator'] : null,
        'base_nome'        => $emb ? $p['base_nome'] : null,
        'base_unidade'     => $emb ? $p['base_unidade'] : null,
        'base_estoque'     => $emb ? (float)$p['base_estoque'] : null,
        'base_controla'    => $emb ? (bool)$p['base_controla'] : null,
        'estoque_embalagens' => $emb ? floor((float)$p['base_estoque'] / (float)$p['fator']) : null,
        // casco retornável
        'usa_casco'        => (bool)$p['usa_casco'],
        'valor_casco'      => (float)$p['valor_casco'],
        'estoque_cascos'   => (int)$p['estoque_cascos'],
        'casco_da_base'    => $emb && $p['base_usa_casco'] ? (float)$p['base_valor_casco'] : null,
    ];
    if (Auth::isAdmin()) {
        $custo = custoProduto($p);
        $out['preco_custo'] = $custo;
        $out['lucro_unitario'] = round($venda - $custo, 2);
        // margem sobre o preço de venda (quanto de cada R$ vendido é lucro)
        $out['margem_pct'] = $venda > 0 ? round(($venda - $custo) / $venda * 100, 1) : null;
    }
    return $out;
}

function buscarProduto(int $id): array
{
    return Db::one(SQL_PRODUTO . ' WHERE p.id = ?', [$id]) ?? throw new HttpError(404, 'Produto não encontrado.');
}

function normalizarCodigo(mixed $v): ?string
{
    if ($v === null) return null;
    if (is_float($v) || is_int($v)) $v = number_format((float)$v, 0, '', '');
    $v = preg_replace('/\s+/', '', (string)$v);
    if ($v === '') return null;
    if (mb_strlen($v) > 30) throw new HttpError(422, 'Código de barras muito longo (máx. 30).', ['campo' => 'codigo_barras']);
    return $v;
}

/** Confere se o produto pode ser a "unidade" de uma embalagem. */
function validarBase(int $baseId, int $proprioId = 0): array
{
    $b = Db::one('SELECT id, nome, produto_base_id FROM produtos WHERE id = ?', [$baseId]);
    if (!$b) throw new HttpError(422, 'Produto da unidade não encontrado.', ['campo' => 'produto_base_id']);
    if ((int)$b['id'] === $proprioId) throw new HttpError(422, 'O produto não pode ser embalagem dele mesmo.', ['campo' => 'produto_base_id']);
    if ($b['produto_base_id'] !== null) {
        throw new HttpError(422, "\"{$b['nome']}\" já é uma embalagem. Escolha o produto vendido por unidade.", ['campo' => 'produto_base_id']);
    }
    if ($proprioId && Db::value('SELECT 1 FROM produtos WHERE produto_base_id = ?', [$proprioId])) {
        throw new HttpError(422, 'Este produto já tem engradados ligados a ele, então não pode virar embalagem.', ['campo' => 'produto_base_id']);
    }
    return $b;
}

/** Lê e valida os campos do formulário de produto. */
function dadosProduto(array $d, ?array $atual = null): array
{
    $codigo = normalizarCodigo($d['codigo_barras'] ?? null);
    $categoriaId = isset($d['categoria_id']) && $d['categoria_id'] !== '' && $d['categoria_id'] !== null ? (int)$d['categoria_id'] : null;
    if ($categoriaId && !Db::value('SELECT 1 FROM categorias WHERE id = ?', [$categoriaId])) {
        throw new HttpError(422, 'Categoria não encontrada.', ['campo' => 'categoria_id']);
    }

    $baseId = !empty($d['produto_base_id']) ? (int)$d['produto_base_id'] : null;
    $fator = null;
    if ($baseId) {
        validarBase($baseId, (int)($atual['id'] ?? 0));
        $fator = V::parseNumber($d['fator'] ?? null);
        if ($fator === null || $fator < 2 || $fator > 10000 || floor($fator) != $fator) {
            throw new HttpError(422, 'Informe quantas unidades vêm na embalagem (número inteiro, 2 ou mais).', ['campo' => 'fator']);
        }
    }

    $usaCasco = $baseId ? 0 : V::bool($d, 'usa_casco', (bool)($atual['usa_casco'] ?? false));
    $valorCasco = $usaCasco ? V::money($d, 'valor_casco', true, 0.01) : 0.0;

    return [
        'codigo_barras'    => $codigo,
        'nome'             => V::str($d, 'nome', 150, true, 2),
        'categoria_id'     => $categoriaId,
        'produto_base_id'  => $baseId,
        'fator'            => $fator,
        'unidade'          => V::enum($d, 'unidade', UNIDADES, $atual['unidade'] ?? ($baseId ? 'CX' : 'UN')),
        // embalagem não tem custo próprio: é calculado pela unidade
        'preco_custo'      => $baseId ? 0.0 : (V::money($d, 'preco_custo', false) ?? (float)($atual['preco_custo'] ?? 0)),
        'preco_venda'      => V::money($d, 'preco_venda'),
        'estoque_minimo'   => $baseId ? 0.0 : (V::money($d, 'estoque_minimo', false) ?? (float)($atual['estoque_minimo'] ?? 0)),
        // embalagem não tem estoque próprio: usa o da unidade
        'controla_estoque' => $baseId ? 0 : V::bool($d, 'controla_estoque', (bool)($atual['controla_estoque'] ?? true)),
        'visivel_online'   => V::bool($d, 'visivel_online', (bool)($atual['visivel_online'] ?? true)),
        'usa_casco'        => $usaCasco,
        'valor_casco'      => $valorCasco,
        'descricao'        => V::str($d, 'descricao', 255, false),
    ];
}

function checarCodigoUnico(?string $codigo, int $exceto = 0): void
{
    if ($codigo === null) return;
    $outro = Db::one('SELECT id, nome FROM produtos WHERE codigo_barras = ? AND id <> ?', [$codigo, $exceto]);
    if ($outro) throw new HttpError(422, "Esse código de barras já é do produto \"{$outro['nome']}\".", ['campo' => 'codigo_barras']);
}

// ---------------------------------------------------------------------
// LISTAGEM E BUSCA
// ---------------------------------------------------------------------
$r->get('/produtos', function () {
    Auth::user();
    $where = [];
    $p = [];

    $status = Http::query('status', 'ativos');
    match ($status) {
        'inativos' => $where[] = 'p.ativo = 0',
        'baixo'    => $where[] = 'p.ativo = 1 AND p.controla_estoque = 1 AND p.estoque <= p.estoque_minimo',
        'zerado'   => $where[] = 'p.ativo = 1 AND p.controla_estoque = 1 AND p.estoque <= 0',
        'todos'    => null,
        default    => $where[] = 'p.ativo = 1',
    };

    // só produtos vendidos por unidade (para escolher a "unidade" de um engradado)
    if (Http::query('so_unidades')) $where[] = 'p.produto_base_id IS NULL';

    $busca = trim((string)Http::query('busca', ''));
    if ($busca !== '') {
        // código de barras: busca exata; texto: cada palavra precisa aparecer no nome
        $cond = ['p.codigo_barras = ?'];
        $p[] = $busca;
        $palavras = array_slice(preg_split('/\s+/', $busca), 0, 6);
        $likes = [];
        foreach ($palavras as $w) {
            $likes[] = 'p.nome LIKE ?';
            $p[] = '%' . addcslashes($w, '%_\\') . '%';
        }
        $cond[] = '(' . implode(' AND ', $likes) . ')';
        $where[] = '(' . implode(' OR ', $cond) . ')';
    }

    $cat = Http::query('categoria');
    if ($cat === 'sem') {
        $where[] = 'p.categoria_id IS NULL';
    } elseif ($cat !== null && $cat !== '') {
        $where[] = 'p.categoria_id = ?';
        $p[] = (int)$cat;
    }

    $ordem = match (Http::query('ordem', 'nome')) {
        'estoque'    => 'p.estoque ASC, p.nome',
        'recentes'   => 'p.atualizado_em DESC',
        'preco'      => 'p.preco_venda DESC',
        'categoria'  => 'c.ordem IS NULL, c.ordem, c.nome, p.nome',
        default      => 'p.nome ASC',
    };

    $limite = min(500, max(1, (int)Http::query('limite', 60)));
    $offset = max(0, (int)Http::query('offset', 0));
    $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    $total = (int)Db::value("SELECT COUNT(*) FROM produtos p $sqlWhere", $p);
    $rows = Db::all(SQL_PRODUTO . " $sqlWhere ORDER BY $ordem LIMIT $limite OFFSET $offset", $p);
    return ['total' => $total, 'itens' => array_map('produtoOut', $rows)];
});

/** Busca pelo leitor de código de barras. */
$r->get('/produtos/codigo', function () {
    Auth::user();
    $codigo = normalizarCodigo(Http::query('c'));
    if (!$codigo) throw new HttpError(422, 'Informe o código.');
    $id = Db::value('SELECT id FROM produtos WHERE codigo_barras = ?', [$codigo]);
    if (!$id) throw new HttpError(404, "Nenhum produto com o código $codigo.");
    return produtoOut(buscarProduto((int)$id));
});

$r->get('/produtos/resumo', function () {
    Auth::user();
    $r = Db::one(
        "SELECT
            COUNT(*) AS total,
            SUM(controla_estoque = 1 AND estoque <= estoque_minimo) AS baixo,
            SUM(controla_estoque = 1 AND estoque <= 0) AS zerado,
            SUM(CASE WHEN controla_estoque = 1 AND estoque > 0 THEN estoque * preco_custo ELSE 0 END) AS valor_custo,
            SUM(CASE WHEN controla_estoque = 1 AND estoque > 0 THEN estoque * preco_venda ELSE 0 END) AS valor_venda,
            SUM(preco_custo <= 0 AND produto_base_id IS NULL) AS sem_custo
         FROM produtos WHERE ativo = 1"
    );
    $out = ['total' => (int)$r['total'], 'baixo' => (int)$r['baixo'], 'zerado' => (int)$r['zerado']];
    if (Auth::isAdmin()) {
        $out['valor_custo'] = round((float)$r['valor_custo'], 2);
        $out['valor_venda'] = round((float)$r['valor_venda'], 2);
        $out['sem_custo'] = (int)$r['sem_custo'];
    }
    return $out;
});

$r->get('/produtos/{id}', function (int $id) {
    Auth::user();
    $p = produtoOut(buscarProduto($id));
    // engradados ligados a esta unidade
    $p['embalagens'] = array_map(fn($e) => ['id' => (int)$e['id'], 'nome' => $e['nome'], 'fator' => (float)$e['fator']],
        Db::all('SELECT id, nome, fator FROM produtos WHERE produto_base_id = ? AND ativo = 1 ORDER BY fator', [$id]));
    return $p;
});

// ---------------------------------------------------------------------
// CADASTRO (admin)
// ---------------------------------------------------------------------
function gravarProduto(array $f, ?int $id = null): int
{
    $cols = array_keys($f);
    if ($id === null) {
        return Db::insert(
            'INSERT INTO produtos (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')',
            array_values($f)
        );
    }
    Db::exec('UPDATE produtos SET ' . implode(', ', array_map(fn($c) => "$c = ?", $cols)) . ' WHERE id = ?', [...array_values($f), $id]);
    return $id;
}

$r->post('/produtos', function () {
    $u = Auth::admin();
    $d = Http::body();
    $f = dadosProduto($d);
    checarCodigoUnico($f['codigo_barras']);
    $estoqueInicial = $f['produto_base_id'] ? 0.0 : (V::money($d, 'estoque', false) ?? 0.0);

    $id = Db::tx(function () use ($f, $estoqueInicial, $u) {
        $id = gravarProduto($f);
        if ($estoqueInicial != 0) {
            Estoque::mover($id, $estoqueInicial, 'entrada', 'Estoque inicial no cadastro', $f['preco_custo'], null, (int)$u['id']);
        }
        return $id;
    });
    return produtoOut(buscarProduto($id));
});

$r->put('/produtos/{id}', function (int $id) {
    Auth::admin();
    $atual = buscarProduto($id);
    $f = dadosProduto(Http::body(), $atual);
    checarCodigoUnico($f['codigo_barras'], $id);
    // virou embalagem: o estoque que estava nele passa a ser contado na unidade
    if ($f['produto_base_id'] && abs((float)$atual['estoque']) > 0.0005) {
        throw new HttpError(422, 'Este produto tem estoque próprio. Zere o estoque dele (Contagem = 0) antes de transformá-lo em engradado.');
    }
    gravarProduto($f, $id);
    return produtoOut(buscarProduto($id));
});

/** Desativar/reativar (não apaga: vendas antigas continuam nos relatórios). */
$r->post('/produtos/{id}/ativo', function (int $id) {
    Auth::admin();
    buscarProduto($id);
    $ativo = V::bool(Http::body(), 'ativo');
    Db::exec('UPDATE produtos SET ativo = ? WHERE id = ?', [$ativo, $id]);
    return produtoOut(buscarProduto($id));
});

// ---------------------------------------------------------------------
// ESTOQUE
// ---------------------------------------------------------------------
/**
 * entrada: chegou mercadoria (funcionário pode)          -> soma
 * saida:   perda, quebra, consumo, vencido (admin)       -> subtrai
 * ajuste:  contagem — informa o estoque real (admin)     -> define o saldo
 * Em engradado, a quantidade é em engradados e vira unidades na unidade-base.
 */
$r->post('/produtos/{id}/estoque', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $tipo = V::enum($d, 'tipo', ['entrada', 'saida', 'ajuste']);
    if ($tipo !== 'entrada' && !Auth::isAdmin()) throw new HttpError(403, 'Só o administrador pode lançar saída ou ajuste de estoque.');

    $prod = buscarProduto($id);
    $emb = ehEmbalagem($prod);
    if ($emb && $tipo === 'ajuste') throw new HttpError(422, "A contagem é feita na unidade (\"{$prod['base_nome']}\").");

    $qtd = V::parseNumber($d['quantidade'] ?? null);
    if ($qtd === null) throw new HttpError(422, 'Informe a quantidade.', ['campo' => 'quantidade']);
    $qtd = round($qtd, 3);
    if ($tipo === 'ajuste' ? $qtd < 0 : $qtd <= 0) throw new HttpError(422, 'Quantidade inválida.', ['campo' => 'quantidade']);

    $motivo = V::str($d, 'motivo', 255, $tipo !== 'entrada');
    $custo = Auth::isAdmin() ? V::money($d, 'custo_unitario', false) : null;
    $alvo = $emb ? (int)$prod['produto_base_id'] : $id;
    if ($emb) {
        // 10 engradados de 24 = 240 unidades; custo do engradado vira custo por unidade
        $motivo = trim(($tipo === 'entrada' ? 'Entrada' : 'Saída') . " de {$qtd} × {$prod['nome']}" . ($motivo ? " — $motivo" : ''));
        $qtd = $qtd * (float)$prod['fator'];
        if ($custo !== null) $custo = round($custo / (float)$prod['fator'], 4);
    }
    $atualizarCusto = Auth::isAdmin() && $custo !== null && $custo > 0 && V::bool($d, 'atualizar_custo', true);

    Db::tx(function () use ($alvo, $tipo, $qtd, $motivo, $custo, $atualizarCusto, $u) {
        $p = Db::one('SELECT estoque FROM produtos WHERE id = ? FOR UPDATE', [$alvo]) ?? throw new HttpError(404, 'Produto não encontrado.');
        $delta = match ($tipo) {
            'entrada' => $qtd,
            'saida'   => -$qtd,
            'ajuste'  => $qtd - (float)$p['estoque'],
        };
        if ($tipo === 'ajuste' && abs($delta) < 0.0005) throw new HttpError(422, 'O estoque já está com essa quantidade.');
        Estoque::mover($alvo, $delta, $tipo, $motivo, $custo !== null ? round($custo, 2) : null, null, (int)$u['id']);
        if ($atualizarCusto) Db::exec('UPDATE produtos SET preco_custo = ? WHERE id = ?', [round($custo, 2), $alvo]);
    });
    return produtoOut(buscarProduto($id));
});

$r->get('/produtos/{id}/movimentacoes', function (int $id) {
    Auth::user();
    $prod = buscarProduto($id);
    $alvo = ehEmbalagem($prod) ? (int)$prod['produto_base_id'] : $id;
    $rows = Db::all(
        'SELECT m.id, m.tipo, m.quantidade, m.estoque_apos, m.custo_unitario, m.motivo, m.venda_id, m.criado_em, u.nome AS usuario
         FROM movimentacoes_estoque m LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.produto_id = ? ORDER BY m.id DESC LIMIT 100',
        [$alvo]
    );
    $admin = Auth::isAdmin();
    return array_map(fn($m) => [
        'id'           => (int)$m['id'],
        'tipo'         => $m['tipo'],
        'quantidade'   => (float)$m['quantidade'],
        'estoque_apos' => (float)$m['estoque_apos'],
        'custo_unitario' => $admin && $m['custo_unitario'] !== null ? (float)$m['custo_unitario'] : null,
        'motivo'       => $m['motivo'],
        'venda_id'     => $m['venda_id'] !== null ? (int)$m['venda_id'] : null,
        'usuario'      => $m['usuario'],
        'criado_em'    => $m['criado_em'],
    ], $rows);
});

// ---------------------------------------------------------------------
// CASCOS (vasilhame retornável)
// ---------------------------------------------------------------------
/** Ajuste manual: ex. devolveu 24 cascos ao fornecedor (-24) ou contou os cascos. */
$r->post('/produtos/{id}/cascos', function (int $id) {
    $u = Auth::user();
    $prod = buscarProduto($id);
    if (!$prod['usa_casco']) throw new HttpError(422, 'Este produto não usa casco retornável.');
    $d = Http::body();
    $tipo = V::enum($d, 'tipo', ['devolvido_fornecedor', 'recebido', 'contagem']);
    $qtd = (int)(V::parseNumber($d['quantidade'] ?? null) ?? -1);
    if ($qtd < 0 || ($tipo !== 'contagem' && $qtd === 0)) throw new HttpError(422, 'Quantidade inválida.', ['campo' => 'quantidade']);
    $motivo = V::str($d, 'motivo', 255, false);

    Db::tx(function () use ($id, $tipo, $qtd, $motivo, $u) {
        $atual = (int)Db::value('SELECT estoque_cascos FROM produtos WHERE id = ? FOR UPDATE', [$id]);
        [$delta, $txt] = match ($tipo) {
            'devolvido_fornecedor' => [-$qtd, 'Devolvidos ao fornecedor'],
            'recebido'             => [$qtd, 'Cascos recebidos'],
            'contagem'             => [$qtd - $atual, 'Contagem de cascos'],
        };
        if ($delta === 0) throw new HttpError(422, 'A quantidade de cascos já é essa.');
        Cascos::mover($id, $delta, $motivo ? "$txt — $motivo" : $txt, null, (int)$u['id']);
    });
    return produtoOut(buscarProduto($id));
});

$r->get('/produtos/{id}/cascos', function (int $id) {
    Auth::user();
    return array_map(fn($m) => [
        'id' => (int)$m['id'], 'quantidade' => (int)$m['quantidade'], 'saldo_apos' => (int)$m['saldo_apos'],
        'motivo' => $m['motivo'], 'venda_id' => $m['venda_id'] !== null ? (int)$m['venda_id'] : null,
        'usuario' => $m['usuario'], 'criado_em' => $m['criado_em'],
    ], Db::all(
        'SELECT m.*, u.nome AS usuario FROM casco_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.produto_id = ? ORDER BY m.id DESC LIMIT 100', [$id]
    ));
});
