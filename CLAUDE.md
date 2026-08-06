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

- `automation/cigam/client.ts` — cria pedido por **API REST pura**, autenticando
  com o token do login do portal (`CGPortal_Token`) como Bearer. O CIGAM gera o
  número do pedido. Ver "ONDE PARAMOS" para o porquê dessa combinação.
  ⚠️ **Reescrito em 06/08/2026 e ainda NÃO testado contra o CIGAM real.**
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
- Cliente = `009752` (cadastro dedicado "PEDIDO FUNCIONARIO" criado no CIGAM
  em 22/07/2026 — substituiu o antigo código genérico de consumidor `5` em
  todos os pedidos; vai cru em `Cliente.CodigoEmpresa`, sem padding).
  Tabela de preço funcionário = `005`, condição de pagamento = `260`
  (definitiva — ver "Falta pra produção"),
  centro de armazenagem dos itens = `001`. Sem tipo de nota (REC foi
  cogitado e descartado).
- Observação do pedido: `NOME DO FUNCIONARIO - PEDIDO GM-...`.
- Conversão de quantidade (espelha a matemática de preço do catálogo, o total
  lançado sempre = valor cobrado do funcionário):
  - `cigam_unit = KG`: quantidade = pacotes × `weight`; preço = R$/kg (`unit_price`/peso)
  - `PCT`/`CX`/`UN`: quantidade = nº de pacotes; preço = preço do pacote

### ONDE PARAMOS (06/08/2026) — pedido criado por API REST pura

**O diagnóstico de 14/07 estava ERRADO e foi revertido.** Na época concluímos que
o 500 "Ocorreu uma falha." no `Pedido/Salvar` era bug de parametrização do módulo
Portais (`VW_GERAL`) que só o CIGAM resolveria, e contornamos dirigindo as telas
MVC do portal por scraping de HTML.

**A causa real:** o token do login REST (`genericos/ge/Login/Autenticar`)
autentica **sem contexto de empresa** — é isso que faz a gravação falhar. O token
do login do **portal** (`CGPortal_Token`) carrega o contexto correto; usando ELE
como `Authorization: Bearer`, as gravações REST funcionam normalmente. Descoberto
e validado em produção pelo projeto irmão **pdv-gostinho-mineiro**
(`server/src/cigam/client.ts`), que cria pedidos reais por REST puro desde
30/07/2026.

**`automation/cigam/client.ts` foi reescrito (06/08/2026)** — o login por form
POST continua, mas agora só para obter o token. Todo o scraping de HTML
(`criarCabecalho`, `adicionarItem`, parsing de `toastr[...]`) foi removido. Fluxo:
- `POST comercial/fa/Pedido/Salvar` → cabeçalho; **o CIGAM gera o número**,
  guardamos em `erp_external_id`.
- `POST comercial/fa/Pedido/SalvarItemPedido` por item.
  `PrazoEntrega`/`PrazoProgramado` são **obrigatórios** (500 se vazios), apesar de
  a doc marcar como opcionais.
- `POST comercial/fa/Pedido/CalcularImposto` — **novo, nunca existiu aqui**. Sem
  isto, Tipo Operação/CFOP e os totais do pedido ficam zerados. ⚠️ Todo pedido
  lançado por este projeto até 06/08/2026 provavelmente está assim no CIGAM.
- `PUT comercial/fa/Pedido/AtualizarControlePedido` → "30" (Liberado p/
  Faturamento). Best-effort: falhar aqui não invalida o pedido, só mantém o
  clique manual em "Situação" no Desktop. ⚠️ Este endpoint **não valida** se a
  transição é legal — o "30" é literal no código de propósito.
- `Pedido/Efetivar` existe no cliente (`efetivarPedido`) mas **não é chamado
  automaticamente**. Série **`REC`** (recibo) — decisão do usuário 06/08/2026:
  pedido de funcionário **não emite NF-e**, diferente do PDV da loja (CF1/NFE).

**Retry de sessão (novo):** o CIGAM só admite **uma sessão ativa por usuário**, e
o PDV da loja usa a mesma credencial `winiston.a` — cada login derruba o outro. A
sessão morta se manifesta como **HTTP 500 com "Usuário não autenticado"** no
corpo, *não* como 401. `withAuthRetry` detecta, faz relogin e repete uma vez, com
a promise de relogin compartilhada para chamadas concorrentes não se
invalidarem em loop. (A solução de raiz continua sendo um usuário de integração
dedicado — ver backlog.)

`npm run cigam:check` (login) → `npx tsx automation/cigam/test-pedido.ts` (cria
pedido de teste, conferir na tela e excluir) → `CIGAM_EXEC=1 npm run cigam:pending`.

**Atenção — `automation/` não é coberto por nenhum tsconfig** (o `tsconfig.app`
cobre `src/`, o `tsconfig.node` só o `vite.config.ts`). Rodar `npx tsc --noEmit`
na raiz **não checa nada** deste diretório. Para checar de verdade:
`npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext --moduleResolution bundler --skipLibCheck --types node automation/cigam/*.ts`

**Disparo automático:** implementado no `operations-webhook.ts` — varredura
periódica que lança pedidos pendentes, ligada por `CIGAM_AUTO_SYNC_INTERVAL_MS`
(0/ausente = desligado). Fica desligado até a condição de pagamento certa entrar.

**Anti-duplicata:** o portal gera número novo a cada criação; o `erp_external_id`
é persistido logo após o cabeçalho (callback `onHeaderCreated`). Se os itens
falharem no meio, o pedido vira ERROR e a varredura não recria (não duplica) —
precisa completar/conferir na tela e reprocessar manualmente.

**Falta pra produção (atualizado 06/08/2026):**
- ~~Condição de pagamento "desconto em folha"~~ — **descartado**. `260` (à vista)
  é definitivo: como esses pedidos usam o cliente exclusivo `009752`, dá pra
  separá-los sem condição própria, e a conciliação do desconto em folha é feita
  pelo financeiro fora deste sistema.
- ~~Dry-run contra o Supabase real~~ — **feito 06/08/2026**, 10/10 pedidos sem
  erro (`cigam_code`, unidade e preço válidos em todos).
- **Pesos zerados** — 44 dos 106 produtos KG estão com `weight = 0`. Em 37 o
  fallback `peso = 1` acerta por acaso (são "Pacote 1kg"), mas em **7 não**:
  `002003000033` (3kg), `002005000027` (5kg) e 5 sem tamanho no nome
  (`002005000024/39/32/33`, `002004000014`). Efeito: o valor cobrado do
  funcionário fica **certo** (quantidade × preço dá o mesmo total), mas a
  quantidade em kg mandada ao CIGAM fica errada — pacote de 5kg dá baixa de
  1kg. Usuário optou por não corrigir agora; **corrigir antes de ligar o
  disparo automático**, senão o estoque do ERP diverge a cada pedido.
- Painel/retry de erros de integração.

### Feature: consulta de estoque em tempo real (20/07/2026)

Objetivo: bloquear adicionar item sem estoque, com overlay "Sem Estoque" na foto.
Estratégia **híbrida** (aprovada): sync periódico CIGAM→Supabase pro catálogo +
reconsulta ao vivo no checkout. Regra: `stock_qty <= 0` = sem estoque; `null` =
desconhecido = disponível (fail-open). Estoque lido no centro/unidade 001.

**Backend (pronto e testado ao vivo):**
- `client.buscarDisponibilidades(codigos)` — **desde 06/08/2026 é este o
  caminho.** Usa `POST suprimentos/es/Disponibilidade/Buscar` e devolve o saldo
  **disponível** = físico − demanda em carteira. Três armadilhas, todas
  confirmadas ao vivo (primeiro pelo PDV, depois aqui):
  - A resposta **não** usa o envelope `{success, messages, data}` — o corpo já é
    o objeto.
  - `EstoqueGeral` vem com colunas genéricas `CampoNNN` (`Campo4` = empresa,
    `Campo6` = material, `Campo133` = físico), não com os nomes do /api/help.
  - `DisponibilidadeGeral` **ignora** a unidade de negócio pedida e soma todas
    as empresas do centro. Quem varia por empresa é o `EstoqueGeral`.
  - O endpoint aceita **um material por chamada**, então o método é um pool com
    concorrência limitada + **segunda passada serial**. Isso não é over-
    engineering: na execução real de 06/08/2026, a primeira passada
    (concorrência 8) deixou **141 de 172** materiais sem resposta, e a passada
    serial resolveu 140 deles. Sem o retry, 82% do catálogo ficaria
    "desconhecido". Material que continua indefinido fica FORA do Map —
    ausência = desconhecido, **nunca** zero.
- `client.buscarSaldos(codigos)` — **@deprecated.** Lê `Estoque/Buscar`, que dá
  o físico puro, sem descontar pedidos em aberto. Mantido só por compatibilidade.
- `automation/cigam/sync-estoque.ts` — lê products c/ cigam_code, grava
  `stock_qty`/`stock_synced_at`. `npm run cigam:estoque` (sim) / `STOCK_EXEC=1`.
- `operations-webhook.ts`: sync periódico (`STOCK_SYNC_INTERVAL_MS`, off default)
  + endpoint ao vivo `GET /automation/estoque?materiais=cod1,cod2` (público, R/O,
  fail-open). Testado: retornou saldo real (KIBE 2326, ROMEU 202).

**Frontend (pronto, typecheck limpo, NÃO testado na tela ainda):**
- `src/lib/stock.ts`: `isOutOfStock()` + `checkStockLive()`.
- `Product` ganhou `cigam_code`/`stock_qty`/`stock_synced_at`; mapeado em
  `Index.tsx` mapRowToProduct.
- `ProductCard`/`ProductDetail`: reaproveitam o overlay "Sem Estoque" + bloqueio
  de adicionar que já existiam, agora dirigidos por `isOutOfStock`.
- `Checkout`: reconsulta ao vivo antes de finalizar; bloqueia + tarja vermelha
  "Sem estoque" no item + botão "Verificando estoque...".

**ONDE PAROU (06/08/2026): falta SÓ o usuário rodar a PARTE 1 de
`scripts/2026-08-06-atualizacao-banco.sql` no Supabase** (colunas `stock_qty numeric` + `stock_synced_at timestamptz` em
`public.products`; aditivo e idempotente). O Postgres não é acessível de fora do
servidor (54322/5432 filtrados), então isso é manual, colando no SQL Editor.

Todo o resto já foi validado ao vivo em 06/08/2026, em dry-run contra o CIGAM e
o Supabase de produção: **172 produtos, 171 com saldo, 1 desconhecido**, e
**5 seriam bloqueados** (saldo <= 0):
`Pão de Queijo Gourmet 400g (0)`, `Palito de Queijo Gourmet 400g (0)`,
`Alho Em Creme c/ Pimenta OMG 1,01kg (0)`, `Biscoito Suíço Meia Lua 60g 2kg (-4)`,
`Pão Francês 6 Horas 60g 7kg (-557)`.

Saldo negativo é real e proposital: significa que o CIGAM já comprometeu mais do
que tem fisicamente. Não é normalizado pra 0 — deve bloquear a venda.

Depois do SQL: `STOCK_EXEC=1 npm run cigam:estoque` popula os saldos → o overlay
"Sem Estoque" passa a funcionar sozinho (o front já está pronto e mapeado).
Rodando fora do servidor, sobrescrever `SUPABASE_URL` pro domínio público.

O front usa `select("*")`, então **não quebra** enquanto as colunas não existem —
o saldo vira `undefined` → `null` → desconhecido → disponível (fail-open).

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
