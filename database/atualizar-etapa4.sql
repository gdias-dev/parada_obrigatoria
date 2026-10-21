-- =====================================================================
--  ATUALIZAÇÃO DA ETAPA 4 — rodar UMA vez no phpMyAdmin
--  Antes: clique no nome do banco na coluna da esquerda, depois aba Importar.
--  Não apaga nem altera nenhum dado existente.
-- =====================================================================
SET NAMES utf8mb4;

-- Pagamento de fiado: guarda acréscimo do cartão, taxa da maquininha e troco
ALTER TABLE fiado_lancamentos
  ADD COLUMN forma_nome VARCHAR(50) NULL AFTER forma_pagamento_id,
  ADD COLUMN acrescimo DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER valor,
  ADD COLUMN taxa_maquininha DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER acrescimo,
  ADD COLUMN troco DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER taxa_maquininha,
  ADD KEY idx_fiado_sessao (caixa_sessao_id);

ALTER TABLE clientes
  ADD COLUMN apelido VARCHAR(60) NULL AFTER nome;

INSERT INTO configuracoes (chave, valor) VALUES ('versao_banco', '4')
  ON DUPLICATE KEY UPDATE valor = '4';
