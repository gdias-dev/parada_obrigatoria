import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, Pencil, X, CheckCircle2, Receipt, Ban } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { arred } from '../lib/caixa'
import { dinheiro, numero, quantidade } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'
import BuscaProduto from '../components/BuscaProduto'
import PagamentoModal from '../components/PagamentoModal'
import { ReciboModal } from '../components/Recibo'
import { cascoDe } from './Pdv'
import { tempoDesde } from './Comandas'

export default function Comanda() {
  const { id } = useParams()
  const navegar = useNavigate()
  const toast = useToast()
  const { isAdmin } = useAuth()
  const { caixa, sessao } = useCaixa()
  const [c, setC] = useState(null)
  const [erro, setErro] = useState('')
  const [perguntaCasco, setPerguntaCasco] = useState(null)   // { produto, qtd }
  const [tirando, setTirando] = useState(null)
  const [extrato, setExtrato] = useState(false)
  const [desconto, setDesconto] = useState('')
  const [pagando, setPagando] = useState(false)
  const [concluida, setConcluida] = useState(null)
  const [reciboVenda, setReciboVenda] = useState(null)
  const [editando, setEditando] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [lancando, setLancando] = useState(false)
  const buscaRef = useRef(null)

  const carregar = useCallback(() => get(`/comandas/${id}`).then(setC).catch((e) => setErro(e.message)), [id])
  useEffect(() => { carregar() }, [carregar])

  async function lancar(produto, qtd, casco_trouxe = false) {
    setLancando(true)
    try {
      setC(await post(`/comandas/${id}/itens`, { produto_id: produto.id, quantidade: qtd, casco_trouxe }))
      toast(`Lançado: ${qtd > 1 ? qtd + '× ' : ''}${produto.nome}`)
    } catch (e) {
      toast(e.message, 'erro')
    } finally {
      setLancando(false)
      buscaRef.current?.focar()
    }
  }

  function escolher(produto, qtd) {
    if (cascoDe(produto)) setPerguntaCasco({ produto, qtd })
    else lancar(produto, qtd)
  }

  if (!c) return <div className="pagina">{erro ? <Alerta>{erro}</Alerta> : <p className="dica">Carregando…</p>}</div>

  const aberta = c.status === 'aberta'
  const itensAtivos = c.itens.filter((i) => !i.cancelado)
  const valorCascos = itensAtivos.filter((i) => i.tipo === 'casco').reduce((s, i) => s + i.total, 0)
  const desc = Math.min(numero(desconto) || 0, arred(c.total - valorCascos))
  const devido = arred(c.total - desc)

  async function fechar(pagamentos, clienteId) {
    const r = await post(`/comandas/${id}/fechar`, { caixa_sessao_id: sessao.id, desconto: desc || undefined, pagamentos, cliente_id: clienteId || undefined })
    setPagando(false)
    setC(r.comanda)
    setConcluida(r.venda)
  }

  return (
    <div className="pagina pagina-larga comanda-pagina">
      <Link to="/comandas" className="voltar"><ArrowLeft size={18} aria-hidden /> Comandas</Link>

      <div className="comanda-cab">
        <div>
          <h1>{c.nome_cliente}{aberta && <button className="btn btn-texto btn-icone" onClick={() => setEditando(true)} aria-label="Mudar nome"><Pencil size={18} /></button>}</h1>
          <p>
            {aberta ? `Aberta há ${tempoDesde(c.aberta_em)}` : c.status === 'fechada' ? `Fechada · venda nº ${c.venda_id}` : 'Cancelada'}
            {c.aberta_por && ` · por ${c.aberta_por}`}
            {c.observacao && ` · ${c.observacao}`}
          </p>
        </div>
        <div className="comanda-total">
          <span>Total</span>
          <strong>{dinheiro(c.total)}</strong>
        </div>
      </div>

      <div className="comanda-corpo">
        {aberta && (
          <section className="painel painel-corpo comanda-lancar">
            <h2>Lançar na comanda {lancando && <small className="dica">salvando…</small>}</h2>
            <BuscaProduto ref={buscaRef} onEscolher={escolher} onErro={(m) => toast(m, 'erro')} autoFocus={false} />
          </section>
        )}

        <section className="painel comanda-itens">
          <div className="painel-cab">
            <h2>Consumo</h2>
            <Botao variante="borda" onClick={() => setExtrato(true)} disabled={!itensAtivos.length}><FileText size={18} aria-hidden /> Extrato</Botao>
          </div>
          {c.itens.length === 0 ? <p className="vazio">Nada lançado ainda.</p> : (
            <ul className="lista-consumo">
              {c.itens.map((i) => (
                <li key={i.id} className={`${i.cancelado ? 'cancelado' : ''} ${i.tipo === 'casco' ? 'casco' : ''}`}>
                  <span className="lc-qtd">{quantidade(i.quantidade)}×</span>
                  <span className="lc-nome">
                    {i.nome}
                    <small>
                      {i.criado_em.slice(11, 16)}{i.usuario && ` · ${i.usuario}`}
                      {i.cascos_devolvidos > 0 && ` · trouxe casco`}
                      {i.cancelado && ` · retirado${i.motivo_cancelamento ? ': ' + i.motivo_cancelamento : ''}`}
                    </small>
                  </span>
                  <b>{dinheiro(i.total)}</b>
                  {aberta && !i.cancelado && i.tipo === 'produto' && (
                    <button className="btn btn-texto btn-icone" onClick={() => setTirando(i)} aria-label={`Tirar ${i.nome}`} title="Tirar da comanda"><X size={18} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {aberta && (
            <div className="comanda-fechar">
              {!sessao ? (
                <Alerta tipo="aviso">
                  Para receber o pagamento, {caixa ? `abra o ${caixa.nome}` : 'escolha o caixa deste aparelho'} em <Link to="/caixa">Caixa</Link>.
                </Alerta>
              ) : (
                <>
                  <label className="campo desconto-comanda">
                    <span className="rotulo-mini">Desconto</span>
                    <InputDinheiro value={desconto} onChange={setDesconto} />
                  </label>
                  <Botao className="btn-grande" disabled={!itensAtivos.length || devido <= 0} onClick={() => setPagando(true)}>
                    Fechar conta · {dinheiro(devido)}
                  </Botao>
                </>
              )}
              <button className="btn btn-texto" onClick={() => setCancelando(true)}><Ban size={16} aria-hidden /> Cancelar comanda</button>
            </div>
          )}
          {c.status === 'fechada' && c.venda_id && (
            <div className="comanda-fechar">
              <Botao variante="borda" onClick={async () => setReciboVenda(await get(`/vendas/${c.venda_id}`))}><Receipt size={18} aria-hidden /> Comprovante de pagamento</Botao>
            </div>
          )}
        </section>
      </div>

      {perguntaCasco && (
        <Modal titulo="O cliente trouxe o casco?" aberto onFechar={() => setPerguntaCasco(null)} largura={420}>
          <p>{perguntaCasco.qtd > 1 ? `${perguntaCasco.qtd}× ` : ''}{perguntaCasco.produto.nome}</p>
          <div className="botoes-casco">
            <Botao className="btn-grande" onClick={() => { const p = perguntaCasco; setPerguntaCasco(null); lancar(p.produto, p.qtd, true) }}>Sim, trouxe</Botao>
            <Botao variante="borda" className="btn-grande" onClick={() => { const p = perguntaCasco; setPerguntaCasco(null); lancar(p.produto, p.qtd, false) }}>
              Não · cobrar casco ({dinheiro(cascoDe(perguntaCasco.produto).valor * cascoDe(perguntaCasco.produto).porItem * perguntaCasco.qtd)})
            </Botao>
          </div>
        </Modal>
      )}

      <TirarItemModal item={tirando} comandaId={id} onFechar={() => setTirando(null)} onFeito={(nova) => { setTirando(null); setC(nova); toast('Item retirado e devolvido ao estoque.') }} />
      <ReciboModal tipo="comanda" dados={c} aberto={extrato} onFechar={() => setExtrato(false)} />
      <PagamentoModal aberto={pagando} devido={devido} titulo={`Fechar conta — ${c.nome_cliente}`} onFechar={() => setPagando(false)} onConfirmar={fechar} />
      <EditarModal aberto={editando} comanda={c} onFechar={() => setEditando(false)} onSalvo={(n) => { setEditando(false); setC(n) }} />
      <CancelarComandaModal aberto={cancelando} comanda={c} podeComItens={isAdmin} onFechar={() => setCancelando(false)}
        onFeito={() => { toast('Comanda cancelada.'); navegar('/comandas') }} />

      {concluida && (
        <Modal titulo="Conta fechada" aberto onFechar={() => navegar('/comandas')} largura={420}
          rodape={<>
            <Botao variante="borda" onClick={() => setReciboVenda(concluida)}><Receipt size={18} aria-hidden /> Comprovante</Botao>
            <Botao onClick={() => navegar('/comandas')} autoFocus>Voltar às comandas</Botao>
          </>}>
          <div className="venda-ok">
            <CheckCircle2 size={44} aria-hidden />
            <p>{c.nome_cliente} · {dinheiro(concluida.total)}</p>
            {concluida.pagamentos.reduce((s, p) => s + p.troco, 0) > 0
              ? <div className="troco-grande"><span>Troco</span><strong>{dinheiro(concluida.pagamentos.reduce((s, p) => s + p.troco, 0))}</strong></div>
              : <p className="dica">Sem troco.</p>}
          </div>
        </Modal>
      )}
      <ReciboModal tipo="venda" dados={reciboVenda} aberto={!!reciboVenda} onFechar={() => setReciboVenda(null)} />
    </div>
  )
}

function TirarItemModal({ item, comandaId, onFechar, onFeito }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { setMotivo(''); setErro('') }, [item])
  if (!item) return null
  async function tirar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { onFeito(await post(`/comandas/${comandaId}/itens/${item.id}/cancelar`, { motivo: motivo || undefined })) }
    catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Tirar da comanda" aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Voltar</Botao><Botao variante="perigo" form="form-tirar" type="submit" carregando={enviando}>Tirar item</Botao></>}>
      <form id="form-tirar" className="grid-form" onSubmit={tirar}>
        <p><b>{quantidade(item.quantidade)}× {item.nome}</b> ({dinheiro(item.total)}) volta para o estoque.</p>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Motivo (opcional)">{(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={255} placeholder="Ex.: lançado errado" autoFocus />}</Campo>
      </form>
    </Modal>
  )
}

function EditarModal({ aberto, comanda, onFechar, onSalvo }) {
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => { if (aberto) { setNome(comanda.nome_cliente); setObs(comanda.observacao || ''); setErro('') } }, [aberto, comanda])
  async function salvar(e) {
    e.preventDefault()
    try { onSalvo(await put(`/comandas/${comanda.id}`, { nome_cliente: nome, observacao: obs })) } catch (err) { setErro(err.message) }
  }
  return (
    <Modal titulo="Editar comanda" aberto={aberto} onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-ed-comanda" type="submit">Salvar</Botao></>}>
      <form id="form-ed-comanda" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Nome do cliente">{(p) => <input {...p} className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />}</Campo>
        <Campo rotulo="Observação">{(p) => <input {...p} className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={255} />}</Campo>
      </form>
    </Modal>
  )
}

function CancelarComandaModal({ aberto, comanda, podeComItens, onFechar, onFeito }) {
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (aberto) { setMotivo(''); setErro('') } }, [aberto])
  if (!aberto) return null
  const temItens = comanda.itens.some((i) => !i.cancelado)
  async function cancelar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { await post(`/comandas/${comanda.id}/cancelar`, { motivo }); onFeito() }
    catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }
  return (
    <Modal titulo="Cancelar comanda" aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Voltar</Botao>
        <Botao variante="perigo" form="form-canc-comanda" type="submit" carregando={enviando} disabled={temItens && !podeComItens}>Cancelar comanda</Botao></>}>
      <form id="form-canc-comanda" className="grid-form" onSubmit={cancelar}>
        {temItens && !podeComItens
          ? <Alerta tipo="aviso">Esta comanda tem consumo. Só o administrador pode cancelar. Se foi lançado errado, tire os itens um a um.</Alerta>
          : <p>{temItens ? 'Todos os itens voltam para o estoque e ninguém paga esta comanda.' : 'A comanda está vazia e será removida da lista.'}</p>}
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Motivo">{(p) => <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} disabled={temItens && !podeComItens} />}</Campo>
      </form>
    </Modal>
  )
}
