import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { get, post, put, setUnauthorizedHandler, tokenStore } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [carregando, setCarregando] = useState(!!tokenStore.get())

  const sair = useCallback(() => {
    tokenStore.clear()
    setUsuario(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(sair)
    if (!tokenStore.get()) return
    get('/auth/me')
      .then((r) => setUsuario(r.usuario))
      .catch(() => sair())
      .finally(() => setCarregando(false))
  }, [sair])

  const aplicarSessao = useCallback((r) => {
    tokenStore.set(r.token)
    setUsuario(r.usuario)
    return r.usuario
  }, [])

  const entrar = useCallback((login, senha) => post('/auth/login', { login, senha }).then(aplicarSessao), [aplicarSessao])
  const trocarSenha = useCallback(
    (senha_atual, nova_senha) => post('/auth/trocar-senha', { senha_atual, nova_senha }).then(aplicarSessao),
    [aplicarSessao]
  )

  const atualizarConta = useCallback(
    (dados) => put('/auth/minha-conta', dados).then((r) => {
      setUsuario(r.usuario)
      try { localStorage.setItem('parada.ultimoLogin', r.usuario.login) } catch {}
      return r.usuario
    }),
    []
  )

  const recarregar = useCallback(() => get('/auth/me').then((r) => setUsuario(r.usuario)).catch(() => {}), [])

  const value = useMemo(
    () => ({ usuario, carregando, entrar, sair, trocarSenha, atualizarConta, recarregar, isAdmin: usuario?.perfil === 'admin' }),
    [usuario, carregando, entrar, sair, trocarSenha, atualizarConta, recarregar]
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
