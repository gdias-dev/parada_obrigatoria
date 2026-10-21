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
| 5 | Pedidos online e entregas | Próxima |
| 6 | Relatórios financeiros | — |
| 7 | Publicação final e instalação nos aparelhos | — |

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
Painel KingHost → Bancos de Dados → exportar (ou agendar backup). Recomendado: semanal.

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
4. Se a etapa trouxer arquivo `database/atualizar-*.sql`, importe no phpMyAdmin **uma vez**. (Etapa 3: `atualizar-etapa3.sql`; etapa 4: `atualizar-etapa4.sql`.)
5. No PC/celular, feche e abra o app de novo para carregar a versão nova.

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
