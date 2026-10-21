<?php
declare(strict_types=1);

/**
 * Mensalidade do sistema (cobrança do desenvolvedor para a loja).
 *
 * - Todo mês, a partir do dia 1, aparece para o administrador da loja um aviso com o Pix (QR Code e copia e cola).
 * - Vence no dia 8. A loja paga e toca em "Já paguei": o mês fica pago e o aviso some.
 * - Depois do vencimento, o aviso fica vermelho. O sistema NUNCA trava.
 * - Opcional: com o bloco 'email' no config.php, o desenvolvedor recebe e-mail de "já paguei" e de atraso;
 *   com 'desenvolvedor_chave', tem uma página com o histórico para desfazer um "já paguei" que não caiu.
 *
 * Os dados abaixo podem ser trocados no config.php (chave 'mensalidade'), sem mexer no código.
 */
final class Mensalidade
{
    private const PADRAO = [
        'ativa'          => true,
        'valor'          => 100.00,
        'dia_vencimento' => 8,
        'inicio'         => '2026-11',                 // primeira cobrança: novembro/2026
        'pix_chave'      => '68914237000111',          // CNPJ
        'pix_nome'       => 'NASCTECH SERV INFORMATICA', // até 25 letras (padrão do Pix)
        'pix_cidade'     => 'RIO DE JANEIRO',          // até 15 letras
        'recebedor'      => 'Nasctech Serviços de Informática LTDA',
        'email_dev'      => 'companynastech@gmail.com',
    ];

    private static array $cfg = [];
    private static array $email = [];
    private static string $segredo = '';
    private static ?string $chaveDev = null;
    private static bool $tabelaOk = false;

    public static function init(array $config): void
    {
        self::$cfg = array_merge(self::PADRAO, $config['mensalidade'] ?? []);
        self::$email = $config['email'] ?? [];
        self::$segredo = (string)($config['jwt_secret'] ?? '');
        self::$chaveDev = !empty($config['desenvolvedor_chave']) ? (string)$config['desenvolvedor_chave'] : null;
    }

    public static function cfg(string $k): mixed { return self::$cfg[$k] ?? null; }
    public static function chaveDev(): ?string { return self::$chaveDev; }

    /** Cria a tabela na primeira vez (não precisa importar SQL). */
    private static function tabela(): void
    {
        if (self::$tabelaOk) return;
        Db::exec("CREATE TABLE IF NOT EXISTS mensalidades (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            competencia CHAR(7) NOT NULL,
            valor DECIMAL(10,2) NOT NULL,
            vencimento DATE NOT NULL,
            status ENUM('aberta','informada','paga') NOT NULL DEFAULT 'aberta',
            informada_em DATETIME NULL,
            informada_por INT UNSIGNED NULL,
            paga_em DATETIME NULL,
            aviso_atraso_em DATETIME NULL,
            observacao VARCHAR(255) NULL,
            criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_competencia (competencia)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        self::$tabelaOk = true;
    }

    /** Garante uma linha para cada mês já começado, desde o início combinado. */
    public static function garantir(?string $hoje = null): void
    {
        self::tabela();
        if (!self::$cfg['ativa']) return;
        $hoje ??= date('Y-m-d');
        $mes = (string)self::$cfg['inicio'];
        $atual = substr($hoje, 0, 7);
        $dia = max(1, min(28, (int)self::$cfg['dia_vencimento']));
        for ($i = 0; $mes <= $atual && $i < 120; $i++) {
            Db::exec('INSERT IGNORE INTO mensalidades (competencia, valor, vencimento) VALUES (?, ?, ?)',
                [$mes, (float)self::$cfg['valor'], sprintf('%s-%02d', $mes, $dia)]);
            $mes = date('Y-m', strtotime("$mes-01 +1 month"));
        }
    }

    public static function nomeMes(string $competencia): string
    {
        $meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
        return $meses[(int)substr($competencia, 5, 2) - 1] . ' de ' . substr($competencia, 0, 4);
    }

    public static function saida(array $m, ?string $hoje = null): array
    {
        $hoje ??= date('Y-m-d');
        $atraso = $m['status'] !== 'paga' && $hoje > $m['vencimento'] ? (int)((strtotime($hoje) - strtotime($m['vencimento'])) / 86400) : 0;
        return [
            'id' => (int)$m['id'],
            'competencia' => $m['competencia'],
            'mes' => self::nomeMes($m['competencia']),
            'valor' => (float)$m['valor'],
            'vencimento' => $m['vencimento'],
            'status' => $m['status'],
            'dias_atraso' => $atraso,
            'informada_em' => $m['informada_em'],
            'paga_em' => $m['paga_em'],
            'observacao' => $m['observacao'],
        ];
    }

    /** O que a tela do administrador da loja mostra (null = nada a pagar). Também dispara o e-mail de atraso. */
    public static function resumoLoja(?string $hoje = null): ?array
    {
        if (!self::$cfg['ativa']) return null;
        self::garantir($hoje);
        $hoje ??= date('Y-m-d');
        $pendentes = Db::all("SELECT * FROM mensalidades WHERE status <> 'paga' ORDER BY competencia");
        if (!$pendentes) return null;

        foreach ($pendentes as $m) {
            if ($m['status'] === 'aberta' && $hoje > $m['vencimento'] && !$m['aviso_atraso_em']) {
                // marca antes de enviar: nunca manda o mesmo aviso duas vezes
                if (Db::exec('UPDATE mensalidades SET aviso_atraso_em = NOW() WHERE id = ? AND aviso_atraso_em IS NULL', [$m['id']])) {
                    self::emailAtraso($m);
                }
            }
        }

        $abertas = array_values(array_filter($pendentes, fn($m) => $m['status'] === 'aberta'));
        $alvo = $abertas[0] ?? $pendentes[0];
        $out = self::saida($alvo, $hoje);
        $out['em_aberto'] = count($abertas);
        $out['aguardando'] = array_values(array_map(fn($m) => self::saida($m, $hoje), array_filter($pendentes, fn($m) => $m['status'] === 'informada')));
        $out['total_em_aberto'] = round(array_sum(array_map(fn($m) => (float)$m['valor'], $abertas)), 2);
        $out['recebedor'] = self::$cfg['recebedor'];
        $out['pix_chave'] = self::$cfg['pix_chave'];
        $out['pix_copia_cola'] = self::pix((float)$alvo['valor'], 'PARADA' . str_replace('-', '', $alvo['competencia']));
        return $out;
    }

    public static function informarPagamento(int $id, array $usuario): array
    {
        self::tabela();
        $m = Db::one('SELECT * FROM mensalidades WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Mensalidade não encontrada.');
        if ($m['status'] === 'paga') throw new HttpError(409, 'Esta mensalidade já está paga.');
        if ($m['status'] === 'aberta') {
            Db::exec("UPDATE mensalidades SET status = 'paga', informada_em = NOW(), informada_por = ?, paga_em = NOW(), observacao = NULL WHERE id = ?", [$usuario['id'], $id]);
            $m = Db::one('SELECT * FROM mensalidades WHERE id = ?', [$id]);
            self::emailInformada($m, $usuario);
        }
        return self::saida($m);
    }

    /** acao: 'paga' (confirmou) ou 'aberta' (não recebeu). */
    public static function decidir(int $id, string $acao): array
    {
        self::tabela();
        $m = Db::one('SELECT * FROM mensalidades WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Mensalidade não encontrada.');
        if ($acao === 'paga') {
            Db::exec("UPDATE mensalidades SET status = 'paga', paga_em = COALESCE(paga_em, NOW()), observacao = NULL WHERE id = ?", [$id]);
        } else {
            Db::exec("UPDATE mensalidades SET status = 'aberta', paga_em = NULL, informada_em = NULL, informada_por = NULL,
                      observacao = 'O pagamento informado não foi localizado. Confira o comprovante e pague de novo pelo Pix abaixo, se for o caso.' WHERE id = ?", [$id]);
        }
        return self::saida(Db::one('SELECT * FROM mensalidades WHERE id = ?', [$id]));
    }

    public static function historico(): array
    {
        self::garantir();
        return array_map(fn($m) => self::saida($m), Db::all('SELECT * FROM mensalidades ORDER BY competencia DESC LIMIT 36'));
    }

    // ------------------------------------------------------------------ Pix (padrão BR Code do Banco Central)

    private static function campo(string $id, string $valor): string
    {
        return $id . str_pad((string)strlen($valor), 2, '0', STR_PAD_LEFT) . $valor;
    }

    private static function semAcento(string $s, int $max): string
    {
        $s = strtoupper(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s);
        return substr(trim(preg_replace('/[^A-Z0-9 ]/', '', $s)), 0, $max);
    }

    public static function crc16(string $dados): string
    {
        $crc = 0xFFFF;
        for ($i = 0, $n = strlen($dados); $i < $n; $i++) {
            $crc ^= ord($dados[$i]) << 8;
            for ($b = 0; $b < 8; $b++) {
                $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
                $crc &= 0xFFFF;
            }
        }
        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }

    /** Pix copia e cola com valor fixo e identificador do mês (aparece no extrato de quem recebe). */
    public static function pix(float $valor, string $txid): string
    {
        $conta = self::campo('00', 'br.gov.bcb.pix') . self::campo('01', (string)self::$cfg['pix_chave']);
        $txid = substr(preg_replace('/[^A-Za-z0-9]/', '', $txid), 0, 25) ?: '***';
        $p = self::campo('00', '01')
            . self::campo('26', $conta)
            . self::campo('52', '0000')
            . self::campo('53', '986')
            . self::campo('54', number_format($valor, 2, '.', ''))
            . self::campo('58', 'BR')
            . self::campo('59', self::semAcento((string)self::$cfg['pix_nome'], 25))
            . self::campo('60', self::semAcento((string)self::$cfg['pix_cidade'], 15))
            . self::campo('62', self::campo('05', $txid))
            . '6304';
        return $p . self::crc16($p);
    }

    // ------------------------------------------------------------------ links assinados e e-mails

    public static function token(int $id, string $acao): string
    {
        return substr(hash_hmac('sha256', "mensalidade|$id|$acao", self::$segredo), 0, 32);
    }

    public static function tokenValido(int $id, string $acao, string $t): bool
    {
        return self::$segredo !== '' && hash_equals(self::token($id, $acao), $t);
    }

    public static function urlBase(): string
    {
        $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        $host = preg_replace('/[^A-Za-z0-9.:\-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $prefixo = preg_match('#^(.*?)/api(/|$)#', $uri, $m) ? $m[1] : '';
        return ($https ? 'https' : 'http') . "://$host$prefixo/api";
    }

    private static function link(int $id, string $acao): string
    {
        return self::urlBase() . "/mensalidade/decidir?id=$id&acao=$acao&t=" . self::token($id, $acao);
    }

    private static function nomeLoja(): string
    {
        return (string)(Db::value("SELECT valor FROM configuracoes WHERE chave = 'loja_nome'") ?: 'Parada Obrigatória');
    }

    private static function emailInformada(array $m, array $u): void
    {
        $loja = htmlspecialchars(self::nomeLoja());
        $mes = self::nomeMes($m['competencia']);
        $valor = 'R$ ' . number_format((float)$m['valor'], 2, ',', '.');
        $quem = htmlspecialchars($u['nome'] ?? 'Administrador');
        $nao = self::link((int)$m['id'], 'aberta');
        self::enviar("[$loja] Pagamento informado — mensalidade de $mes", "
            <p><b>$quem</b> informou o pagamento da mensalidade de <b>$mes</b> ($valor) às " . date('H:i \d\e d/m/Y') . ".</p>
            <p>O mês já aparece como pago para a loja. Confira no seu banco se o Pix de $valor caiu (identificador <b>PARADA" . str_replace('-', '', $m['competencia']) . "</b>).</p>
            <p>Se não caiu: <a href=\"$nao\" style=\"display:inline-block;background:#b3261e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold\">Não recebi — voltar o aviso para a loja</a></p>");
    }

    private static function emailAtraso(array $m): void
    {
        $loja = htmlspecialchars(self::nomeLoja());
        $mes = self::nomeMes($m['competencia']);
        $valor = 'R$ ' . number_format((float)$m['valor'], 2, ',', '.');
        $venc = date('d/m/Y', strtotime($m['vencimento']));
        $ok = self::link((int)$m['id'], 'paga');
        self::enviar("[$loja] Mensalidade de $mes em atraso", "
            <p>A mensalidade de <b>$mes</b> ($valor) do sistema da <b>$loja</b> venceu em <b>$venc</b> e ainda não foi informada como paga.</p>
            <p>A loja continua vendo o aviso com o Pix na tela inicial. O sistema não é bloqueado.</p>
            <p>Se ela pagou por fora (dinheiro, outro Pix), registre aqui:
               <a href=\"$ok\" style=\"display:inline-block;background:#2e7a4c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold\">Marcar como paga</a></p>");
    }

    /** Envia pelo SMTP do config.php (recomendado) ou pelo mail() da hospedagem. Nunca derruba a requisição. */
    public static function enviar(string $assunto, string $html, ?string $para = null): bool
    {
        $para ??= (string)self::$cfg['email_dev'];
        $corpo = "<div style=\"font-family:Arial,sans-serif;font-size:15px;color:#24180f;max-width:560px\">$html
            <hr style=\"border:0;border-top:1px solid #ddd\"><p style=\"color:#999;font-size:12px\">Aviso automático do sistema da loja.</p></div>";
        $smtp = self::$email['smtp'] ?? null;
        if (!$smtp && empty(self::$email['usar_mail'])) return false;   // e-mail é opcional: sem configuração, não envia nada
        try {
            $ok = $smtp ? Email::smtp($smtp, $para, $assunto, $corpo)
                        : Email::mail((string)(self::$email['remetente'] ?? ''), $para, $assunto, $corpo);
            if (!$ok) error_log('[parada] e-mail da mensalidade não enviado: ' . $assunto);
            return $ok;
        } catch (Throwable $e) {
            error_log('[parada] erro no e-mail da mensalidade: ' . $e->getMessage());
            return false;
        }
    }
}

/** Envio de e-mail sem bibliotecas: SMTP com SSL/STARTTLS + AUTH LOGIN (Gmail, KingHost etc.) ou mail(). */
final class Email
{
    private static function cabecalhoAssunto(string $s): string
    {
        return '=?UTF-8?B?' . base64_encode($s) . '?=';
    }

    public static function mail(string $de, string $para, string $assunto, string $html): bool
    {
        if (!function_exists('mail')) return false;
        $h = "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n" . ($de ? "From: $de\r\n" : '');
        return @mail($para, self::cabecalhoAssunto($assunto), $html, $h);
    }

    public static function smtp(array $c, string $para, string $assunto, string $html): bool
    {
        $host = (string)$c['host'];
        $porta = (int)($c['porta'] ?? 465);
        $seg = (string)($c['seguranca'] ?? ($porta === 465 ? 'ssl' : 'tls'));
        $usuario = (string)$c['usuario'];
        $de = (string)($c['remetente'] ?? $usuario);
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
        $s = @stream_socket_client(($seg === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$porta", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$s) throw new RuntimeException("SMTP: não conectou ($errstr)");
        stream_set_timeout($s, 15);
        $ler = function () use ($s): string {
            $r = '';
            while (($l = fgets($s, 515)) !== false) { $r .= $l; if (isset($l[3]) && $l[3] === ' ') break; }
            return $r;
        };
        $cmd = function (string $c, array $esperado) use ($s, $ler): string {
            if ($c !== '') fwrite($s, $c . "\r\n");
            $r = $ler();
            if (!in_array((int)substr($r, 0, 3), $esperado, true)) throw new RuntimeException('SMTP: ' . trim($r));
            return $r;
        };
        $cmd('', [220]);
        $cmd('EHLO parada', [250]);
        if ($seg === 'tls') {   // 'nenhuma' = sem criptografia (só para testes locais)
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException('SMTP: falha no TLS');
            $cmd('EHLO parada', [250]);
        }
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($usuario), [334]);
        $cmd(base64_encode((string)$c['senha']), [235]);
        $cmd("MAIL FROM:<$de>", [250]);
        $cmd("RCPT TO:<$para>", [250, 251]);
        $cmd('DATA', [354]);
        $msg = "From: Sistema da loja <$de>\r\nTo: <$para>\r\nSubject: " . self::cabecalhoAssunto($assunto)
            . "\r\nDate: " . date('r') . "\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . chunk_split(base64_encode($html));
        $cmd($msg . "\r\n.", [250]);
        @fwrite($s, "QUIT\r\n");
        fclose($s);
        return true;
    }
}
