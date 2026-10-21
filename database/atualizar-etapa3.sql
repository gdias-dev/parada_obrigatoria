-- =====================================================================
--  ATUALIZAÇÃO DA ETAPA 3 — rodar UMA vez no phpMyAdmin (aba Importar)
--  Para quem já tem o sistema instalado (etapas 1 e 2).
--  Não apaga nem altera nenhum produto, usuário ou dado existente.
-- =====================================================================
SET NAMES utf8mb4;

-- Engradados / fardos / packs: produto que é embalagem de outro (unidade)
-- Casco retornável (Coca e Fanta 2L)
ALTER TABLE produtos
  ADD COLUMN produto_base_id INT UNSIGNED NULL AFTER categoria_id,
  ADD COLUMN fator DECIMAL(12,3) NULL AFTER produto_base_id,
  ADD COLUMN usa_casco TINYINT(1) NOT NULL DEFAULT 0 AFTER visivel_online,
  ADD COLUMN valor_casco DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER usa_casco,
  ADD COLUMN estoque_cascos INT NOT NULL DEFAULT 0 AFTER valor_casco,
  ADD KEY idx_produtos_base (produto_base_id),
  ADD CONSTRAINT fk_produtos_base FOREIGN KEY (produto_base_id) REFERENCES produtos(id) ON DELETE SET NULL;

-- Itens de venda e de comanda: casco cobrado como item separado,
-- e quanto saiu do estoque da unidade (engradado de 24 = 24 unidades)
ALTER TABLE venda_itens
  ADD COLUMN tipo ENUM('produto','casco') NOT NULL DEFAULT 'produto' AFTER produto_id,
  ADD COLUMN produto_estoque_id INT UNSIGNED NULL AFTER tipo,
  ADD COLUMN unidades_base DECIMAL(12,3) NULL AFTER quantidade,
  ADD COLUMN cascos_devolvidos INT NOT NULL DEFAULT 0 AFTER unidades_base;

ALTER TABLE comanda_itens
  ADD COLUMN tipo ENUM('produto','casco') NOT NULL DEFAULT 'produto' AFTER produto_id,
  ADD COLUMN produto_estoque_id INT UNSIGNED NULL AFTER tipo,
  ADD COLUMN unidades_base DECIMAL(12,3) NULL AFTER quantidade,
  ADD COLUMN cascos_devolvidos INT NOT NULL DEFAULT 0 AFTER unidades_base,
  ADD COLUMN item_pai_id INT UNSIGNED NULL AFTER cascos_devolvidos,
  ADD COLUMN cancelado_por INT UNSIGNED NULL AFTER cancelado,
  ADD COLUMN motivo_cancelamento VARCHAR(255) NULL AFTER cancelado_por;

-- Valor cobrado de casco na venda (é depósito, não entra no lucro)
ALTER TABLE vendas
  ADD COLUMN valor_cascos DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER taxa_entrega,
  ADD COLUMN comanda_id INT UNSIGNED NULL AFTER origem;

-- Cascos vazios na loja (entram quando o cliente devolve, saem quando volta ao fornecedor)
CREATE TABLE IF NOT EXISTS casco_movimentos (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  produto_id INT UNSIGNED NOT NULL,
  quantidade INT NOT NULL,
  saldo_apos INT NOT NULL,
  motivo     VARCHAR(255) NULL,
  venda_id   INT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  criado_em  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_casco_produto (produto_id, criado_em),
  CONSTRAINT fk_casco_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
  CONSTRAINT fk_casco_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO configuracoes (chave, valor) VALUES ('versao_banco', '3')
  ON DUPLICATE KEY UPDATE valor = '3';
