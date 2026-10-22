import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Camera, Check, ImageOff, Plus, ScanBarcode, Search, SkipForward, Sparkles, X } from 'lucide-react'
import { ApiError, enviarArquivo, get, post } from '../../lib/api'
import { reduzirImagem } from '../../lib/imagem'
import { dinheiro } from '../../lib/format'
import { Alerta, Botao, Modal, useToast } from '../../components/ui'
import ProdutoModal from './ProdutoModal'

const MOTIVO = {
  nao_encontrado: 'Não achei este código na base de fotos.',
  sem_foto: 'A base conhece o produto, mas não tem foto dele.',
  conexao: 'Não consegui consultar a base de fotos agora (internet do servidor).',
  codigo: 'Código fora do padrão de mercado: sem busca de foto.',
}

/** Código de barras e foto, um produto por vez ("passar a prateleira") ou em lote. */
export default function Prateleira() {
  const [aba, setAba] = useState('prateleira')
  const [categorias, setCategorias] = useState([])
  useEffect(() => { get('/categorias').then(setCategorias).catch(() => {}) }, [])
  return (
    <div className="pagina">
      <Link to="/produtos" className="voltar"><ArrowLeft size={16} aria-hidden /> Produtos</Link>
      <div className="pagina-topo">
        <div>
          <h1>Códigos e fotos</h1>
          <p>Passe cada produto no leitor: o sistema grava o código e já procura a foto.</p>
        </div>
      </div>
      <div className="segmento segmento-largo prat-abas" role="tablist">
        <button role="tab" aria-pressed={aba === 'prateleira'} aria-selected={aba === 'prateleira'} onClick={() => setAba('prateleira')}><ScanBarcode size={16} aria-hidden /> Passar a prateleira</button>
        <button role="tab" aria-pressed={aba === 'lote'} aria-selected={aba === 'lote'} onClick={() => setAba('lote')}><Sparkles size={16} aria-hidden /> Fotos automáticas</button>
      </div>
      {aba === 'prateleira' ? <PassarPrateleira categorias={categorias} /> : <FotosEmLote />}
    </div>
  )
}

// ---------------------------------------------------------------- passar a prateleira

function PassarPrateleira({ categorias }) {
  const toast = useToast()
  const inputRef = useRef(null)
  const [texto, setTexto] = useState('')
  const [atual, setAtual] = useState(null)   // { codigo, produto?, sugestao?, buscando }
  const [historico, setHistorico] = useState([])
  const [camera, setCamera] = useState(false)
  const [novo, setNovo] = useState(null)
  const temCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

  const focar = () => setTimeout(() => inputRef.current?.focus(), 50)
  const registrar = (nome, txt) => setHistorico((h) => [{ id: Date.now(), nome, txt }, ...h].slice(0, 30))

  const buscarSugestao = useCallback((codigo) => {
    setAtual((a) => (a && a.codigo === codigo ? { ...a, buscando: true } : a))
    get(`/produtos/foto-sugerida?codigo=${encodeURIComponent(codigo)}`)
      .then((s) => setAtual((a) => (a && a.codigo === codigo ? { ...a, sugestao: s, buscando: false } : a)))
      .catch(() => setAtual((a) => (a && a.codigo === codigo ? { ...a, sugestao: { achou: false, motivo: 'conexao' }, buscando: false } : a)))
  }, [])

  async function lerCodigo(codigo) {
    codigo = String(codigo || '').replace(/\s+/g, '')
    if (!codigo) return
    setTexto('')
    try {
      const produto = await get(`/produtos/codigo?c=${encodeURIComponent(codigo)}`)
      setAtual({ codigo, produto, buscando: !produto.tem_foto })
      if (!produto.tem_foto) buscarSugestao(codigo)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setAtual({ codigo, produto: null, buscando: true })
        buscarSugestao(codigo)
      } else toast(e.message, 'erro')
    }
  }

  async function ligar(produto) {
    try {
      const p = await post(`/produtos/${produto.id}/codigo`, { codigo_barras: atual.codigo })
      toast(`Código gravado em ${p.nome}.`)
      setAtual((a) => ({ ...a, produto: p }))
      if (p.tem_foto) { registrar(p.nome, 'código gravado'); terminar() }
    } catch (e) { toast(e.message, 'erro') }
  }

  async function usarSugestao() {
    try {
      const p = await post(`/produtos/${atual.produto.id}/foto-url`, { url: atual.sugestao.imagem_url })
      registrar(p.nome, 'código e foto prontos')
      toast(`Foto colocada em ${p.nome}.`)
      terminar()
    } catch (e) { toast(e.message, 'erro') }
  }

  async function fotoPropria(e) {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    try {
      const blob = await reduzirImagem(arq)
      const p = await enviarArquivo(`/produtos/${atual.produto.id}/foto`, 'foto', blob)
      registrar(p.nome, 'código e foto (tirada) prontos')
      toast(`Foto colocada em ${p.nome}.`)
      terminar()
    } catch (err) { toast(err.message, 'erro') }
  }

  function terminar() { setAtual(null); focar() }
  function pular() { if (atual?.produto) registrar(atual.produto.nome, 'sem foto'); terminar() }

  return (
    <>
      <form className="prat-leitor" onSubmit={(e) => { e.preventDefault(); lerCodigo(texto) }}>
        <div className="input-prefixo">
          <span aria-hidden><ScanBarcode size={22} /></span>
          <input ref={inputRef} className="input" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus inputMode="numeric"
            placeholder="Passe no leitor ou digite o código" aria-label="Código de barras" autoComplete="off" />
        </div>
        {temCamera && <Botao type="button" variante="borda" onClick={() => setCamera(true)}><Camera size={18} aria-hidden /> Ler com a câmera</Botao>}
      </form>

      {!atual && (
        <div className="painel painel-corpo prat-dica">
          <p><b>Como funciona:</b> passe um produto. Se o código for novo, escolha de qual produto ele é. Depois o sistema mostra a foto que encontrou: toque em <b>Usar esta foto</b> ou tire uma com o celular.</p>
        </div>
      )}

      {atual && (
        <section className="painel prat-cartao" aria-live="polite">
          <div className="painel-cab">
            <h2>Código {atual.codigo}</h2>
            <button className="btn btn-texto" onClick={terminar}><X size={16} aria-hidden /> Cancelar</button>
          </div>
          <div className="painel-corpo">
            {!atual.produto ? (
              <EscolherProduto codigo={atual.codigo} dica={atual.sugestao?.nome} onEscolher={ligar}
                onNovo={() => setNovo({ codigo_barras: atual.codigo, nome: atual.sugestao?.nome || '' })} />
            ) : (
              <EtapaFoto atual={atual} onUsar={usarSugestao} onArquivo={fotoPropria} onPular={pular} />
            )}
          </div>
        </section>
      )}

      {historico.length > 0 && (
        <section className="painel prat-historico">
          <div className="painel-cab"><h2>Feitos agora</h2><span className="dica">{historico.length}</span></div>
          <ul>{historico.map((h) => <li key={h.id}><Check size={16} aria-hidden /> <b>{h.nome}</b> <span>{h.txt}</span></li>)}</ul>
        </section>
      )}

      {camera && <LeitorCamera onLer={(c) => { setCamera(false); lerCodigo(c) }} onFechar={() => { setCamera(false); focar() }} />}
      <ProdutoModal produto={novo} categorias={categorias} onFechar={() => { setNovo(null); focar() }}
        onSalvo={(p) => { setNovo(null); setAtual((a) => ({ ...a, produto: p })); if (p.tem_foto) { registrar(p.nome, 'cadastrado com código'); terminar() } }} />
    </>
  )
}

function EtapaFoto({ atual, onUsar, onArquivo, onPular }) {
  const p = atual.produto
  const s = atual.sugestao
  const [enviando, setEnviando] = useState(false)
  const usar = async () => { setEnviando(true); await onUsar(); setEnviando(false) }
  return (
    <div className="prat-foto">
      <div className="prat-produto">
        <strong>{p.nome}</strong>
        <small>{p.categoria || 'Sem categoria'} · {p.preco_venda > 0 ? dinheiro(p.preco_venda) : 'sem preço'}</small>
      </div>
      {p.tem_foto ? (
        <div className="prat-sugestao">
          <img src={p.imagem} alt="" />
          <div>
            <p>Este produto já tem foto.</p>
            <div className="prat-botoes">
              <label className="btn btn-borda"><Camera size={16} aria-hidden /> Trocar foto<input type="file" accept="image/*" className="sr-only" onChange={onArquivo} /></label>
              <Botao variante="borda" onClick={onPular}><SkipForward size={16} aria-hidden /> Próximo</Botao>
            </div>
          </div>
        </div>
      ) : atual.buscando ? (
        <p className="dica">Procurando foto…</p>
      ) : (
        <div className="prat-sugestao">
          {s?.achou && s.imagem_url ? <img src={s.imagem_url} alt="Foto encontrada" /> : <div className="prat-sem"><ImageOff size={28} aria-hidden /></div>}
          <div>
            {s?.achou && s.imagem_url
              ? <p>Foto encontrada{s.nome ? <> para <b>{s.nome}</b></> : ''}. Confira se é o mesmo produto.</p>
              : <p>{MOTIVO[s?.motivo] || 'Nenhuma foto encontrada.'} Tire uma foto do produto.</p>}
            <div className="prat-botoes">
              {s?.achou && s.imagem_url && <Botao onClick={usar} carregando={enviando}><Check size={16} aria-hidden /> Usar esta foto</Botao>}
              <label className={`btn ${s?.achou ? 'btn-borda' : 'btn-primario'}`}><Camera size={16} aria-hidden /> Tirar / escolher foto<input type="file" accept="image/*" className="sr-only" onChange={onArquivo} /></label>
              <Botao variante="texto" onClick={onPular}><SkipForward size={16} aria-hidden /> Pular</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EscolherProduto({ codigo, dica, onEscolher, onNovo }) {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState([])
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  useEffect(() => {
    if (busca.trim().length < 2) { setLista([]); return }
    const t = setTimeout(() => get(`/produtos?limite=8&busca=${encodeURIComponent(busca.trim())}`).then((r) => setLista(r.itens)).catch(() => {}), 200)
    return () => clearTimeout(t)
  }, [busca])
  const primeira = dica ? dica.split(/\s+/).find((w) => w.length > 2) : null
  return (
    <div className="prat-escolher">
      <p><b>Código novo.</b> De qual produto ele é?{dica && <> A base de produtos diz: <b>{dica}</b>.</>}</p>
      <div className="busca">
        <Search size={16} aria-hidden />
        <input ref={ref} className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite parte do nome (ex.: heineken 600)" aria-label="Buscar produto" />
      </div>
      {primeira && !busca && <button type="button" className="chip" onClick={() => setBusca(primeira)}>Buscar “{primeira}”</button>}
      {lista.length > 0 && (
        <ul className="busca-lista prat-lista">
          {lista.map((p) => (
            <li key={p.id}><button type="button" onClick={() => onEscolher(p)}>
              {p.imagem ? <img className="busca-thumb" src={p.imagem} alt="" /> : <span className="busca-thumb sem-foto" aria-hidden />}
              <span><strong>{p.nome}</strong><small>{p.codigo_barras ? `já tem o código ${p.codigo_barras} (vai trocar)` : 'sem código'}</small></span>
            </button></li>
          ))}
        </ul>
      )}
      {busca.trim().length >= 2 && !lista.length && <p className="dica">Nenhum produto com esse nome.</p>}
      <Botao variante="borda" onClick={onNovo}><Plus size={16} aria-hidden /> Não está na lista: cadastrar produto novo com este código</Botao>
    </div>
  )
}

/** Lê o código pela câmera do celular (Chrome no Android). */
function LeitorCamera({ onLer, onFechar }) {
  const video = useRef(null)
  const [erro, setErro] = useState('')
  const lerRef = useRef(onLer)
  lerRef.current = onLer
  useEffect(() => {
    let stream, timer, parado = false
    ;(async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (parado) return
        video.current.srcObject = stream
        await video.current.play()
        const ler = async () => {
          if (parado) return
          try {
            const r = await detector.detect(video.current)
            if (r[0]?.rawValue) { navigator.vibrate?.(80); lerRef.current(r[0].rawValue); return }
          } catch {}
          timer = setTimeout(ler, 250)
        }
        ler()
      } catch { setErro('Não foi possível abrir a câmera. Libere a câmera para o site nas permissões do navegador.') }
    })()
    return () => { parado = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  return (
    <Modal titulo="Aponte para o código de barras" aberto onFechar={onFechar} largura={480}>
      <Alerta>{erro}</Alerta>
      <div className="prat-camera"><video ref={video} playsInline muted /><span className="prat-mira" aria-hidden /></div>
      <p className="dica centro">Segure firme, com o código dentro da faixa.</p>
    </Modal>
  )
}

// ---------------------------------------------------------------- fotos automáticas em lote

function FotosEmLote() {
  const toast = useToast()
  const [itens, setItens] = useState(null)   // produtos sem foto
  const [sug, setSug] = useState({})         // id -> sugestão | 'buscando'
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [usando, setUsando] = useState({})
  const parar = useRef(false)

  const carregar = () => get('/produtos/sem-foto').then(setItens).catch((e) => toast(e.message, 'erro'))
  useEffect(() => { carregar() }, [])
  useEffect(() => () => { parar.current = true }, [])

  if (!itens) return <p className="dica">Carregando…</p>
  const comCodigo = itens.filter((p) => p.codigo_barras && /^\d{8,14}$/.test(p.codigo_barras))
  const semCodigo = itens.filter((p) => !comCodigo.includes(p))
  const encontradas = comCodigo.filter((p) => sug[p.id]?.achou && sug[p.id]?.imagem_url)

  async function buscarTodas() {
    setRodando(true); parar.current = false; setProgresso(0)
    for (let i = 0; i < comCodigo.length && !parar.current; i++) {
      const p = comCodigo[i]
      if (sug[p.id] && sug[p.id] !== 'buscando') { setProgresso(i + 1); continue }
      setSug((s) => ({ ...s, [p.id]: 'buscando' }))
      try { const r = await get(`/produtos/foto-sugerida?codigo=${p.codigo_barras}`); setSug((s) => ({ ...s, [p.id]: r })) }
      catch { setSug((s) => ({ ...s, [p.id]: { achou: false, motivo: 'conexao' } })) }
      setProgresso(i + 1)
    }
    setRodando(false)
  }

  async function usar(p) {
    setUsando((u) => ({ ...u, [p.id]: true }))
    try {
      await post(`/produtos/${p.id}/foto-url`, { url: sug[p.id].imagem_url })
      setItens((l) => l.filter((x) => x.id !== p.id))
      return true
    } catch (e) { toast(`${p.nome}: ${e.message}`, 'erro'); return false } finally { setUsando((u) => ({ ...u, [p.id]: false })) }
  }
  async function usarTodas() {
    let n = 0
    for (const p of encontradas) if (await usar(p)) n++
    toast(`${n} ${n === 1 ? 'foto colocada' : 'fotos colocadas'}.`)
  }
  const descartar = (p) => setSug((s) => ({ ...s, [p.id]: { achou: false, motivo: 'descartada' } }))

  async function fotoPropria(p, e) {
    const arq = e.target.files?.[0]
    e.target.value = ''
    if (!arq) return
    try {
      const blob = await reduzirImagem(arq)
      await enviarArquivo(`/produtos/${p.id}/foto`, 'foto', blob)
      setItens((l) => l.filter((x) => x.id !== p.id))
      toast(`Foto colocada em ${p.nome}.`)
    } catch (err) { toast(err.message, 'erro') }
  }

  if (!itens.length) return <div className="painel painel-corpo vazio"><p>Todos os produtos ativos já têm foto. 🎉</p></div>

  return (
    <>
      <section className="painel painel-corpo prat-lote-topo">
        <p><b>{itens.length}</b> produtos sem foto: <b>{comCodigo.length}</b> com código de barras (dá para buscar a foto) e <b>{semCodigo.length}</b> sem código.</p>
        <div className="prat-botoes">
          {comCodigo.length > 0 && (rodando
            ? <Botao variante="borda" onClick={() => { parar.current = true }}>Parar ({progresso}/{comCodigo.length})</Botao>
            : <Botao onClick={buscarTodas}><Sparkles size={16} aria-hidden /> Buscar fotos ({comCodigo.length})</Botao>)}
          {encontradas.length > 0 && !rodando && <Botao variante="escuro" onClick={usarTodas}><Check size={16} aria-hidden /> Usar todas as encontradas ({encontradas.length})</Botao>}
        </div>
        {rodando && <div className="prat-progresso" role="progressbar" aria-valuenow={progresso} aria-valuemax={comCodigo.length}><i style={{ width: `${(progresso / comCodigo.length) * 100}%` }} /></div>}
        <p className="dica">Confira cada foto antes de usar: a busca é pelo código, mas a base pode ter a embalagem antiga.</p>
      </section>

      <ul className="prat-grade">
        {[...comCodigo, ...semCodigo].map((p) => {
          const s = sug[p.id]
          return (
            <li key={p.id} className="painel">
              <div className="prat-grade-img">
                {s === 'buscando' ? <span className="dica">buscando…</span>
                  : s?.achou && s.imagem_url ? <img src={s.imagem_url} alt="" loading="lazy" />
                  : <ImageOff size={24} aria-hidden />}
              </div>
              <div className="prat-grade-info">
                <strong>{p.nome}</strong>
                <small>{s?.achou && s.nome ? `base: ${s.nome}` : !p.codigo_barras ? 'sem código de barras' : s && s !== 'buscando' ? (s.motivo === 'descartada' ? 'foto descartada' : MOTIVO[s.motivo]) : p.codigo_barras}</small>
                <div className="prat-botoes">
                  {s?.achou && s.imagem_url && <>
                    <Botao className="btn-mini" onClick={() => usar(p)} carregando={usando[p.id]}><Check size={14} aria-hidden /> Usar</Botao>
                    <button type="button" className="btn btn-texto btn-mini" onClick={() => descartar(p)}><X size={14} aria-hidden /> Não é</button>
                  </>}
                  <label className="btn btn-borda btn-mini"><Camera size={14} aria-hidden /> Foto<input type="file" accept="image/*" className="sr-only" onChange={(e) => fotoPropria(p, e)} /></label>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
