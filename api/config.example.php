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

    // OPCIONAL — área do desenvolvedor (histórico das mensalidades, desfazer um "já paguei"):
    // https://seudominio/api/mensalidade/dev?chave=ESTA-CHAVE
    // 'desenvolvedor_chave' => 'uma-chave-longa-so-sua',

    // OPCIONAL — receber e-mail quando a loja tocar em "Já paguei" e quando atrasar:
    // 'email' => ['smtp' => ['host' => 'smtp.gmail.com', 'porta' => 465, 'seguranca' => 'ssl',
    //                        'usuario' => 'avisos@gmail.com', 'senha' => 'senha-de-app']],

    // Mensalidade: só preencha para mudar o padrão (R$ 100, dia 8, desde nov/2026, Pix CNPJ da Nasctech)
    // 'mensalidade' => ['valor' => 100.00, 'dia_vencimento' => 8],

    // true só em desenvolvimento (mostra o erro real na resposta)
    'debug' => false,
];
