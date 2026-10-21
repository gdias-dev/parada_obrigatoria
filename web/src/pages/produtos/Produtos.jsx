import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Search, FileSpreadsheet, Download, Tags, PackagePlus, Pencil, X } from 'lucide-react'
import { get } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dinheiro, porcentagem, quantidade } from '../../lib/format'
import { exportarProdutos } from '../../lib/planilha'
import { Alerta, Botao, useToast } from '../../components/ui'
import ProdutoModal from './ProdutoModal'
import EstoqueModal from './EstoqueModal'
import CategoriasModal from './CategoriasModal'

const POR_PAGINA = 60

const FILTROS = [
  ['ativos', 'Todos'],
  ['baixo', 'Acabando'],
  ['zerado', 'Sem estoque'],
  ['inativos', 'Desativados'],
]

function situacao(p) {
  if (p.produto_base_id) return p.base_controla && p.estoque_embalagens <= 0 ? 'zerado' : null
  if (!p.controla_estoque) return null
  if (p.estoque <= 0) return 'zerado'
  if (p.estoque <= p.estoque_minimo) return 'baixo'
  return null
}

export default function Produtos() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [categoria, setCategoria] = useState('')
  const [params] = useSearchParams()
  const [status, setStatus] = useState(() => (FILTROS.some(([v]) => v === params.get('status')) ? params.get('status') : 'ativos'))
  const [ordem, setOrdem] = useState('nome')
  const [dados, setDados] = useState({ total: 0, itens: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [resumo, setResumo] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [editando, setEditando] = useState(null)
  const [movendo, setMovendo] = useState(null)
  const [vendoCategorias, setVendoCategorias] = useState(false)
  const [exportando, setExportando] = useState(false)
  const buscaRef = useRef(null)

  const carregarCategorias = useCallback(() => get('/categorias').then(setCategorias).catch(() => {}), [])
  const carregarResumo = useCallback(() => get('/produtos/resumo').then(setResumo).catch(() => {}), [])

  const carregar = useCallback(async (offset = 0) => {
    setCarregando(true); setErro('')
    const q = new URLSearchParams({ status, ordem, limite: POR_PAGINA, offset })
    if (buscaAplicada) q.set('busca', buscaAplicada)
    if (categoria) q.set('categoria', categoria)
    try {
      const r = await get(`/produtos?${q}`)
      setDados((d) => (offset ? { total: r.total, itens: [...d.itens, ...r.itens] } : r))
    } catch (e) {
      setErro(e.message)
    } finally {
      setCarregando(false)
    }
  }, [status, ordem, buscaAplicada, categoria])

  useEffect(() => { carregar(0) }, [carregar])
  useEffect(() => { carregarCategorias(); carregarResumo() }, [carregarCategorias, carregarResumo])

  // busca enquanto digita (com pequena espera), Enter busca na hora (leitor de código)
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])

  // atalho: "/" foca a busca
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); buscaRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function aposSalvar(p) {
    setEditando(null); setMovendo(null)
    setDados((d) => ({ ...d, itens: d.itens.map((x) => (x.id === p.id ? { ...x, ...p } : x)) }))
    carregarResumo(); carregarCategorias()
    if (!dados.itens.some((x) => x.id === p.id)) carregar(0)
  }

  async function exportar() {
    setExportando(true)
    try {
      const itens = await get('/produtos/exportar')
      await exportarProdutos(itens)
      toast(`${itens.length} produtos exportados.`)
    } catch (e) {
      toast(e.message, 'erro')
    } finally {
      setExportando(false)
    }
  }

  const filtrando = buscaAplicada || categoria || status !== 'ativos'

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Produtos e estoque</h1>
          <p>{isAdmin ? 'Preços, custos, lucro e quantidades da loja.' : 'Consulte preços e lance a chegada de mercadoria.'}</p>
        </div>
        {isAdmin && (
          <div className="acoes-topo">
            <Botao variante="borda" onClick={() => setVendoCategorias(true)}><Tags size={18} aria-hidden /> Categorias</Botao>
            <Botao variante="borda" onClick={exportar} carregando={exportando}><Download size={18} aria-hidden /> Exportar</Botao>
            <Link to="/produtos/importar" className="btn btn-escuro"><FileSpreadsheet size={18} aria-hidden /> Importar planilha</Link>
            <Botao onClick={() => setEditando({})}><Plus size={18} aria-hidden /> Novo produto</Botao>
          </div>
        )}
      </div>

      {resumo && (
        <div className="resumo-estoque">
          <div><span>Produtos ativos</span><strong>{resumo.total}</strong></div>
          <button className={`alerta-card ${resumo.baixo ? 'tem' : ''}`} onClick={() => setStatus('baixo')} disabled={!resumo.baixo}>
            <span>Acabando</span><strong>{resumo.baixo}</strong>
          </button>
          <button className={`alerta-card ${resumo.zerado ? 'tem forte' : ''}`} onClick={() => setStatus('zerado')} disabled={!resumo.zerado}>
            <span>Sem estoque</span><strong>{resumo.zerado}</strong>
          </button>
          {isAdmin && (
            <div className="valor-estoque">
              <span>Estoque parado vale</span>
              <strong>{dinheiro(resumo.valor_custo)}</strong>
              <small>e rende {dinheiro(resumo.valor_venda)} se vender tudo</small>
            </div>
          )}
        </div>
      )}

      {isAdmin && resumo?.sem_custo > 0 && (
        <Alerta tipo="aviso">
          {resumo.sem_custo} produto{resumo.sem_custo > 1 ? 's estão' : ' está'} sem preço de custo. Sem ele, o relatório mostra lucro errado.
        </Alerta>
      )}

      <div className="barra-filtros">
        <div className="busca">
          <Search size={18} aria-hidden />
          <input ref={buscaRef} className="input" type="search" placeholder="Buscar por nome ou código de barras"
            value={busca} onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setBuscaAplicada(busca.trim()) }}
            aria-label="Buscar produto" autoComplete="off" />
          {busca && <button className="btn btn-texto btn-icone" onClick={() => { setBusca(''); buscaRef.current?.focus() }} aria-label="Limpar busca"><X size={16} /></button>}
        </div>
        <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="sem">Sem categoria</option>
        </select>
        <select className="select" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar">
          <option value="nome">Ordem alfabética</option>
          <option value="estoque">Menor estoque primeiro</option>
          <option value="recentes">Alterados recentemente</option>
          <option value="preco">Maior preço</option>
        </select>
      </div>

      <div className="segmento filtros-status" role="group" aria-label="Situação">
        {FILTROS.map(([v, t]) => <button key={v} aria-pressed={status === v} onClick={() => setStatus(v)}>{t}</button>)}
      </div>

      <Alerta>{erro}</Alerta>

      <section className="painel">
        {dados.itens.length === 0 && !carregando ? (
          <div className="vazio">
            {filtrando ? (
              <>
                <h3>Nenhum produto encontrado</h3>
                <p>Confira a busca ou os filtros.</p>
              </>
            ) : (
              <>
                <h3>Nenhum produto cadastrado</h3>
                <p>{isAdmin ? 'Cadastre um por um ou envie todos de uma vez pela planilha.' : 'Peça ao administrador para cadastrar os produtos.'}</p>
                {isAdmin && (
                  <div className="vazio-acoes">
                    <Link to="/produtos/importar" className="btn btn-escuro"><FileSpreadsheet size={18} aria-hidden /> Importar planilha</Link>
                    <Botao onClick={() => setEditando({})}><Plus size={18} aria-hidden /> Novo produto</Botao>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <table className="tabela tabela-produtos">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Estoque</th>
                <th className="num">Venda</th>
                {isAdmin && <th className="num">Custo</th>}
                {isAdmin && <th className="num">Lucro</th>}
                <th><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((p) => {
                const s = situacao(p)
                return (
                  <tr key={p.id} className={p.ativo ? '' : 'linha-inativa'}>
                    <td className="col-produto">
                      <strong>{p.nome}</strong>
                      <span className="nome-sub">
                        {p.categoria || 'Sem categoria'}{p.codigo_barras && ` · ${p.codigo_barras}`}{!p.ativo && ' · desativado'}
                        {p.dose_ml ? ` · dose de ${p.dose_ml} ml de ${p.base_nome}` : p.produto_base_id && ` · engradado com ${p.fator} × ${p.base_nome}`}
                        {p.usa_casco && ` · casco ${dinheiro(p.valor_casco)}`}
                      </span>
                    </td>
                    <td className="num" data-rotulo="Estoque">
                      {p.produto_base_id
                        ? p.dose_ml
                          ? <span className={`qtd ${s || ''}`}>{quantidade(p.estoque_embalagens)} doses<small className="nome-sub"> ({quantidade(p.base_estoque)} garrafas)</small></span>
                          : <span className={`qtd ${s || ''}`}>{quantidade(p.estoque_embalagens)} {p.unidade.toLowerCase()}<small className="nome-sub"> ({quantidade(p.base_estoque)} un)</small></span>
                        : p.controla_estoque
                          ? <span className={`qtd ${s || ''}`}>{quantidade(p.estoque, p.unidade)}{s === 'baixo' && <small> acabando</small>}{s === 'zerado' && <small> sem estoque</small>}</span>
                          : <span className="nome-sub">não controla</span>}
                      {p.usa_casco && <small className="nome-sub casco-info">{p.estoque_cascos} casco{p.estoque_cascos === 1 ? '' : 's'} vazio{p.estoque_cascos === 1 ? '' : 's'}</small>}
                    </td>
                    <td className="num preco" data-rotulo="Venda">{dinheiro(p.preco_venda)}</td>
                    {isAdmin && <td className="num" data-rotulo="Custo">{p.preco_custo > 0 ? dinheiro(p.preco_custo) : <span className="falta">sem custo</span>}</td>}
                    {isAdmin && (
                      <td className="num" data-rotulo="Lucro">
                        {p.preco_custo > 0
                          ? <span className={p.lucro_unitario < 0 ? 'negativo' : 'positivo'}>{dinheiro(p.lucro_unitario)} <small>{porcentagem(p.margem_pct)}</small></span>
                          : '—'}
                      </td>
                    )}
                    <td className="acoes">
                      {p.ativo && (p.controla_estoque || (p.produto_base_id && p.base_controla) || p.usa_casco) && (
                        <Botao variante="texto" onClick={() => setMovendo(p)} aria-label={`Movimentar estoque de ${p.nome}`}>
                          <PackagePlus size={16} aria-hidden /> Estoque
                        </Botao>
                      )}
                      {isAdmin && (
                        <Botao variante="texto" onClick={() => setEditando(p)} aria-label={`Editar ${p.nome}`}>
                          <Pencil size={16} aria-hidden /> Editar
                        </Botao>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {(carregando || dados.itens.length < dados.total) && (
          <div className="mais">
            {carregando ? 'Carregando…' : (
              <Botao variante="borda" onClick={() => carregar(dados.itens.length)}>
                Mostrar mais ({dados.total - dados.itens.length} restantes)
              </Botao>
            )}
          </div>
        )}
      </section>

      <ProdutoModal produto={editando} categorias={categorias} onFechar={() => setEditando(null)} onSalvo={aposSalvar} />
      {movendo && <EstoqueModal produto={movendo} onFechar={() => setMovendo(null)} onSalvo={aposSalvar} />}
      <CategoriasModal aberto={vendoCategorias} categorias={categorias} onFechar={() => setVendoCategorias(false)} onMudou={() => { carregarCategorias(); carregar(0) }} />
    </div>
  )
}
