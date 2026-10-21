import { useLayoutEffect, useRef, useState } from 'react'

// Gráficos em SVG puro (sem biblioteca): leves, imprimem bem e funcionam offline.
// Regras: um eixo só, linhas de 2px, barras de no máximo 24px com ponta arredondada,
// grade discreta, legenda quando há 2+ séries e tooltip ao passar o dedo/mouse.

const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
export const eixoDinheiro = (v) => (Math.abs(v) >= 1000 ? `R$ ${compacto.format(v)}` : `R$ ${Math.round(v)}`)

function useLargura() {
  const ref = useRef(null)
  const [w, setW] = useState(600)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/** Ticks "redondos" para o eixo Y, sempre incluindo o zero. */
function escalaY(min, max, n = 4) {
  min = Math.min(0, min)
  max = Math.max(0, max)
  if (max === min) max = min + 1
  const bruto = (max - min) / n
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto)
  const ini = Math.floor(min / passo) * passo
  const fim = Math.ceil(max / passo) * passo
  const ticks = []
  for (let v = ini; v <= fim + passo / 2; v += passo) ticks.push(Math.round(v * 100) / 100)
  return { ini, fim, ticks }
}

function Legenda({ series }) {
  if (series.length < 2) return null
  return (
    <ul className="graf-legenda">
      {series.map((s) => <li key={s.chave}><i style={{ background: s.cor }} aria-hidden />{s.nome}</li>)}
    </ul>
  )
}

function Dica({ x, w, titulo, linhas }) {
  const esquerda = x > w * 0.6
  return (
    <div className="graf-dica" style={esquerda ? { right: w - x + 12 } : { left: x + 12 }} role="status">
      <strong>{titulo}</strong>
      {linhas.map(([cor, nome, valor]) => (
        <div key={nome}>{cor && <i style={{ background: cor }} aria-hidden />}<span>{nome}</span><b>{valor}</b></div>
      ))}
    </div>
  )
}

const M = { t: 12, r: 12, b: 28, l: 64 }

/** Linhas no tempo. dados: [{ rotulo, titulo, [chave]: número }] */
export function GraficoLinhas({ dados, series, formato, altura = 260, descricao }) {
  const [ref, w] = useLargura()
  const [i, setI] = useState(null)
  const h = altura
  const vals = dados.flatMap((d) => series.map((s) => d[s.chave]))
  const { ini, fim, ticks } = escalaY(Math.min(...vals), Math.max(...vals))
  const iw = w - M.l - M.r
  const ih = h - M.t - M.b
  const x = (k) => M.l + (dados.length === 1 ? iw / 2 : (k * iw) / (dados.length - 1))
  const y = (v) => M.t + ih - ((v - ini) / (fim - ini)) * ih
  const cadaRotulo = Math.max(1, Math.ceil(dados.length / Math.max(2, Math.floor(iw / 70))))

  const mover = (ev) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const px = (ev.touches?.[0]?.clientX ?? ev.clientX) - r.left
    const k = dados.length === 1 ? 0 : Math.round(((px - M.l) / iw) * (dados.length - 1))
    setI(Math.max(0, Math.min(dados.length - 1, k)))
  }

  return (
    <figure className="grafico" ref={ref}>
      <Legenda series={series} />
      <div className="graf-area">
        <svg width={w} height={h} role="img" aria-label={descricao}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'graf-base' : 'graf-grade'} />
              <text x={M.l - 8} y={y(t)} className="graf-eixo" textAnchor="end" dominantBaseline="middle">{formato.eixo(t)}</text>
            </g>
          ))}
          {dados.map((d, k) => (k % cadaRotulo === 0 || k === dados.length - 1) && (k === dados.length - 1 || dados.length - 1 - k >= cadaRotulo * 0.6) && (
            <text key={k} x={x(k)} y={h - 8} className="graf-eixo" textAnchor={k === 0 && dados.length > 1 ? 'start' : k === dados.length - 1 && dados.length > 1 ? 'end' : 'middle'}>{d.rotulo}</text>
          ))}
          {series.map((s) => (
            <path key={s.chave} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
              d={dados.map((d, k) => `${k ? 'L' : 'M'}${x(k)},${y(d[s.chave])}`).join('')} />
          ))}
          {dados.length <= 16 && series.map((s) => dados.map((d, k) => (
            <circle key={s.chave + k} cx={x(k)} cy={y(d[s.chave])} r="3" fill={s.cor} stroke="var(--superficie)" strokeWidth="2" />
          )))}
          {i !== null && (
            <g>
              <line x1={x(i)} x2={x(i)} y1={M.t} y2={M.t + ih} className="graf-mira" />
              {series.map((s) => <circle key={s.chave} cx={x(i)} cy={y(dados[i][s.chave])} r="5" fill={s.cor} stroke="var(--superficie)" strokeWidth="2" />)}
            </g>
          )}
          <rect x={M.l - 10} y={0} width={iw + 20} height={h} fill="transparent"
            onMouseMove={mover} onTouchStart={mover} onTouchMove={mover} onMouseLeave={() => setI(null)} />
        </svg>
        {i !== null && <Dica x={x(i)} w={w} titulo={dados[i].titulo}
          linhas={series.map((s) => [s.cor, s.nome, formato.dica(dados[i][s.chave])])} />}
      </div>
    </figure>
  )
}

/** Barras verticais de uma série. dados: [{ rotulo, titulo, valor, extra }] */
export function GraficoBarras({ dados, cor, formato, altura = 220, descricao, nome }) {
  const [ref, w] = useLargura()
  const [i, setI] = useState(null)
  const h = altura
  const { ini, fim, ticks } = escalaY(0, Math.max(...dados.map((d) => d.valor)))
  const iw = w - M.l - M.r
  const ih = h - M.t - M.b
  const banda = iw / dados.length
  const bw = Math.min(24, Math.max(3, banda * 0.7))
  const y = (v) => M.t + ih - ((v - ini) / (fim - ini)) * ih
  const cadaRotulo = Math.max(1, Math.ceil(dados.length / Math.max(2, Math.floor(iw / 34))))
  const barra = (cx, v) => {
    const top = y(v), base = y(0), r = Math.min(4, bw / 2, base - top)
    const l = cx - bw / 2, rr = cx + bw / 2
    if (v <= 0) return ''
    return `M${l},${base}V${top + r}Q${l},${top} ${l + r},${top}H${rr - r}Q${rr},${top} ${rr},${top + r}V${base}Z`
  }
  return (
    <figure className="grafico" ref={ref}>
      <div className="graf-area">
        <svg width={w} height={h} role="img" aria-label={descricao}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.l} x2={w - M.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'graf-base' : 'graf-grade'} />
              <text x={M.l - 8} y={y(t)} className="graf-eixo" textAnchor="end" dominantBaseline="middle">{formato.eixo(t)}</text>
            </g>
          ))}
          {dados.map((d, k) => {
            const cx = M.l + banda * (k + 0.5)
            return (
              <g key={k} onMouseEnter={() => setI(k)} onMouseLeave={() => setI(null)} onTouchStart={() => setI(k)}>
                <rect x={M.l + banda * k} y={M.t} width={banda} height={ih} fill={i === k ? 'var(--fundo)' : 'transparent'} />
                <path d={barra(cx, d.valor)} fill={cor} />
                {k % cadaRotulo === 0 && <text x={cx} y={h - 8} className="graf-eixo" textAnchor="middle">{d.rotulo}</text>}
              </g>
            )
          })}
        </svg>
        {i !== null && <Dica x={M.l + banda * (i + 0.5)} w={w} titulo={dados[i].titulo}
          linhas={[[cor, nome, formato.dica(dados[i].valor)], ...(dados[i].extra || []).map((e) => [null, e[0], e[1]])]} />}
      </div>
    </figure>
  )
}

/** Barra horizontal dentro de uma célula de tabela (comparação entre categorias). */
export function BarraCelula({ valor, max, cor = 'var(--serie-1)' }) {
  const pct = max > 0 ? Math.max(0, (valor / max) * 100) : 0
  return <span className="barra-celula" aria-hidden><i style={{ width: `${pct}%`, background: cor }} /></span>
}
