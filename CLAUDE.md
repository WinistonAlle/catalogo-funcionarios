# Catálogo de Funcionários — contexto para o Claude

Aplicação interna de pedidos de funcionários (React/Vite + Supabase self-hosted).
Funcionário loga por CPF, monta carrinho, paga com saldo mensal (desconto em folha)
ou na retirada. Admin/RH gerenciam produtos, pedidos, relatórios e saldo.

## Infra (esta máquina É o servidor de produção)

- Processos via **PM2** (não systemd): app `webhook` roda `npm run automation:webhook`
  (porta 3333, exposto pelo nginx em `/automation/`); app `sheets` + crontab (20 em
  20 min) rodam o sync de funcionários via Google Sheets.
- Supabase self-hosted local: REST em `127.0.0.1:54321`, Postgres em `127.0.0.1:54322`
  (user/senha postgres). O `.env` (gitignorado) tem as chaves reais.
- Frontend é PWA — mudanças de schema que quebram bundle antigo precisam de
  colunas de compatibilidade temporárias.

## Migração de ERP: Saibweb → CIGAM (julho/2026)

O Saibweb (ERP antigo, automação via Playwright) foi **totalmente removido** do
projeto. A integração nova é via **API REST do CIGAM** (Portais Web API).

### O que já está pronto e testado

- `automation/cigam/client.ts` — cliente da API (login/hash Bearer com renovação
  automática, criar pedido + itens de forma idempotente e retomável).
- `automation/cigam/process-pending-orders.ts` — processador: pega pedidos pagos
  com `erp_status = PENDING`, converte e lança no CIGAM, grava resultado.
  - Simulação: `npm run cigam:pending` | Real: `CIGAM_EXEC=1 npm run cigam:pending`
  - Endpoint: `POST /automation/integration/cigam/pedidos/exec` (bearer
    `CIGAM_INTEGRATION_TOKEN`; sem o token no .env fica desativado).
- `npm run cigam:check` — smoke test da conexão (só leitura).
- `automation/cigam/test-pedido.ts` — cria 1 pedido de teste marcado "PODE EXCLUIR".
- Produtos mapeados e validados contra o cadastro do CIGAM:
  `products.cigam_code` (12 dígitos, prefixo `002`) e `products.cigam_unit` (KG/PCT/CX).
- Colunas de integração em `orders`: `erp_status`/`erp_error`/`erp_synced_at`/
  `erp_external_id` (renomeadas das antigas `saibweb_*`).
- Sequência `cigam_order_code_seq` + RPC `next_cigam_order_code()`: gera o código
  curto do pedido no CIGAM (faixa 9xxxxx). O `order_number` (GM-...) vai na observação.

### Regras de negócio da integração

- API: `https://gostinhomineiroportais.cigam.cloud/api/api/...` (o `/api` duplicado
  é proposital — caminho real difere da documentação em `/api/help`).
- Cliente consumidor = `5`, tabela de preço funcionário = `005`,
  condição de pagamento = `260`, centro de armazenagem dos itens = `001`.
  Sem tipo de nota (REC foi cogitado e descartado).
- Observação do pedido: `NOME DO FUNCIONARIO - PEDIDO GM-...`.
- Conversão de quantidade (espelha a matemática de preço do catálogo, o total
  lançado sempre = valor cobrado do funcionário):
  - `cigam_unit = KG`: quantidade = pacotes × `weight`; preço = R$/kg (`unit_price`/peso)
  - `PCT`/`CX`/`UN`: quantidade = nº de pacotes; preço = preço do pacote

### ONDE PARAMOS (10/07/2026)

**Único bloqueio:** `POST Pedido/Salvar` (e `GET Pedido/Buscar` listagem,
`Configuracao/Buscar`, `Padrao/Buscar`) retornam **500 "Ocorreu uma falha"** via
API, embora criar pedido pela tela funcione com o mesmo usuário. Já descartado:
token expirado, payload, cliente/produto/condição errados. É parametrização do
módulo Portais — aguardando consultoria CIGAM olhar o log da Web API (instância
é cloud, só eles acessam). Contrato 3094/26, release 251103.d.

**Quando destravar:** `npm run cigam:check` → `npx tsx automation/cigam/test-pedido.ts`
(conferir na tela e excluir) → `CIGAM_EXEC=1 npm run cigam:pending` → decidir o
disparo automático (varredura própria no webhook ou agendador externo/Maax).

### Backlog / pendências conhecidas

- Usuário de integração dedicado no CIGAM (hoje usa credencial pessoal no `.env`;
  trocar a senha dela depois).
- Pesos zerados em 2 produtos KG >1kg (GG Kibe Creme de Alho 3kg, PdQ Ímpar 30g
  5kg) — decisão do usuário de não corrigir por ora; efeito só no estoque do ERP.
- 9 produtos sem `cigam_code` de propósito (alhos avulsos, OMG misto, PdQ gourmet
  1kg) — pedidos com eles falham com erro claro até ganharem código.
- Limpeza futura no banco: dropar colunas dummy `saibweb_status`/`saibweb_error`
  de `orders` (compat PWA, ~2 semanas), tabela `saibweb_jobs`, coluna
  `products.saibweb_code`.
- O projeto vizinho `/home/xulio/apps/totem-loja` ainda usa Saibweb (fora deste repo).
