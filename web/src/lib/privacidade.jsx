import { useSyncExternalStore } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { dinheiro } from './format'

// "Olhinho": esconde faturamento, lucro e totais de venda. Vale para o aparelho todo e fica salvo.
const CHAVE = 'parada.ocultarValores'
let oculto = false
try { oculto = localStorage.getItem(CHAVE) === '1' } catch { /* sem armazenamento: começa mostrando */ }
const ouvintes = new Set()

export function alternarValores() {
  oculto = !oculto
  try { localStorage.setItem(CHAVE, oculto ? '1' : '0') } catch { /* ok */ }
  ouvintes.forEach((f) => f())
}

/** Use no topo da tela: faz a tela se redesenhar quando o olhinho muda. */
export function usePrivacidade() {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f) }, () => oculto)
}

/** Igual a dinheiro(), mas vira "R$ ••••" quando o olhinho está fechado. */
export const din = (v) => (oculto ? 'R$ ••••' : dinheiro(v))
export const valoresOcultos = () => oculto

export function Olhinho({ className = '' }) {
  const off = usePrivacidade()
  return (
    <button type="button" className={`btn btn-icone olhinho nao-imprimir ${className}`} onClick={alternarValores}
      aria-pressed={off} aria-label={off ? 'Mostrar valores' : 'Esconder valores'} title={off ? 'Mostrar valores' : 'Esconder valores'}>
      {off ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
    </button>
  )
}
