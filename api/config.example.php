<?php
/**
 * Copie este arquivo para config.php e preencha com os dados da KingHost.
 * (Painel KingHost > Bancos de Dados > MySQL: host, nome do banco, usuário e senha)
 * O config.php NUNCA deve ir para o GitHub.
 */
return [
    'db' => [
        'host' => 'mysql.seudominio.com.br',
        'name' => 'nome_do_banco',
        'user' => 'usuario_do_banco',
        'pass' => 'senha_do_banco',
        'port' => 3306,
    ],

    // Gere uma chave aleatória longa, ex.: php -r "echo bin2hex(random_bytes(32));"
    'jwt_secret' => 'TROQUE-POR-UMA-CHAVE-ALEATORIA-DE-64-CARACTERES',

    // Tempo de sessão do login, em horas (um turno longo de bar + folga)
    'token_ttl_horas' => 14,

    'timezone' => 'America/Sao_Paulo',

    // Em produção o front e a API ficam no mesmo domínio, então pode ficar vazio.
    // Em desenvolvimento: ['http://localhost:5173']
    'cors_origins' => [],

    // true só em desenvolvimento (mostra o erro real na resposta)
    'debug' => false,
];
