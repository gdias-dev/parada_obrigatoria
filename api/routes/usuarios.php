<?php
declare(strict_types=1);

/** @var Router $r */

function usuarioOut(array $u): array
{
    return [
        'id'                   => (int)$u['id'],
        'nome'                 => $u['nome'],
        'login'                => $u['login'],
        'perfil'               => $u['perfil'],
        'ativo'                => (bool)$u['ativo'],
        'precisa_trocar_senha' => (bool)$u['precisa_trocar_senha'],
        'ultimo_acesso'        => $u['ultimo_acesso'],
        'criado_em'            => $u['criado_em'],
    ];
}

function normalizarLogin(string $login): string
{
    $login = mb_strtolower(trim($login));
    if (!preg_match('/^[a-z0-9._-]{3,50}$/', $login)) {
        throw new HttpError(422, 'Login deve ter de 3 a 50 caracteres: letras sem acento, números, ponto, hífen ou _.', ['campo' => 'login']);
    }
    return $login;
}

function garantirOutroAdminAtivo(int $exceptoId): void
{
    $n = (int)Db::value("SELECT COUNT(*) FROM usuarios WHERE perfil = 'admin' AND ativo = 1 AND id <> ?", [$exceptoId]);
    if ($n === 0) throw new HttpError(422, 'O sistema precisa ter pelo menos um administrador ativo.');
}

$r->get('/usuarios', function () {
    Auth::admin();
    return array_map('usuarioOut', Db::all('SELECT * FROM usuarios ORDER BY ativo DESC, perfil, nome'));
});

$r->post('/usuarios', function () {
    Auth::admin();
    $d = Http::body();
    $nome   = V::str($d, 'nome', 100, true, 2);
    $login  = normalizarLogin((string)($d['login'] ?? ''));
    $perfil = V::enum($d, 'perfil', ['admin', 'funcionario'], 'funcionario');
    $senha  = (string)($d['senha'] ?? '');
    validarNovaSenha($senha);

    if (Db::value('SELECT 1 FROM usuarios WHERE login = ?', [$login])) {
        throw new HttpError(422, 'Já existe um usuário com esse login.', ['campo' => 'login']);
    }
    // A pessoa troca a senha provisória no primeiro acesso
    $id = Db::insert(
        'INSERT INTO usuarios (nome, login, senha_hash, perfil, precisa_trocar_senha) VALUES (?, ?, ?, ?, 1)',
        [$nome, $login, password_hash($senha, PASSWORD_DEFAULT), $perfil]
    );
    return usuarioOut(Db::one('SELECT * FROM usuarios WHERE id = ?', [$id]));
});

$r->put('/usuarios/{id}', function (int $id) {
    $eu = Auth::admin();
    $u = Db::one('SELECT * FROM usuarios WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Usuário não encontrado.');
    $d = Http::body();

    $nome   = V::str($d, 'nome', 100, true, 2);
    $login  = normalizarLogin((string)($d['login'] ?? $u['login']));
    $perfil = V::enum($d, 'perfil', ['admin', 'funcionario'], $u['perfil']);
    $ativo  = V::bool($d, 'ativo', (bool)$u['ativo']);

    if ((int)$eu['id'] === $id && ($perfil !== 'admin' || !$ativo)) {
        throw new HttpError(422, 'Você não pode remover o próprio acesso de administrador.');
    }
    if ($u['perfil'] === 'admin' && $u['ativo'] && ($perfil !== 'admin' || !$ativo)) {
        garantirOutroAdminAtivo($id);
    }
    if (Db::value('SELECT 1 FROM usuarios WHERE login = ? AND id <> ?', [$login, $id])) {
        throw new HttpError(422, 'Já existe um usuário com esse login.', ['campo' => 'login']);
    }

    // Mudou perfil ou desativou: encerra as sessões abertas dessa pessoa
    $derrubar = ($perfil !== $u['perfil'] || (!$ativo && $u['ativo'])) ? 1 : 0;
    Db::exec(
        'UPDATE usuarios SET nome = ?, login = ?, perfil = ?, ativo = ?, token_versao = token_versao + ? WHERE id = ?',
        [$nome, $login, $perfil, $ativo, $derrubar, $id]
    );
    return usuarioOut(Db::one('SELECT * FROM usuarios WHERE id = ?', [$id]));
});

/** Admin redefine a senha (ex.: funcionário esqueceu). Vira senha provisória. */
$r->post('/usuarios/{id}/redefinir-senha', function (int $id) {
    Auth::admin();
    if (!Db::value('SELECT 1 FROM usuarios WHERE id = ?', [$id])) throw new HttpError(404, 'Usuário não encontrado.');
    $senha = (string)(Http::body()['senha'] ?? '');
    validarNovaSenha($senha);
    Db::exec(
        'UPDATE usuarios SET senha_hash = ?, precisa_trocar_senha = 1, token_versao = token_versao + 1 WHERE id = ?',
        [password_hash($senha, PASSWORD_DEFAULT), $id]
    );
    return ['ok' => true];
});
