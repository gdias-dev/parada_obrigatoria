<?php
declare(strict_types=1);

/**
 * Núcleo de vendas — usado pelo PDV, pelo fechamento de comanda e (etapa 5) pelos pedidos online.
 * Preço e custo SEMPRE vêm do banco, nunca do navegador.
 */
final class Vendas
{
    /**
     * Transforma o que o caixa pediu em itens de venda.
     * Cada pedido pode virar 2 linhas: o produto + o casco (quando o cliente não trouxe o casco).
     *
     * @param array $req [['produto_id'=>, 'quantidade'=>, 'casco_trouxe'=>bool], ...]
     */
    public static function prepararItens(array $req): array
    {
        if (!$req) throw new HttpError(422, 'Adicione pelo menos um produto.');
        if (count($req) > 300) throw new HttpError(422, 'Venda com itens demais.');
        $itens = [];
        foreach ($req as $r) {
            $id = (int)($r['produto_id'] ?? 0);
            $p = Db::one(SQL_PRODUTO . ' WHERE p.id = ?', [$id]) ?? throw new HttpError(422, 'Produto não encontrado.');
            if (!$p['ativo']) throw new HttpError(422, "\"{$p['nome']}\" está desativado.");
            if ((float)$p['preco_venda'] <= 0) throw new HttpError(422, "\"{$p['nome']}\" está sem preço de venda. Cadastre o preço em Produtos antes de vender.");

            $qtd = V::parseNumber($r['quantidade'] ?? 1);
            if ($qtd === null || $qtd <= 0 || $qtd > 100000) throw new HttpError(422, "Quantidade inválida para \"{$p['nome']}\".");
            if (!in_array($p['unidade'], ['KG', 'L'], true) && floor($qtd) != $qtd) {
                throw new HttpError(422, "\"{$p['nome']}\" é vendido por unidade: use quantidade inteira.");
            }
            $qtd = round($qtd, 3);

            $emb = ehEmbalagem($p);
            $estoqueId = $emb ? (int)$p['produto_base_id'] : (int)$p['id'];
            $unidades = round($qtd * ($emb ? (float)$p['fator'] : 1), 4);
            $preco = (float)$p['preco_venda'];

            // Casco: vale para a unidade (Coca 2L). Num engradado, conta 1 casco por unidade.
            $usaCasco = $emb ? (bool)$p['base_usa_casco'] : (bool)$p['usa_casco'];
            $valorCasco = $emb ? (float)$p['base_valor_casco'] : (float)$p['valor_casco'];
            $nCascos = $usaCasco ? (int)round($unidades) : 0;
            $trouxe = $usaCasco && filter_var($r['casco_trouxe'] ?? false, FILTER_VALIDATE_BOOLEAN);

            $itens[] = [
                'tipo'               => 'produto',
                'produto_id'         => (int)$p['id'],
                'produto_estoque_id' => $estoqueId,
                'nome_produto'       => $p['nome'],
                'quantidade'         => $qtd,
                'unidades_base'      => $unidades,
                'cascos_devolvidos'  => $trouxe ? $nCascos : 0,
                'preco_unitario'     => $preco,
                'custo_unitario'     => custoProduto($p),
                'total'              => round($qtd * $preco, 2),
            ];
            if ($usaCasco && !$trouxe && $nCascos > 0 && $valorCasco > 0) {
                $itens[] = [
                    'tipo'               => 'casco',
                    'produto_id'         => (int)$p['id'],
                    'produto_estoque_id' => $estoqueId,
                    'nome_produto'       => 'Casco — ' . ($emb ? $p['base_nome'] : $p['nome']),
                    'quantidade'         => $nCascos,
                    'unidades_base'      => null,
                    'cascos_devolvidos'  => 0,
                    'preco_unitario'     => $valorCasco,
                    'custo_unitario'     => 0.0,
                    'total'              => round($nCascos * $valorCasco, 2),
                ];
            }
        }
        return $itens;
    }

    /**
     * Baixa (sinal -1) ou devolve (sinal +1) o estoque e os cascos dos itens.
     * Itens de casco cobrado não mexem em estoque.
     */
    public static function moverEstoque(array $itens, int $sinal, string $tipo, string $motivo, ?int $vendaId, ?int $usuarioId): void
    {
        foreach ($itens as $i) {
            if (($i['tipo'] ?? 'produto') !== 'produto' || empty($i['produto_estoque_id'])) continue;
            $eid = (int)$i['produto_estoque_id'];
            $controla = Db::value('SELECT controla_estoque FROM produtos WHERE id = ?', [$eid]);
            $unidades = (float)($i['unidades_base'] ?? $i['quantidade']);
            if ($controla && $unidades > 0) {
                Estoque::mover($eid, $sinal * $unidades, $tipo, $motivo, null, $vendaId, $usuarioId);
            }
            // cliente devolveu casco: a loja ganha casco vazio (no cancelamento, perde)
            $cascos = (int)($i['cascos_devolvidos'] ?? 0);
            if ($cascos > 0) {
                Cascos::mover($eid, -$sinal * $cascos, ($sinal < 0 ? 'Cliente trouxe casco — ' : '') . $motivo, $vendaId, $usuarioId);
            }
        }
    }

    /**
     * Calcula acréscimo/desconto da forma de pagamento, taxa da maquininha e troco.
     * Cada pagamento informa o "valor" da conta que ele quita (sem acréscimo).
     */
    public static function calcularPagamentos(float $devido, array $pags, bool $permitirFiado = true): array
    {
        if (!$pags) throw new HttpError(422, 'Informe a forma de pagamento.');
        $linhas = [];
        $soma = 0.0;
        foreach ($pags as $pg) {
            $f = Db::one('SELECT * FROM formas_pagamento WHERE id = ? AND ativo = 1', [(int)($pg['forma_pagamento_id'] ?? 0)])
                ?? throw new HttpError(422, 'Forma de pagamento inválida.');
            if ($f['tipo'] === 'fiado' && !$permitirFiado) throw new HttpError(422, 'Não dá para pagar fiado com fiado. Escolha outra forma.');

            $base = V::parseNumber($pg['valor'] ?? null);
            if ($base === null || $base <= 0) throw new HttpError(422, "Valor inválido em {$f['nome']}.");
            $base = round($base, 2);
            $soma += $base;

            $v = (float)$f['taxa_cliente_valor'];
            $ajuste = match ($f['taxa_cliente_tipo']) {
                'acrescimo' => $f['taxa_cliente_modo'] === 'fixo' ? $v : round($base * $v / 100, 2),
                'desconto'  => -($f['taxa_cliente_modo'] === 'fixo' ? $v : round($base * $v / 100, 2)),
                default     => 0.0,
            };
            $cobrado = round($base + $ajuste, 2);
            $troco = 0.0;
            if ($f['tipo'] === 'dinheiro' && isset($pg['recebido']) && $pg['recebido'] !== '' && $pg['recebido'] !== null) {
                $recebido = V::parseNumber($pg['recebido']);
                if ($recebido === null || $recebido + 0.001 < $cobrado) throw new HttpError(422, 'O dinheiro recebido é menor que o valor a pagar.');
                $troco = round($recebido - $cobrado, 2);
            }
            $bandeira = isset($pg['bandeira']) ? mb_substr(trim((string)$pg['bandeira']), 0, 40) : null;

            $linhas[] = [
                'forma_pagamento_id' => (int)$f['id'],
                'forma_nome'         => $f['nome'],
                'tipo'               => $f['tipo'],
                'bandeira'           => $bandeira ?: null,
                'valor'              => $cobrado,
                'acrescimo'          => $ajuste,
                'taxa_maquininha'    => round($cobrado * (float)$f['taxa_maquininha_pct'] / 100, 2),
                'troco'              => $troco,
            ];
        }
        if (abs($soma - $devido) > 0.009) {
            $falta = round($devido - $soma, 2);
            throw new HttpError(422, $falta > 0
                ? 'Falta pagar R$ ' . number_format($falta, 2, ',', '.') . '.'
                : 'Os pagamentos passam do total em R$ ' . number_format(-$falta, 2, ',', '.') . '.');
        }
        return $linhas;
    }

    public static function sessaoAberta(int $sessaoId): array
    {
        $s = Db::one(
            'SELECT s.*, c.nome AS caixa FROM caixa_sessoes s JOIN caixas c ON c.id = s.caixa_id WHERE s.id = ?',
            [$sessaoId]
        );
        if (!$s || $s['status'] !== 'aberto') throw new HttpError(409, 'O caixa está fechado. Abra o caixa para vender.', ['codigo' => 'CAIXA_FECHADO']);
        return $s;
    }

    /** Grava a venda inteira. Chamar dentro de Db::tx(). */
    public static function registrar(array $o): int
    {
        $itens = $o['itens'];
        $subtotal = round(array_sum(array_column($itens, 'total')), 2);
        $valorCascos = round(array_sum(array_map(fn($i) => $i['tipo'] === 'casco' ? $i['total'] : 0, $itens)), 2);
        $desconto = round((float)($o['desconto'] ?? 0), 2);
        if ($desconto < 0 || $desconto > $subtotal - $valorCascos + 0.001) {
            throw new HttpError(422, 'Desconto inválido (não pode ser maior que o valor dos produtos).', ['campo' => 'desconto']);
        }
        $taxaEntrega = round((float)($o['taxa_entrega'] ?? 0), 2);
        $devido = round($subtotal - $desconto + $taxaEntrega, 2);
        $pags = self::calcularPagamentos($devido, $o['pagamentos']);
        $acrescimo = round(array_sum(array_column($pags, 'acrescimo')), 2);
        $taxaMaq = round(array_sum(array_column($pags, 'taxa_maquininha')), 2);
        $custoTotal = round(array_sum(array_map(fn($i) => $i['tipo'] === 'produto' ? $i['quantidade'] * $i['custo_unitario'] : 0, $itens)), 2);

        $vendaId = Db::insert(
            'INSERT INTO vendas (origem, comanda_id, caixa_sessao_id, cliente_id, usuario_id, subtotal, desconto, acrescimo, taxa_entrega, valor_cascos, total, custo_total, taxa_maquininha_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$o['origem'], $o['comanda_id'] ?? null, $o['sessao_id'], $o['cliente_id'] ?? null, $o['usuario_id'],
             $subtotal, $desconto, $acrescimo, $taxaEntrega, $valorCascos, round($devido + $acrescimo, 2), $custoTotal, $taxaMaq]
        );
        foreach ($itens as $i) {
            Db::exec(
                'INSERT INTO venda_itens (venda_id, produto_id, tipo, produto_estoque_id, nome_produto, quantidade, unidades_base, cascos_devolvidos, preco_unitario, custo_unitario, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$vendaId, $i['produto_id'], $i['tipo'], $i['produto_estoque_id'], $i['nome_produto'], $i['quantidade'],
                 $i['unidades_base'], $i['cascos_devolvidos'], $i['preco_unitario'], $i['custo_unitario'], $i['total']]
            );
        }
        foreach ($pags as $p) {
            Db::exec(
                'INSERT INTO venda_pagamentos (venda_id, forma_pagamento_id, forma_nome, bandeira, valor, acrescimo, taxa_maquininha, troco)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$vendaId, $p['forma_pagamento_id'], $p['forma_nome'], $p['bandeira'], $p['valor'], $p['acrescimo'], $p['taxa_maquininha'], $p['troco']]
            );
        }
        // Parte paga no fiado vira dívida do cliente
        $valorFiado = round(array_sum(array_map(fn($p) => $p['tipo'] === 'fiado' ? $p['valor'] : 0, $pags)), 2);
        if ($valorFiado > 0) {
            if (empty($o['cliente_id'])) throw new HttpError(422, 'Para vender fiado, escolha o cliente.', ['codigo' => 'CLIENTE_FIADO']);
            Fiado::debitarVenda((int)$o['cliente_id'], $valorFiado, $vendaId, (int)$o['sessao_id'], (int)$o['usuario_id']);
        }
        if ($o['baixar_estoque'] ?? true) {
            self::moverEstoque($itens, -1, 'venda', "Venda #$vendaId", $vendaId, $o['usuario_id']);
        }
        return $vendaId;
    }

    public static function obter(int $id): array
    {
        $v = Db::one(
            'SELECT v.*, u.nome AS usuario, cx.nome AS caixa, s.status AS sessao_status, cm.nome_cliente AS comanda_nome, cl.nome AS cliente_nome
             FROM vendas v
             LEFT JOIN usuarios u ON u.id = v.usuario_id
             LEFT JOIN caixa_sessoes s ON s.id = v.caixa_sessao_id
             LEFT JOIN caixas cx ON cx.id = s.caixa_id
             LEFT JOIN comandas cm ON cm.id = v.comanda_id
             LEFT JOIN clientes cl ON cl.id = v.cliente_id
             WHERE v.id = ?', [$id]
        ) ?? throw new HttpError(404, 'Venda não encontrada.');
        $admin = Auth::isAdmin();
        $out = [
            'id' => (int)$v['id'], 'origem' => $v['origem'], 'status' => $v['status'],
            'comanda_id' => $v['comanda_id'] !== null ? (int)$v['comanda_id'] : null, 'comanda_nome' => $v['comanda_nome'],
            'caixa_sessao_id' => $v['caixa_sessao_id'] !== null ? (int)$v['caixa_sessao_id'] : null,
            'caixa' => $v['caixa'], 'sessao_aberta' => $v['sessao_status'] === 'aberto',
            'usuario' => $v['usuario'],
            'cliente_id' => $v['cliente_id'] !== null ? (int)$v['cliente_id'] : null, 'cliente_nome' => $v['cliente_nome'],
            'subtotal' => (float)$v['subtotal'], 'desconto' => (float)$v['desconto'], 'acrescimo' => (float)$v['acrescimo'],
            'valor_cascos' => (float)$v['valor_cascos'], 'taxa_entrega' => (float)$v['taxa_entrega'], 'total' => (float)$v['total'],
            'motivo_cancelamento' => $v['motivo_cancelamento'], 'cancelada_em' => $v['cancelada_em'],
            'criado_em' => $v['criado_em'],
            'itens' => array_map(fn($i) => [
                'tipo' => $i['tipo'], 'produto_id' => $i['produto_id'] !== null ? (int)$i['produto_id'] : null,
                'nome' => $i['nome_produto'], 'quantidade' => (float)$i['quantidade'],
                'preco_unitario' => (float)$i['preco_unitario'], 'total' => (float)$i['total'],
                'cascos_devolvidos' => (int)$i['cascos_devolvidos'],
            ], Db::all('SELECT * FROM venda_itens WHERE venda_id = ? ORDER BY id', [$id])),
            'pagamentos' => array_map(fn($p) => [
                'forma' => $p['forma_nome'], 'bandeira' => $p['bandeira'], 'valor' => (float)$p['valor'],
                'acrescimo' => (float)$p['acrescimo'], 'troco' => (float)$p['troco'],
            ], Db::all('SELECT * FROM venda_pagamentos WHERE venda_id = ? ORDER BY id', [$id])),
        ];
        if ($admin) {
            $out['custo_total'] = (float)$v['custo_total'];
            $out['taxa_maquininha_total'] = (float)$v['taxa_maquininha_total'];
            $out['lucro'] = round((float)$v['total'] - (float)$v['valor_cascos'] - (float)$v['custo_total'] - (float)$v['taxa_maquininha_total'], 2);
        }
        return $out;
    }

    public static function cancelar(int $id, string $motivo, array $u): void
    {
        Db::tx(function () use ($id, $motivo, $u) {
            $v = Db::one('SELECT v.*, s.status AS sessao_status FROM vendas v LEFT JOIN caixa_sessoes s ON s.id = v.caixa_sessao_id WHERE v.id = ? FOR UPDATE', [$id])
                ?? throw new HttpError(404, 'Venda não encontrada.');
            if ($v['status'] === 'cancelada') throw new HttpError(422, 'Esta venda já foi cancelada.');
            if ($u['perfil'] !== 'admin' && $v['sessao_status'] !== 'aberto') {
                throw new HttpError(403, 'Depois que o caixa fecha, só o administrador pode cancelar a venda.');
            }
            $itens = Db::all('SELECT * FROM venda_itens WHERE venda_id = ?', [$id]);
            self::moverEstoque($itens, +1, 'cancelamento', "Cancelamento da venda #$id", $id, (int)$u['id']);
            foreach (Db::all("SELECT cliente_id, valor FROM fiado_lancamentos WHERE venda_id = ? AND tipo = 'debito'", [$id]) as $f) {
                Fiado::lancar((int)$f['cliente_id'], 'estorno', -(float)$f['valor'], [
                    'venda_id' => $id, 'usuario_id' => (int)$u['id'], 'observacao' => "Venda nº $id cancelada: $motivo",
                ]);
            }
            Db::exec(
                "UPDATE vendas SET status = 'cancelada', motivo_cancelamento = ?, cancelada_em = NOW(), cancelada_por = ? WHERE id = ?",
                [$motivo, $u['id'], $id]
            );
            if ($v['comanda_id']) Db::exec("UPDATE comandas SET status = 'cancelada' WHERE id = ?", [$v['comanda_id']]);
            Db::exec("UPDATE pedidos_online SET status = 'cancelado', motivo_cancelamento = ? WHERE venda_id = ?", ["Venda cancelada: $motivo", $id]);
            Db::exec("UPDATE entregas SET status = 'cancelada' WHERE venda_id = ? AND pago_entregador = 0", [$id]);
        });
    }
}
