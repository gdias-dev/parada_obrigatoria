import { useEffect, useState } from 'react'
import { ScanBarcode, Search } from 'lucide-react'
import { get, post, put } from '../../lib/api'
import { dinheiro, numero, paraCampo, porcentagem } from '../../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, InputQtd, Modal, useToast } from '../../components/ui'

const VAZIO = {
  codigo_barras: '', nome: '', categoria_id: '', unidade: 'UN',
  preco_custo: '', preco_venda: '', estoque: '', estoque_minimo: '',
  controla_estoque: true, visivel_online: true, descricao: '',
  eh_embalagem: false, produto_base_id: null, base: null, fator: '',
  usa_casco: false, valor_casco: '',
}

const UNIDADES = [
  ['UN', 'Unidade'], ['CX', 'Caixa'], ['PCT', 'Pacote'], ['KG', 'Quilo'], ['L', 'Litro'],
]

/** produto: null = fechado; {} = novo; objeto = editar */
export default function ProdutoModal({ produto, categorias, onFechar, onSalvo }) {
  const toast = useToast()
  const [f, setF] = useState(VAZIO)
  const [erro, setErro] = useState({})
  const [enviando, setEnviando] = useState(false)
  const novo = produto && !produto.id

  useEffect(() => {
    if (!produto) return
    setErro({})
    setF(produto.id ? {
      ...VAZIO, ...produto,
      codigo_barras: produto.codigo_barras || '',
      categoria_id: produto.categoria_id ?? '',
      preco_custo: paraCampo(produto.preco_custo),
      preco_venda: paraCampo(produto.preco_venda),
      estoque_minimo: paraCampo(produto.estoque_minimo, 3),
      descricao: produto.descricao || '',
      eh_embalagem: !!produto.produto_base_id,
      base: produto.produto_base_id ? { id: produto.produto_base_id, nome: produto.base_nome, preco_custo: produto.fator ? produto.preco_custo / produto.fator : 0, unidade: produto.base_unidade } : null,
      fator: produto.fator ? String(produto.fator) : '',
      valor_casco: produto.usa_casco ? paraCampo(produto.valor_casco) : '',
    } : { ...VAZIO, ...produto })
  }, [produto])

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }))

  const fator = numero(f.fator)
  const emb = f.eh_embalagem
  const custo = emb ? (f.base && fator ? Math.round(f.base.preco_custo * fator * 100) / 100 : 0) : (numero(f.preco_custo) ?? 0)
  const venda = numero(f.preco_venda)
  const lucro = venda !== null ? venda - custo : null
  const margem = venda ? (lucro / venda) * 100 : null

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro({})
    try {
      const corpo = {
        ...f, categoria_id: f.categoria_id || null,
        produto_base_id: emb ? f.base?.id ?? null : null,
        fator: emb ? f.fator : null,
        usa_casco: !emb && f.usa_casco,
        base: undefined, eh_embalagem: undefined,
      }
      if (emb && !corpo.produto_base_id) throw { message: 'Escolha de qual produto é este engradado.', data: { campo: 'produto_base_id' } }
      const salvo = novo ? await post('/produtos', corpo) : await put(`/produtos/${produto.id}`, corpo)
      toast(novo ? `${salvo.nome} cadastrado.` : 'Produto atualizado.')
      onSalvo(salvo)
    } catch (err) {
      setErro({ geral: err.data?.campo ? '' : err.message, [err.data?.campo]: err.message })
    } finally {
      setEnviando(false)
    }
  }

  async function alternarAtivo() {
    setEnviando(true)
    try {
      const salvo = await post(`/produtos/${produto.id}/ativo`, { ativo: !produto.ativo })
      toast(salvo.ativo ? 'Produto reativado.' : 'Produto desativado. Ele some do PDV e da loja online.')
      onSalvo(salvo)
    } catch (err) {
      setErro({ geral: err.message })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      titulo={novo ? 'Novo produto' : 'Editar produto'}
      aberto={!!produto}
      onFechar={onFechar}
      largura={620}
      rodape={<>
        {!novo && (
          <Botao variante={produto?.ativo ? 'perigo' : 'borda'} type="button" onClick={alternarAtivo} disabled={enviando} style={{ marginRight: 'auto' }}>
            {produto?.ativo ? 'Desativar' : 'Reativar'}
          </Botao>
        )}
        <Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao>
        <Botao form="form-produto" type="submit" carregando={enviando}>{novo ? 'Cadastrar' : 'Salvar'}</Botao>
      </>}
    >
      <form id="form-produto" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro.geral}</Alerta>

        <Campo rotulo="Código de barras" erro={erro.codigo_barras} dica="Clique no campo e passe o leitor no produto. Pode ficar vazio.">
          {(p) => (
            <div className="input-prefixo">
              <span aria-hidden><ScanBarcode size={18} /></span>
              <input {...p} className="input" value={f.codigo_barras} onChange={set('codigo_barras')} inputMode="numeric" autoComplete="off"
                // o leitor "digita" o código e aperta Enter: pula para o nome em vez de enviar o formulário
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('prod-nome')?.focus() } }} />
            </div>
          )}
        </Campo>

        <Campo rotulo="Nome do produto" erro={erro.nome} id="prod-nome">
          {(p) => <input {...p} className="input" value={f.nome} onChange={set('nome')} required minLength={2} maxLength={150} placeholder="Ex.: Cerveja Heineken Long Neck 330ml" />}
        </Campo>

        <div className="grid-form duas">
          <Campo rotulo="Categoria" erro={erro.categoria_id}>
            {(p) => (
              <select {...p} className="select" value={f.categoria_id} onChange={set('categoria_id')}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            )}
          </Campo>
          <Campo rotulo="Vendido por">
            {(p) => (
              <select {...p} className="select" value={f.unidade} onChange={set('unidade')}>
                {UNIDADES.map(([v, t]) => <option key={v} value={v}>{t} ({v})</option>)}
              </select>
            )}
          </Campo>
        </div>

        <div className="bloco-emb">
          <label className="interruptor">
            <input type="checkbox" checked={f.eh_embalagem} onChange={set('eh_embalagem')} />
            <span>É engradado, fardo ou pack<small>Vende várias unidades de outro produto juntas. O estoque fica na unidade.</small></span>
          </label>
          {emb && (
            <div className="grid-form duas">
              <Campo rotulo="Engradado de qual produto?" erro={erro.produto_base_id}>
                {(p) => <EscolherBase {...p} valor={f.base} onEscolher={(b) => setF((x) => ({ ...x, base: b }))} proprioId={produto?.id} />}
              </Campo>
              <Campo rotulo="Unidades no engradado" erro={erro.fator} dica={f.base && fator ? `1 engradado = ${fator} × ${f.base.nome}` : 'Ex.: 24, 12, 6'}>
                {(p) => <InputQtd {...p} value={f.fator} onChange={set('fator')} required sufixo="un" />}
              </Campo>
            </div>
          )}
        </div>

        <fieldset className="bloco-preco">
          <legend className="sr-only">Preços</legend>
          <div className="grid-form duas">
            {emb ? (
              <div className="campo">
                <label>Custo do engradado</label>
                <div className="valor-calculado">{dinheiro(custo)}</div>
                <span className="dica">Custo da unidade × {fator || '…'}</span>
              </div>
            ) : (
              <Campo rotulo="Preço de custo" erro={erro.preco_custo} dica="Quanto a loja paga">
                {(p) => <InputDinheiro {...p} value={f.preco_custo} onChange={set('preco_custo')} />}
              </Campo>
            )}
            <Campo rotulo="Preço de venda" erro={erro.preco_venda} dica="Quanto o cliente paga">
              {(p) => <InputDinheiro {...p} value={f.preco_venda} onChange={set('preco_venda')} required />}
            </Campo>
          </div>
          <div className={`lucro-previa ${lucro !== null && lucro < 0 ? 'negativo' : ''}`} aria-live="polite">
            {lucro === null
              ? 'Preencha os preços para ver o lucro por unidade.'
              : !custo
                ? 'Sem preço de custo, o relatório não consegue calcular o lucro deste produto.'
                : <>Lucro {emb ? 'por engradado' : 'por unidade'}: <strong>{dinheiro(lucro)}</strong> · margem de <strong>{porcentagem(margem.toFixed(1))}</strong>{lucro < 0 && ' (prejuízo)'}</>}
          </div>
        </fieldset>

        {!emb && <div className="grid-form duas">
          {novo && (
            <Campo rotulo="Estoque atual" erro={erro.estoque} dica="Quantidade que tem hoje na loja">
              {(p) => <InputQtd {...p} value={f.estoque} onChange={set('estoque')} placeholder="0" sufixo={f.unidade.toLowerCase()} />}
            </Campo>
          )}
          <Campo rotulo="Estoque mínimo" erro={erro.estoque_minimo} dica="Abaixo disso, o produto aparece como acabando">
            {(p) => <InputQtd {...p} value={f.estoque_minimo} onChange={set('estoque_minimo')} placeholder="0" sufixo={f.unidade.toLowerCase()} />}
          </Campo>
        </div>}

        <div className="interruptores">
          {!emb && (
            <label className="interruptor">
              <input type="checkbox" checked={f.controla_estoque} onChange={set('controla_estoque')} />
              <span>Controlar estoque<small>Desligue para drinks e combos montados na hora</small></span>
            </label>
          )}
          {!emb && (
            <label className="interruptor">
              <input type="checkbox" checked={f.usa_casco} onChange={set('usa_casco')} />
              <span>Usa casco retornável<small>Ex.: Coca e Fanta 2L. Quem não trouxer o casco paga o valor dele.</small></span>
            </label>
          )}
          {!emb && f.usa_casco && (
            <Campo rotulo="Valor do casco" erro={erro.valor_casco} dica="Cobrado à parte quando o cliente não traz o casco vazio">
              {(p) => <InputDinheiro {...p} value={f.valor_casco} onChange={set('valor_casco')} required />}
            </Campo>
          )}
          <label className="interruptor">
            <input type="checkbox" checked={f.visivel_online} onChange={set('visivel_online')} />
            <span>Mostrar nos pedidos online</span>
          </label>
        </div>

        <Campo rotulo="Descrição (opcional)" dica="Aparece na página de pedidos online">
          {(p) => <textarea {...p} className="input" rows={2} maxLength={255} value={f.descricao} onChange={set('descricao')} />}
        </Campo>
      </form>
    </Modal>
  )
}

/** Busca o produto vendido por unidade (a "unidade" do engradado). */
function EscolherBase({ valor, onEscolher, proprioId, id, ...rest }) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState([])
  const [editando, setEditando] = useState(!valor)
  useEffect(() => { setEditando(!valor) }, [valor])
  useEffect(() => {
    if (!editando || texto.trim().length < 2) { setLista([]); return }
    const t = setTimeout(() => {
      get(`/produtos?so_unidades=1&limite=8&busca=${encodeURIComponent(texto.trim())}`)
        .then((r) => setLista(r.itens.filter((p) => p.id !== proprioId))).catch(() => {})
    }, 200)
    return () => clearTimeout(t)
  }, [texto, editando, proprioId])

  if (!editando && valor) {
    return (
      <div className="base-escolhida">
        <span>{valor.nome}</span>
        <button type="button" className="link" onClick={() => setEditando(true)}>trocar</button>
      </div>
    )
  }
  return (
    <div className="escolher-base">
      <div className="busca">
        <Search size={16} aria-hidden />
        <input {...rest} id={id} className="input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite o nome da unidade" autoComplete="off" />
      </div>
      {lista.length > 0 && (
        <ul className="busca-lista">
          {lista.map((p) => (
            <li key={p.id}><button type="button" onClick={() => { onEscolher(p); setTexto(''); setEditando(false) }}>
              <span><strong>{p.nome}</strong><small>{p.codigo_barras || 'sem código'}</small></span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  )
}
