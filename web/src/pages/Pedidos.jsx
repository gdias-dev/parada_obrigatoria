import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bike, Check, Copy, MapPin, MessageCircle, Phone, Printer, Store, Trash2 } from 'lucide-react'
import { get, post } from '../lib/api'
import { useCaixa } from '../lib/caixa'
import { usePedidosAlerta } from '../lib/pedidosAlerta'
import { dataHora, dinheiro, numero, quantidade } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'
import BuscaProduto from '../components/BuscaProduto'
import PagamentoModal from '../components/PagamentoModal'
import { ReciboModal } from '../components/Recibo'
import { EscolherCliente, formatarTelefone } from '../components/Clientes'
import { tempoDesde } from './Comandas'

const STATUS = {
  novo: { rotulo: 'Novo', cls: 'novo' },
  aceito: { rotulo: 'Separando', cls: 'aceito' },
  pronto: { rotulo: 'Pronto p/ retirar', cls: 'pronto' },
  saiu_entrega: { rotulo: 'Saiu p/ entrega', cls: 'rota' },
  entregue: { rotulo: 'Entregue', cls: 'entregue' },
  cancelado: { rotulo: 'Cancelado', cls: 'cancelado' },
}

export default function Pedidos() {
  const toast = useToast()
  const alerta = usePedidosAlerta()
  const { caixa, sessao } = useCaixa()
  const [grupo, setGrupo] = useState('ativos')
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(null)      // pedido para escolher entregador
  const [recebendo, setRecebendo] = useState(null)    // pedido para receber pagamento
  const [cancelando, setCancelando] = useState(null)
  const [imprimir, setImprimir] = useState(null)
  const [recibo, setRecibo] = useState(null)
  const [novoTel, setNovoTel] = useState(false)
  const [ocupado, setOcupado] = useState(0)

  const carregar = useCallback(() => get(`/pedidos?grupo=${grupo}`).then(setLista).catch((e) => setErro(e.message)), [grupo])
  useEffect(() => { setLista(null); carregar() }, [carregar])
  // quando o alerta vê pedido novo, a lista recarrega
  useEffect(() => { if (grupo === 'ativos') carregar() }, [alerta.novos, alerta.andamento]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(carregar, 20000); return () => clearInterval(t) }, [carregar])

  async function acao(p, url, msg) {
    setOcupado(p.id)
    try { await post(url, {}); toast(msg); carregar(); alerta.recarregar() }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(0) }
  }

  async function alternarLoja() {
    try { await post('/config/loja-online', { ativo: !alerta.lojaAberta }); alerta.recarregar(); toast(alerta.lojaAberta ? 'Loja online fechada.' : 'Loja online aberta.') }
    catch (e) { toast(e.message, 'erro') }
  }

  const link = `${location.origin}/pedir`

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Pedidos online</h1>
          <p>Pedidos do site e por telefone/WhatsApp. Chega pedido novo, toca um alerta.</p>
        </div>
        <div className="acoes-topo">
          <label className={`interruptor loja-switch ${alerta.lojaAberta ? 'on' : ''}`}>
            <input type="checkbox" checked={alerta.lojaAberta} onChange={alternarLoja} />
            {alerta.lojaAberta ? 'Recebendo pedidos' : 'Loja online fechada'}
          </label>
          <Botao onClick={() => setNovoTel(true)}><Phone size={18} aria-hidden /> Pedido por telefone</Botao>
        </div>
      </div>

      <div className="link-loja">
        <span>Link para os clientes:</span>
        <a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a>
        <button className="btn btn-texto" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copiado. Coloque na bio do Instagram e no WhatsApp.') }}>
          <Copy size={16} aria-hidden /> Copiar
        </button>
      </div>

      <div className="segmento filtros-status" role="group" aria-label="Pedidos">
        <button aria-pressed={grupo === 'ativos'} onClick={() => setGrupo('ativos')}>Em andamento{alerta.novos > 0 && ` · ${alerta.novos} novo${alerta.novos > 1 ? 's' : ''}`}</button>
        <button aria-pressed={grupo === 'finalizados'} onClick={() => setGrupo('finalizados')}>Entregues (hoje e ontem)</button>
        <button aria-pressed={grupo === 'cancelados'} onClick={() => setGrupo('cancelados')}>Cancelados</button>
      </div>

      {!sessao && grupo === 'ativos' && (
        <Alerta tipo="aviso">Para receber o pagamento dos pedidos, {caixa ? `abra o ${caixa.nome}` : 'escolha o caixa deste aparelho'} em <Link to="/caixa">Caixa</Link>.</Alerta>
      )}
      <Alerta>{erro}</Alerta>

      {lista === null ? <p className="dica">Carregando…</p> : lista.length === 0 ? (
        <section className="painel vazio">
          <h3>{grupo === 'ativos' ? 'Nenhum pedido em andamento' : 'Nada por aqui'}</h3>
          {grupo === 'ativos' && <p>Quando um cliente pedir pelo site, ele aparece aqui com um aviso sonoro.</p>}
        </section>
      ) : (
        <div className="grade-pedidos">
          {lista.map((p) => (
            <article key={p.id} className={`pedido-card ${STATUS[p.status].cls}`}>
              <header>
                <div>
                  <span className={`etiqueta st-${STATUS[p.status].cls}`}>{STATUS[p.status].rotulo}</span>
                  <strong className="pc-codigo">{p.codigo}</strong>
                  {p.canal === 'telefone' && <small className="dica"> · por telefone</small>}
                </div>
                <small>{tempoDesde(p.criado_em)} · {p.criado_em.slice(11, 16)}</small>
              </header>

              <div className="pc-cliente">
                <strong>{p.cliente_nome}</strong>
                <a href={`https://wa.me/55${p.telefone}`} target="_blank" rel="noreferrer"><MessageCircle size={14} aria-hidden /> {formatarTelefone(p.telefone)}</a>
              </div>
              <p className="pc-endereco">
                {p.tipo === 'entrega'
                  ? <><MapPin size={14} aria-hidden /><span>{p.endereco} — <b>{p.bairro}</b>{p.referencia && <small> · {p.referencia}</small>}</span></>
                  : <><Store size={14} aria-hidden /><span><b>Retira na loja</b></span></>}
              </p>

              <ul className="pc-itens">
                {p.itens.map((i) => <li key={i.id} className={i.tipo === 'casco' ? 'casco' : ''}><span>{quantidade(i.quantidade)}× {i.nome}{i.cascos_devolvidos > 0 && ' (entrega o casco)'}</span><b>{dinheiro(i.total)}</b></li>)}
                {p.taxa_entrega > 0 && <li><span>Entrega</span><b>{dinheiro(p.taxa_entrega)}</b></li>}
              </ul>
              {p.observacao && <p className="pc-obs">“{p.observacao}”</p>}

              <div className="pc-total">
                <span>{p.forma}{p.troco_para ? ` · troco p/ ${dinheiro(p.troco_para)} (levar ${dinheiro(p.troco_para - p.total)})` : ''}</span>
                <strong>{dinheiro(p.total)}</strong>
              </div>
              {p.entregador && <p className="dica"><Bike size={14} aria-hidden /> {p.entregador}</p>}
              {p.status === 'cancelado' && p.motivo_cancelamento && <p className="pag-info erro">{p.motivo_cancelamento}</p>}

              <footer>
                {p.status === 'novo' && <>
                  <Botao className="btn-grande" onClick={() => acao(p, `/pedidos/${p.id}/aceitar`, `Pedido ${p.codigo} aceito.`)} carregando={ocupado === p.id}><Check size={18} aria-hidden /> Aceitar</Botao>
                  <Botao variante="perigo" onClick={() => setCancelando(p)}>Recusar</Botao>
                </>}
                {p.status === 'aceito' && (p.tipo === 'entrega'
                  ? <Botao onClick={() => setEnviando(p)}><Bike size={18} aria-hidden /> Enviar</Botao>
                  : <Botao onClick={() => acao(p, `/pedidos/${p.id}/despachar`, 'Pedido pronto para retirada.')} carregando={ocupado === p.id}>Pronto p/ retirar</Botao>)}
                {['aceito', 'pronto', 'saiu_entrega'].includes(p.status) && <>
                  <Botao variante={p.status === 'aceito' ? 'borda' : 'primario'} disabled={!sessao} onClick={() => setRecebendo(p)}>
                    {p.tipo === 'entrega' ? 'Entregue · receber' : 'Retirado · receber'}
                  </Botao>
                  <Botao variante="texto" onClick={() => setImprimir(p)}><Printer size={16} aria-hidden /> Imprimir</Botao>
                  <Botao variante="texto" onClick={() => setCancelando(p)}>Cancelar</Botao>
                </>}
                {p.status === 'entregue' && p.venda_id && (
                  <Botao variante="borda" onClick={async () => setRecibo(await get(`/vendas/${p.venda_id}`))}>Comprovante</Botao>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}

      {enviando && <EnviarModal pedido={enviando} onFechar={() => setEnviando(null)} onFeito={() => { setEnviando(null); toast('Saiu para entrega.'); carregar() }} />}
      {cancelando && <CancelarPedido pedido={cancelando} onFechar={() => setCancelando(null)} onFeito={() => { setCancelando(null); toast('Pedido cancelado.'); carregar(); alerta.recarregar() }} />}
      <PagamentoModal aberto={!!recebendo} devido={recebendo?.total || 0} permitirFiado={false} formaSugeridaId={recebendo?.forma_pagamento_id}
        titulo={recebendo ? `Receber pedido ${recebendo.codigo}` : ''} onFechar={() => setRecebendo(null)}
        onConfirmar={async (pagamentos) => {
          const r = await post(`/pedidos/${recebendo.id}/finalizar`, { caixa_sessao_id: sessao.id, pagamentos })
          setRecebendo(null); setRecibo(r.venda); toast(`Pedido ${r.pedido.codigo} finalizado.`); carregar()
        }} />
      <ReciboModal tipo="venda" dados={recibo} aberto={!!recibo} onFechar={() => setRecibo(null)} />
      {imprimir && <ViaEntrega pedido={imprimir} onFechar={() => setImprimir(null)} />}
      {novoTel && <NovoPedidoTelefone onFechar={() => setNovoTel(false)} onCriado={(p) => { setNovoTel(false); toast(`Pedido ${p.codigo} criado.`); setGrupo('ativos'); carregar(); alerta.recarregar() }} />}
    </div>
  )
}

function EnviarModal({ pedido, onFechar, onFeito }) {
  const [lista, setLista] = useState(null)
  const [escolhido, setEscolhido] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { get('/entregadores?ativos=1').then((l) => { setLista(l); if (l.length === 1) setEscolhido(l[0].id) }).catch((e) => setErro(e.message)) }, [])
  async function enviar() {
    setEnviando(true); setErro('')
    try { await post(`/pedidos/${pedido.id}/despachar`, { entregador_id: escolhido }); onFeito() }
    catch (e) { setErro(e.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo={`Enviar pedido ${pedido.codigo}`} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" onClick={onFechar}>Voltar</Botao><Botao onClick={enviar} disabled={!escolhido} carregando={enviando}><Bike size={18} aria-hidden /> Saiu para entrega</Botao></>}>
      <p>{pedido.endereco} — <b>{pedido.bairro}</b></p>
      <Alerta>{erro}</Alerta>
      {lista && lista.length === 0 && <Alerta tipo="aviso">Nenhum entregador cadastrado. O administrador cadastra em <Link to="/entregadores">Entregadores</Link>.</Alerta>}
      <div className="lista-escolha">
        {(lista || []).map((e) => (
          <button key={e.id} type="button" aria-pressed={escolhido === e.id} onClick={() => setEscolhido(e.id)}>
            <strong>{e.nome}</strong>
            <small>{e.veiculo || 'Entregador'} · recebe {e.modo_repasse === 'taxa' ? `a taxa (${dinheiro(pedido.taxa_entrega)})` : dinheiro(e.taxa_padrao)}{e.em_rota ? ` · ${e.em_rota} em rota` : ''}</small>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function CancelarPedido({ pedido, onFechar, onFeito }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const novo = pedido.status === 'novo'
  const MOTIVOS = ['Produto em falta', 'Fora da área de entrega', 'Cliente desistiu', 'Não conseguimos contato']
  async function cancelar(e) {
    e.preventDefault()
    try { await post(`/pedidos/${pedido.id}/cancelar`, { motivo }); onFeito() } catch (err) { setErro(err.message) }
  }
  return (
    <Modal titulo={`${novo ? 'Recusar' : 'Cancelar'} pedido ${pedido.codigo}`} aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Voltar</Botao><Botao variante="perigo" form="form-canc-ped" type="submit">{novo ? 'Recusar' : 'Cancelar pedido'}</Botao></>}>
      <form id="form-canc-ped" className="grid-form" onSubmit={cancelar}>
        {!novo && <p>Os produtos voltam para o estoque.</p>}
        <p className="dica">O cliente vê o motivo na página de acompanhamento. Avise também pelo WhatsApp.</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Motivo">{(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} autoFocus />}</Campo>
        <div className="chips">{MOTIVOS.map((m) => <button key={m} type="button" className="chip" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}</div>
      </form>
    </Modal>
  )
}

/** Via para o entregador / para separar: endereço, itens, total e troco. */
function ViaEntrega({ pedido: p, onFechar }) {
  return (
    <Modal titulo="Via do pedido" aberto onFechar={onFechar} largura={480}
      rodape={<Botao onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir</Botao>}>
      <div className="recibo-papel area-impressao">
        <div className="recibo">
          <header><img src="/logo.png" alt="" /><div><strong>Pedido {p.codigo}</strong><span>{dataHora(p.criado_em)} · {p.tipo === 'entrega' ? 'ENTREGA' : 'RETIRADA'}</span></div></header>
          <h2>{p.cliente_nome}</h2>
          <p className="recibo-meta">
            Tel.: {formatarTelefone(p.telefone)}<br />
            {p.tipo === 'entrega' && <>{p.endereco} — {p.bairro}{p.referencia && <><br />Ref.: {p.referencia}</>}</>}
          </p>
          <table>
            <thead><tr><th>Qtd</th><th>Item</th><th className="num">Valor</th></tr></thead>
            <tbody>
              {p.itens.map((i) => <tr key={i.id}><td>{quantidade(i.quantidade)}</td><td>{i.nome}{i.cascos_devolvidos > 0 && <small> · pegar {i.cascos_devolvidos} casco(s)</small>}</td><td className="num">{dinheiro(i.total)}</td></tr>)}
            </tbody>
          </table>
          <dl className="recibo-totais">
            {p.taxa_entrega > 0 && <><dt>Entrega</dt><dd>{dinheiro(p.taxa_entrega)}</dd></>}
            <dt className="total">Total a receber</dt><dd className="total">{dinheiro(p.total)}</dd>
          </dl>
          <dl className="recibo-pag">
            <dt>Pagamento</dt><dd>{p.forma}</dd>
            {p.troco_para && <><dt>Troco para {dinheiro(p.troco_para)}</dt><dd>levar {dinheiro(p.troco_para - p.total)}</dd></>}
          </dl>
          {p.observacao && <p className="recibo-meta">Obs.: {p.observacao}</p>}
        </div>
      </div>
    </Modal>
  )
}

function NovoPedidoTelefone({ onFechar, onCriado }) {
  const [cliente, setCliente] = useState(null)
  const [f, setF] = useState({ nome: '', telefone: '', tipo: 'entrega', endereco: '', referencia: '', bairro_id: '', bairro: '', taxa_entrega: '', forma_pagamento_id: '', troco_para: '', observacao: '' })
  const [itens, setItens] = useState([])
  const [bairros, setBairros] = useState([])
  const [formas, setFormas] = useState([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))

  useEffect(() => {
    get('/bairros').then((b) => setBairros(b.filter((x) => x.ativo))).catch(() => {})
    get('/formas-pagamento').then((l) => setFormas(l.filter((x) => x.tipo !== 'fiado'))).catch(() => {})
  }, [])
  useEffect(() => {
    if (!cliente) return
    const b = bairros.find((x) => x.nome.toLowerCase() === (cliente.bairro || '').toLowerCase())
    setF((x) => ({ ...x, nome: cliente.nome, telefone: formatarTelefone(cliente.telefone), endereco: cliente.endereco || '', referencia: cliente.referencia || '', bairro_id: b ? b.id : '', bairro: cliente.bairro || '' }))
  }, [cliente, bairros])

  const bairro = bairros.find((b) => b.id === Number(f.bairro_id))
  const taxa = f.tipo === 'entrega' ? (f.taxa_entrega !== '' ? numero(f.taxa_entrega) || 0 : bairro?.taxa || 0) : 0
  const subtotal = itens.reduce((s, i) => s + i.p.preco_venda * i.qtd, 0)

  async function criar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      onCriado(await post('/pedidos', {
        ...f, bairro_id: f.bairro_id || undefined, taxa_entrega: f.taxa_entrega || undefined,
        itens: itens.map((i) => ({ produto_id: i.p.id, quantidade: i.qtd, casco_trouxe: i.casco_trouxe })),
      }))
    } catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo="Pedido por telefone / WhatsApp" aberto onFechar={onFechar} largura={720}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-ped-tel" type="submit" carregando={enviando} disabled={!itens.length}>Criar pedido · {dinheiro(subtotal + taxa)}</Botao></>}>
      <form id="form-ped-tel" className="grid-form" onSubmit={criar}>
        <div className="campo"><span className="rotulo-mini">Cliente já cadastrado? (opcional)</span><EscolherCliente valor={cliente} onEscolher={setCliente} /></div>
        <div className="grid-form duas">
          <Campo rotulo="Nome">{(p) => <input {...p} className="input" value={f.nome} onChange={set('nome')} required />}</Campo>
          <Campo rotulo="Telefone">{(p) => <input {...p} className="input" value={f.telefone} onChange={set('telefone')} required inputMode="tel" />}</Campo>
        </div>
        <div className="segmento segmento-largo" role="group" aria-label="Entrega ou retirada">
          <button type="button" aria-pressed={f.tipo === 'entrega'} onClick={() => setF((x) => ({ ...x, tipo: 'entrega' }))}>Entrega</button>
          <button type="button" aria-pressed={f.tipo === 'retirada'} onClick={() => setF((x) => ({ ...x, tipo: 'retirada' }))}>Retirada</button>
        </div>
        {f.tipo === 'entrega' && (
          <div className="grid-form duas">
            {bairros.length > 0 ? (
              <Campo rotulo="Bairro">{(p) => (
                <select {...p} className="select" value={f.bairro_id} onChange={set('bairro_id')} required>
                  <option value="">Escolha</option>
                  {bairros.map((b) => <option key={b.id} value={b.id}>{b.nome} — {dinheiro(b.taxa)}</option>)}
                </select>
              )}</Campo>
            ) : <Campo rotulo="Bairro">{(p) => <input {...p} className="input" value={f.bairro} onChange={set('bairro')} required />}</Campo>}
            <Campo rotulo="Taxa de entrega" dica="Vazio = taxa do bairro">{(p) => <InputDinheiro {...p} value={f.taxa_entrega} onChange={set('taxa_entrega')} placeholder={bairro ? String(bairro.taxa).replace('.', ',') : '0,00'} />}</Campo>
            <Campo rotulo="Endereço">{(p) => <input {...p} className="input" value={f.endereco} onChange={set('endereco')} required />}</Campo>
            <Campo rotulo="Referência">{(p) => <input {...p} className="input" value={f.referencia} onChange={set('referencia')} />}</Campo>
          </div>
        )}
        <div className="campo">
          <span className="rotulo-mini">Produtos</span>
          <BuscaProduto mostrarGrade={false} autoFocus={false}
            onEscolher={(p, qtd) => setItens((l) => l.some((i) => i.p.id === p.id) ? l.map((i) => i.p.id === p.id ? { ...i, qtd: i.qtd + qtd } : i) : [...l, { p, qtd, casco_trouxe: false }])} />
          <ul className="pc-itens">
            {itens.map((i, k) => (
              <li key={i.p.id}>
                <span>{i.qtd}× {i.p.nome}{(i.p.usa_casco || i.p.casco_da_base) && (
                  <label className="mini-check"><input type="checkbox" checked={i.casco_trouxe} onChange={(e) => setItens((l) => l.map((x, j) => j === k ? { ...x, casco_trouxe: e.target.checked } : x))} /> entrega o casco</label>
                )}</span>
                <b>{dinheiro(i.p.preco_venda * i.qtd)}</b>
                <button type="button" className="btn btn-texto btn-icone" onClick={() => setItens((l) => l.filter((_, j) => j !== k))} aria-label={`Tirar ${i.p.nome}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </div>
        <div className="campo">
          <span className="rotulo-mini">Pagamento</span>
          <div className="chips">{formas.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={Number(f.forma_pagamento_id) === x.id} onClick={() => setF((y) => ({ ...y, forma_pagamento_id: x.id }))}>{x.nome}</button>)}</div>
        </div>
        {formas.find((x) => x.id === Number(f.forma_pagamento_id))?.tipo === 'dinheiro' && (
          <Campo rotulo="Troco para">{(p) => <InputDinheiro {...p} value={f.troco_para} onChange={set('troco_para')} />}</Campo>
        )}
        <Campo rotulo="Observação">{(p) => <input {...p} className="input" value={f.observacao} onChange={set('observacao')} maxLength={255} />}</Campo>
        <Alerta>{erro}</Alerta>
      </form>
    </Modal>
  )
}

