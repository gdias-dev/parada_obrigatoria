<?php
declare(strict_types=1);

/** Erro que vira resposta JSON com o status HTTP certo. */
final class HttpError extends RuntimeException
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

final class Http
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
        exit;
    }

    /** Corpo da requisição em JSON. */
    public static function body(): array
    {
        static $body = null;
        if ($body !== null) return $body;
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') return $body = [];
        $data = json_decode($raw, true);
        if (!is_array($data)) throw new HttpError(400, 'JSON inválido.');
        return $body = $data;
    }

    public static function query(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    public static function ip(): string
    {
        return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
    }

    /** Header Authorization — a KingHost (Apache/CGI) às vezes o entrega em variáveis diferentes. */
    public static function bearerToken(): ?string
    {
        $h = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? null) : null)
            ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? null;
        if (!$h) return null;
        if (stripos($h, 'Bearer ') === 0) $h = substr($h, 7);
        return trim($h) ?: null;
    }

    public static function cors(array $allowed): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origin && in_array($origin, $allowed, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Vary: Origin');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Access-Control-Max-Age: 86400');
        }
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}

/** Validação simples dos dados de entrada. */
final class V
{
    public static function str(array $d, string $k, int $max, bool $required = true, int $min = 0): ?string
    {
        $v = isset($d[$k]) ? trim((string)$d[$k]) : '';
        if ($v === '') {
            if ($required) throw new HttpError(422, "Campo obrigatório: $k", ['campo' => $k]);
            return null;
        }
        if (mb_strlen($v) > $max) throw new HttpError(422, "Campo $k muito longo (máx. $max).", ['campo' => $k]);
        if (mb_strlen($v) < $min) throw new HttpError(422, "Campo $k muito curto (mín. $min).", ['campo' => $k]);
        return $v;
    }

    public static function enum(array $d, string $k, array $options, ?string $default = null): string
    {
        $v = $d[$k] ?? $default;
        if (!in_array($v, $options, true)) throw new HttpError(422, "Valor inválido para $k.", ['campo' => $k]);
        return $v;
    }

    public static function bool(array $d, string $k, bool $default = false): int
    {
        if (!array_key_exists($k, $d)) return $default ? 1 : 0;
        return filter_var($d[$k], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    }

    /** Aceita "12,50", "12.50", 12.5 e "1.234,56". */
    public static function money(array $d, string $k, bool $required = true, float $min = 0): ?float
    {
        if (!isset($d[$k]) || $d[$k] === '' || $d[$k] === null) {
            if ($required) throw new HttpError(422, "Campo obrigatório: $k", ['campo' => $k]);
            return null;
        }
        $n = self::parseNumber($d[$k]);
        if ($n === null) throw new HttpError(422, "Número inválido em $k.", ['campo' => $k]);
        if ($n < $min) throw new HttpError(422, "Valor de $k não pode ser menor que $min.", ['campo' => $k]);
        return round($n, 2);
    }

    public static function parseNumber(mixed $v): ?float
    {
        if (is_int($v) || is_float($v)) return (float)$v;
        $s = preg_replace('/[^\d,.\-]/', '', (string)$v);
        if ($s === '' || $s === '-') return null;
        if (str_contains($s, ',')) $s = str_replace(['.', ','], ['', '.'], $s);
        return is_numeric($s) ? (float)$s : null;
    }
}
