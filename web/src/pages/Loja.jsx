import { useEffect, useState } from 'react'
import { Copy, Trash2 } from 'lucide-react'
import { del, get, post, put } from '../lib/api'
import { dinheiro, paraCampo } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, useToast } from '../components/ui'

export default function Loja() {
  const toast = useToast()
  const [f, setF] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => { get('/config/publica').then((c) => setF({ ...c, pedido_minimo: paraCampo(c.pedido_minimo || 0) })).catch((e) => setErro(e.message)) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? (e.target.checked ? '1' : '0') : e.target.value) : e })

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      const c = await put('/config', { ...f, pedido_minimo: String(f.pedido_minimo || '0').replace('.', '').replace(',', '.') })
      setF({ ...c, pedido_minimo: paraCampo(c.pedido_minimo || 0) })
      toast('Dados da loja salvos.')
    } catch (err) { setErro(err.message) } finally { setEnviando(false) }
  }

  const link = `${location.origin}/pedir`

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Dados da loja</h1>
          <p>Aparecem na tela de login, nos comprovantes e na página de pedidos online.</p>
        </div>
      </div>
      <Alerta>{erro}</Alerta>
      {f && (
        <form className="grid-form" style={{ maxWidth: 720 }} onSubmit={salvar}>
          <section className="painel painel-corpo grid-form">
            <h2>Loja</h2>
            <div className="grid-form duas">
              <Campo rotulo="Nome da loja">{(p) => <input {...p} className="input" value={f.loja_nome || ''} onChange={set('loja_nome')} required />}</Campo>
              <Campo rotulo="Subtítulo">{(p) => <input {...p} className="input" value={f.loja_subtitulo || ''} onChange={set('loja_subtitulo')} />}</Campo>
            </div>
            <Campo rotulo="WhatsApp" dica="Com DDI e DDD, só números. Ex.: 5521974379702">
              {(p) => <input {...p} className="input" inputMode="numeric" value={f.loja_whatsapp || ''} onChange={(e) => setF({ ...f, loja_whatsapp: e.target.value.replace(/\D/g, '') })} />}
            </Campo>
            <Campo rotulo="Endereço" dica="Sai nos comprovantes e na página de pedidos">
              {(p) => <input {...p} className="input" value={f.loja_endereco || ''} onChange={set('loja_endereco')} />}
            </Campo>
          </section>

          <section className="painel painel-corpo grid-form">
            <h2>Pedidos online</h2>
            <div className="link-loja">
              <span>Link da loja:</span>
              <a href={link} target="_blank" rel="noreferrer">{link.replace(/^https?:\/\//, '')}</a>
              <button type="button" className="btn btn-texto" onClick={() => { navigator.clipboard?.writeText(link); toast('Link copiado.') }}><Copy size={16} aria-hidden /> Copiar</button>
            </div>
            <label className="interruptor"><input type="checkbox" checked={f.pedidos_online_ativo === '1'} onChange={set('pedidos_online_ativo')} /> <span>Recebendo pedidos pelo site<small>Também dá para abrir e fechar pela tela de Pedidos</small></span></label>
            <label className="interruptor"><input type="checkbox" checked={f.aceita_retirada !== '0'} onChange={set('aceita_retirada')} /> <span>Aceitar “retirar na loja”</span></label>
            <div className="grid-form duas">
              <Campo rotulo="Pedido mínimo" dica="0 = sem mínimo">{(p) => <InputDinheiro {...p} value={f.pedido_minimo} onChange={set('pedido_minimo')} />}</Campo>
              <Campo rotulo="Tempo de entrega (minutos)" dica="Ex.: 40-60">{(p) => <input {...p} className="input" value={f.tempo_entrega || ''} onChange={set('tempo_entrega')} maxLength={20} />}</Campo>
            </div>
            <Campo rotulo="Horário de funcionamento" dica="Ex.: Ter a dom, das 16h à 0h">{(p) => <input {...p} className="input" value={f.horario_funcionamento || ''} onChange={set('horario_funcionamento')} maxLength={120} />}</Campo>
          </section>
          <div><Botao type="submit" carregando={enviando}>Salvar</Botao></div>
        </form>
      )}
      <Bairros />
    </div>
  )
}

function Bairros() {
  const toast = useToast()
  const [lista, setLista] = useState([])
  const [nome, setNome] = useState('')
  const [taxa, setTaxa] = useState('')
  const [erro, setErro] = useState('')
  const carregar = () => get('/bairros').then(setLista).catch(() => {})
  useEffect(() => { carregar() }, [])

  async function adicionar(e) {
    e.preventDefault()
    setErro('')
    try { await post('/bairros', { nome, taxa: taxa || '0' }); setNome(''); setTaxa(''); carregar() } catch (err) { setErro(err.message) }
  }
  async function salvar(b, campos) {
    try { await put(`/bairros/${b.id}`, { ...b, taxa: String(b.taxa), ...campos }); carregar() } catch (err) { toast(err.message, 'erro') }
  }

  return (
    <section className="painel painel-corpo grid-form" style={{ maxWidth: 720, marginTop: 16 }}>
      <h2>Bairros e taxas de entrega</h2>
      <p className="dica">Só os bairros desta lista aparecem para o cliente escolher no site. Sem nenhum bairro, o cliente digita o bairro e a entrega sai sem taxa.</p>
      <form className="linha-form" onSubmit={adicionar}>
        <input className="input" placeholder="Bairro" value={nome} onChange={(e) => setNome(e.target.value)} required aria-label="Nome do bairro" />
        <div style={{ flex: '0 0 140px' }}><InputDinheiro value={taxa} onChange={setTaxa} aria-label="Taxa de entrega" /></div>
        <Botao type="submit">Adicionar</Botao>
      </form>
      <Alerta>{erro}</Alerta>
      {lista.length > 0 && (
        <ul className="lista-bairros">
          {lista.map((b) => (
            <li key={b.id} className={b.ativo ? '' : 'inativo'}>
              <span>{b.nome}</span>
              <div style={{ width: 130 }}>
                <InputDinheiro defaultValue={undefined} value={b._taxa ?? paraCampo(b.taxa)} aria-label={`Taxa ${b.nome}`}
                  onChange={(v) => setLista((l) => l.map((x) => (x.id === b.id ? { ...x, _taxa: v } : x)))}
                  onBlur={() => b._taxa !== undefined && salvar(b, { taxa: b._taxa || '0' })} />
              </div>
              <label className="interruptor" title={b.ativo ? 'Atende' : 'Não atende'}><input type="checkbox" checked={b.ativo} onChange={(e) => salvar(b, { ativo: e.target.checked })} /></label>
              <button className="btn btn-texto btn-icone" onClick={async () => { await del(`/bairros/${b.id}`); carregar() }} aria-label={`Excluir ${b.nome}`}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > 0 && <p className="dica">{lista.filter((b) => b.ativo).length} bairros atendidos · taxas de {dinheiro(Math.min(...lista.map((b) => b.taxa)))} a {dinheiro(Math.max(...lista.map((b) => b.taxa)))}</p>}
    </section>
  )
}
