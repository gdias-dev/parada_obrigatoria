import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { get } from '../lib/api'
import { Alerta, Botao, Campo, InputSenha } from '../components/ui'

export default function Login() {
  const { usuario, entrar, trocarSenha, sair } = useAuth()
  const [loja, setLoja] = useState({ loja_nome: 'Parada Obrigatória', loja_subtitulo: 'Bar e Distribuidora de Bebidas' })
  useEffect(() => { get('/config/publica').then(setLoja).catch(() => {}) }, [])

  const precisaTrocar = usuario?.precisa_trocar_senha

  return (
    <div className="login">
      <section className="login-marca">
        <img src="/logo.png" alt={`Logo ${loja.loja_nome}`} />
        <h1>{loja.loja_nome}</h1>
        <p>{loja.loja_subtitulo}</p>
      </section>
      <section className="login-form">
        {precisaTrocar
          ? <PrimeiroAcesso usuario={usuario} trocarSenha={trocarSenha} sair={sair} />
          : <FormEntrar entrar={entrar} />}
      </section>
    </div>
  )
}

function FormEntrar({ entrar }) {
  const [login, setLogin] = useState(() => { try { return localStorage.getItem('parada.ultimoLogin') || '' } catch { return '' } })
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      await entrar(login.trim(), senha)
      try { localStorage.setItem('parada.ultimoLogin', login.trim()) } catch {}
    } catch (err) {
      setErro(err.message)
      setSenha('')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form className="login-caixa" onSubmit={enviar}>
      <h2>Entrar no sistema</h2>
      <p className="login-sub">Use o usuário e a senha que o administrador criou para você.</p>
      <Alerta>{erro}</Alerta>
      <Campo rotulo="Usuário">
        {(p) => <input {...p} className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" required autoFocus={!login} />}
      </Campo>
      <Campo rotulo="Senha">
        {(p) => <InputSenha {...p} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required autoFocus={!!login} />}
      </Campo>
      <Botao type="submit" className="btn-bloco btn-grande" carregando={enviando}>Entrar</Botao>
      <p className="login-rodape">Esqueceu a senha? Peça ao administrador para redefinir.</p>
    </form>
  )
}

function PrimeiroAcesso({ usuario, trocarSenha, sair }) {
  const [f, setF] = useState({ atual: '', nova: '', confirma: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    if (f.nova !== f.confirma) return setErro('A confirmação não é igual à nova senha.')
    setEnviando(true); setErro('')
    try { await trocarSenha(f.atual, f.nova) }
    catch (err) { setErro(err.message) }
    finally { setEnviando(false) }
  }

  return (
    <form className="login-caixa" onSubmit={enviar}>
      <h2>Olá, {usuario.nome.split(' ')[0]}</h2>
      <p className="login-sub">Você entrou com uma senha provisória. Crie sua senha pessoal para continuar.</p>
      <Alerta>{erro}</Alerta>
      <Campo rotulo="Senha provisória">{(p) => <InputSenha {...p} autoComplete="current-password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} required autoFocus />}</Campo>
      <Campo rotulo="Nova senha" dica="Pelo menos 6 caracteres">{(p) => <InputSenha {...p} autoComplete="new-password" minLength={6} value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} required />}</Campo>
      <Campo rotulo="Repita a nova senha">{(p) => <InputSenha {...p} autoComplete="new-password" value={f.confirma} onChange={(e) => setF({ ...f, confirma: e.target.value })} required />}</Campo>
      <Botao type="submit" className="btn-bloco btn-grande" carregando={enviando}>Salvar e entrar</Botao>
      <button type="button" className="btn btn-texto btn-bloco" onClick={sair}>Voltar</button>
    </form>
  )
}
