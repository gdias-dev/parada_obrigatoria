import { Link } from 'react-router-dom'
import { ShoppingCart, ClipboardList, Globe, Package, Check } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useCaixa } from '../lib/caixa'
import { saudacao } from '../lib/format'
import { ETAPAS } from '../menu'

const ATALHOS = [
  { para: '/pdv', rotulo: 'Nova venda', desc: 'Balcão e mercadinho', icone: ShoppingCart },
  { para: '/comandas', rotulo: 'Comandas', desc: 'Abrir ou lançar itens', icone: ClipboardList },
  { para: '/pedidos', rotulo: 'Pedidos online', desc: 'Aceitar e enviar', icone: Globe },
  { para: '/produtos', rotulo: 'Produtos', desc: 'Estoque e preços', icone: Package },
]

const ETAPA_ATUAL = 7 // próxima etapa em desenvolvimento
const FEITAS = 6

export default function Inicio() {
  const { usuario, isAdmin } = useAuth()
  const { caixa, sessao } = useCaixa()
  const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hoje = d.charAt(0).toUpperCase() + d.slice(1)

  return (
    <div className="pagina">
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

      {isAdmin && (
        <section className="painel andamento">
          <div className="painel-cab">
            <h2>Implantação do sistema</h2>
          </div>
          <ol className="etapas">
            <li className="feita"><Check size={16} aria-hidden /> <span className="etapa-nome">Login, usuários e permissões</span></li>
            {Object.entries(ETAPAS).map(([n, nome]) => Number(n) <= FEITAS ? (
              <li key={n} className="feita"><Check size={16} aria-hidden /> <span className="etapa-nome">{nome}</span></li>
            ) : (
              <li key={n} className={Number(n) === ETAPA_ATUAL ? 'atual' : ''}>
                <span className="num" aria-hidden>{n}</span> <span className="etapa-nome">{nome}</span>
                {Number(n) === ETAPA_ATUAL && <span className="etiqueta etiqueta-pendente">em andamento</span>}
              </li>
            ))}
            <li><span className="num" aria-hidden>7</span> <span className="etapa-nome">Publicação na KingHost e instalação nos aparelhos</span></li>
          </ol>
        </section>
      )}
    </div>
  )
}
