# Parada Obrigatória — Sistema de gestão

Sistema de estoque, vendas, comandas, pedidos online, entregas, fiado e relatórios financeiros
para o **Parada Obrigatória — Bar e Distribuidora de Bebidas**.

- **Front:** React + Vite, instalável como app (PWA) no PC e no celular
- **API:** PHP 8.1+ sem framework (roda em hospedagem compartilhada)
- **Banco:** MySQL (KingHost)

## Andamento

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Banco de dados completo, login, usuários e permissões | ✅ Pronta |
| 2 | Produtos, estoque e importação por Excel | ✅ Pronta |
| 3 | PDV (2 caixas), comandas, caixa, engradados e cascos | ✅ Pronta |
| 4 | Clientes, fiado e formas de pagamento | ✅ Pronta |
| 5 | Pedidos online e entregas | ✅ Pronta |
| 6 | Relatórios financeiros | ✅ Pronta |
| 7 | Publicação final, painel inicial, backup e instalação nos aparelhos | ✅ Pronta |
| + | Venda de doses de destilados (`atualizar-doses.sql`) | ✅ Pronta |
| + | Mensalidade do sistema (Pix todo dia 8) | ✅ Pronta |

O banco (`database/schema.sql`) já tem as tabelas de **todas** as etapas.

## Estrutura

```
database/   schema.sql (tabelas) e seed.sql (dados iniciais)
api/        API em PHP — index.php, routes/, src/, .htaccess
web/        Front em React (src/) e arquivos públicos (logo, ícones, manifest, sw.js)
montar-pacote.sh   gera a pasta pacote/ pronta para subir na KingHost
```

## Perfis de acesso

- **Administrador:** tudo, incluindo custos, lucro, relatórios, usuários e configurações.
- **Funcionário:** vendas, comandas, pedidos online e entregas. Não vê custos, lucro nem relatórios.
  As permissões são checadas na API, não só escondidas na tela.

Segurança já incluída: senhas com bcrypt, troca obrigatória da senha provisória no 1º acesso,
bloqueio de 15 min após 5 senhas erradas, sessões derrubadas ao trocar senha, mudar perfil ou desativar usuário,
`config.php` e código interno bloqueados para acesso pela web.

---

## Publicar na KingHost

### 1. Criar o banco
1. Painel KingHost → **Bancos de Dados → MySQL → Criar banco**. Anote host, nome, usuário e senha.
2. Abra o **phpMyAdmin** desse banco → aba **Importar**:
   - primeiro `database/schema.sql`
   - depois `database/seed.sql`
   - depois cada `database/atualizar-etapa*.sql`, em ordem

### 2. Versão do PHP
No painel do domínio/subdomínio, selecione **PHP 8.1 ou superior**.

### 3. Subir os arquivos
1. Rode `./montar-pacote.sh` (ou use o `parada-obrigatoria-deploy.zip` já gerado).
2. Envie **o conteúdo** da pasta `pacote/` para a pasta do site/subdomínio
   (ex.: `public_html/` ou a pasta do subdomínio `sistema.seudominio.com.br`).
   Confira se os arquivos ocultos `.htaccess` foram junto (na raiz e em `api/`).

> Recomendado: usar um **subdomínio só para o sistema**, separado de outros sites,
> para que instalar WordPress ou outro site nunca apague estes arquivos.

### 4. Criar o `config.php` (só na primeira vez)
Na pasta `api/` do servidor, copie `config.example.php` para `config.php` e preencha:
- dados do banco (passo 1)
- `jwt_secret`: uma chave aleatória longa (64 caracteres). Gere em https://www.random.org/strings ou com
  `php -r "echo bin2hex(random_bytes(32));"`
- deixe `debug` como `false`

Nas próximas atualizações, suba o pacote novo **sem apagar** o `config.php`.

### 5. Ativar HTTPS
Ative o SSL grátis (Let's Encrypt) no painel. Sem HTTPS o app não instala no celular.

### 6. Primeiro acesso
- Usuário: `admin`
- Senha: `parada@2026`

O sistema pede para criar uma senha nova. Depois, em **Usuários**, cadastre os funcionários.

Teste rápido: `https://seudominio/api/health` deve responder `{"ok":true,...}`.

### 7. Instalar como programa
- **PC (Chrome ou Edge):** abra o sistema → ícone de instalar na barra de endereço → "Instalar".
  Fica com ícone na área de trabalho e abre em janela própria.
- **Android (Chrome):** menu ⋮ → "Adicionar à tela inicial" / "Instalar app".
- **iPhone (Safari):** botão compartilhar → "Adicionar à Tela de Início".

### Backup
- Pelo sistema: **Dados da loja → Backup e sistema → Baixar backup agora** (arquivo `.sql` completo).
  A tela inicial do administrador avisa quando passa de 7 dias sem backup.
- Para restaurar: phpMyAdmin → selecione o banco → Importar → o arquivo do backup (apaga os dados atuais).
- Também dá para exportar pelo painel da KingHost (Bancos de Dados).

### Antes de começar a usar de verdade (uma vez)
1. Baixe um backup.
2. Importe `database/zerar-movimento.sql` no phpMyAdmin: apaga vendas, comandas, pedidos, caixas, fiado e
   históricos de teste; mantém produtos, preços, clientes (fiado zerado), usuários e configurações.
3. Faça a contagem do estoque (ou importe a planilha com "Substituir").
4. Confira em **Dados da loja**: nome, WhatsApp, horário, bairros e taxas de entrega.
5. Confira em **Formas de pagamento**: taxas da maquininha e acréscimo do crédito.
6. Crie os logins dos funcionários em **Usuários** e instale o app em cada aparelho, escolhendo Caixa 1 ou Caixa 2.

### Checklist de publicação
- [ ] PHP 8.1+ selecionado no painel
- [ ] SSL ativo e o site abrindo em `https://`
- [ ] `api/config.php` com `debug => false` e `jwt_secret` aleatório
- [ ] `https://seudominio/api/health` responde `{"ok":true,...}`
- [ ] `https://seudominio/api/config.php` responde **403** (bloqueado)
- [ ] Versão do banco = 6 (Dados da loja → Backup e sistema)
- [ ] Primeiro backup baixado

---

## Rodar no computador (desenvolvimento)

Requisitos: PHP 8.1+, MySQL/MariaDB, Node 18+.

```bash
# banco
mysql -e "CREATE DATABASE parada CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mysql parada < database/schema.sql
mysql parada < database/seed.sql

# API (porta 8000) — antes copie api/config.example.php para api/config.php
cd api && php -S 127.0.0.1:8000 index.php

# Front (porta 5173), em outro terminal
cd web && npm install && npm run dev
```

No `config.php` de desenvolvimento use `'cors_origins' => ['http://localhost:5173']` e `'debug' => true`.

## Atualizar o sistema (a cada etapa nova)

1. Gere o pacote (`./montar-pacote.sh`) ou use o `parada-obrigatoria-deploy.zip` da etapa.
2. Envie **todo o conteúdo** para a `www` por cima dos arquivos atuais (FileZilla: "Sobrescrever").
3. **Não apague** o `api/config.php` — ele não vem no pacote.
4. Se a etapa trouxer arquivo `database/atualizar-*.sql`, importe no phpMyAdmin **uma vez**. (Etapa 3: `atualizar-etapa3.sql`; etapa 4: `atualizar-etapa4.sql`; etapa 5: `atualizar-etapa5.sql`. As etapas 6 e 7 não mudam o banco. Doses: `atualizar-doses.sql`.)
5. Nos aparelhos aparece a faixa **"Versão nova do sistema disponível" → Atualizar** (a partir da etapa 7).

## Rotas da API (etapa 1)

| Método | Rota | Acesso |
|---|---|---|
| POST | `/api/auth/login` | público |
| GET | `/api/auth/me` | logado |
| POST | `/api/auth/trocar-senha` | logado |
| GET / POST | `/api/usuarios` | admin |
| PUT | `/api/usuarios/{id}` | admin |
| POST | `/api/usuarios/{id}/redefinir-senha` | admin |
| GET | `/api/config/publica` | público |
| PUT | `/api/config` | admin |
| GET | `/api/health` | público |

## Rotas da API (etapa 2 — produtos)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/produtos?busca=&categoria=&status=ativos\|baixo\|zerado\|inativos&ordem=&limite=&offset=` | logado (custo só p/ admin) |
| GET | `/api/produtos/codigo?c=789...` | logado — busca do leitor de código |
| GET | `/api/produtos/resumo` | logado |
| GET | `/api/produtos/{id}` | logado |
| POST | `/api/produtos` · PUT `/api/produtos/{id}` | admin |
| POST | `/api/produtos/{id}/ativo` | admin |
| POST | `/api/produtos/{id}/estoque` (entrada) | logado |
| POST | `/api/produtos/{id}/estoque` (saída / contagem) | admin |
| GET | `/api/produtos/{id}/movimentacoes` | logado |
| POST | `/api/produtos/importar/previa` · `/api/produtos/importar` | admin |
| GET | `/api/produtos/exportar` | admin |
| GET | `/api/categorias` | logado |
| POST/PUT/DELETE | `/api/categorias[/{id}]` | admin |
| PUT | `/api/auth/minha-conta` (nome e usuário) | logado |

## Rotas da API (etapa 3 — vendas)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/formas-pagamento` | logado |
| GET | `/api/caixas` · POST `/api/caixas/{id}/abrir` | logado |
| GET | `/api/caixa-sessoes/{id}` | logado |
| GET | `/api/caixa-sessoes` (histórico) | admin |
| POST | `/api/caixa-sessoes/{id}/movimentos` (sangria/suprimento) · `/fechar` | logado |
| POST | `/api/vendas` · GET `/api/vendas?sessao=` · GET `/api/vendas/{id}` | logado |
| POST | `/api/vendas/{id}/cancelar` | logado com caixa aberto; depois de fechado, só admin |
| GET/POST | `/api/comandas` · GET/PUT `/api/comandas/{id}` | logado |
| POST | `/api/comandas/{id}/itens` · `/itens/{item}/cancelar` · `/fechar` | logado |
| POST | `/api/comandas/{id}/cancelar` | logado (com consumo: só admin) |
| POST/GET | `/api/produtos/{id}/cascos` | logado |

### Regras de venda
- Preço e custo sempre vêm do banco no momento da venda (ficam gravados no item).
- Comanda baixa o estoque quando o item é lançado; fechar a comanda gera a venda.
- Engradado baixa `quantidade × unidades` do estoque da unidade; custo = custo da unidade × unidades.
- Casco: se o cliente não trouxe, vira item "Casco — ..." cobrado à parte (depósito, fora do lucro);
  se trouxe, soma em "cascos vazios na loja".
- Acréscimo/desconto da forma de pagamento é calculado sobre a parte paga naquela forma.
- Lucro = total − cascos − custo dos produtos − taxa da maquininha.
- Venda com estoque insuficiente é permitida (o estoque fica negativo) para não travar o balcão;
  a tela avisa.

## Rotas da API (etapa 4 — clientes e fiado)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/clientes?busca=&filtro=ativos\|devendo\|inativos` | logado |
| POST | `/api/clientes` · PUT `/api/clientes/{id}` | logado (limite e ativo: só admin) |
| GET | `/api/clientes/{id}` (com histórico do fiado) | logado |
| POST | `/api/clientes/{id}/pagamentos` (entra no caixa aberto) | logado |
| POST | `/api/clientes/{id}/ajuste` | admin |
| GET | `/api/formas-pagamento/config` · POST `/api/formas-pagamento` · PUT `/api/formas-pagamento/{id}` | admin |

### Regras do fiado
- Venda com forma "Fiado" exige cliente; respeita o limite (vazio = sem limite, 0 = não pode).
- Pode dividir: parte fiado, parte Pix/dinheiro.
- Pagamento do fiado entra no caixa aberto (dinheiro conta na gaveta) e pode ser parcial, com troco.
- Cancelar uma venda fiado abate o valor da conta do cliente.
- Ajuste (admin): lançar dívida antiga do caderno, perdoar ou corrigir — não mexe no caixa.

## Rotas da API (etapa 5 — pedidos online e entregas)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/publico/cardapio` | público |
| POST | `/api/publico/pedidos` (limite de 5 por IP a cada 10 min) | público |
| GET | `/api/publico/pedido?codigo=ABC123` | público |
| GET | `/api/pedidos?grupo=ativos\|finalizados\|cancelados` · `/api/pedidos/resumo` | logado |
| POST | `/api/pedidos` (pedido por telefone) | logado |
| POST | `/api/pedidos/{id}/aceitar` · `/despachar` · `/finalizar` · `/cancelar` | logado |
| POST | `/api/config/loja-online` (abrir/fechar a loja online) | logado |
| GET | `/api/bairros` · POST/PUT/DELETE | logado / admin |
| GET | `/api/entregadores` · POST/PUT | logado / admin |
| GET | `/api/entregas?de=&ate=&entregador=&pago=` | logado |
| POST | `/api/entregadores/{id}/acertar` | logado |

### Regras dos pedidos
- Página pública: `/pedir` (link para Instagram/WhatsApp) e acompanhamento em `/pedido/CODIGO`.
- Online não vende sem estoque e respeita o pedido mínimo; fiado não aparece no site.
- O estoque baixa quando a loja **aceita**; vira venda (com taxa de entrega) quando é **entregue**.
- O cliente é cadastrado automaticamente pelo telefone (sem fiado liberado).
- Entregador recebe valor fixo por entrega ou a taxa inteira; o acerto pode sair do caixa como sangria.

## Rotas da API (etapa 6 — relatórios)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/relatorios?de=AAAA-MM-DD&ate=AAAA-MM-DD&agrupar=dia\|semana\|mes` | admin |

Devolve tudo de uma vez: resumo e comparação com o período anterior de mesmo tamanho, série no tempo,
produtos, categorias, formas de pagamento, origem (balcão/comanda/online), equipe, horários, fiado, entregas e cascos.
Período máximo: 2 anos. Sem `agrupar`, escolhe sozinho (até 31 dias: dia; até 120: semana; acima: mês).

### Como o lucro é calculado
- **Faturamento** = tudo que os clientes pagaram nas vendas concluídas (com acréscimos, taxa de entrega e cascos).
- **Lucro líquido** = faturamento − cascos cobrados − custo das mercadorias − taxas da maquininha − pago aos entregadores.
- Casco é depósito do vasilhame: entra no caixa, mas não é receita.
- O custo usado é o gravado no momento da venda (mudar o custo depois não altera relatórios antigos).
- Venda no fiado conta no dia da venda; a taxa da maquininha do pagamento do fiado conta no dia em que foi paga.
- Vendas canceladas não entram em nenhuma conta (aparecem só como contagem).
- Despesas fixas (aluguel, luz, salários) não fazem parte do sistema.
- Tela: imprimir/salvar em PDF (sai tudo, todas as abas) e exportar para Excel (uma aba por relatório).

## Rotas da API (etapa 7 — sistema)

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/painel` (resumo do dia para a tela inicial; valores só para admin) | logado |
| GET | `/api/sistema/info` (versões, contagens, último backup) | admin |
| GET | `/api/backup` (baixa o banco inteiro em .sql) | admin |

O `sw.js` recebe a versão no build (`vite.config.js`), então cada pacote novo é detectado pelos aparelhos.
O manual de uso para a loja está no documento "Manual do sistema Parada Obrigatória".

### Doses de destilados
- A garrafa guarda `volume_ml`; a dose aponta para a garrafa (`produto_base_id`) e guarda `dose_ml`.
- `fator` da dose = `dose_ml / volume_ml` (6 casas). Vender 1 dose baixa essa fração da garrafa; custo = custo da garrafa × fator.
- Estoque com 4 casas decimais (garrafa aberta). Mudar o volume da garrafa recalcula todas as doses dela.
- Dose não aceita entrada (é na garrafa); aceita saída (cortesia, derramou). Por padrão não aparece online.
- Planilha: colunas "Volume da garrafa (ml)" e "Dose (ml)"; a coluna "Engradado ou dose de" recebe o código de barras OU o nome da garrafa/unidade.

## Mensalidade do sistema (cobrança do desenvolvedor)

- R$ 100,00 por mês, vencimento dia 8, desde novembro/2026, Pix para o CNPJ 68.914.237/0001-11 (Nasctech).
  Os padrões ficam em `api/src/Mensalidade.php`; para mudar sem mexer no código, use `'mensalidade' => [...]` no `config.php`.
- Do dia 1 até o pagamento, a tela inicial do **administrador** mostra o aviso com QR Code e Pix copia e cola
  (o código segue o padrão BR Code do Banco Central, com o identificador `PARADAAAAAMM`). Funcionário não vê.
- "Já paguei" → o mês fica pago e o aviso some (sem confirmação). Depois do vencimento o aviso fica vermelho.
  O sistema nunca trava.
- Histórico: Dados da loja → Mensalidade do sistema. A tabela `mensalidades` é criada sozinha (não precisa de SQL).
- Nada precisa ser configurado. Opcionais no `config.php` (ver `config.example.php`):
  - `desenvolvedor_chave` → página `/api/mensalidade/dev?chave=...` com o histórico e o botão para desfazer um "já paguei";
  - `email` (SMTP) → e-mail para o desenvolvedor no "já paguei" e no atraso.
