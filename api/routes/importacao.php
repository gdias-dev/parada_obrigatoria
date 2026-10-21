<?php
declare(strict_types=1);

/**
 * Importação de produtos por planilha.
 * O navegador lê o .xlsx e envia as linhas em JSON; aqui validamos e gravamos.
 *
 * Regras:
 *  - Produto existente é achado pelo CÓDIGO DE BARRAS; sem código, pelo NOME exato.
 *  - Achou: atualiza só as colunas preenchidas (célula vazia não apaga nada).
 *  - Não achou: cria (precisa de nome e preço de venda).
 *  - Categoria que não existe é criada.
 *  - Estoque: "substituir" (contagem), "somar" (chegada de mercadoria) ou "ignorar".
 *
 * @var Router $r
 */

const IMPORT_MAX_LINHAS = 5000;

function numeroPlanilha(mixed $v, string $campo, array &$erros): ?float
{
    if ($v === null || (is_string($v) && trim($v) === '')) return null;
    $n = V::parseNumber($v);
    if ($n === null) { $erros[] = "$campo não é um número (\"$v\")"; return null; }
    if ($n < 0) { $erros[] = "$campo não pode ser negativo"; return null; }
    return $n;
}

function textoPlanilha(mixed $v): ?string
{
    if ($v === null) return null;
    $s = trim(preg_replace('/\s+/u', ' ', (string)$v));
    return $s === '' ? null : $s;
}

/** Analisa as linhas sem gravar nada. Retorna o plano de cada linha. */
function analisarImportacao(array $linhas, string $modoEstoque): array
{
    if (count($linhas) === 0) throw new HttpError(422, 'A planilha não tem produtos.');
    if (count($linhas) > IMPORT_MAX_LINHAS) throw new HttpError(422, 'Máximo de ' . IMPORT_MAX_LINHAS . ' linhas por importação.');

    // Carrega o catálogo uma vez (rápido mesmo com milhares de produtos)
    $porCodigo = [];
    $porNome = [];
    foreach (Db::all('SELECT p.id, p.codigo_barras, p.nome, p.preco_custo, p.preco_venda, p.estoque, p.estoque_minimo, p.unidade, p.ativo, p.produto_base_id, p.fator, c.nome AS categoria
                       FROM produtos p LEFT JOIN categorias c ON c.id = p.categoria_id') as $p) {
        if ($p['codigo_barras'] !== null) $porCodigo[$p['codigo_barras']] = $p;
        $porNome[mb_strtolower($p['nome'])][] = $p;
    }

    $vistosCodigo = [];
    $vistosNome = [];
    $plano = [];

    // códigos de unidades que estão na própria planilha (para engradados apontarem para elas)
    $unidadesNaPlanilha = [];
    foreach ($linhas as $l) {
        try {
            $c = normalizarCodigo($l['codigo'] ?? null);
            if ($c !== null && textoPlanilha($l['embalagem_de'] ?? null) === null) $unidadesNaPlanilha[$c] = true;
        } catch (HttpError) {}
    }

    foreach ($linhas as $i => $l) {
        $num = (int)($l['linha'] ?? $i + 2);
        $erros = [];
        $avisos = [];

        try { $codigo = normalizarCodigo($l['codigo'] ?? null); }
        catch (HttpError $e) { $codigo = null; $erros[] = $e->getMessage(); }

        $nome = textoPlanilha($l['nome'] ?? null);
        if ($nome !== null && mb_strlen($nome) > 150) { $erros[] = 'Nome muito longo (máx. 150)'; }
        $categoria = textoPlanilha($l['categoria'] ?? null);
        if ($categoria !== null && mb_strlen($categoria) > 80) { $erros[] = 'Categoria muito longa (máx. 80)'; }

        $unidade = textoPlanilha($l['unidade'] ?? null);
        if ($unidade !== null) {
            $unidade = mb_strtoupper($unidade);
            $unidade = ['UND' => 'UN', 'UNID' => 'UN', 'UNIDADE' => 'UN', 'LT' => 'L', 'LITRO' => 'L', 'PACOTE' => 'PCT', 'PC' => 'PCT', 'CAIXA' => 'CX', 'QUILO' => 'KG'][$unidade] ?? $unidade;
            if (!in_array($unidade, UNIDADES, true)) { $erros[] = "Unidade \"$unidade\" inválida (use UN, KG, L, CX ou PCT)"; $unidade = null; }
        }

        $custo   = numeroPlanilha($l['custo'] ?? null, 'Preço de custo', $erros);
        $venda   = numeroPlanilha($l['venda'] ?? null, 'Preço de venda', $erros);
        $estoque = numeroPlanilha($l['estoque'] ?? null, 'Estoque', $erros);
        $minimo  = numeroPlanilha($l['minimo'] ?? null, 'Estoque mínimo', $erros);

        // Engradado / fardo / pack
        $embDe = null; $fatorEmb = null;
        try { $embDe = normalizarCodigo($l['embalagem_de'] ?? null); } catch (HttpError $e) { $erros[] = 'Código da unidade inválido'; }
        if ($embDe !== null) {
            $fatorEmb = numeroPlanilha($l['qtd_embalagem'] ?? null, 'Qtd no engradado', $erros);
            if ($fatorEmb === null || $fatorEmb < 2 || floor($fatorEmb) != $fatorEmb) $erros[] = 'Informe a "Qtd no engradado" (número inteiro, 2 ou mais)';
            if ($embDe === $codigo) $erros[] = 'A embalagem não pode apontar para ela mesma';
            elseif (isset($porCodigo[$embDe])) {
                if ($porCodigo[$embDe]['produto_base_id'] !== null) $erros[] = "O código $embDe já é de um engradado, não de uma unidade";
            } elseif (!isset($unidadesNaPlanilha[$embDe])) {
                $erros[] = "Unidade com código $embDe não encontrada (cadastre a unidade antes ou na mesma planilha)";
            }
            if ($estoque !== null) { $avisos[] = 'Engradado não tem estoque próprio: o estoque fica na unidade (coluna ignorada)'; $estoque = null; }
            if ($custo !== null) { $avisos[] = 'Custo do engradado é calculado pela unidade (coluna ignorada)'; $custo = null; }
            if ($minimo !== null) $minimo = null;
        } elseif (textoPlanilha($l['qtd_embalagem'] ?? null) !== null) {
            $avisos[] = '"Qtd no engradado" preenchida sem o código da unidade: ignorada';
        }

        if ($codigo === null && $nome === null) {
            $erros[] = 'Linha sem código e sem nome';
        }

        // Repetidos dentro da própria planilha
        if ($codigo !== null) {
            if (isset($vistosCodigo[$codigo])) $erros[] = "Código repetido na planilha (já está na linha {$vistosCodigo[$codigo]})";
            else $vistosCodigo[$codigo] = $num;
        } elseif ($nome !== null) {
            $k = mb_strtolower($nome);
            if (isset($vistosNome[$k])) $erros[] = "Produto repetido na planilha (já está na linha {$vistosNome[$k]})";
            else $vistosNome[$k] = $num;
        }

        // Encontra o produto existente
        $existente = null;
        if ($codigo !== null && isset($porCodigo[$codigo])) {
            $existente = $porCodigo[$codigo];
        } elseif ($codigo === null && $nome !== null) {
            $iguais = $porNome[mb_strtolower($nome)] ?? [];
            if (count($iguais) > 1) $erros[] = 'Existe mais de um produto com esse nome no sistema; informe o código de barras';
            elseif (count($iguais) === 1) $existente = $iguais[0];
        }

        if (!$existente) {
            if ($nome === null) $erros[] = 'Produto novo precisa de nome';
            if ($venda === null || $venda <= 0) $erros[] = 'Produto novo precisa de preço de venda';
            if ($custo === null && $embDe === null) $avisos[] = 'Sem preço de custo: o lucro deste produto vai aparecer errado';
            if ($estoque === null && $embDe === null) $avisos[] = 'Sem estoque na planilha: o sistema não vai controlar o estoque deste item (ideal para drinks, copões e combos)';
        }

        $vendaFinal = $venda ?? ($existente ? (float)$existente['preco_venda'] : null);
        $custoFinal = $custo ?? ($existente ? (float)$existente['preco_custo'] : 0);
        if ($vendaFinal !== null && $custoFinal > 0 && $vendaFinal < $custoFinal) {
            $avisos[] = 'Preço de venda menor que o custo (prejuízo)';
        }

        // Estoque resultante
        $estoqueAntes = $existente ? (float)$existente['estoque'] : 0.0;
        $estoqueDepois = $estoqueAntes;
        if ($estoque !== null && $modoEstoque !== 'ignorar') {
            $estoqueDepois = ($modoEstoque === 'somar' && $existente) ? $estoqueAntes + $estoque : $estoque;
        }

        // O que muda (para mostrar na prévia)
        $mudancas = [];
        if ($existente) {
            if ($nome !== null && $codigo !== null && $nome !== $existente['nome']) $mudancas[] = 'nome';
            if ($venda !== null && abs($venda - (float)$existente['preco_venda']) > 0.004) $mudancas[] = 'preço de venda';
            if ($custo !== null && abs($custo - (float)$existente['preco_custo']) > 0.004) $mudancas[] = 'custo';
            if (abs($estoqueDepois - $estoqueAntes) > 0.0005) $mudancas[] = 'estoque';
            if ($categoria !== null && mb_strtolower($categoria) !== mb_strtolower((string)$existente['categoria'])) $mudancas[] = 'categoria';
            if ($minimo !== null && abs($minimo - (float)$existente['estoque_minimo']) > 0.0005) $mudancas[] = 'mínimo';
            if ($unidade !== null && $unidade !== $existente['unidade']) $mudancas[] = 'unidade';
            if (!$existente['ativo']) $mudancas[] = 'reativado';
            if ($embDe !== null && ((int)$existente['produto_base_id'] !== (int)($porCodigo[$embDe]['id'] ?? -1) || (float)$existente['fator'] != $fatorEmb)) {
                $mudancas[] = 'engradado';
                if ($existente['produto_base_id'] === null && abs((float)$existente['estoque']) > 0.0005) {
                    $erros[] = 'Produto tem estoque próprio; zere o estoque antes de transformá-lo em engradado';
                }
            }
        }

        if ($erros) $avisos = [];
        $acao = $erros ? 'erro' : ($existente ? ($mudancas ? 'atualizar' : 'igual') : 'novo');

        $plano[] = [
            'linha'          => $num,
            'acao'           => $acao,
            'erros'          => $erros,
            'avisos'         => $avisos,
            'mudancas'       => $mudancas,
            'produto_id'     => $existente ? (int)$existente['id'] : null,
            'codigo'         => $codigo,
            'nome'           => $nome ?? ($existente['nome'] ?? null),
            'categoria'      => $categoria,
            'unidade'        => $unidade,
            'custo'          => $custo,
            'venda'          => $vendaFinal,
            'minimo'         => $minimo,
            'estoque_antes'  => $existente ? $estoqueAntes : null,
            'estoque_depois' => $estoqueDepois,
            'trocar_nome'    => $existente && $nome !== null && $codigo !== null,
            'controla'       => $existente ? null : ($estoque !== null && $embDe === null),
            'emb_de'         => $embDe,
            'emb_fator'      => $fatorEmb,
        ];
    }
    return $plano;
}

function lerPedidoImportacao(): array
{
    $d = Http::body();
    $linhas = $d['linhas'] ?? null;
    if (!is_array($linhas)) throw new HttpError(422, 'Envie as linhas da planilha.');
    $modo = V::enum($d, 'modo_estoque', ['substituir', 'somar', 'ignorar'], 'substituir');
    return [$linhas, $modo];
}

function resumoPlano(array $plano): array
{
    $c = ['novo' => 0, 'atualizar' => 0, 'igual' => 0, 'erro' => 0];
    foreach ($plano as $p) $c[$p['acao']]++;
    return $c;
}

$r->post('/produtos/importar/previa', function () {
    Auth::admin();
    [$linhas, $modo] = lerPedidoImportacao();
    $plano = analisarImportacao($linhas, $modo);
    return ['resumo' => resumoPlano($plano), 'linhas' => $plano];
});

$r->post('/produtos/importar', function () {
    $u = Auth::admin();
    [$linhas, $modo] = lerPedidoImportacao();

    return Db::tx(function () use ($linhas, $modo, $u) {
        $plano = analisarImportacao($linhas, $modo);   // reanalisa dentro da transação
        $cacheCategoria = [];
        $motivo = $modo === 'somar' ? 'Importação de planilha (entrada)' : 'Importação de planilha (contagem)';

        usort($plano, fn($a, $b) => ($a['emb_de'] !== null) <=> ($b['emb_de'] !== null));
        foreach ($plano as $p) {
            if ($p['acao'] === 'erro' || $p['acao'] === 'igual') continue;
            $baseId = $p['emb_de'] !== null ? (int)Db::value('SELECT id FROM produtos WHERE codigo_barras = ?', [$p['emb_de']]) : null;
            if ($p['emb_de'] !== null && !$baseId) continue;

            $catId = null;
            if ($p['categoria'] !== null) {
                $k = mb_strtolower($p['categoria']);
                $catId = $cacheCategoria[$k] ??= categoriaPorNome($p['categoria']);
            }

            if ($p['acao'] === 'novo') {
                $id = Db::insert(
                    'INSERT INTO produtos (codigo_barras, nome, categoria_id, produto_base_id, fator, unidade, preco_custo, preco_venda, estoque_minimo, controla_estoque)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$p['codigo'], $p['nome'], $catId, $baseId, $baseId ? $p['emb_fator'] : null, $p['unidade'] ?? ($baseId ? 'CX' : 'UN'),
                     $baseId ? 0 : ($p['custo'] ?? 0), $p['venda'], $p['minimo'] ?? 0, $p['controla'] ? 1 : 0]
                );
                if (abs($p['estoque_depois']) > 0.0005) {
                    Estoque::mover($id, $p['estoque_depois'], 'importacao', $motivo, $p['custo'], null, (int)$u['id']);
                }
                continue;
            }

            // atualizar: só o que veio preenchido
            $sets = ['ativo = 1'];
            $vals = [];
            if ($p['trocar_nome'])          { $sets[] = 'nome = ?';           $vals[] = $p['nome']; }
            if ($catId !== null)            { $sets[] = 'categoria_id = ?';   $vals[] = $catId; }
            if ($p['unidade'] !== null)     { $sets[] = 'unidade = ?';        $vals[] = $p['unidade']; }
            if ($p['custo'] !== null)       { $sets[] = 'preco_custo = ?';    $vals[] = $p['custo']; }
            if ($p['venda'] !== null)       { $sets[] = 'preco_venda = ?';    $vals[] = $p['venda']; }
            if ($p['minimo'] !== null)      { $sets[] = 'estoque_minimo = ?'; $vals[] = $p['minimo']; }
            if ($baseId)                    { $sets[] = 'produto_base_id = ?, fator = ?, controla_estoque = 0, preco_custo = 0'; $vals[] = $baseId; $vals[] = $p['emb_fator']; }
            $vals[] = $p['produto_id'];
            Db::exec('UPDATE produtos SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);

            $delta = $p['estoque_depois'] - $p['estoque_antes'];
            if (abs($delta) > 0.0005) {
                Estoque::mover($p['produto_id'], $delta, 'importacao', $motivo, $p['custo'], null, (int)$u['id']);
            }
        }
        $resumo = resumoPlano($plano);
        return ['resumo' => $resumo, 'erros' => array_values(array_filter($plano, fn($p) => $p['acao'] === 'erro'))];
    });
});

/** Todos os produtos ativos para exportar (o navegador monta o .xlsx). */
$r->get('/produtos/exportar', function () {
    Auth::admin();
    return array_map(fn($p) => [
        'codigo'    => $p['codigo_barras'],
        'nome'      => $p['nome'],
        'categoria' => $p['categoria'],
        'unidade'   => $p['unidade'],
        'custo'     => $p['produto_base_id'] ? null : (float)$p['preco_custo'],
        'venda'     => (float)$p['preco_venda'],
        'estoque'   => $p['produto_base_id'] ? null : (float)$p['estoque'],
        'minimo'    => $p['produto_base_id'] ? null : (float)$p['estoque_minimo'],
        'embalagem_de'  => $p['base_codigo'],
        'qtd_embalagem' => $p['produto_base_id'] ? (float)$p['fator'] : null,
    ], Db::all(
        'SELECT p.*, c.nome AS categoria, b.codigo_barras AS base_codigo FROM produtos p
         LEFT JOIN categorias c ON c.id = p.categoria_id LEFT JOIN produtos b ON b.id = p.produto_base_id
         WHERE p.ativo = 1 ORDER BY c.ordem, c.nome, p.produto_base_id IS NOT NULL, p.nome'
    ));
});
