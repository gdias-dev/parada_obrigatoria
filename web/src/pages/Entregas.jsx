import { useCallback, useEffect, useState } from 'react'
import { Bike, HandCoins, Pencil, Plus } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { dataHora, dinheiro, paraCampo } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'
import { formatarTelefone } from '../components/Clientes'

const hojeISO = () => new Date().toLocaleDateString('sv-SE')
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('sv-SE') }
const PERIODOS = [['hoje', 'Hoje', () => [hojeISO(), hojeISO()]], ['7', '7 dias', () => [diasAtras(6), hojeISO()]], ['30', '30 dias', () => [diasAtras(29), hojeISO()]], ['apagar', 'A pagar (tudo)', () => [null, null]]]

export default function Entregas() {
  const { isAdmin } = useAuth()
  const [periodo, setPeriodo] = useState('hoje')
  const [entregador, setEntregador] = useState('')
  const [dados, setDados] = useState(null)
  const [entregadores, setEntregadores] = useState([])
  const [acertando, setAcertando] = useState(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    const [de, ate] = PERIODOS.find((p) => p[0] === periodo)[2]()
    const q = new URLSearchParams()
    if (de) q.set('de', de)
    if (ate) q.set('ate', ate)
    if (periodo === 'apagar') q.set('pago', '0')
    if (entregador) q.set('entregador', entregador)
    get(`/entregas?${q}`).then(setDados).catch((e) => setErro(e.message))
    get('/entregadores').then(setEntregadores).catch(() => {})
  }, [periodo, entregador])
  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Entregas</h1>
          <p>Quantas entregas cada entregador fez e quanto ele tem a receber.</p>
        </div>
      </div>

      <div className="barra-filtros barra-comandas">
        <div className="segmento" role="group" aria-label="Período">
          {PERIODOS.map(([v, t]) => <button key={v} aria-pressed={periodo === v} onClick={() => setPeriodo(v)}>{t}</button>)}
        </div>
        <select className="select" value={entregador} onChange={(e) => setEntregador(e.target.value)} aria-label="Entregador">
          <option value="">Todos os entregadores</option>
          {entregadores.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </div>
      <Alerta>{erro}</Alerta>

      <div className="grade-entregadores">
        {entregadores.filter((e) => e.ativo || e.a_pagar > 0).filter((e) => !entregador || e.id === Number(entregador)).map((e) => {
          const periodoInfo = dados?.por_entregador.find((x) => x.entregador_id === e.id)
          return (
            <section key={e.id} className="painel painel-corpo entregador-card">
              <div className="ec-cab"><Bike size={22} aria-hidden /><div><strong>{e.nome}</strong><small>{e.modo_repasse === 'taxa' ? 'recebe a taxa da entrega' : `${dinheiro(e.taxa_padrao)} por entrega`}</small></div></div>
              <dl>
                <dt>Entregas no período</dt><dd>{periodoInfo?.entregas || 0}</dd>
                <dt>Em rota agora</dt><dd>{e.em_rota}</dd>
                <dt className="destaque">A receber</dt><dd className="destaque">{dinheiro(e.a_pagar)}<small> ({e.a_pagar_qtd} entrega{e.a_pagar_qtd === 1 ? '' : 's'})</small></dd>
              </dl>
              <Botao variante={e.a_pagar > 0 ? 'primario' : 'borda'} disabled={e.a_pagar <= 0} onClick={() => setAcertando(e)}><HandCoins size={18} aria-hidden /> Pagar entregador</Botao>
            </section>
          )
        })}
        {entregadores.length === 0 && <p className="dica">Nenhum entregador cadastrado{isAdmin ? ' — cadastre em Entregadores.' : '.'}</p>}
      </div>

      <section className="painel" style={{ marginTop: 16 }}>
        <div className="painel-cab"><h2>Entregas</h2></div>
        {!dados ? <p className="vazio">Carregando…</p> : dados.itens.length === 0 ? <p className="vazio">Nenhuma entrega no período.</p> : (
          <table className="tabela">
            <thead><tr><th>Pedido</th><th>Entregador</th><th>Saiu</th><th className="num">Taxa cobrada</th><th className="num">Entregador</th><th>Situação</th></tr></thead>
            <tbody>
              {dados.itens.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.codigo}</strong><span className="nome-sub">{e.cliente} · {e.bairro}</span></td>
                  <td data-rotulo="Entregador">{e.entregador}</td>
                  <td data-rotulo="Saiu">{dataHora(e.saiu_em)}</td>
                  <td className="num" data-rotulo="Taxa cobrada">{dinheiro(e.taxa_cobrada)}</td>
                  <td className="num" data-rotulo="Entregador">{dinheiro(e.valor_entregador)}</td>
                  <td data-rotulo="Situação">
                    {e.status === 'em_rota' ? <span className="etiqueta st-rota">Em rota</span>
                      : e.pago ? <span className="etiqueta etiqueta-inativo">Pago {e.pago_em?.slice(8, 10)}/{e.pago_em?.slice(5, 7)}</span>
                      : <span className="etiqueta etiqueta-pendente">A pagar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {acertando && <AcertoModal entregador={acertando} onFechar={() => setAcertando(null)} onFeito={() => { setAcertando(null); carregar() }} />}
    </div>
  )
}

function AcertoModal({ entregador, onFechar, onFeito }) {
  const toast = useToast()
  const { sessao, caixa } = useCaixa()
  const [doCaixa, setDoCaixa] = useState(!!sessao)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function pagar() {
    setEnviando(true); setErro('')
    try {
      const r = await post(`/entregadores/${entregador.id}/acertar`, { caixa_sessao_id: doCaixa && sessao ? sessao.id : undefined })
      toast(`${entregador.nome}: ${dinheiro(r.total)} pago (${r.entregas} entregas).`); onFeito()
    } catch (e) { setErro(e.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={`Pagar ${entregador.nome}`} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" onClick={onFechar}>Voltar</Botao><Botao onClick={pagar} carregando={enviando}>Confirmar pagamento de {dinheiro(entregador.a_pagar)}</Botao></>}>
      <p>{entregador.a_pagar_qtd} entrega{entregador.a_pagar_qtd === 1 ? '' : 's'} ainda não paga{entregador.a_pagar_qtd === 1 ? '' : 's'}: <b>{dinheiro(entregador.a_pagar)}</b>.</p>
      {sessao ? (
        <label className="interruptor">
          <input type="checkbox" checked={doCaixa} onChange={(e) => setDoCaixa(e.target.checked)} />
          <span>Tirar o dinheiro do {caixa.nome}<small>Registra uma retirada (sangria) no caixa aberto</small></span>
        </label>
      ) : <p className="dica">Nenhum caixa aberto neste aparelho: o pagamento fica registrado sem mexer no caixa.</p>}
      <Alerta>{erro}</Alerta>
    </Modal>
  )
}

export function Entregadores() {
  const [lista, setLista] = useState(null)
  const [editando, setEditando] = useState(null)
  const carregar = () => get('/entregadores').then(setLista).catch(() => setLista([]))
  useEffect(() => { carregar() }, [])
  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div><h1>Entregadores</h1><p>Quem faz as entregas e quanto recebe por entrega.</p></div>
        <Botao onClick={() => setEditando({})}><Plus size={18} aria-hidden /> Novo entregador</Botao>
      </div>
      <section className="painel">
        {!lista ? <p className="vazio">Carregando…</p> : lista.length === 0 ? <div className="vazio"><h3>Nenhum entregador</h3><p>Cadastre quem faz as entregas para poder enviar os pedidos.</p></div> : (
          <table className="tabela">
            <thead><tr><th>Entregador</th><th>Recebe</th><th className="num">A receber</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={e.ativo ? '' : 'linha-inativa'}>
                  <td><strong>{e.nome}</strong><span className="nome-sub">{[e.veiculo, formatarTelefone(e.telefone)].filter(Boolean).join(' · ')}{!e.ativo && ' · inativo'}</span></td>
                  <td data-rotulo="Recebe">{e.modo_repasse === 'taxa' ? 'A taxa de entrega cobrada' : `${dinheiro(e.taxa_padrao)} por entrega`}</td>
                  <td className="num" data-rotulo="A receber">{dinheiro(e.a_pagar)}</td>
                  <td className="acoes"><Botao variante="texto" onClick={() => setEditando(e)}><Pencil size={16} aria-hidden /> Editar</Botao></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {editando && <EntregadorModal entregador={editando} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar() }} />}
    </div>
  )
}

function EntregadorModal({ entregador, onFechar, onSalvo }) {
  const toast = useToast()
  const novo = !entregador.id
  const [f, setF] = useState({ nome: '', telefone: '', veiculo: 'Moto', modo_repasse: 'fixo', taxa_padrao: '', ativo: true,
    ...entregador, telefone: formatarTelefone(entregador.telefone || ''), taxa_padrao: entregador.id ? paraCampo(entregador.taxa_padrao) : '' })
  const [erro, setErro] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  async function salvar(e) {
    e.preventDefault()
    try { await (novo ? post('/entregadores', f) : put(`/entregadores/${entregador.id}`, f)); toast('Entregador salvo.'); onSalvo() }
    catch (err) { setErro(err.message) }
  }
  return (
    <Modal titulo={novo ? 'Novo entregador' : 'Editar entregador'} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-entregador" type="submit">Salvar</Botao></>}>
      <form id="form-entregador" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Nome">{(p) => <input {...p} className="input" value={f.nome} onChange={set('nome')} required autoFocus />}</Campo>
        <div className="grid-form duas">
          <Campo rotulo="Telefone">{(p) => <input {...p} className="input" value={f.telefone} onChange={set('telefone')} inputMode="tel" />}</Campo>
          <Campo rotulo="Veículo">{(p) => <input {...p} className="input" value={f.veiculo || ''} onChange={set('veiculo')} />}</Campo>
        </div>
        <div className="campo">
          <label>Quanto recebe por entrega</label>
          <div className="segmento segmento-largo" role="group">
            <button type="button" aria-pressed={f.modo_repasse === 'fixo'} onClick={() => set('modo_repasse')('fixo')}>Valor fixo</button>
            <button type="button" aria-pressed={f.modo_repasse === 'taxa'} onClick={() => set('modo_repasse')('taxa')}>A taxa inteira</button>
          </div>
          <span className="dica">{f.modo_repasse === 'taxa' ? 'Recebe exatamente a taxa de entrega que o cliente pagou.' : 'Recebe o mesmo valor em toda entrega, seja qual for o bairro.'}</span>
        </div>
        {f.modo_repasse === 'fixo' && <Campo rotulo="Valor por entrega">{(p) => <InputDinheiro {...p} value={f.taxa_padrao} onChange={set('taxa_padrao')} required />}</Campo>}
        {!novo && <label className="interruptor"><input type="checkbox" checked={f.ativo} onChange={set('ativo')} /> {f.ativo ? 'Ativo' : 'Inativo'}</label>}
      </form>
    </Modal>
  )
}
