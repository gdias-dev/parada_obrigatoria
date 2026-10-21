import { useEffect, useState } from 'react'
import { get, put } from '../lib/api'
import { Alerta, Botao, Campo, useToast } from '../components/ui'

export default function Loja() {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { get('/config/publica').then(setF).catch((e) => setErro(e.message)) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try { setF(await put('/config', f)); toast('Dados da loja salvos.') }
    catch (err) { setErro(err.message) }
    finally { setEnviando(false) }
  }

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Dados da loja</h1>
          <p>Aparecem na tela de login, nos extratos de comanda e na página de pedidos online.</p>
        </div>
      </div>
      <Alerta>{erro}</Alerta>
      {f && (
        <form className="painel painel-corpo grid-form" style={{ maxWidth: 640 }} onSubmit={salvar}>
          <div className="grid-form duas">
            <Campo rotulo="Nome da loja">{(p) => <input {...p} className="input" value={f.loja_nome || ''} onChange={set('loja_nome')} required />}</Campo>
            <Campo rotulo="Subtítulo">{(p) => <input {...p} className="input" value={f.loja_subtitulo || ''} onChange={set('loja_subtitulo')} />}</Campo>
          </div>
          <Campo rotulo="WhatsApp" dica="Com DDI e DDD, só números. Ex.: 5521974379702">
            {(p) => <input {...p} className="input" inputMode="numeric" value={f.loja_whatsapp || ''} onChange={(e) => setF({ ...f, loja_whatsapp: e.target.value.replace(/\D/g, '') })} />}
          </Campo>
          <Campo rotulo="Endereço" dica="Sai no rodapé do extrato da comanda">
            {(p) => <input {...p} className="input" value={f.loja_endereco || ''} onChange={set('loja_endereco')} />}
          </Campo>
          <div><Botao type="submit" carregando={enviando}>Salvar</Botao></div>
        </form>
      )}
    </div>
  )
}
