import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Check, ChevronDown, Copy, QrCode, Receipt } from 'lucide-react'
import { post } from '../lib/api'
import { dinheiro } from '../lib/format'
import { Botao, useToast } from './ui'

const dataCurta = (s) => new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const cnpj = (c) => (c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c)

/** Aviso da mensalidade do sistema na tela inicial do administrador. */
export default function MensalidadeAviso({ m, onAtualizar }) {
  const toast = useToast()
  const atrasada = m.status === 'aberta' && m.dias_atraso > 0
  const [aberto, setAberto] = useState(atrasada)
  const [enviando, setEnviando] = useState(false)

  const svg = useMemo(() => {
    if (!m.pix_copia_cola) return ''
    const q = qrcode(0, 'M')
    q.addData(m.pix_copia_cola)
    q.make()
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true })
  }, [m.pix_copia_cola])

  async function copiar() {
    try { await navigator.clipboard.writeText(m.pix_copia_cola); toast('Código Pix copiado. Cole no app do banco em "Pix copia e cola".') }
    catch { toast('Não deu para copiar. Selecione o código e copie.', 'erro') }
  }

  async function paguei() {
    setEnviando(true)
    try {
      await post(`/mensalidade/${m.id}/paguei`)
      toast('Obrigado! Mensalidade registrada como paga.')
      onAtualizar?.()
    } catch (e) { toast(e.message, 'erro') } finally { setEnviando(false) }
  }

  const aguardando = m.aguardando || []
  if (m.status === 'informada') {
    return (
      <div className="mensal mensal-ok" role="status">
        <Check size={18} aria-hidden />
        <span>Mensalidade do sistema de {aguardando.map((a) => a.mes.split(' de ')[0]).join(', ')}: pagamento informado, aguardando confirmação.</span>
      </div>
    )
  }

  return (
    <section className={`mensal ${atrasada ? 'mensal-atraso' : ''}`} aria-label="Mensalidade do sistema">
      <button type="button" className="mensal-cab" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>
        <Receipt size={20} aria-hidden />
        <span>
          <strong>Mensalidade do sistema — {m.mes}</strong>
          <small>{dinheiro(m.valor)} · {atrasada ? `venceu em ${dataCurta(m.vencimento)} (${m.dias_atraso} ${m.dias_atraso === 1 ? 'dia' : 'dias'} de atraso)` : `vence em ${dataCurta(m.vencimento)}`}</small>
        </span>
        <span className="mensal-acao">{aberto ? <ChevronDown size={18} aria-hidden /> : <><QrCode size={16} aria-hidden /> Pagar com Pix</>}</span>
      </button>

      {aberto && (
        <div className="mensal-corpo">
          {m.observacao && <p className="mensal-obs">{m.observacao}</p>}
          {m.em_aberto > 1 && <p className="mensal-obs">Há {m.em_aberto} mensalidades em aberto ({dinheiro(m.total_em_aberto)}). Pague esta e depois a próxima aparece aqui.</p>}
          <div className="mensal-pix">
            <div className="mensal-qr" role="img" aria-label="QR Code do Pix" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="mensal-info">
              <p>Abra o app do banco, escolha <b>Pix → Ler QR Code</b> (ou <b>Pix copia e cola</b>) e confira:</p>
              <dl>
                <div><dt>Valor</dt><dd>{dinheiro(m.valor)}</dd></div>
                <div><dt>Para</dt><dd>{m.recebedor}</dd></div>
                <div><dt>CNPJ</dt><dd>{cnpj(m.pix_chave)}</dd></div>
              </dl>
              <label className="mensal-codigo">
                <span>Pix copia e cola</span>
                <textarea className="input" readOnly rows={3} value={m.pix_copia_cola} onFocus={(e) => e.target.select()} />
              </label>
              <div className="mensal-botoes">
                <Botao variante="borda" type="button" onClick={copiar}><Copy size={16} aria-hidden /> Copiar código</Botao>
                <Botao type="button" onClick={paguei} carregando={enviando}><Check size={16} aria-hidden /> Já paguei</Botao>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
