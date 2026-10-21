import { useEffect, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dinheiro, paraCampo } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from './ui'

export function formatarTelefone(t) {
  const d = String(t || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return t || ''
}

/** Texto sobre o fiado do cliente: quanto deve e quanto ainda pode comprar. */
export function situacaoFiado(c) {
  const deve = c.saldo_fiado
  const txtDeve = deve > 0.004 ? `deve ${dinheiro(deve)}` : deve < -0.004 ? `tem ${dinheiro(-deve)} de crédito` : 'não deve nada'
  if (c.limite_fiado === null) return `${txtDeve} · fiado sem limite`
  if (c.limite_fiado <= 0) return `${txtDeve} · fiado não liberado`
  return `${txtDeve} · pode comprar até ${dinheiro(Math.max(0, c.limite_fiado - deve))}`
}

/** Escolher um cliente (busca por nome, apelido ou telefone) ou cadastrar na hora. */
export function EscolherCliente({ valor, onEscolher, autoFocus }) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState([])
  const [novo, setNovo] = useState(null)

  useEffect(() => {
    if (valor || texto.trim().length < 2) { setLista([]); return }
    const t = setTimeout(() => {
      get(`/clientes?busca=${encodeURIComponent(texto.trim())}&limite=8`).then((r) => setLista(r.itens)).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [texto, valor])

  if (valor) {
    return (
      <div className="cliente-escolhido">
        <span>
          <strong>{valor.nome}{valor.apelido && ` (${valor.apelido})`}</strong>
          <small>{situacaoFiado(valor)}</small>
        </span>
        <button type="button" className="btn btn-texto btn-icone" onClick={() => onEscolher(null)} aria-label="Trocar cliente"><X size={18} /></button>
      </div>
    )
  }
  return (
    <div className="escolher-base">
      <div className="busca">
        <Search size={16} aria-hidden />
        <input className="input" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus={autoFocus}
          placeholder="Nome, apelido ou telefone do cliente" autoComplete="off" aria-label="Buscar cliente" />
      </div>
      {texto.trim().length >= 2 && (
        <ul className="busca-lista">
          {lista.map((c) => (
            <li key={c.id}><button type="button" onClick={() => { onEscolher(c); setTexto('') }}>
              <span><strong>{c.nome}{c.apelido && ` (${c.apelido})`}</strong><small>{situacaoFiado(c)}</small></span>
            </button></li>
          ))}
          <li><button type="button" onClick={() => setNovo({ nome: texto.trim() })}>
            <span><strong><UserPlus size={14} aria-hidden /> Cadastrar “{texto.trim()}”</strong><small>Novo cliente</small></span>
          </button></li>
        </ul>
      )}
      <ClienteModal cliente={novo} onFechar={() => setNovo(null)} onSalvo={(c) => { setNovo(null); setTexto(''); onEscolher(c) }} />
    </div>
  )
}

const VAZIO = { nome: '', apelido: '', telefone: '', endereco: '', bairro: '', referencia: '', observacao: '', limite_fiado: '', ativo: true }

/** cliente: null = fechado; {} ou {nome} = novo; com id = editar */
export function ClienteModal({ cliente, onFechar, onSalvo }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [f, setF] = useState(VAZIO)
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)
  const novo = cliente && !cliente.id

  useEffect(() => {
    if (!cliente) return
    setErro({})
    setF({ ...VAZIO, ...cliente,
      telefone: formatarTelefone(cliente.telefone || ''),
      limite_fiado: cliente.limite_fiado === null || cliente.limite_fiado === undefined ? '' : paraCampo(cliente.limite_fiado),
      apelido: cliente.apelido || '', endereco: cliente.endereco || '', bairro: cliente.bairro || '',
      referencia: cliente.referencia || '', observacao: cliente.observacao || '' })
  }, [cliente])

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro({})
    try {
      const salvo = novo ? await post('/clientes', f) : await put(`/clientes/${cliente.id}`, f)
      toast(novo ? `${salvo.nome} cadastrado.` : 'Cliente atualizado.')
      onSalvo(salvo)
    } catch (err) {
      setErro({ geral: err.data?.campo ? '' : err.message, [err.data?.campo]: err.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={novo ? 'Novo cliente' : 'Editar cliente'} aberto={!!cliente} onFechar={onFechar} largura={560}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-cliente" type="submit" carregando={enviando}>{novo ? 'Cadastrar' : 'Salvar'}</Botao></>}>
      <form id="form-cliente" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro.geral}</Alerta>
        <div className="grid-form duas">
          <Campo rotulo="Nome" erro={erro.nome}>{(p) => <input {...p} className="input" value={f.nome} onChange={set('nome')} required minLength={2} autoFocus autoCapitalize="words" />}</Campo>
          <Campo rotulo="Apelido (opcional)" dica="Como é conhecido no bar">{(p) => <input {...p} className="input" value={f.apelido} onChange={set('apelido')} maxLength={60} />}</Campo>
        </div>
        <Campo rotulo="Telefone / WhatsApp" erro={erro.telefone} dica="Usado para cobrar o fiado pelo WhatsApp">
          {(p) => <input {...p} className="input" inputMode="tel" value={f.telefone} onChange={set('telefone')} placeholder="(21) 99999-9999" />}
        </Campo>
        <div className="grid-form duas">
          <Campo rotulo="Endereço">{(p) => <input {...p} className="input" value={f.endereco} onChange={set('endereco')} maxLength={200} />}</Campo>
          <Campo rotulo="Bairro">{(p) => <input {...p} className="input" value={f.bairro} onChange={set('bairro')} maxLength={80} />}</Campo>
        </div>
        <Campo rotulo="Ponto de referência">{(p) => <input {...p} className="input" value={f.referencia} onChange={set('referencia')} maxLength={200} />}</Campo>
        {isAdmin ? (
          <Campo rotulo="Limite do fiado" erro={erro.limite_fiado} dica="Vazio = sem limite · 0 = não pode comprar fiado">
            {(p) => <InputDinheiro {...p} value={f.limite_fiado} onChange={set('limite_fiado')} placeholder="sem limite" />}
          </Campo>
        ) : (
          <p className="dica">O limite de fiado é definido pelo administrador.</p>
        )}
        <Campo rotulo="Observação">{(p) => <input {...p} className="input" value={f.observacao} onChange={set('observacao')} maxLength={255} />}</Campo>
        {isAdmin && !novo && (
          <label className="interruptor">
            <input type="checkbox" checked={!!f.ativo} onChange={set('ativo')} />
            <span>{f.ativo ? 'Cadastro ativo' : 'Cadastro desativado (não aparece nas buscas)'}</span>
          </label>
        )}
      </form>
    </Modal>
  )
}

/** Link do WhatsApp para cobrar/avisar o saldo do fiado. */
export function linkCobranca(c, loja = 'Parada Obrigatória') {
  const tel = String(c.telefone || '').replace(/\D/g, '')
  if (!tel) return null
  const texto = c.saldo_fiado > 0.004
    ? `Olá, ${c.apelido || c.nome.split(' ')[0]}! Passando para lembrar que seu saldo no fiado do ${loja} está em ${dinheiro(c.saldo_fiado)}. Pode acertar por Pix ou aqui no balcão. Obrigado!`
    : `Olá, ${c.apelido || c.nome.split(' ')[0]}! Aqui é do ${loja}.`
  return `https://wa.me/55${tel.replace(/^55/, '')}?text=${encodeURIComponent(texto)}`
}
