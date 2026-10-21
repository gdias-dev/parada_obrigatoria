import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { get, post, put } from '../lib/api'
import { dinheiro, numero, paraCampo } from '../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, Modal, useToast } from '../components/ui'

const TIPOS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', vale: 'Vale', fiado: 'Fiado' }

function paraForm(f) {
  return {
    ...f,
    taxa_cliente_valor: f.taxa_cliente_tipo === 'nenhuma' ? '' : paraCampo(f.taxa_cliente_valor),
    taxa_maquininha_pct: paraCampo(f.taxa_maquininha_pct),
    novaBandeira: '',
  }
}

export default function FormasPagamento() {
  const [formas, setFormas] = useState(null)
  const [erro, setErro] = useState('')
  const [nova, setNova] = useState(false)
  useEffect(() => { get('/formas-pagamento/config').then((l) => setFormas(l.map(paraForm))).catch((e) => setErro(e.message)) }, [])

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Formas de pagamento</h1>
          <p>Acréscimo ou desconto para o cliente, bandeiras e a taxa que a maquininha cobra da loja.</p>
        </div>
        <Botao variante="borda" onClick={() => setNova(true)}><Plus size={18} aria-hidden /> Nova forma</Botao>
      </div>
      <Alerta tipo="aviso">
        A <b>taxa da maquininha</b> não aparece para o cliente: ela é descontada do <b>lucro</b> nos relatórios.
        Confira os percentuais no aplicativo ou contrato da sua maquininha.
      </Alerta>
      <Alerta>{erro}</Alerta>
      <div className="lista-formas">
        {(formas || []).map((f, i) => (
          <CartaoForma key={f.id} inicial={f} onSalvo={(n) => setFormas((l) => l.map((x, j) => (j === i ? paraForm(n) : x)))} />
        ))}
      </div>
      {nova && <NovaForma onFechar={() => setNova(false)} onCriada={(f) => { setNova(false); setFormas((l) => [...l, paraForm(f)]) }} />}
    </div>
  )
}

function CartaoForma({ inicial, onSalvo }) {
  const toast = useToast()
  const [f, setF] = useState(inicial)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setF(inicial), [inicial])
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const mudou = JSON.stringify({ ...f, novaBandeira: '' }) !== JSON.stringify({ ...inicial, novaBandeira: '' })
  const temMaquininha = !['dinheiro', 'fiado'].includes(f.tipo)
  const temBandeira = ['credito', 'debito', 'vale'].includes(f.tipo)

  function addBandeira() {
    const b = f.novaBandeira.trim()
    if (!b || f.bandeiras.some((x) => x.toLowerCase() === b.toLowerCase())) return set('novaBandeira', '')
    setF((x) => ({ ...x, bandeiras: [...x.bandeiras, b], novaBandeira: '' }))
  }

  async function salvar() {
    setSalvando(true); setErro('')
    try {
      const n = await put(`/formas-pagamento/${f.id}`, {
        nome: f.nome, taxa_cliente_tipo: f.taxa_cliente_tipo, taxa_cliente_modo: f.taxa_cliente_modo,
        taxa_cliente_valor: f.taxa_cliente_valor || '0', taxa_maquininha_pct: f.taxa_maquininha_pct || '0',
        ativo_pdv: f.ativo_pdv, ativo_online: f.ativo_online, ativo: f.ativo, bandeiras: f.bandeiras,
      })
      onSalvo(n); toast(`${n.nome} salvo.`)
    } catch (e) { setErro(e.message) } finally { setSalvando(false) }
  }

  const exemplo = (() => {
    const v = numero(f.taxa_cliente_valor) || 0
    if (f.taxa_cliente_tipo === 'nenhuma' || !v) return null
    const aj = f.taxa_cliente_modo === 'fixo' ? v : 100 * v / 100
    return f.taxa_cliente_tipo === 'acrescimo' ? `Conta de ${dinheiro(100)} → cliente paga ${dinheiro(100 + aj)}` : `Conta de ${dinheiro(100)} → cliente paga ${dinheiro(100 - aj)}`
  })()

  return (
    <section className={`painel forma-cartao ${f.ativo ? '' : 'inativa'}`}>
      <div className="painel-cab">
        <div className="forma-titulo">
          <input className="input input-titulo" value={f.nome} onChange={(e) => set('nome', e.target.value)} aria-label="Nome da forma de pagamento" maxLength={50} />
          <span className="etiqueta etiqueta-func">{TIPOS[f.tipo]}</span>
          {f.usos > 0 && <small className="dica">{f.usos} pagamento{f.usos > 1 ? 's' : ''}</small>}
        </div>
        <div className="forma-onde">
          <label className="interruptor"><input type="checkbox" checked={f.ativo_pdv} onChange={(e) => set('ativo_pdv', e.target.checked)} /> Caixa</label>
          {f.tipo !== 'fiado' && <label className="interruptor"><input type="checkbox" checked={f.ativo_online} onChange={(e) => set('ativo_online', e.target.checked)} /> Loja online</label>}
        </div>
      </div>
      <div className="painel-corpo grid-form">
        {temBandeira && (
          <div className="campo">
            <label>Bandeiras</label>
            <div className="chips">
              {f.bandeiras.map((b) => (
                <span key={b} className="chip chip-bandeira">{b}
                  <button type="button" onClick={() => set('bandeiras', f.bandeiras.filter((x) => x !== b))} aria-label={`Remover ${b}`}><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="linha-form">
              <input className="input" placeholder="Nova bandeira (ex.: Hipercard)" value={f.novaBandeira}
                onChange={(e) => set('novaBandeira', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBandeira() } }} aria-label="Nova bandeira" />
              <Botao variante="borda" type="button" onClick={addBandeira}>Adicionar</Botao>
            </div>
          </div>
        )}

        {f.tipo !== 'fiado' && (
          <div className="grid-form tres">
            <Campo rotulo="Para o cliente">
              {(p) => (
                <select {...p} className="select" value={f.taxa_cliente_tipo} onChange={(e) => set('taxa_cliente_tipo', e.target.value)}>
                  <option value="nenhuma">Sem acréscimo nem desconto</option>
                  <option value="acrescimo">Acréscimo</option>
                  <option value="desconto">Desconto</option>
                </select>
              )}
            </Campo>
            {f.taxa_cliente_tipo !== 'nenhuma' && (
              <>
                <Campo rotulo="Tipo de valor">
                  {(p) => (
                    <select {...p} className="select" value={f.taxa_cliente_modo} onChange={(e) => set('taxa_cliente_modo', e.target.value)}>
                      <option value="percentual">Percentual (%)</option>
                      <option value="fixo">Valor fixo (R$)</option>
                    </select>
                  )}
                </Campo>
                <Campo rotulo={f.taxa_cliente_modo === 'fixo' ? 'Valor (R$)' : 'Percentual'} dica={exemplo}>
                  {(p) => f.taxa_cliente_modo === 'fixo'
                    ? <InputDinheiro {...p} value={f.taxa_cliente_valor} onChange={(v) => set('taxa_cliente_valor', v)} />
                    : <div className="input-sufixo"><input {...p} className="input" inputMode="decimal" value={f.taxa_cliente_valor} onChange={(e) => set('taxa_cliente_valor', e.target.value.replace(/[^\d,.]/g, ''))} /><span>%</span></div>}
                </Campo>
              </>
            )}
          </div>
        )}

        {temMaquininha && (
          <Campo rotulo="Taxa da maquininha (paga pela loja)" dica={`Numa venda de ${dinheiro(100)}, a loja recebe ${dinheiro(100 - (numero(f.taxa_maquininha_pct) || 0))}`}>
            {(p) => <div className="input-sufixo" style={{ maxWidth: 200 }}><input {...p} className="input" inputMode="decimal" value={f.taxa_maquininha_pct} onChange={(e) => set('taxa_maquininha_pct', e.target.value.replace(/[^\d,.]/g, ''))} /><span>%</span></div>}
          </Campo>
        )}
        {f.tipo === 'fiado' && <p className="dica">O fiado só aparece no caixa. Para usar, a venda precisa ter um cliente cadastrado, e o limite de cada cliente é definido na ficha dele.</p>}

        <Alerta>{erro}</Alerta>
        <div className="forma-rodape">
          <label className="interruptor"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> {f.ativo ? 'Ativa' : 'Desativada'}</label>
          <Botao onClick={salvar} carregando={salvando} disabled={!mudou}>Salvar</Botao>
        </div>
      </div>
    </section>
  )
}

function NovaForma({ onFechar, onCriada }) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('vale')
  const [erro, setErro] = useState('')
  async function criar(e) {
    e.preventDefault()
    try { onCriada(await post('/formas-pagamento', { nome, tipo })) } catch (err) { setErro(err.message) }
  }
  return (
    <Modal titulo="Nova forma de pagamento" aberto onFechar={onFechar}
      rodape={<><Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao><Botao form="form-nova-forma" type="submit">Criar</Botao></>}>
      <form id="form-nova-forma" className="grid-form" onSubmit={criar}>
        <Alerta>{erro}</Alerta>
        <Campo rotulo="Nome" dica="Ex.: Vale-Refeição, Ticket, Crédito parcelado">{(p) => <input {...p} className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus maxLength={50} />}</Campo>
        <Campo rotulo="Funciona como">
          {(p) => (
            <select {...p} className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPOS).filter(([k]) => k !== 'fiado').map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          )}
        </Campo>
      </form>
    </Modal>
  )
}
