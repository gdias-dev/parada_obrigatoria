<?php
declare(strict_types=1);

final class Db
{
    private static ?PDO $pdo = null;

    public static function init(array $c): void
    {
        $dsn = "mysql:host={$c['host']};port=" . ($c['port'] ?? 3306) . ";dbname={$c['name']};charset=utf8mb4";
        self::$pdo = new PDO($dsn, $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        // Horário de Brasília em todas as datas gravadas pelo MySQL
        self::$pdo->exec("SET time_zone = '-03:00'");
    }

    public static function pdo(): PDO
    {
        return self::$pdo ?? throw new RuntimeException('Banco não inicializado.');
    }

    public static function all(string $sql, array $p = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st->fetchAll();
    }

    public static function one(string $sql, array $p = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function value(string $sql, array $p = []): mixed
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    public static function exec(string $sql, array $p = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st->rowCount();
    }

    public static function insert(string $sql, array $p = []): int
    {
        self::exec($sql, $p);
        return (int)self::pdo()->lastInsertId();
    }

    /** Executa tudo ou nada. */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }
}

/** JWT HS256 sem dependências. */
final class Jwt
{
    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    private static function unb64(string $s): string|false
    {
        return base64_decode(strtr($s, '-_', '+/'), true);
    }

    public static function encode(array $payload, string $secret): string
    {
        $h = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = self::b64(json_encode($payload));
        $s = self::b64(hash_hmac('sha256', "$h.$p", $secret, true));
        return "$h.$p.$s";
    }

    public static function decode(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) return null;
        [$h, $p, $s] = $parts;
        $expected = self::b64(hash_hmac('sha256', "$h.$p", $secret, true));
        if (!hash_equals($expected, $s)) return null;
        $json = self::unb64($p);
        $data = $json === false ? null : json_decode($json, true);
        if (!is_array($data) || ($data['exp'] ?? 0) < time()) return null;
        return $data;
    }
}

final class Auth
{
    private static ?array $user = null;
    private static array $config = [];

    public static function init(array $config): void
    {
        self::$config = $config;
    }

    public static function issueToken(array $u): string
    {
        $ttl = (int)(self::$config['token_ttl_horas'] ?? 14) * 3600;
        return Jwt::encode([
            'sub' => (int)$u['id'],
            'ver' => (int)$u['token_versao'],
            'iat' => time(),
            'exp' => time() + $ttl,
        ], self::$config['jwt_secret']);
    }

    /** Usuário logado; lança 401 se não houver. */
    public static function user(bool $allowPendingPassword = false): array
    {
        if (self::$user === null) {
            $token = Http::bearerToken();
            $data = $token ? Jwt::decode($token, self::$config['jwt_secret']) : null;
            if (!$data) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
            $u = Db::one('SELECT id, nome, login, perfil, ativo, precisa_trocar_senha, token_versao FROM usuarios WHERE id = ?', [$data['sub']]);
            if (!$u || !$u['ativo'] || (int)$u['token_versao'] !== (int)$data['ver']) {
                throw new HttpError(401, 'Sessão encerrada. Entre novamente.');
            }
            self::$user = $u;
        }
        if (!$allowPendingPassword && self::$user['precisa_trocar_senha']) {
            throw new HttpError(403, 'Troque sua senha para continuar.', ['codigo' => 'TROCAR_SENHA']);
        }
        return self::$user;
    }

    public static function admin(): array
    {
        $u = self::user();
        if ($u['perfil'] !== 'admin') throw new HttpError(403, 'Acesso restrito ao administrador.');
        return $u;
    }

    public static function isAdmin(): bool
    {
        return (self::$user['perfil'] ?? null) === 'admin';
    }

    public static function publicUser(array $u): array
    {
        return [
            'id'                  => (int)$u['id'],
            'nome'                => $u['nome'],
            'login'               => $u['login'],
            'perfil'              => $u['perfil'],
            'precisa_trocar_senha'=> (bool)$u['precisa_trocar_senha'],
        ];
    }
}

final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        // /usuarios/{id} -> /usuarios/(?P<id>\d+)
        $regex = preg_replace('#\{(\w+)\}#', '(?P<$1>\d+)', $pattern);
        $this->routes[] = [$method, "#^$regex$#", $handler];
    }

    public function get(string $p, callable $h): void    { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void   { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void    { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void  { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(string $method, string $path): never
    {
        $pathMatched = false;
        foreach ($this->routes as [$m, $regex, $handler]) {
            if (!preg_match($regex, $path, $mt)) continue;
            $pathMatched = true;
            if ($m !== $method) continue;
            $params = array_map('intval', array_filter($mt, 'is_string', ARRAY_FILTER_USE_KEY));
            $result = $handler(...$params);
            Http::json($result ?? ['ok' => true]);
        }
        throw new HttpError($pathMatched ? 405 : 404, $pathMatched ? 'Método não permitido.' : 'Rota não encontrada.');
    }
}
