<?php
declare(strict_types=1);

/**
 * Relatórios financeiros (somente admin).
 *
 * Definições usadas em todos os relatórios:
 *  - Faturamento  = tudo que os clientes pagaram nas vendas concluídas (inclui acréscimos, taxa de entrega e cascos)
 *  - Cascos       = depósito do vasilhame: entra no caixa mas NÃO é receita
 *  - CMV          = custo das mercadorias vendidas (custo gravado no momento da venda)
 *  - Taxas        = o que a maquininha cobra da loja
 *  - Entregadores = repasse das entregas concluídas no período
 *  - Lucro        = Faturamento − Cascos − CMV − Taxas − Entregadores
 *  - Vendas no fiado contam no dia da venda (não no dia em que o cliente pagou)
 *
 * @var Router $r
 */

function periodoRelatorio(): array
{
    $de = (string)Http::query('de', date('Y-m-d'));
    $ate = (string)Http::query('ate', $de);
    foreach ([$de, $ate] as $d) {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $d, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) throw new HttpError(422, 'Data inválida.');
    }
    if ($ate < $de) [$de, $ate] = [$ate, $de];
    $dias = (int)((strtotime($ate) - strtotime($de)) / 86400) + 1;
    if ($dias > 732) throw new HttpError(422, 'Período máximo de 2 anos.');
    return [$de . ' 00:00:00', $ate . ' 23:59:59', $de, $ate, $dias];
}

/** Totais de um período (usado no período atual e no anterior, para comparar). */
function totaisPeriodo(string $ini, string $fim): array
{
    $v = Db::one(
        "SELECT COUNT(*) AS vendas, COALESCE(SUM(total),0) AS faturamento, COALESCE(SUM(subtotal),0) AS subtotal,
                COALESCE(SUM(desconto),0) AS descontos, COALESCE(SUM(acrescimo),0) AS acrescimos,
                COALESCE(SUM(taxa_entrega),0) AS taxas_entrega, COALESCE(SUM(valor_cascos),0) AS cascos,
                COALESCE(SUM(custo_total),0) AS cmv, COALESCE(SUM(taxa_maquininha_total),0) AS taxas_maquininha
         FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ?", [$ini, $fim]
    );
    $canc = Db::one("SELECT COUNT(*) AS qtd, COALESCE(SUM(total),0) AS valor FROM vendas WHERE status = 'cancelada' AND criado_em BETWEEN ? AND ?", [$ini, $fim]);
    $entregadores = (float)Db::value("SELECT COALESCE(SUM(valor_entregador),0) FROM entregas WHERE status = 'entregue' AND entregue_em BETWEEN ? AND ?", [$ini, $fim]);
    // taxa da maquininha dos pagamentos de fiado recebidos no período (também é custo)
    $taxaFiado = (float)Db::value("SELECT COALESCE(SUM(taxa_maquininha),0) FROM fiado_lancamentos WHERE tipo = 'pagamento' AND criado_em BETWEEN ? AND ?", [$ini, $fim]);

    $fat = (float)$v['faturamento'];
    $cascos = (float)$v['cascos'];
    $cmv = (float)$v['cmv'];
    $taxas = (float)$v['taxas_maquininha'] + $taxaFiado;
    $receita = $fat - $cascos;                                   // receita de verdade (sem o depósito do casco)
    $vendaProdutos = (float)$v['subtotal'] - $cascos - (float)$v['descontos'];
    $lucro = $receita - $cmv - $taxas - $entregadores;
    return [
        'vendas' => (int)$v['vendas'],
        'faturamento' => round($fat, 2),
        'cascos' => round($cascos, 2),
        'receita' => round($receita, 2),
        'venda_produtos' => round($vendaProdutos, 2),
        'descontos' => round((float)$v['descontos'], 2),
        'acrescimos' => round((float)$v['acrescimos'], 2),
        'taxas_entrega' => round((float)$v['taxas_entrega'], 2),
        'cmv' => round($cmv, 2),
        'taxas_maquininha' => round($taxas, 2),
        'entregadores' => round($entregadores, 2),
        'lucro' => round($lucro, 2),
        'margem' => $receita > 0 ? round($lucro / $receita * 100, 1) : null,
        'cmv_pct' => $vendaProdutos > 0 ? round($cmv / $vendaProdutos * 100, 1) : null,
        'ticket_medio' => (int)$v['vendas'] > 0 ? round($fat / (int)$v['vendas'], 2) : 0,
        'canceladas' => (int)$canc['qtd'],
        'canceladas_valor' => round((float)$canc['valor'], 2),
    ];
}

$r->get('/relatorios', function () {
    Auth::admin();
    [$ini, $fim, $de, $ate, $dias] = periodoRelatorio();
    $p = [$ini, $fim];

    // ---- resumo + comparação com o período anterior de mesmo tamanho
    $atual = totaisPeriodo($ini, $fim);
    $antIni = date('Y-m-d 00:00:00', strtotime("$de -$dias days"));
    $antFim = date('Y-m-d 23:59:59', strtotime("$de -1 day"));
    $anterior = totaisPeriodo($antIni, $antFim);

    // ---- série no tempo (dia, semana ou mês, conforme o tamanho do período)
    $agrup = (string)Http::query('agrupar', '');
    if (!in_array($agrup, ['dia', 'semana', 'mes'], true)) $agrup = $dias <= 31 ? 'dia' : ($dias <= 120 ? 'semana' : 'mes');
    $expr = match ($agrup) {
        'semana' => "DATE_SUB(DATE(%s), INTERVAL WEEKDAY(%s) DAY)",
        'mes'    => "DATE_FORMAT(%s, '%%Y-%%m-01')",
        default  => "DATE(%s)",
    };
    $ev = sprintf($expr, 'criado_em', 'criado_em');
    $ee = sprintf($expr, 'entregue_em', 'entregue_em');
    $ef = sprintf($expr, 'criado_em', 'criado_em');
    $serie = [];
    foreach (Db::all(
        "SELECT $ev AS periodo, COUNT(*) AS vendas, SUM(total) AS faturamento, SUM(valor_cascos) AS cascos,
                SUM(custo_total) AS cmv, SUM(taxa_maquininha_total) AS taxas
         FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ? GROUP BY periodo", $p) as $x) {
        $serie[$x['periodo']] = ['vendas' => (int)$x['vendas'], 'faturamento' => (float)$x['faturamento'],
            'custos' => (float)$x['cascos'] + (float)$x['cmv'] + (float)$x['taxas'], 'receita' => (float)$x['faturamento'] - (float)$x['cascos']];
    }
    foreach (Db::all("SELECT $ee AS periodo, SUM(valor_entregador) AS v FROM entregas WHERE status = 'entregue' AND entregue_em BETWEEN ? AND ? GROUP BY periodo", $p) as $x) {
        $serie[$x['periodo']] ??= ['vendas' => 0, 'faturamento' => 0.0, 'custos' => 0.0, 'receita' => 0.0];
        $serie[$x['periodo']]['custos'] += (float)$x['v'];
    }
    foreach (Db::all("SELECT $ef AS periodo, SUM(taxa_maquininha) AS v FROM fiado_lancamentos WHERE tipo = 'pagamento' AND criado_em BETWEEN ? AND ? GROUP BY periodo", $p) as $x) {
        $serie[$x['periodo']] ??= ['vendas' => 0, 'faturamento' => 0.0, 'custos' => 0.0, 'receita' => 0.0];
        $serie[$x['periodo']]['custos'] += (float)$x['v'];
    }
    // preenche os períodos sem venda (o gráfico mostra o "buraco")
    $passo = match ($agrup) { 'semana' => '+1 week', 'mes' => '+1 month', default => '+1 day' };
    $cursor = match ($agrup) {
        'semana' => date('Y-m-d', strtotime($de . ' -' . ((int)date('N', strtotime($de)) - 1) . ' days')),
        'mes' => date('Y-m-01', strtotime($de)),
        default => $de,
    };
    $serieOut = [];
    for ($i = 0; $cursor <= $ate && $i < 800; $i++, $cursor = date('Y-m-d', strtotime("$cursor $passo"))) {
        $x = $serie[$cursor] ?? ['vendas' => 0, 'faturamento' => 0.0, 'custos' => 0.0, 'receita' => 0.0];
        $serieOut[] = ['periodo' => $cursor, 'vendas' => $x['vendas'], 'faturamento' => round($x['faturamento'], 2),
                       'lucro' => round($x['faturamento'] - $x['custos'], 2)];
    }

    // ---- produtos (mais vendidos e lucro por produto; antes de descontos e taxas)
    $produtos = array_map(fn($x) => [
        'produto_id' => $x['produto_id'] !== null ? (int)$x['produto_id'] : null, 'nome' => $x['nome'],
        'categoria' => $x['categoria'] ?? 'Sem categoria',
        'quantidade' => (float)$x['qtd'], 'faturamento' => round((float)$x['fat'], 2), 'custo' => round((float)$x['custo'], 2),
        'lucro' => round((float)$x['fat'] - (float)$x['custo'], 2),
        'margem' => (float)$x['fat'] > 0 ? round(((float)$x['fat'] - (float)$x['custo']) / (float)$x['fat'] * 100, 1) : null,
        'sem_custo' => (float)$x['custo'] <= 0,
    ], Db::all(
        "SELECT i.produto_id, MAX(i.nome_produto) AS nome, MAX(c.nome) AS categoria,
                SUM(i.quantidade) AS qtd, SUM(i.total) AS fat, SUM(i.quantidade * i.custo_unitario) AS custo
         FROM venda_itens i JOIN vendas v ON v.id = i.venda_id
         LEFT JOIN produtos pr ON pr.id = i.produto_id LEFT JOIN categorias c ON c.id = pr.categoria_id
         WHERE v.status = 'concluida' AND v.criado_em BETWEEN ? AND ? AND i.tipo = 'produto'
         GROUP BY i.produto_id, CASE WHEN i.produto_id IS NULL THEN i.nome_produto END
         ORDER BY fat DESC", $p
    ));

    // ---- categorias (CMV por categoria)
    $cats = [];
    foreach ($produtos as $x) {
        $k = $x['categoria'];
        $cats[$k] ??= ['categoria' => $k, 'quantidade' => 0, 'faturamento' => 0.0, 'custo' => 0.0];
        $cats[$k]['quantidade'] += $x['quantidade'];
        $cats[$k]['faturamento'] += $x['faturamento'];
        $cats[$k]['custo'] += $x['custo'];
    }
    $cats = array_values(array_map(fn($c) => $c + [
        'lucro' => round($c['faturamento'] - $c['custo'], 2),
        'cmv_pct' => $c['faturamento'] > 0 ? round($c['custo'] / $c['faturamento'] * 100, 1) : null,
    ], $cats));
    usort($cats, fn($a, $b) => $b['faturamento'] <=> $a['faturamento']);

    // ---- formas de pagamento (vendas)
    $formas = array_map(fn($x) => ['forma' => $x['forma'], 'qtd' => (int)$x['qtd'], 'valor' => round((float)$x['valor'], 2), 'taxa' => round((float)$x['taxa'], 2)],
        Db::all("SELECT p.forma_nome AS forma, COUNT(*) AS qtd, SUM(p.valor) AS valor, SUM(p.taxa_maquininha) AS taxa
                 FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id
                 WHERE v.status = 'concluida' AND v.criado_em BETWEEN ? AND ? GROUP BY p.forma_nome ORDER BY valor DESC", $p));

    // ---- equipe
    $equipe = array_map(fn($x) => ['usuario' => $x['usuario'] ?? '—', 'vendas' => (int)$x['qtd'], 'faturamento' => round((float)$x['fat'], 2),
                                    'ticket_medio' => (int)$x['qtd'] ? round((float)$x['fat'] / (int)$x['qtd'], 2) : 0],
        Db::all("SELECT u.nome AS usuario, COUNT(*) AS qtd, SUM(v.total) AS fat FROM vendas v LEFT JOIN usuarios u ON u.id = v.usuario_id
                 WHERE v.status = 'concluida' AND v.criado_em BETWEEN ? AND ? GROUP BY v.usuario_id ORDER BY fat DESC", $p));

    // ---- origem (balcão, comanda, online)
    $origens = array_map(fn($x) => ['origem' => $x['origem'], 'vendas' => (int)$x['qtd'], 'faturamento' => round((float)$x['fat'], 2)],
        Db::all("SELECT origem, COUNT(*) AS qtd, SUM(total) AS fat FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ? GROUP BY origem ORDER BY fat DESC", $p));

    // ---- horários de movimento
    $horas = array_fill(0, 24, ['vendas' => 0, 'faturamento' => 0.0]);
    foreach (Db::all("SELECT HOUR(criado_em) AS h, COUNT(*) AS qtd, SUM(total) AS fat FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ? GROUP BY h", $p) as $x) {
        $horas[(int)$x['h']] = ['vendas' => (int)$x['qtd'], 'faturamento' => round((float)$x['fat'], 2)];
    }
    $horasOut = array_map(fn($h, $x) => ['hora' => $h] + $x, array_keys($horas), $horas);

    // ---- fiado
    $fiado = [
        'vendido' => round((float)Db::value(
            "SELECT COALESCE(SUM(p.valor),0) FROM venda_pagamentos p JOIN vendas v ON v.id = p.venda_id JOIN formas_pagamento f ON f.id = p.forma_pagamento_id
             WHERE f.tipo = 'fiado' AND v.status = 'concluida' AND v.criado_em BETWEEN ? AND ?", $p), 2),
        'recebido' => round((float)Db::value("SELECT COALESCE(SUM(valor),0) FROM fiado_lancamentos WHERE tipo = 'pagamento' AND criado_em BETWEEN ? AND ?", $p), 2),
        'a_receber_hoje' => round((float)Db::value('SELECT COALESCE(SUM(saldo_fiado),0) FROM clientes WHERE saldo_fiado > 0'), 2),
        'devedores' => array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome'], 'saldo' => (float)$c['saldo_fiado']],
            Db::all('SELECT id, nome, saldo_fiado FROM clientes WHERE saldo_fiado > 0.004 ORDER BY saldo_fiado DESC LIMIT 15')),
    ];

    // ---- entregas
    $entregas = array_map(fn($x) => ['entregador' => $x['nome'] ?? '—', 'entregas' => (int)$x['qtd'], 'taxas' => round((float)$x['taxas'], 2), 'repasse' => round((float)$x['repasse'], 2)],
        Db::all("SELECT en.nome, COUNT(*) AS qtd, SUM(e.taxa_cobrada) AS taxas, SUM(e.valor_entregador) AS repasse
                 FROM entregas e LEFT JOIN entregadores en ON en.id = e.entregador_id
                 WHERE e.status = 'entregue' AND e.entregue_em BETWEEN ? AND ? GROUP BY e.entregador_id ORDER BY qtd DESC", $p));

    // ---- compras (entradas de estoque com custo) e perdas no período — ajuda a ler o CMV
    $compras = round((float)Db::value("SELECT COALESCE(SUM(quantidade * custo_unitario),0) FROM movimentacoes_estoque WHERE tipo IN ('entrada','importacao') AND quantidade > 0 AND custo_unitario IS NOT NULL AND criado_em BETWEEN ? AND ?", $p), 2);
    $perdas = round((float)Db::value(
        "SELECT COALESCE(SUM(-m.quantidade * pr.preco_custo),0) FROM movimentacoes_estoque m JOIN produtos pr ON pr.id = m.produto_id
         WHERE m.tipo = 'saida' AND m.criado_em BETWEEN ? AND ?", $p), 2);

    // ---- cascos
    $cascos = [
        'cobrados' => $atual['cascos'],
        'devolvidos_por_clientes' => (int)Db::value("SELECT COALESCE(SUM(quantidade),0) FROM casco_movimentos WHERE quantidade > 0 AND venda_id IS NOT NULL AND criado_em BETWEEN ? AND ?", $p),
        'vazios_na_loja' => array_map(fn($c) => ['nome' => $c['nome'], 'qtd' => (int)$c['estoque_cascos']], Db::all('SELECT nome, estoque_cascos FROM produtos WHERE usa_casco = 1 ORDER BY nome')),
    ];

    return [
        'periodo' => ['de' => $de, 'ate' => $ate, 'dias' => $dias, 'agrupar' => $agrup,
                      'anterior_de' => substr($antIni, 0, 10), 'anterior_ate' => substr($antFim, 0, 10)],
        'resumo' => $atual, 'anterior' => $anterior,
        'serie' => $serieOut, 'produtos' => $produtos, 'categorias' => $cats, 'formas' => $formas,
        'equipe' => $equipe, 'origens' => $origens, 'horas' => $horasOut,
        'fiado' => $fiado, 'entregas' => $entregas, 'compras' => $compras, 'perdas' => $perdas, 'cascos' => $cascos,
    ];
});
