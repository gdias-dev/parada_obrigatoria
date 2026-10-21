-- =====================================================================
--  Instalação nova: importe schema.sql, depois seed.sql, depois os atualizar-etapa*.sql em ordem.
--  Parada Obrigatória — Bar e Distribuidora de Bebidas
--  Schema MySQL 5.7+/8.0 (compatível com MariaDB 10.3+)
--  Importar pelo phpMyAdmin da KingHost: Importar > schema.sql > seed.sql
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- USUÁRIOS E ACESSO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome                 VARCHAR(100) NOT NULL,
  login                VARCHAR(50)  NOT NULL,
  senha_hash           VARCHAR(255) NOT NULL,
  perfil               ENUM('admin','funcionario') NOT NULL DEFAULT 'funcionario',
  ativo                TINYINT(1) NOT NULL DEFAULT 1,
  precisa_trocar_senha TINYINT(1) NOT NULL DEFAULT 1,
  token_versao         INT UNSIGNED NOT NULL DEFAULT 1,   -- incrementar derruba sessões abertas
  ultimo_acesso        DATETIME NULL,
  criado_em            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuarios_login (login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proteção contra tentativa de senha em massa
CREATE TABLE IF NOT EXISTS tentativas_login (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  login     VARCHAR(50) NOT NULL,
  ip        VARCHAR(45) NOT NULL,
  sucesso   TINYINT(1) NOT NULL DEFAULT 0,
  criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tentativas_ip (ip, criado_em),
  KEY idx_tentativas_login (login, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configuracoes (
  chave VARCHAR(60) PRIMARY KEY,
  valor TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- PRODUTOS E ESTOQUE
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome           VARCHAR(80) NOT NULL,
  ordem          INT NOT NULL DEFAULT 0,
  visivel_online TINYINT(1) NOT NULL DEFAULT 1,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_categorias_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS produtos (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo_barras  VARCHAR(30)  NULL,
  nome           VARCHAR(150) NOT NULL,
  categoria_id   INT UNSIGNED NULL,
  unidade        ENUM('UN','KG','L','CX','PCT') NOT NULL DEFAULT 'UN',
  preco_custo    DECIMAL(12,2) NOT NULL DEFAULT 0,
  preco_venda    DECIMAL(12,2) NOT NULL DEFAULT 0,
  estoque        DECIMAL(12,3) NOT NULL DEFAULT 0,
  estoque_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,
  controla_estoque TINYINT(1) NOT NULL DEFAULT 1,      -- 0 para drinks/combos montados na hora
  visivel_online TINYINT(1) NOT NULL DEFAULT 1,
  imagem         VARCHAR(255) NULL,
  descricao      VARCHAR(255) NULL,
  ativo          TINYINT(1) NOT NULL DEFAULT 1,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_produtos_codigo (codigo_barras),
  KEY idx_produtos_nome (nome),
  KEY idx_produtos_categoria (categoria_id),
  CONSTRAINT fk_produtos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Todo movimento de estoque fica registrado (auditoria)
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  produto_id     INT UNSIGNED NOT NULL,
  tipo           ENUM('entrada','saida','ajuste','venda','cancelamento','importacao') NOT NULL,
  quantidade     DECIMAL(12,3) NOT NULL,          -- positivo entra, negativo sai
  estoque_apos   DECIMAL(12,3) NOT NULL,
  custo_unitario DECIMAL(12,2) NULL,
  motivo         VARCHAR(255) NULL,
  venda_id       INT UNSIGNED NULL,
  usuario_id     INT UNSIGNED NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_mov_produto (produto_id, criado_em),
  KEY idx_mov_venda (venda_id),
  CONSTRAINT fk_mov_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
  CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- FORMAS DE PAGAMENTO
--   taxa_cliente_*  : acréscimo/desconto cobrado do cliente (igual WhatsMenu)
--   taxa_maquininha : % que a maquininha cobra da loja — descontado do lucro
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS formas_pagamento (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome                VARCHAR(50) NOT NULL,
  tipo                ENUM('dinheiro','pix','credito','debito','vale','fiado') NOT NULL,
  taxa_cliente_tipo   ENUM('nenhuma','acrescimo','desconto') NOT NULL DEFAULT 'nenhuma',
  taxa_cliente_modo   ENUM('percentual','fixo') NOT NULL DEFAULT 'percentual',
  taxa_cliente_valor  DECIMAL(8,2) NOT NULL DEFAULT 0,
  taxa_maquininha_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
  ativo_pdv           TINYINT(1) NOT NULL DEFAULT 1,
  ativo_online        TINYINT(1) NOT NULL DEFAULT 1,
  ordem               INT NOT NULL DEFAULT 0,
  ativo               TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bandeiras (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  forma_pagamento_id INT UNSIGNED NOT NULL,
  nome               VARCHAR(40) NOT NULL,
  CONSTRAINT fk_bandeira_forma FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- CAIXAS (2 caixas simultâneos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS caixas (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome  VARCHAR(40) NOT NULL,
  ativo TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS caixa_sessoes (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  caixa_id              INT UNSIGNED NOT NULL,
  status                ENUM('aberto','fechado') NOT NULL DEFAULT 'aberto',
  usuario_abertura_id   INT UNSIGNED NULL,
  aberto_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  valor_abertura        DECIMAL(12,2) NOT NULL DEFAULT 0,
  usuario_fechamento_id INT UNSIGNED NULL,
  fechado_em            DATETIME NULL,
  valor_informado       DECIMAL(12,2) NULL,         -- dinheiro contado no fechamento
  valor_esperado        DECIMAL(12,2) NULL,
  observacao            VARCHAR(255) NULL,
  KEY idx_sessao_caixa (caixa_id, status),
  CONSTRAINT fk_sessao_caixa FOREIGN KEY (caixa_id) REFERENCES caixas(id),
  CONSTRAINT fk_sessao_uab FOREIGN KEY (usuario_abertura_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_sessao_ufe FOREIGN KEY (usuario_fechamento_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sangria (retirada) e suprimento (reforço de troco)
CREATE TABLE IF NOT EXISTS caixa_movimentos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sessao_id  INT UNSIGNED NOT NULL,
  tipo       ENUM('sangria','suprimento') NOT NULL,
  valor      DECIMAL(12,2) NOT NULL,
  motivo     VARCHAR(255) NULL,
  usuario_id INT UNSIGNED NULL,
  criado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cxmov_sessao FOREIGN KEY (sessao_id) REFERENCES caixa_sessoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cxmov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- CLIENTES E FIADO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome         VARCHAR(120) NOT NULL,
  telefone     VARCHAR(20)  NULL,
  endereco     VARCHAR(200) NULL,
  bairro       VARCHAR(80)  NULL,
  referencia   VARCHAR(200) NULL,
  observacao   VARCHAR(255) NULL,
  limite_fiado DECIMAL(12,2) NULL,                -- NULL = sem limite
  saldo_fiado  DECIMAL(12,2) NOT NULL DEFAULT 0,  -- quanto o cliente deve hoje
  ativo        TINYINT(1) NOT NULL DEFAULT 1,
  criado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_clientes_nome (nome),
  KEY idx_clientes_tel (telefone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiado_lancamentos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id         INT UNSIGNED NOT NULL,
  tipo               ENUM('debito','pagamento','estorno') NOT NULL,
  valor              DECIMAL(12,2) NOT NULL,
  saldo_apos         DECIMAL(12,2) NOT NULL,
  venda_id           INT UNSIGNED NULL,
  forma_pagamento_id INT UNSIGNED NULL,           -- como o cliente pagou a dívida
  caixa_sessao_id    INT UNSIGNED NULL,
  usuario_id         INT UNSIGNED NULL,
  observacao         VARCHAR(255) NULL,
  criado_em          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fiado_cliente (cliente_id, criado_em),
  CONSTRAINT fk_fiado_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_fiado_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- ENTREGADORES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entregadores (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  telefone    VARCHAR(20) NULL,
  veiculo     VARCHAR(60) NULL,
  taxa_padrao DECIMAL(10,2) NOT NULL DEFAULT 0,   -- quanto o entregador recebe por entrega
  ativo       TINYINT(1) NOT NULL DEFAULT 1,
  criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bairros_entrega (
  id    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome  VARCHAR(80) NOT NULL,
  taxa  DECIMAL(10,2) NOT NULL DEFAULT 0,          -- taxa cobrada do cliente
  ativo TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uk_bairro_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- VENDAS (balcão, comanda e online terminam todas aqui)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendas (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  origem                ENUM('balcao','comanda','online') NOT NULL,
  caixa_sessao_id       INT UNSIGNED NULL,
  cliente_id            INT UNSIGNED NULL,
  usuario_id            INT UNSIGNED NULL,
  subtotal              DECIMAL(12,2) NOT NULL DEFAULT 0,
  desconto              DECIMAL(12,2) NOT NULL DEFAULT 0,
  acrescimo             DECIMAL(12,2) NOT NULL DEFAULT 0,  -- soma das taxas cobradas do cliente
  taxa_entrega          DECIMAL(12,2) NOT NULL DEFAULT 0,
  total                 DECIMAL(12,2) NOT NULL DEFAULT 0,
  custo_total           DECIMAL(12,2) NOT NULL DEFAULT 0,  -- custo dos produtos no momento da venda
  taxa_maquininha_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status                ENUM('concluida','cancelada') NOT NULL DEFAULT 'concluida',
  motivo_cancelamento   VARCHAR(255) NULL,
  cancelada_em          DATETIME NULL,
  cancelada_por         INT UNSIGNED NULL,
  criado_em             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vendas_data (criado_em, status),
  KEY idx_vendas_sessao (caixa_sessao_id),
  KEY idx_vendas_cliente (cliente_id),
  CONSTRAINT fk_vendas_sessao FOREIGN KEY (caixa_sessao_id) REFERENCES caixa_sessoes(id) ON DELETE SET NULL,
  CONSTRAINT fk_vendas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_vendas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nome, preço e custo são copiados no momento da venda: mudar o produto
-- depois não altera relatórios antigos.
CREATE TABLE IF NOT EXISTS venda_itens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venda_id       INT UNSIGNED NOT NULL,
  produto_id     INT UNSIGNED NULL,
  nome_produto   VARCHAR(150) NOT NULL,
  quantidade     DECIMAL(12,3) NOT NULL,
  preco_unitario DECIMAL(12,2) NOT NULL,
  custo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  total          DECIMAL(12,2) NOT NULL,
  KEY idx_vitens_venda (venda_id),
  KEY idx_vitens_produto (produto_id),
  CONSTRAINT fk_vitens_venda FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
  CONSTRAINT fk_vitens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uma venda pode ser paga com mais de uma forma (ex.: parte Pix, parte dinheiro)
CREATE TABLE IF NOT EXISTS venda_pagamentos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venda_id           INT UNSIGNED NOT NULL,
  forma_pagamento_id INT UNSIGNED NULL,
  forma_nome         VARCHAR(50) NOT NULL,
  bandeira           VARCHAR(40) NULL,
  valor              DECIMAL(12,2) NOT NULL,           -- valor pago já com acréscimo/desconto
  acrescimo          DECIMAL(12,2) NOT NULL DEFAULT 0,
  taxa_maquininha    DECIMAL(12,2) NOT NULL DEFAULT 0,
  troco              DECIMAL(12,2) NOT NULL DEFAULT 0,
  KEY idx_vpag_venda (venda_id),
  CONSTRAINT fk_vpag_venda FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE CASCADE,
  CONSTRAINT fk_vpag_forma FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- COMANDAS (bar) — abertas por nome
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comandas (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome_cliente        VARCHAR(100) NOT NULL,
  cliente_id          INT UNSIGNED NULL,
  status              ENUM('aberta','fechada','cancelada') NOT NULL DEFAULT 'aberta',
  observacao          VARCHAR(255) NULL,
  usuario_abertura_id INT UNSIGNED NULL,
  aberta_em           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fechada_em          DATETIME NULL,
  venda_id            INT UNSIGNED NULL,
  KEY idx_comandas_status (status, aberta_em),
  CONSTRAINT fk_comandas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_comandas_usuario FOREIGN KEY (usuario_abertura_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_comandas_venda FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O estoque baixa quando o item é lançado na comanda
CREATE TABLE IF NOT EXISTS comanda_itens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comanda_id     INT UNSIGNED NOT NULL,
  produto_id     INT UNSIGNED NULL,
  nome_produto   VARCHAR(150) NOT NULL,
  quantidade     DECIMAL(12,3) NOT NULL,
  preco_unitario DECIMAL(12,2) NOT NULL,
  custo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0,
  cancelado      TINYINT(1) NOT NULL DEFAULT 0,
  usuario_id     INT UNSIGNED NULL,
  criado_em      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_citens_comanda (comanda_id),
  CONSTRAINT fk_citens_comanda FOREIGN KEY (comanda_id) REFERENCES comandas(id) ON DELETE CASCADE,
  CONSTRAINT fk_citens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL,
  CONSTRAINT fk_citens_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- PEDIDOS ONLINE E ENTREGAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos_online (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo             VARCHAR(12) NOT NULL,              -- código curto mostrado ao cliente
  cliente_id         INT UNSIGNED NULL,
  cliente_nome       VARCHAR(120) NOT NULL,
  telefone           VARCHAR(20)  NOT NULL,
  tipo               ENUM('entrega','retirada') NOT NULL DEFAULT 'entrega',
  endereco           VARCHAR(200) NULL,
  bairro             VARCHAR(80)  NULL,
  referencia         VARCHAR(200) NULL,
  forma_pagamento_id INT UNSIGNED NULL,
  troco_para         DECIMAL(12,2) NULL,
  observacao         VARCHAR(255) NULL,
  subtotal           DECIMAL(12,2) NOT NULL DEFAULT 0,
  taxa_entrega       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total              DECIMAL(12,2) NOT NULL DEFAULT 0,
  status             ENUM('novo','aceito','saiu_entrega','entregue','cancelado') NOT NULL DEFAULT 'novo',
  motivo_cancelamento VARCHAR(255) NULL,
  venda_id           INT UNSIGNED NULL,
  ip                 VARCHAR(45) NULL,
  criado_em          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  aceito_em          DATETIME NULL,
  finalizado_em      DATETIME NULL,
  UNIQUE KEY uk_pedido_codigo (codigo),
  KEY idx_pedidos_status (status, criado_em),
  CONSTRAINT fk_pedidos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedidos_forma FOREIGN KEY (forma_pagamento_id) REFERENCES formas_pagamento(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedidos_venda FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pedido_itens (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id      INT UNSIGNED NOT NULL,
  produto_id     INT UNSIGNED NULL,
  nome_produto   VARCHAR(150) NOT NULL,
  quantidade     DECIMAL(12,3) NOT NULL,
  preco_unitario DECIMAL(12,2) NOT NULL,
  observacao     VARCHAR(150) NULL,
  KEY idx_pitens_pedido (pedido_id),
  CONSTRAINT fk_pitens_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_online(id) ON DELETE CASCADE,
  CONSTRAINT fk_pitens_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Entrega pode vir de pedido online ou de venda no balcão (cliente ligou / WhatsApp)
CREATE TABLE IF NOT EXISTS entregas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venda_id          INT UNSIGNED NULL,
  pedido_id         INT UNSIGNED NULL,
  entregador_id     INT UNSIGNED NULL,
  endereco          VARCHAR(200) NULL,
  bairro            VARCHAR(80)  NULL,
  taxa_cobrada      DECIMAL(10,2) NOT NULL DEFAULT 0,  -- cobrada do cliente
  valor_entregador  DECIMAL(10,2) NOT NULL DEFAULT 0,  -- repassado ao entregador
  status            ENUM('pendente','em_rota','entregue','cancelada') NOT NULL DEFAULT 'pendente',
  pago_entregador   TINYINT(1) NOT NULL DEFAULT 0,
  saiu_em           DATETIME NULL,
  entregue_em       DATETIME NULL,
  criado_em         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entregas_entregador (entregador_id, criado_em),
  CONSTRAINT fk_entregas_venda FOREIGN KEY (venda_id) REFERENCES vendas(id) ON DELETE SET NULL,
  CONSTRAINT fk_entregas_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos_online(id) ON DELETE SET NULL,
  CONSTRAINT fk_entregas_entregador FOREIGN KEY (entregador_id) REFERENCES entregadores(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
