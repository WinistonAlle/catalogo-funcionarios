# Catálogo de Funcionários — contexto para o Claude

Aplicação interna de pedidos de funcionários (React/Vite + Supabase self-hosted).
Funcionário loga por CPF, monta carrinho, paga com saldo mensal (desconto em
folha) ou na retirada. Admin/RH gerenciam produtos, pedidos, relatórios e saldo.
Os pedidos são lançados no ERP **CIGAM**.

> **Este arquivo foi reescrito em 06/08/2026** como handoff para o Claude que
> roda **no servidor**. A sessão anterior (na máquina de desenvolvimento do
> Winiston) reescreveu a integração CIGAM inteira e validou tudo o que dava para
> validar de fora. O que falta exige estar no servidor — está na seção
> "AÇÃO IMEDIATA" logo abaixo.

---

## ⚡ AÇÃO IMEDIATA — o que precisa ser feito no servidor

Nada disso foi feito ainda. Em 06/08/2026 o banco de produção foi consultado e
confirmou: **0 pedidos foram ao CIGAM** e as colunas de estoque **não existem**.

**Confira o estado antes de agir** — o Winiston pode já ter feito parte:

```bash
# colunas de estoque existem?
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:54321/rest/v1/products?select=stock_qty&limit=1"
# pedidos já enviados ao CIGAM (esperado hoje: 0)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -I \
  "http://127.0.0.1:54321/rest/v1/orders?select=id&erp_external_id=not.is.null"
```

### 1. `git pull`

A branch é `main`, remote `github.com/WinistonAlle/catalogo-funcionarios`.
O último commit da sessão de desenvolvimento é `3304b7f`.

### 2. Atualizar o `.env` — **NÃO vem no `git pull`** (gitignorado)

Este é o passo mais fácil de esquecer e o que causa falha silenciosa.
Adicionar/conferir:

```bash
# Empresa do pedido de funcionário: 001 = INDUSTRIA E COMERCIO DE ALIMENTOS
# GOSTINHO MINEIRO. (O PDV da loja fatura pela 100 = Ímpar. São diferentes.)
CIGAM_UNIDADE_NEGOCIO=001

# Série da efetivação. REC (recibo) — pedido de funcionário NÃO emite NF-e.
CIGAM_NOTA_SERIE=REC

# Efetivação automática ligada (decisão do usuário 06/08/2026).
# O padrão do CÓDIGO já é ligado; esta linha é só para deixar explícito.
# Para DESLIGAR: trocar para 0 e reiniciar o webhook.
CIGAM_AUTO_EFETIVAR_PEDIDO=1
```

Os valores acima **já são o padrão no código**, então nada quebra se forem
esquecidos — mas deixar explícito evita surpresa se um padrão mudar.

### 3. Rodar o SQL no Supabase

`scripts/2026-08-06-atualizacao-banco.sql`, colando no SQL Editor.
O Postgres não é acessível de fora do servidor (54322/5432 filtrados).

- **PARTE 1 — obrigatória.** Colunas `products.stock_qty`,
  `products.stock_synced_at`, `orders.erp_nota_fiscal` + índice. Aditiva e
  idempotente, não altera dado existente.
- **PARTE 5 — obrigatória.** Descarta os 20 pedidos antigos (ver "Pedidos
  descartados" adiante). **Confira o corte de data antes de rodar** — do jeito
  que está, inclui o pedido de 06/08 da CARLA CRISTINA.
- **PARTES 2, 3 e 4 — comentadas de propósito.** Ler antes de descomentar.

### 4. Popular o estoque

```bash
STOCK_EXEC=1 npm run cigam:estoque
```

Esperado (medido em 06/08/2026): **172 produtos, 171 com saldo, 1 desconhecido**,
e **5 bloqueados** por saldo <= 0.

### 5. Reiniciar o PM2

```bash
pm2 restart webhook
```

O `operations-webhook.ts` mudou. **Build/pull no disco não afeta processo em
execução** — no projeto irmão (PDV) isso já enganou a equipe por várias horas.
Confirme que o processo reiniciou de verdade antes de dizer que está no ar.

### 6. Validar o overlay de estoque na tela

**Nunca foi testado.** É a única parte do caminho sem validação. Abrir o
catálogo e conferir que os 5 produtos aparecem com "Sem Estoque".

### 7. Testar a série REC (o Winiston vai fazer na prática)

⚠️ **A série REC nunca foi exercitada nesta instância.** O `efetivarPedido` foi
portado do PDV, onde funciona com `CF1`/`NFE`. O Winiston confirmou que o fluxo é
idêntico, só trocando a série — mas ninguém rodou ainda.

**Efetivar é irreversível.** No PDV, uma tentativa com parâmetro errado foi
rejeitada e **queimou um número sequencial de nota real**, que precisou de
tratamento contábil.

Dois detalhes operacionais importantes:

- `automation/cigam/test-pedido.ts` **para no controle 30** — ele não efetiva.
  Serve para testar criação, não REC.
- Depois da PARTE 5 do SQL, **não sobra nenhum pedido `PENDING`**. Logo, o
  primeiro exercício real da REC vai acontecer no **próximo pedido de verdade**
  de um funcionário. Se quiser testar de forma controlada antes disso, peça —
  dá para adaptar o `test-pedido.ts` para efetivar.

### 8. Só depois de tudo acima: ligar o disparo automático

`CIGAM_AUTO_SYNC_INTERVAL_MS` (hoje `0` = desligado; ex.: `120000` = 2 min).
**Antes de ligar, corrigir os pesos zerados** (PARTE 2 do SQL) — senão o estoque
do CIGAM diverge a cada pedido.

---

## Estado atual: construído ≠ ligado

| Item | Construído | Ligado em produção |
|---|---|---|
| Criar pedido no CIGAM via REST | ✅ validado (pedido 010329) | ❌ |
| CalcularImposto / controle 30 | ✅ validado | ❌ |
| Efetivar série REC | ✅ código pronto | ❌ nunca exercitado |
| Sync de estoque | ✅ validado em dry-run | ❌ falta SQL |
| Overlay "Sem Estoque" na tela | ✅ código pronto | ❌ nunca testado |
| Número do CIGAM no app | ✅ | — (aparece quando houver pedido) |
| Disparo automático | ✅ | ❌ desligado de propósito |

---

## Infra (esta máquina É o servidor de produção)

- Processos via **PM2** (não systemd): app `webhook` roda
  `npm run automation:webhook` (porta 3333, exposto pelo nginx em
  `/automation/`); app `sheets` + crontab (20 em 20 min) fazem o sync de
  funcionários via Google Sheets.
- Supabase self-hosted local: REST em `127.0.0.1:54321`, Postgres em
  `127.0.0.1:54322`. O `.env` (gitignorado) tem as chaves reais.
  A **mesma instância** é exposta publicamente em
  `https://apifuncionarios.gostinhomineiro.com` — é para lá que o frontend
  aponta (`VITE_SUPABASE_URL`), inclusive rodando `npm run dev` fora do
  servidor. Ou seja: **dev local mexe em dado real de produção.**
- Frontend é PWA — mudanças de schema que quebram bundle antigo precisam de
  colunas de compatibilidade temporárias.

**`automation/` não é coberto por nenhum tsconfig.** O `tsconfig.app` cobre
`src/`, o `tsconfig.node` só o `vite.config.ts`. Rodar `npx tsc --noEmit` na raiz
**não checa nada** desse diretório. Para checar de verdade:

```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts
```

O frontend (`npx tsc --noEmit -p tsconfig.app.json`) tem **144 erros
pré-existentes**, todos em `src/data/products.ts` e `src/data/shipping.ts`
(dados mock sem `employee_price`). Não são regressão — se o número for 144,
está igual ao baseline de 06/08/2026.

---

## Integração CIGAM — como funciona

### A descoberta que destravou tudo

O `Pedido/Salvar` via REST devolvia **500 "Ocorreu uma falha."**. O diagnóstico
de 14/07/2026 concluiu que era bug de parametrização do módulo Portais
(`VW_GERAL`) que só a CIGAM resolveria, e a solução foi dirigir as telas MVC do
portal por scraping de HTML.

**Esse diagnóstico estava errado.** A causa real: o token do login REST
(`genericos/ge/Login/Autenticar`) autentica **sem contexto de empresa**. O token
do login do **portal** (`CGPortal_Token`, obtido por form POST) carrega o
contexto correto — usando **ele** como `Authorization: Bearer`, as gravações REST
funcionam normalmente.

Por isso o login por form POST continua no `client.ts`: não é mais para dirigir
telas, é só para obter um token com contexto de empresa.

`automation/cigam/RELATORIO-BUG-CIGAM.md` é o relatório formal do diagnóstico
antigo. **Está marcado como superado — não enviar à CIGAM.**

### Fluxo do pedido (`client.ts` → `criarPedidoCompleto`)

1. `POST comercial/fa/Pedido/Salvar` — cabeçalho. **O CIGAM gera o número**
   (mandamos `Codigo: ""`); guardamos em `orders.erp_external_id`.
2. `POST comercial/fa/Pedido/SalvarItemPedido` — um por item.
   `PrazoEntrega`/`PrazoProgramado` são **obrigatórios** (500 se vazios), apesar
   de a doc marcá-los como opcionais.
3. `POST comercial/fa/Pedido/CalcularImposto` — sem isto, Tipo Operação/CFOP e
   os totais do pedido ficam **zerados**.
4. `PUT comercial/fa/Pedido/AtualizarControlePedido` → `"30"` (Liberado p/
   Faturamento). Best-effort. ⚠️ Este endpoint **não valida** se a transição é
   legal (um salto 30→90 passou em teste no PDV, enquanto o `Pedido/Salvar`
   corretamente recusaria) — o `"30"` é literal no código de propósito.
5. `POST comercial/fa/Pedido/Efetivar` — em `process-pending-orders.ts`
   (`efetivarSeConfigurado`), série **REC**. Controle vai a 40.
   `TipoFrete` deve ser `"F"` (Sem Frete) com os campos de transporte em branco.

### Regras de negócio

- Base REST: `https://gostinhomineiroportais.cigam.cloud/api/api/...`
  (o `/api` duplicado é proposital). Doc viva em `/api/help`, acessível por
  `curl` sem autenticação.
- Cliente = `009752` ("PEDIDO FUNCIONARIO", criado 22/07/2026). Vai cru, sem
  padding.
- Tabela de preço = `005` · condição de pagamento = `260` · centro de
  armazenagem = `001` · unidade de negócio = `001` · série = `REC`.
- **Condição `260` (à vista) é definitiva.** Cogitou-se criar uma condição
  "desconto em folha" no CIGAM; descartado em 06/08/2026 — como os pedidos usam
  cliente exclusivo, dá para separá-los sem isso, e a conciliação é feita pelo
  financeiro fora do sistema. **Não reabrir.**
- Observação do pedido: `NOME DO FUNCIONARIO - PEDIDO GM-...` (já implementado
  em `buildObservacao`).
- Conversão de quantidade (o total lançado sempre bate com o valor cobrado):
  - `cigam_unit = KG`: quantidade = pacotes × `weight`; preço = `unit_price`/peso
  - `PCT`/`CX`/`UN`: quantidade = nº de pacotes; preço = preço do pacote

### Retry de sessão — importante

O CIGAM admite **uma sessão ativa por usuário**, e o **PDV da loja usa a mesma
credencial `winiston.a`**. Cada login derruba o outro. A sessão morta chega como
**HTTP 500 com "Usuário não autenticado" no corpo — não como 401**.

`withAuthRetry` detecta, faz relogin e repete uma vez. A promise de relogin é
compartilhada para chamadas concorrentes não se invalidarem em loop.

Solução de raiz (backlog): usuário de integração dedicado no CIGAM.

### Anti-duplicata

`erp_external_id` é persistido **logo após criar o cabeçalho**, antes dos itens
(callback `onHeaderCreated`). Se os itens falharem no meio, o pedido vira ERROR
e a varredura **não recria** — precisa conferir/completar no Desktop e
reprocessar manualmente.

A efetivação é **best-effort**: se a emissão do documento falhar, o pedido
continua criado e correto, então **não** vira ERROR — grava aviso em `erp_error`
e alguém conclui no Desktop. Virar ERROR faria a varredura tentar recriar um
pedido que já existe.

---

## Estoque em tempo real

Objetivo: bloquear item sem estoque, com overlay "Sem Estoque" na foto.
Estratégia híbrida: sync periódico CIGAM→Supabase + reconsulta ao vivo no
checkout.

**Regra:** `stock_qty <= 0` = sem estoque · `null` = desconhecido = **disponível
(fail-open)**. Melhor deixar passar um pedido do que bloquear o funcionário por
falha técnica nossa.

- `client.buscarDisponibilidades(codigos)` — `POST
  suprimentos/es/Disponibilidade/Buscar`, devolve **disponível** = físico −
  demanda em carteira.
- `client.buscarSaldos(codigos)` — **@deprecated**, lê `Estoque/Buscar` (físico
  puro). Mantido só por compatibilidade.
- `automation/cigam/sync-estoque.ts` — `npm run cigam:estoque` (simulação) /
  `STOCK_EXEC=1` (real).
- `operations-webhook.ts` — sync periódico (`STOCK_SYNC_INTERVAL_MS`, off por
  padrão) + endpoint ao vivo `GET /automation/estoque?materiais=cod1,cod2`
  (público, read-only, fail-open).
- Frontend: `src/lib/stock.ts` (`isOutOfStock`, `checkStockLive`),
  `ProductCard`/`ProductDetail` (overlay), `Checkout` (reconsulta ao vivo).
  `Index.tsx` usa `select("*")`, então **não quebra** se as colunas não
  existirem — vira `undefined` → `null` → disponível.

### Armadilhas do `Disponibilidade/Buscar` (todas confirmadas ao vivo)

- A resposta **não** usa o envelope `{success, messages, data}` — o corpo já é o
  objeto.
- `EstoqueGeral` vem com colunas genéricas `CampoNNN` (`Campo4` = empresa,
  `Campo6` = material, `Campo133` = físico), não com os nomes do `/api/help`.
- `DisponibilidadeGeral` **ignora** a unidade de negócio pedida e soma todas as
  empresas do centro. Quem varia por empresa é o `EstoqueGeral`.
- O endpoint aceita **um material por chamada**. Por isso o método é um pool
  concorrente + **segunda passada serial**. Isso **não** é excesso de zelo: na
  execução real de 06/08/2026 a primeira passada (concorrência 8) deixou
  **141 de 172** materiais sem resposta e a serial resolveu 140. Sem o retry,
  82% do catálogo ficaria "desconhecido". **Não remover o retry.**
- Saldo **negativo é real e proposital** (o CIGAM comprometeu mais do que tem).
  Não normalizar para 0 — deve bloquear a venda.

---

## Regra geral: o `/api/help` mente

Antes de confiar em qualquer nome de campo documentado, confirme na resposta
real. Já mordeu várias vezes: `Disponibilidade`, `PrecosTabela`
(`Elemento`/`CodigoTabela`/`PrecoUnitario`, não o documentado),
`PesquisarMateriais` (`CodigoUnidadeMedida`, não `UnidadeMedida`),
`Pessoa/Salvar` (devolve HTTP 400 real, não `success:false`).
Prefira extração defensiva a assumir um formato.

O projeto irmão **pdv-gostinho-mineiro** (`server/src/cigam/client.ts`) é a
implementação de referência do CIGAM e documenta cada armadilha com a data em
que foi confirmada ao vivo. Consultar antes de investigar do zero.

---

## Validações já feitas (06/08/2026)

- **Pedido 010329** criado em produção por REST puro: cliente `009752`, unidade
  `001`, controle `30`, `TotalPedido`/`TotalFaturamento`/`TotalMercadoria` =
  20,15 (prova de que o `CalcularImposto` funcionou). Marcado "PODE EXCLUIR".
- **Dry-run dos pedidos pendentes:** 10/10 sem erro — `cigam_code`, unidade e
  preço válidos em todos.
- **Dry-run do estoque:** 172 produtos, 171 com saldo, 1 desconhecido. Os 5 que
  seriam bloqueados: `Pão de Queijo Gourmet 400g (0)`,
  `Palito de Queijo Gourmet 400g (0)`, `Alho Em Creme c/ Pimenta OMG 1,01kg (0)`,
  `Biscoito Suíço Meia Lua 60g 2kg (-4)`, `Pão Francês 6 Horas 60g 7kg (-557)`.

---

## Backlog / pendências conhecidas

- **Pesos zerados — corrigir antes de ligar o disparo automático.** 44 dos 106
  produtos KG estão com `weight = 0`. Em 37 o fallback `peso = 1` acerta por
  acaso (são "Pacote 1kg"), mas em **7 não**: `002003000033` (3kg),
  `002005000027` (5kg) e 5 sem tamanho no nome (`002005000024`, `002005000039`,
  `002005000032`, `002005000033`, `002004000014` — pesos desconhecidos, precisam
  ser conferidos na embalagem). Efeito: o valor cobrado do funcionário fica
  **certo** (quantidade × preço dá o mesmo total), mas a quantidade em kg
  mandada ao CIGAM fica errada — pacote de 5kg dá baixa de 1kg. PARTE 2 do SQL.
- **Pedidos descartados (06/08/2026):** os 20 pedidos `PENDING` de 10/07 a 06/08
  nunca foram ao CIGAM (integração desligada) e já haviam sido resolvidos na
  mão. Decisão do usuário: descartar, senão viraria pedido duplicado no ERP.
  Vira `erp_status = 'DISCARDED'` (PARTE 5). Não apaga nada, só tira da fila do
  processador (que filtra por `PENDING`). Reversível voltando para `PENDING`.
  `erp_status` não é lido em lugar nenhum do frontend.
- Usuário de integração dedicado no CIGAM (hoje usa a credencial pessoal do
  Winiston no `.env`; trocar a senha depois). Resolveria o conflito de sessão
  com o PDV.
- 9 produtos sem `cigam_code` de propósito (alhos avulsos, OMG misto, PdQ
  gourmet 1kg) — pedidos com eles falham com erro claro até ganharem código.
- Painel/retry de erros de integração (não existe).
- Limpeza dos restos do Saibweb: colunas `saibweb_status`/`saibweb_error` em
  `orders`, `products.saibweb_code`, tabela `saibweb_jobs`. Confirmado em
  06/08/2026 que **não há mais nenhuma referência a saibweb no código**. São
  compat para bundles antigos do PWA. PARTE 3 do SQL (comentada — risco baixo
  mas não zero).
- `cigam_order_code_seq` + `next_cigam_order_code()` viraram código morto (quem
  gera o número agora é o CIGAM). PARTE 4 do SQL (comentada, cosmética).
- O projeto vizinho `/home/xulio/apps/totem-loja` ainda usa Saibweb (fora deste
  repo).

---

## Comandos úteis

```bash
npm run cigam:check                    # smoke test do login (só leitura)
npx tsx automation/cigam/test-pedido.ts # cria 1 pedido teste (para no controle 30)
npm run cigam:pending                  # SIMULAÇÃO dos pedidos pendentes
CIGAM_EXEC=1 npm run cigam:pending     # REAL — cria e efetiva no CIGAM
npm run cigam:estoque                  # SIMULAÇÃO do sync de estoque
STOCK_EXEC=1 npm run cigam:estoque     # REAL — grava stock_qty
```

Rodando **fora** do servidor, sobrescrever `SUPABASE_URL` para o domínio público
(o padrão do `.env` é `127.0.0.1:54321`, que só existe aqui):

```bash
SUPABASE_URL=https://apifuncionarios.gostinhomineiro.com npm run cigam:pending
```
