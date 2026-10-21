<?php
declare(strict_types=1);

/**
 * Mensalidade do sistema (ver src/Mensalidade.php).
 * @var Router $r
 */

/** Aviso atual + histórico (administrador da loja). Funcionário não vê. */
$r->get('/mensalidade', function () {
    Auth::admin();
    return ['atual' => Mensalidade::resumoLoja(), 'historico' => Mensalidade::historico(), 'recebedor' => Mensalidade::cfg('recebedor')];
});

/** "Já paguei" — avisa o desenvolvedor por e-mail. */
$r->post('/mensalidade/{id}/paguei', function (int $id) {
    $u = Auth::admin();
    Mensalidade::informarPagamento($id, $u);
    return ['atual' => Mensalidade::resumoLoja()];
});

/** Página simples (HTML) para mostrar resultado aos links do e-mail e à área do desenvolvedor. */
function paginaMensalidade(string $titulo, string $html, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo "<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">
        <meta name=\"robots\" content=\"noindex\"><title>" . htmlspecialchars($titulo) . "</title>
        <style>body{font-family:Arial,sans-serif;background:#f2eee8;color:#24180f;margin:0;padding:24px}
        main{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2dbd0;border-radius:16px;padding:24px}
        h1{font-size:22px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:14px}
        td,th{padding:8px 6px;border-bottom:1px solid #e2dbd0;text-align:left}a.b{display:inline-block;padding:6px 10px;border-radius:6px;color:#fff;text-decoration:none;font-size:13px;margin:2px 0}
        .ok{background:#2e7a4c}.nao{background:#b3261e}.st-paga{color:#2e7a4c;font-weight:bold}.st-aberta{color:#b3261e;font-weight:bold}.st-informada{color:#8a5a00;font-weight:bold}</style></head>
        <body><main><h1>" . htmlspecialchars($titulo) . "</h1>$html</main></body></html>";
    exit;
}

/** Link do e-mail: confirmar recebimento ou "não recebi". Protegido por assinatura (não precisa de login). */
$r->get('/mensalidade/decidir', function () {
    $id = (int)Http::query('id', 0);
    $acao = (string)Http::query('acao', '');
    $t = (string)Http::query('t', '');
    if (!in_array($acao, ['paga', 'aberta'], true) || !Mensalidade::tokenValido($id, $acao, $t)) {
        paginaMensalidade('Link inválido', '<p>Este link não é válido. Use o botão do e-mail mais recente.</p>', 403);
    }
    $m = Mensalidade::decidir($id, $acao);
    $volta = Mensalidade::chaveDev() ? '<p><a href="' . htmlspecialchars(Mensalidade::urlBase() . '/mensalidade/dev?chave=' . urlencode(Mensalidade::chaveDev())) . '">Ver todas as mensalidades</a></p>' : '';
    paginaMensalidade(
        $acao === 'paga' ? 'Recebimento confirmado' : 'Marcado como não recebido',
        $acao === 'paga'
            ? "<p>A mensalidade de <b>{$m['mes']}</b> está paga. O aviso sumiu da tela da loja.</p>$volta"
            : "<p>A mensalidade de <b>{$m['mes']}</b> voltou para <b>em aberto</b>. A loja vê o Pix de novo, com a mensagem de que o pagamento não foi localizado.</p>$volta"
    );
});

/** Área do desenvolvedor: histórico com botões. Precisa da 'desenvolvedor_chave' do config.php. */
$r->get('/mensalidade/dev', function () {
    $chave = Mensalidade::chaveDev();
    if ($chave === null || !hash_equals($chave, (string)Http::query('chave', ''))) {
        paginaMensalidade('Acesso negado', '<p>Chave inválida.</p>', 403);
    }
    $linhas = '';
    $base = Mensalidade::urlBase();
    foreach (Mensalidade::historico() as $m) {
        $st = ['paga' => 'Paga', 'aberta' => 'Em aberto', 'informada' => 'Loja diz que pagou'][$m['status']];
        $botoes = '';
        if ($m['status'] !== 'paga') $botoes .= "<a class=\"b ok\" href=\"$base/mensalidade/decidir?id={$m['id']}&acao=paga&t=" . Mensalidade::token($m['id'], 'paga') . "\">Marcar paga</a> ";
        if ($m['status'] !== 'aberta') $botoes .= "<a class=\"b nao\" href=\"$base/mensalidade/decidir?id={$m['id']}&acao=aberta&t=" . Mensalidade::token($m['id'], 'aberta') . "\">Voltar p/ aberto</a>";
        $quando = $m['paga_em'] ? date('d/m/Y', strtotime($m['paga_em'])) : ($m['informada_em'] ? 'informado ' . date('d/m H:i', strtotime($m['informada_em'])) : ($m['dias_atraso'] ? "{$m['dias_atraso']} dias de atraso" : ''));
        $linhas .= "<tr><td>" . ucfirst($m['mes']) . "</td><td>R$ " . number_format($m['valor'], 2, ',', '.') . "</td><td>" . date('d/m', strtotime($m['vencimento'])) . "</td>
            <td class=\"st-{$m['status']}\">$st<br><small style=\"color:#666;font-weight:normal\">$quando</small></td><td>$botoes</td></tr>";
    }
    paginaMensalidade('Mensalidades do sistema', ($linhas
        ? "<table><tr><th>Mês</th><th>Valor</th><th>Vence</th><th>Situação</th><th></th></tr>$linhas</table>"
        : '<p>Nenhuma mensalidade gerada ainda. A primeira aparece no dia 1º de ' . Mensalidade::nomeMes((string)Mensalidade::cfg('inicio')) . '.</p>')
        . '<p style="color:#666;font-size:13px">Guarde este link só para você.</p>');
});
