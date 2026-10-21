import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Clock } from 'lucide-react'
import { get, post } from '../lib/api'
import { dataHora, dinheiro } from '../lib/format'
import { Alerta, Botao, Campo, Modal } from '../components/ui'

export function tempoDesde(s) {
  if (!s) return ''
  const min = Math.max(0, Math.round((Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 60000))
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h}h${String(min % 60).padStart(2, '0')}`
}

export default function Comandas() {
  const navegar = useNavigate()
  const [status, setStatus] = useState('aberta')
  const [lista, setLista] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [abrindo, setAbrindo] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    get(`/comandas?status=${status}`).then(setLista).catch((e) => setErro(e.message))
  }, [status])
  useEffect(() => { setLista(null); carregar() }, [carregar])
  // atualiza sozinho: outros garçons/caixas lançam itens ao mesmo tempo
  useEffect(() => {
    if (status !== 'aberta') return
    const t = setInterval(carregar, 15000)
    return () => clearInterval(t)
  }, [carregar, status])

  const visiveis = (lista || []).filter((c) => c.nome_cliente.toLowerCase().includes(filtro.trim().toLowerCase()))
  const totalAberto = (lista || []).reduce((s, c) => s + c.total, 0)

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>Comandas</h1>
          <p>{status === 'aberta' && lista ? `${lista.length} aberta${lista.length === 1 ? '' : 's'} · ${dinheiro(totalAberto)} a receber` : 'Contas do bar, abertas pelo nome do cliente.'}</p>
        </div>
        <Botao className="btn-grande" onClick={() => setAbrindo(true)}><Plus size={20} aria-hidden /> Abrir comanda</Botao>
      </div>

      <div className="barra-filtros barra-comandas">
        <div className="busca">
          <Search size={18} aria-hidden />
          <input className="input" type="search" placeholder="Procurar pelo nome" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Procurar comanda" />
        </div>
        <div className="segmento" role="group" aria-label="Situação">
          <button aria-pressed={status === 'aberta'} onClick={() => setStatus('aberta')}>Abertas</button>
          <button aria-pressed={status === 'fechada'} onClick={() => setStatus('fechada')}>Fechadas</button>
          <button aria-pressed={status === 'cancelada'} onClick={() => setStatus('cancelada')}>Canceladas</button>
        </div>
      </div>

      <Alerta>{erro}</Alerta>
      {lista === null ? <p className="dica">Carregando…</p> : visiveis.length === 0 ? (
        <section className="painel vazio">
          <h3>{filtro ? 'Nenhuma comanda com esse nome' : status === 'aberta' ? 'Nenhuma comanda aberta' : 'Nada por aqui'}</h3>
          {status === 'aberta' && !filtro && <p>Toque em “Abrir comanda” quando um cliente chegar.</p>}
        </section>
      ) : (
        <div className="grade-comandas">
          {visiveis.map((c) => (
            <button key={c.id} className={`comanda-card ${c.status}`} onClick={() => navegar(`/comandas/${c.id}`)}>
              <strong>{c.nome_cliente}</strong>
              <span className="cc-total">{dinheiro(c.total)}</span>
              <small>
                {c.qtd_itens} ite{c.qtd_itens === 1 ? 'm' : 'ns'} ·{' '}
                {c.status === 'aberta' ? <><Clock size={12} aria-hidden /> {tempoDesde(c.aberta_em)}</> : dataHora(c.fechada_em)}
              </small>
            </button>
          ))}
        </div>
      )}

      <AbrirComandaModal aberto={abrindo} onFechar={() => setAbrindo(false)} onAberta={(c) => navegar(`/comandas/${c.id}`)} />
    </div>
  )
}

function AbrirComandaModal({ aberto, onFechar, onAberta }) {
  const navegar = useNavigate()
  const [nome, setNome] = useState('')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { if (aberto) { setNome(''); setObs(''); setErro(null) } }, [aberto])

  async function abrir(e) {
    e.preventDefault()
    setEnviando(true); setErro(null)
    try { onAberta(await post('/comandas', { nome_cliente: nome, observacao: obs })) }
    catch (err) { setErro(err) } finally { setEnviando(false) }
  }

  return (
    <Modal titulo="Abrir comanda" aberto={aberto} onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-comanda" type="submit" carregando={enviando}>Abrir</Botao></>}>
      <form id="form-comanda" className="grid-form" onSubmit={abrir}>
        {erro && (
          <Alerta>
            {erro.message}
            {erro.data?.comanda_id && <> <button type="button" className="link" onClick={() => navegar(`/comandas/${erro.data.comanda_id}`)}>Ir para a comanda existente</button></>}
          </Alerta>
        )}
        <Campo rotulo="Nome do cliente" dica="Use apelido ou sobrenome se tiver dois com o mesmo nome">
          {(p) => <input {...p} className="input" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={100} autoFocus autoCapitalize="words" />}
        </Campo>
        <Campo rotulo="Observação (opcional)">
          {(p) => <input {...p} className="input" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={255} placeholder="Ex.: mesa de fora" />}
        </Campo>
      </form>
    </Modal>
  )
}
