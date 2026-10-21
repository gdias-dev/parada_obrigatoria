<?php
declare(strict_types=1);

/**
 * Entregadores, bairros/taxas de entrega e acerto das entregas.
 * @var Router $r
 */

// ---------------------------------------------------------------------
// BAIRROS E TAXAS (admin edita; todos leem)
// ---------------------------------------------------------------------
$r->get('/bairros', function () {
    Auth::user();
    return array_map(fn($b) => ['id' => (int)$b['id'], 'nome' => $b['nome'], 'taxa' => (float)$b['taxa'], 'ativo' => (bool)$b['ativo']],
        Db::all('SELECT * FROM bairros_entrega ORDER BY ativo DESC, nome'));
});

$r->post('/bairros', function () {
    Auth::admin();
    $d = Http::body();
    $nome = V::str($d, 'nome', 80, true, 2);
    if (Db::value('SELECT 1 FROM bairros_entrega WHERE nome = ?', [$nome])) throw new HttpError(422, 'Esse bairro já está cadastrado.', ['campo' => 'nome']);
    $id = Db::insert('INSERT INTO bairros_entrega (nome, taxa) VALUES (?, ?)', [$nome, V::money($d, 'taxa', false) ?? 0]);
    return ['id' => $id, 'nome' => $nome, 'taxa' => (float)Db::value('SELECT taxa FROM bairros_entrega WHERE id = ?', [$id]), 'ativo' => true];
});

$r->put('/bairros/{id}', function (int $id) {
    Auth::admin();
    $d = Http::body();
    $nome = V::str($d, 'nome', 80, true, 2);
    if (Db::value('SELECT 1 FROM bairros_entrega WHERE nome = ? AND id <> ?', [$nome, $id])) throw new HttpError(422, 'Esse bairro já está cadastrado.', ['campo' => 'nome']);
    Db::exec('UPDATE bairros_entrega SET nome = ?, taxa = ?, ativo = ? WHERE id = ?', [$nome, V::money($d, 'taxa', false) ?? 0, V::bool($d, 'ativo', true), $id]);
    $b = Db::one('SELECT * FROM bairros_entrega WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Bairro não encontrado.');
    return ['id' => (int)$b['id'], 'nome' => $b['nome'], 'taxa' => (float)$b['taxa'], 'ativo' => (bool)$b['ativo']];
});

$r->delete('/bairros/{id}', function (int $id) {
    Auth::admin();
    Db::exec('DELETE FROM bairros_entrega WHERE id = ?', [$id]);
    return ['ok' => true];
});

// ---------------------------------------------------------------------
// ENTREGADORES
// ---------------------------------------------------------------------
function entregadorOut(array $e): array
{
    $pend = Db::one(
        "SELECT COUNT(*) AS qtd, COALESCE(SUM(valor_entregador), 0) AS valor FROM entregas
         WHERE entregador_id = ? AND status = 'entregue' AND pago_entregador = 0", [$e['id']]
    );
    return [
        'id' => (int)$e['id'], 'nome' => $e['nome'], 'telefone' => $e['telefone'], 'veiculo' => $e['veiculo'],
        'modo_repasse' => $e['modo_repasse'], 'taxa_padrao' => (float)$e['taxa_padrao'], 'ativo' => (bool)$e['ativo'],
        'em_rota' => (int)Db::value("SELECT COUNT(*) FROM entregas WHERE entregador_id = ? AND status = 'em_rota'", [$e['id']]),
        'a_pagar_qtd' => (int)$pend['qtd'], 'a_pagar' => round((float)$pend['valor'], 2),
    ];
}

function dadosEntregador(array $d): array
{
    $tel = preg_replace('/\D/', '', (string)($d['telefone'] ?? ''));
    $modo = V::enum($d, 'modo_repasse', ['fixo', 'taxa'], 'fixo');
    return [
        'nome' => V::str($d, 'nome', 100, true, 2),
        'telefone' => $tel ?: null,
        'veiculo' => V::str($d, 'veiculo', 60, false),
        'modo_repasse' => $modo,
        'taxa_padrao' => $modo === 'fixo' ? (V::money($d, 'taxa_padrao', true) ?? 0) : 0,
        'ativo' => V::bool($d, 'ativo', true),
    ];
}

$r->get('/entregadores', function () {
    Auth::user();
    $so = Http::query('ativos') ? 'WHERE ativo = 1' : '';
    return array_map('entregadorOut', Db::all("SELECT * FROM entregadores $so ORDER BY ativo DESC, nome"));
});

$r->post('/entregadores', function () {
    Auth::admin();
    $f = dadosEntregador(Http::body());
    $id = Db::insert('INSERT INTO entregadores (nome, telefone, veiculo, modo_repasse, taxa_padrao, ativo) VALUES (?, ?, ?, ?, ?, ?)', array_values($f));
    return entregadorOut(Db::one('SELECT * FROM entregadores WHERE id = ?', [$id]));
});

$r->put('/entregadores/{id}', function (int $id) {
    Auth::admin();
    if (!Db::value('SELECT 1 FROM entregadores WHERE id = ?', [$id])) throw new HttpError(404, 'Entregador não encontrado.');
    $f = dadosEntregador(Http::body());
    Db::exec('UPDATE entregadores SET nome = ?, telefone = ?, veiculo = ?, modo_repasse = ?, taxa_padrao = ?, ativo = ? WHERE id = ?', [...array_values($f), $id]);
    return entregadorOut(Db::one('SELECT * FROM entregadores WHERE id = ?', [$id]));
});

// ---------------------------------------------------------------------
// ENTREGAS
// ---------------------------------------------------------------------
$r->get('/entregas', function () {
    Auth::user();
    $where = ["e.status <> 'cancelada'"];
    $p = [];
    $de = Http::query('de');
    $ate = Http::query('ate');
    if ($de && preg_match('/^\d{4}-\d{2}-\d{2}$/', $de)) { $where[] = 'e.criado_em >= ?'; $p[] = "$de 00:00:00"; }
    if ($ate && preg_match('/^\d{4}-\d{2}-\d{2}$/', $ate)) { $where[] = 'e.criado_em <= ?'; $p[] = "$ate 23:59:59"; }
    if ($ent = (int)Http::query('entregador', 0)) { $where[] = 'e.entregador_id = ?'; $p[] = $ent; }
    $pago = Http::query('pago');
    if ($pago === '0') $where[] = "e.pago_entregador = 0 AND e.status = 'entregue'";
    if ($pago === '1') $where[] = 'e.pago_entregador = 1';

    $rows = Db::all(
        'SELECT e.*, en.nome AS entregador, p.codigo, p.cliente_nome, p.total AS pedido_total
         FROM entregas e LEFT JOIN entregadores en ON en.id = e.entregador_id LEFT JOIN pedidos_online p ON p.id = e.pedido_id
         WHERE ' . implode(' AND ', $where) . ' ORDER BY e.id DESC LIMIT 500', $p
    );
    $itens = array_map(fn($e) => [
        'id' => (int)$e['id'], 'pedido_id' => $e['pedido_id'] !== null ? (int)$e['pedido_id'] : null, 'codigo' => $e['codigo'],
        'cliente' => $e['cliente_nome'], 'entregador_id' => $e['entregador_id'] !== null ? (int)$e['entregador_id'] : null,
        'entregador' => $e['entregador'], 'endereco' => $e['endereco'], 'bairro' => $e['bairro'],
        'taxa_cobrada' => (float)$e['taxa_cobrada'], 'valor_entregador' => (float)$e['valor_entregador'],
        'status' => $e['status'], 'pago' => (bool)$e['pago_entregador'], 'pago_em' => $e['pago_em'],
        'saiu_em' => $e['saiu_em'], 'entregue_em' => $e['entregue_em'], 'criado_em' => $e['criado_em'],
    ], $rows);
    $porEntregador = [];
    foreach ($itens as $e) {
        $k = $e['entregador_id'] ?? 0;
        $porEntregador[$k] ??= ['entregador_id' => $k, 'entregador' => $e['entregador'] ?? '—', 'entregas' => 0, 'taxas' => 0.0, 'repasse' => 0.0, 'a_pagar' => 0.0];
        $porEntregador[$k]['entregas']++;
        $porEntregador[$k]['taxas'] += $e['taxa_cobrada'];
        $porEntregador[$k]['repasse'] += $e['valor_entregador'];
        if ($e['status'] === 'entregue' && !$e['pago']) $porEntregador[$k]['a_pagar'] += $e['valor_entregador'];
    }
    return ['itens' => $itens, 'por_entregador' => array_values(array_map(fn($x) => array_merge($x, [
        'taxas' => round($x['taxas'], 2), 'repasse' => round($x['repasse'], 2), 'a_pagar' => round($x['a_pagar'], 2),
    ]), $porEntregador))];
});

/** Paga o entregador pelas entregas feitas e ainda não pagas. Pode tirar o dinheiro do caixa (sangria). */
$r->post('/entregadores/{id}/acertar', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $sessaoId = !empty($d['caixa_sessao_id']) ? (int)$d['caixa_sessao_id'] : null;
    $total = Db::tx(function () use ($id, $sessaoId, $u) {
        $e = Db::one('SELECT * FROM entregadores WHERE id = ? FOR UPDATE', [$id]) ?? throw new HttpError(404, 'Entregador não encontrado.');
        $pend = Db::all("SELECT id, valor_entregador FROM entregas WHERE entregador_id = ? AND status = 'entregue' AND pago_entregador = 0", [$id]);
        if (!$pend) throw new HttpError(422, 'Não há entregas para acertar.');
        $total = round(array_sum(array_column($pend, 'valor_entregador')), 2);
        if ($sessaoId && $total > 0) {
            Vendas::sessaoAberta($sessaoId);
            Db::exec("INSERT INTO caixa_movimentos (sessao_id, tipo, valor, motivo, usuario_id) VALUES (?, 'sangria', ?, ?, ?)",
                [$sessaoId, $total, "Acerto do entregador {$e['nome']} (" . count($pend) . ' entregas)', $u['id']]);
        }
        $ids = implode(',', array_map(fn($x) => (int)$x['id'], $pend));
        Db::exec("UPDATE entregas SET pago_entregador = 1, pago_em = NOW(), pago_por = ? WHERE id IN ($ids)", [$u['id']]);
        return ['total' => $total, 'entregas' => count($pend)];
    });
    return $total + ['entregador' => entregadorOut(Db::one('SELECT * FROM entregadores WHERE id = ?', [$id]))];
});
