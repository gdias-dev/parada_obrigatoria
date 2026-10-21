<?php
declare(strict_types=1);

/**
 * Pedidos online (página pública /pedir) e por telefone/WhatsApp.
 *
 * Fluxo:  novo → aceito (baixa o estoque) → saiu_entrega (entregador) ou pronto (retirada)
 *              → entregue (recebe o pagamento: vira venda no caixa)
 *         a qualquer momento antes de entregue → cancelado (devolve o estoque, se já tinha baixado)
 *
 * @var Router $r
 */

const LIMITE_PEDIDOS_IP = 5;    // por IP a cada 10 minutos (proteção contra abuso)

// ---------------------------------------------------------------------
// PÚBLICO (sem login)
// ---------------------------------------------------------------------
function configLoja(): array
{
    return lerConfig(CONFIG_PUBLICAS);
}

/** Produto disponível para o site? (ativo, visível online e com estoque) */
function disponivelOnline(array $p): bool
{
    if (ehEmbalagem($p)) return !$p['base_controla'] || (float)$p['base_estoque'] >= (float)$p['fator'];
    return !$p['controla_estoque'] || (float)$p['estoque'] >= 1;
}

$r->get('/publico/cardapio', function () {
    $rows = Db::all(SQL_PRODUTO . "
        WHERE p.ativo = 1 AND p.visivel_online = 1 AND (c.id IS NULL OR c.visivel_online = 1)
        ORDER BY c.ordem IS NULL, c.ordem, c.nome, p.nome");
    $cats = [];
    foreach ($rows as $p) {
        $cid = $p['categoria_id'] !== null ? (int)$p['categoria_id'] : 0;
        $cats[$cid] ??= ['id' => $cid, 'nome' => $p['categoria'] ?? 'Outros', 'produtos' => []];
        $usaCasco = ehEmbalagem($p) ? (bool)$p['base_usa_casco'] : (bool)$p['usa_casco'];
        $cats[$cid]['produtos'][] = [
            'id' => (int)$p['id'], 'nome' => $p['nome'], 'descricao' => $p['descricao'],
            'preco' => (float)$p['preco_venda'], 'unidade' => $p['unidade'],
            'disponivel' => disponivelOnline($p),
            'casco' => $usaCasco ? [
                'valor' => ehEmbalagem($p) ? (float)$p['base_valor_casco'] : (float)$p['valor_casco'],
                'por_item' => ehEmbalagem($p) ? (int)$p['fator'] : 1,
            ] : null,
        ];
    }
    $formas = array_map(fn($f) => ['id' => (int)$f['id'], 'nome' => $f['nome'], 'tipo' => $f['tipo']],
        Db::all("SELECT id, nome, tipo FROM formas_pagamento WHERE ativo = 1 AND ativo_online = 1 AND tipo <> 'fiado' ORDER BY ordem, id"));
    $bairros = array_map(fn($b) => ['id' => (int)$b['id'], 'nome' => $b['nome'], 'taxa' => (float)$b['taxa']],
        Db::all('SELECT * FROM bairros_entrega WHERE ativo = 1 ORDER BY nome'));
    return ['loja' => configLoja(), 'categorias' => array_values($cats), 'formas' => $formas, 'bairros' => $bairros];
});

function gerarCodigoPedido(): string
{
    $letras = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    do {
        $c = '';
        for ($i = 0; $i < 6; $i++) $c .= $letras[random_int(0, strlen($letras) - 1)];
    } while (Db::value('SELECT 1 FROM pedidos_online WHERE codigo = ?', [$c]));
    return $c;
}

/** Valida e grava o pedido (site ou telefone). Retorna o id. */
function criarPedido(array $d, string $canal, ?int $usuarioId): int
{
    $loja = configLoja();
    if ($canal === 'site' && ($loja['pedidos_online_ativo'] ?? '1') !== '1') {
        throw new HttpError(409, 'A loja não está recebendo pedidos agora. Tente mais tarde ou chame no WhatsApp.');
    }
    // campo escondido: robôs costumam preencher
    if (!empty($d['site'])) throw new HttpError(422, 'Pedido inválido.');

    $nome = V::str($d, 'nome', 120, true, 2);
    $tel = preg_replace('/\D/', '', (string)($d['telefone'] ?? ''));
    $tel = preg_replace('/^55(?=\d{10,11}$)/', '', $tel);
    if (strlen($tel) < 10 || strlen($tel) > 11) throw new HttpError(422, 'Informe o telefone com DDD.', ['campo' => 'telefone']);
    $tipo = V::enum($d, 'tipo', ['entrega', 'retirada'], 'entrega');
    if ($tipo === 'retirada' && ($loja['aceita_retirada'] ?? '1') !== '1') throw new HttpError(422, 'No momento só fazemos entrega.');

    $endereco = $bairro = $ref = null;
    $taxa = 0.0;
    if ($tipo === 'entrega') {
        $endereco = V::str($d, 'endereco', 200, true, 5);
        $ref = V::str($d, 'referencia', 200, false);
        $temBairros = (int)Db::value('SELECT COUNT(*) FROM bairros_entrega WHERE ativo = 1');
        if ($temBairros) {
            $b = Db::one('SELECT * FROM bairros_entrega WHERE id = ? AND ativo = 1', [(int)($d['bairro_id'] ?? 0)])
                ?? throw new HttpError(422, 'Escolha o bairro da entrega.', ['campo' => 'bairro_id']);
            $bairro = $b['nome'];
            $taxa = (float)$b['taxa'];
        } else {
            $bairro = V::str($d, 'bairro', 80, true, 2);
        }
        // pedido por telefone: atendente pode mudar a taxa
        if ($canal === 'telefone' && isset($d['taxa_entrega']) && $d['taxa_entrega'] !== '') {
            $taxa = V::money($d, 'taxa_entrega', true);
        }
    }

    $forma = Db::one("SELECT * FROM formas_pagamento WHERE id = ? AND ativo = 1 AND tipo <> 'fiado'" . ($canal === 'site' ? ' AND ativo_online = 1' : ''), [(int)($d['forma_pagamento_id'] ?? 0)])
        ?? throw new HttpError(422, 'Escolha a forma de pagamento.', ['campo' => 'forma_pagamento_id']);
    $obs = V::str($d, 'observacao', 255, false);

    $req = is_array($d['itens'] ?? null) ? $d['itens'] : [];
    if (count($req) > 60) throw new HttpError(422, 'Pedido com itens demais.');
    $itens = Vendas::prepararItens($req);

    // Online não vende o que não tem: confere o estoque (somando engradado + unidade)
    $precisa = [];
    foreach ($itens as $i) if ($i['tipo'] === 'produto') $precisa[$i['produto_estoque_id']] = ($precisa[$i['produto_estoque_id']] ?? 0) + $i['unidades_base'];
    foreach ($precisa as $pid => $qtd) {
        $p = Db::one('SELECT nome, estoque, controla_estoque FROM produtos WHERE id = ?', [$pid]);
        if ($p && $p['controla_estoque'] && (float)$p['estoque'] + 0.0005 < $qtd) {
            throw new HttpError(422, "Temos só " . max(0, (int)$p['estoque']) . " unidade(s) de {$p['nome']} agora.");
        }
    }
    foreach ($itens as $i) {
        if ($i['tipo'] !== 'produto') continue;
        $p = Db::one('SELECT visivel_online FROM produtos WHERE id = ?', [$i['produto_id']]);
        if ($canal === 'site' && !$p['visivel_online']) throw new HttpError(422, "{$i['nome_produto']} não está disponível pelo site.");
    }

    $subtotal = round(array_sum(array_column($itens, 'total')), 2);
    $minimo = (float)($loja['pedido_minimo'] ?: 0);
    $valorProdutos = round(array_sum(array_map(fn($i) => $i['tipo'] === 'produto' ? $i['total'] : 0, $itens)), 2);
    if ($canal === 'site' && $minimo > 0 && $valorProdutos + 0.001 < $minimo) {
        throw new HttpError(422, 'O pedido mínimo é de R$ ' . number_format($minimo, 2, ',', '.') . '.');
    }
    $total = round($subtotal + $taxa, 2);

    $trocoPara = null;
    if ($forma['tipo'] === 'dinheiro' && isset($d['troco_para']) && $d['troco_para'] !== '' && $d['troco_para'] !== null) {
        $trocoPara = V::money($d, 'troco_para', true);
        if ($trocoPara < $total) throw new HttpError(422, 'O valor para troco é menor que o total do pedido.', ['campo' => 'troco_para']);
    }

    return Db::tx(function () use ($canal, $usuarioId, $nome, $tel, $tipo, $endereco, $bairro, $ref, $forma, $trocoPara, $obs, $itens, $subtotal, $taxa, $total) {
        if ($canal === 'site') {
            $recentes = (int)Db::value("SELECT COUNT(*) FROM pedidos_online WHERE ip = ? AND canal = 'site' AND criado_em > NOW() - INTERVAL 10 MINUTE", [Http::ip()]);
            if ($recentes >= LIMITE_PEDIDOS_IP) throw new HttpError(429, 'Muitos pedidos seguidos. Aguarde alguns minutos ou chame no WhatsApp.');
        }
        // Liga ao cadastro do cliente pelo telefone (cria se não existir; sem fiado liberado)
        $cli = Db::one('SELECT id FROM clientes WHERE telefone = ? AND ativo = 1 ORDER BY id LIMIT 1', [$tel]);
        if ($cli) {
            $clienteId = (int)$cli['id'];
            if ($tipo === 'entrega') {
                Db::exec('UPDATE clientes SET endereco = ?, bairro = ?, referencia = COALESCE(?, referencia) WHERE id = ?', [$endereco, $bairro, $ref, $clienteId]);
            }
        } else {
            $clienteId = Db::insert(
                'INSERT INTO clientes (nome, telefone, endereco, bairro, referencia, limite_fiado, observacao) VALUES (?, ?, ?, ?, ?, 0, ?)',
                [$nome, $tel, $endereco, $bairro, $ref, 'Cadastrado por pedido ' . ($canal === 'site' ? 'online' : 'por telefone')]
            );
        }
        $id = Db::insert(
            'INSERT INTO pedidos_online (codigo, canal, cliente_id, cliente_nome, telefone, tipo, endereco, bairro, referencia, forma_pagamento_id, troco_para, observacao, subtotal, taxa_entrega, total, ip, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [gerarCodigoPedido(), $canal, $clienteId, $nome, $tel, $tipo, $endereco, $bairro, $ref, $forma['id'], $trocoPara, $obs, $subtotal, $taxa, $total, Http::ip(), $usuarioId]
        );
        foreach ($itens as $i) {
            Db::exec(
                'INSERT INTO pedido_itens (pedido_id, produto_id, tipo, produto_estoque_id, nome_produto, quantidade, unidades_base, cascos_devolvidos, preco_unitario, custo_unitario)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $i['produto_id'], $i['tipo'], $i['produto_estoque_id'], $i['nome_produto'], $i['quantidade'], $i['unidades_base'], $i['cascos_devolvidos'], $i['preco_unitario'], $i['custo_unitario']]
            );
        }
        return $id;
    });
}

const STATUS_PUBLICO = [
    'novo' => 'Recebido — aguardando a loja confirmar',
    'aceito' => 'Confirmado — separando seu pedido',
    'pronto' => 'Pronto para retirar',
    'saiu_entrega' => 'Saiu para entrega',
    'entregue' => 'Entregue',
    'cancelado' => 'Cancelado',
];

function pedidoPublico(string $codigo): array
{
    $p = Db::one('SELECT p.*, f.nome AS forma FROM pedidos_online p LEFT JOIN formas_pagamento f ON f.id = p.forma_pagamento_id WHERE p.codigo = ?', [$codigo])
        ?? throw new HttpError(404, 'Pedido não encontrado.');
    return [
        'codigo' => $p['codigo'], 'status' => $p['status'], 'status_texto' => STATUS_PUBLICO[$p['status']],
        'tipo' => $p['tipo'], 'nome' => $p['cliente_nome'], 'endereco' => $p['endereco'], 'bairro' => $p['bairro'],
        'forma' => $p['forma'], 'troco_para' => $p['troco_para'] !== null ? (float)$p['troco_para'] : null,
        'subtotal' => (float)$p['subtotal'], 'taxa_entrega' => (float)$p['taxa_entrega'], 'total' => (float)$p['total'],
        'motivo_cancelamento' => $p['status'] === 'cancelado' ? $p['motivo_cancelamento'] : null,
        'criado_em' => $p['criado_em'],
        'itens' => array_map(fn($i) => ['nome' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'], 'total' => round((float)$i['quantidade'] * (float)$i['preco_unitario'], 2), 'tipo' => $i['tipo']],
            Db::all('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id', [$p['id']])),
    ];
}

$r->post('/publico/pedidos', function () {
    $id = criarPedido(Http::body(), 'site', null);
    return pedidoPublico((string)Db::value('SELECT codigo FROM pedidos_online WHERE id = ?', [$id]));
});

$r->get('/publico/pedido', function () {
    $codigo = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)Http::query('codigo', '')));
    if (strlen($codigo) !== 6) throw new HttpError(404, 'Pedido não encontrado.');
    return pedidoPublico($codigo);
});

// ---------------------------------------------------------------------
// PAINEL INTERNO (logado)
// ---------------------------------------------------------------------
function pedidoOut(array $p): array
{
    $itens = Db::all('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id', [$p['id']]);
    return [
        'id' => (int)$p['id'], 'codigo' => $p['codigo'], 'canal' => $p['canal'], 'status' => $p['status'],
        'cliente_id' => $p['cliente_id'] !== null ? (int)$p['cliente_id'] : null,
        'cliente_nome' => $p['cliente_nome'], 'telefone' => $p['telefone'], 'tipo' => $p['tipo'],
        'endereco' => $p['endereco'], 'bairro' => $p['bairro'], 'referencia' => $p['referencia'],
        'forma_pagamento_id' => $p['forma_pagamento_id'] !== null ? (int)$p['forma_pagamento_id'] : null,
        'forma' => $p['forma'], 'forma_tipo' => $p['forma_tipo'],
        'troco_para' => $p['troco_para'] !== null ? (float)$p['troco_para'] : null,
        'observacao' => $p['observacao'],
        'subtotal' => (float)$p['subtotal'], 'taxa_entrega' => (float)$p['taxa_entrega'], 'total' => (float)$p['total'],
        'motivo_cancelamento' => $p['motivo_cancelamento'],
        'venda_id' => $p['venda_id'] !== null ? (int)$p['venda_id'] : null,
        'entregador_id' => $p['entregador_id'] !== null ? (int)$p['entregador_id'] : null,
        'entregador' => $p['entregador'], 'atendente' => $p['atendente'],
        'criado_em' => $p['criado_em'], 'aceito_em' => $p['aceito_em'], 'finalizado_em' => $p['finalizado_em'],
        'itens' => array_map(fn($i) => [
            'id' => (int)$i['id'], 'tipo' => $i['tipo'], 'nome' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'],
            'preco_unitario' => (float)$i['preco_unitario'], 'total' => round((float)$i['quantidade'] * (float)$i['preco_unitario'], 2),
            'cascos_devolvidos' => (int)$i['cascos_devolvidos'],
        ], $itens),
    ];
}

const SQL_PEDIDO = 'SELECT p.*, f.nome AS forma, f.tipo AS forma_tipo, e.nome AS entregador, u.nome AS atendente
    FROM pedidos_online p
    LEFT JOIN formas_pagamento f ON f.id = p.forma_pagamento_id
    LEFT JOIN entregadores e ON e.id = p.entregador_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id';

function buscarPedido(int $id, bool $travar = false): array
{
    return Db::one(SQL_PEDIDO . ' WHERE p.id = ?' . ($travar ? ' FOR UPDATE' : ''), [$id]) ?? throw new HttpError(404, 'Pedido não encontrado.');
}

/** Itens do pedido no formato do núcleo de vendas. */
function itensDoPedido(int $id): array
{
    return array_map(fn($i) => [
        'tipo' => $i['tipo'], 'produto_id' => $i['produto_id'] !== null ? (int)$i['produto_id'] : null,
        'produto_estoque_id' => $i['produto_estoque_id'] !== null ? (int)$i['produto_estoque_id'] : null,
        'nome_produto' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'],
        'unidades_base' => $i['unidades_base'] !== null ? (float)$i['unidades_base'] : null,
        'cascos_devolvidos' => (int)$i['cascos_devolvidos'],
        'preco_unitario' => (float)$i['preco_unitario'], 'custo_unitario' => (float)$i['custo_unitario'],
        'total' => round((float)$i['quantidade'] * (float)$i['preco_unitario'], 2),
    ], Db::all('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id', [$id]));
}

$r->get('/pedidos/resumo', function () {
    Auth::user();
    $r = Db::one("SELECT SUM(status = 'novo') AS novos, SUM(status IN ('aceito','pronto','saiu_entrega')) AS andamento, MAX(CASE WHEN status = 'novo' THEN id END) AS ultimo_novo FROM pedidos_online");
    return ['novos' => (int)$r['novos'], 'andamento' => (int)$r['andamento'], 'ultimo_novo' => (int)$r['ultimo_novo'],
            'loja_aberta' => (lerConfig(['pedidos_online_ativo'])['pedidos_online_ativo'] ?? '1') === '1'];
});

$r->get('/pedidos', function () {
    Auth::user();
    $grupo = Http::query('grupo', 'ativos');
    [$where, $ordem] = match ($grupo) {
        'finalizados' => ["p.status = 'entregue' AND p.finalizado_em >= CURDATE() - INTERVAL 1 DAY", 'p.finalizado_em DESC'],
        'cancelados'  => ["p.status = 'cancelado' AND p.criado_em >= CURDATE() - INTERVAL 7 DAY", 'p.id DESC'],
        default       => ["p.status IN ('novo','aceito','pronto','saiu_entrega')", 'p.id ASC'],
    };
    return array_map('pedidoOut', Db::all(SQL_PEDIDO . " WHERE $where ORDER BY $ordem LIMIT 200"));
});

$r->post('/pedidos', function () {
    $u = Auth::user();
    $id = criarPedido(Http::body(), 'telefone', (int)$u['id']);
    return pedidoOut(buscarPedido($id));
});

$r->get('/pedidos/{id}', function (int $id) {
    Auth::user();
    return pedidoOut(buscarPedido($id));
});

/** Loja confirma: o estoque baixa aqui (os itens são separados). */
$r->post('/pedidos/{id}/aceitar', function (int $id) {
    $u = Auth::user();
    Db::tx(function () use ($id, $u) {
        $p = buscarPedido($id, true);
        if ($p['status'] !== 'novo') throw new HttpError(409, 'Este pedido já foi aceito ou cancelado.');
        Vendas::moverEstoque(itensDoPedido($id), -1, 'venda', "Pedido {$p['codigo']} — {$p['cliente_nome']}", null, (int)$u['id']);
        Db::exec("UPDATE pedidos_online SET status = 'aceito', aceito_em = NOW(), usuario_id = COALESCE(usuario_id, ?) WHERE id = ?", [$u['id'], $id]);
    });
    return pedidoOut(buscarPedido($id));
});

/** Saiu para entrega (com entregador) ou ficou pronto para retirada. */
$r->post('/pedidos/{id}/despachar', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    Db::tx(function () use ($id, $d, $u) {
        $p = buscarPedido($id, true);
        if ($p['status'] !== 'aceito') throw new HttpError(409, 'Aceite o pedido antes.');
        if ($p['tipo'] === 'retirada') {
            Db::exec("UPDATE pedidos_online SET status = 'pronto' WHERE id = ?", [$id]);
            return;
        }
        $e = Db::one('SELECT * FROM entregadores WHERE id = ? AND ativo = 1', [(int)($d['entregador_id'] ?? 0)])
            ?? throw new HttpError(422, 'Escolha o entregador.', ['campo' => 'entregador_id']);
        $repasse = $e['modo_repasse'] === 'taxa' ? (float)$p['taxa_entrega'] : (float)$e['taxa_padrao'];
        Db::exec(
            "INSERT INTO entregas (pedido_id, entregador_id, endereco, bairro, taxa_cobrada, valor_entregador, status, saiu_em) VALUES (?, ?, ?, ?, ?, ?, 'em_rota', NOW())",
            [$id, $e['id'], $p['endereco'], $p['bairro'], $p['taxa_entrega'], $repasse]
        );
        Db::exec("UPDATE pedidos_online SET status = 'saiu_entrega', entregador_id = ? WHERE id = ?", [$e['id'], $id]);
    });
    return pedidoOut(buscarPedido($id));
});

/** Entregue/retirado: recebe o pagamento e vira venda no caixa. */
$r->post('/pedidos/{id}/finalizar', function (int $id) {
    $u = Auth::user();
    $d = Http::body();
    $sessaoId = (int)($d['caixa_sessao_id'] ?? 0);
    Db::tx(function () use ($id, $d, $sessaoId, $u) {
        $p = buscarPedido($id, true);
        if (!in_array($p['status'], ['aceito', 'pronto', 'saiu_entrega'], true)) throw new HttpError(409, 'Este pedido não está em andamento.');
        Vendas::sessaoAberta($sessaoId);
        $vendaId = Vendas::registrar([
            'origem' => 'online', 'sessao_id' => $sessaoId, 'usuario_id' => (int)$u['id'],
            'cliente_id' => $p['cliente_id'] !== null ? (int)$p['cliente_id'] : null,
            'itens' => itensDoPedido($id), 'desconto' => V::money($d, 'desconto', false) ?? 0,
            'taxa_entrega' => (float)$p['taxa_entrega'],
            'pagamentos' => is_array($d['pagamentos'] ?? null) ? $d['pagamentos'] : [],
            'baixar_estoque' => false,   // já baixou ao aceitar
        ]);
        Db::exec("UPDATE movimentacoes_estoque SET venda_id = ? WHERE venda_id IS NULL AND motivo LIKE ?", [$vendaId, "Pedido {$p['codigo']} —%"]);
        Db::exec("UPDATE pedidos_online SET status = 'entregue', finalizado_em = NOW(), venda_id = ? WHERE id = ?", [$vendaId, $id]);
        Db::exec("UPDATE entregas SET status = 'entregue', entregue_em = NOW(), venda_id = ? WHERE pedido_id = ? AND status = 'em_rota'", [$vendaId, $id]);
    });
    $p = pedidoOut(buscarPedido($id));
    return ['pedido' => $p, 'venda' => Vendas::obter($p['venda_id'])];
});

$r->post('/pedidos/{id}/cancelar', function (int $id) {
    $u = Auth::user();
    $motivo = V::str(Http::body(), 'motivo', 255, true, 3);
    Db::tx(function () use ($id, $motivo, $u) {
        $p = buscarPedido($id, true);
        if (in_array($p['status'], ['entregue', 'cancelado'], true)) throw new HttpError(409, 'Este pedido já foi ' . ($p['status'] === 'entregue' ? 'entregue (cancele a venda no Caixa)' : 'cancelado') . '.');
        if ($p['status'] !== 'novo') {
            Vendas::moverEstoque(itensDoPedido($id), +1, 'cancelamento', "Pedido {$p['codigo']} cancelado", null, (int)$u['id']);
        }
        Db::exec("UPDATE entregas SET status = 'cancelada' WHERE pedido_id = ?", [$id]);
        Db::exec("UPDATE pedidos_online SET status = 'cancelado', motivo_cancelamento = ?, finalizado_em = NOW() WHERE id = ?", [$motivo, $id]);
    });
    return pedidoOut(buscarPedido($id));
});
