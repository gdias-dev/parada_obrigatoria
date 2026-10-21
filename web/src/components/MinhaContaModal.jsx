import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Alerta, Botao, Campo, Modal, useToast } from './ui'

export default function MinhaContaModal({ aberto, onFechar, onTrocarSenha }) {
  const { usuario, atualizarConta } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ nome: '', login: '' })
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { if (aberto) { setF({ nome: usuario.nome, login: usuario.login }); setErro({}) } }, [aberto, usuario])

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro({})
    try {
      await atualizarConta(f)
      toast('Conta atualizada.')
      onFechar()
    } catch (err) {
      setErro({ geral: err.data?.campo ? '' : err.message, [err.data?.campo]: err.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Minha conta"
      aberto={aberto}
      onFechar={onFechar}
      rodape={<>
        <Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao>
        <Botao form="form-conta" type="submit" carregando={enviando}>Salvar</Botao>
      </>}
    >
      <form id="form-conta" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro.geral}</Alerta>
        <Campo rotulo="Nome" erro={erro.nome} dica="Como aparece no sistema e nos relatórios">
          {(p) => <input {...p} className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required minLength={2} />}
        </Campo>
        <Campo rotulo="Usuário para entrar" erro={erro.login} dica="Sem espaço e sem acento. Na próxima vez, entre com este usuário.">
          {(p) => <input {...p} className="input" value={f.login} autoCapitalize="none" onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase().replace(/\s/g, '') })} required />}
        </Campo>
        <button type="button" className="btn btn-borda" onClick={onTrocarSenha}>Trocar minha senha</button>
      </form>
    </Modal>
  )
}
