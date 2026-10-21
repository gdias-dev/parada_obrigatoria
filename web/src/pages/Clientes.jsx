import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, HandCoins, MessageCircle, Pencil, Plus, Printer, Scale, Search, CheckCircle2 } from 'lucide-react'
import { get, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { dataHora, dinheiro, numero, paraCampo } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'
import { ClienteModal, formatarTelefone, linkCobranca, situacaoFiado } from '../components/Clientes'
import PagamentoModal from '../components/PagamentoModal'
import { ReciboModal } from '../components/Recibo'

const FILTROS = [['ativos', 'Todos'], ['devendo', 'Devendo'], ['inativos', 'Desativados']]

export default function ClientesLista() {
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('ativos')
  const [busca, setBusca] = useState('')
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState(null)

  const carregar = useCallback(() => {
    const q = new URLSearchParams({ filtro, limite: 300 })
    if (busca.trim()) q.set('busca', busca.trim())
    get(`/clientes?${q}`).then(setDados).catch((e) => setErro(e.message))
  }, [filtro, busca])
  useEffect(() => { const t = setTimeout(carregar, 200); return () => clearTimeout(t) }, [carregar])

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Clientes e fiado</h1>
          <p>Cadastro de clientes e quem está devendo.</p>
        </div>
        <Botao onClick={() => setNovo({})}><Plus size={18} aria-hidden /> Novo cliente</Botao>
      </div>

      {dados && (
        <div className="resumo-fiado">
          <button className={`alerta-card ${dados.devendo ? 'tem' : ''}`} onClick={() => setFiltro('devendo')}>
            <span>Clientes devendo</span><strong>{dados.devendo}</strong>
          </button>
          <div className="valor-estoque">
            <span>Total a receber no fiado</span>
            <strong>{dinheiro(dados.total_a_receber)}</strong>
          </div>
        </div>
      )}

      <div className="barra-filtros barra-comandas">
        <div className="busca">
          <Search size={18} aria-hidden />
          <input className="input" type="search" placeholder="Nome, apelido ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
        </div>
        <div className="segmento" role="group" aria-label="Filtro">
          {FILTROS.map(([v, t]) => <button key={v} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>)}
        </div>
      </div>

      <Alerta>{erro}</Alerta>
      <section className="painel">
        {!dados ? <p className="vazio">Carregando…</p> : dados.itens.length === 0 ? (
          <div className="vazio">
            <h3>{busca ? 'Ninguém encontrado' : filtro === 'devendo' ? 'Ninguém devendo' : 'Nenhum cliente cadastrado'}</h3>
            {!busca && filtro === 'ativos' && <p>Cadastre clientes para vender fiado e mandar cobrança pelo WhatsApp.</p>}
          </div>
        ) : (
          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Telefone</th><th className="num">Fiado</th><th>Última compra fiado</th></tr></thead>
            <tbody>
              {dados.itens.map((c) => (
                <tr key={c.id} className={`linha-clicavel ${c.ativo ? '' : 'linha-inativa'}`} onClick={() => navegar(`/clientes/${c.id}`)}>
                  <td>
                    <Link to={`/clientes/${c.id}`} onClick={(e) => e.stopPropagation()}><strong>{c.nome}</strong></Link>
                    {c.apelido && <span className="nome-sub">{c.apelido}</span>}
                  </td>
                  <td data-rotulo="Telefone">{formatarTelefone(c.telefone) || '—'}</td>
                  <td className="num" data-rotulo="Fiado">
                    {c.saldo_fiado > 0.004 ? <b className="negativo">{dinheiro(c.saldo_fiado)}</b>
                      : c.saldo_fiado < -0.004 ? <span className="positivo">crédito {dinheiro(-c.saldo_fiado)}</span> : '—'}
                  </td>
                  <td data-rotulo="Última compra">{c.ultima_compra ? dataHora(c.ultima_compra) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ClienteModal cliente={novo} onFechar={() => setNovo(null)} onSalvo={(c) => { setNovo(null); navegar(`/clientes/${c.id}`) }} />
    </div>
  )
}

const NOME_LANC = { debito: 'Compra fiado', pagamento: 'Pagamento', estorno: 'Abatimento' }

export function Cliente() {
  const { id } = useParams()
  const { isAdmin } = useAuth()
  const { caixa, sessao } = useCaixa()
  const toast = useToast()
  const [c, setC] = useState(null)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null)
  const [valorReceber, setValorReceber] = useState(null)    // etapa 1: quanto vai pagar
  const [pagando, setPagando] = useState(null)               // etapa 2: valor confirmado
  const [recibo, setRecibo] = useState(null)
  const [venda, setVenda] = useState(null)
  const [ajustando, setAjustando] = useState(false)

  const carregar = useCallback(() => get(`/clientes/${id}`).then(setC).catch((e) => setErro(e.message)), [id])
  useEffect(() => { carregar() }, [carregar])

  if (!c) return <div className="pagina">{erro ? <Alerta>{erro}</Alerta> : <p className="dica">Carregando…</p>}</div>

  const deve = c.saldo_fiado > 0.004
  const zap = linkCobranca(c)

  async function receber(pagamentos) {
    const r = await post(`/clientes/${id}/pagamentos`, { caixa_sessao_id: sessao.id, pagamentos })
    setPagando(null)
    setRecibo({ ...r.recibo, cliente: r.nome, saldo: r.saldo_fiado })
    toast('Pagamento registrado.')
    carregar()
  }

  async function verVenda(vid) {
    try { setVenda(await get(`/vendas/${vid}`)) } catch (e) { toast(e.message, 'erro') }
  }

  return (
    <div className="pagina pagina-larga">
      <Link to="/clientes" className="voltar"><ArrowLeft size={18} aria-hidden /> Clientes</Link>

      <div className="comanda-cab">
        <div>
          <h1>{c.nome}<button className="btn btn-texto btn-icone" onClick={() => setEditando(c)} aria-label="Editar cliente"><Pencil size={18} /></button></h1>
          <p>
            {[c.apelido, formatarTelefone(c.telefone), [c.endereco, c.bairro].filter(Boolean).join(' — ')].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
            {!c.ativo && ' · CADASTRO DESATIVADO'}
          </p>
          {c.observacao && <p className="dica">{c.observacao}</p>}
        </div>
        <div className={`comanda-total ${deve ? '' : 'quitado'}`}>
          <span>{deve ? 'Deve no fiado' : c.saldo_fiado < -0.004 ? 'Crédito na loja' : 'Fiado'}</span>
          <strong>{deve || c.saldo_fiado < -0.004 ? dinheiro(Math.abs(c.saldo_fiado)) : 'Em dia'}</strong>
          <small>{c.limite_fiado === null ? 'sem limite' : c.limite_fiado <= 0 ? 'fiado não liberado' : `limite ${dinheiro(c.limite_fiado)}`}</small>
        </div>
      </div>

      <div className="acoes-caixa">
        <Botao onClick={() => setValorReceber(paraCampo(Math.max(0, c.saldo_fiado)))} disabled={!deve || !sessao}>
          <HandCoins size={18} aria-hidden /> Receber pagamento
        </Botao>
        {zap && <a className="btn btn-borda" href={zap} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden /> {deve ? 'Cobrar no WhatsApp' : 'WhatsApp'}</a>}
        {isAdmin && <Botao variante="borda" onClick={() => setAjustando(true)}><Scale size={18} aria-hidden /> Ajustar conta</Botao>}
      </div>
      {deve && !sessao && (
        <Alerta tipo="aviso">Para receber o pagamento, {caixa ? `abra o ${caixa.nome}` : 'escolha o caixa deste aparelho'} em <Link to="/caixa">Caixa</Link>. O dinheiro entra no caixa aberto.</Alerta>
      )}

      <section className="painel" style={{ marginTop: 14 }}>
        <div className="painel-cab"><h2>Histórico do fiado</h2></div>
        {c.lancamentos.length === 0 ? <p className="vazio">Nenhuma compra fiado ainda.</p> : (
          <table className="tabela">
            <thead><tr><th>Data</th><th>Movimento</th><th className="num">Valor</th><th className="num">Ficou devendo</th></tr></thead>
            <tbody>
              {c.lancamentos.map((l) => (
                <tr key={l.id}>
                  <td data-rotulo="Data">{dataHora(l.criado_em)}</td>
                  <td>
                    <strong>{NOME_LANC[l.tipo]}{l.forma && ` · ${l.forma}`}</strong>
                    <span className="nome-sub">
                      {l.venda_id ? <button className="link" onClick={() => verVenda(l.venda_id)}>{l.observacao || `venda nº ${l.venda_id}`}</button> : l.observacao}
                      {l.usuario && `${l.observacao || l.venda_id ? ' · ' : ''}${l.usuario}`}
                    </span>
                  </td>
                  <td className={`num ${l.tipo === 'debito' ? 'negativo' : 'positivo'}`} data-rotulo="Valor">{l.tipo === 'debito' ? '+' : '−'} {dinheiro(l.valor)}</td>
                  <td className="num" data-rotulo="Ficou devendo">{dinheiro(l.saldo_apos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ClienteModal cliente={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />

      {valorReceber !== null && (
        <QuantoVaiPagar saldo={c.saldo_fiado} valor={valorReceber} onValor={setValorReceber}
          onFechar={() => setValorReceber(null)} onContinuar={(v) => { setValorReceber(null); setPagando(v) }} />
      )}
      <PagamentoModal aberto={pagando !== null} devido={pagando || 0} permitirFiado={false}
        titulo={`Pagamento do fiado — ${c.nome}`} onFechar={() => setPagando(null)} onConfirmar={receber} />
      {recibo && <ReciboFiado r={recibo} onFechar={() => setRecibo(null)} />}
      <ReciboModal tipo="venda" dados={venda} aberto={!!venda} onFechar={() => setVenda(null)} />
      {ajustando && <AjusteModal cliente={c} onFechar={() => setAjustando(false)} onFeito={() => { setAjustando(false); carregar() }} />}
    </div>
  )
}

function QuantoVaiPagar({ saldo, valor, onValor, onFechar, onContinuar }) {
  const n = numero(valor)
  const ok = n !== null && n > 0 && n <= saldo + 0.009
  return (
    <Modal titulo="Quanto o cliente vai pagar?" aberto onFechar={onFechar} largura={420}
      rodape={<><Botao variante="borda" onClick={onFechar}>Cancelar</Botao><Botao disabled={!ok} onClick={() => onContinuar(Math.round(n * 100) / 100)}>Continuar</Botao></>}>
      <p>Deve {dinheiro(saldo)}. Pode pagar tudo ou só uma parte.</p>
      <InputDinheiro value={valor} onChange={onValor} autoFocus aria-label="Valor a pagar"
        onKeyDown={(e) => { if (e.key === 'Enter' && ok) onContinuar(Math.round(n * 100) / 100) }} />
      <div className="chips">
        <button type="button" className="chip" onClick={() => onValor(paraCampo(saldo))}>Tudo ({dinheiro(saldo)})</button>
        {saldo > 20 && <button type="button" className="chip" onClick={() => onValor(paraCampo(Math.round(saldo * 50) / 100))}>Metade</button>}
      </div>
      {n !== null && n > saldo + 0.009 && <p className="pag-info erro">Maior que a dívida.</p>}
      {ok && n < saldo - 0.009 && <p className="dica">Depois deste pagamento ainda vai dever {dinheiro(saldo - n)}.</p>}
    </Modal>
  )
}

function ReciboFiado({ r, onFechar }) {
  const total = r.pagamentos.reduce((s, p) => s + p.abatido, 0)
  return (
    <Modal titulo="Pagamento registrado" aberto onFechar={onFechar} largura={460}
      rodape={<Botao onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir / PDF</Botao>}>
      <div className="venda-ok nao-imprimir">
        <CheckCircle2 size={40} aria-hidden />
        {r.pagamentos.some((p) => p.troco > 0) && (
          <div className="troco-grande"><span>Troco</span><strong>{dinheiro(r.pagamentos.reduce((s, p) => s + p.troco, 0))}</strong></div>
        )}
      </div>
      <div className="recibo-papel area-impressao">
        <div className="recibo">
          <header><img src="/logo.png" alt="" /><div><strong>Parada Obrigatória</strong><span>Comprovante de pagamento do fiado</span></div></header>
          <h2>{r.cliente}</h2>
          <p className="recibo-meta">{dataHora(r.criado_em)} · recebido por {r.usuario}</p>
          <dl className="recibo-pag">
            {r.pagamentos.map((p, i) => (
              <span key={i} style={{ display: 'contents' }}>
                <dt>{p.forma}{p.acrescimo > 0 ? ` (com acréscimo de ${dinheiro(p.acrescimo)})` : ''}</dt><dd>{dinheiro(p.valor)}</dd>
                {p.troco > 0 && <><dt>Troco</dt><dd>{dinheiro(p.troco)}</dd></>}
              </span>
            ))}
          </dl>
          <dl className="recibo-totais">
            <dt>Abatido da dívida</dt><dd>{dinheiro(total)}</dd>
            <dt className="total">{r.saldo > 0.004 ? 'Ainda deve' : 'Situação'}</dt>
            <dd className="total">{r.saldo > 0.004 ? dinheiro(r.saldo) : 'Quitado'}</dd>
          </dl>
          <footer>Obrigado! · Documento sem valor fiscal.</footer>
        </div>
      </div>
    </Modal>
  )
}

function AjusteModal({ cliente, onFechar, onFeito }) {
  const toast = useToast()
  const [tipo, setTipo] = useState('diminuir')
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { await post(`/clientes/${cliente.id}/ajuste`, { tipo, valor, motivo }); toast('Conta ajustada.'); onFeito() }
    catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Ajustar conta do fiado" aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-ajuste" type="submit" carregando={enviando}>Salvar ajuste</Botao></>}>
      <form id="form-ajuste" className="grid-form" onSubmit={salvar}>
        <p className="dica">Use para lançar dívida antiga do caderno, perdoar um valor ou corrigir erro. Não mexe no caixa.</p>
        <div className="segmento segmento-largo" role="group" aria-label="Tipo de ajuste">
          <button type="button" aria-pressed={tipo === 'diminuir'} onClick={() => setTipo('diminuir')}>Diminuir dívida</button>
          <button type="button" aria-pressed={tipo === 'aumentar'} onClick={() => setTipo('aumentar')}>Aumentar dívida</button>
        </div>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Valor">{(p) => <InputDinheiro {...p} value={valor} onChange={setValor} required autoFocus />}</Campo>
        <Campo rotulo="Motivo">{(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} placeholder={tipo === 'aumentar' ? 'Ex.: dívida antiga do caderno' : 'Ex.: desconto combinado'} />}</Campo>
        <p className="dica">Hoje: {situacaoFiado(cliente)}</p>
      </form>
    </Modal>
  )
}
