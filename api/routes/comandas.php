<?php
declare(strict_types=1);

/**
 * Comandas do bar — abertas pelo nome do cliente.
 * O estoque baixa na hora em que o item é lançado (a bebida já saiu da geladeira).
 * No fechamento vira uma venda (origem "comanda") no caixa que recebeu.
 *
 * @var Router $r
 */

function comandaOut(int $id, bool $comItens = true): array
{
    $c = Db::one(
        'SELECT c.*, u.nome AS aberta_por FROM comandas c LEFT JOIN usuarios u ON u.id = c.usuario_abertura_id WHERE c.id = ?', [$id]
    ) ?? throw new HttpError(404, 'Comanda não encontrada.');
    $itens = Db::all(
        'SELECT i.*, u.nome AS usuario FROM comanda_itens i LEFT JOIN usuarios u ON u.id = i.usuario_id WHERE i.comanda_id = ? ORDER BY i.id', [$id]
    );
    $ativos = array_filter($itens, fn($i) => !$i['cancelado']);
    $out = [
        'id' => (int)$c['id'], 'nome_cliente' => $c['nome_cliente'], 'status' => $c['status'], 'observacao' => $c['observacao'],
        'aberta_em' => $c['aberta_em'], 'aberta_por' => $c['aberta_por'], 'fechada_em' => $c['fechada_em'],
        'venda_id' => $c['venda_id'] !== null ? (int)$c['venda_id'] : null,
        'total' => round(array_sum(array_map(fn($i) => (float)$i['quantidade'] * (float)$i['preco_unitario'], $ativos)), 2),
        'qtd_itens' => (int)array_sum(array_map(fn($i) => $i['tipo'] === 'produto' ? (float)$i['quantidade'] : 0, $ativos)),
        'ultimo_item_em' => $ativos ? max(array_column($ativos, 'criado_em')) : null,
    ];
    if ($comItens) {
        $out['itens'] = array_map(fn($i) => [
            'id' => (int)$i['id'], 'tipo' => $i['tipo'], 'produto_id' => $i['produto_id'] !== null ? (int)$i['produto_id'] : null,
            'item_pai_id' => $i['item_pai_id'] !== null ? (int)$i['item_pai_id'] : null,
            'nome' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'],
            'preco_unitario' => (float)$i['preco_unitario'],
            'total' => round((float)$i['quantidade'] * (float)$i['preco_unitario'], 2),
            'cascos_devolvidos' => (int)$i['cascos_devolvidos'],
            'cancelado' => (bool)$i['cancelado'], 'motivo_cancelamento' => $i['motivo_cancelamento'],
            'usuario' => $i['usuario'], 'criado_em' => $i['criado_em'],
        ], $itens);
    }
    return $out;
}

function comandaAberta(int $id): array
{
    $c = Db::one('SELECT * FROM comandas WHERE id = ? FOR UPDATE', [$id]) ?? throw new HttpError(404, 'Comanda não encontrada.');
    if ($c['status'] !== 'aberta') throw new HttpError(409, 'Esta comanda já foi ' . ($c['status'] === 'fechada' ? 'fechada' : 'cancelada') . '.');
    return $c;
}

$r->get('/comandas', function () {
    Auth::user();
    $status = V::enum(['s' => Http::query('status', 'aberta')], 's', ['aberta', 'fechada', 'cancelada']);
    $ordem = $status === 'aberta' ? 'c.nome_cliente' : 'c.id DESC';
    $ids = Db::all("SELECT c.id FROM comandas c WHERE c.status = ? ORDER BY $ordem LIMIT 200", [$status]);
    return array_map(fn($r) => comandaOut((int)$r['id'], false), $ids);
});

$r->post('/comandas', function () {
    $u = Auth::user();
    $d = Http::body();
    $nome = V::str($d, 'nome_cliente', 100, true, 1);
    $obs = V::str($d, 'observacao', 255, false);
    $igual = Db::value("SELECT id FROM comandas WHERE status = 'aberta' AND nome_cliente = ?", [$nome]);
    if ($igual) {
        throw new HttpError(422, "Já existe uma comanda aberta para \"$nome\". Use um sobrenome ou apelido para diferenciar.", ['campo' => 'nome_cliente', 'comanda_id' => (int)$igual]);
    }
    $id = Db::insert('INSERT INTO comandas (nome_cliente, observacao, usuario_abertura_id) VALUES (?, ?, ?)', [$nome, $obs, $u['id']]);
    return comandaOut($id);
});

$r->get('/comandas/{id}', function (int $id) {
    Auth::user();
    return comandaOut($id);
});

$r->put('/comandas/{id}', function (int $id) {
    Auth::user();
    $d = Http::body();
    $nome = V::str($d, 'nome_cliente', 100, true, 1);
    $obs = V::str($d, 'observacao', 255, false);
    Db::tx(function () use ($id, $nome, $obs) {
        comandaAberta($id);
        if (Db::value("SELECT 1 FROM comandas WHERE status = 'aberta' AND nome_cliente = ? AND id <> ?", [$nome, $id])) {
            throw new HttpError(422, "Já existe uma comanda aberta para \"$nome\".", ['campo' => 'nome_cliente']);
        }
        Db::exec('UPDATE comandas SET nome_cliente = ?, observacao = ? WHERE id = ?', [$nome, $obs, $id]);
    });
    return comandaOut($id);
});

/** Lança um ou mais itens na comanda. */
$r->post('/comandas/{id}/itens', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $req = isset($d['itens']) && is_array($d['itens']) ? $d['itens'] : [$d];
    Db::tx(function () use ($id, $req, $u) {
        $c = comandaAberta($id);
        $itens = Vendas::prepararItens($req);
        $motivo = "Comanda #$id — {$c['nome_cliente']}";
        $paiId = null;
        foreach ($itens as $i) {
            $novoId = Db::insert(
                'INSERT INTO comanda_itens (comanda_id, produto_id, tipo, produto_estoque_id, nome_produto, quantidade, unidades_base, cascos_devolvidos, item_pai_id, preco_unitario, custo_unitario, usuario_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $i['produto_id'], $i['tipo'], $i['produto_estoque_id'], $i['nome_produto'], $i['quantidade'], $i['unidades_base'],
                 $i['cascos_devolvidos'], $i['tipo'] === 'casco' ? $paiId : null, $i['preco_unitario'], $i['custo_unitario'], $u['id']]
            );
            if ($i['tipo'] === 'produto') $paiId = $novoId;
        }
        Vendas::moverEstoque($itens, -1, 'venda', $motivo, null, (int)$u['id']);
    });
    return comandaOut($id);
});

/** Tira um item lançado errado (devolve ao estoque). Leva junto o casco cobrado daquele item. */
$r->post('/comandas/{id}/itens/{item}/cancelar', function (int $id, int $item) {
    $u = Auth::user();
    $motivo = V::str(Http::body(), 'motivo', 255, false) ?? 'Lançado por engano';
    Db::tx(function () use ($id, $item, $motivo, $u) {
        $c = comandaAberta($id);
        $i = Db::one('SELECT * FROM comanda_itens WHERE id = ? AND comanda_id = ?', [$item, $id]) ?? throw new HttpError(404, 'Item não encontrado.');
        if ($i['cancelado']) throw new HttpError(422, 'Este item já foi retirado.');
        $afetados = Db::all('SELECT * FROM comanda_itens WHERE comanda_id = ? AND cancelado = 0 AND (id = ? OR item_pai_id = ?)', [$id, $item, $item]);
        Vendas::moverEstoque($afetados, +1, 'cancelamento', "Item retirado da comanda #$id — {$c['nome_cliente']}", null, (int)$u['id']);
        Db::exec(
            'UPDATE comanda_itens SET cancelado = 1, cancelado_por = ?, motivo_cancelamento = ? WHERE comanda_id = ? AND (id = ? OR item_pai_id = ?)',
            [$u['id'], $motivo, $id, $item, $item]
        );
    });
    return comandaOut($id);
});

$r->post('/comandas/{id}/fechar', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $sessaoId = (int)($d['caixa_sessao_id'] ?? 0);
    $vendaId = Db::tx(function () use ($id, $d, $sessaoId, $u) {
        $c = comandaAberta($id);
        Vendas::sessaoAberta($sessaoId);
        $rows = Db::all('SELECT * FROM comanda_itens WHERE comanda_id = ? AND cancelado = 0 ORDER BY id', [$id]);
        if (!$rows) throw new HttpError(422, 'A comanda está vazia. Se ninguém consumiu, cancele a comanda.');
        $itens = array_map(fn($i) => [
            'tipo' => $i['tipo'], 'produto_id' => $i['produto_id'] !== null ? (int)$i['produto_id'] : null,
            'produto_estoque_id' => $i['produto_estoque_id'] !== null ? (int)$i['produto_estoque_id'] : null,
            'nome_produto' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'],
            'unidades_base' => $i['unidades_base'] !== null ? (float)$i['unidades_base'] : null,
            'cascos_devolvidos' => (int)$i['cascos_devolvidos'],
            'preco_unitario' => (float)$i['preco_unitario'], 'custo_unitario' => (float)$i['custo_unitario'],
            'total' => round((float)$i['quantidade'] * (float)$i['preco_unitario'], 2),
        ], $rows);
        $vendaId = Vendas::registrar([
            'origem' => 'comanda', 'comanda_id' => $id, 'sessao_id' => $sessaoId, 'usuario_id' => (int)$u['id'],
            'cliente_id' => !empty($d['cliente_id']) ? (int)$d['cliente_id'] : ($c['cliente_id'] !== null ? (int)$c['cliente_id'] : null),
            'itens' => $itens, 'desconto' => V::money($d, 'desconto', false) ?? 0,
            'pagamentos' => is_array($d['pagamentos'] ?? null) ? $d['pagamentos'] : [],
            'baixar_estoque' => false,   // já baixou quando cada item foi lançado
        ]);
        // liga as movimentações da comanda à venda (histórico do produto mostra o nº da venda)
        Db::exec("UPDATE movimentacoes_estoque SET venda_id = ? WHERE venda_id IS NULL AND motivo LIKE ?", [$vendaId, "Comanda #$id —%"]);
        Db::exec("UPDATE comandas SET status = 'fechada', fechada_em = NOW(), venda_id = ? WHERE id = ?", [$vendaId, $id]);
        return $vendaId;
    });
    return ['comanda' => comandaOut($id), 'venda' => Vendas::obter($vendaId)];
});

/** Cancelar a comanda inteira (ninguém vai pagar / aberta por engano). Devolve tudo ao estoque. */
$r->post('/comandas/{id}/cancelar', function (int $id) {
    $u = Auth::user();
    $motivo = V::str(Http::body(), 'motivo', 255, true, 3);
    Db::tx(function () use ($id, $motivo, $u) {
        $c = comandaAberta($id);
        $ativos = Db::all('SELECT * FROM comanda_itens WHERE comanda_id = ? AND cancelado = 0', [$id]);
        if ($ativos && $u['perfil'] !== 'admin') {
            throw new HttpError(403, 'A comanda tem itens. Só o administrador pode cancelar uma comanda com consumo.');
        }
        Vendas::moverEstoque($ativos, +1, 'cancelamento', "Comanda #$id cancelada — {$c['nome_cliente']}", null, (int)$u['id']);
        Db::exec('UPDATE comanda_itens SET cancelado = 1, cancelado_por = ?, motivo_cancelamento = ? WHERE comanda_id = ? AND cancelado = 0', [$u['id'], $motivo, $id]);
        Db::exec("UPDATE comandas SET status = 'cancelada', fechada_em = NOW(), observacao = CONCAT_WS(' | ', observacao, ?) WHERE id = ?", [$motivo, $id]);
    });
    return comandaOut($id);
});
