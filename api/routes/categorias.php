<?php
declare(strict_types=1);

/** @var Router $r */

function categoriaOut(array $c): array
{
    return [
        'id'             => (int)$c['id'],
        'nome'           => $c['nome'],
        'ordem'          => (int)$c['ordem'],
        'visivel_online' => (bool)$c['visivel_online'],
        'produtos'       => isset($c['produtos']) ? (int)$c['produtos'] : null,
    ];
}

/** Acha a categoria pelo nome (sem diferenciar maiúscula/acento do MySQL) ou cria. */
function categoriaPorNome(string $nome): int
{
    $nome = mb_substr(trim(preg_replace('/\s+/', ' ', $nome)), 0, 80);
    $id = Db::value('SELECT id FROM categorias WHERE nome = ?', [$nome]);
    if ($id) {
        Db::exec('UPDATE categorias SET ativo = 1 WHERE id = ?', [$id]);
        return (int)$id;
    }
    $ordem = (int)Db::value('SELECT COALESCE(MAX(ordem), 0) + 1 FROM categorias');
    return Db::insert('INSERT INTO categorias (nome, ordem) VALUES (?, ?)', [$nome, $ordem]);
}

$r->get('/categorias', function () {
    Auth::user();
    $rows = Db::all(
        'SELECT c.*, (SELECT COUNT(*) FROM produtos p WHERE p.categoria_id = c.id AND p.ativo = 1) AS produtos
         FROM categorias c WHERE c.ativo = 1 ORDER BY c.ordem, c.nome'
    );
    return array_map('categoriaOut', $rows);
});

$r->post('/categorias', function () {
    Auth::admin();
    $nome = V::str(Http::body(), 'nome', 80, true, 2);
    $existe = Db::one('SELECT id, ativo FROM categorias WHERE nome = ?', [$nome]);
    if ($existe && $existe['ativo']) throw new HttpError(422, 'Já existe uma categoria com esse nome.', ['campo' => 'nome']);
    $id = categoriaPorNome($nome);
    return categoriaOut(Db::one('SELECT * FROM categorias WHERE id = ?', [$id]));
});

$r->put('/categorias/{id}', function (int $id) {
    Auth::admin();
    $c = Db::one('SELECT * FROM categorias WHERE id = ?', [$id]) ?? throw new HttpError(404, 'Categoria não encontrada.');
    $d = Http::body();
    $nome = V::str($d, 'nome', 80, true, 2);
    if (Db::value('SELECT 1 FROM categorias WHERE nome = ? AND id <> ?', [$nome, $id])) {
        throw new HttpError(422, 'Já existe uma categoria com esse nome.', ['campo' => 'nome']);
    }
    $ordem = isset($d['ordem']) ? (int)$d['ordem'] : (int)$c['ordem'];
    $online = V::bool($d, 'visivel_online', (bool)$c['visivel_online']);
    Db::exec('UPDATE categorias SET nome = ?, ordem = ?, visivel_online = ? WHERE id = ?', [$nome, $ordem, $online, $id]);
    return categoriaOut(Db::one('SELECT * FROM categorias WHERE id = ?', [$id]));
});

$r->delete('/categorias/{id}', function (int $id) {
    Auth::admin();
    $n = (int)Db::value('SELECT COUNT(*) FROM produtos WHERE categoria_id = ? AND ativo = 1', [$id]);
    if ($n > 0) throw new HttpError(422, "Essa categoria tem $n produto(s). Mude-os de categoria antes de excluir.");
    Db::exec('UPDATE produtos SET categoria_id = NULL WHERE categoria_id = ?', [$id]);
    Db::exec('DELETE FROM categorias WHERE id = ?', [$id]);
    return ['ok' => true];
});
