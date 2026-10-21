import { useEffect, useState } from 'react'
import { MessageCircle, Printer } from 'lucide-react'
import { get } from '../lib/api'
import { dataHora, dinheiro, quantidade } from '../lib/format'
import { Botao, Modal } from './ui'

let cacheLoja = null
function useLoja() {
  const [loja, setLoja] = useState(cacheLoja)
  useEffect(() => { if (!cacheLoja) get('/config/publica').then((l) => { cacheLoja = l; setLoja(l) }).catch(() => {}) }, [])
  return loja || { loja_nome: 'Parada Obrigatória', loja_subtitulo: 'Bar e Distribuidora de Bebidas' }
}

/**
 * Comprovante de venda ou extrato de comanda.
 * Impressão: usa a impressora comum (A4) pelo diálogo do navegador,
 * que também oferece "Salvar como PDF".
 * dados = venda (de /vendas/{id}) ou comanda (de /comandas/{id})
 */
export function Recibo({ tipo, dados }) {
  const loja = useLoja()
  const comanda = tipo === 'comanda'
  const itens = agrupar((dados.itens || []).filter((i) => !i.cancelado))
  const total = comanda ? dados.total : dados.total

  return (
    <div className="recibo">
      <header>
        <img src="/logo.png" alt="" />
        <div>
          <strong>{loja.loja_nome}</strong>
          <span>{loja.loja_subtitulo}</span>
          {loja.loja_endereco && <span>{loja.loja_endereco}</span>}
          {loja.loja_whatsapp && <span>WhatsApp {formatarFone(loja.loja_whatsapp)}</span>}
        </div>
      </header>

      <h2>
        {comanda ? `Comanda — ${dados.nome_cliente}` : dados.comanda_nome ? `Comanda — ${dados.comanda_nome}` : `Venda nº ${dados.id}`}
        {dados.status === 'cancelada' && <span className="recibo-cancelada">CANCELADA</span>}
      </h2>
      <p className="recibo-meta">
        {comanda
          ? <>Aberta em {dataHora(dados.aberta_em)}{dados.fechada_em ? ` · fechada em ${dataHora(dados.fechada_em)}` : ` · extrato de ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`}</>
          : <>{dataHora(dados.criado_em)}{dados.caixa && ` · ${dados.caixa}`}{dados.usuario && ` · ${dados.usuario}`}{dados.comanda_nome && ` · venda nº ${dados.id}`}{dados.cliente_nome && <><br />Cliente: {dados.cliente_nome}</>}</>}
      </p>

      <table>
        <thead><tr><th>Qtd</th><th>Item</th><th className="num">Valor</th></tr></thead>
        <tbody>
          {itens.map((i, k) => (
            <tr key={i.id ?? k} className={i.tipo === 'casco' ? 'casco' : ''}>
              <td>{quantidade(i.quantidade)}</td>
              <td>
                {i.nome}
                {i.quantidade !== 1 && <small> ({dinheiro(i.preco_unitario)} cada)</small>}
                {i.cascos_devolvidos > 0 && <small> · trouxe {i.cascos_devolvidos} casco{i.cascos_devolvidos > 1 ? 's' : ''}</small>}
                {comanda && i.criado_em && <small className="hora"> · {i.criado_em.slice(11, 16)}</small>}
              </td>
              <td className="num">{dinheiro(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="recibo-totais">
        {!comanda && (dados.desconto > 0 || dados.acrescimo !== 0) && <><dt>Subtotal</dt><dd>{dinheiro(dados.subtotal)}</dd></>}
        {!comanda && dados.desconto > 0 && <><dt>Desconto</dt><dd>− {dinheiro(dados.desconto)}</dd></>}
        {!comanda && dados.acrescimo > 0 && <><dt>Acréscimo do cartão</dt><dd>+ {dinheiro(dados.acrescimo)}</dd></>}
        {!comanda && dados.acrescimo < 0 && <><dt>Desconto da forma de pagamento</dt><dd>− {dinheiro(-dados.acrescimo)}</dd></>}
        <dt className="total">Total</dt><dd className="total">{dinheiro(total)}</dd>
      </dl>

      {!comanda && dados.pagamentos?.length > 0 && (
        <dl className="recibo-pag">
          {dados.pagamentos.map((p, k) => (
            <PagLinha key={k} p={p} cliente={dados.cliente_nome} />
          ))}
        </dl>
      )}

      <footer>
        {comanda && dados.status === 'aberta'
          ? 'Conferência de consumo — não é comprovante de pagamento.'
          : 'Obrigado pela preferência! Volte sempre.'}
        <br />Documento sem valor fiscal.
      </footer>
    </div>
  )
}

/** Junta itens iguais (ex.: 3 lançamentos de 1 Heineken viram 3× Heineken). */
function agrupar(itens) {
  const m = new Map()
  for (const i of itens) {
    const k = `${i.tipo}|${i.nome}|${i.preco_unitario}|${i.cascos_devolvidos > 0}`
    const a = m.get(k)
    if (a) { a.quantidade += i.quantidade; a.total = Math.round((a.total + i.total) * 100) / 100; a.cascos_devolvidos += i.cascos_devolvidos; a.criado_em = null }
    else m.set(k, { ...i })
  }
  return [...m.values()]
}

function PagLinha({ p, cliente }) {
  return (
    <>
      <dt>{p.forma}{p.bandeira ? ` (${p.bandeira})` : ''}{p.forma === 'Fiado' && cliente ? ` — conta de ${cliente}` : ''}</dt><dd>{dinheiro(p.valor)}</dd>
      {p.troco > 0 && <><dt>Troco</dt><dd>{dinheiro(p.troco)}</dd></>}
    </>
  )
}

function formatarFone(n) {
  const d = String(n).replace(/\D/g, '').replace(/^55/, '')
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d
}

/** Texto do extrato para mandar no WhatsApp do cliente. */
export function textoWhatsApp(tipo, dados) {
  const itens = agrupar((dados.itens || []).filter((i) => !i.cancelado))
  const titulo = tipo === 'comanda' ? `*Comanda — ${dados.nome_cliente}*` : `*Venda nº ${dados.id}*`
  const linhas = itens.map((i) => `${quantidade(i.quantidade)}x ${i.nome} — ${dinheiro(i.total)}`)
  return [`*Parada Obrigatória*`, titulo, '', ...linhas, '', `*Total: ${dinheiro(dados.total)}*`].join('\n')
}

/** Modal com o recibo + botões Imprimir / Salvar PDF / WhatsApp. */
export function ReciboModal({ tipo, dados, aberto, onFechar, titulo, acoesExtras }) {
  if (!aberto || !dados) return null
  return (
    <Modal titulo={titulo || (tipo === 'comanda' ? 'Extrato da comanda' : 'Comprovante')} aberto onFechar={onFechar} largura={520}
      rodape={<>
        {acoesExtras}
        <a className="btn btn-borda" target="_blank" rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp(tipo, dados))}`}>
          <MessageCircle size={18} aria-hidden /> WhatsApp
        </a>
        <Botao onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir / PDF</Botao>
      </>}
    >
      <div className="recibo-papel area-impressao">
        <Recibo tipo={tipo} dados={dados} />
      </div>
      <p className="dica centro nao-imprimir">Para salvar em PDF, escolha “Salvar como PDF” na janela de impressão.</p>
    </Modal>
  )
}
