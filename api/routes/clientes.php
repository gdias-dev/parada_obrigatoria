<?php
declare(strict_types=1);

/**
 * Clientes e conta fiado.
 * Funcionário: cadastra, vende fiado (dentro do limite) e recebe pagamento.
 * Admin: além disso, define limite, faz ajuste/perdão de dívida e desativa.
 *
 * @var Router $r
 */

function clienteOut(array $c): array
{
    return [
        'id' => (int)$c['id'], 'nome' => $c['nome'], 'apelido' => $c['apelido'],
        'telefone' => $c['telefone'], 'endereco' => $c['endereco'], 'bairro' => $c['bairro'],
        'referencia' => $c['referencia'], 'observacao' => $c['observacao'],
        'limite_fiado' => $c['limite_fiado'] !== null ? (float)$c['limite_fiado'] : null,
        'saldo_fiado' => (float)$c['saldo_fiado'],
        'ativo' => (bool)$c['ativo'], 'criado_em' => $c['criado_em'],
        'ultima_compra' => $c['ultima_compra'] ?? null,
        'ultimo_pagamento' => $c['ultimo_pagamento'] ?? null,
    ];
}

function dadosCliente(array $d, ?array $atual): array
{
    $tel = preg_replace('/\D/', '', (string)($d['telefone'] ?? ''));
    if ($tel !== '' && (strlen($tel) < 10 || strlen($tel) > 13)) throw new HttpError(422, 'Telefone inválido (use DDD + número).', ['campo' => 'telefone']);
    $f = [
        'nome'       => V::str($d, 'nome', 120, true, 2),
        'apelido'    => V::str($d, 'apelido', 60, false),
        'telefone'   => $tel ?: null,
        'endereco'   => V::str($d, 'endereco', 200, false),
        'bairro'     => V::str($d, 'bairro', 80, false),
        'referencia' => V::str($d, 'referencia', 200, false),
        'observacao' => V::str($d, 'observacao', 255, false),
    ];
    // Limite: só o admin muda. Vazio = sem limite; 0 = não pode comprar fiado.
    if (Auth::isAdmin()) {
        $f['limite_fiado'] = array_key_exists('limite_fiado', $d) && $d['limite_fiado'] !== '' && $d['limite_fiado'] !== null
            ? V::money($d, 'limite_fiado', true) : null;
        if ($atual) $f['ativo'] = V::bool($d, 'ativo', (bool)$atual['ativo']);
    } elseif (!$atual) {
        $f['limite_fiado'] = null;
    }
    return $f;
}

function buscarCliente(int $id): array
{
    return Db::one(
        "SELECT c.*,
            (SELECT MAX(criado_em) FROM fiado_lancamentos l WHERE l.cliente_id = c.id AND l.tipo = 'debito') AS ultima_compra,
            (SELECT MAX(criado_em) FROM fiado_lancamentos l WHERE l.cliente_id = c.id AND l.tipo = 'pagamento') AS ultimo_pagamento
         FROM clientes c WHERE c.id = ?", [$id]
    ) ?? throw new HttpError(404, 'Cliente não encontrado.');
}

$r->get('/clientes', function () {
    Auth::user();
    $where = [];
    $p = [];
    $busca = trim((string)Http::query('busca', ''));
    if ($busca !== '') {
        $digitos = preg_replace('/\D/', '', $busca);
        $cond = ['c.nome LIKE ?', 'c.apelido LIKE ?'];
        $p[] = '%' . addcslashes($busca, '%_\\') . '%';
        $p[] = '%' . addcslashes($busca, '%_\\') . '%';
        if (strlen($digitos) >= 4) { $cond[] = 'c.telefone LIKE ?'; $p[] = "%$digitos%"; }
        $where[] = '(' . implode(' OR ', $cond) . ')';
    }
    $filtro = Http::query('filtro', 'ativos');
    match ($filtro) {
        'devendo'   => $where[] = 'c.ativo = 1 AND c.saldo_fiado > 0.004',
        'inativos'  => $where[] = 'c.ativo = 0',
        'todos'     => null,
        default     => $where[] = 'c.ativo = 1',
    };
    $ordem = $filtro === 'devendo' ? 'c.saldo_fiado DESC' : 'c.nome';
    $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';
    $limite = min(300, max(1, (int)Http::query('limite', 100)));
    $rows = Db::all(
        "SELECT c.*,
            (SELECT MAX(criado_em) FROM fiado_lancamentos l WHERE l.cliente_id = c.id AND l.tipo = 'debito') AS ultima_compra,
            (SELECT MAX(criado_em) FROM fiado_lancamentos l WHERE l.cliente_id = c.id AND l.tipo = 'pagamento') AS ultimo_pagamento
         FROM clientes c $sqlWhere ORDER BY $ordem LIMIT $limite", $p
    );
    $resumo = Db::one("SELECT COUNT(*) AS devendo, COALESCE(SUM(saldo_fiado), 0) AS total FROM clientes WHERE ativo = 1 AND saldo_fiado > 0.004");
    return [
        'itens' => array_map('clienteOut', $rows),
        'devendo' => (int)$resumo['devendo'],
        'total_a_receber' => round((float)$resumo['total'], 2),
    ];
});

$r->post('/clientes', function () {
    Auth::user();
    $f = dadosCliente(Http::body(), null);
    if ($f['telefone'] && ($outro = Db::one('SELECT id, nome FROM clientes WHERE telefone = ? AND ativo = 1', [$f['telefone']]))) {
        throw new HttpError(422, "Esse telefone já é de {$outro['nome']}.", ['campo' => 'telefone', 'cliente_id' => (int)$outro['id']]);
    }
    $cols = array_keys($f);
    $id = Db::insert('INSERT INTO clientes (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($f));
    return clienteOut(buscarCliente($id));
});

$r->get('/clientes/{id}', function (int $id) {
    Auth::user();
    $c = clienteOut(buscarCliente($id));
    $c['lancamentos'] = array_map(fn($l) => [
        'id' => (int)$l['id'], 'tipo' => $l['tipo'], 'valor' => (float)$l['valor'], 'acrescimo' => (float)$l['acrescimo'],
        'saldo_apos' => (float)$l['saldo_apos'], 'venda_id' => $l['venda_id'] !== null ? (int)$l['venda_id'] : null,
        'forma' => $l['forma_nome'], 'observacao' => $l['observacao'], 'usuario' => $l['usuario'], 'criado_em' => $l['criado_em'],
        'troco' => (float)$l['troco'],
    ], Db::all(
        'SELECT l.*, u.nome AS usuario FROM fiado_lancamentos l LEFT JOIN usuarios u ON u.id = l.usuario_id
         WHERE l.cliente_id = ? ORDER BY l.id DESC LIMIT 200', [$id]
    ));
    return $c;
});

$r->put('/clientes/{id}', function (int $id) {
    Auth::user();
    $atual = buscarCliente($id);
    $f = dadosCliente(Http::body(), $atual);
    if ($f['telefone'] && ($outro = Db::one('SELECT id, nome FROM clientes WHERE telefone = ? AND ativo = 1 AND id <> ?', [$f['telefone'], $id]))) {
        throw new HttpError(422, "Esse telefone já é de {$outro['nome']}.", ['campo' => 'telefone']);
    }
    Db::exec('UPDATE clientes SET ' . implode(', ', array_map(fn($c) => "$c = ?", array_keys($f))) . ' WHERE id = ?', [...array_values($f), $id]);
    return clienteOut(buscarCliente($id));
});

/** Cliente paga (toda ou parte) a dívida. Entra no caixa aberto do aparelho. */
$r->post('/clientes/{id}/pagamentos', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $sessaoId = (int)($d['caixa_sessao_id'] ?? 0);
    $obs = V::str($d, 'observacao', 255, false);
    $ids = Db::tx(function () use ($id, $d, $sessaoId, $obs, $u) {
        Vendas::sessaoAberta($sessaoId);
        $c = Fiado::travarCliente($id);
        $pags = is_array($d['pagamentos'] ?? null) ? $d['pagamentos'] : [];
        $total = round(array_sum(array_map(fn($p) => (float)(V::parseNumber($p['valor'] ?? 0) ?? 0), $pags)), 2);
        if ($total <= 0) throw new HttpError(422, 'Informe o valor recebido.');
        if ($total > (float)$c['saldo_fiado'] + 0.009) {
            throw new HttpError(422, 'O valor é maior que a dívida (R$ ' . Fiado::br((float)$c['saldo_fiado']) . ').');
        }
        $linhas = Vendas::calcularPagamentos($total, $pags, false);
        $ids = [];
        foreach ($linhas as $l) {
            $base = round($l['valor'] - $l['acrescimo'], 2);
            Fiado::lancar($id, 'pagamento', -$base, [
                'acrescimo' => $l['acrescimo'], 'taxa_maquininha' => $l['taxa_maquininha'], 'troco' => $l['troco'],
                'forma_pagamento_id' => $l['forma_pagamento_id'], 'forma_nome' => $l['forma_nome'],
                'caixa_sessao_id' => $sessaoId, 'usuario_id' => (int)$u['id'], 'observacao' => $obs,
            ]);
            $ids[] = (int)Db::pdo()->lastInsertId();
        }
        return $ids;
    });
    $c = clienteOut(buscarCliente($id));
    $c['recibo'] = [
        'criado_em' => date('Y-m-d H:i:s'),
        'usuario' => $u['nome'],
        'pagamentos' => array_map(fn($l) => ['forma' => $l['forma_nome'], 'valor' => (float)$l['valor'] + (float)$l['acrescimo'], 'abatido' => (float)$l['valor'], 'acrescimo' => (float)$l['acrescimo'], 'troco' => (float)$l['troco']],
            Db::all('SELECT * FROM fiado_lancamentos WHERE id IN (' . implode(',', array_map('intval', $ids)) . ') ORDER BY id')),
    ];
    return $c;
});

/** Admin: corrigir a conta (perdoar dívida, lançar dívida antiga do caderno, corrigir erro). */
$r->post('/clientes/{id}/ajuste', function (int $id) {
    $u = Auth::admin();
    $d = Http::body();
    $tipo = V::enum($d, 'tipo', ['aumentar', 'diminuir']);
    $valor = V::money($d, 'valor', true, 0.01);
    $motivo = V::str($d, 'motivo', 255, true, 3);
    Db::tx(fn() => Fiado::lancar($id, $tipo === 'aumentar' ? 'debito' : 'estorno', $tipo === 'aumentar' ? $valor : -$valor, [
        'usuario_id' => (int)$u['id'], 'observacao' => "Ajuste: $motivo",
    ]));
    return clienteOut(buscarCliente($id));
});
