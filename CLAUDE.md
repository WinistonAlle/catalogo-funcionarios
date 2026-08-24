# Catálogo de Funcionários — contexto para o Claude

Aplicação interna de pedidos de funcionários (React/Vite + Supabase self-hosted).
Funcionário loga por CPF, monta carrinho, paga com saldo mensal (desconto em
folha) ou na retirada. Admin/RH gerenciam produtos, pedidos, relatórios e saldo.
Os pedidos são lançados no ERP **CIGAM**.

> **Atualizado em 24/08/2026, no servidor.** O sistema estava **fora do ar** e
> **volta à produção em 25/08** — por isso o volume baixo dos últimos dias (19
> pedidos em julho, 8 em agosto, para 255 funcionários) não é falta de adesão.
> Três mudanças desta sessão:
>
> 1. **Usuário de serviço no CIGAM.** A integração saiu da credencial pessoal
>    do Winiston (`winiston.a`) e roda como **`SIST.FUNC`** — o PDV da loja
>    ganhou o dele (`PDV.GM`) no mesmo dia. Como o CIGAM só admite uma sessão
>    ativa por usuário, os dois sistemas viviam derrubando a sessão um do
>    outro; acabou. Escrita validada com pedido de teste (`014840`), **mas a
>    efetivação em REC ainda não foi exercitada por este usuário** — o
>    primeiro pedido real é o teste.
> 2. **A impressão da portaria virou manual, por decisão de processo.** Ver a
>    seção da lista de separação abaixo.
> 3. **A folha sai em duas vias** (RH e portaria).
>
> Pendência que atravessa o dia: **6 das 7 contas admin/RH ainda não criaram
> senha** — enquanto não criam, quem souber o CPF assume a conta. Ver
> "⚡ O que ainda falta".

> **Atualizado em 17/08/2026, no servidor.** A senha padrão `12345678` **deixou
> de existir**: cada admin/RH cria a própria senha no primeiro acesso, digitando
> só o CPF. Ver "Login de admin/RH". A integração com o CIGAM segue **no ar e
> rodando sozinha** (validada de ponta a ponta em 17/08 — pedido `012920`).
>
> ⚠️ **A janela de primeiro acesso está ABERTA para as 7 contas.** Enquanto uma
> pessoa não criar a senha dela, quem souber o CPF dela pode criar no lugar e
> assumir a conta. É risco aceito e escolhido pelo Winiston, com as alternativas
> na mesa — mas ele **fecha conta a conta, conforme cada um acessa**, então o
> certo é avisar os 7 hoje e conferir no log. Ver "Login de admin/RH".
>
> A sessão anterior (13/08) foi de segurança: fechou uma **escalada de
> privilégio** (qualquer pessoa na internet virava admin, sem senha, só com o
> CPF de um admin — que a própria API entregava) e a leitura pública de CPF,
> pedidos e saldo. Ver "🔒 SEGURANÇA".
>
> O que resta é pontual e está em "⚡ O que ainda falta".
>
> **O bloco 🛑 PARE continua valendo:** esta é máquina de produção.

---

# 🖨️ Lista de separação da portaria — CONCLUÍDA, e depois DESLIGADA

O passo a passo de deploy que ficava aqui saiu: foi executado, a feature entrou
na `main` e rodou com o disparo automático ligado. Em **24/08/2026 o disparo
automático foi desligado por decisão de processo** — não é bug nem regressão.
Quem imprime agora é o **faturamento**, em duas vias, pelo botão da tela. A
explicação completa está em "Lista de separação impressa na portaria", mais
abaixo neste arquivo.

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

1. **Avisar os 7 admins/RH para fazerem o primeiro acesso**, e acompanhar até
   todos terem criado a senha. Cada conta que ainda não acessou é uma conta que
   qualquer um com o CPF dela pode tomar — o risco só acaba quando a última
   fizer o acesso. Conferir quem falta:

   ```sql
   SELECT e.full_name, e.role,
          (u.raw_user_meta_data->>'must_change_password') AS falta_criar_senha
   FROM public.employees e JOIN auth.users u ON u.id = e.user_id
   WHERE e.role IN ('admin','rh') ORDER BY e.role, e.full_name;
   ```

   E conferir se quem criou foi mesmo a pessoa certa (IP e horário de cada
   criação):

   ```sql
   SELECT actor_name, metadata->>'ip' AS ip, created_at
   FROM public.admin_operation_logs WHERE action = 'first_access'
   ORDER BY created_at DESC;
   ```

2. ~~**Usuário de integração dedicado no CIGAM.**~~ **FEITO em 24/08/2026:** a
   integração roda como **`SIST.FUNC`** (o PDV ganhou o `PDV.GM`), com os
   direitos clonados do usuário do Winiston. Leitura e escrita validadas ao
   vivo — pedido de teste `014840`, criado e com imposto calculado, parado no
   controle 30 sem efetivar (nenhum número de nota queimado; **excluir no
   CIGAM**). Falta só a **efetivação em REC por este usuário**, que nenhum
   teste seguro cobre: o primeiro pedido de funcionário real é o teste.

3. **Confirmar a primeira efetivação depois da volta à produção.** Se falhar
   por permissão, o pedido vira `ERROR` com o saldo do funcionário **já
   debitado** — reenfileirar pelo `/admin/integracao` depois de corrigir.

Fora isso, o fluxo está fechado e rodando sozinho.

## Painel de integração CIGAM (13/08/2026)

`/admin/integracao` (card "Integração CIGAM" no `/admin`). Substitui o conserto
manual no banco. Rotas: `GET /automation/admin/integracao/pedidos` e
`POST /automation/admin/integracao/pedidos/:id/reenfileirar`, ambas atrás de
`authorizePrivilegedUser`.

**A classificação é por data, não pelo texto do erro.** A primeira versão
adivinhava "lixo do Saibweb" procurando `playwright|locator|timeout` no
`erp_error` e marcava como órfão tudo sem `erp_external_id` — o resultado foram
**138 falsos órfãos**, porque os 278 pedidos `SYNCED` da era Saibweb também não
têm número do CIGAM. O corte certo é `CIGAM_NO_AR_DESDE = 11/08/2026`: pedido
anterior a isso nunca teve caminho para o ERP.

Distribuição real de `erp_status` (13/08/2026): 278 `SYNCED` (Saibweb) · 56
`ERROR` (Saibweb) · 20 `DISCARDED` (decisão de 06/08) · 4 `DONE` (CIGAM, todos
com número). **Órfãos de verdade: zero.**

⚠️ **A trava que importa:** reenfileirar recusa com `409` qualquer pedido que já
tenha `erp_external_id` — reenviar criaria um segundo pedido no CIGAM, ou seja,
nota fiscal duplicada. O `force: true` só deve ser usado depois de o pedido ter
sido excluído no ERP (é o cenário do `011736`, ver "O que foi feito em
12/08/2026"). A tela pede confirmação explícita antes de forçar.

Validado em 13/08/2026: recusa em pedido com número (`011750` intacto), e
sucesso num pedido sintético (`ERROR` → `PENDING`, `erp_error` limpo).

### Como testar a tela sem extensão de navegador

O servidor é headless e a extensão do Chrome não conecta aqui, mas os browsers
do Playwright estão em cache (`~/.cache/ms-playwright`). O pacote não está neste
projeto — dá para importar do vizinho:

```js
import { chromium } from "/home/xulio/apps/totem-loja/node_modules/playwright/index.mjs";
```

Caminho até a grade de produtos (foi assim que o overlay foi validado em
12/08/2026):

1. `/` mostra a escolha "Sou Funcionário" / "Sou Cliente" — são **cards, não
   `<button>`**, então clique por texto, não por role.
2. Login por CPF em `/login`.
3. ⚠️ **CPF de admin/RH não cai no catálogo** — vai para `/admin` ou `/rh`. Se a
   conta já tem senha, aparece o campo `#senha`; se nunca acessou, aparece
   direto "Crie sua senha" (`#nova-senha` + `#confirma-senha`). Navegue direto
   para `/catalogo` depois de logar.
4. `/catalogo` abre numa capa; clicar em "Ver catálogo de produtos" revela a
   grade. A busca no topo filtra e é o jeito rápido de achar um bloqueado.

**Peça o CPF ao Winiston.** Não use o de um funcionário tirado do banco.

Se precisar testar o caminho do funcionário comum sem ter CPF à mão, crie um
funcionário de teste com um CPF fictício **válido no dígito verificador** (ex.:
`11144477735`), teste e apague depois — foi assim que a RLS de 13/08 foi
validada sem mexer na conta de ninguém:

```bash
KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env | cut -d= -f2-)
curl -s -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" "http://127.0.0.1:54321/rest/v1/employees" \
  -d '{"cpf":"11144477735","full_name":"ZZ TESTE (apagar)","role":"employee","credito_mensal_cents":5000}'
# ... testa ...
curl -s -X DELETE -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "http://127.0.0.1:54321/rest/v1/employees?cpf=eq.11144477735"
```

## O que foi feito em 12/08/2026

- **Estoque populado** pela primeira vez: 172 produtos, 171 com saldo.
- **Primeiro pedido real no CIGAM.** `GM-20260811-4844` (IAN SANTOS RODRIGUES,
  R$ 69,00) → **CIGAM 011750**. Estreou a série REC.
- **Disparo automático LIGADO** (ver abaixo).
- **Overlay "Sem Estoque" validado na tela**, com o catálogo real em produção:
  `Pão de Queijo Ímpar 40g – Pacote 5kg` (saldo 0 no CIGAM) apareceu com o selo
  e o botão trocado por "Indisponível", enquanto os vizinhos da mesma linha, com
  saldo, mantiveram o seletor de quantidade. Era o último item do caminho que
  nunca tinha sido visto funcionando.
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
| Overlay "Sem Estoque" na tela | ✅ | ✅ validado na tela em 12/08/2026 |
| Número do CIGAM no app | ✅ | ✅ |
| Disparo automático | ✅ | ✅ 2 min (pedidos) / 30 min (estoque) |

---

## 🔒 SEGURANÇA — resolvido em 13/08/2026

Antes desta data o banco estava aberto para a internet e, pior, **qualquer
pessoa virava admin**. As duas coisas foram fechadas e verificadas ao vivo.

### A escalada de privilégio (era o pior, e não estava documentado)

A cadeia, toda executável de fora sem nenhuma credencial:

1. A chave `sb_publishable_...` está dentro do bundle JS — pública por
   definição. Com ela, `GET /rest/v1/employees?select=cpf,role&role=eq.admin`
   devolvia nome e CPF dos 5 admins.
2. O login não tinha senha: `signInAnonymously()` dava um JWT a qualquer um.
3. `link_employee_to_user` (SECURITY DEFINER, `EXECUTE` para `anon`) fazia
   `update employees set user_id = auth.uid() where cpf = <o que você mandar>`,
   sem checar nada além de o CPF existir.
4. `authorizePrivilegedUser` autoriza casando `employees.user_id` com o dono do
   token → todas as rotas `/admin/*` do webhook abriam: preço, saldo, reset de
   saldos, disparo de pedido no CIGAM.

De quebra, o passo 3 sobrescrevia o `user_id` do admin de verdade, derrubando
o acesso dele.

**Correção** (`scripts/2026-08-13-login-privilegiado-com-senha.sql`): admin/RH
agora têm usuário real no Supabase Auth (`<cpf>@interno.gostinhomineiro.com` +
senha), `employees.user_id` fixo, e a RPC **recusa** vincular conta admin/RH.
Ver "Login de admin/RH" abaixo.

### A leitura pública

`scripts/2026-08-13-fecha-leitura-publica.sql`. O que estava legível de fora,
confirmado com a chave do bundle: `employees` (255 linhas com CPF e papel),
`employee_wallet_view` (255 CPFs + crédito mensal), `orders` (358 pedidos com
nome e CPF), `order_items` e `employee_monthly_spend`.

⚠️ **A pegadinha era a view.** `employee_wallet_view` é
`SELECT id, cpf, credito_mensal_cents FROM employees` **sem WHERE**, e como view
sem `security_invoker` rodava como postgres — ignorando a RLS da tabela. Fechar
`employees` sem tratar a view não teria adiantado nada. Hoje ela é
`security_invoker = true` e herda as policies.

Agora: `anon` (quem não logou) não lê nada disso; `authenticated` lê só o que é
seu; admin/RH leem tudo via `is_privileged_user()`.

**`is_privileged_user()` existe porque `is_admin()` não serve**: `is_admin()`
consulta `employees` e **não** é SECURITY DEFINER, então dentro de uma policy de
`employees` ela recursiona. Era o mesmo defeito de `employees_select_rh`
(`EXISTS (SELECT 1 FROM employees ...)`), que dava
`infinite recursion detected in policy for relation "employees"` no instante em
que a catch-all `USING (true)` saísse da frente. As 14 policies antigas de
`employees` (4 catch-alls, 2 recursivas, 2 apontando para a tabela vazia
`hr_users`, 2 via `is_admin()`) foram trocadas por duas: `employees_self_select`
e `employees_privileged_select`.

O que continua funcionando por serem SECURITY DEFINER (ignoram RLS):
`place_order_with_wallet_v2`, `gm_apply_balance_delta`, `handle_wallet_on_orders`
e `get_employee_by_cpf`. O webhook usa service role, que também ignora RLS.

### Login de admin/RH — cada um cria a própria senha (17/08/2026)

**Não existe mais senha padrão.** O `12345678` foi invalidado nas 7 contas por
`scripts/reset-primeiro-acesso.ts`, que troca a senha por uma aleatória de 48
caracteres que ninguém anota — o objetivo não é distribuir, é fazer a antiga
parar de funcionar. As contas ficam com `must_change_password: true`.

Na tela: digita o CPF →
- **nunca acessou** → cai direto em "Crie sua senha" (`#nova-senha` +
  `#confirma-senha`), sem pedir senha anterior;
- **já criou senha** → aparece o campo `#senha` normal.

Quem decide qual dos dois é o webhook (`GET /automation/primeiro-acesso?cpf=`),
porque a flag mora no metadata do Auth e o navegador não lê isso sem estar
logado. A criação em si é `POST /automation/primeiro-acesso {cpf, senha}`, que
usa a service role para gravar a senha e derrubar a flag.

⚠️ **Esse POST é público, e isso é uma decisão de produto, não um descuido.**
O CPF é público, então enquanto uma conta não tiver senha, quem souber o CPF
dela pode criar a senha e virar admin. Foi apresentado ao Winiston em 17/08/2026
com duas alternativas fechadas (código único por pessoa, entregue individual; ou
liberação de janela pelo painel) e ele escolheu o acesso aberto assim mesmo.

O que limita o estrago:
- **A janela fecha sozinha, conta a conta.** Criada a senha, `must_change_password`
  vira false e o CPF sozinho não abre mais nada — o `POST` passa a devolver
  `409`. Por isso a pressa em fazer os 7 acessarem é o controle de risco real.
- **Todo primeiro acesso vira log** em `admin_operation_logs` (action
  `first_access`) com IP e user agent. Não impede a conta ser tomada; permite
  ver que foi, e por quem.
- Vale só para admin/RH que ainda não acessaram; funcionário comum nem passa
  por aqui.

Se um dia se quiser fechar isso, o menor caminho é deixar o `POST` exigir um
código por pessoa — a rota já isola tudo num lugar só.

Validado de ponta a ponta em 17/08/2026, com admin sintético e navegador real:
CPF novo → "Crie sua senha" → `/admin`; senhas divergentes e senha curta
recusadas; segundo acesso passa a pedir senha; senha errada recusada; senha
certa entra; `POST` repetido devolve `409`; log gravado com IP.

Funcionário comum **não mudou**: continua entrando só com CPF (decisão do
Winiston, 13/08/2026). O risco que sobra é conhecido: quem souber o CPF de um
colega entra como ele e gasta o saldo dele.

## ✅ Escrita fechada em 12/08/2026

`anon` **não escreve mais** em `products`, `employees` e `notices` — só `SELECT`.
Confirmado de fora, pela URL pública, com a chave do bundle:

```
PATCH .../employees  {"credito_mensal_cents":999999}  -> 42501 permission denied
PATCH .../products   {"employee_price":0.01}          -> 42501 permission denied
```

Isso fecha os dois buracos de dinheiro: dar saldo a si mesmo e mudar preço.
`TRUNCATE`/`DELETE` também foram revogados em orders, order_items, employees,
notices, profiles e admin_operation_logs.

**A ordem importou:** as telas de Admin/RH foram migradas para o webhook e
publicadas ANTES do revoke. Revogar primeiro derrubaria o admin.

`orders` e `order_items` mantêm `INSERT`/`UPDATE` de propósito — é o checkout do
funcionário que grava ali, e o login é por CPF (sem `auth.uid()`), então não há
como escopar por RLS hoje. É o que sobra do problema, junto com a leitura.

Verificado depois do revoke: salvar produto pela tela devolveu `PATCH 200`, e um
pedido de funcionário foi ao CIGAM sozinho (`011856`, sem aviso).

### Ainda aberto

- **Funcionário comum entra só com CPF.** Decisão do Winiston. Quem souber o CPF
  de um colega entra como ele e gasta o saldo dele. O CPF não vaza mais pela API,
  mas circula em crachá, folha e planilha.
- **A coluna `auth_user_id` é lixo** — é NULL para todo mundo, inclusive os
  privilegiados. O vínculo real sempre foi `user_id`. As policies que olhavam
  `auth_user_id` foram removidas; a coluna ficou. `hr_users` também está vazia e
  sem uso.
- `products` e `profiles` **não** foram fechados nesta rodada. `products` é
  catálogo (o funcionário precisa ler), mas `employee_price` fica exposto;
  `profiles` não foi auditado.

O gatilho de `scripts/2026-08-12-bloqueia-alteracao-credito.sql` **não é mais
necessário** — o revoke de `UPDATE` em `employees` resolveu o mesmo problema de
forma mais direta. O arquivo fica como plano B, caso algum dia `anon` precise
voltar a escrever na tabela por outro motivo.

`scripts/2026-08-12-seguranca-rls.sql` foi superado por
`scripts/2026-08-13-fecha-leitura-publica.sql`. Trate o de 12/08 como histórico.

ℹ️ A migração das telas de Admin/RH para o webhook **deixou de ser urgente**: com
admin/RH autenticados de verdade, deu para escopar por RLS sem reescrever tela
nenhuma. Continua sendo o desenho mais limpo a prazo (o **PDV é o modelo**: lá o
browser só fala com o `server/`, com `requireAuth` e sessão), mas agora é
arquitetura, não buraco.

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

### O PWA agora se atualiza sozinho (18/08/2026)

**Sintoma que revelou o problema:** um admin tentou o primeiro acesso e recebeu
"Esta conta exige login com senha", sem jeito de criar a senha. A mensagem não
existe no app — vem do `raise exception` dentro de `link_employee_to_user`
(`scripts/2026-08-13-login-privilegiado-com-senha.sql`). Ou seja, o navegador
rodava JS **anterior a 13/08**, que chamava aquela RPC para todo mundo, contra o
banco novo, que já barra admin/RH ali. Backend e bundle publicado estavam certos
o tempo todo.

**Causa:** o `sw.js` gerado já fazia `skipWaiting()` + `clientsClaim()`, então o
service worker novo assumia na hora — mas isso **não recarrega a página**, e a
aba seguia executando o JS que já estava na memória. Medido com dois builds
servidos de verdade: com uma recarga a página continuava na versão velha, e só
a **segunda** trazia a nova. Ninguém descobre isso sozinho.

**Correção:** `public/sw-auto-reload.js` (injetado no `sw.js` por
`workbox.importScripts`) chama `client.navigate()` nas janelas abertas quando o
worker novo ativa. Funciona **de dentro do service worker** de propósito: o
navegador re-executa o `sw.js` a cada visita, então isso alcança até quem está
preso num bundle que não conhece esta correção — não precisa de aba anônima nem
de limpar cache. `src/lib/swUpdates.ts` é a rede de segurança do lado do app
(`controllerchange` + `registration.update()` a cada 30 min e ao voltar do
segundo plano, que é o caso do celular).

Só recarrega em **atualização**, nunca na primeira instalação — a trava é
`registration.active` no `install`, gravada num cache porque o worker pode ser
desligado entre `install` e `activate`. Sem ela, todo visitante novo levaria um
reload sem motivo. Recarregar é seguro porque carrinho, sessão e filtros moram
no `localStorage`.

Validado em navegador real: sem a correção a página fica na versão antiga depois
de 1 recarga; com ela, atualiza sozinha; instalação limpa não recarrega; e não
há loop (depois do reload não existe nova ativação de worker).

⚠️ **`npm ci` não roda neste repo** — o `package-lock.json` está fora de sinc com
o `package.json` (faltam os pacotes do esbuild `0.28.2`). O fluxo de deploy
descrito acima diz `npm ci`; use `npm install` até o lockfile ser regerado.

## Testes

`npm test` (vitest, roda em Node — a lógica coberta é pura, não precisa de DOM).
Cobre `src/**/*.test.ts` e `automation/**/*.test.ts`.

O que está coberto é deliberado: as três lógicas que já custaram dinheiro ou
tempo — `pricing` (preço/kg × peso, que errou duas vezes em produção), `stock`
(a assimetria do fail-open) e `efetivacaoConcluiu` (o `success:false` do CIGAM
que é sucesso). São os pontos onde um "conserto" bem-intencionado quebra dinheiro
de funcionário sem ninguém perceber.

O projeto irmão (PDV) tem 24 arquivos de teste e é a referência de para onde
isto deve crescer — lá cada armadilha do CIGAM virou teste.

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

### Quais pedidos a varredura pega — e o buraco que isso tapa

O filtro é `erp_status = PENDING` + não cancelado + **um de três sinais de
pagamento**: `wallet_debited`, `pay_on_pickup_cents > 0` ou `wallet_used_cents > 0`.

O terceiro não é redundância. **`wallet_debited` não é escrito pelo RPC de
pagamento** (`place_order_with_wallet_v2`): quem escreve é um `.update()`
separado no `Checkout.tsx`, numa segunda chamada de rede, e o erro dele é apenas
logado — `clearCart()` roda em seguida e o funcionário vê sucesso de qualquer
jeito. Se esse update falha, o saldo **já foi debitado** pelo RPC e o pedido fica
com `wallet_debited = false`.

Enquanto existia pagamento na retirada isso era mascarado: o pedido ainda casava
por `pay_on_pickup_cents > 0`. **Em 12/08/2026 o pagamento na retirada saiu do
sistema** (decisão do Winiston — agora é só saldo), então esse valor é sempre 0 e
o pedido ficaria `PENDING` para sempre: dinheiro debitado do funcionário e nada
no ERP, sem ninguém perceber.

`wallet_used_cents` fecha o buraco porque o RPC o grava na **mesma transação** em
que debita `employees.credito_mensal_cents`: se o saldo saiu, o campo está lá.

⚠️ **A causa raiz continua de pé no frontend:** o `Checkout.tsx` deveria falhar
alto quando esse `.update()` não grava, em vez de só logar no console. Melhor
ainda seria o próprio RPC setar `wallet_debited`, acabando com a escrita em duas
etapas. Nenhum dos dois foi feito — o filtro é rede de segurança, não conserto.

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

### A tela se recarrega sozinha (18/08/2026)

Pergunta do Winiston que revelou isto: *"se eu ficar com o site aberto 3 dias,
como vai atualizar o estoque?"* Resposta de então: **não atualizava.** O
`useEffect` que carrega os produtos tinha lista de dependências vazia — rodava
no mount e nunca mais. Numa aba deixada aberta, `stock_qty` e `employee_price`
ficavam congelados no instante da abertura, por dias. O sync de 30 min
continuava certo no servidor; o dado é que não tinha como chegar até a aba.

**O estoque tinha rede, o preço não.** Item esgotado ainda era barrado pela
reconsulta ao vivo do checkout, então nenhum pedido errado chegava ao CIGAM — o
custo era o funcionário montar o carrinho e só levar o "não" no fim, e o
inverso, silencioso: item que voltou ao estoque seguia como "Indisponível" e
ninguém reclama de venda que não aconteceu. **Preço é pior**: o valor do pedido
sai de `getUnitPrice(item.product)` (`src/services/orders.ts:76`), sobre o
produto que está no navegador. Um reajuste do RH não alcançava a aba aberta, e o
pedido era gravado pelo preço velho, sem nada para barrar.

Hoje o catálogo se recarrega quando a aba volta a ficar visível (ou recebe
foco), com piso de 1 min entre buscas, e a cada 10 min enquanto visível. É só
leitura no Supabase — **não encosta no CIGAM**, então não disputa sessão com o
PDV, que é a restrição que obriga o sync de estoque a ser espaçado.

O cache do `localStorage` passou a guardar a hora (`{ ts, produtos }`) e vale 30
min: passado isso ele não pinta mais a tela, porque abrir o app mostrando preço
de dias atrás como se fosse de agora é o mesmo defeito de novo. O formato antigo
(array cru, sem hora) continua sendo lido, mas sempre como vencido.

Validado em navegador real (Playwright): foco dentro da trava não busca de novo,
foco depois da trava busca, a tela sobrevive à recarga silenciosa, e os quatro
estados de cache (recente, de 3 dias, formato antigo, corrompido) se comportam
sem quebrar a tela.

⚠️ **O carrinho continua com cópia própria dos produtos.** Item já adicionado
mantém o preço de quando entrou, mesmo depois da recarga. O conserto de raiz é o
preço do pedido sair do banco, não do navegador — o que de quebra fecha o fato
de `order_items` ainda aceitar `INSERT` de `anon`, ou seja, hoje o navegador
dita o preço. Não foi feito: muda o que a pessoa vê depois de já ter escolhido,
e é decisão do Winiston.

### Armadilhas do `Disponibilidade/Buscar` (todas confirmadas ao vivo)

- A resposta **não** usa o envelope `{success, messages, data}` — o corpo já é o
  objeto.
- `EstoqueGeral` vem com colunas genéricas `CampoNNN` (`Campo4` = empresa,
  `Campo6` = material, `Campo133` = físico), não com os nomes do `/api/help`.
- `DisponibilidadeGeral` **ignora** a unidade de negócio pedida e soma todas as
  empresas do centro. Quem varia por empresa é o `EstoqueGeral`.
- O endpoint aceita **um material por chamada**, e a concorrência é **1 de
  propósito** (`CONCORRENCIA_DISPONIBILIDADE`). Concorrência alta não acelera:
  faz o CIGAM devolver linha vazia, e cada vazia vira material desconhecido. O
  PDV mediu ao vivo (`catalogCache.ts`): concorrência 3 → 9 OK/1 falha,
  concorrência 10 → 3 OK/7 falha, serial → zero erros a ~197ms cada. **E serial
  não é mais lento**: a passada concorrente terminava rápido mas empurrava a
  maior parte do catálogo para o retry serial, que gastava o mesmo tempo de
  qualquer jeito — mesma parede, mais erro, mais material desconhecido no fim.
- Isso já mordeu aqui. Enquanto a concorrência era 8: em 06/08/2026 a primeira
  passada deixou **141 de 172** sem resposta, e em 12/08/2026 uma rodada
  terminou com **49 sem linha mesmo depois do retry**. Com serial + repasses, o
  resultado ficou em **1 sem linha** (que é ausência real), em ~64s para 172
  materiais. O sync roda de 30 em 30 min, então é ~4% de ocupação.
- **Não remover os repasses.** Eles repetem só o que faltou e param assim que
  uma passada não recupera mais nada — material que não voltou nem sozinho e
  sem pressa provavelmente não tem estoque cadastrado mesmo, e insistir só gera
  carga.
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

## Lista de separação impressa na portaria (18/08/2026)

> ⚠️ **24/08/2026 — o disparo automático está DESLIGADO, de propósito.** Quem
> imprime e entrega é o **faturamento**, em duas vias (uma pro RH, uma pra
> portaria), pelo botão da tela — era assim que funcionava antes deste sistema
> existir, e o Winiston voltou a esse fluxo. Ver "Duas vias" e "O disparo
> automático" logo abaixo. O resto desta seção (corte das 13:40, quais pedidos
> entram, idempotência) **continua valendo**: é a mesma seleção de pedidos, só
> muda quem manda pro papel.

A câmara fria só separa pedido de funcionário até as 13:40. Antes disso era só
um aviso na tela do Checkout (`isAfterSeparationCutoff`) — o pedido das 15h
entrava no CIGAM e era efetivado igual ao das 9h, sem nenhum rastro pra quem
separa. Hoje `automation/print/portariaList.ts` monta uma folha por pedido pago
e ainda não impresso — folhas separadas, porque a câmara fria grampeia cada uma.

### Duas vias: RH e portaria (24/08/2026)

O faturamento imprime **duas cópias de cada folha**: uma vai pro RH (que
arquiva, mesmo tendo o pedido no sistema) e a outra pra portaria (que separa a
mercadoria e colhe a assinatura). A via aparece na ponta direita da faixa preta
do topo — `VIA RH` / `VIA PORTARIA`.

**A ordem das páginas é o requisito, não um detalhe:** o PDF sai em **blocos**
— todos os pedidos marcados `VIA RH`, depois todos de novo marcados
`VIA PORTARIA`. Uma impressão só devolve duas pilhas prontas: corta no meio e
entrega. Intercalar (RH, portaria, RH, portaria…) obrigaria a folhear o bolo
inteiro separando folha a folha.

Quem quiser mexer nisso: a ordem é construída por `sequenciaDeFolhas`
(`automation/print/pdfBuilder.ts`), separada do desenho de propósito — o pdfkit
embute a fonte como subconjunto e escreve o texto como índice de glifo, então
**o nome do funcionário não existe como texto legível dentro do PDF gerado** e
não dá pra afirmar a ordem lendo o arquivo. O teste olha a sequência como dado.

A impressão avulsa (um pedido só, na tela de Admin Pedidos) sai nas **mesmas
duas vias**: é o caminho de recuperação (folha atolou, pedido entrou depois da
leva) e nesse caso os dois lados precisam da cópia igual.

O caminho que imprime **direto** numa impressora (`printPortariaList`, hoje
desligado) continua saindo em **via única marcada `VIA PORTARIA`** — lá não
existe ninguém no meio pra entregar a segunda via, ela só ficaria esquecida na
bandeja.

### O disparo automático (desligado desde 24/08/2026)

O código continua inteiro e testado; o que o desliga é a ausência de
`PORTARIA_PRINTER_HOST` no `.env` (está comentado lá, backup em
`.env.bak-20260824-portaria`). Com ele apagado o webhook loga
`🖨️ Lista da portaria desligada` no boot — **isso é o estado esperado**, não
um erro de configuração. Religar é descomentar a linha e reiniciar o `webhook`.

⚠️ Se um dia religar: a impressora real da portaria (`192.168.100.53`) estava
**sem resposta na porta IPP 631** em 24/08 — confirme que ela voltou antes.

**O CIGAM não muda.** Continua entrando em até 2 minutos, como sempre — só a
impressão passa a ser agrupada e no horário certo. Spec completa:
`docs/superpowers/specs/2026-08-18-lista-portaria-design.md`.

### Como funciona sem precisar de "já rodou hoje"

O disparo (`PORTARIA_PRINT_INTERVAL_MS`, mesmo padrão do `CIGAM_AUTO_SYNC_INTERVAL_MS`)
roda de tempos em tempos o dia inteiro, mas só faz algo quando `isBusinessDayInSaoPaulo`
e `isAfterCutoffInSaoPaulo` (`automation/holidays.ts`, `automation/print/cutoff.ts`)
são verdadeiros — e mesmo aí, só imprime pedido com `created_at` **antes** do
instante de hoje às 13:40 (`cutoffInstantForToday`). Pedido feito às 17h não é
alcançado por essa checagem: simplesmente espera o corte de amanhã, sem
lógica extra. E como esse instante não muda dentro do mesmo dia, reexecuções
(porque a impressora falhou às 13:40) pegam exatamente o mesmo conjunto —
idempotente e retry-safe sem precisar de flag de "já rodou".

### Dia útil = calculado, não cadastrado

Feriado nacional é fórmula (datas fixas + as que derivam da Páscoa pelo
algoritmo de Gauss), correta para qualquer ano sem manutenção. Só os locais
(municipal de Ituiutaba, ponto facultativo, recesso) exigem atualização manual,
em `FERIADOS_LOCAIS` (`automation/holidays.ts`) — uma vez por ano. Esquecer um
não é grave: a rotina não roda naquele dia e os pedidos entram na lista do
próximo dia útil sozinhos.

### Impressão: porta o módulo já validado no PDV

`automation/print/printClient.ts` é o mesmo módulo de
`pdv-gostinho-mineiro/server/src/print/printClient.ts` (conversão PDF→PostScript
via `cupsfilter`/`pdftops`, confirmação real de que o job terminou via
`Get-Job-Attributes` — `Print-Job` sozinho só confirma que a impressora
RECEBEU o arquivo). Diferença: 1 via por folha aqui (lá são 2, decisão própria
da loja), `job-name` diferente.

### Layout: igual ao cupom do PDV, de propósito (18/08/2026, revisado com o Winiston)

O desenho original desta folha (`automation/print/pdfBuilder.ts`) era
minimalista — nome e itens, sem preço. Depois de ver impressa, o Winiston
pediu pra ficar igual ao cupom do PDV: é o mesmo tratamento que o PDV já dá a
venda na tabela de preço "005" (Funcionários) — lá a única diferença é o nome
vir prefixado "FUNCIONÁRIO - " (`formatReceiptCustomerName`, em
`receiptPdf.ts`). Aqui replicou o resto da folha também.

A folha final tem: cabeçalho com logo + caixa "Pedido" (mostra o número do
CIGAM — `erp_external_id` — quando já sincronizado, senão o interno), faixa
preta "PEDIDO DE FUNCIONÁRIO — SEPARAÇÃO INTERNA" (diferença proposital do
PDV: aqui nunca passou por caixa, foi o próprio funcionário que pediu no
catálogo, então precisa ficar óbvio de onde a folha veio), nome do
funcionário em destaque, Data do Pedido / Forma de Pagamento ("Desconto em
Folha", fixo — é a única forma que existe aqui), tabela zebrada
Cód./Produto/Qtde/Peso/Pr. Unit./Total, caixa de TOTAL e linha de assinatura
"FUNCIONÁRIO / GOSTINHO MINEIRO".

⚠️ **"Pr. Unit." mostra o preço do PACOTE, não R$/kg como no PDV.** É assim
que `order_items.unit_price` já vem calculado (`getUnitPrice` em
`src/lib/pricing.ts` — preço/kg × peso, decidido no checkout). Mostrar R$/kg
aqui exigiria reverter essa conta só pra tela, e quebraria a conferência
óbvia "Pr. Unit. × Qtde = Total" que a folha existe pra dar de bandeja. Não
"consertar" isso pra bater com o PDV — são modelos de preço diferentes de
propósito, documentado também no topo do `pdfBuilder.ts`.

Peso e quantidade saem em negrito e fonte maior (12pt vs 9,5pt do resto da
tabela) — pedido do Winiston, são os dois números que quem separa precisa
achar de relance. Zebra mais escura que o `#EFEFEF` original do PDV (aqui é
`#E0E0E0`): no papel impresso a versão clara quase não se distinguia do
branco da linha ao lado — outro ajuste feito olhando a folha física, não só o
código.

Validado com **8 impressões reais** na impressora de teste da sala
(`192.168.100.142`), do Mac de desenvolvimento — nesse dia o Mac estava
fisicamente na rede da loja, então alcançou a impressora direto. **Isso não é
garantido em toda sessão de dev**: a regra de ouro continua sendo a do topo
deste arquivo — mexer neste projeto é trabalho de servidor. O teste de hoje
foi uma exceção de oportunidade, não o fluxo esperado.

### Env vars

Hoje **`PORTARIA_PRINTER_HOST` está comentado** no `.env` — é o que mantém o
disparo automático desligado (ver acima). O `PORTARIA_PRINT_INTERVAL_MS`
continua lá e não faz nada sozinho.

Para religar algum dia:

```
PORTARIA_PRINTER_HOST=192.168.100.142      # começar SEMPRE pela impressora de teste
PORTARIA_PRINT_INTERVAL_MS=300000          # 5 min — só dispara de fato às 13:40
```

Só depois de validado na de teste, troca para `192.168.100.53` (a impressora
real da portaria) e reinicia o `webhook`.

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

## Validações já feitas (17/08/2026)

- **Pedido de teste `012920`** criado por REST puro (`test-pedido.ts`), depois
  da rodada do primeiro acesso, para confirmar que a integração continuava
  íntegra. Lido de volta do CIGAM: cliente `009752`, unidade `001`, condição
  `260`, controle **30 (Liberado)**, `Inconsistente: false` e
  `TotalPedido`/`TotalFaturamento`/`TotalMercadoria` = 20,15 (prova de que o
  `CalcularImposto` rodou). Parou no controle 30 de propósito: **não foi
  efetivado e não emitiu documento**.
  ⚠️ **Excluir no CIGAM** — é pedido de teste, e a observação dele diz isso.

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
- ~~Usuário de integração dedicado no CIGAM.~~ **Feito em 24/08/2026:**
  `SIST.FUNC` aqui, `PDV.GM` no PDV — acabou o conflito de sessão. Fica de
  pendência **trocar a senha** dos dois: nasceram com `12345678`.
- **Linha "Alho Em Creme" (OMG) fora do catálogo desde 06/08/2026.** Decisão do
  usuário: passa a ser vendida só na loja. Os 8 produtos da linha estão com
  `is_hidden = true` (as 4 bisnagas de 1,01kg já estavam; os 4 potes de 200g
  foram ocultados nessa data, direto no banco). Não foram excluídos — reverter é
  só voltar `is_hidden` para false, mas **resolver antes o preço divergente**
  (temos R$ 25,00, CIGAM tabela 005 diz R$ 250,00 — ver PARTE 2D do SQL).
  ⚠️ Não confundir com os 3 salgados que têm "alho" no nome e **continuam à
  venda**: Kibe c/ Creme de Alho 3kg, Salgado Festa Kibe c/ Creme de Alho e
  Salgado Festa Risole de Alho.
- **Produto sem `cigam_code` derruba o pedido INTEIRO**, não só a própria linha:
  `buildItens` (`process-pending-orders.ts:150`) lança
  `Produto sem código CIGAM` no primeiro item sem código, e o pedido vira
  `ERROR` — com o saldo do funcionário **já debitado** no checkout.

  ⚠️ Em 13/08/2026 o `Pão de Queijo Gourmet – Pacote 1kg` (R$ 17,70) estava
  **visível e comprável** sem código. Não era teórico: `isOutOfStock`
  (`src/lib/stock.ts`) é **fail-open**, então `stock_qty` nulo aparece como
  disponível. Foi ocultado (`is_hidden = true`). Hoje há **0 produtos visíveis
  sem `cigam_code`** — vale conferir isso depois de qualquer carga de produto:

  ```sql
  SELECT name FROM public.products
   WHERE cigam_code IS NULL AND COALESCE(is_hidden,false) = false;
  ```

  Os outros 8 sem código são a linha Alho OMG, já oculta.
- **Dois produtos com o nome errado** (não corrigido — decisão comercial):
  `Pão Francês Integral 12 Horas 70g – Pacote 6kg` (`002006000017`) e o de
  6 Horas (`002006000016`) dizem "Pacote 6kg" mas têm `weight = 7`. O peso 7 é
  o **correto** (correção de 06/08 contra a tabela 005); quem está errado é o
  nome. O funcionário lê "6kg" e paga R$ 44,80 por 7kg.
- `Gostinho Gostoso Risole de Carne Seca com Mandioca 30g – Pacote 3kg`
  (`002003000030`) tem código, mas o CIGAM nunca devolveu saldo para ele — é o
  "1 sem linha" dos logs de sync. Pode ser código que não existe no ERP.
- **A multiplicação de KG nunca rodou em produção**, mas foi **conferida contra o
  PDV em 13/08/2026** e está correta. Os 4 pedidos reais até aqui foram todos de
  peso 1 ou PCT; os 64 produtos com peso 2–7 seguem sem exercitar o caminho
  contra o CIGAM de verdade.

  As duas implementações chegam no mesmo lugar por caminhos diferentes — vale
  saber disso antes de "consertar" uma para parecer com a outra:

  | | PDV (`cigamQuantity`, orderService.ts) | Catálogo (`buildItens`) |
  |---|---|---|
  | o item guarda | preço **por kg** | preço **do pacote** (kg × peso) |
  | manda ao CIGAM | `unitPrice` direto | `unit_price ÷ peso` |
  | quantidade | `qtd × peso`, `.toFixed(3)` | `qtd × peso`, `.toFixed(3)` |

  O CIGAM recebe preço-por-kg × quantidade-em-kg nos dois casos.

  O `.toFixed(3)` foi copiado do PDV em 13/08/2026: peso fracionário estraga o
  float. Os pesos em uso hoje (1, 2, 3, 3.5, 5, 7) são limpos, mas a linha Alho
  OMG é de **1,01kg** e `3 × 1.01` dá `3.0300000000000002`. Coberto por teste em
  `automation/cigam/process-pending-orders.test.ts`.
- ~~Painel/retry de erros de integração~~ — **feito em 13/08/2026**, ver "Painel
  de integração CIGAM".
- ~~Os 56 pedidos `erp_status = 'ERROR'`~~ — **apagados em 13/08/2026** a pedido
  do Winiston (`scripts/2026-08-13-apaga-pedidos-erro.sql`), junto com seus 177
  itens. Eram todos da era Saibweb (18/04 a 09/07), nenhum com
  `erp_external_id`, ou seja, nenhum existia no CIGAM.
  Backup em `~/backup-pedidos-20260813.sql` (dump dos 358 pedidos + 1019 itens
  ANTES do delete — restaura os apagados se precisar).
  Saldo de ninguém mudou: o trigger `handle_wallet_on_orders` só existe em
  INSERT/UPDATE, e nenhum dos 56 caía no ciclo corrente (2026-07).
  Fica inconsistente só o histórico: as linhas de `employee_monthly_spend` de
  maio/junho ainda contam gasto cujos pedidos não existem mais.
  **Sobraram 302 pedidos**: 278 SYNCED + 20 DISCARDED + 4 DONE.
- ~~Limpeza dos restos do Saibweb~~ — **feita em 13/08/2026**
  (`scripts/2026-08-13-limpeza-saibweb.sql`). Removidos:
  `orders.saibweb_status` e `orders.saibweb_error` (ambas 0 de 358 preenchidas),
  a tabela `saibweb_jobs` (0 linhas), `cigam_order_code_seq` (nunca usada,
  `is_called = false`), `next_cigam_order_code()` e `products.saibweb_code`.
  Esta última tinha **180 de 181 preenchidos** — backup em
  `~/backup-saibweb-code-20260813.csv` antes do drop.
  Conferido depois: 358 pedidos / 181 produtos / 255 funcionários intactos,
  telas de funcionário e de admin funcionando.
- **O totem-loja NÃO usa este banco.** O CLAUDE.md antigo dizia só que ele
  "ainda usa Saibweb", o que dava a entender risco compartilhado. Ele aponta
  para outro Supabase (`jsltcdtwdeemwchfyylk.supabase.co`), então a limpeza aqui
  não o afeta.

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
  automation/cigam/*.ts automation/operations-webhook.ts \
  automation/print/*.ts automation/holidays.ts automation/types/*.d.ts
```

Rodando **fora** do servidor, sobrescrever `SUPABASE_URL` para o domínio público
(o padrão do `.env` é `127.0.0.1:54321`, que só existe aqui):

```bash
SUPABASE_URL=https://apifuncionarios.gostinhomineiro.com npm run cigam:pending
```
