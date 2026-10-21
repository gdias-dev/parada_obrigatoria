import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, MessageCircle } from 'lucide-react'
import { api } from '../../lib/api'
import { dataHora, dinheiro, quantidade } from '../../lib/format'

const PASSOS_ENTREGA = [['novo', 'Recebido'], ['aceito', 'Confirmado'], ['saiu_entrega', 'Saiu para entrega'], ['entregue', 'Entregue']]
const PASSOS_RETIRADA = [['novo', 'Recebido'], ['aceito', 'Confirmado'], ['pronto', 'Pronto para retirar'], ['entregue', 'Retirado']]

export default function Acompanhar() {
  const { codigo } = useParams()
  const [p, setP] = useState(null)
  const [loja, setLoja] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    document.title = `Pedido ${codigo} — Parada Obrigatória`
    api('/config/publica').then(setLoja).catch(() => {})
    const carregar = () => api(`/publico/pedido?codigo=${codigo}`).then(setP).catch((e) => setErro(e.message))
    carregar()
    const t = setInterval(carregar, 20000)
    return () => clearInterval(t)
  }, [codigo])

  if (erro && !p) return <div className="loja"><div className="loja-erro"><p>{erro}</p><Link className="btn btn-primario" to="/pedir">Fazer um pedido</Link></div></div>
  if (!p) return <div className="carregando-tela"><img src="/logo.png" alt="Carregando" /></div>

  const passos = p.tipo === 'retirada' ? PASSOS_RETIRADA : PASSOS_ENTREGA
  const atual = passos.findIndex(([s]) => s === p.status)
  const zap = loja?.loja_whatsapp && `https://wa.me/${loja.loja_whatsapp}?text=${encodeURIComponent(`Olá! Sobre o meu pedido ${p.codigo} (${p.nome}):`)}`

  return (
    <div className="loja acompanhar">
      <header className="loja-topo compacto">
        <img src="/logo.png" alt="" />
        <div><h1>Pedido {p.codigo}</h1><p>{p.nome} · {dataHora(p.criado_em)}</p></div>
      </header>

      <main className="loja-produtos">
        {p.status === 'cancelado' ? (
          <div className="acomp-cancelado">
            <h2>Pedido cancelado</h2>
            {p.motivo_cancelamento && <p>{p.motivo_cancelamento}</p>}
          </div>
        ) : (
          <ol className="acomp-passos">
            {passos.map(([s, rotulo], i) => (
              <li key={s} className={i < atual || p.status === 'entregue' ? 'feito' : i === atual ? 'atual' : ''}>
                <span className="bolinha">{i < atual || (i === atual && s === 'entregue') ? <Check size={14} /> : i + 1}</span>
                {rotulo}
              </li>
            ))}
          </ol>
        )}
        <p className="acomp-status" aria-live="polite">{p.status_texto}</p>
        {p.status === 'novo' && <p className="dica centro">A página atualiza sozinha. Guarde o código <b>{p.codigo}</b>.</p>}

        <section className="acomp-resumo">
          <h2>Resumo</h2>
          <ul>
            {p.itens.map((i, k) => <li key={k}><span>{quantidade(i.quantidade)}× {i.nome}</span><b>{dinheiro(i.total)}</b></li>)}
            {p.taxa_entrega > 0 && <li><span>Entrega</span><b>{dinheiro(p.taxa_entrega)}</b></li>}
            <li className="total"><span>Total</span><b>{dinheiro(p.total)}</b></li>
          </ul>
          <p className="dica">
            {p.tipo === 'entrega' ? `Entrega em: ${p.endereco} — ${p.bairro}` : 'Retirada na loja'}
            <br />Pagamento: {p.forma}{p.troco_para ? ` (troco para ${dinheiro(p.troco_para)})` : ''}
          </p>
        </section>

        {zap && <a className="btn btn-borda btn-bloco" href={zap} target="_blank" rel="noreferrer"><MessageCircle size={18} aria-hidden /> Falar com a loja</a>}
        <Link className="btn btn-texto btn-bloco" to="/pedir">Fazer outro pedido</Link>
      </main>
    </div>
  )
}
