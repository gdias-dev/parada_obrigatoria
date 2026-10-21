import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import './styles.css'

import { AuthProvider, useAuth } from './lib/auth'
import { ToastProvider } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Usuarios from './pages/Usuarios'
import Loja from './pages/Loja'
import AtualizacaoApp from './components/AtualizacaoApp'
import Produtos from './pages/produtos/Produtos'
import Importar from './pages/produtos/Importar'
import Pdv from './pages/Pdv'
import Caixa from './pages/Caixa'
import Comandas from './pages/Comandas'
import Comanda from './pages/Comanda'
import { CaixaProvider } from './lib/caixa'
import ClientesLista, { Cliente } from './pages/Clientes'
import FormasPagamento from './pages/FormasPagamento'
import Pedidos from './pages/Pedidos'
import Entregas, { Entregadores } from './pages/Entregas'
import Relatorios from './pages/Relatorios'
import LojaOnline from './pages/publico/LojaOnline'
import Acompanhar from './pages/publico/Acompanhar'
import { PedidosAlertaProvider } from './lib/pedidosAlerta'

function Rotas() {
  const { usuario, carregando, isAdmin } = useAuth()
  const loc = useLocation()

  // Páginas públicas (clientes fazendo pedido): não precisam de login
  if (loc.pathname === '/pedir' || loc.pathname.startsWith('/pedido/')) {
    return (
      <Routes>
        <Route path="/pedir" element={<LojaOnline />} />
        <Route path="/pedido/:codigo" element={<Acompanhar />} />
      </Routes>
    )
  }

  if (carregando) return <div className="carregando-tela"><img src="/logo.png" alt="Carregando" /></div>
  if (!usuario || usuario.precisa_trocar_senha) return <Login />

  const soAdmin = (el) => (isAdmin ? el : <Navigate to="/" replace />)

  return (
    <CaixaProvider>
    <PedidosAlertaProvider onNovo={(n) => window.dispatchEvent(new CustomEvent('pedido-novo', { detail: n }))}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Inicio />} />
        <Route path="usuarios" element={soAdmin(<Usuarios />)} />
        <Route path="loja" element={soAdmin(<Loja />)} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="produtos/importar" element={soAdmin(<Importar />)} />
        <Route path="pdv" element={<Pdv />} />
        <Route path="caixa" element={<Caixa />} />
        <Route path="comandas" element={<Comandas />} />
        <Route path="comandas/:id" element={<Comanda />} />
        <Route path="clientes" element={<ClientesLista />} />
        <Route path="clientes/:id" element={<Cliente />} />
        <Route path="pagamentos" element={soAdmin(<FormasPagamento />)} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="entregas" element={<Entregas />} />
        <Route path="entregadores" element={soAdmin(<Entregadores />)} />
        <Route path="relatorios" element={soAdmin(<Relatorios />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </PedidosAlertaProvider>
    </CaixaProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Rotas />
          <AtualizacaoApp />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)

// App instalável (PC e celular)
// Quando sobe uma versão nova no servidor, o app mostra "Atualizar" (sem precisar reinstalar).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      const avisar = () => reg.waiting && navigator.serviceWorker.controller && window.dispatchEvent(new CustomEvent('app-atualizacao', { detail: reg }))
      avisar()
      reg.addEventListener('updatefound', () => {
        const novo = reg.installing
        novo?.addEventListener('statechange', () => novo.state === 'installed' && avisar())
      })
      // procura versão nova a cada 30 min e quando o app volta para a tela
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}))
      // recarrega só quando é troca de versão (na 1ª instalação não há o que recarregar)
      const tinhaVersao = !!navigator.serviceWorker.controller
      let recarregou = false
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaVersao && !recarregou) { recarregou = true; location.reload() } })
    } catch {}
  })
}
