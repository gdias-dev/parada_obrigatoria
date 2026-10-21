const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const dinheiro = (v) => brl.format(Number(v || 0))

export function dataHora(s) {
  if (!s) return '—'
  const d = new Date(s.replace(' ', 'T'))
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function saudacao(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Boa noite'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const qtdFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })
export const quantidade = (v, unidade) => `${qtdFmt.format(Number(v || 0))}${unidade && unidade !== 'UN' ? ' ' + unidade.toLowerCase() : ''}`

export const porcentagem = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`)

/** "5,50" | "5.50" | 5.5 -> 5.5 ; vazio -> null */
export function numero(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return v
  let s = String(v).replace(/[^\d,.-]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** número -> texto para campo (5.5 -> "5,50") */
export const paraCampo = (v, casas = 2) =>
  v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas === 2 ? 2 : 0, maximumFractionDigits: casas, useGrouping: false })
