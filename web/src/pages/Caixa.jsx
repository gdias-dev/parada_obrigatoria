import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, Lock, Printer, Receipt, ShoppingCart, Unlock, Ban } from 'lucide-react'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { dataHora, dinheiro, numero } from '../lib/format'
import { Olhinho, din, usePrivacidade } from '../lib/privacidade'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'
import { ReciboModal } from '../components/Recibo'

export default function Caixa() {
  const { isAdmin } = useAuth()
  const { caixas, caixa, setCaixaId, recarregar, sessao } = useCaixa()
  const [trocando, setTrocando] = useState(false)
  const [relatorio, setRelatorio] = useState(null)

  if (!caixas) return <div className="pagina"><p className="dica">Carregando…</p></div>

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Caixa</h1>
          <p>{caixa ? <>Este aparelho é o <b>{caixa.nome}</b>. <button className="link" onClick={() => setTrocando(true)}>Trocar</button></> : 'Escolha qual caixa é este aparelho.'}</p>
        </div>
        {sessao && <Link to="/pdv" className="btn btn-primario"><ShoppingCart size={18} aria-hidden /> Ir para o PDV</Link>}
      </div>

      {(!caixa || trocando) && (
        <EscolherCaixa caixas={caixas} atual={caixa?.id} onEscolher={(id) => { setCaixaId(id); setTrocando(false) }} />
      )}

      {caixa && !trocando && (sessao
        ? <SessaoAberta sessaoId={sessao.id} onMudou={recarregar} onFechado={setRelatorio} />
        : <AbrirCaixa caixa={caixa} onAberto={recarregar} />)}

      {isAdmin && <Historico key={relatorio?.id || 0} />}
      {relatorio && <RelatorioFechamento s={relatorio} onFechar={() => setRelatorio(null)} />}
    </div>
  )
}

function EscolherCaixa({ caixas, atual, onEscolher }) {
  return (
    <section className="escolher-caixa">
      {caixas.map((c) => (
        <button key={c.id} className={`caixa-card ${atual === c.id ? 'atual' : ''}`} onClick={() => onEscolher(c.id)}>
          <strong>{c.nome}</strong>
          <span className={c.sessao ? 'aberto' : 'fechado'}>
            {c.sessao ? `Aberto por ${c.sessao.aberto_por} às ${c.sessao.aberto_em.slice(11, 16)}` : 'Fechado'}
          </span>
          <small>{atual === c.id ? 'Este aparelho' : 'Usar neste aparelho'}</small>
        </button>
      ))}
      <p className="dica">Use um caixa por computador. No celular dos garçons, escolha o caixa onde eles vão receber os pagamentos.</p>
    </section>
  )
}

function AbrirCaixa({ caixa, onAberto }) {
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function abrir(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      await post(`/caixas/${caixa.id}/abrir`, { valor_abertura: valor || '0' })
      toast(`${caixa.nome} aberto.`)
      onAberto()
    } catch (err) {
      setErro(err.message); onAberto()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="painel painel-corpo abrir-caixa" onSubmit={abrir}>
      <Unlock size={32} aria-hidden />
      <div className="grid-form">
        <h2>Abrir o {caixa.nome}</h2>
        <p className="dica">Conte o dinheiro de troco que está na gaveta antes de começar.</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Dinheiro na gaveta (troco)">{(p) => <InputDinheiro {...p} value={valor} onChange={setValor} autoFocus />}</Campo>
        <div><Botao type="submit" className="btn-grande" carregando={enviando}>Abrir caixa</Botao></div>
      </div>
    </form>
  )
}

function SessaoAberta({ sessaoId, onMudou, onFechado }) {
  usePrivacidade()
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [s, setS] = useState(null)
  const [vendas, setVendas] = useState([])
  const [mov, setMov] = useState(null)        // 'sangria' | 'suprimento'
  const [fechando, setFechando] = useState(false)
  const [recibo, setRecibo] = useState(null)
  const [cancelando, setCancelando] = useState(null)

  const carregar = useCallback(() => {
    get(`/caixa-sessoes/${sessaoId}`).then(setS).catch(() => {})
    get(`/vendas?sessao=${sessaoId}`).then(setVendas).catch(() => {})
  }, [sessaoId])
  useEffect(carregar, [carregar])

  if (!s) return <p className="dica">Carregando…</p>

  async function verVenda(id) {
    try { setRecibo(await get(`/vendas/${id}`)) } catch (e) { toast(e.message, 'erro') }
  }

  return (
    <>
      <div className="resumo-caixa">
        <Olhinho className="olhinho-caixa" />
        <div><span>Vendas</span><strong>{s.vendas}</strong>{s.canceladas > 0 && <small>{s.canceladas} cancelada{s.canceladas > 1 ? 's' : ''}</small>}</div>
        <div><span>Total vendido</span><strong>{din(s.total_vendido)}</strong>{isAdmin && s.lucro !== undefined && <small>lucro {din(s.lucro)}</small>}</div>
        <div className="destaque"><span>Dinheiro na gaveta</span><strong>{dinheiro(s.dinheiro_esperado)}</strong><small>troco {dinheiro(s.valor_abertura)} + vendas{s.total_recebido_fiado > 0 ? ' + fiado' : ''} − retiradas</small></div>
      </div>

      <div className="acoes-caixa">
        <Botao variante="borda" onClick={() => setMov('sangria')}><ArrowUpCircle size={18} aria-hidden /> Retirada (sangria)</Botao>
        <Botao variante="borda" onClick={() => setMov('suprimento')}><ArrowDownCircle size={18} aria-hidden /> Reforço de troco</Botao>
        <Botao variante="escuro" onClick={() => setFechando(true)}><Lock size={18} aria-hidden /> Fechar caixa</Botao>
      </div>

      <div className="caixa-colunas">
        <section className="painel">
          <div className="painel-cab"><h2>Por forma de pagamento</h2></div>
          {s.por_forma.length === 0 ? <p className="vazio">Nenhuma venda ainda.</p> : (
            <table className="tabela">
              <tbody>
                {s.por_forma.map((f) => (
                  <tr key={f.forma}><td>{f.forma}<span className="nome-sub">{f.qtd} pagamento{f.qtd > 1 ? 's' : ''}</span></td><td className="num"><b>{din(f.valor)}</b></td></tr>
                ))}
                {s.valor_cascos > 0 && <tr><td>Cascos cobrados<span className="nome-sub">depósito, não é lucro</span></td><td className="num">{din(s.valor_cascos)}</td></tr>}
              </tbody>
            </table>
          )}
          {s.recebido_fiado?.length > 0 && (
            <>
              <div className="painel-cab"><h2>Fiado recebido</h2></div>
              <table className="tabela">
                <tbody>
                  {s.recebido_fiado.map((f) => (
                    <tr key={f.forma}><td>{f.forma}<span className="nome-sub">{f.qtd} pagamento{f.qtd > 1 ? 's' : ''} de fiado</span></td><td className="num"><b>{din(f.valor)}</b></td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {s.movimentos.length > 0 && (
            <>
              <div className="painel-cab"><h2>Retiradas e reforços</h2></div>
              <table className="tabela">
                <tbody>
                  {s.movimentos.map((m, i) => (
                    <tr key={i}>
                      <td>{m.tipo === 'sangria' ? 'Retirada' : 'Reforço'}<span className="nome-sub">{m.motivo || '—'} · {m.usuario} · {m.criado_em.slice(11, 16)}</span></td>
                      <td className={`num ${m.tipo === 'sangria' ? 'negativo' : 'positivo'}`}>{m.tipo === 'sangria' ? '−' : '+'} {dinheiro(m.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <section className="painel">
          <div className="painel-cab"><h2>Vendas deste caixa</h2></div>
          {vendas.length === 0 ? <p className="vazio">Nenhuma venda ainda.</p> : (
            <ul className="lista-vendas">
              {vendas.map((v) => (
                <li key={v.id} className={v.status === 'cancelada' ? 'cancelada' : ''}>
                  <button className="lv-info" onClick={() => verVenda(v.id)}>
                    <strong>{v.comanda_nome ? `Comanda ${v.comanda_nome}` : `Venda nº ${v.id}`}</strong>
                    <small>{v.criado_em.slice(11, 16)} · {v.itens} ite{v.itens === 1 ? 'm' : 'ns'} · {v.formas}{v.status === 'cancelada' && ' · CANCELADA'}</small>
                  </button>
                  <b>{din(v.total)}</b>
                  <button className="btn btn-texto btn-icone" onClick={() => verVenda(v.id)} aria-label={`Comprovante da venda ${v.id}`} title="Comprovante"><Receipt size={18} /></button>
                  {v.status !== 'cancelada' && (
                    <button className="btn btn-texto btn-icone" onClick={() => setCancelando(v)} aria-label={`Cancelar venda ${v.id}`} title="Cancelar venda"><Ban size={18} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <MovimentoModal sessao={s} tipo={mov} onFechar={() => setMov(null)} onFeito={(novo) => { setS(novo); setMov(null) }} />
      <FecharModal sessao={s} aberto={fechando} onFechar={() => setFechando(false)}
        onFechado={(r) => { setFechando(false); onFechado(r); onMudou() }} />
      <CancelarVendaModal venda={cancelando} onFechar={() => setCancelando(null)} onFeito={() => { setCancelando(null); carregar() }} />
      <ReciboModal tipo="venda" dados={recibo} aberto={!!recibo} onFechar={() => setRecibo(null)} />
    </>
  )
}

function MovimentoModal({ sessao, tipo, onFechar, onFeito }) {
  const toast = useToast()
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { setValor(''); setMotivo(''); setErro('') }, [tipo])
  if (!tipo) return null
  const sangria = tipo === 'sangria'

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      const r = await post(`/caixa-sessoes/${sessao.id}/movimentos`, { tipo, valor, motivo })
      toast(sangria ? 'Retirada registrada.' : 'Reforço registrado.')
      onFeito(r)
    } catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo={sangria ? 'Retirada de dinheiro (sangria)' : 'Reforço de troco'} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" onClick={onFechar} type="button">Cancelar</Botao><Botao form="form-mov" type="submit" carregando={enviando}>Registrar</Botao></>}>
      <form id="form-mov" className="grid-form" onSubmit={salvar}>
        <p className="dica">{sangria ? `Dinheiro que sai da gaveta (pagar fornecedor, guardar no cofre…). Na gaveta agora: ${dinheiro(sessao.dinheiro_esperado)}.` : 'Dinheiro que entra na gaveta para ter troco.'}</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Valor">{(p) => <InputDinheiro {...p} value={valor} onChange={setValor} required autoFocus />}</Campo>
        <Campo rotulo={sangria ? 'Motivo' : 'Observação (opcional)'}>
          {(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required={sangria} maxLength={255} placeholder={sangria ? 'Ex.: pagamento do gelo' : ''} />}
        </Campo>
      </form>
    </Modal>
  )
}

function FecharModal({ sessao, aberto, onFechar, onFechado }) {
  const [contado, setContado] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (aberto) { setContado(''); setObs(''); setErro('') } }, [aberto])
  if (!aberto) return null
  const n = numero(contado)
  const dif = n === null ? null : Math.round((n - sessao.dinheiro_esperado) * 100) / 100

  async function fechar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { onFechado(await post(`/caixa-sessoes/${sessao.id}/fechar`, { valor_informado: contado, observacao: obs })) }
    catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo={`Fechar o ${sessao.caixa}`} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" onClick={onFechar} type="button">Voltar</Botao><Botao form="form-fechar" type="submit" variante="escuro" carregando={enviando} disabled={n === null}>Fechar caixa</Botao></>}>
      <form id="form-fechar" className="grid-form" onSubmit={fechar}>
        <p>Conte todo o dinheiro da gaveta (incluindo o troco) e digite o valor.</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Dinheiro contado">{(p) => <InputDinheiro {...p} value={contado} onChange={setContado} required autoFocus />}</Campo>
        {dif !== null && (
          <p className={`estoque-previa ${Math.abs(dif) < 0.005 ? '' : 'negativo'}`}>
            {Math.abs(dif) < 0.005 ? 'Bateu certinho com o sistema.'
              : dif < 0 ? `Está faltando ${dinheiro(-dif)} na gaveta.` : `Está sobrando ${dinheiro(dif)} na gaveta.`}
          </p>
        )}
        <Campo rotulo="Observação (opcional)">{(p) => <input {...p} className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={255} />}</Campo>
      </form>
    </Modal>
  )
}

export function CancelarVendaModal({ venda, onFechar, onFeito }) {
  const toast = useToast()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { setMotivo(''); setErro('') }, [venda])
  if (!venda) return null
  async function cancelar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { await post(`/vendas/${venda.id}/cancelar`, { motivo }); toast('Venda cancelada. Os produtos voltaram para o estoque.'); onFeito() }
    catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={`Cancelar venda nº ${venda.id}`} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Voltar</Botao><Botao variante="perigo" form="form-cancelar" type="submit" carregando={enviando}>Cancelar venda</Botao></>}>
      <form id="form-cancelar" className="grid-form" onSubmit={cancelar}>
        <p>Os produtos voltam para o estoque e o valor ({dinheiro(venda.total)}) sai do caixa. Devolva o dinheiro ao cliente se ele já pagou.</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Motivo">{(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus placeholder="Ex.: passou errado" />}</Campo>
      </form>
    </Modal>
  )
}

function RelatorioFechamento({ s, onFechar }) {
  return (
    <Modal titulo="Caixa fechado" aberto onFechar={onFechar} largura={520}
      rodape={<Botao onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir / PDF</Botao>}>
      <div className="recibo-papel area-impressao">
        <div className="recibo">
          <header><img src="/logo.png" alt="" /><div><strong>Fechamento de caixa</strong><span>{s.caixa}</span></div></header>
          <p className="recibo-meta">Aberto {dataHora(s.aberto_em)} por {s.aberto_por}<br />Fechado {dataHora(s.fechado_em)} por {s.fechado_por}</p>
          <dl className="recibo-totais">
            <dt>Vendas</dt><dd>{s.vendas}{s.canceladas ? ` (+${s.canceladas} canceladas)` : ''}</dd>
            <dt>Total vendido</dt><dd>{dinheiro(s.total_vendido)}</dd>
            {s.descontos > 0 && <><dt>Descontos dados</dt><dd>{dinheiro(s.descontos)}</dd></>}
            {s.por_forma.map((f) => <Linha key={f.forma} t={f.forma} v={f.valor} />)}
            {s.valor_cascos > 0 && <><dt>Cascos cobrados</dt><dd>{dinheiro(s.valor_cascos)}</dd></>}
          </dl>
          {s.recebido_fiado?.length > 0 && (
            <dl className="recibo-totais">
              {s.recebido_fiado.map((f) => <Linha key={f.forma} t={`Fiado recebido — ${f.forma}`} v={f.valor} />)}
            </dl>
          )}
          <dl className="recibo-totais">
            <dt>Troco inicial</dt><dd>{dinheiro(s.valor_abertura)}</dd>
            {s.suprimentos > 0 && <><dt>Reforços</dt><dd>+ {dinheiro(s.suprimentos)}</dd></>}
            {s.sangrias > 0 && <><dt>Retiradas</dt><dd>− {dinheiro(s.sangrias)}</dd></>}
            <dt>Dinheiro esperado</dt><dd>{dinheiro(s.dinheiro_esperado)}</dd>
            <dt>Dinheiro contado</dt><dd>{dinheiro(s.valor_informado)}</dd>
            <dt className="total">{s.diferenca < 0 ? 'Faltou' : s.diferenca > 0 ? 'Sobrou' : 'Diferença'}</dt><dd className={`total ${s.diferenca < 0 ? 'negativo' : ''}`}>{s.diferenca === 0 ? 'nenhuma' : dinheiro(Math.abs(s.diferenca))}</dd>
          </dl>
          {s.observacao && <p className="recibo-meta">Obs.: {s.observacao}</p>}
        </div>
      </div>
    </Modal>
  )
}
const Linha = ({ t, v }) => <><dt>{t}</dt><dd>{dinheiro(v)}</dd></>

function Historico() {
  usePrivacidade()
  const [lista, setLista] = useState(null)
  const [ver, setVer] = useState(null)
  useEffect(() => { get('/caixa-sessoes?limite=20').then(setLista).catch(() => setLista([])) }, [])
  const fechadas = (lista || []).filter((s) => s.status === 'fechado')
  if (!fechadas.length) return null
  return (
    <section className="painel" style={{ marginTop: 24 }}>
      <div className="painel-cab"><h2>Caixas fechados</h2><Olhinho /></div>
      <table className="tabela">
        <thead><tr><th>Caixa</th><th>Fechado</th><th className="num">Vendido</th><th className="num">Lucro</th><th className="num">Diferença</th><th><span className="sr-only">Ver</span></th></tr></thead>
        <tbody>
          {fechadas.map((s) => (
            <tr key={s.id}>
              <td>{s.caixa}<span className="nome-sub">{s.aberto_por} → {s.fechado_por}</span></td>
              <td data-rotulo="Fechado">{dataHora(s.fechado_em)}</td>
              <td className="num" data-rotulo="Vendido">{din(s.total_vendido)}</td>
              <td className="num positivo" data-rotulo="Lucro">{din(s.lucro)}</td>
              <td className={`num ${s.diferenca < 0 ? 'negativo' : ''}`} data-rotulo="Diferença">{s.diferenca === 0 ? '—' : dinheiro(s.diferenca)}</td>
              <td className="acoes"><Botao variante="texto" onClick={() => setVer(s)}><Printer size={16} aria-hidden /> Ver</Botao></td>
            </tr>
          ))}
        </tbody>
      </table>
      {ver && <RelatorioFechamento s={ver} onFechar={() => setVer(null)} />}
    </section>
  )
}
