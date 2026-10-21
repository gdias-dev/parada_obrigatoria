// Leitura e geração de planilhas Excel (.xlsx) direto no navegador.
// As bibliotecas só são baixadas quando a pessoa usa importar/exportar.

const COLUNAS = [
  { chave: 'codigo', titulo: 'Código de barras', largura: 18, texto: true },
  { chave: 'nome', titulo: 'Nome do produto', largura: 40, texto: true },
  { chave: 'categoria', titulo: 'Categoria', largura: 22, texto: true },
  { chave: 'unidade', titulo: 'Unidade', largura: 10, texto: true },
  { chave: 'custo', titulo: 'Preço de custo', largura: 15, dinheiro: true },
  { chave: 'venda', titulo: 'Preço de venda', largura: 15, dinheiro: true },
  { chave: 'estoque', titulo: 'Estoque', largura: 10, numero: true },
  { chave: 'minimo', titulo: 'Estoque mínimo', largura: 15, numero: true },
  { chave: 'embalagem_de', titulo: 'Engradado ou dose de (código ou nome da unidade)', largura: 40, texto: true },
  { chave: 'qtd_embalagem', titulo: 'Qtd no engradado', largura: 16, numero: true },
  { chave: 'volume_ml', titulo: 'Volume da garrafa (ml)', largura: 20, numero: true },
  { chave: 'dose_ml', titulo: 'Dose (ml)', largura: 11, numero: true },
]

// Nomes de coluna aceitos (sem acento, minúsculo, sem espaço). Assim planilhas
// de outros sistemas também funcionam, sem precisar copiar para o modelo.
const APELIDOS = {
  codigo: ['codigodebarras', 'codigo', 'cod', 'codbarras', 'ean', 'gtin', 'barras', 'codigobarras'],
  nome: ['nomedoproduto', 'nome', 'produto', 'descricao', 'descricaodoproduto', 'item'],
  categoria: ['categoria', 'grupo', 'secao', 'departamento', 'tipo'],
  unidade: ['unidade', 'un', 'und', 'medida', 'unid'],
  custo: ['precodecusto', 'custo', 'precocusto', 'valordecusto', 'valorcusto', 'precodecompra', 'compra', 'custounitario'],
  venda: ['precodevenda', 'venda', 'precovenda', 'preco', 'valordevenda', 'valorvenda', 'valor', 'precounitario'],
  estoque: ['estoque', 'quantidade', 'qtd', 'qtde', 'saldo', 'estoqueatual', 'quant'],
  minimo: ['estoqueminimo', 'minimo', 'min', 'qtdminima', 'estoquemin'],
  embalagem_de: ['engradadooudosedecodigoounomedaunidade', 'engradadooudosedecodigodaunidade', 'engradadodecodigodaunidade', 'dosede', 'dosedecodigodagarrafa', 'embalagemdecodigodaunidade', 'engradadode', 'embalagemde', 'codigodaunidade', 'unidadebase'],
  volume_ml: ['volumedagarrafaml', 'volumedagarrafa', 'volumeml', 'volume', 'ml', 'conteudoml'],
  dose_ml: ['doseml', 'dose', 'tamanhodadose', 'tamanhodadoseml'],
  qtd_embalagem: ['qtdnoengradado', 'qtdnaembalagem', 'quantidadenoengradado', 'quantidadenaembalagem', 'fator', 'qtdembalagem', 'unidadesporengradado'],
}

const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

function mapearCabecalho(linha) {
  const mapa = {}
  linha.forEach((cel, i) => {
    const n = normalizar(cel)
    if (!n) return
    for (const [chave, nomes] of Object.entries(APELIDOS)) {
      if (mapa[chave] === undefined && nomes.includes(n)) { mapa[chave] = i; break }
    }
  })
  return mapa
}

/** Lê o .xlsx e devolve { linhas, colunas, ignoradas } no formato esperado pela API. */
export async function lerPlanilha(arquivo) {
  if (!/\.xlsx$/i.test(arquivo.name)) {
    throw new Error('Use um arquivo .xlsx (Excel). Se estiver em .xls ou .csv, abra no Excel e use "Salvar como" > Pasta de Trabalho do Excel (.xlsx).')
  }
  const { default: readXlsxFile } = await import('read-excel-file')
  let rows
  try {
    rows = await readXlsxFile(arquivo)
  } catch {
    throw new Error('Não foi possível ler a planilha. Confira se o arquivo abre normalmente no Excel.')
  }

  // Cabeçalho: primeira linha (entre as 10 primeiras) que tenha a coluna de nome ou de código
  let iCab = -1
  let mapa = {}
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = mapearCabecalho(rows[i])
    if (m.nome !== undefined || m.codigo !== undefined) { iCab = i; mapa = m; break }
  }
  if (iCab < 0) {
    throw new Error('Não achei o cabeçalho. A planilha precisa ter as colunas "Nome do produto" e "Preço de venda" (use o modelo).')
  }
  if (mapa.venda === undefined && mapa.estoque === undefined && mapa.custo === undefined) {
    throw new Error('A planilha não tem coluna de preço nem de estoque. Confira os títulos das colunas (use o modelo).')
  }

  const linhas = []
  for (let i = iCab + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.every((c) => c === null || String(c).trim() === '')) continue
    const l = { linha: i + 1 }
    for (const [chave, col] of Object.entries(mapa)) {
      const v = r[col]
      l[chave] = v instanceof Date ? null : v
    }
    linhas.push(l)
  }
  return {
    linhas,
    colunas: Object.keys(mapa).map((k) => COLUNAS.find((c) => c.chave === k)?.titulo),
  }
}

const estiloCabecalho = { fontWeight: 'bold', backgroundColor: '#2b1c13', color: '#ffffff', align: 'center' }

function celula(col, valor) {
  if (col.texto) return { type: String, value: valor == null ? '' : String(valor), format: '@' }
  if (valor === null || valor === undefined || valor === '') return null
  return { type: Number, value: Number(valor), format: col.dinheiro ? '#,##0.00' : '0.###' }
}

async function gravar(planilhas, nomeArquivo) {
  const { default: writeXlsxFile } = await import('write-excel-file')
  await writeXlsxFile(planilhas.map((p) => p.dados), {
    sheets: planilhas.map((p) => p.nome),
    columns: planilhas.map((p) => p.colunas),
    fileName: nomeArquivo,
    stickyRowsCount: 1,
  })
}

const EXEMPLOS = [
  { codigo: '7896045504916', nome: 'Cerveja Heineken Long Neck 330ml', categoria: 'Cervejas', unidade: 'UN', custo: 4.6, venda: 8, estoque: 48, minimo: 24 },
  { codigo: '7894900011517', nome: 'Coca-Cola Lata 350ml', categoria: 'Refrigerantes e Águas', unidade: 'UN', custo: 2.79, venda: 5, estoque: 120, minimo: 24 },
  { codigo: '', nome: 'Gelo em cubo 5kg', categoria: 'Gelo e Carvão', unidade: 'PCT', custo: 6, venda: 12, estoque: 30, minimo: 10 },
  { codigo: '17896045504913', nome: 'Pack Heineken Long Neck (6)', categoria: 'Cervejas', unidade: 'PCT', venda: 45, embalagem_de: '7896045504916', qtd_embalagem: 6 },
  { codigo: '7893218000428', nome: 'Vodka Smirnoff 998ml', categoria: 'Destilados', unidade: 'UN', custo: 32, venda: 55, estoque: 6, minimo: 2, volume_ml: 998 },
  { codigo: '', nome: 'Dose Smirnoff', categoria: 'Destilados', unidade: 'UN', venda: 8, embalagem_de: '7893218000428', dose_ml: 50 },
]

const INSTRUCOES = [
  ['Como preencher a planilha de produtos'],
  [''],
  ['• Uma linha por produto. Não mude os títulos da primeira linha da aba "Produtos".'],
  ['• Apague as linhas de exemplo antes de importar (ou deixe, se quiser cadastrá-las).'],
  ['• Obrigatórios para produto novo: Nome do produto e Preço de venda.'],
  ['• Código de barras: deixe a coluna como Texto para não perder zeros à esquerda. Pode ficar vazio.'],
  ['• Categoria: se não existir no sistema, é criada automaticamente.'],
  ['• Unidade: UN, KG, L, CX ou PCT. Vazio = UN.'],
  ['• Preços: pode usar vírgula (5,50). Não use "R$".'],
  ['• Estoque vazio em produto novo = o sistema não controla o estoque dele (bom para drinks, copões e combos).'],
  [''],
  ['Engradados, fardos e packs'],
  ['• Cadastre a unidade normalmente (ex.: Cerveja Original 600ml, com o estoque em unidades).'],
  ['• Numa linha própria, cadastre o engradado: nome, preço de venda, "Engradado ou dose de" = código de barras OU nome da unidade e "Qtd no engradado" = 24.'],
  ['• Engradado não tem estoque nem custo próprios: o sistema usa os da unidade (deixe essas colunas vazias).'],
  [''],
  ['Doses de destilados'],
  ['• Na linha da garrafa, preencha "Volume da garrafa (ml)" (ex.: 1000). O estoque continua em garrafas.'],
  ['• Numa linha própria, cadastre a dose: nome (ex.: Dose Smirnoff), preço de venda, "Engradado ou dose de" = código OU nome da garrafa e "Dose (ml)" = 50.'],
  ['• Cada dose vendida baixa a fração da garrafa (50 ml de 1000 ml = 0,05 garrafa). O custo da dose é calculado pela garrafa.'],
  [''],
  ['Produtos que já existem'],
  ['• O sistema procura pelo código de barras; se não tiver código, pelo nome exato.'],
  ['• Se achar, atualiza só as colunas preenchidas. Célula vazia não apaga nada.'],
  ['• Para reajustar preços: exporte os produtos, mude os preços e importe de novo.'],
  [''],
  ['Estoque (escolhido na hora de importar)'],
  ['• Substituir: o número da planilha vira o estoque (use depois de contar o estoque).'],
  ['• Somar: o número da planilha é somado ao estoque (use quando chegar mercadoria).'],
  ['• Não mexer: a coluna Estoque é ignorada.'],
]

function abaInstrucoes() {
  return {
    nome: 'Como preencher',
    colunas: [{ width: 100 }],
    dados: INSTRUCOES.map(([t], i) => [{ type: String, value: t, fontWeight: i === 0 || ['Produtos que já existem', 'Estoque (escolhido na hora de importar)', 'Engradados, fardos e packs'].includes(t) ? 'bold' : undefined }]),
  }
}

function abaProdutos(itens) {
  return {
    nome: 'Produtos',
    colunas: COLUNAS.map((c) => ({ width: c.largura })),
    dados: [
      COLUNAS.map((c) => ({ value: c.titulo, ...estiloCabecalho })),
      ...itens.map((p) => COLUNAS.map((c) => celula(c, p[c.chave]))),
    ],
  }
}

export function baixarModelo() {
  return gravar([abaProdutos(EXEMPLOS), abaInstrucoes()], 'modelo-produtos-parada-obrigatoria.xlsx')
}

export function exportarProdutos(itens) {
  const hoje = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')
  return gravar([abaProdutos(itens), abaInstrucoes()], `produtos-parada-obrigatoria-${hoje}.xlsx`)
}

/**
 * Exporta o relatório financeiro em várias abas.
 * abas: [{ nome, colunas: [{ titulo, largura, tipo: 'texto'|'dinheiro'|'numero'|'pct' , chave }], linhas: [obj] }]
 */
export async function exportarRelatorio(abas, nomeArquivo) {
  const fmt = { dinheiro: '#,##0.00', numero: '0.###', pct: '0.0' }
  await gravar(abas.map((a) => ({
    nome: a.nome.slice(0, 31),
    colunas: a.colunas.map((c) => ({ width: c.largura || 14 })),
    dados: [
      a.colunas.map((c) => ({ value: c.titulo, ...estiloCabecalho })),
      ...a.linhas.map((l) => a.colunas.map((c) => {
        const v = typeof c.chave === 'function' ? c.chave(l) : l[c.chave]
        if (c.tipo === 'texto' || !c.tipo) return { type: String, value: v == null ? '' : String(v) }
        if (v === null || v === undefined || v === '') return null
        if (typeof v === 'string') return { type: String, value: v }
        return { type: Number, value: Number(v), format: fmt[c.tipo] }
      })),
    ],
  })), nomeArquivo)
}
