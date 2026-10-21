-- =====================================================================
--  ATUALIZAÇÃO DA ETAPA 5 — rodar UMA vez no phpMyAdmin
--  Antes: clique no nome do banco na coluna da esquerda, depois aba Importar.
--  Não apaga nem altera nenhum dado existente.
-- =====================================================================
SET NAMES utf8mb4;

-- Pedidos: canal (site ou telefone/WhatsApp), quem atendeu e o status "pronto para retirar"
ALTER TABLE pedidos_online
  ADD COLUMN canal ENUM('site','telefone') NOT NULL DEFAULT 'site' AFTER codigo,
  ADD COLUMN usuario_id INT UNSIGNED NULL AFTER venda_id,
  ADD COLUMN entregador_id INT UNSIGNED NULL AFTER usuario_id,
  MODIFY COLUMN status ENUM('novo','aceito','pronto','saiu_entrega','entregue','cancelado') NOT NULL DEFAULT 'novo';

-- Itens do pedido guardam custo, engradado e casco (igual à comanda)
ALTER TABLE pedido_itens
  ADD COLUMN tipo ENUM('produto','casco') NOT NULL DEFAULT 'produto' AFTER produto_id,
  ADD COLUMN produto_estoque_id INT UNSIGNED NULL AFTER tipo,
  ADD COLUMN unidades_base DECIMAL(12,3) NULL AFTER quantidade,
  ADD COLUMN cascos_devolvidos INT NOT NULL DEFAULT 0 AFTER unidades_base,
  ADD COLUMN custo_unitario DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER preco_unitario;

-- Entregador: recebe valor fixo por entrega ou a taxa de entrega inteira
ALTER TABLE entregadores
  ADD COLUMN modo_repasse ENUM('fixo','taxa') NOT NULL DEFAULT 'fixo' AFTER veiculo;

-- Acerto com o entregador
ALTER TABLE entregas
  ADD COLUMN pago_em DATETIME NULL AFTER pago_entregador,
  ADD COLUMN pago_por INT UNSIGNED NULL AFTER pago_em;

INSERT INTO configuracoes (chave, valor) VALUES
  ('tempo_entrega', '40-60'),
  ('horario_funcionamento', ''),
  ('aceita_retirada', '1')
  ON DUPLICATE KEY UPDATE chave = chave;

INSERT INTO configuracoes (chave, valor) VALUES ('versao_banco', '5')
  ON DUPLICATE KEY UPDATE valor = '5';
