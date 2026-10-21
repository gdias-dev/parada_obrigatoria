<?php
declare(strict_types=1);

/**
 * Toda alteração de estoque passa por aqui: trava a linha do produto,
 * atualiza o saldo e grava a movimentação (histórico/auditoria).
 * Deve ser chamada dentro de Db::tx().
 */
final class Estoque
{
    public const TIPOS = ['entrada', 'saida', 'ajuste', 'venda', 'cancelamento', 'importacao'];

    /** @return float estoque depois do movimento */
    public static function mover(
        int $produtoId,
        float $delta,
        string $tipo,
        ?string $motivo = null,
        ?float $custoUnitario = null,
        ?int $vendaId = null,
        ?int $usuarioId = null
    ): float {
        $p = Db::one('SELECT id, estoque, controla_estoque FROM produtos WHERE id = ? FOR UPDATE', [$produtoId])
            ?? throw new HttpError(404, 'Produto não encontrado.');

        $novo = round((float)$p['estoque'] + $delta, 3);
        Db::exec('UPDATE produtos SET estoque = ? WHERE id = ?', [$novo, $produtoId]);
        Db::exec(
            'INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_apos, custo_unitario, motivo, venda_id, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$produtoId, $tipo, round($delta, 3), $novo, $custoUnitario, $motivo, $vendaId, $usuarioId]
        );
        return $novo;
    }
}

/** Cascos vazios na loja (Coca/Fanta 2L retornável). */
final class Cascos
{
    public static function mover(int $produtoId, int $delta, string $motivo, ?int $vendaId = null, ?int $usuarioId = null): int
    {
        $atual = Db::value('SELECT estoque_cascos FROM produtos WHERE id = ? FOR UPDATE', [$produtoId]);
        if ($atual === null) throw new HttpError(404, 'Produto não encontrado.');
        $novo = (int)$atual + $delta;
        Db::exec('UPDATE produtos SET estoque_cascos = ? WHERE id = ?', [$novo, $produtoId]);
        Db::exec(
            'INSERT INTO casco_movimentos (produto_id, quantidade, saldo_apos, motivo, venda_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
            [$produtoId, $delta, $novo, $motivo, $vendaId, $usuarioId]
        );
        return $novo;
    }
}
