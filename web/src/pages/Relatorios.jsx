import { useEffect, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, FileSpreadsheet, Printer, Search, Table2, LineChart } from 'lucide-react'
import { get } from '../lib/api'
import { porcentagem, quantidade } from '../lib/format'
import { Olhinho, din, usePrivacidade } from '../lib/privacidade'
import { Alerta, Botao, useToast } from '../components/ui'
import { BarraCelula, GraficoBarras, GraficoLinhas, eixoDinheiro } from '../components/Graficos'

// ---------- datas
const iso = (d) => d.toLocaleDateString('sv-SE')
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const deISO = (s) => new Date(s + 'T12:00:00')

const PERIODOS = [
  ['hoje', 'Hoje', () => { const h = new Date(); return [iso(h), iso(h)] }],
  ['ontem', 'Ontem', () => { const o = somaDias(new Date(), -1); return [iso(o), iso(o)] }],
  ['semana', 'Esta semana', () => { const h = new Date(); return [iso(somaDias(h, -((h.getDay() + 6) % 7))), iso(h)] }],
  ['mes', 'Este mês', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)] }],
  ['mes_passado', 'Mês passado', () => { const h = new Date(); return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))] }],
  ['30', '30 dias', () => { const h = new Date(); return [iso(somaDias(h, -29)), iso(h)] }],
  ['custom', 'Escolher datas', null],
]

const dm = (s) => deISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
const dataLonga = (s) => deISO(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const mesNome = (s) => deISO(s).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
function rotulosPeriodo(p, agrupar) {
  if (agrupar === 'mes') return { rotulo: deISO(p).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), titulo: mesNome(p) }
  if (agrupar === 'semana') return { rotulo: dm(p), titulo: `Semana de ${dm(p)} a ${dm(iso(somaDias(deISO(p), 6)))}` }
  const d = deISO(p)
  return { rotulo: dm(p), titulo: d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) }
}
const textoPeriodo = (de, ate) => (de === ate ? dataLonga(de) : `${dataLonga(de)} a ${dataLonga(ate)}`)

const ORIGENS = { balcao: 'Balcão (PDV)', comanda: 'Comandas', online: 'Pedidos online' }
const COR_1 = 'var(--serie-1)'
const COR_2 = 'var(--serie-2)'
const fmtDinheiro = { eixo: eixoDinheiro, dica: din }

// ---------- comparação com o período anterior
function Variacao({ atual, anterior, pontos = false }) {
  if (anterior === null || anterior === undefined || (!pontos && !anterior)) return <small className="var-neutra">sem base para comparar</small>
  const dif = pontos ? atual - anterior : ((atual - anterior) / Math.abs(anterior)) * 100
  if (Math.abs(dif) < 0.05) return <small className="var-neutra">igual ao período anterior</small>
  const sobe = dif > 0
  const Icone = sobe ? ArrowUpRight : ArrowDownRight
  const txt = pontos ? `${Math.abs(dif).toFixed(1).replace('.', ',')} p.p.`
    : dif >= 200 && anterior > 0 ? `${(atual / anterior).toFixed(1).replace('.', ',')}×` : `${Math.abs(dif).toFixed(1).replace('.', ',')}%`
  return <small className={sobe ? 'var-sobe' : 'var-desce'}><Icone size={14} aria-hidden />{sobe ? (txt.endsWith('×') ? 'foi' : 'subiu') : 'caiu'} {txt} <span>vs. anterior</span></small>
}

export default function Relatorios() {
  usePrivacidade()
  const toast = useToast()
  const [periodo, setPeriodo] = useState('hoje')
  const [custom, setCustom] = useState(() => [iso(somaDias(new Date(), -6)), iso(new Date())])
  const [agrupar, setAgrupar] = useState('')
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aba, setAba] = useState('produtos')

  const [de, ate] = periodo === 'custom' ? custom : PERIODOS.find((p) => p[0] === periodo)[2]()

  useEffect(() => {
    if (!de || !ate) return
    const q = new URLSearchParams({ de, ate })
    if (agrupar) q.set('agrupar', agrupar)
    setCarregando(true)
    setErro('')
    get(`/relatorios?${q}`).then(setDados).catch((e) => setErro(e.message)).finally(() => setCarregando(false))
  }, [de, ate, agrupar])

  useEffect(() => { setAgrupar('') }, [periodo])

  const imprimir = () => {
    const t = document.title
    document.title = `Relatório Parada Obrigatória ${de}${de !== ate ? ' a ' + ate : ''}`
    window.print()
    document.title = t
  }

  const exportar = async () => {
    try {
      await exportarExcel(dados)
    } catch (e) {
      toast(e.message || 'Não foi possível gerar a planilha.', 'erro')
    }
  }

  const r = dados?.resumo
  const a = dados?.anterior

  return (
    <div className="pagina pagina-larga relatorio area-impressao">
      <div className="pagina-topo">
        <div>
          <h1>Relatórios</h1>
          <p>Quanto entrou, quanto custou e quanto sobrou de lucro.</p>
        </div>
        <div className="acoes-topo nao-imprimir">
          <Olhinho />
          <Botao variante="borda" onClick={imprimir} disabled={!dados}><Printer size={18} aria-hidden /> Imprimir / PDF</Botao>
          <Botao variante="borda" onClick={exportar} disabled={!dados}><FileSpreadsheet size={18} aria-hidden /> Excel</Botao>
        </div>
      </div>

      <p className="so-impressao rel-cab-impressao">
        <b>Parada Obrigatória</b> — Relatório financeiro de {textoPeriodo(de, ate)}
        {dados && ` (comparado com ${textoPeriodo(dados.periodo.anterior_de, dados.periodo.anterior_ate)})`}
      </p>

      <div className="rel-filtros nao-imprimir">
        <div className="chips" role="group" aria-label="Período">
          {PERIODOS.map(([v, t]) => <button key={v} type="button" className="chip chip-grande" aria-pressed={periodo === v} onClick={() => setPeriodo(v)}>{t}</button>)}
        </div>
        {periodo === 'custom' && (
          <div className="rel-datas">
            <label>De <input className="input" type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} /></label>
            <label>Até <input className="input" type="date" value={custom[1]} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} /></label>
          </div>
        )}
      </div>
      <p className="rel-periodo nao-imprimir" aria-live="polite">
        {textoPeriodo(de, ate)}
        {dados && <span> · comparando com {textoPeriodo(dados.periodo.anterior_de, dados.periodo.anterior_ate)}</span>}
        {carregando && <span> · atualizando…</span>}
      </p>
      <Alerta>{erro}</Alerta>

      {r && (
        <>
          <section className="rel-kpis" aria-label="Resumo do período">
            <div>
              <span>Faturamento</span>
              <strong>{din(r.faturamento)}</strong>
              <Variacao atual={r.faturamento} anterior={a.faturamento} />
            </div>
            <div className="destaque">
              <span>Lucro líquido</span>
              <strong className={r.lucro < 0 ? 'lucro-negativo' : ''}>{din(r.lucro)}</strong>
              <Variacao atual={r.lucro} anterior={a.lucro} />
            </div>
            <div>
              <span>Margem de lucro</span>
              <strong>{porcentagem(r.margem)}</strong>
              <Variacao atual={r.margem ?? 0} anterior={a.margem} pontos />
            </div>
            <div>
              <span>Vendas</span>
              <strong>{r.vendas}</strong>
              <small className="var-neutra">ticket médio {din(r.ticket_medio)}</small>
            </div>
          </section>

          {r.vendas === 0 ? (
            <div className="painel painel-corpo vazio"><p>Nenhuma venda concluída neste período.</p></div>
          ) : (
            <div className="rel-duas">
              <DoFaturamentoAoLucro r={r} />
              <SerieTempo dados={dados} agrupar={agrupar || dados.periodo.agrupar} setAgrupar={setAgrupar} />
            </div>
          )}

          {r.vendas > 0 && (
            <>
              <div className="segmento rel-abas nao-imprimir" role="tablist" aria-label="Detalhes">
                {[['produtos', 'Produtos'], ['categorias', 'Categorias'], ['pagamentos', 'Pagamentos'], ['equipe', 'Equipe'], ['horarios', 'Horários'], ['fiado', 'Fiado e entregas']].map(([v, t]) => (
                  <button key={v} role="tab" aria-selected={aba === v} aria-pressed={aba === v} onClick={() => setAba(v)}>{t}</button>
                ))}
              </div>
              <div className={aba === 'produtos' ? '' : 'aba-oculta'}><AbaProdutos dados={dados} /></div>
              <div className={aba === 'categorias' ? '' : 'aba-oculta'}><AbaCategorias dados={dados} /></div>
              <div className={aba === 'pagamentos' ? '' : 'aba-oculta'}><AbaPagamentos dados={dados} /></div>
              <div className={aba === 'equipe' ? '' : 'aba-oculta'}><AbaEquipe dados={dados} /></div>
              <div className={aba === 'horarios' ? '' : 'aba-oculta'}><AbaHorarios dados={dados} /></div>
              <div className={aba === 'fiado' ? '' : 'aba-oculta'}><AbaFiado dados={dados} /></div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function DoFaturamentoAoLucro({ r }) {
  return (
    <section className="painel rel-dre">
      <div className="painel-cab"><h2>Do faturamento ao lucro</h2></div>
      <dl>
        <div className="dre-total"><dt>Faturamento <small>tudo que os clientes pagaram</small></dt><dd>{din(r.faturamento)}</dd></div>
        {r.cascos > 0 && <div><dt>− Cascos cobrados <small>depósito do vasilhame, não é venda</small></dt><dd>{din(-r.cascos)}</dd></div>}
        <div><dt>− Custo das mercadorias <small>{porcentagem(r.cmv_pct)} do valor vendido em produtos</small></dt><dd>{din(-r.cmv)}</dd></div>
        <div><dt>− Taxas da maquininha</dt><dd>{din(-r.taxas_maquininha)}</dd></div>
        {r.entregadores > 0 && <div><dt>− Pago aos entregadores</dt><dd>{din(-r.entregadores)}</dd></div>}
        <div className={`dre-lucro ${r.lucro < 0 ? 'neg' : ''}`}><dt>= Lucro líquido</dt><dd>{din(r.lucro)}</dd></div>
      </dl>
      <ul className="dre-notas">
        {r.descontos > 0 && <li>Descontos dados: <b>{din(r.descontos)}</b> (já descontados do faturamento)</li>}
        {r.acrescimos > 0 && <li>Acréscimos cobrados no cartão: <b>{din(r.acrescimos)}</b></li>}
        {r.taxas_entrega > 0 && <li>Taxas de entrega cobradas: <b>{din(r.taxas_entrega)}</b></li>}
        {r.canceladas > 0 && <li>{r.canceladas} {r.canceladas === 1 ? 'venda cancelada' : 'vendas canceladas'} ({din(r.canceladas_valor)}) — não entram nas contas</li>}
        <li>Contas de luz, aluguel, salários e outras despesas fixas não entram aqui.</li>
      </ul>
    </section>
  )
}

function SerieTempo({ dados, agrupar, setAgrupar }) {
  const [tabela, setTabela] = useState(false)
  const pontos = dados.serie.map((s) => ({ ...s, ...rotulosPeriodo(s.periodo, dados.periodo.agrupar) }))
  const nome = dados.periodo.dias === 1 ? 'horário' : { dia: 'dia', semana: 'semana', mes: 'mês' }[dados.periodo.agrupar]
  const series = [{ chave: 'faturamento', nome: 'Faturamento', cor: COR_1 }, { chave: 'lucro', nome: 'Lucro líquido', cor: COR_2 }]
  const melhor = pontos.reduce((m, p) => (p.faturamento > (m?.faturamento ?? -1) ? p : m), null)

  return (
    <section className="painel rel-serie">
      <div className="painel-cab">
        <h2>Por {nome}</h2>
        <div className="rel-serie-acoes nao-imprimir">
          {dados.periodo.dias > 13 && (
            <div className="segmento" role="group" aria-label="Agrupar por">
              {[['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([v, t]) => (
                <button key={v} aria-pressed={agrupar === v} onClick={() => setAgrupar(v)} disabled={v === 'dia' && dados.periodo.dias > 120}>{t}</button>
              ))}
            </div>
          )}
          {pontos.length > 1 && <button type="button" className="btn btn-texto" onClick={() => setTabela(!tabela)} aria-pressed={tabela}>
            {tabela ? <><LineChart size={16} aria-hidden /> Gráfico</> : <><Table2 size={16} aria-hidden /> Tabela</>}
          </button>}
        </div>
      </div>
      <div className="painel-corpo">
        {pontos.length < 2 ? (
          <GraficoHoras dados={dados} />
        ) : tabela ? (
          <div className="tabela-rolagem">
            <table className="tabela tabela-compacta">
              <thead><tr><th>{nome[0].toUpperCase() + nome.slice(1)}</th><th className="num">Vendas</th><th className="num">Faturamento</th><th className="num">Lucro</th></tr></thead>
              <tbody>{pontos.map((p) => <tr key={p.periodo}><td>{p.titulo}</td><td className="num">{p.vendas}</td><td className="num">{din(p.faturamento)}</td><td className="num">{din(p.lucro)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <>
            <GraficoLinhas dados={pontos} series={series} formato={fmtDinheiro}
              descricao={`Faturamento e lucro por ${nome}. Melhor ${nome}: ${melhor?.titulo}, ${din(melhor?.faturamento)}.`} />
            {melhor?.faturamento > 0 && <p className="dica">Melhor {nome}: <b>{melhor.titulo}</b> com {din(melhor.faturamento)} de faturamento.</p>}
          </>
        )}
      </div>
    </section>
  )
}

const ORDENS = [['quantidade', 'Mais vendidos'], ['faturamento', 'Faturamento'], ['lucro', 'Lucro'], ['margem', 'Margem']]

function AbaProdutos({ dados }) {
  const [ordem, setOrdem] = useState('quantidade')
  const [busca, setBusca] = useState('')
  const [todos, setTodos] = useState(false)
  const lista = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return dados.produtos.filter((p) => !b || p.nome.toLowerCase().includes(b)).sort((x, y) => (y[ordem] ?? -999) - (x[ordem] ?? -999))
  }, [dados, ordem, busca])
  const vistos = lista
  const semCusto = dados.produtos.filter((p) => p.sem_custo).length
  const tot = lista.reduce((s, p) => ({ fat: s.fat + p.faturamento, custo: s.custo + p.custo }), { fat: 0, custo: 0 })

  return (
    <section className="painel">
      <div className="painel-cab">
        <h2>Lucro por produto</h2>
        <div className="rel-prod-filtros nao-imprimir">
          <div className="busca"><Search size={16} aria-hidden /><input className="input" placeholder="Buscar produto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" /></div>
          <div className="segmento" role="group" aria-label="Ordenar por">
            {ORDENS.map(([v, t]) => <button key={v} aria-pressed={ordem === v} onClick={() => setOrdem(v)}>{t}</button>)}
          </div>
        </div>
      </div>
      {semCusto > 0 && <div className="painel-corpo rel-aviso"><Alerta tipo="aviso">{semCusto === 1 ? '1 produto vendido está' : `${semCusto} produtos vendidos estão`} sem preço de custo — o lucro dele aparece maior do que é. Cadastre o custo em Produtos.</Alerta></div>}
      <div className="tabela-rolar-x">
        <table className="tabela tabela-compacta">
          <thead><tr><th>#</th><th>Produto</th><th className="num">Qtd</th><th className="num">Faturamento</th><th className="num esconde-cel">Custo</th><th className="num">Lucro</th><th className="num">Margem</th></tr></thead>
          <tbody>
            {vistos.map((p, k) => (
              <tr key={(p.produto_id ?? p.nome) + ''} className={!todos && k >= 30 ? 'linha-extra' : ''}>
                <td className="rank">{k + 1}</td>
                <td>{p.nome}<small className="nome-sub">{p.categoria}{p.sem_custo && <span className="etiqueta etiqueta-pendente">sem custo</span>}</small></td>
                <td className="num">{quantidade(p.quantidade)}</td>
                <td className="num">{din(p.faturamento)}</td>
                <td className="num esconde-cel">{din(p.custo)}</td>
                <td className={`num ${p.lucro < 0 ? 'negativo' : ''}`}>{din(p.lucro)}</td>
                <td className="num">{porcentagem(p.margem)}</td>
              </tr>
            ))}
            {!vistos.length && <tr><td colSpan="7" className="centro">Nenhum produto encontrado.</td></tr>}
          </tbody>
          {lista.length > 0 && (
            <tfoot><tr><td className="rank"></td><td>Total ({lista.length} produtos)</td><td></td><td className="num">{din(tot.fat)}</td><td className="num esconde-cel">{din(tot.custo)}</td><td className="num">{din(tot.fat - tot.custo)}</td><td className="num">{tot.fat ? porcentagem(((tot.fat - tot.custo) / tot.fat * 100).toFixed(1)) : '—'}</td></tr></tfoot>
          )}
        </table>
      </div>
      {lista.length > 30 && <div className="painel-corpo centro nao-imprimir"><button className="btn btn-texto" onClick={() => setTodos(!todos)}>{todos ? 'Mostrar só os 30 primeiros' : `Ver todos os ${lista.length} produtos`}</button></div>}
      <p className="dica rel-nota">Lucro por produto = preço vendido − custo. Taxas da maquininha e entregadores são descontados só no lucro total.</p>
    </section>
  )
}

function AbaCategorias({ dados }) {
  const max = Math.max(...dados.categorias.map((c) => c.faturamento))
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Por categoria</h2></div>
      <div className="tabela-rolar-x">
        <table className="tabela tabela-compacta">
          <thead><tr><th>Categoria</th><th className="num">Faturamento</th><th className="col-barra" aria-hidden></th><th className="num">Custo (CMV)</th><th className="num">CMV %</th><th className="num">Lucro</th></tr></thead>
          <tbody>{dados.categorias.map((c) => (
            <tr key={c.categoria}>
              <td>{c.categoria}</td><td className="num">{din(c.faturamento)}</td><td className="col-barra"><BarraCelula valor={c.faturamento} max={max} /></td>
              <td className="num">{din(c.custo)}</td><td className="num">{porcentagem(c.cmv_pct)}</td><td className="num">{din(c.lucro)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="dica rel-nota">CMV % = quanto do preço de venda é custo da mercadoria. Quanto menor, mais a categoria rende.</p>
    </section>
  )
}

function AbaPagamentos({ dados }) {
  const maxF = Math.max(...dados.formas.map((f) => f.valor))
  const maxO = Math.max(...dados.origens.map((o) => o.faturamento))
  const totF = dados.formas.reduce((s, f) => s + f.valor, 0)
  return (
    <div className="rel-pilha">
      <section className="painel">
        <div className="painel-cab"><h2>Formas de pagamento</h2></div>
        <div className="tabela-rolar-x">
          <table className="tabela tabela-compacta">
            <thead><tr><th>Forma</th><th className="num">Valor</th><th className="col-barra" aria-hidden></th><th className="num">%</th><th className="num">Taxa maquininha</th></tr></thead>
            <tbody>{dados.formas.map((f) => (
              <tr key={f.forma}><td>{f.forma}<small className="nome-sub">{f.qtd} pagamentos</small></td><td className="num">{din(f.valor)}</td>
                <td className="col-barra"><BarraCelula valor={f.valor} max={maxF} /></td><td className="num">{porcentagem((f.valor / totF * 100).toFixed(1))}</td><td className="num">{f.taxa ? din(f.taxa) : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section className="painel">
        <div className="painel-cab"><h2>Onde vendeu</h2></div>
        <div className="tabela-rolar-x">
          <table className="tabela tabela-compacta">
            <thead><tr><th>Origem</th><th className="num">Vendas</th><th className="num">Faturamento</th><th className="col-barra" aria-hidden></th></tr></thead>
            <tbody>{dados.origens.map((o) => (
              <tr key={o.origem}><td>{ORIGENS[o.origem] || o.origem}</td><td className="num">{o.vendas}</td><td className="num">{din(o.faturamento)}</td><td className="col-barra"><BarraCelula valor={o.faturamento} max={maxO} /></td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function AbaEquipe({ dados }) {
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Vendas por funcionário</h2></div>
      <div className="tabela-rolar-x">
        <table className="tabela tabela-compacta">
          <thead><tr><th>Quem vendeu</th><th className="num">Vendas</th><th className="num">Faturamento</th><th className="num">Ticket médio</th></tr></thead>
          <tbody>{dados.equipe.map((e) => <tr key={e.usuario}><td>{e.usuario}</td><td className="num">{e.vendas}</td><td className="num">{din(e.faturamento)}</td><td className="num">{din(e.ticket_medio)}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="dica rel-nota">Comandas contam para quem fechou a comanda; pedidos online, para quem finalizou o pedido.</p>
    </section>
  )
}

function GraficoHoras({ dados }) {
  const comVenda = dados.horas.filter((h) => h.vendas > 0)
  if (!comVenda.length) return <p className="dica">Sem vendas no período.</p>
  const ini = Math.max(0, Math.min(...comVenda.map((h) => h.hora)) - 1)
  const fim = Math.min(23, Math.max(...comVenda.map((h) => h.hora)) + 1)
  const pts = dados.horas.slice(ini, fim + 1).map((h) => ({
    rotulo: `${h.hora}h`, titulo: `Das ${h.hora}h às ${h.hora}h59`, valor: h.faturamento, extra: [['Vendas', String(h.vendas)]],
  }))
  const pico = comVenda.reduce((m, h) => (h.faturamento > m.faturamento ? h : m))
  return (
    <>
      <GraficoBarras dados={pts} cor={COR_1} nome="Faturamento" formato={fmtDinheiro} descricao={`Faturamento por hora do dia. Pico às ${pico.hora}h.`} />
      <p className="dica">Horário mais forte: <b>{pico.hora}h às {pico.hora}h59</b>, com {din(pico.faturamento)} em {pico.vendas} {pico.vendas === 1 ? 'venda' : 'vendas'}.</p>
    </>
  )
}

function AbaHorarios({ dados }) {
  return (
    <section className="painel">
      <div className="painel-cab"><h2>Movimento por horário</h2><span className="dica">soma de todos os dias do período</span></div>
      <div className="painel-corpo"><GraficoHoras dados={dados} /></div>
    </section>
  )
}

function AbaFiado({ dados }) {
  const { fiado, entregas, cascos } = dados
  return (
    <div className="rel-duas">
      <section className="painel">
        <div className="painel-cab"><h2>Fiado</h2></div>
        <div className="painel-corpo">
          <div className="rel-mini">
            <div><span>Vendido no fiado</span><strong>{din(fiado.vendido)}</strong><small>no período</small></div>
            <div><span>Recebido de fiado</span><strong>{din(fiado.recebido)}</strong><small>no período</small></div>
            <div><span>Total a receber</span><strong>{din(fiado.a_receber_hoje)}</strong><small>hoje, todos os clientes</small></div>
          </div>
          {fiado.devedores.length > 0 && (
            <table className="tabela tabela-compacta">
              <thead><tr><th>Quem mais deve</th><th className="num">Saldo</th></tr></thead>
              <tbody>{fiado.devedores.map((c) => <tr key={c.id}><td>{c.nome}</td><td className="num">{din(c.saldo)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
      <section className="painel">
        <div className="painel-cab"><h2>Entregas</h2></div>
        {entregas.length ? (
          <div className="tabela-rolar-x">
            <table className="tabela tabela-compacta">
              <thead><tr><th>Entregador</th><th className="num">Entregas</th><th className="num">Taxas cobradas</th><th className="num">Pago a ele</th></tr></thead>
              <tbody>{entregas.map((e) => <tr key={e.entregador}><td>{e.entregador}</td><td className="num">{e.entregas}</td><td className="num">{din(e.taxas)}</td><td className="num">{din(e.repasse)}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div className="painel-corpo"><p className="dica">Nenhuma entrega concluída no período.</p></div>}
        <div className="painel-corpo">
          <h3 className="rel-h3">Cascos e estoque</h3>
          <ul className="dre-notas">
            <li>Cascos cobrados (cliente não trouxe o vazio): <b>{din(cascos.cobrados)}</b></li>
            <li>Vazios trazidos pelos clientes: <b>{cascos.devolvidos_por_clientes}</b></li>
            {cascos.vazios_na_loja.map((c) => <li key={c.nome}>Vazios na loja agora — {c.nome}: <b>{c.qtd}</b></li>)}
            <li>Mercadoria que entrou no estoque (pelo custo): <b>{din(dados.compras)}</b></li>
            {dados.perdas > 0 && <li>Saídas de estoque sem venda (perdas, consumo): <b>{din(dados.perdas)}</b></li>}
          </ul>
        </div>
      </section>
    </div>
  )
}

// ---------- Excel
async function exportarExcel(d) {
  const { exportarRelatorio } = await import('../lib/planilha')
  const r = d.resumo, a = d.anterior
  const linhasResumo = [
    ['Período', textoPeriodo(d.periodo.de, d.periodo.ate), textoPeriodo(d.periodo.anterior_de, d.periodo.anterior_ate)],
    ['Vendas concluídas', r.vendas, a.vendas],
    ['Faturamento', r.faturamento, a.faturamento],
    ['(−) Cascos cobrados', r.cascos, a.cascos],
    ['(−) Custo das mercadorias (CMV)', r.cmv, a.cmv],
    ['(−) Taxas da maquininha', r.taxas_maquininha, a.taxas_maquininha],
    ['(−) Pago aos entregadores', r.entregadores, a.entregadores],
    ['(=) Lucro líquido', r.lucro, a.lucro],
    ['Margem de lucro (%)', r.margem, a.margem],
    ['CMV (% das vendas de produtos)', r.cmv_pct, a.cmv_pct],
    ['Ticket médio', r.ticket_medio, a.ticket_medio],
    ['Descontos dados', r.descontos, a.descontos],
    ['Acréscimos de cartão', r.acrescimos, a.acrescimos],
    ['Taxas de entrega cobradas', r.taxas_entrega, a.taxas_entrega],
    ['Vendas canceladas (qtd)', r.canceladas, a.canceladas],
    ['Vendas canceladas (valor)', r.canceladas_valor, a.canceladas_valor],
    ['Vendido no fiado', d.fiado.vendido, null],
    ['Recebido de fiado', d.fiado.recebido, null],
    ['Total a receber de fiado (hoje)', d.fiado.a_receber_hoje, null],
  ].map(([i, v, ant]) => ({ i, v, ant }))
  const ag = d.periodo.agrupar
  await exportarRelatorio([
    { nome: 'Resumo', linhas: linhasResumo, colunas: [
      { titulo: 'Indicador', chave: 'i', largura: 36 },
      { titulo: 'Período', chave: 'v', tipo: 'dinheiro', largura: 26 },
      { titulo: 'Período anterior', chave: 'ant', tipo: 'dinheiro', largura: 26 },
    ] },
    { nome: `Por ${ag === 'mes' ? 'mês' : ag}`, linhas: d.serie.map((s) => ({ ...s, t: rotulosPeriodo(s.periodo, ag).titulo })), colunas: [
      { titulo: ag === 'mes' ? 'Mês' : ag === 'semana' ? 'Semana' : 'Dia', chave: 't', largura: 30 }, { titulo: 'Vendas', chave: 'vendas', tipo: 'numero', largura: 10 },
      { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 16 }, { titulo: 'Lucro líquido', chave: 'lucro', tipo: 'dinheiro', largura: 16 },
    ] },
    { nome: 'Produtos', linhas: d.produtos, colunas: [
      { titulo: 'Produto', chave: 'nome', largura: 40 }, { titulo: 'Categoria', chave: 'categoria', largura: 22 },
      { titulo: 'Quantidade', chave: 'quantidade', tipo: 'numero', largura: 12 }, { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 15 },
      { titulo: 'Custo', chave: 'custo', tipo: 'dinheiro', largura: 14 }, { titulo: 'Lucro', chave: 'lucro', tipo: 'dinheiro', largura: 14 },
      { titulo: 'Margem %', chave: 'margem', tipo: 'pct', largura: 11 }, { titulo: 'Observação', chave: (p) => (p.sem_custo ? 'sem preço de custo' : ''), largura: 20 },
    ] },
    { nome: 'Categorias', linhas: d.categorias, colunas: [
      { titulo: 'Categoria', chave: 'categoria', largura: 26 }, { titulo: 'Quantidade', chave: 'quantidade', tipo: 'numero', largura: 12 },
      { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 15 }, { titulo: 'Custo (CMV)', chave: 'custo', tipo: 'dinheiro', largura: 15 },
      { titulo: 'CMV %', chave: 'cmv_pct', tipo: 'pct', largura: 10 }, { titulo: 'Lucro', chave: 'lucro', tipo: 'dinheiro', largura: 14 },
    ] },
    { nome: 'Pagamentos', linhas: d.formas, colunas: [
      { titulo: 'Forma', chave: 'forma', largura: 22 }, { titulo: 'Pagamentos', chave: 'qtd', tipo: 'numero', largura: 12 },
      { titulo: 'Valor', chave: 'valor', tipo: 'dinheiro', largura: 15 }, { titulo: 'Taxa maquininha', chave: 'taxa', tipo: 'dinheiro', largura: 16 },
    ] },
    { nome: 'Onde vendeu', linhas: d.origens, colunas: [
      { titulo: 'Origem', chave: (o) => ORIGENS[o.origem] || o.origem, largura: 22 }, { titulo: 'Vendas', chave: 'vendas', tipo: 'numero', largura: 10 },
      { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 15 },
    ] },
    { nome: 'Equipe', linhas: d.equipe, colunas: [
      { titulo: 'Funcionário', chave: 'usuario', largura: 24 }, { titulo: 'Vendas', chave: 'vendas', tipo: 'numero', largura: 10 },
      { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 15 }, { titulo: 'Ticket médio', chave: 'ticket_medio', tipo: 'dinheiro', largura: 14 },
    ] },
    { nome: 'Horários', linhas: d.horas, colunas: [
      { titulo: 'Hora', chave: (h) => `${String(h.hora).padStart(2, '0')}h`, largura: 8 }, { titulo: 'Vendas', chave: 'vendas', tipo: 'numero', largura: 10 },
      { titulo: 'Faturamento', chave: 'faturamento', tipo: 'dinheiro', largura: 15 },
    ] },
    { nome: 'Fiado (quem deve)', linhas: d.fiado.devedores, colunas: [
      { titulo: 'Cliente', chave: 'nome', largura: 30 }, { titulo: 'Saldo devedor hoje', chave: 'saldo', tipo: 'dinheiro', largura: 18 },
    ] },
    { nome: 'Entregas', linhas: d.entregas, colunas: [
      { titulo: 'Entregador', chave: 'entregador', largura: 24 }, { titulo: 'Entregas', chave: 'entregas', tipo: 'numero', largura: 10 },
      { titulo: 'Taxas cobradas', chave: 'taxas', tipo: 'dinheiro', largura: 15 }, { titulo: 'Pago ao entregador', chave: 'repasse', tipo: 'dinheiro', largura: 18 },
    ] },
  ], `relatorio-parada-${d.periodo.de}${d.periodo.de !== d.periodo.ate ? '_a_' + d.periodo.ate : ''}.xlsx`)
}
