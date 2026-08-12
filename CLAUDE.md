# Catálogo de Funcionários — contexto para o Claude

Aplicação interna de pedidos de funcionários (React/Vite + Supabase self-hosted).
Funcionário loga por CPF, monta carrinho, paga com saldo mensal (desconto em
folha) ou na retirada. Admin/RH gerenciam produtos, pedidos, relatórios e saldo.
Os pedidos são lançados no ERP **CIGAM**.

> **Atualizado em 12/08/2026, no servidor.** Nessa sessão a integração saiu do
> papel: o SQL já havia sido rodado, o estoque foi populado pela primeira vez, o
> primeiro pedido real foi ao CIGAM e o disparo automático foi ligado. O sistema
> está **no ar e rodando sozinho**.
>
> O que resta é pontual e está em "⚡ O que ainda falta". As seções de handoff
> abaixo foram corrigidas — a versão de 06/08 descrevia um deploy que não existe
> mais e dava como pendente um SQL que já rodou.
>
> **O bloco 🛑 PARE continua valendo:** esta é máquina de produção.

---

# 📍 Trabalhe neste projeto DIRETO NO SERVIDOR

**Decisão do Winiston (10/08/2026).** O lugar certo de mexer neste projeto é a
sessão do Claude que roda **no servidor**, não a máquina de desenvolvimento.
Motivo: **o Supabase é local lá** (`127.0.0.1:54321` REST, `127.0.0.1:54322`
Postgres). Só de lá se alcança o Postgres para rodar migração, e é lá que estão
o `.env` real, o PM2 e o repo que está no ar.

**O que só funciona no servidor:**

- Rodar SQL/migração (`psql` no `127.0.0.1:54322`)
- `pm2 restart webhook` / `pm2 restart frontend` / `pm2 list`
- `npm run build`, porque **este repo é o que está publicado** — o app PM2
  `frontend` serve o `dist/` daqui (ver "Como o deploy REALMENTE funciona")
- Os comandos `cigam:*` com o `.env` correto (`SUPABASE_URL` aponta pro local)

**A pegadinha da máquina de dev:** a MESMA instância do Supabase está exposta em
`https://apifuncionarios.gostinhomineiro.com`. Então, do Mac, **a REST API de
produção é alcançável** — dá para ler e ESCREVER dado real com a service role
key do `.env`. Confirmado em 10/08/2026 (auditamos o estado do banco por lá).
Isso é útil para **diagnóstico read-only** e nada mais: o Postgres em si não é
alcançável de fora, então migração não roda, e rodar `cigam:pending` do Mac
mandaria pedido real pro CIGAM apontando pro banco errado se o `SUPABASE_URL`
não fosse sobrescrito. **Não escreva em produção a partir da máquina de dev.**

Fluxo correto: editar código e commitar de onde for conveniente → no servidor,
`git pull` + `npm ci` + `npm run build` → SQL → `cigam:*` → `pm2 restart`.

---

# 🛑 PARE — LEIA ANTES DE EXECUTAR QUALQUER COISA

**Esta é uma máquina de PRODUÇÃO.** Pedidos, saldos e preços aqui são reais, e o
CIGAM emite documento fiscal de verdade.

**O SQL de migração já rodou** (todas as partes, conferido em 12/08/2026). O
alerta que existia aqui sobre rodar `cigam:*` antes do SQL não se aplica mais.

**Ainda assim, antes de rodar qualquer comando que ESCREVE, você DEVE perguntar
ao Winiston e esperar a resposta.** Vale para `CIGAM_EXEC=1 npm run cigam:pending`
(cria e efetiva pedido real, irreversível), `STOCK_EXEC=1 npm run cigam:estoque`
e qualquer `PATCH`/SQL no banco. Leitura e simulação são livres.

Para conferir o estado atual antes de agir:

```bash
# Roda daqui mesmo (o Supabase é local). Se não tiver a chave à mão:
#   KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)

# 1) Estoque está populado? (deve ser ~171 de 172)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -I \
  "http://127.0.0.1:54321/rest/v1/products?select=id&stock_qty=not.is.null"

# 2) Tem pedido preso na fila? (o auto-sync deve zerar isso em até 2 min)
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Prefer: count=exact" -I \
  "http://127.0.0.1:54321/rest/v1/orders?select=id&erp_status=eq.PENDING"

# 3) Pedidos que foram ao CIGAM
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:54321/rest/v1/orders?select=order_number,erp_external_id,erp_error&erp_external_id=not.is.null&order=created_at.desc"

# 4) O disparo automático está mesmo ligado?
pm2 logs webhook --lines 30 --nostream | grep -E "auto-sync|Estoque sync"
```

---

## ⚡ O que ainda falta

1. **Validar o overlay "Sem Estoque" na tela.** É a única parte do caminho sem
   validação visual. A cadeia foi conferida por código em 12/08/2026 e está
   inteira (`Index.tsx` mapeia `stock_qty` → `ProductCard`/`ProductDetail`
   chamam `isOutOfStock` → overlay em `ProductCard.tsx`), e o dado chega ao PWA
   pela chave anon. Falta só olhar. O catálogo é rota protegida, então exige
   login por CPF — **peça um CPF ao Winiston em vez de usar o de um funcionário
   real** tirado do banco.
2. **Usuário de integração dedicado no CIGAM** (ver Backlog). Hoje roda na
   credencial pessoal do Winiston, que é a mesma do PDV da loja — cada login
   derruba a sessão do outro.

Fora isso, o fluxo está fechado e rodando sozinho.

## O que foi feito em 12/08/2026

- **Estoque populado** pela primeira vez: 172 produtos, 171 com saldo.
- **Primeiro pedido real no CIGAM.** `GM-20260811-4844` (IAN SANTOS RODRIGUES,
  R$ 69,00) → **CIGAM 011750**. Estreou a série REC.
- **Disparo automático LIGADO** (ver abaixo).
- Dois bugs corrigidos, ambos descobertos ao ligar as coisas de verdade — ver
  "A série REC e o erro que não é erro" e "Por que o sync não apaga saldo".
- Pedidos `011736` (primeira tentativa do pedido do IAN) e `010329` (teste
  antigo) foram **excluídos no CIGAM pelo Winiston**. O `011736` foi recriado
  como `011750`; se um pedido for excluído no ERP de novo, o conserto é voltar
  `erp_status` para `PENDING` e limpar `erp_external_id` — o processador só
  varre `PENDING`, então sem isso ele nunca reenvia e o pedido fica órfão.

### Como o deploy REALMENTE funciona

⚠️ A versão anterior deste arquivo mandava rodar `git pull && npm run build` em
`/var/www/catalogo/current` porque "o nginx serve o dist de lá". **Isso é falso
desde ~10/06/2026.** Aquele diretório está congelado e não é servido por
ninguém; nenhum arquivo do nginx sequer o menciona.

Quem serve o frontend é o **app PM2 `frontend`**, que roda
`npm run preview -- --host 127.0.0.1 --port 4173` com `cwd` em
`/home/xulio/apps/catalogo-funcionarios`. O nginx (`sites-enabled/default`,
`server_name funcionarios.gostinhomineiro.com`) faz `proxy_pass` para
`127.0.0.1:4173`, e `/automation/` para `127.0.0.1:3333` (o webhook).

Ou seja: **este repo, em `/home/xulio/apps/catalogo-funcionarios`, é o que está
no ar.** O deploy do frontend é:

```bash
cd /home/xulio/apps/catalogo-funcionarios
npm run build
pm2 restart frontend    # o preview serve o dist do disco
```

Para conferir qual bundle está de fato no ar (o teste que não mente):

```bash
curl -s https://funcionarios.gostinhomineiro.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'
# compare com: grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html
```

`deploy/ubuntu/DEPLOY.md` e `deploy/ubuntu/nginx.catalogo.conf` descrevem uma
arquitetura (systemd + nginx servindo estático) que **não é a que roda**. Trate
os dois como histórico.

### Disparo automático — LIGADO em 12/08/2026

```bash
CIGAM_AUTO_SYNC_INTERVAL_MS=120000    # 2 min  — varre pedidos PENDING
STOCK_SYNC_INTERVAL_MS=1800000        # 30 min — sync de estoque CIGAM → Supabase
```

Os dois intervalos são deliberadamente diferentes, e a razão importa:

- **Pedidos a cada 2 min é barato.** `processPendingOrders` faz `return []`
  antes de instanciar o `CigamClient` quando não há nenhum `PENDING` — logo,
  varredura vazia **não faz login** e não custa nada.
- **Estoque a cada 30 min porque bate no CIGAM toda vez** (172 materiais, até 2
  passadas). Como o CIGAM só admite uma sessão por usuário e o PDV da loja usa a
  **mesma credencial**, sync agressivo vira guerra de sessão com o caixa da
  loja. A janela entre um sync e outro é coberta pela reconsulta ao vivo no
  checkout (`GET /automation/estoque`).

O webhook roda uma carga de estoque **na subida** (`void runStockSync()`), então
todo `pm2 restart webhook` dispara um sync completo.

---

## Estado atual

| Item | Construído | Ligado em produção |
|---|---|---|
| Criar pedido no CIGAM via REST | ✅ | ✅ (pedido 011750, real) |
| CalcularImposto / controle 30 | ✅ | ✅ |
| Efetivar série REC | ✅ | ✅ exercitado em 12/08/2026 |
| Sync de estoque | ✅ | ✅ 171/172 com saldo |
| Overlay "Sem Estoque" na tela | ✅ | ⚠️ dado chega; falta olhar a tela |
| Número do CIGAM no app | ✅ | ✅ |
| Disparo automático | ✅ | ✅ 2 min (pedidos) / 30 min (estoque) |

---

## Infra (esta máquina É o servidor de produção)

- Processos via **PM2** (não systemd), todos com `cwd` neste repo:
  - `webhook` — `npm run automation:webhook` (porta 3333, exposto pelo nginx em
    `/automation/`). É quem roda o auto-sync de pedidos e de estoque.
  - `frontend` — `npm run preview -- --host 127.0.0.1 --port 4173`. **É o que
    serve o catálogo**, com o nginx fazendo proxy. Note que o `preview` do
    `package.json` tem `--port=4174` embutido; quem manda é o `--port 4173` que
    o PM2 passa depois. Se mexer nisso, confira o `proxy_pass` do nginx junto.
  - `sheets` + crontab (20 em 20 min) — sync de funcionários via Google Sheets.
  - A máquina roda outros projetos no mesmo PM2 (`pdv-*`, `totem-loja-*`,
    `equipgest-*`, `corofinanceiro-*`, `varejo-gm-*`). **Confira o nome antes de
    reiniciar** — `frontend` sem prefixo é o deste projeto.
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

### A série REC e o erro que não é erro

Ao efetivar, o CIGAM responde **`success: false`** com:

```
"Efetivação concluída. Erro ao enviar a nota."
```

**Isso é sucesso, não falha.** A primeira frase é a que importa: a efetivação
concluiu e o pedido foi a controle 40. O "erro ao enviar a nota" é a transmissão
do documento ao fisco — que para pedido de funcionário **não se quer que
aconteça**, porque a série é REC (recibo) e não NF-e. Confirmado com o Winiston
em 12/08/2026.

Antes da correção, todo pedido ganhava um `erp_error` mandando "concluir no
CIGAM Desktop" à toa. Hoje `efetivacaoConcluiu()` casa pelo prefixo
**"Efetivação concluída"** — e não por "erro ao enviar a nota". A distinção é
proposital: o que autoriza tratar como sucesso é a efetivação ter concluído, não
o motivo de o envio ter falhado. Uma efetivação que falhe de verdade não traz
essa frase e continua virando aviso.

⚠️ **Não copiar essa tolerância para o PDV.** Lá a série é CF1/NFE e transmitir
ao fisco é justamente o objetivo, então a mesma string é falha real. O
`types.ts` do PDV documenta que nesse caso o CIGAM pode **gerar um número de NF
real e queimá-lo** mesmo respondendo `success:false`.

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

### Por que o sync não apaga saldo conhecido

"Material sem linha" é **ambíguo por construção**: pode ser "não tem estoque
cadastrado" ou "o CIGAM não respondeu isso agora", e não há como distinguir —
material ausente do Map é a mesma coisa nos dois casos.

Isso mordeu em 12/08/2026, na primeira rodada automática: a varredura manual
tinha resolvido **171 de 172** materiais e a automática, 25 minutos depois,
devolveu **26 sem linha** — apagando saldo bom de material que comprovadamente
tem linha. Com fail-open, os 26 voltaram a aparecer como disponíveis.

Por isso `sync-estoque.ts` **só grava ausência quando não havia saldo conhecido
antes**. Detalhes que valem a pena não desfazer:

- **Zero real continua sendo gravado.** Zero vem COMO linha do CIGAM, não como
  ausência — então produto que esgotou de verdade bloqueia normalmente. Só a
  ausência é preservada.
- **`stock_synced_at` não avança** no caso preservado, de propósito: o valor
  mantido é o da última confirmação real e o timestamp precisa continuar
  dizendo isso. Se um material ficar preservado para sempre, é ali que se vê.
- O contador `preservados` aparece no log do sync e do webhook. Se ele vier
  alto toda rodada, o problema é a instabilidade do CIGAM sob carga — mexer na
  concorrência de `buscarDisponibilidades`, não no gravador.

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
  20,15 (prova de que o `CalcularImposto` funcionou). **Excluído no CIGAM pelo
  Winiston em 12/08/2026** — não procurar por ele.
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
- **Os 56 pedidos `erp_status = 'ERROR'` são lixo da era Saibweb**, não do CIGAM:
  o `erp_error` deles é timeout de locator do Playwright, e o mais recente é de
  09/07/2026. Nenhum tem `erp_external_id`. Como o processador só varre
  `PENDING`, eles ficam parados e são inofensivos — mas poluem qualquer contagem
  de "pedidos com erro". Limpar junto com o resto do Saibweb (PARTE 3 do SQL).
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

npm run build && pm2 restart frontend  # publica o frontend (este repo É o que está no ar)
pm2 restart webhook                    # recarrega automation/ (roda um sync de estoque na subida)
pm2 logs webhook --lines 50 --nostream # ver o auto-sync trabalhando
```

Com o disparo automático ligado, os comandos `cigam:*` são para **diagnóstico e
casos pontuais** — no dia a dia o webhook já faz o trabalho sozinho. Rodar
`CIGAM_EXEC=1 npm run cigam:pending` à mão não é errado (o webhook usa a mesma
função e há guarda contra sobreposição), mas raramente é necessário.

Checar o `automation/` antes de reiniciar (nenhum tsconfig cobre esse
diretório — `npx tsc --noEmit` na raiz **não checa nada** dele):

```bash
npx tsc --noEmit --strict --target ES2022 --lib ES2023,DOM --module ESNext \
  --moduleResolution bundler --skipLibCheck --types node \
  automation/cigam/*.ts automation/operations-webhook.ts
```

Rodando **fora** do servidor, sobrescrever `SUPABASE_URL` para o domínio público
(o padrão do `.env` é `127.0.0.1:54321`, que só existe aqui):

```bash
SUPABASE_URL=https://apifuncionarios.gostinhomineiro.com npm run cigam:pending
```
