<?php
declare(strict_types=1);

/**
 * Conta fiado dos clientes.
 * saldo_fiado = quanto o cliente deve (negativo = cliente tem crédito na loja).
 * Toda mudança de saldo gera um lançamento (histórico). Chamar dentro de Db::tx().
 */
final class Fiado
{
    public static function travarCliente(int $id): array
    {
        return Db::one('SELECT * FROM clientes WHERE id = ? FOR UPDATE', [$id]) ?? throw new HttpError(422, 'Cliente não encontrado.');
    }

    /** Lança um movimento. $delta > 0 aumenta a dívida, < 0 diminui. */
    public static function lancar(int $clienteId, string $tipo, float $delta, array $extra = []): float
    {
        $c = self::travarCliente($clienteId);
        $novo = round((float)$c['saldo_fiado'] + $delta, 2);
        Db::exec('UPDATE clientes SET saldo_fiado = ? WHERE id = ?', [$novo, $clienteId]);
        Db::exec(
            'INSERT INTO fiado_lancamentos (cliente_id, tipo, valor, acrescimo, taxa_maquininha, troco, saldo_apos, venda_id, forma_pagamento_id, forma_nome, caixa_sessao_id, usuario_id, observacao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$clienteId, $tipo, round(abs($delta), 2), $extra['acrescimo'] ?? 0, $extra['taxa_maquininha'] ?? 0, $extra['troco'] ?? 0, $novo,
             $extra['venda_id'] ?? null, $extra['forma_pagamento_id'] ?? null, $extra['forma_nome'] ?? null,
             $extra['caixa_sessao_id'] ?? null, $extra['usuario_id'] ?? null, $extra['observacao'] ?? null]
        );
        return $novo;
    }

    /** Compra no fiado: confere se o cliente pode e se cabe no limite. */
    public static function debitarVenda(int $clienteId, float $valor, int $vendaId, int $sessaoId, int $usuarioId): void
    {
        $c = self::travarCliente($clienteId);
        if (!$c['ativo']) throw new HttpError(422, "O cadastro de {$c['nome']} está desativado.");
        if ($c['limite_fiado'] !== null) {
            $limite = (float)$c['limite_fiado'];
            if ($limite <= 0) throw new HttpError(422, "{$c['nome']} não tem fiado liberado.");
            $depois = (float)$c['saldo_fiado'] + $valor;
            if ($depois > $limite + 0.001) {
                throw new HttpError(422, sprintf(
                    'Passa do limite de fiado de %s (R$ %s). Já deve R$ %s; com esta compra ficaria R$ %s.',
                    $c['nome'], self::br($limite), self::br((float)$c['saldo_fiado']), self::br($depois)
                ));
            }
        }
        self::lancar($clienteId, 'debito', $valor, [
            'venda_id' => $vendaId, 'caixa_sessao_id' => $sessaoId, 'usuario_id' => $usuarioId,
            'observacao' => "Compra — venda nº $vendaId",
        ]);
    }

    public static function br(float $v): string
    {
        return number_format($v, 2, ',', '.');
    }
}
