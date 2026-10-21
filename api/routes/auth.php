<?php
declare(strict_types=1);

/** @var Router $r */

const LIMITE_FALHAS_LOGIN = 5;    // por login, em 15 min
const LIMITE_FALHAS_IP    = 20;   // por IP, em 15 min

$r->post('/auth/login', function () {
    $d = Http::body();
    $login = mb_strtolower(V::str($d, 'login', 50));
    $senha = (string)($d['senha'] ?? '');
    $ip = Http::ip();

    $falhas = Db::one(
        "SELECT
            SUM(login = ?) AS por_login,
            COUNT(*)       AS por_ip
         FROM tentativas_login
         WHERE sucesso = 0 AND criado_em > NOW() - INTERVAL 15 MINUTE AND (login = ? OR ip = ?)",
        [$login, $login, $ip]
    );
    if ((int)$falhas['por_login'] >= LIMITE_FALHAS_LOGIN || (int)$falhas['por_ip'] >= LIMITE_FALHAS_IP) {
        throw new HttpError(429, 'Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.');
    }

    $u = Db::one('SELECT * FROM usuarios WHERE login = ?', [$login]);
    $ok = $u && $u['ativo'] && password_verify($senha, $u['senha_hash']);

    Db::exec('INSERT INTO tentativas_login (login, ip, sucesso) VALUES (?, ?, ?)', [$login, $ip, $ok ? 1 : 0]);
    // Limpeza ocasional do histórico de tentativas
    if (random_int(1, 50) === 1) Db::exec('DELETE FROM tentativas_login WHERE criado_em < NOW() - INTERVAL 30 DAY');

    if (!$ok) throw new HttpError(401, 'Usuário ou senha incorretos.');

    if (password_needs_rehash($u['senha_hash'], PASSWORD_DEFAULT)) {
        Db::exec('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [password_hash($senha, PASSWORD_DEFAULT), $u['id']]);
    }
    Db::exec('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [$u['id']]);

    return ['token' => Auth::issueToken($u), 'usuario' => Auth::publicUser($u)];
});

$r->get('/auth/me', fn() => ['usuario' => Auth::publicUser(Auth::user(true))]);

$r->post('/auth/trocar-senha', function () {
    $u = Auth::user(true);
    $d = Http::body();
    $atual = (string)($d['senha_atual'] ?? '');
    $nova  = (string)($d['nova_senha'] ?? '');

    $hash = Db::value('SELECT senha_hash FROM usuarios WHERE id = ?', [$u['id']]);
    if (!password_verify($atual, $hash)) throw new HttpError(422, 'Senha atual incorreta.', ['campo' => 'senha_atual']);
    validarNovaSenha($nova);
    if (password_verify($nova, $hash)) throw new HttpError(422, 'A nova senha precisa ser diferente da atual.', ['campo' => 'nova_senha']);

    // Incrementa token_versao: derruba sessões abertas em outros aparelhos
    Db::exec(
        'UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 0, token_versao = token_versao + 1 WHERE id = ?',
        [password_hash($nova, PASSWORD_DEFAULT), $u['id']]
    );
    $u = Db::one('SELECT * FROM usuarios WHERE id = ?', [$u['id']]);
    return ['token' => Auth::issueToken($u), 'usuario' => Auth::publicUser($u)];
});

/** Cada pessoa pode mudar o próprio nome e usuário de login. */
$r->put('/auth/minha-conta', function () {
    $u = Auth::user();
    $d = Http::body();
    $nome  = V::str($d, 'nome', 100, true, 2);
    $login = normalizarLogin((string)($d['login'] ?? $u['login']));
    if (Db::value('SELECT 1 FROM usuarios WHERE login = ? AND id <> ?', [$login, $u['id']])) {
        throw new HttpError(422, 'Já existe um usuário com esse login.', ['campo' => 'login']);
    }
    Db::exec('UPDATE usuarios SET nome = ?, login = ? WHERE id = ?', [$nome, $login, $u['id']]);
    return ['usuario' => Auth::publicUser(Db::one('SELECT * FROM usuarios WHERE id = ?', [$u['id']]))];
});

function validarNovaSenha(string $s): void
{
    if (mb_strlen($s) < 6) throw new HttpError(422, 'A senha precisa ter pelo menos 6 caracteres.', ['campo' => 'nova_senha']);
    if (mb_strlen($s) > 72) throw new HttpError(422, 'Senha muito longa.', ['campo' => 'nova_senha']);
}
