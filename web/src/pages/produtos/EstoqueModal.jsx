import { useEffect, useState } from 'react'
import { get, post } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { dataHora, dinheiro, numero, paraCampo, quantidade } from '../../lib/format'
import { Alerta, Botao, Campo, InputDinheiro, InputQtd, Modal, useToast } from '../../components/ui'

const TIPOS = {
  entrada: { rotulo: 'Entrada', dica: 'Chegou mercadoria' },
  saida: { rotulo: 'Saída', dica: 'Perda, quebra, vencido, consumo' },
  ajuste: { rotulo: 'Contagem', dica: 'Informe quanto tem de verdade' },
}

const NOME_MOV = {
  entrada: 'Entrada', saida: 'Saída', ajuste: 'Contagem', venda: 'Venda',
  cancelamento: 'Venda cancelada', importacao: 'Planilha',
}

const MOTIVOS_SAIDA = ['Quebrou', 'Venceu', 'Consumo da casa', 'Cortesia', 'Erro de cadastro']

export default function EstoqueModal({ produto, onFechar, onSalvo }) {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const [tipo, setTipo] = useState('entrada')
  const [qtd, setQtd] = useState('')
  const [custo, setCusto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [historico, setHistorico] = useState(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!produto) return
    setTipo(produto.dose_ml ? 'saida' : 'entrada'); setQtd(''); setMotivo(''); setErro('')
    setCusto(isAdmin ? paraCampo(produto.preco_custo) : '')
    setHistorico(null)
    get(`/produtos/${produto.id}/movimentacoes`).then(setHistorico).catch(() => setHistorico([]))
  }, [produto, isAdmin])

  if (!produto) return null

  const emb = !!produto.produto_base_id
  const dose = !!produto.dose_ml
  const controla = (emb ? produto.base_controla : produto.controla_estoque) && !(dose && !isAdmin)
  const n = numero(qtd)
  const atual = emb ? produto.estoque_embalagens : produto.estoque
  const depois = n === null ? null : tipo === 'entrada' ? atual + n : tipo === 'saida' ? atual - n : n
  const un = produto.unidade
  const tipos = Object.entries(TIPOS).filter(([k]) => !(emb && k === 'ajuste') && !(dose && k === 'entrada'))

  async function salvar(e) {
    e.preventDefault()
    setEnviando(true); setErro('')
    try {
      const salvo = await post(`/produtos/${produto.id}/estoque`, {
        tipo, quantidade: qtd, motivo: motivo || undefined,
        custo_unitario: isAdmin && tipo === 'entrada' && custo ? custo : undefined,
      })
      toast(`Estoque de ${salvo.nome}: ${quantidade(salvo.estoque, un)}`)
      onSalvo(salvo)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  const custoMudou = isAdmin && tipo === 'entrada' && numero(custo) !== null && Math.abs(numero(custo) - produto.preco_custo) > 0.004

  return (
    <Modal
      titulo="Movimentar estoque"
      aberto
      onFechar={onFechar}
      largura={560}
      rodape={<>
        <Botao variante="borda" type="button" onClick={onFechar}>Cancelar</Botao>
        {controla && <Botao form="form-estoque" type="submit" carregando={enviando} disabled={n === null}>
          {tipo === 'entrada' ? 'Lançar entrada' : tipo === 'saida' ? 'Lançar saída' : 'Salvar contagem'}
        </Botao>}
      </>}
    >
      <div className="estoque-cab">
        <strong>{produto.nome}</strong>
        {dose
          ? <span>Dá para servir <b>{quantidade(atual)} doses</b> ({quantidade(produto.base_estoque)} garrafas de {produto.base_nome}). Entrada e contagem são feitas na garrafa; aqui só a saída de doses (cortesia, derramou).</span>
          : emb
          ? <span>Tem <b>{quantidade(atual)} {un.toLowerCase()}</b> ({quantidade(produto.base_estoque)} unidades de {produto.base_nome}). O estoque é guardado em unidades.</span>
          : controla ? <span>Estoque agora: <b>{quantidade(atual, un)}</b></span> : <span>Este produto não controla estoque.</span>}
      </div>

      {controla && <form id="form-estoque" className="grid-form" onSubmit={salvar}>
        <Alerta>{erro}</Alerta>
        {isAdmin && (
          <div className="segmento segmento-largo" role="group" aria-label="Tipo de movimento">
            {tipos.map(([k, t]) => (
              <button key={k} type="button" aria-pressed={tipo === k} onClick={() => { setTipo(k); setErro('') }}>{t.rotulo}</button>
            ))}
          </div>
        )}

        <div className="grid-form duas">
          <Campo rotulo={tipo === 'ajuste' ? 'Quantidade contada' : dose ? 'Quantas doses' : emb ? 'Quantos engradados' : 'Quantidade'} dica={dose && n ? `= ${quantidade(n * produto.fator)} garrafa` : emb && n ? `= ${quantidade(n * produto.fator)} unidades` : tipo === 'ajuste' && produto.volume_ml ? 'Garrafa aberta: use decimal (ex.: 3,5)' : TIPOS[tipo].dica}>
            {(p) => <InputQtd {...p} value={qtd} onChange={setQtd} required autoFocus sufixo={un.toLowerCase()} />}
          </Campo>
          {isAdmin && tipo === 'entrada' && (
            <Campo rotulo={emb ? 'Custo do engradado' : 'Custo por unidade'} dica={custoMudou ? 'O preço de custo do produto será atualizado' : 'Quanto pagou nesta compra'}>
              {(p) => <InputDinheiro {...p} value={custo} onChange={setCusto} />}
            </Campo>
          )}
        </div>

        {tipo !== 'entrada' && (
          <Campo rotulo="Motivo" dica={tipo === 'ajuste' ? 'Ex.: contagem semanal' : undefined}>
            {(p) => (
              <>
                <input {...p} className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required maxLength={255} />
                {tipo === 'saida' && (
                  <div className="chips">
                    {MOTIVOS_SAIDA.map((m) => <button key={m} type="button" className="chip" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}
                  </div>
                )}
              </>
            )}
          </Campo>
        )}

        {depois !== null && (
          <p className={`estoque-previa ${depois < 0 ? 'negativo' : ''}`}>
            O estoque vai de <b>{quantidade(atual, un)}</b> para <b>{quantidade(depois, un)}</b>
            {depois < 0 && ' — ficaria negativo, confira a quantidade'}
          </p>
        )}
      </form>}

      {produto.usa_casco && <CascosBloco produto={produto} onSalvo={onSalvo} />}

      <details className="historico">
        <summary>Últimas movimentações</summary>
        {historico === null ? <p className="dica">Carregando…</p>
          : historico.length === 0 ? <p className="dica">Nenhuma movimentação ainda.</p>
          : (
            <ul>
              {historico.slice(0, 30).map((m) => (
                <li key={m.id}>
                  <span className={`mov ${m.quantidade < 0 ? 'sai' : 'entra'}`}>{m.quantidade > 0 ? '+' : ''}{quantidade(m.quantidade)}</span>
                  <span className="mov-txt">
                    <b>{NOME_MOV[m.tipo] || m.tipo}</b>{m.motivo && ` · ${m.motivo}`}
                    {m.custo_unitario !== null && m.tipo === 'entrada' && ` · ${dinheiro(m.custo_unitario)}/un`}
                    <small>{dataHora(m.criado_em)}{m.usuario && ` · ${m.usuario}`} · ficou {quantidade(m.estoque_apos, un)}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
      </details>
    </Modal>
  )
}

function CascosBloco({ produto, onSalvo }) {
  const toast = useToast()
  const [tipo, setTipo] = useState('devolvido_fornecedor')
  const [qtd, setQtd] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function salvar() {
    setEnviando(true); setErro('')
    try {
      const p = await post(`/produtos/${produto.id}/cascos`, { tipo, quantidade: qtd })
      toast(`Cascos de ${p.nome}: ${p.estoque_cascos}`)
      onSalvo(p)
    } catch (e) { setErro(e.message) } finally { setEnviando(false) }
  }
  return (
    <section className="cascos-bloco">
      <h3>Cascos vazios na loja: {produto.estoque_cascos}</h3>
      <p className="dica">Sobe sozinho quando o cliente traz o casco. Registre aqui quando devolver ao fornecedor.</p>
      <div className="linha-form">
        <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Movimento de cascos">
          <option value="devolvido_fornecedor">Devolvi ao fornecedor</option>
          <option value="recebido">Recebi cascos</option>
          <option value="contagem">Contei os cascos (total)</option>
        </select>
        <input className="input" inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/\D/g, ''))} placeholder="Qtd" aria-label="Quantidade de cascos" style={{ flex: '0 0 90px' }} />
        <Botao variante="borda" onClick={salvar} carregando={enviando} disabled={!qtd}>Salvar</Botao>
      </div>
      <Alerta>{erro}</Alerta>
    </section>
  )
}
