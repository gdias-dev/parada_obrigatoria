-- =====================================================================
--  ATUALIZAÇÃO: VENDA DE DOSES — rodar UMA vez no phpMyAdmin
--  Antes: clique no nome do banco na coluna da esquerda, depois aba Importar.
--  Não apaga nem altera nenhum dado existente.
-- =====================================================================
SET NAMES utf8mb4;

-- Garrafa: volume em ml. Dose: tamanho em ml (a dose aponta para a garrafa em produto_base_id).
-- fator com 6 casas: 1 dose de 50 ml numa garrafa de 998 ml = 0,050100 garrafa.
ALTER TABLE produtos
  ADD COLUMN volume_ml INT UNSIGNED NULL AFTER fator,
  ADD COLUMN dose_ml INT UNSIGNED NULL AFTER volume_ml,
  MODIFY COLUMN fator DECIMAL(12,6) NULL,
  MODIFY COLUMN estoque DECIMAL(14,4) NOT NULL DEFAULT 0;

-- Estoque com 4 casas (garrafa aberta: 3,4500 garrafas)
ALTER TABLE movimentacoes_estoque
  MODIFY COLUMN quantidade DECIMAL(14,4) NOT NULL,
  MODIFY COLUMN estoque_apos DECIMAL(14,4) NOT NULL;
ALTER TABLE venda_itens   MODIFY COLUMN unidades_base DECIMAL(14,4) NULL;
ALTER TABLE comanda_itens MODIFY COLUMN unidades_base DECIMAL(14,4) NULL;
ALTER TABLE pedido_itens  MODIFY COLUMN unidades_base DECIMAL(14,4) NULL;

INSERT INTO configuracoes (chave, valor) VALUES ('versao_banco', '6')
  ON DUPLICATE KEY UPDATE valor = '6';
