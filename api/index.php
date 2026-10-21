<?php
declare(strict_types=1);

/**
 * Parada Obrigatória — API
 * Todas as requisições /api/* chegam aqui (ver .htaccess).
 */

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erro' => 'config.php não encontrado. Copie config.example.php para config.php.']);
    exit;
}
$config = require $configFile;

require __DIR__ . '/src/Http.php';
require __DIR__ . '/src/Core.php';
require __DIR__ . '/src/Estoque.php';
require __DIR__ . '/src/Vendas.php';
require __DIR__ . '/src/Fiado.php';

date_default_timezone_set($config['timezone'] ?? 'America/Sao_Paulo');
mb_internal_encoding('UTF-8');
ini_set('display_errors', '0');

header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
Http::cors($config['cors_origins'] ?? []);

try {
    Db::init($config['db']);
    Auth::init($config);

    // Caminho depois de /api — funciona em /api/..., /sistema/api/... ou com o servidor do PHP
    $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = preg_replace('#^.*?/api(?=/|$)#', '', $uri);
    $path = '/' . trim($path, '/');

    $r = new Router();
    foreach (glob(__DIR__ . '/routes/*.php') as $file) require $file;

    $r->dispatch($_SERVER['REQUEST_METHOD'] ?? 'GET', $path);
} catch (HttpError $e) {
    Http::json(['erro' => $e->getMessage()] + $e->extra, $e->status);
} catch (PDOException $e) {
    error_log('[parada] ' . $e->getMessage());
    // Violação de UNIQUE (ex.: código de barras repetido)
    if ($e->getCode() === '23000' && str_contains($e->getMessage(), 'Duplicate')) {
        Http::json(['erro' => 'Registro duplicado.'], 422);
    }
    Http::json(['erro' => 'Erro no banco de dados.'] + (!empty($config['debug']) ? ['detalhe' => $e->getMessage()] : []), 500);
} catch (Throwable $e) {
    error_log('[parada] ' . $e);
    Http::json(['erro' => 'Erro interno.'] + (!empty($config['debug']) ? ['detalhe' => $e->getMessage()] : []), 500);
}
