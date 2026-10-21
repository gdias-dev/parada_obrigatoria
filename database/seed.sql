-- =====================================================================
--  Dados iniciais — rodar UMA vez, depois do schema.sql
-- =====================================================================
SET NAMES utf8mb4;

-- Admin inicial. Login: admin  |  Senha: parada@2026
-- O sistema obriga a trocar a senha no primeiro acesso.
INSERT INTO usuarios (nome, login, senha_hash, perfil, precisa_trocar_senha) VALUES
('Administrador', 'admin', '$2y$10$2nX3A9EgSlSe7BGfUkT90O5W2A5pIFJ3AOpaeq3j850aLVP6R1lU.', 'admin', 1);

INSERT INTO configuracoes (chave, valor) VALUES
('loja_nome',      'Parada Obrigatória'),
('loja_subtitulo', 'Bar e Distribuidora de Bebidas'),
('loja_whatsapp',  '5521974379702'),
('loja_endereco',  ''),
('pedidos_online_ativo', '1'),
('pedido_minimo',  '0');

INSERT INTO caixas (nome) VALUES ('Caixa 1'), ('Caixa 2');

-- Categorias tiradas dos destaques do Instagram (editáveis no sistema)
INSERT INTO categorias (nome, ordem) VALUES
('Combos', 1),
('Drinks', 2),
('Copões', 3),
('Cervejas', 4),
('Refrigerantes e Águas', 5),
('Destilados', 6),
('Doces e Biscoitos', 7),
('Mercearia', 8),
('Tabacaria', 9),
('Gelo e Carvão', 10);

-- Formas de pagamento (taxas ajustáveis na tela de configuração)
INSERT INTO formas_pagamento (nome, tipo, taxa_cliente_tipo, taxa_cliente_valor, taxa_maquininha_pct, ativo_online, ordem) VALUES
('Dinheiro',          'dinheiro', 'nenhuma',   0,   0,    1, 1),
('Pix',               'pix',      'nenhuma',   0,   0,    1, 2),
('Débito',            'debito',   'nenhuma',   0,   1.99, 1, 3),
('Crédito',           'credito',  'acrescimo', 5.2, 4.99, 1, 4),
('Vale-Alimentação',  'vale',     'nenhuma',   0,   0,    1, 5),
('Fiado',             'fiado',    'nenhuma',   0,   0,    0, 6);

INSERT INTO bandeiras (forma_pagamento_id, nome)
SELECT id, b.nome FROM formas_pagamento
JOIN (SELECT 'Mastercard' nome UNION ALL SELECT 'Visa' UNION ALL SELECT 'Elo' UNION ALL SELECT 'Amex') b
WHERE formas_pagamento.tipo IN ('credito','debito');
