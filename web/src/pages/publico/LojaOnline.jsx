import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, X, Clock, Bike, Store, MessageCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { dinheiro, numero } from '../../lib/format'

const CHAVE_SACOLA = 'parada.sacola'
const CHAVE_CLIENTE = 'parada.clienteOnline'
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao } catch { return padrao } }
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const arred = (n) => Math.round(n * 100) / 100

export default function LojaOnline() {
  const navegar = useNavigate()
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [sacola, setSacola] = useState(() => ler(CHAVE_SACOLA, {}))     // { produtoId: { qtd, casco_trouxe } }
  const [vendoSacola, setVendoSacola] = useState(false)
  const [catAtiva, setCatAtiva] = useState(null)
  const secoes = useRef({})

  useEffect(() => {
    document.title = 'Peça online — Parada Obrigatória'
    api('/publico/cardapio').then(setDados).catch((e) => setErro(e.message))
  }, [])
  useEffect(() => gravar(CHAVE_SACOLA, sacola), [sacola])

  const produtos = useMemo(() => {
    const m = {}
    dados?.categorias.forEach((c) => c.produtos.forEach((p) => { m[p.id] = p }))
    return m
  }, [dados])

  // remove da sacola o que sumiu ou esgotou
  useEffect(() => {
    if (!dados) return
    setSacola((s) => Object.fromEntries(Object.entries(s).filter(([id]) => produtos[id]?.disponivel)))
  }, [dados, produtos])

  const itens = Object.entries(sacola).map(([id, v]) => ({ p: produtos[id], ...v })).filter((i) => i.p)
  const totalCascos = arred(itens.reduce((s, i) => s + (i.p.casco && !i.casco_trouxe ? i.p.casco.valor * i.p.casco.por_item * i.qtd : 0), 0))
  const totalProdutos = arred(itens.reduce((s, i) => s + i.p.preco * i.qtd, 0))
  const qtdItens = itens.reduce((s, i) => s + i.qtd, 0)

  const mudar = (id, delta) => setSacola((s) => {
    const atual = s[id]?.qtd || 0
    const qtd = Math.max(0, Math.min(99, atual + delta))
    const n = { ...s }
    if (qtd === 0) delete n[id]
    else n[id] = { casco_trouxe: false, ...s[id], qtd }
    return n
  })

  if (erro) return <div className="loja"><div className="loja-erro"><p>{erro}</p><button className="btn btn-primario" onClick={() => location.reload()}>Tentar de novo</button></div></div>
  if (!dados) return <div className="carregando-tela"><img src="/logo.png" alt="Carregando" /></div>

  const { loja } = dados
  const aberta = loja.pedidos_online_ativo === '1'
  const minimo = numero(loja.pedido_minimo) || 0

  return (
    <div className="loja">
      <header className="loja-topo">
        <img src="/logo.png" alt="" />
        <div>
          <h1>{loja.loja_nome}</h1>
          <p>{loja.loja_subtitulo}</p>
          <div className="loja-info">
            <span className={`loja-status ${aberta ? 'aberta' : ''}`}>{aberta ? 'Aberto para pedidos' : 'Fechado agora'}</span>
            {loja.tempo_entrega && <span><Clock size={14} aria-hidden /> {loja.tempo_entrega} min</span>}
            {minimo > 0 && <span>Pedido mínimo {dinheiro(minimo)}</span>}
          </div>
          {loja.horario_funcionamento && <p className="loja-horario">{loja.horario_funcionamento}</p>}
        </div>
      </header>

      {!aberta && (
        <div className="loja-aviso">
          No momento não estamos recebendo pedidos pelo site.
          {loja.loja_whatsapp && <> <a href={`https://wa.me/${loja.loja_whatsapp}`} target="_blank" rel="noreferrer">Chame no WhatsApp</a>.</>}
        </div>
      )}

      <nav className="loja-cats" aria-label="Categorias">
        {dados.categorias.map((c) => (
          <button key={c.id} className={catAtiva === c.id ? 'ativa' : ''}
            onClick={() => { setCatAtiva(c.id); secoes.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
            {c.nome}
          </button>
        ))}
      </nav>

      <main className="loja-produtos">
        {dados.categorias.map((c) => (
          <section key={c.id} ref={(el) => { secoes.current[c.id] = el }} className="loja-secao">
            <h2>{c.nome}</h2>
            <ul>
              {c.produtos.map((p) => {
                const q = sacola[p.id]?.qtd || 0
                return (
                  <li key={p.id} className={p.disponivel ? '' : 'esgotado'}>
                    {p.imagem && <img className="lp-foto" src={p.imagem} alt="" loading="lazy" />}
                    <div className="lp-info">
                      <strong>{p.nome}</strong>
                      {p.descricao && <small>{p.descricao}</small>}
                      <b>{dinheiro(p.preco)}{p.unidade !== 'UN' ? ` / ${p.unidade.toLowerCase()}` : ''}</b>
                      {p.casco && <small className="lp-casco">Retornável: traga o casco vazio ou paga {dinheiro(p.casco.valor * p.casco.por_item)} a mais</small>}
                    </div>
                    {!p.disponivel ? <span className="lp-esgotado">Esgotado</span> : q === 0 ? (
                      <button className="lp-add" onClick={() => mudar(p.id, 1)} disabled={!aberta} aria-label={`Adicionar ${p.nome}`}><Plus size={20} /></button>
                    ) : (
                      <div className="lp-qtd">
                        <button onClick={() => mudar(p.id, -1)} aria-label="Tirar um"><Minus size={16} /></button>
                        <span aria-live="polite">{q}</span>
                        <button onClick={() => mudar(p.id, 1)} aria-label="Mais um"><Plus size={16} /></button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        <footer className="loja-rodape">
          {loja.loja_endereco && <p>{loja.loja_endereco}</p>}
          {loja.loja_whatsapp && <a href={`https://wa.me/${loja.loja_whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden /> Fale com a gente no WhatsApp</a>}
        </footer>
      </main>

      {qtdItens > 0 && !vendoSacola && (
        <button className="loja-barra" onClick={() => setVendoSacola(true)}>
          <span><ShoppingBag size={20} aria-hidden /> {qtdItens} ite{qtdItens === 1 ? 'm' : 'ns'}</span>
          <b>Ver sacola · {dinheiro(totalProdutos + totalCascos)}</b>
        </button>
      )}

      {vendoSacola && (
        <Checkout dados={dados} itens={itens} totalProdutos={totalProdutos} totalCascos={totalCascos}
          onMudar={mudar} onCasco={(id, v) => setSacola((s) => ({ ...s, [id]: { ...s[id], casco_trouxe: v } }))}
          onFechar={() => setVendoSacola(false)}
          onEnviado={(codigo) => { setSacola({}); navegar(`/pedido/${codigo}`) }} />
      )}
    </div>
  )
}

function Checkout({ dados, itens, totalProdutos, totalCascos, onMudar, onCasco, onFechar, onEnviado }) {
  const { loja, formas, bairros } = dados
  const salvo = ler(CHAVE_CLIENTE, {})
  const aceitaRetirada = loja.aceita_retirada !== '0'
  const [f, setF] = useState({
    nome: salvo.nome || '', telefone: salvo.telefone || '', endereco: salvo.endereco || '', referencia: salvo.referencia || '',
    bairro_id: salvo.bairro_id && bairros.some((b) => b.id === salvo.bairro_id) ? salvo.bairro_id : '',
    bairro: salvo.bairro || '', tipo: 'entrega', forma_pagamento_id: '', troco_para: '', observacao: '', site: '',
  })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))

  const entrega = f.tipo === 'entrega'
  const bairro = bairros.find((b) => b.id === Number(f.bairro_id))
  const taxa = entrega && bairro ? bairro.taxa : 0
  const total = arred(totalProdutos + totalCascos + taxa)
  const forma = formas.find((x) => x.id === Number(f.forma_pagamento_id))
  const minimo = numero(loja.pedido_minimo) || 0
  const faltaMinimo = minimo > 0 && totalProdutos < minimo

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      const r = await api('/publico/pedidos', { method: 'POST', body: {
        ...f, bairro_id: f.bairro_id || undefined,
        itens: itens.map((i) => ({ produto_id: i.p.id, quantidade: i.qtd, casco_trouxe: i.casco_trouxe })),
      } })
      gravar(CHAVE_CLIENTE, { nome: f.nome, telefone: f.telefone, endereco: f.endereco, referencia: f.referencia, bairro_id: Number(f.bairro_id) || null, bairro: f.bairro })
      onEnviado(r.codigo)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="checkout-fundo" role="dialog" aria-modal="true" aria-label="Sua sacola">
      <form className="checkout" onSubmit={enviar}>
        <div className="checkout-cab">
          <h2>Sua sacola</h2>
          <button type="button" className="btn btn-texto btn-icone" onClick={onFechar} aria-label="Continuar comprando"><X size={22} /></button>
        </div>

        <ul className="checkout-itens">
          {itens.map((i) => (
            <li key={i.p.id}>
              <div className="ck-linha">
                <span className="ck-nome">{i.p.nome}<small>{dinheiro(i.p.preco)} cada</small></span>
                <div className="lp-qtd">
                  <button type="button" onClick={() => onMudar(i.p.id, -1)} aria-label="Tirar um"><Minus size={16} /></button>
                  <span>{i.qtd}</span>
                  <button type="button" onClick={() => onMudar(i.p.id, 1)} aria-label="Mais um"><Plus size={16} /></button>
                </div>
                <b>{dinheiro(i.p.preco * i.qtd)}</b>
              </div>
              {i.p.casco && (
                <label className="ck-casco">
                  <input type="checkbox" checked={!!i.casco_trouxe} onChange={(e) => onCasco(i.p.id, e.target.checked)} />
                  <span>Vou entregar {i.p.casco.por_item * i.qtd > 1 ? `${i.p.casco.por_item * i.qtd} cascos vazios` : 'o casco vazio'} na entrega
                    {!i.casco_trouxe && <small> (sem casco: + {dinheiro(i.p.casco.valor * i.p.casco.por_item * i.qtd)})</small>}</span>
                </label>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-texto" onClick={onFechar}>+ Adicionar mais itens</button>

        {aceitaRetirada && (
          <div className="segmento segmento-largo" role="group" aria-label="Entrega ou retirada">
            <button type="button" aria-pressed={entrega} onClick={() => setF((x) => ({ ...x, tipo: 'entrega' }))}><Bike size={16} aria-hidden /> Entrega</button>
            <button type="button" aria-pressed={!entrega} onClick={() => setF((x) => ({ ...x, tipo: 'retirada' }))}><Store size={16} aria-hidden /> Retirar na loja</button>
          </div>
        )}

        <div className="grid-form">
          <label className="campo"><span className="rotulo-mini">Seu nome</span><input className="input" value={f.nome} onChange={set('nome')} required autoComplete="name" /></label>
          <label className="campo"><span className="rotulo-mini">WhatsApp</span><input className="input" value={f.telefone} onChange={set('telefone')} required inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999" /></label>
          {entrega && (
            <>
              {bairros.length > 0 ? (
                <label className="campo"><span className="rotulo-mini">Bairro</span>
                  <select className="select" value={f.bairro_id} onChange={set('bairro_id')} required>
                    <option value="">Escolha o bairro</option>
                    {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome} — entrega {b.taxa > 0 ? dinheiro(b.taxa) : 'grátis'}</option>)}
                  </select>
                  <small className="dica">Não achou seu bairro? Chame no WhatsApp.</small>
                </label>
              ) : (
                <label className="campo"><span className="rotulo-mini">Bairro</span><input className="input" value={f.bairro} onChange={set('bairro')} required /></label>
              )}
              <label className="campo"><span className="rotulo-mini">Endereço (rua, número, complemento)</span><input className="input" value={f.endereco} onChange={set('endereco')} required autoComplete="street-address" /></label>
              <label className="campo"><span className="rotulo-mini">Ponto de referência (opcional)</span><input className="input" value={f.referencia} onChange={set('referencia')} /></label>
            </>
          )}
          <div className="campo">
            <span className="rotulo-mini">Pagamento {entrega ? 'na entrega' : 'na retirada'}</span>
            <div className="chips">
              {formas.map((x) => (
                <button key={x.id} type="button" className="chip chip-grande" aria-pressed={Number(f.forma_pagamento_id) === x.id} onClick={() => setF((y) => ({ ...y, forma_pagamento_id: x.id }))}>{x.nome}</button>
              ))}
            </div>
          </div>
          {forma?.tipo === 'dinheiro' && (
            <label className="campo"><span className="rotulo-mini">Troco para quanto? (opcional)</span><input className="input" inputMode="decimal" value={f.troco_para} onChange={set('troco_para')} placeholder="Ex.: 100" /></label>
          )}
          <label className="campo"><span className="rotulo-mini">Observação (opcional)</span><input className="input" value={f.observacao} onChange={set('observacao')} maxLength={255} placeholder="Ex.: bem gelada" /></label>
          {/* campo escondido contra robôs */}
          <input className="sr-only" tabIndex={-1} autoComplete="off" value={f.site} onChange={set('site')} aria-hidden="true" />
        </div>

        <dl className="checkout-total">
          <dt>Produtos</dt><dd>{dinheiro(totalProdutos)}</dd>
          {totalCascos > 0 && <><dt>Cascos</dt><dd>{dinheiro(totalCascos)}</dd></>}
          {entrega && <><dt>Entrega</dt><dd>{bairro ? (taxa > 0 ? dinheiro(taxa) : 'grátis') : '—'}</dd></>}
          <dt className="total">Total</dt><dd className="total">{dinheiro(total)}</dd>
        </dl>

        {faltaMinimo && <p className="pag-info erro">Pedido mínimo de {dinheiro(minimo)} em produtos. Faltam {dinheiro(minimo - totalProdutos)}.</p>}
        {erro && <p className="alerta alerta-erro" role="alert">{erro}</p>}
        <button className="btn btn-primario btn-bloco btn-grande" type="submit" disabled={enviando || faltaMinimo || !itens.length || !f.forma_pagamento_id}>
          {enviando ? 'Enviando…' : `Enviar pedido · ${dinheiro(total)}`}
        </button>
        <p className="dica centro">Você paga {entrega ? 'na entrega' : 'na retirada'}. Acompanhe o pedido na próxima tela.</p>
      </form>
    </div>
  )
}
