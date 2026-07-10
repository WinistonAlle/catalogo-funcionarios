# Catálogo para Funcionários

Aplicação interna para catálogo de produtos, pedidos de funcionários, controle de saldo mensal e rotinas operacionais de RH/Admin. O projeto combina um frontend React/Vite com Supabase, endpoints serverless e automações Node para sincronizar funcionários via Google Sheets. A integração de pedidos com o ERP (CIGAM, via API) está planejada.

## Visão geral

O sistema foi construído para atender um fluxo interno de compras de funcionários:

- login por CPF;
- navegação no catálogo;
- carrinho e checkout;
- pagamento com saldo mensal ou retirada;
- consulta de pedidos do funcionário;
- área administrativa para produtos, pedidos, relatórios e operações;
- área de RH para gestão de funcionários, relatórios e restauração de saldo;
- sincronização da base de funcionários a partir de planilha Google Sheets.

## Stack

- Frontend: React 18, TypeScript, Vite
- UI: Tailwind CSS, styled-components, Radix UI, shadcn/ui, Framer Motion
- Dados e autenticação: Supabase
- Gráficos e exportação: Recharts, jsPDF
- Automação: Node.js, TSX, Express
- Integrações: Google Sheets API
- Deploy: Vercel para APIs/serverless e Nginx + systemd no cenário Ubuntu documentado

## Principais funcionalidades

### Funcionário

- login por CPF usando RPC no Supabase;
- catálogo com busca, categorias, destaque de produtos e favoritos;
- carrinho persistido em contexto React;
- checkout com regras de saldo mensal;
- fallback para pagamento na retirada quando o saldo não cobre o pedido;
- bloqueios/regras por horário e fim de semana no checkout;
- página de pedidos do próprio funcionário;
- página de avisos.

### Admin

- painel principal de operações;
- gestão de produtos;
- gestão de pedidos;
- relatórios;
- histórico de operações administrativas;
- disparo manual da sincronização de funcionários;
- restauração do saldo mensal dentro da janela permitida.

### RH

- painel dedicado;
- cadastro/gestão de funcionários;
- relatório de gastos;
- acesso a relatórios gerais;
- acesso ao histórico operacional;
- sincronização manual de funcionários;
- restauração de saldo mensal com mesmas regras de autorização.

### Automação e backoffice

- webhook interno com os endpoints administrativos (sync, reset de saldo, status/histórico);
- serviço recorrente para sincronizar funcionários da planilha;
- APIs para consulta de status e histórico operacional.

## Estrutura do projeto

```text
.
├── api/                   # Funções serverless / endpoints HTTP
├── automation/            # Webhook de operações e serviço de sync
├── deploy/ubuntu/         # Exemplo de deploy com Nginx + systemd
├── public/                # Assets públicos
├── scripts/               # Scripts auxiliares e sync da planilha
├── server/                # Helpers compartilhados das rotas admin
├── src/
│   ├── components/        # Componentes de UI e domínio
│   ├── contexts/          # Contextos React
│   ├── data/              # Dados auxiliares
│   ├── hooks/             # Hooks customizados
│   ├── lib/               # Integrações e utilitários
│   ├── pages/             # Páginas da aplicação
│   ├── services/          # Serviços de autenticação e pedidos
│   ├── types/             # Tipagens
│   └── main.tsx           # Bootstrap do app
├── startcatalogo.sh       # Atalho para iniciar no Unix
├── startcatalogo.bat      # Atalho para iniciar no Windows
└── package.json
```

## Rotas da aplicação

Rotas principais encontradas em [`src/App.tsx`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/App.tsx):

- `/`: escolha/entrada
- `/login`: login por CPF
- `/catalogo`: catálogo principal
- `/favoritos`: favoritos
- `/avisos`: avisos
- `/meus-pedidos`: pedidos do funcionário
- `/checkout`: finalização do pedido
- `/admin`: painel admin
- `/admin/produtos`: gestão de produtos
- `/admin/pedidos`: gestão de pedidos
- `/destaques`: destaques do catálogo
- `/rh`: painel RH
- `/rh/funcionarios`: gestão de funcionários
- `/rh/relatorio-gastos`: relatório de gastos do RH
- `/relatorios`: dashboard de relatórios
- `/operacoes`: histórico/status operacional

Observação: existe uma página de painel de separação em [`src/pages/SeparationBoard.tsx`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/pages/SeparationBoard.tsx), mas ela não está exposta nas rotas principais atuais.

## Autenticação e autorização

O fluxo atual funciona assim:

1. o usuário informa o CPF;
2. o frontend chama a RPC `get_employee_by_cpf`;
3. se o CPF existir, o app abre uma sessão anônima no Supabase;
4. o backend vincula o funcionário ao `auth.uid()` via RPC `link_employee_to_user`;
5. a sessão local é salva em `localStorage` como `employee_session`;
6. guards de rota liberam acesso conforme o campo `role`.

Papéis identificados no código:

- `employee`
- `admin`
- `rh`

## Requisitos

- Node.js 20+ ou 22+
- npm
- projeto Supabase configurado
- credenciais do Google Sheets para sincronização

## Instalação

```bash
npm install
```

## Execução local

Suba o frontend em desenvolvimento:

```bash
npm run dev
```

Build de produção:

```bash
npm run build
```

Preview local do build:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

## Scripts disponíveis

Comandos definidos em [`package.json`](/Users/winistonalle/Desktop/copia-para-funcionarios/package.json):

- `npm run dev`: ambiente local Vite
- `npm run build`: build de produção
- `npm run build:dev`: build em modo development
- `npm run preview`: preview local na porta `4174`
- `npm run lint`: ESLint
- `npm run sync:employees`: sincroniza funcionários da planilha
- `npm run automation:webhook`: sobe o webhook de operações administrativas
- `npm run automation:sheet-sync`: sobe o serviço recorrente de sincronização da planilha

## Variáveis de ambiente

Crie um `.env` local com as variáveis necessárias.

### Frontend

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Backend, APIs e scripts Node

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Webhook de operações

```env
OPERATIONS_WEBHOOK_PORT=3333
```

### Google Sheets

```env
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SHEETS_RANGE=Funcionarios!A1:Z
GOOGLE_SERVICE_ACCOUNT_JSON=...
```

Variáveis opcionais da sincronização:

```env
SHEET_SYNC_INTERVAL_MS=3600000
SHEET_SYNC_INITIAL_DELAY_MS=5000
SHEET_SYNC_SCRIPT_PATH=./scripts/syncEmployeesFromSheet.mjs
SYNC_CREDITO_MENSAL=0
SYNC_DELETE_MISSING_FROM_SHEET=0
```

## Banco de dados e dependências do Supabase

Além das tabelas usadas pelo frontend, o projeto depende de estruturas específicas no Supabase.

### Tabelas citadas no código

- `employees`
- `employee_monthly_spend`
- `orders`
- `order_items`
- `admin_operation_logs`

### RPCs citadas no código

- `get_employee_by_cpf(p_cpf text)`
- `link_employee_to_user(p_cpf text)`
- `current_pay_cycle_key()`

### Observações importantes

- o frontend usa `signInAnonymously()` do Supabase;
- os endpoints administrativos validam o usuário autenticado e o vínculo com `employees.user_id`;
- a restauração de saldo atua na tabela `employee_monthly_spend`;
- o histórico operacional depende da tabela `admin_operation_logs`;
- há scripts SQL em [`scripts/create-admin-operation-logs.sql`](/Users/winistonalle/Desktop/copia-para-funcionarios/scripts/create-admin-operation-logs.sql) e [`scripts/fix-admin-item-refund.sql`](/Users/winistonalle/Desktop/copia-para-funcionarios/scripts/fix-admin-item-refund.sql).

## Fluxo de pedidos

Resumo do fluxo implementado:

1. o funcionário faz login por CPF;
2. navega no catálogo e adiciona itens ao carrinho;
3. no checkout, o app calcula saldo disponível do mês atual;
4. se o saldo cobrir 100% do total, o pagamento por saldo é permitido;
5. caso contrário, o pedido segue para pagamento na retirada;
6. o frontend grava o pedido em `orders` e os itens em `order_items`;
7. páginas administrativas e relatórios consultam esse mesmo conjunto de dados.

A integração dos pedidos com o ERP CIGAM (via API) será adicionada futuramente.

## Sincronização de funcionários via Google Sheets

Script principal: [`scripts/syncEmployeesFromSheet.mjs`](/Users/winistonalle/Desktop/copia-para-funcionarios/scripts/syncEmployeesFromSheet.mjs)

O script:

- lê a planilha configurada;
- espera colunas como `full_name`, `cpf`, `credito_mensal` e `role`;
- normaliza CPF;
- cadastra/atualiza funcionários no Supabase;
- sincroniza `credito_mensal_cents` para todos no dia 27;
- fora do dia 27, sincroniza crédito apenas para funcionários novos;
- opcionalmente remove funcionários ausentes da planilha se `SYNC_DELETE_MISSING_FROM_SHEET=1`.

Credencial Google:

- recomendado: `GOOGLE_SERVICE_ACCOUNT_JSON`;
- fallback local: arquivo `google-service-account.json` na raiz.

## Webhook de operações

Arquivos principais:

- [`automation/operations-webhook.ts`](automation/operations-webhook.ts)
- [`automation/sheet-sync-service.ts`](automation/sheet-sync-service.ts)

O webhook expõe as rotas HTTP internas usadas pelas áreas de Admin/RH (sincronização de funcionários, restauração de saldo, status e histórico operacional).

## Endpoints internos e APIs

### APIs serverless

- `POST /api/sync-employees`
- `POST /api/reset-employee-balances`
- `GET /api/operations-status`
- `GET /api/operations-history`

### Endpoints do webhook/automação

Com base no código e no guia de deploy:

- `GET /automation/health`
- `POST /automation/sync-employees`
- `POST /automation/reset-employee-balances`
- `GET /automation/operations/status`
- `GET /automation/operations/history`

Os endpoints administrativos exigem Bearer token válido de um usuário autenticado cujo funcionário vinculado tenha `role` igual a `admin` ou `rh`.

## Regras operacionais relevantes

- o reset de saldo só pode acontecer entre os dias `27` e `2`, considerando `America/Sao_Paulo`;
- o sistema bloqueia nova restauração do mesmo ciclo quando já houve execução bem-sucedida;
- o checkout possui regra de horário de corte após `13:40` no fuso de São Paulo;
- há lógica específica para fim de semana no checkout;
- parte dos status de pedido e separação é dirigida por valores textuais gravados no banco.

## Deploy

Existe um guia específico para Ubuntu em [`deploy/ubuntu/DEPLOY.md`](/Users/winistonalle/Desktop/copia-para-funcionarios/deploy/ubuntu/DEPLOY.md).

Resumo da arquitetura documentada:

- `dist/` servido por Nginx;
- webhook Node escutando em `127.0.0.1:3333`;
- Nginx expondo a automação em `/automation/`;
- serviços `systemd` para o webhook de operações e para o sync de planilha.

Arquivos úteis:

- [`deploy/ubuntu/nginx.catalogo.conf`](/Users/winistonalle/Desktop/copia-para-funcionarios/deploy/ubuntu/nginx.catalogo.conf)
- [`deploy/ubuntu/catalogo-automation.service`](/Users/winistonalle/Desktop/copia-para-funcionarios/deploy/ubuntu/catalogo-automation.service)
- [`deploy/ubuntu/catalogo-sheet-sync.service`](/Users/winistonalle/Desktop/copia-para-funcionarios/deploy/ubuntu/catalogo-sheet-sync.service)

## Segurança e cuidados

- há um `.env` versionado no repositório atual; isso é um risco real e o recomendado é remover segredos do versionamento e fazer rotação das chaves já expostas;
- o arquivo `google-service-account.json` também não deve ficar versionado em ambientes compartilhados;
- o `SUPABASE_SERVICE_ROLE_KEY` deve ser usado apenas em scripts, automações e APIs protegidas;
- como o login usa CPF, políticas de rate limit e monitoramento são recomendáveis no ambiente público;
- antes de subir para produção, valide RLS, RPCs e escopos do usuário anônimo.

## Arquivos mais importantes para manutenção

- [`src/App.tsx`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/App.tsx): rotas e guards
- [`src/services/auth.ts`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/services/auth.ts): login por CPF
- [`src/services/orders.ts`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/services/orders.ts): criação de pedidos
- [`src/lib/adminOperations.ts`](/Users/winistonalle/Desktop/copia-para-funcionarios/src/lib/adminOperations.ts): cliente das operações admin
- [`server/adminOperations.ts`](/Users/winistonalle/Desktop/copia-para-funcionarios/server/adminOperations.ts): autorização e regras operacionais
- [`scripts/syncEmployeesFromSheet.mjs`](/Users/winistonalle/Desktop/copia-para-funcionarios/scripts/syncEmployeesFromSheet.mjs): sincronização de funcionários
- [`automation/operations-webhook.ts`](automation/operations-webhook.ts): endpoints internos de operações
- [`deploy/ubuntu/DEPLOY.md`](/Users/winistonalle/Desktop/copia-para-funcionarios/deploy/ubuntu/DEPLOY.md): referência de implantação

## Próximos passos recomendados

- criar um `.env.example` sem segredos;
- documentar o schema do Supabase com migrations versionadas;
- integrar os pedidos com o ERP CIGAM via API;
- adicionar testes automatizados para login, checkout e endpoints admin;
- revisar segredos já commitados e rotacionar credenciais.
