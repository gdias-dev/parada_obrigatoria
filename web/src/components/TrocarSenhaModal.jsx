import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Alerta, Botao, Campo, InputSenha, Modal, useToast } from './ui'

export default function TrocarSenhaModal({ aberto, onFechar }) {
  const { trocarSenha } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({ atual: '', nova: '', confirma: '' })
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const fechar = () => { setF({ atual: '', nova: '', confirma: '' }); setErro(''); onFechar() }

  async function salvar(e) {
    e.preventDefault()
    if (f.nova !== f.confirma) return setErro('A confirmação não é igual à nova senha.')
    setEnviando(true); setErro('')
    try {
      await trocarSenha(f.atual, f.nova)
      toast('Senha alterada. Outros aparelhos vão pedir login de novo.')
      fechar()
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo="Trocar minha senha"
      aberto={aberto}
      onFechar={fechar}
      rodape={<>
        <Botao variante="borda" type="button" onClick={fechar}>Cancelar</Botao>
        <Botao form="form-senha" type="submit" carregando={enviando}>Salvar senha</Botao>
      </>}
    >
      <form id="form-senha" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Senha atual">{(p) => <InputSenha {...p} autoComplete="current-password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} required />}</Campo>
        <Campo rotulo="Nova senha" dica="Pelo menos 6 caracteres">{(p) => <InputSenha {...p} autoComplete="new-password" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} required minLength={6} />}</Campo>
        <Campo rotulo="Repita a nova senha">{(p) => <InputSenha {...p} autoComplete="new-password" value={f.confirma} onChange={(e) => setF({ ...f, confirma: e.target.value })} required />}</Campo>
      </form>
    </Modal>
  )
}
