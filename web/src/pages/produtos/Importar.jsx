import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { post } from '../../lib/api'
import { dinheiro, quantidade } from '../../lib/format'
import { baixarModelo, lerPlanilha } from '../../lib/planilha'
import { Alerta, Botao, useToast } from '../../components/ui'

const MODOS = {
  substituir: { rotulo: 'Substituir', dica: 'O número da planilha vira o estoque. Use depois de contar o estoque.' },
  somar: { rotulo: 'Somar', dica: 'O número da planilha é somado ao estoque atual. Use quando chegar mercadoria.' },
  ignorar: { rotulo: 'Não mexer', dica: 'A coluna Estoque é ignorada. Use para atualizar só preços.' },
}

const ACOES = {
  novo: { rotulo: 'Novo', cls: 'novo' },
  atualizar: { rotulo: 'Atualizar', cls: 'atualizar' },
  igual: { rotulo: 'Sem mudança', cls: 'igual' },
  erro: { rotulo: 'Com erro', cls: 'erro' },
}

export default function Importar() {
  const toast = useToast()
  const navegar = useNavigate()
  const inputRef = useRef(null)
  const [arquivo, setArquivo] = useState(null)
  const [linhas, setLinhas] = useState(null)
  const [modo, setModo] = useState('substituir')
  const [previa, setPrevia] = useState(null)
  const [filtro, setFiltro] = useState('todos')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [resultado, setResultado] = useState(null)
  const [arrastando, setArrastando] = useState(false)

  async function analisar(lns, m) {
    setOcupado('analisando'); setErro('')
    try {
      const r = await post('/produtos/importar/previa', { linhas: lns, modo_estoque: m })
      setPrevia(r)
      setFiltro(r.resumo.erro ? 'erro' : 'todos')
    } catch (e) {
      setErro(e.message); setPrevia(null)
    } finally {
      setOcupado('')
    }
  }

  async function escolher(file) {
    if (!file) return
    setArquivo(file); setPrevia(null); setResultado(null); setErro(''); setOcupado('lendo')
    try {
      const { linhas: lns } = await lerPlanilha(file)
      if (!lns.length) throw new Error('A planilha não tem nenhum produto abaixo do cabeçalho.')
      setLinhas(lns)
      await analisar(lns, modo)
    } catch (e) {
      setErro(e.message); setLinhas(null); setOcupado('')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function trocarModo(m) {
    setModo(m)
    if (linhas) analisar(linhas, m)
  }

  async function importar() {
    setOcupado('importando'); setErro('')
    try {
      const r = await post('/produtos/importar', { linhas, modo_estoque: modo })
      setResultado(r.resumo)
      setPrevia(null); setLinhas(null); setArquivo(null)
      toast(`${r.resumo.novo + r.resumo.atualizar} produtos importados.`)
    } catch (e) {
      setErro(e.message)
    } finally {
      setOcupado('')
    }
  }

  async function modelo() {
    try { await baixarModelo() } catch (e) { toast(e.message, 'erro') }
  }

  const visiveis = useMemo(() => {
    if (!previa) return []
    return filtro === 'todos' ? previa.linhas : previa.linhas.filter((l) => l.acao === filtro)
  }, [previa, filtro])

  const aGravar = previa ? previa.resumo.novo + previa.resumo.atualizar : 0

  return (
    <div className="pagina pagina-larga">
      <Link to="/produtos" className="voltar"><ArrowLeft size={18} aria-hidden /> Produtos</Link>
      <div className="pagina-topo">
        <div>
          <h1>Importar produtos por planilha</h1>
          <p>Cadastre muitos produtos de uma vez ou atualize preços e estoque em massa.</p>
        </div>
      </div>

      {resultado && (
        <div className="painel painel-corpo resultado-import">
          <CheckCircle2 size={32} aria-hidden />
          <div>
            <h2>Importação concluída</h2>
            <p>
              {resultado.novo} produto{resultado.novo === 1 ? '' : 's'} novo{resultado.novo === 1 ? '' : 's'},{' '}
              {resultado.atualizar} atualizado{resultado.atualizar === 1 ? '' : 's'}
              {resultado.erro > 0 && `, ${resultado.erro} linha${resultado.erro === 1 ? '' : 's'} com erro ficaram de fora`}.
            </p>
          </div>
          <div className="acoes-topo">
            <Botao variante="borda" onClick={() => setResultado(null)}>Importar outra</Botao>
            <Botao onClick={() => navegar('/produtos')}>Ver produtos</Botao>
          </div>
        </div>
      )}

      {!resultado && (
        <ol className="passos-import">
          <li className="painel painel-corpo">
            <h3>Baixe o modelo</h3>
            <p>Já vem com as colunas certas, 3 exemplos e as instruções na segunda aba. Você também pode usar uma planilha que já tenha, desde que os títulos das colunas sejam parecidos.</p>
            <Botao variante="borda" onClick={modelo}><Download size={18} aria-hidden /> Baixar modelo (.xlsx)</Botao>
          </li>

          <li className="painel painel-corpo">
            <h3>Escolha o arquivo preenchido</h3>
            <label
              className={`soltar-arquivo ${arrastando ? 'ativo' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]) }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                onChange={(e) => escolher(e.target.files[0])} />
              <FileSpreadsheet size={32} aria-hidden />
              {arquivo
                ? <span><b>{arquivo.name}</b>{linhas && ` · ${linhas.length} linha${linhas.length === 1 ? '' : 's'}`}<small>Clique para trocar de arquivo</small></span>
                : <span><b>Clique para escolher</b> ou arraste o arquivo aqui<small>Somente .xlsx</small></span>}
            </label>
          </li>

          <li className="painel painel-corpo">
            <h3>O que fazer com a coluna Estoque</h3>
            <div className="segmento segmento-largo" role="group" aria-label="Modo do estoque">
              {Object.entries(MODOS).map(([k, m]) => (
                <button key={k} type="button" aria-pressed={modo === k} onClick={() => trocarModo(k)} disabled={!!ocupado}>{m.rotulo}</button>
              ))}
            </div>
            <p className="dica">{MODOS[modo].dica}</p>
          </li>
        </ol>
      )}

      <Alerta>{erro}</Alerta>
      {ocupado === 'lendo' && <p className="dica">Lendo a planilha…</p>}
      {ocupado === 'analisando' && <p className="dica">Conferindo os produtos…</p>}

      {previa && (
        <section className="painel previa-import">
          <div className="painel-cab">
            <h2>Confira antes de importar</h2>
            <div className="segmento" role="group" aria-label="Filtrar linhas">
              <button aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todas ({previa.linhas.length})</button>
              {Object.entries(ACOES).map(([k, a]) => previa.resumo[k] > 0 && (
                <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{a.rotulo} ({previa.resumo[k]})</button>
              ))}
            </div>
          </div>

          {previa.resumo.erro > 0 && (
            <div className="painel-corpo" style={{ paddingBottom: 0 }}>
              <Alerta tipo="aviso">
                {previa.resumo.erro} linha{previa.resumo.erro === 1 ? '' : 's'} com erro {previa.resumo.erro === 1 ? 'vai' : 'vão'} ficar de fora.
                Corrija na planilha e escolha o arquivo de novo, ou importe só as linhas certas.
              </Alerta>
            </div>
          )}

          <div className="tabela-rolagem">
            <table className="tabela tabela-previa">
              <thead>
                <tr>
                  <th>Linha</th><th>Situação</th><th>Produto</th><th className="num">Custo</th><th className="num">Venda</th><th className="num">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.slice(0, 500).map((l) => (
                  <tr key={l.linha} className={`acao-${l.acao}`}>
                    <td data-rotulo="Linha">{l.linha}</td>
                    <td><span className={`etiqueta acao ${ACOES[l.acao].cls}`}>{ACOES[l.acao].rotulo}</span></td>
                    <td className="col-produto">
                      <strong>{l.nome || '(sem nome)'}</strong>
                      <span className="nome-sub">{[l.categoria, l.codigo].filter(Boolean).join(' · ')}</span>
                      {l.erros.map((e) => <span key={e} className="msg-linha erro"><AlertTriangle size={14} aria-hidden /> {e}</span>)}
                      {l.avisos.map((e) => <span key={e} className="msg-linha aviso"><AlertTriangle size={14} aria-hidden /> {e}</span>)}
                      {l.acao === 'atualizar' && <span className="msg-linha info">Muda: {l.mudancas.join(', ')}</span>}
                    </td>
                    <td className="num" data-rotulo="Custo">{l.custo !== null ? dinheiro(l.custo) : '—'}</td>
                    <td className="num" data-rotulo="Venda">{l.venda !== null ? dinheiro(l.venda) : '—'}</td>
                    <td className="num" data-rotulo="Estoque">
                      {l.acao === 'erro' ? '—'
                        : l.controla === false ? <span className="nome-sub">não controla</span>
                        : l.estoque_antes !== null && Math.abs(l.estoque_depois - l.estoque_antes) > 0.0005
                          ? <>{quantidade(l.estoque_antes)} → <b>{quantidade(l.estoque_depois)}</b></>
                          : quantidade(l.estoque_depois)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visiveis.length > 500 && <p className="mais dica">Mostrando as primeiras 500 linhas desta lista. Todas serão importadas.</p>}
          </div>

          <div className="rodape-import">
            <p>
              {aGravar === 0
                ? 'Nada para gravar: nenhum produto novo ou alterado.'
                : <>Vai cadastrar <b>{previa.resumo.novo}</b> e atualizar <b>{previa.resumo.atualizar}</b> produto{previa.resumo.atualizar === 1 ? '' : 's'}.</>}
            </p>
            <Botao variante="borda" onClick={() => { setPrevia(null); setLinhas(null); setArquivo(null) }}>Cancelar</Botao>
            <Botao onClick={importar} disabled={aGravar === 0} carregando={ocupado === 'importando'}>
              <Upload size={18} aria-hidden /> Importar {aGravar} produto{aGravar === 1 ? '' : 's'}
            </Botao>
          </div>
        </section>
      )}
    </div>
  )
}
