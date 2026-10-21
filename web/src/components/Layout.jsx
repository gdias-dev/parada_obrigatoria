import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu as MenuIcon, Settings2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { menuDoUsuario } from '../menu'
import { iniciais } from './ui'
import TrocarSenhaModal from './TrocarSenhaModal'
import MinhaContaModal from './MinhaContaModal'

export default function Layout() {
  const { usuario, isAdmin, sair } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [trocandoSenha, setTrocandoSenha] = useState(false)
  const [contaAberta, setContaAberta] = useState(false)
  const loc = useLocation()

  useEffect(() => setAberto(false), [loc.pathname])

  return (
    <div className="app">
      <header className="barra-mobile">
        <button className="btn btn-icone" onClick={() => setAberto(true)} aria-label="Abrir menu">
          <MenuIcon size={24} />
        </button>
        <img src="/logo.png" alt="" />
        <strong>Parada Obrigatória</strong>
      </header>

      <div className={`fundo-menu ${aberto ? 'aberto' : ''}`} onClick={() => setAberto(false)} />

      <aside className={`menu ${aberto ? 'aberto' : ''}`} aria-label="Menu principal">
        <div className="menu-topo">
          <img src="/logo.png" alt="Logo Parada Obrigatória" />
          <div>
            <strong>Parada Obrigatória</strong>
            <span>Bar e distribuidora</span>
          </div>
        </div>
        <nav>
          {menuDoUsuario(isAdmin).map((g) => (
            <div key={g.grupo}>
              <div className="menu-grupo">{g.grupo}</div>
              {g.itens.map((i) => (
                <NavLink key={i.para} to={i.para} end={i.para === '/'} className={({ isActive }) => `menu-link ${isActive ? 'ativo' : ''} ${i.pronto ? '' : 'pendente'}`} title={i.pronto ? undefined : `Chega na etapa ${i.etapa}`}>
                  <i.icone size={20} aria-hidden />
                  {i.rotulo}
                  {!i.pronto && <span className="sr-only">(em breve)</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="menu-rodape">
          <button className="minha-conta" onClick={() => setContaAberta(true)} title="Minha conta: nome, usuário e senha">
            <span className="avatar" aria-hidden>{iniciais(usuario.nome)}</span>
            <span className="quem">
              <strong>{usuario.nome}</strong>
              <span>{isAdmin ? 'Administrador' : 'Funcionário'}</span>
            </span>
            <Settings2 size={16} aria-hidden className="engrenagem" />
          </button>
          <button className="btn btn-texto btn-icone" onClick={sair} title="Sair" aria-label="Sair">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="conteudo">
        <Outlet />
      </main>

      <MinhaContaModal aberto={contaAberta} onFechar={() => setContaAberta(false)} onTrocarSenha={() => { setContaAberta(false); setTrocandoSenha(true) }} />
      <TrocarSenhaModal aberto={trocandoSenha} onFechar={() => setTrocandoSenha(false)} />
    </div>
  )
}
