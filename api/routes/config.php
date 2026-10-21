<?php
declare(strict_types=1);

/** @var Router $r */

const CONFIG_PUBLICAS = ['loja_nome', 'loja_subtitulo', 'loja_whatsapp', 'loja_endereco', 'pedidos_online_ativo', 'pedido_minimo'];

function lerConfig(array $chaves): array
{
    $in = implode(',', array_fill(0, count($chaves), '?'));
    $rows = Db::all("SELECT chave, valor FROM configuracoes WHERE chave IN ($in)", $chaves);
    return array_column($rows, 'valor', 'chave');
}

// Pública: usada na tela de login e na página de pedidos
$r->get('/config/publica', fn() => lerConfig(CONFIG_PUBLICAS));

$r->put('/config', function () {
    Auth::admin();
    $d = Http::body();
    foreach (CONFIG_PUBLICAS as $k) {
        if (!array_key_exists($k, $d)) continue;
        $v = mb_substr(trim((string)$d[$k]), 0, 500);
        Db::exec('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [$k, $v]);
    }
    return lerConfig(CONFIG_PUBLICAS);
});

$r->get('/health', fn() => ['ok' => true, 'hora_servidor' => Db::value('SELECT NOW()')]);
