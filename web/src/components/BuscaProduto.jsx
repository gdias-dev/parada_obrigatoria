import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ScanBarcode, Search, X } from 'lucide-react'
import { get } from '../lib/api'
import { dinheiro, quantidade } from '../lib/format'

/**
 * Campo de busca para vender/lançar produto.
 * - Leitor de código de barras: "digita" o código e aperta Enter -> adiciona na hora.
 * - Multiplicador: "6*" antes do código ou do nome (ex.: 6*7891149103102) adiciona 6.
 * - Texto: mostra a lista; setas + Enter escolhem.
 * - Abaixo, botões por categoria para o que não tem código (drinks, copões, gelo…).
 */
const BuscaProduto = forwardRef(function BuscaProduto({ onEscolher, onErro, autoFocus = true, mostrarGrade = true }, ref) {
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState([])
  const [ativo, setAtivo] = useState(0)
  const [categorias, setCategorias] = useState([])
  const [categoria, setCategoria] = useState(null)
  const [grade, setGrade] = useState([])
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({ focar: () => inputRef.current?.focus() }))

  useEffect(() => { get('/categorias').then((c) => { setCategorias(c.filter((x) => x.produtos > 0)) }).catch(() => {}) }, [])

  useEffect(() => {
    if (!mostrarGrade) return
    const q = new URLSearchParams({ limite: 120, ordem: 'nome' })
    if (categoria) q.set('categoria', categoria)
    else q.set('ordem', 'categoria')
    get(`/produtos?${q}`).then((r) => setGrade(r.itens)).catch(() => {})
  }, [categoria, mostrarGrade])

  const [mult, termo] = (() => {
    const m = texto.match(/^\s*(\d{1,4})\s*[*xX]\s*(.*)$/)
    return m ? [Number(m[1]), m[2].trim()] : [1, texto.trim()]
  })()

  useEffect(() => {
    if (termo.length < 2 || /^\d{6,}$/.test(termo)) { setResultados([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      get(`/produtos?busca=${encodeURIComponent(termo)}&limite=8`, { signal: ctrl.signal })
        .then((r) => { setResultados(r.itens); setAtivo(0) }).catch(() => {})
    }, 150)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [termo])

  function escolher(p, qtd = mult) {
    if (!(p.preco_venda > 0)) {
      onErro?.(`"${p.nome}" está sem preço de venda. Cadastre o preço em Produtos.`)
      setTexto(''); setResultados([]); inputRef.current?.focus()
      return
    }
    onEscolher(p, qtd)
    setTexto(''); setResultados([])
    inputRef.current?.focus()
  }

  async function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(a + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Escape') { setTexto(''); setResultados([]) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (!termo) return
      // só números = código de barras
      if (/^\d{4,}$/.test(termo)) {
        try { escolher(await get(`/produtos/codigo?c=${termo}`)) }
        catch (err) { onErro?.(err.message); setTexto('') }
        return
      }
      if (resultados[ativo]) escolher(resultados[ativo])
    }
  }

  return (
    <div className="busca-produto">
      <div className="busca grande">
        <ScanBarcode size={20} aria-hidden />
        <input
          ref={inputRef} className="input" value={texto} autoFocus={autoFocus} autoComplete="off" spellCheck={false}
          onChange={(e) => setTexto(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Passe o leitor ou digite o nome (6* = 6 unidades)"
          aria-label="Buscar produto" role="combobox" aria-expanded={resultados.length > 0} aria-controls="busca-lista"
        />
        {texto && <button className="btn btn-texto btn-icone" onClick={() => { setTexto(''); inputRef.current?.focus() }} aria-label="Limpar"><X size={16} /></button>}
        {mult > 1 && <span className="mult" aria-live="polite">× {mult}</span>}
      </div>

      {resultados.length > 0 && (
        <ul className="busca-lista" id="busca-lista" role="listbox">
          {resultados.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === ativo}>
              <button onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(p)} className={i === ativo ? 'ativo' : ''}>
                {p.imagem ? <img className="busca-thumb" src={p.imagem} alt="" loading="lazy" /> : <span className="busca-thumb sem-foto" aria-hidden />}
                <span>
                  <strong>{p.nome}</strong>
                  <small>{infoEstoque(p)}</small>
                </span>
                <b>{p.preco_venda > 0 ? dinheiro(p.preco_venda) : <span className="falta">sem preço</span>}</b>
              </button>
            </li>
          ))}
        </ul>
      )}
      {termo.length >= 2 && !/^\d{4,}$/.test(termo) && resultados.length === 0 && (
        <p className="busca-nada"><Search size={14} aria-hidden /> Nenhum produto com “{termo}”.</p>
      )}

      {mostrarGrade && (
        <>
          <div className="chips cat-chips" role="group" aria-label="Categorias">
            <button className="chip" aria-pressed={!categoria} onClick={() => setCategoria(null)}>Todos</button>
            {categorias.map((c) => (
              <button key={c.id} className="chip" aria-pressed={categoria === c.id} onClick={() => setCategoria(c.id)}>{c.nome}</button>
            ))}
          </div>
          <div className="grade-produtos">
            {grade.map((p) => (
              <button key={p.id} className={`tile ${p.imagem ? 'tile-foto' : ''}`} onClick={() => escolher(p, mult)}>
                {p.imagem
                  ? <span className="tile-topo"><img className="tile-img" src={p.imagem} alt="" loading="lazy" /><span className="tile-nome">{p.nome}</span></span>
                  : <span className="tile-nome">{p.nome}</span>}
                <span className="tile-rodape">
                  <b>{p.preco_venda > 0 ? dinheiro(p.preco_venda) : <span className="falta">sem preço</span>}</b>
                  <small className={estiloEstoque(p)}>{infoEstoque(p, true)}</small>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
})

export function infoEstoque(p, curto = false) {
  if (p.dose_ml) {
    return curto ? `${p.estoque_embalagens} doses` : `Dose de ${p.dose_ml} ml · dá ${p.estoque_embalagens} doses (${quantidade(p.base_estoque)} garrafas)`
  }
  if (p.produto_base_id) {
    return curto ? `${p.estoque_embalagens} cx` : `Engradado com ${p.fator} · tem ${p.estoque_embalagens} (${quantidade(p.base_estoque)} un)`
  }
  if (!p.controla_estoque) return curto ? '' : 'Sem controle de estoque'
  return curto ? quantidade(p.estoque, p.unidade) : `Estoque: ${quantidade(p.estoque, p.unidade)}`
}

function estiloEstoque(p) {
  const e = p.produto_base_id ? p.estoque_embalagens : p.estoque
  if (!p.produto_base_id && !p.controla_estoque) return ''
  if (e <= 0) return 'zerado'
  if (!p.produto_base_id && e <= p.estoque_minimo) return 'baixo'
  return ''
}

export default BuscaProduto
