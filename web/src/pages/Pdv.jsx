import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, Trash2, Lock, CheckCircle2, Receipt, ShoppingCart } from 'lucide-react'
import { post } from '../lib/api'
import { useCaixa } from '../lib/caixa'
import { arred } from '../lib/caixa'
import { dinheiro, numero, quantidade } from '../lib/format'
import { Botao, InputDinheiro, Modal, useToast } from '../components/ui'
import BuscaProduto from '../components/BuscaProduto'
import PagamentoModal from '../components/PagamentoModal'
import { ReciboModal } from '../components/Recibo'

const CHAVE_CARRINHO = 'parada.carrinho'

/** Valor do casco por unidade vendida (Coca 2L) — engradado conta 1 casco por unidade. */
export function cascoDe(p) {
  if (p.usa_casco && p.valor_casco > 0) return { valor: p.valor_casco, porItem: 1 }
  if (p.casco_da_base) return { valor: p.casco_da_base, porItem: p.fator }
  return null
}

export function totalItem(i) {
  const c = cascoDe(i.produto)
  const casco = c && !i.casco_trouxe ? arred(c.valor * c.porItem * i.quantidade) : 0
  return { produtos: arred(i.produto.preco_venda * i.quantidade), casco }
}

export function LinhaCarrinho({ item, onQtd, onRemover, onCasco }) {
  const p = item.produto
  const c = cascoDe(p)
  const t = totalItem(item)
  const disp = p.produto_base_id ? p.estoque_embalagens : p.controla_estoque ? p.estoque : null
  const fracionado = ['KG', 'L'].includes(p.unidade)
  return (
    <li className="carrinho-item">
      <div className="ci-nome">
        <strong>{p.nome}</strong>
        <small>{dinheiro(p.preco_venda)} {p.unidade !== 'UN' ? `/${p.unidade.toLowerCase()}` : 'cada'}
          {disp !== null && item.quantidade > disp && <span className="aviso-estoque"> · estoque: {quantidade(disp)}</span>}
        </small>
      </div>
      <div className="ci-qtd">
        <button className="btn btn-borda btn-icone" onClick={() => onQtd(item.quantidade - 1)} disabled={item.quantidade <= 1} aria-label="Menos um"><Minus size={16} /></button>
        <input className="input" inputMode={fracionado ? 'decimal' : 'numeric'} value={String(item.quantidade).replace('.', ',')} aria-label={`Quantidade de ${p.nome}`}
          onChange={(e) => { const n = numero(e.target.value); if (n && n > 0) onQtd(fracionado ? n : Math.round(n)) }} />
        <button className="btn btn-borda btn-icone" onClick={() => onQtd(item.quantidade + 1)} aria-label="Mais um"><Plus size={16} /></button>
      </div>
      <b className="ci-total">{dinheiro(t.produtos)}</b>
      <button className="btn btn-texto btn-icone ci-remover" onClick={onRemover} aria-label={`Tirar ${p.nome}`}><Trash2 size={16} /></button>
      {c && (
        <label className="ci-casco">
          <input type="checkbox" checked={item.casco_trouxe} onChange={(e) => onCasco(e.target.checked)} />
          <span>Trouxe o casco vazio? {item.casco_trouxe ? <b>Sim</b> : <>Não — cobrando <b>+ {dinheiro(t.casco)}</b>{c.porItem * item.quantidade > 1 && ` (${c.porItem * item.quantidade} cascos)`}</>}</span>
        </label>
      )}
    </li>
  )
}

export function adicionarAoCarrinho(lista, p, qtd = 1) {
  const i = lista.findIndex((x) => x.produto.id === p.id)
  if (i >= 0) return lista.map((x, j) => (j === i ? { ...x, quantidade: arred(x.quantidade + qtd) } : x))
  return [...lista, { produto: p, quantidade: qtd, casco_trouxe: false }]
}

export default function Pdv() {
  const { caixa, sessao } = useCaixa()
  const toast = useToast()
  const [itens, setItens] = useState(() => { try { return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || [] } catch { return [] } })
  const [desconto, setDesconto] = useState('')
  const [pagando, setPagando] = useState(false)
  const [concluida, setConcluida] = useState(null)
  const [recibo, setRecibo] = useState(null)
  const [verCarrinho, setVerCarrinho] = useState(false)
  const buscaRef = useRef(null)

  useEffect(() => { try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(itens)) } catch {} }, [itens])

  const totais = itens.reduce((s, i) => { const t = totalItem(i); return { produtos: s.produtos + t.produtos, casco: s.casco + t.casco } }, { produtos: 0, casco: 0 })
  const subtotal = arred(totais.produtos + totais.casco)
  const desc = Math.min(numero(desconto) || 0, totais.produtos)
  const devido = arred(subtotal - desc)
  const qtdItens = itens.reduce((s, i) => s + i.quantidade, 0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F9' && itens.length && sessao) { e.preventDefault(); setPagando(true) }
      if (e.key === 'F2') { e.preventDefault(); buscaRef.current?.focar() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [itens.length, sessao])

  if (!caixa || !sessao) {
    return (
      <div className="pagina">
        <section className="painel painel-corpo vazio">
          <Lock size={36} aria-hidden color="var(--texto-3)" />
          <h3 style={{ marginTop: 12 }}>{caixa ? `O ${caixa.nome} está fechado` : 'Escolha o caixa deste aparelho'}</h3>
          <p>Para vender, abra o caixa informando o troco da gaveta.</p>
          <div className="vazio-acoes"><Link to="/caixa" className="btn btn-primario">{caixa ? 'Abrir caixa' : 'Escolher caixa'}</Link></div>
        </section>
      </div>
    )
  }

  const alterar = (idx, campos) => setItens((l) => l.map((x, j) => (j === idx ? { ...x, ...campos } : x)))

  async function finalizar(pagamentos, clienteId) {
    const venda = await post('/vendas', {
      caixa_sessao_id: sessao.id,
      cliente_id: clienteId || undefined,
      itens: itens.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade, casco_trouxe: i.casco_trouxe })),
      desconto: desc || undefined,
      pagamentos,
    })
    setPagando(false); setItens([]); setDesconto(''); setVerCarrinho(false)
    setConcluida(venda)
  }

  function novaVenda() {
    setConcluida(null)
    setTimeout(() => buscaRef.current?.focar(), 50)
  }

  const troco = concluida ? concluida.pagamentos.reduce((s, p) => s + p.troco, 0) : 0

  return (
    <div className="pdv">
      <section className="pdv-busca">
        <div className="pdv-cab">
          <h1>Vender</h1>
          <span className="etiqueta etiqueta-func">{caixa.nome}</span>
          <span className="atalhos-teclado">F2 busca · F9 cobrar</span>
        </div>
        <BuscaProduto ref={buscaRef}
          onEscolher={(p, qtd) => { setItens((l) => adicionarAoCarrinho(l, p, qtd)); toast(`${qtd > 1 ? qtd + '× ' : ''}${p.nome}`) }}
          onErro={(m) => toast(m, 'erro')} />
      </section>

      <aside className={`pdv-carrinho ${verCarrinho ? 'aberto' : ''}`} aria-label="Carrinho">
        <div className="carrinho-cab">
          <h2>Carrinho</h2>
          {itens.length > 0 && <button className="btn btn-texto" onClick={() => { if (confirmarLimpar()) { setItens([]); setDesconto('') } }}>Limpar</button>}
          <button className="btn btn-texto so-celular" onClick={() => setVerCarrinho(false)}>Fechar</button>
        </div>
        {itens.length === 0 ? (
          <div className="carrinho-vazio">
            <ShoppingCart size={32} aria-hidden />
            <p>Passe o leitor no produto ou toque nele na lista.</p>
          </div>
        ) : (
          <ul className="carrinho-lista">
            {itens.map((i, idx) => (
              <LinhaCarrinho key={i.produto.id} item={i}
                onQtd={(q) => alterar(idx, { quantidade: q })}
                onCasco={(v) => alterar(idx, { casco_trouxe: v })}
                onRemover={() => setItens((l) => l.filter((_, j) => j !== idx))} />
            ))}
          </ul>
        )}
        <div className="carrinho-rodape">
          <dl>
            <dt>Produtos</dt><dd>{dinheiro(totais.produtos)}</dd>
            {totais.casco > 0 && <><dt>Cascos</dt><dd>{dinheiro(totais.casco)}</dd></>}
            <dt><label htmlFor="pdv-desc">Desconto</label></dt>
            <dd><InputDinheiro id="pdv-desc" value={desconto} onChange={setDesconto} placeholder="0,00" /></dd>
          </dl>
          <Botao className="btn-bloco btn-grande btn-cobrar" disabled={!itens.length || devido <= 0} onClick={() => setPagando(true)}>
            Cobrar {dinheiro(devido)}
          </Botao>
        </div>
      </aside>

      {itens.length > 0 && (
        <button className="pdv-barra-celular" onClick={() => setVerCarrinho(true)}>
          <span>{quantidade(qtdItens)} ite{qtdItens === 1 ? 'm' : 'ns'}</span>
          <b>Ver carrinho · {dinheiro(devido)}</b>
        </button>
      )}

      <PagamentoModal aberto={pagando} devido={devido} titulo="Receber pagamento" onFechar={() => setPagando(false)} onConfirmar={finalizar} />

      {concluida && (
        <Modal titulo="Venda concluída" aberto onFechar={novaVenda} largura={420}
          rodape={<>
            <Botao variante="borda" onClick={() => setRecibo(concluida)}><Receipt size={18} aria-hidden /> Comprovante</Botao>
            <Botao onClick={novaVenda} autoFocus>Nova venda</Botao>
          </>}>
          <div className="venda-ok">
            <CheckCircle2 size={44} aria-hidden />
            <p>Venda nº {concluida.id} · {dinheiro(concluida.total)}</p>
            {troco > 0 ? <div className="troco-grande"><span>Troco</span><strong>{dinheiro(troco)}</strong></div> : <p className="dica">Sem troco.</p>}
          </div>
        </Modal>
      )}
      <ReciboModal tipo="venda" dados={recibo} aberto={!!recibo} onFechar={() => setRecibo(null)} />
    </div>
  )
}

function confirmarLimpar() {
  // sem window.confirm (bloqueia o app instalado em alguns celulares): limpa direto
  return true
}
