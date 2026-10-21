<?php
declare(strict_types=1);

/**
 * Painel do início, backup do banco e informações do sistema.
 * @var Router $r
 */

const VERSAO_SISTEMA = '1.1.0';

/** Resumo do dia para a tela inicial. Funcionário não recebe valores de lucro nem faturamento. */
$r->get('/painel', function () {
    $u = Auth::user();
    $admin = Auth::isAdmin();
    $hoje = date('Y-m-d');
    $ini = "$hoje 00:00:00";
    $fim = "$hoje 23:59:59";

    $out = [
        'vendas_hoje' => (int)Db::value("SELECT COUNT(*) FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ?", [$ini, $fim]),
        'comandas' => array_map(fn($c) => ['id' => (int)$c['id'], 'nome' => $c['nome_cliente'], 'total' => (float)$c['total'], 'aberta_em' => $c['aberta_em']],
            Db::all("SELECT c.id, c.nome_cliente, c.aberta_em,
                            COALESCE((SELECT SUM(i.quantidade * i.preco_unitario) FROM comanda_itens i WHERE i.comanda_id = c.id AND i.cancelado = 0), 0) AS total
                     FROM comandas c WHERE c.status = 'aberta' ORDER BY c.aberta_em")),
        'pedidos' => array_map('intval', Db::one("SELECT COALESCE(SUM(status = 'novo'),0) AS novos, COALESCE(SUM(status IN ('aceito','pronto','saiu_entrega')),0) AS andamento FROM pedidos_online")),
        'estoque_baixo' => array_map(fn($p) => ['id' => (int)$p['id'], 'nome' => $p['nome'], 'estoque' => (float)$p['estoque'], 'minimo' => (float)$p['estoque_minimo'], 'unidade' => $p['unidade']],
            Db::all('SELECT id, nome, estoque, estoque_minimo, unidade FROM produtos
                     WHERE ativo = 1 AND controla_estoque = 1 AND produto_base_id IS NULL AND estoque <= estoque_minimo
                     ORDER BY (estoque <= 0) DESC, estoque - estoque_minimo, nome LIMIT 8')),
        'estoque_baixo_total' => (int)Db::value('SELECT COUNT(*) FROM produtos WHERE ativo = 1 AND controla_estoque = 1 AND produto_base_id IS NULL AND estoque <= estoque_minimo'),
    ];

    if ($admin) {
        $v = Db::one("SELECT COALESCE(SUM(total),0) AS fat, COALESCE(SUM(total - valor_cascos - custo_total - taxa_maquininha_total),0) AS lucro
                      FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ?", [$ini, $fim]);
        $repasse = (float)Db::value("SELECT COALESCE(SUM(valor_entregador),0) FROM entregas WHERE status = 'entregue' AND entregue_em BETWEEN ? AND ?", [$ini, $fim]);
        $ontem = date('Y-m-d', strtotime('-1 day'));
        $out['faturamento_hoje'] = round((float)$v['fat'], 2);
        $out['lucro_hoje'] = round((float)$v['lucro'] - $repasse, 2);
        $out['faturamento_ontem'] = round((float)Db::value("SELECT COALESCE(SUM(total),0) FROM vendas WHERE status = 'concluida' AND criado_em BETWEEN ? AND ?", ["$ontem 00:00:00", "$ontem 23:59:59"]), 2);
        $out['fiado_a_receber'] = round((float)Db::value('SELECT COALESCE(SUM(saldo_fiado),0) FROM clientes WHERE saldo_fiado > 0'), 2);
        $out['entregadores_a_pagar'] = round((float)Db::value("SELECT COALESCE(SUM(valor_entregador),0) FROM entregas WHERE status = 'entregue' AND pago_entregador = 0"), 2);
        $out['sem_custo'] = (int)Db::value('SELECT COUNT(*) FROM produtos WHERE ativo = 1 AND produto_base_id IS NULL AND preco_custo <= 0');
        $ultimo = lerConfig(['ultimo_backup'])['ultimo_backup'] ?? null;
        $out['ultimo_backup'] = $ultimo ?: null;
        $out['backup_atrasado'] = !$ultimo || strtotime($ultimo) < strtotime('-7 days');
        try { $out['mensalidade'] = Mensalidade::resumoLoja(); } catch (Throwable $e) { error_log('[parada] mensalidade: ' . $e->getMessage()); $out['mensalidade'] = null; }
    }
    return $out;
});

$r->get('/sistema/info', function () {
    Auth::admin();
    $cfg = lerConfig(['versao_banco', 'ultimo_backup']);
    $contagens = [];
    foreach (['produtos', 'clientes', 'vendas', 'comandas', 'pedidos_online', 'usuarios'] as $t) {
        $contagens[$t] = (int)Db::value("SELECT COUNT(*) FROM `$t`");
    }
    return [
        'versao_sistema' => VERSAO_SISTEMA,
        'versao_banco' => (int)($cfg['versao_banco'] ?? 1),
        'versao_banco_esperada' => 6,
        'php' => PHP_VERSION,
        'mysql' => (string)Db::value('SELECT VERSION()'),
        'ultimo_backup' => $cfg['ultimo_backup'] ?? null,
        'contagens' => $contagens,
        'hora_servidor' => date('Y-m-d H:i:s'),
    ];
});

/**
 * Backup completo do banco em .sql (pode ser importado de volta pelo phpMyAdmin).
 * Gera o arquivo aos poucos para não estourar a memória da hospedagem.
 */
$r->get('/backup', function () {
    $u = Auth::admin();
    @set_time_limit(300);
    $pdo = Db::pdo();
    $nomes = array_map(fn($t) => array_values($t)[0], Db::all("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"));
    $agora = date('Y-m-d H:i:s');

    Db::exec("INSERT INTO configuracoes (chave, valor) VALUES ('ultimo_backup', ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [$agora]);

    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/sql; charset=utf-8');
    header('Content-Disposition: attachment; filename="backup-parada-' . date('Y-m-d-Hi') . '.sql"');
    header('Cache-Control: no-store');

    echo "-- Backup do sistema Parada Obrigatória\n-- Gerado em $agora por {$u['login']}\n";
    echo "-- Para restaurar: phpMyAdmin > selecione o banco > Importar > este arquivo.\n";
    echo "-- ATENÇÃO: restaurar APAGA os dados atuais e volta tudo para o momento deste backup.\n\n";
    echo "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\nSET time_zone = '-03:00';\n\n";

    foreach ($nomes as $t) {
        $create = Db::one("SHOW CREATE TABLE `$t`");
        echo "-- ----------------------------\n-- $t\n-- ----------------------------\n";
        echo "DROP TABLE IF EXISTS `$t`;\n" . array_values($create)[1] . ";\n\n";

        if ($t === 'tentativas_login') continue; // só a estrutura: tentativas de login não precisam de backup
        $st = $pdo->query("SELECT * FROM `$t`");
        $lote = [];
        $colunas = null;
        while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
            $colunas ??= '`' . implode('`, `', array_keys($row)) . '`';
            $lote[] = '(' . implode(', ', array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), $row)) . ')';
            if (count($lote) >= 200) {
                echo "INSERT INTO `$t` ($colunas) VALUES\n" . implode(",\n", $lote) . ";\n";
                $lote = [];
            }
        }
        if ($lote) echo "INSERT INTO `$t` ($colunas) VALUES\n" . implode(",\n", $lote) . ";\n";
        echo "\n";
        flush();
    }
    echo "SET FOREIGN_KEY_CHECKS = 1;\n-- fim do backup\n";
    exit;
});
