import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { get } from './api'

// Cada computador/celular fica ligado a um caixa (Caixa 1 ou Caixa 2).
const CHAVE = 'parada.caixaId'
const lerCaixa = () => { try { return Number(localStorage.getItem(CHAVE)) || null } catch { return null } }

const CaixaCtx = createContext(null)

export function CaixaProvider({ children }) {
  const [caixas, setCaixas] = useState(null)
  const [caixaId, setCaixaIdState] = useState(lerCaixa)

  const recarregar = useCallback(() => get('/caixas').then((c) => { setCaixas(c); return c }).catch(() => null), [])
  useEffect(() => { recarregar() }, [recarregar])

  const setCaixaId = useCallback((id) => {
    try { localStorage.setItem(CHAVE, String(id)) } catch {}
    setCaixaIdState(id)
  }, [])

  const caixa = caixas?.find((c) => c.id === caixaId) || null
  const value = useMemo(() => ({
    caixas, caixa, caixaId, setCaixaId, recarregar,
    sessao: caixa?.sessao || null,
  }), [caixas, caixa, caixaId, setCaixaId, recarregar])

  return <CaixaCtx.Provider value={value}>{children}</CaixaCtx.Provider>
}

export const useCaixa = () => useContext(CaixaCtx)

/** Mesmo cálculo da API: acréscimo/desconto da forma de pagamento. */
export function ajusteForma(forma, valor) {
  if (!forma || !valor) return 0
  const v = forma.taxa_cliente_valor
  if (forma.taxa_cliente_tipo === 'nenhuma' || !v) return 0
  const a = forma.taxa_cliente_modo === 'fixo' ? v : Math.round(valor * v) / 100
  return forma.taxa_cliente_tipo === 'desconto' ? -a : a
}

export const arred = (n) => Math.round((n + Number.EPSILON) * 100) / 100
