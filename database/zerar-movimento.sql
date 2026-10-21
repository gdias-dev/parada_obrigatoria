-- =====================================================================
-- ZERAR O MOVIMENTO DE TESTE — use UMA vez, antes de começar a usar de verdade
-- =====================================================================
-- APAGA: vendas, comandas, pedidos online, entregas, caixas abertos/fechados,
--        sangrias, fiado (lançamentos e saldos), histórico de estoque e de cascos.
-- MANTÉM: produtos e preços, categorias, clientes (com fiado zerado), usuários e senhas,
--         formas de pagamento, entregadores, bairros e dados da loja.
--
-- ANTES: baixe um backup em Dados da loja > Backup e sistema. Isto não tem volta.
-- DEPOIS: faça a contagem do estoque (Produtos > produto > Estoque > Contagem),
--         ou importe a planilha com a opção "Substituir".
--
-- Como usar: phpMyAdmin > clique no banco na esquerda > Importar > este arquivo.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

DELETE FROM venda_pagamentos;
DELETE FROM venda_itens;
DELETE FROM vendas;
DELETE FROM comanda_itens;
DELETE FROM comandas;
DELETE FROM pedido_itens;
DELETE FROM pedidos_online;
DELETE FROM entregas;
DELETE FROM caixa_movimentos;
DELETE FROM caixa_sessoes;
DELETE FROM fiado_lancamentos;
DELETE FROM casco_movimentos;
DELETE FROM movimentacoes_estoque;
DELETE FROM tentativas_login;

UPDATE clientes SET saldo_fiado = 0;

ALTER TABLE venda_pagamentos AUTO_INCREMENT = 1;
ALTER TABLE venda_itens AUTO_INCREMENT = 1;
ALTER TABLE vendas AUTO_INCREMENT = 1;
ALTER TABLE comanda_itens AUTO_INCREMENT = 1;
ALTER TABLE comandas AUTO_INCREMENT = 1;
ALTER TABLE pedido_itens AUTO_INCREMENT = 1;
ALTER TABLE pedidos_online AUTO_INCREMENT = 1;
ALTER TABLE entregas AUTO_INCREMENT = 1;
ALTER TABLE caixa_movimentos AUTO_INCREMENT = 1;
ALTER TABLE caixa_sessoes AUTO_INCREMENT = 1;
ALTER TABLE fiado_lancamentos AUTO_INCREMENT = 1;
ALTER TABLE casco_movimentos AUTO_INCREMENT = 1;
ALTER TABLE movimentacoes_estoque AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- OPCIONAL: zerar também o estoque e os cascos vazios de todos os produtos
-- (útil se vai contar tudo do zero). Para usar, apague os "-- " das 2 linhas abaixo.
-- ---------------------------------------------------------------------
-- UPDATE produtos SET estoque = 0 WHERE controla_estoque = 1;
-- UPDATE produtos SET estoque_cascos = 0;
