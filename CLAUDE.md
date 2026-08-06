# Catálogo de Funcionários — contexto para o Claude

Aplicação interna de pedidos de funcionários (React/Vite + Supabase self-hosted).
Funcionário loga por CPF, monta carrinho, paga com saldo mensal (desconto em
folha) ou na retirada. Admin/RH gerenciam produtos, pedidos, relatórios e saldo.
Os pedidos são lançados no ERP **CIGAM**.

> **Este arquivo foi reescrito em 06/08/2026** como handoff para o Claude que
> roda **no servidor**. A sessão anterior (na máquina de desenvolvimento do
> Winiston) reescreveu a integração CIGAM inteira e validou tudo o que dava para
> validar de fora. O que falta exige estar no servidor.
>
> **Comece pelo bloco 🛑 PARE logo abaixo — ele é obrigatório e pede uma
> confirmação do Winiston antes de qualquer execução.**

---

# 🛑 PARE — LEIA ANTES DE EXECUTAR QUALQUER COISA

**Esta é uma máquina de PRODUÇÃO.** Pedidos, saldos e preços aqui são reais, e o
CIGAM emite documento fiscal de verdade.

**Antes de rodar qualquer comando deste projeto, você DEVE:**

1. **Verificar se o SQL de migração já foi rodado** (comando abaixo).
2. **Perguntar ao Winiston e esperar a resposta dele.** Não deduza pelo
   resultado do comando, não assuma que "provavelmente já rodou", não siga em
   frente "só para checar". Ele pediu explicitamente, em 06/08/2026, para ser
   consultado sobre isso antes de qualquer ação.

```bash
# Roda daqui mesmo (o Supabase é local). Se não tiver a chave à mão:
#   KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

# 1) As colunas do SQL existem?
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:54321/rest/v1/products?select=stock_qty&limit=1"
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:54321/rest/v1/orders?select=erp_nota_fiscal&limit=1"
#    -> "column ... does not exist"  = SQL NÃO rodado
#    -> [] ou linhas                 = SQL rodado

# 2) Os pedidos antigos foram descartados? (PARTE 5)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -I \
  "http://127.0.0.1:54321/rest/v1/orders?select=id&erp_status=eq.DISCARDED"

# 3) Algum pedido já foi ao CIGAM? (em 06/08/2026 era 0)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -I \
  "http://127.0.0.1:54321/rest/v1/orders?select=id&erp_external_id=not.is.null"
```

**Se o SQL NÃO foi rodado, PARE.** Avise o Winiston e não execute nada além de
leitura. Rodar `cigam:pending` ou `cigam:estoque` antes do SQL faz o pedido ser
criado no CIGAM — possivelmente já efetivado, com documento REC emitido — e a
gravação aqui falhar, exigindo reconciliação manual no ERP. O código detecta e
grita, mas o estrago no CIGAM já terá acontecido.

**A ORDEM É:** `git pull` + `build` → `.env` → **SQL** → `cigam:estoque` →
restart do webhook. Nunca inverta SQL e comandos `cigam:*`.

---

## ⚡ AÇÃO IMEDIATA — o que precisa ser feito no servidor

Estado em 06/08/2026, confirmado consultando o banco de produção: **nada disso
foi feito**. 0 pedidos foram ao CIGAM, as colunas do SQL não existem, nenhum
pedido foi descartado. Confirme com o Winiston (bloco acima) antes de agir.

### 1. `git pull` **e rebuildar o frontend**

A branch é `main`, remote `github.com/WinistonAlle/catalogo-funcionarios`.

```bash
cd /var/www/catalogo/current
git pull
npm ci
npm run build      # OBRIGATÓRIO: o nginx serve /var/www/catalogo/current/dist
```

O nginx serve o **estático de `dist/`** (ver `deploy/ubuntu/nginx.catalogo.conf`).
Sem `npm run build`, nenhuma mudança de frontend aparece — inclusive a exibição
do número do CIGAM no Admin/RH/Meus Pedidos. `git pull` sozinho não basta.

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

### 3. Rodar o SQL no Supabase — **quem roda é o Winiston**

`scripts/2026-08-06-atualizacao-banco.sql`, colado no SQL Editor.

⚠️ **Não rode este SQL por conta própria.** Daqui o Postgres É alcançável
(`127.0.0.1:54322`, local — o bloqueio de 54322/5432 vale só para fora do
servidor), então tecnicamente dá para executar via `psql`. **Não faça isso sem
o Winiston pedir.** Ele quer rodar e conferir parte por parte: a PARTE 2C mexe
em preço e a PARTE 5 altera 20 pedidos. Se ele pedir para você rodar, tudo bem —
mas confirme antes qual parte, e mostre o resultado.

- **PARTE 1 — obrigatória.** Colunas `products.stock_qty`,
  `products.stock_synced_at`, `orders.erp_nota_fiscal` + índice. Aditiva e
  idempotente, não altera dado existente.
- **PARTE 2A — ativa.** 42 produtos KG com `weight = 0` → `1`. **Não muda preço
  nenhum** (o fallback já usava 1); só torna explícita a quantidade em kg
  mandada ao CIGAM.
- **PARTE 2C — ativa.** Corrige sobrepreço latente de 3× em 2 produtos. Também
  **não aumenta preço**: restaura o valor que sempre foi cobrado. Ver
  "Preço = preço/kg × peso" adiante.
- **PARTE 5 — obrigatória.** Descarta os 20 pedidos antigos (ver "Pedidos
  descartados" adiante). **Confira o corte de data antes de rodar** — do jeito
  que está, inclui o pedido de 06/08 da CARLA CRISTINA.
- **PARTE 2B — já aplicada** direto no banco em 06/08/2026 (4 pesos errados,
  reajuste real de até 5×). Rodar de novo é inofensivo, mas desnecessário.
- **PARTES 2D, 3 e 4 — comentadas de propósito.** Ler antes de descomentar.

### 4. Popular o estoque

```bash
STOCK_EXEC=1 npm run cigam:estoque
```

Esperado (medido em 06/08/2026): **172 produtos, 171 com saldo, 1 desconhecido**,
e **5 bloqueados** por saldo <= 0.

### 5. Reiniciar o webhook

```bash
pm2 restart webhook     # confirme o nome real com `pm2 list`
```

O `operations-webhook.ts` mudou. **Build/pull no disco não afeta processo em
execução** — no projeto irmão (PDV) isso já enganou a equipe por várias horas.
Confirme que o processo reiniciou de verdade antes de dizer que está no ar.

⚠️ **`deploy/ubuntu/DEPLOY.md` está desatualizado nesse ponto:** ele descreve
serviços systemd (`catalogo-automation.service`, `catalogo-sheet-sync.service`),
mas a operação real hoje é via **PM2**. Confira o que de fato está rodando
(`pm2 list` / `systemctl status`) em vez de seguir o DEPLOY.md cegamente. O
resto dele (nginx servindo `dist/`, `npm ci && npm run build`) continua válido.

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

## ⚠️ Preço = preço/kg × peso — mexer em `weight` muda o que o funcionário paga

`src/lib/pricing.ts`:

```ts
getUnitPrice = getKgPrice(product) * getProductWeight(product)
//              ^ employee_price       ^ weight, com fallback 1 se <= 0
```

`products.employee_price` é **preço por unidade de medida** (para material KG,
é R$/kg — **não** o preço do pacote). O valor cobrado é esse preço vezes o peso
da embalagem.

Consequências que já morderam (auditoria de 06/08/2026):

- **Alterar `weight` é uma mudança de preço**, não um ajuste técnico de estoque.
  Um produto de 5kg com `weight = 0` cai no fallback 1 e é vendido pelo preço de
  1kg.
- **Cadastrar `employee_price` como preço do pacote causa cobrança em dobro**,
  porque o peso multiplica de novo. Foi o caso de `002003000032` e
  `002004000003` (PARTE 2C do SQL): tinham 52,50 e 42,00 (preço do pacote de
  3kg) em vez de 17,50 e 14,00 (por kg), e com `weight = 3` cobrariam R$ 157,50
  e R$ 126,00. Ninguém chegou a pagar isso — as vendas históricas desses itens
  (23/03 e 06/05/2026) saíram corretas porque o `× weight` só passou a existir
  no commit `e3097c7`, posterior a elas.

Nenhum produto PCT/CX/UN tem `weight > 1` (conferido em 06/08/2026), então o
efeito está contido nos materiais KG.

## Auditoria de peso e preço contra o CIGAM (06/08/2026)

Os dois cadastros do CIGAM são a fonte da verdade e podem ser consultados por
API — não precisa medir embalagem nem adivinhar:

**Peso** — `suprimentos/es/Materiais/Buscar`, filtro `Material/Codigo eq '...'`
(o filtro é `Material/Codigo`, não `Codigo`: o DTO tem o material aninhado).
A descrição traz o peso da embalagem em **todos os 106 produtos KG**, sem
exceção (ex.: `"PAO DE QUEIJO IMPAR 30G PCT 5KG"`). O regex é o mesmo do PDV
(`parsePackageWeightKg`). Resultado: 44 estavam com `weight = 0`, mas **42 são
de 1kg** — o fallback já acertava. **Só 2 estavam de fato errados** (3kg e 5kg),
mais 2 divergentes que tinham peso 6 e o CIGAM diz 7. Esses 4 são a PARTE 2B.

⚠️ O `Material` **não tem campo de peso** — nem `Complemento` (vem sempre nulo),
nem `$expand` funciona nele. O peso só existe dentro da descrição.

**Preço** — `client.buscarPrecosTabela("005")` (tabela de funcionário), sobre
`genericos/ge/PrecosTabela/Buscar`. Dos 172 produtos, **169 batem centavo a
centavo** e nenhum ficou sem preço. As 3 divergências viraram as PARTES 2C e 2D.

Como a tabela 005 se mostrou confiável, vale considerar um `sync-precos.ts` nos
moldes do `sync-estoque.ts` para manter `employee_price` alinhado sozinho — o
método do client que faltava já existe.

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

- **Pesos errados — RESOLVIDO em 06/08/2026, aplicado direto no banco.** Os 4
  produtos com peso errado foram corrigidos por decisão do usuário, para o valor
  cobrado bater com a tabela 005 do CIGAM. O `employee_price` deles já batia; o
  errado era só o peso.

  | código | embalagem | peso antes | cobrava | passou a cobrar |
  |---|---|---|---|---|
  | `002005000027` | 5 kg | 0 (usa 1) | R$ 10,90 | **R$ 54,50** (5×) |
  | `002003000033` | 3 kg | 0 (usa 1) | R$ 18,55 | **R$ 55,65** (3×) |
  | `002006000017` | 7 kg | 6 | R$ 38,40 | R$ 44,80 |
  | `002006000016` | 7 kg | 6 | R$ 38,40 | R$ 44,80 |

  Foi um **reajuste real** para quem compra esses itens — o Pão de Queijo Ímpar
  de 5 kg saía por R$ 10,90, menos que o Premium de 1 kg (R$ 14,85). Além do
  preço, isso conserta a baixa de estoque no ERP (o pacote de 5kg dava baixa de
  1kg). Reverter = voltar os pesos para 0, 0, 6, 6.
  Restam os 42 produtos de 1kg da PARTE 2A, que são neutros em preço.
- **Pedidos descartados (06/08/2026):** os 20 pedidos `PENDING` de 10/07 a 06/08
  nunca foram ao CIGAM (integração desligada) e já haviam sido resolvidos na
  mão. Decisão do usuário: descartar, senão viraria pedido duplicado no ERP.
  Vira `erp_status = 'DISCARDED'` (PARTE 5). Não apaga nada, só tira da fila do
  processador (que filtra por `PENDING`). Reversível voltando para `PENDING`.
  `erp_status` não é lido em lugar nenhum do frontend.
- Usuário de integração dedicado no CIGAM (hoje usa a credencial pessoal do
  Winiston no `.env`; trocar a senha depois). Resolveria o conflito de sessão
  com o PDV.
- **Linha "Alho Em Creme" (OMG) fora do catálogo desde 06/08/2026.** Decisão do
  usuário: passa a ser vendida só na loja. Os 8 produtos da linha estão com
  `is_hidden = true` (as 4 bisnagas de 1,01kg já estavam; os 4 potes de 200g
  foram ocultados nessa data, direto no banco). Não foram excluídos — reverter é
  só voltar `is_hidden` para false, mas **resolver antes o preço divergente**
  (temos R$ 25,00, CIGAM tabela 005 diz R$ 250,00 — ver PARTE 2D do SQL).
  ⚠️ Não confundir com os 3 salgados que têm "alho" no nome e **continuam à
  venda**: Kibe c/ Creme de Alho 3kg, Salgado Festa Kibe c/ Creme de Alho e
  Salgado Festa Risole de Alho.
- Produtos sem `cigam_code` de propósito (alhos avulsos, OMG misto, PdQ
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
