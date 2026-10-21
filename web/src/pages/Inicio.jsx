import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ClipboardList, DatabaseBackup, Globe, Package, ShoppingCart, ChevronRight } from 'lucide-react'
import { get } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { dinheiro, quantidade, saudacao } from '../lib/format'

const ATALHOS = [
  { para: '/pdv', rotulo: 'Nova venda', desc: 'Balcão e mercadinho', icone: ShoppingCart },
  { para: '/comandas', rotulo: 'Comandas', desc: 'Abrir ou lançar itens', icone: ClipboardList },
  { para: '/pedidos', rotulo: 'Pedidos online', desc: 'Aceitar e enviar', icone: Globe },
  { para: '/produtos', rotulo: 'Produtos', desc: 'Estoque e preços', icone: Package },
]

export default function Inicio() {
  const { usuario, isAdmin } = useAuth()
  const { caixa, sessao } = useCaixa()
  const [p, setP] = useState(null)
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hoje = d.charAt(0).toUpperCase() + d.slice(1)

  useEffect(() => {
    const carregar = () => get('/painel').then(setP).catch(() => {})
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [])

  const avisos = []
  if (p?.pedidos.novos) avisos.push({ para: '/pedidos', txt: `${p.pedidos.novos === 1 ? '1 pedido online novo' : `${p.pedidos.novos} pedidos online novos`} esperando aceite`, forte: true })
  if (isAdmin && p?.backup_atrasado) avisos.push({ para: '/loja', txt: p.ultimo_backup ? 'Faz mais de 7 dias do último backup — baixe um agora' : 'Nenhum backup feito ainda — baixe o primeiro', icone: DatabaseBackup })
  if (isAdmin && p?.sem_custo) avisos.push({ para: '/produtos', txt: `${p.sem_custo} ${p.sem_custo === 1 ? 'produto está' : 'produtos estão'} sem preço de custo (o lucro fica errado)` })

  return (
    <div className="pagina pagina-larga">
      <div className="pagina-topo">
        <div>
          <h1>{saudacao()}, {usuario.nome.split(' ')[0]}</h1>
          <p>{hoje}</p>
        </div>
      </div>

      <Link to="/caixa" className={`status-caixa ${sessao ? 'aberto' : ''}`}>
        {!caixa ? 'Este aparelho ainda não tem caixa definido — toque para escolher'
          : sessao ? `${caixa.nome} aberto desde ${sessao.aberto_em.slice(11, 16)} por ${sessao.aberto_por}`
          : `${caixa.nome} fechado — toque para abrir`}
      </Link>

      {avisos.length > 0 && (
        <ul className="inicio-avisos">
          {avisos.map((a) => (
            <li key={a.txt}><Link to={a.para} className={a.forte ? 'forte' : ''}>
              {a.icone ? <a.icone size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}<span>{a.txt}</span><ChevronRight size={18} aria-hidden />
            </Link></li>
          ))}
        </ul>
      )}

      <div className="atalhos">
        {ATALHOS.map((a) => (
          <Link key={a.para} to={a.para} className="atalho">
            <a.icone size={28} aria-hidden />
            <span>
              <strong>{a.rotulo}</strong>
              <small>{a.desc}</small>
            </span>
          </Link>
        ))}
      </div>

      {p && isAdmin && (
        <section className="rel-kpis inicio-kpis" aria-label="Hoje">
          <Link to="/relatorios">
            <span>Faturamento hoje</span>
            <strong>{dinheiro(p.faturamento_hoje)}</strong>
            <small className="var-neutra">{p.vendas_hoje} {p.vendas_hoje === 1 ? 'venda' : 'vendas'} · ontem {dinheiro(p.faturamento_ontem)}</small>
          </Link>
          <Link to="/relatorios" className="destaque">
            <span>Lucro hoje</span>
            <strong className={p.lucro_hoje < 0 ? 'lucro-negativo' : ''}>{dinheiro(p.lucro_hoje)}</strong>
            <small className="var-neutra">ver relatórios</small>
          </Link>
          <Link to="/clientes">
            <span>Fiado a receber</span>
            <strong>{dinheiro(p.fiado_a_receber)}</strong>
            <small className="var-neutra">todos os clientes</small>
          </Link>
          <Link to="/entregas">
            <span>A pagar aos entregadores</span>
            <strong>{dinheiro(p.entregadores_a_pagar)}</strong>
            <small className="var-neutra">entregas sem acerto</small>
          </Link>
        </section>
      )}

      {p && (
        <div className="rel-duas inicio-listas">
          <section className="painel">
            <div className="painel-cab"><h2>Comandas abertas</h2><Link className="link" to="/comandas">{p.comandas.length ? 'Ver todas' : 'Abrir comanda'}</Link></div>
            {p.comandas.length ? (
              <ul className="inicio-lista">
                {p.comandas.slice(0, 8).map((c) => (
                  <li key={c.id}><Link to={`/comandas/${c.id}`}><span>{c.nome}<small>desde {c.aberta_em.slice(11, 16)}</small></span><b>{dinheiro(c.total)}</b></Link></li>
                ))}
                {p.comandas.length > 8 && <li className="mais-itens">e mais {p.comandas.length - 8}</li>}
              </ul>
            ) : <p className="painel-corpo dica">Nenhuma comanda aberta agora.</p>}
          </section>
          <section className="painel">
            <div className="painel-cab"><h2>Estoque baixo</h2><Link className="link" to="/produtos?status=baixo">{p.estoque_baixo_total ? `Ver os ${p.estoque_baixo_total}` : 'Produtos'}</Link></div>
            {p.estoque_baixo.length ? (
              <ul className="inicio-lista">
                {p.estoque_baixo.map((x) => (
                  <li key={x.id}><Link to="/produtos?status=baixo"><span>{x.nome}<small>mínimo {quantidade(x.minimo, x.unidade)}</small></span>
                    <b className={x.estoque <= 0 ? 'negativo' : 'aviso-txt'}>{x.estoque <= 0 ? (x.estoque < 0 ? `${quantidade(x.estoque, x.unidade)} (conferir)` : 'zerado') : quantidade(x.estoque, x.unidade)}</b></Link></li>
                ))}
              </ul>
            ) : <p className="painel-corpo dica">Tudo acima do mínimo. 👍</p>}
          </section>
        </div>
      )}
    </div>
  )
}
