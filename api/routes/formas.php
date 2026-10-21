<?php
declare(strict_types=1);

/**
 * Configuração das formas de pagamento (admin) — igual à tela do WhatsMenu:
 * acréscimo/desconto para o cliente, bandeiras, onde aparece (PDV / online)
 * e a taxa que a maquininha cobra da loja (descontada do lucro).
 *
 * @var Router $r
 */

const TIPOS_FORMA = ['dinheiro', 'pix', 'credito', 'debito', 'vale', 'fiado'];

function formaOut(array $f): array
{
    return [
        'id' => (int)$f['id'], 'nome' => $f['nome'], 'tipo' => $f['tipo'],
        'taxa_cliente_tipo' => $f['taxa_cliente_tipo'], 'taxa_cliente_modo' => $f['taxa_cliente_modo'],
        'taxa_cliente_valor' => (float)$f['taxa_cliente_valor'], 'taxa_maquininha_pct' => (float)$f['taxa_maquininha_pct'],
        'ativo_pdv' => (bool)$f['ativo_pdv'], 'ativo_online' => (bool)$f['ativo_online'], 'ativo' => (bool)$f['ativo'],
        'ordem' => (int)$f['ordem'],
        'bandeiras' => array_column(Db::all('SELECT nome FROM bandeiras WHERE forma_pagamento_id = ? ORDER BY id', [$f['id']]), 'nome'),
        'usos' => (int)Db::value('SELECT COUNT(*) FROM venda_pagamentos WHERE forma_pagamento_id = ?', [$f['id']]),
    ];
}

function dadosForma(array $d, ?array $atual): array
{
    $tipoTaxa = V::enum($d, 'taxa_cliente_tipo', ['nenhuma', 'acrescimo', 'desconto'], $atual['taxa_cliente_tipo'] ?? 'nenhuma');
    $modo = V::enum($d, 'taxa_cliente_modo', ['percentual', 'fixo'], $atual['taxa_cliente_modo'] ?? 'percentual');
    $valor = $tipoTaxa === 'nenhuma' ? 0.0 : (V::money($d, 'taxa_cliente_valor', true) ?? 0.0);
    if ($modo === 'percentual' && $valor > 50) throw new HttpError(422, 'Percentual muito alto (máx. 50%).', ['campo' => 'taxa_cliente_valor']);
    $maq = V::money($d, 'taxa_maquininha_pct', false) ?? 0.0;
    if ($maq > 30) throw new HttpError(422, 'Taxa da maquininha muito alta (máx. 30%).', ['campo' => 'taxa_maquininha_pct']);
    $tipo = $atual['tipo'] ?? V::enum($d, 'tipo', TIPOS_FORMA);
    return [
        'nome' => V::str($d, 'nome', 50, true, 2),
        'tipo' => $tipo,
        'taxa_cliente_tipo' => $tipoTaxa,
        'taxa_cliente_modo' => $modo,
        'taxa_cliente_valor' => $valor,
        // dinheiro e fiado não passam na maquininha
        'taxa_maquininha_pct' => in_array($tipo, ['dinheiro', 'fiado'], true) ? 0.0 : $maq,
        'ativo_pdv' => V::bool($d, 'ativo_pdv', (bool)($atual['ativo_pdv'] ?? true)),
        // fiado não aparece na loja online (cliente desconhecido)
        'ativo_online' => $tipo === 'fiado' ? 0 : V::bool($d, 'ativo_online', (bool)($atual['ativo_online'] ?? true)),
        'ativo' => V::bool($d, 'ativo', (bool)($atual['ativo'] ?? true)),
    ];
}

function salvarBandeiras(int $formaId, mixed $lista): void
{
    if (!is_array($lista)) return;
    $nomes = [];
    foreach ($lista as $b) {
        $b = mb_substr(trim((string)$b), 0, 40);
        if ($b !== '' && !in_array(mb_strtolower($b), array_map('mb_strtolower', $nomes), true)) $nomes[] = $b;
    }
    Db::exec('DELETE FROM bandeiras WHERE forma_pagamento_id = ?', [$formaId]);
    foreach (array_slice($nomes, 0, 20) as $b) Db::exec('INSERT INTO bandeiras (forma_pagamento_id, nome) VALUES (?, ?)', [$formaId, $b]);
}

$r->get('/formas-pagamento/config', function () {
    Auth::admin();
    return array_map('formaOut', Db::all('SELECT * FROM formas_pagamento ORDER BY ordem, id'));
});

$r->post('/formas-pagamento', function () {
    Auth::admin();
    $d = Http::body();
    $f = dadosForma($d, null);
    $f['ordem'] = (int)Db::value('SELECT COALESCE(MAX(ordem), 0) + 1 FROM formas_pagamento');
    $id = Db::tx(function () use ($f, $d) {
        $cols = array_keys($f);
        $id = Db::insert('INSERT INTO formas_pagamento (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')', array_values($f));
        salvarBandeiras($id, $d['bandeiras'] ?? []);
        return $id;
    });
    return formaOut(Db::one('SELECT * FROM formas_pagamento WHERE id = ?', [$id]));
});

$r->put('/formas-pagamento/{id}', function (int $id) {
    Auth::admin();
    $atual = Db::one('SELECT * FROM formas_pagamento WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Forma de pagamento não encontrada.');
    $d = Http::body();
    $f = dadosForma($d, $atual);
    if (isset($d['ordem'])) $f['ordem'] = (int)$d['ordem'];
    if (!$f['ativo'] && $atual['ativo']) {
        $restantes = (int)Db::value("SELECT COUNT(*) FROM formas_pagamento WHERE ativo = 1 AND ativo_pdv = 1 AND tipo <> 'fiado' AND id <> ?", [$id]);
        if ($restantes === 0) throw new HttpError(422, 'Deixe pelo menos uma forma de pagamento ativa no caixa.');
    }
    Db::tx(function () use ($id, $f, $d) {
        Db::exec('UPDATE formas_pagamento SET ' . implode(', ', array_map(fn($c) => "$c = ?", array_keys($f))) . ' WHERE id = ?', [...array_values($f), $id]);
        if (array_key_exists('bandeiras', $d)) salvarBandeiras($id, $d['bandeiras']);
    });
    return formaOut(Db::one('SELECT * FROM formas_pagamento WHERE id = ?', [$id]));
});
