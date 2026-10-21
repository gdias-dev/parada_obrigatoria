import { useEffect, useMemo, useRef, useState } from 'react'
import { Banknote, CreditCard, NotebookPen, QrCode, Ticket, Trash2, Wallet } from 'lucide-react'
import { EscolherCliente } from './Clientes'
import { get } from '../lib/api'
import { dinheiro, numero, paraCampo } from '../lib/format'
import { ajusteForma, arred } from '../lib/caixa'
import { Alerta, Botao, InputDinheiro, Modal } from './ui'

const ICONES = { dinheiro: Banknote, pix: QrCode, debito: CreditCard, credito: CreditCard, vale: Ticket, fiado: NotebookPen }
const NOTAS = [10, 20, 50, 100, 200]

let cacheFormas = null

/**
 * Recebe o pagamento de uma venda ou comanda.
 * Pode dividir em várias formas (ex.: parte no Pix, parte no dinheiro).
 * onConfirmar(pagamentos) deve chamar a API e lançar erro se falhar.
 */
export default function PagamentoModal({ aberto, devido, titulo = 'Receber pagamento', onFechar, onConfirmar, clienteInicial = null, permitirFiado = true }) {
  const [formas, setFormas] = useState(cacheFormas)
  const [pags, setPags] = useState([])
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [cliente, setCliente] = useState(clienteInicial)
  const ultimoRef = useRef(null)

  useEffect(() => {
    if (!aberto) return
    setPags([]); setErro(''); setCliente(clienteInicial)
    get('/formas-pagamento').then((f) => { cacheFormas = f; setFormas(f) }).catch((e) => setErro(e.message))
  }, [aberto, devido])

  const forma = (id) => formas?.find((f) => f.id === id)
  const pagos = arred(pags.reduce((s, p) => s + (numero(p.valor) || 0), 0))
  const restante = arred(devido - pagos)
  const linhas = useMemo(() => pags.map((p) => {
    const f = forma(p.forma_pagamento_id)
    const v = numero(p.valor) || 0
    const aj = arred(ajusteForma(f, v))
    const cobrar = arred(v + aj)
    const recebido = numero(p.recebido)
    return { ...p, f, v, aj, cobrar, troco: f?.tipo === 'dinheiro' && recebido ? arred(recebido - cobrar) : 0 }
  }), [pags, formas]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalCobrar = arred(linhas.reduce((s, l) => s + l.cobrar, 0))
  const trocoTotal = arred(linhas.reduce((s, l) => s + Math.max(0, l.troco), 0))
  const faltaDinheiro = linhas.some((l) => l.f?.tipo === 'dinheiro' && numero(l.recebido) !== null && l.troco < 0)
  const valorFiado = arred(linhas.filter((l) => l.f?.tipo === 'fiado').reduce((s, l) => s + l.cobrar, 0))
  const temFiado = valorFiado > 0
  const avisoFiado = temFiado && cliente ? limiteFiado(cliente, valorFiado) : null

  function adicionar(f) {
    const valor = restante > 0 ? restante : 0
    if (valor <= 0 && pags.length) return
    setPags((l) => [...l, { forma_pagamento_id: f.id, valor: paraCampo(valor || devido), recebido: '', bandeira: f.bandeiras[0] || '' }])
    setErro('')
    setTimeout(() => ultimoRef.current?.focus(), 30)
  }
  const alterar = (i, k, v) => setPags((l) => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  const remover = (i) => setPags((l) => l.filter((_, j) => j !== i))

  async function confirmar() {
    setEnviando(true); setErro('')
    try {
      await onConfirmar(pags.map((p) => ({
        forma_pagamento_id: p.forma_pagamento_id, valor: p.valor,
        recebido: p.recebido || undefined, bandeira: p.bandeira || undefined,
      })), cliente?.id ?? null)
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const pode = pags.length > 0 && Math.abs(restante) < 0.005 && !faltaDinheiro && (!temFiado || (cliente && !avisoFiado))

  return (
    <Modal titulo={titulo} aberto={aberto} onFechar={onFechar} largura={600}
      rodape={<>
        <Botao variante="borda" onClick={onFechar} type="button">Voltar</Botao>
        <Botao onClick={confirmar} carregando={enviando} disabled={!pode} className="btn-grande">
          Confirmar {dinheiro(totalCobrar || devido)}
        </Botao>
      </>}
    >
      <div className="pag-topo">
        <span>Total da conta</span>
        <strong>{dinheiro(devido)}</strong>
      </div>

      <div className="formas" role="group" aria-label="Forma de pagamento">
        {(formas || []).filter((f) => permitirFiado || f.tipo !== 'fiado').map((f) => {
          const I = ICONES[f.tipo] || Wallet
          return (
            <button key={f.id} type="button" className="forma" onClick={() => adicionar(f)} disabled={pags.length > 0 && restante <= 0}>
              <I size={22} aria-hidden />
              <span>{f.nome}</span>
              {f.taxa_cliente_tipo !== 'nenhuma' && f.taxa_cliente_valor > 0 && (
                <small>{f.taxa_cliente_tipo === 'acrescimo' ? '+' : '−'}{f.taxa_cliente_modo === 'fixo' ? dinheiro(f.taxa_cliente_valor) : `${String(f.taxa_cliente_valor).replace('.', ',')}%`}</small>
              )}
            </button>
          )
        })}
      </div>

      {pags.length === 0 && <p className="dica centro">Escolha como o cliente vai pagar. Para dividir, escolha mais de uma forma.</p>}

      <ul className="pag-linhas">
        {linhas.map((l, i) => (
          <li key={i}>
            <div className="pag-linha-cab">
              <strong>{l.f?.nome}</strong>
              <button className="btn btn-texto btn-icone" onClick={() => remover(i)} aria-label={`Remover ${l.f?.nome}`}><Trash2 size={16} /></button>
            </div>
            <div className="pag-campos">
              <label className="campo">
                <span className="rotulo-mini">Valor da conta</span>
                <InputDinheiro value={l.valor} onChange={(v) => alterar(i, 'valor', v)} ref={i === linhas.length - 1 ? ultimoRef : undefined} />
              </label>
              {l.f?.bandeiras?.length > 0 && (
                <label className="campo">
                  <span className="rotulo-mini">Bandeira</span>
                  <select className="select" value={l.bandeira} onChange={(e) => alterar(i, 'bandeira', e.target.value)}>
                    {l.f.bandeiras.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </label>
              )}
              {l.f?.tipo === 'dinheiro' && (
                <label className="campo">
                  <span className="rotulo-mini">Cliente entregou</span>
                  <InputDinheiro value={l.recebido} onChange={(v) => alterar(i, 'recebido', v)} placeholder="Para calcular o troco" />
                </label>
              )}
            </div>
            {l.f?.tipo === 'dinheiro' && (
              <div className="chips">
                {NOTAS.filter((n) => n >= l.cobrar).slice(0, 4).map((n) => (
                  <button key={n} type="button" className="chip" onClick={() => alterar(i, 'recebido', paraCampo(n))}>{dinheiro(n)}</button>
                ))}
                <button type="button" className="chip" onClick={() => alterar(i, 'recebido', paraCampo(l.cobrar))}>Valor certo</button>
              </div>
            )}
            {l.aj !== 0 && (
              <p className="pag-info">
                {l.aj > 0 ? `Acréscimo de ${dinheiro(l.aj)}` : `Desconto de ${dinheiro(-l.aj)}`} — passar <b>{dinheiro(l.cobrar)}</b> na maquininha
              </p>
            )}
            {l.troco > 0 && <p className="pag-troco">Troco: <b>{dinheiro(l.troco)}</b></p>}
            {l.troco < 0 && <p className="pag-info erro">Faltam {dinheiro(-l.troco)} no dinheiro entregue.</p>}
          </li>
        ))}
      </ul>

      {temFiado && (
        <div className="pag-cliente">
          <span className="rotulo-mini">Fiado de quem? ({dinheiro(valorFiado)} vai para a conta do cliente)</span>
          <EscolherCliente valor={cliente} onEscolher={setCliente} autoFocus={!cliente} />
          {avisoFiado && <p className="pag-info erro">{avisoFiado}</p>}
        </div>
      )}

      {pags.length > 0 && (
        <div className={`pag-restante ${Math.abs(restante) < 0.005 ? 'ok' : restante < 0 ? 'passou' : ''}`}>
          {Math.abs(restante) < 0.005
            ? (trocoTotal > 0 ? <>Tudo certo. Troco: <b>{dinheiro(trocoTotal)}</b></> : 'Valor completo.')
            : restante > 0 ? <>Falta receber <b>{dinheiro(restante)}</b></> : <>Passou {dinheiro(-restante)} do total — ajuste os valores</>}
        </div>
      )}
      <Alerta>{erro}</Alerta>
    </Modal>
  )
}

function limiteFiado(c, valor) {
  if (!c.ativo && c.ativo !== undefined) return 'Cadastro desativado.'
  if (c.limite_fiado === null || c.limite_fiado === undefined) return null
  if (c.limite_fiado <= 0) return `${c.nome} não tem fiado liberado.`
  const depois = c.saldo_fiado + valor
  if (depois > c.limite_fiado + 0.001) return `Passa do limite de ${dinheiro(c.limite_fiado)}: já deve ${dinheiro(c.saldo_fiado)}, ficaria ${dinheiro(depois)}.`
  return null
}
