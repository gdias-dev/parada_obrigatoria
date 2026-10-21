<?php
declare(strict_types=1);

/** @var Router $r */

// ---------------------------------------------------------------------
// FORMAS DE PAGAMENTO (leitura — a tela de configuração vem na etapa 4)
// ---------------------------------------------------------------------
$r->get('/formas-pagamento', function () {
    Auth::user();
    $admin = Auth::isAdmin();
    $bandeiras = [];
    foreach (Db::all('SELECT forma_pagamento_id, nome FROM bandeiras ORDER BY id') as $b) {
        $bandeiras[(int)$b['forma_pagamento_id']][] = $b['nome'];
    }
    return array_map(fn($f) => [
        'id' => (int)$f['id'], 'nome' => $f['nome'], 'tipo' => $f['tipo'],
        'taxa_cliente_tipo' => $f['taxa_cliente_tipo'], 'taxa_cliente_modo' => $f['taxa_cliente_modo'],
        'taxa_cliente_valor' => (float)$f['taxa_cliente_valor'],
        'bandeiras' => $bandeiras[(int)$f['id']] ?? [],
    ] + ($admin ? ['taxa_maquininha_pct' => (float)$f['taxa_maquininha_pct']] : []),
    Db::all('SELECT * FROM formas_pagamento WHERE ativo = 1 AND ativo_pdv = 1 ORDER BY ordem, id'));
});

// ---------------------------------------------------------------------
// CAIXAS
// ---------------------------------------------------------------------
function resumoSessao(int $sessaoId): array
{
    $s = Db::one(
        'SELECT s.*, c.nome AS caixa, ua.nome AS aberto_por, uf.nome AS fechado_por
         FROM caixa_sessoes s JOIN caixas c ON c.id = s.caixa_id
         LEFT JOIN usuarios ua ON ua.id = s.usuario_abertura_id
         LEFT JOIN usuarios uf ON uf.id = s.usuario_fechamento_id
         WHERE s.id = ?', [$sessaoId]
    ) ?? throw new HttpError(404, 'Sessão de caixa não encontrada.');

    $v = Db::one(
        "SELECT COUNT(*) AS qtd, COALESCE(SUM(total),0) AS total, COALESCE(SUM(desconto),0) AS descontos,
                COALESCE(SUM(valor_cascos),0) AS cascos, COALESCE(SUM(custo_total),0) AS custo,
                COALESCE(SUM(taxa_maquininha_total),0) AS taxa
         FROM vendas WHERE caixa_sessao_id = ? AND status = 'concluida'", [$sessaoId]
    );
    $canceladas = (int)Db::value("SELECT COUNT(*) FROM vendas WHERE caixa_sessao_id = ? AND status = 'cancelada'", [$sessaoId]);

    $formas = Db::all(
        "SELECT p.forma_nome AS forma, f.tipo, COUNT(*) AS qtd, SUM(p.valor) AS valor, SUM(p.troco) AS troco
         FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
         LEFT JOIN formas_pagamento f ON f.id = p.forma_pagamento_id
         WHERE v.caixa_sessao_id = ? AND v.status = 'concluida'
         GROUP BY p.forma_nome, f.tipo ORDER BY valor DESC", [$sessaoId]
    );
    $dinheiroVendas = 0.0;
    foreach ($formas as $f) if ($f['tipo'] === 'dinheiro') $dinheiroVendas += (float)$f['valor'];

    $movs = Db::all(
        'SELECT m.*, u.nome AS usuario FROM caixa_movimentos m LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE m.sessao_id = ? ORDER BY m.id', [$sessaoId]
    );
    $sangrias = 0.0; $suprimentos = 0.0;
    foreach ($movs as $m) $m['tipo'] === 'sangria' ? $sangrias += (float)$m['valor'] : $suprimentos += (float)$m['valor'];

    // Pagamentos de fiado recebidos neste caixa
    $recFiado = Db::all(
        "SELECT l.forma_nome AS forma, f.tipo, COUNT(*) AS qtd, SUM(l.valor + l.acrescimo) AS valor
         FROM fiado_lancamentos l LEFT JOIN formas_pagamento f ON f.id = l.forma_pagamento_id
         WHERE l.caixa_sessao_id = ? AND l.tipo = 'pagamento'
         GROUP BY l.forma_nome, f.tipo ORDER BY valor DESC", [$sessaoId]
    );
    $dinheiroFiado = 0.0;
    foreach ($recFiado as $f) if ($f['tipo'] === 'dinheiro') $dinheiroFiado += (float)$f['valor'];

    $esperado = round((float)$s['valor_abertura'] + $dinheiroVendas + $dinheiroFiado + $suprimentos - $sangrias, 2);

    $out = [
        'id' => (int)$s['id'], 'caixa_id' => (int)$s['caixa_id'], 'caixa' => $s['caixa'], 'status' => $s['status'],
        'aberto_em' => $s['aberto_em'], 'aberto_por' => $s['aberto_por'], 'valor_abertura' => (float)$s['valor_abertura'],
        'fechado_em' => $s['fechado_em'], 'fechado_por' => $s['fechado_por'],
        'vendas' => (int)$v['qtd'], 'canceladas' => $canceladas,
        'total_vendido' => round((float)$v['total'], 2), 'descontos' => round((float)$v['descontos'], 2),
        'valor_cascos' => round((float)$v['cascos'], 2),
        'por_forma' => array_map(fn($f) => ['forma' => $f['forma'], 'tipo' => $f['tipo'], 'qtd' => (int)$f['qtd'], 'valor' => round((float)$f['valor'], 2)], $formas),
        'recebido_fiado' => array_map(fn($f) => ['forma' => $f['forma'], 'tipo' => $f['tipo'], 'qtd' => (int)$f['qtd'], 'valor' => round((float)$f['valor'], 2)], $recFiado),
        'total_recebido_fiado' => round(array_sum(array_map(fn($f) => (float)$f['valor'], $recFiado)), 2),
        'sangrias' => round($sangrias, 2), 'suprimentos' => round($suprimentos, 2),
        'movimentos' => array_map(fn($m) => ['tipo' => $m['tipo'], 'valor' => (float)$m['valor'], 'motivo' => $m['motivo'], 'usuario' => $m['usuario'], 'criado_em' => $m['criado_em']], $movs),
        'dinheiro_esperado' => $s['status'] === 'fechado' && $s['valor_esperado'] !== null ? (float)$s['valor_esperado'] : $esperado,
        'valor_informado' => $s['valor_informado'] !== null ? (float)$s['valor_informado'] : null,
        'diferenca' => $s['valor_informado'] !== null ? round((float)$s['valor_informado'] - (float)$s['valor_esperado'], 2) : null,
        'observacao' => $s['observacao'],
    ];
    if (Auth::isAdmin()) {
        $out['lucro'] = round((float)$v['total'] - (float)$v['cascos'] - (float)$v['custo'] - (float)$v['taxa'], 2);
    }
    return $out;
}

$r->get('/caixas', function () {
    Auth::user();
    $rows = Db::all(
        "SELECT c.id, c.nome, s.id AS sessao_id, s.aberto_em, s.valor_abertura, u.nome AS aberto_por
         FROM caixas c
         LEFT JOIN caixa_sessoes s ON s.caixa_id = c.id AND s.status = 'aberto'
         LEFT JOIN usuarios u ON u.id = s.usuario_abertura_id
         WHERE c.ativo = 1 ORDER BY c.id"
    );
    return array_map(fn($c) => [
        'id' => (int)$c['id'], 'nome' => $c['nome'],
        'sessao' => $c['sessao_id'] ? [
            'id' => (int)$c['sessao_id'], 'aberto_em' => $c['aberto_em'],
            'aberto_por' => $c['aberto_por'], 'valor_abertura' => (float)$c['valor_abertura'],
        ] : null,
    ], $rows);
});

$r->post('/caixas/{id}/abrir', function (int $id) {
    $u = Auth::user();
    $valor = V::money(Http::body(), 'valor_abertura', false) ?? 0.0;
    $sessaoId = Db::tx(function () use ($id, $valor, $u) {
        if (!Db::value('SELECT 1 FROM caixas WHERE id = ? AND ativo = 1 FOR UPDATE', [$id])) throw new HttpError(404, 'Caixa não encontrado.');
        if (Db::value("SELECT 1 FROM caixa_sessoes WHERE caixa_id = ? AND status = 'aberto'", [$id])) {
            throw new HttpError(409, 'Este caixa já está aberto.');
        }
        return Db::insert('INSERT INTO caixa_sessoes (caixa_id, usuario_abertura_id, valor_abertura) VALUES (?, ?, ?)', [$id, $u['id'], $valor]);
    });
    return resumoSessao($sessaoId);
});

$r->get('/caixa-sessoes', function () {
    Auth::admin();
    $limite = min(100, max(1, (int)Http::query('limite', 30)));
    $ids = Db::all("SELECT id FROM caixa_sessoes ORDER BY id DESC LIMIT $limite");
    return array_map(fn($s) => resumoSessao((int)$s['id']), $ids);
});

$r->get('/caixa-sessoes/{id}', function (int $id) {
    Auth::user();
    return resumoSessao($id);
});

$r->post('/caixa-sessoes/{id}/movimentos', function (int $id) {
    $u = Auth::user();
    Vendas::sessaoAberta($id);
    $d = Http::body();
    $tipo = V::enum($d, 'tipo', ['sangria', 'suprimento']);
    $valor = V::money($d, 'valor', true, 0.01);
    $motivo = V::str($d, 'motivo', 255, $tipo === 'sangria');
    if ($tipo === 'sangria') {
        $disp = resumoSessao($id)['dinheiro_esperado'];
        if ($valor > $disp + 0.001) throw new HttpError(422, 'A retirada é maior que o dinheiro que deveria estar no caixa (R$ ' . number_format($disp, 2, ',', '.') . ').');
    }
    Db::exec('INSERT INTO caixa_movimentos (sessao_id, tipo, valor, motivo, usuario_id) VALUES (?, ?, ?, ?, ?)', [$id, $tipo, $valor, $motivo, $u['id']]);
    return resumoSessao($id);
});

$r->post('/caixa-sessoes/{id}/fechar', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $informado = V::money($d, 'valor_informado', true);
    $obs = V::str($d, 'observacao', 255, false);
    Db::tx(function () use ($id, $informado, $obs, $u) {
        Db::one('SELECT id FROM caixa_sessoes WHERE id = ? FOR UPDATE', [$id]);
        Vendas::sessaoAberta($id);
        $esperado = resumoSessao($id)['dinheiro_esperado'];
        Db::exec(
            "UPDATE caixa_sessoes SET status = 'fechado', fechado_em = NOW(), usuario_fechamento_id = ?, valor_informado = ?, valor_esperado = ?, observacao = ? WHERE id = ?",
            [$u['id'], $informado, $esperado, $obs, $id]
        );
    });
    return resumoSessao($id);
});

// ---------------------------------------------------------------------
// VENDAS (balcão)
// ---------------------------------------------------------------------
$r->post('/vendas', function () {
    $u = Auth::user();
    $d = Http::body();
    $sessaoId = (int)($d['caixa_sessao_id'] ?? 0);
    $id = Db::tx(function () use ($d, $sessaoId, $u) {
        Vendas::sessaoAberta($sessaoId);
        $itens = Vendas::prepararItens(is_array($d['itens'] ?? null) ? $d['itens'] : []);
        return Vendas::registrar([
            'origem' => 'balcao', 'sessao_id' => $sessaoId, 'usuario_id' => (int)$u['id'],
            'cliente_id' => !empty($d['cliente_id']) ? (int)$d['cliente_id'] : null,
            'itens' => $itens, 'desconto' => V::money($d, 'desconto', false) ?? 0,
            'pagamentos' => is_array($d['pagamentos'] ?? null) ? $d['pagamentos'] : [],
        ]);
    });
    return Vendas::obter($id);
});

$r->get('/vendas', function () {
    Auth::user();
    $sessao = (int)Http::query('sessao', 0);
    if (!$sessao && !Auth::isAdmin()) throw new HttpError(422, 'Informe o caixa.');
    $where = $sessao ? 'WHERE v.caixa_sessao_id = ?' : '';
    $rows = Db::all(
        "SELECT v.id, v.origem, v.status, v.total, v.criado_em, u.nome AS usuario, cm.nome_cliente AS comanda_nome,
                (SELECT GROUP_CONCAT(DISTINCT p.forma_nome SEPARATOR ', ') FROM venda_pagamentos p WHERE p.venda_id = v.id) AS formas,
                (SELECT COUNT(*) FROM venda_itens i WHERE i.venda_id = v.id AND i.tipo = 'produto') AS itens
         FROM vendas v LEFT JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN comandas cm ON cm.id = v.comanda_id
         $where ORDER BY v.id DESC LIMIT 100", $sessao ? [$sessao] : []
    );
    return array_map(fn($v) => [
        'id' => (int)$v['id'], 'origem' => $v['origem'], 'status' => $v['status'], 'total' => (float)$v['total'],
        'criado_em' => $v['criado_em'], 'usuario' => $v['usuario'], 'comanda_nome' => $v['comanda_nome'],
        'formas' => $v['formas'], 'itens' => (int)$v['itens'],
    ], $rows);
});

$r->get('/vendas/{id}', function (int $id) {
    Auth::user();
    return Vendas::obter($id);
});

$r->post('/vendas/{id}/cancelar', function (int $id) {
    $u = Auth::user();
    $motivo = V::str(Http::body(), 'motivo', 255, true, 3);
    Vendas::cancelar($id, $motivo, $u);
    return Vendas::obter($id);
});
