> ⚠️ **RESPONDIDO / HISTÓRICO.** A dúvida central ("dá pra criar pedido pela API
> REST?") foi resolvida em 06/08/2026: dá, desde que o Bearer seja o
> `CGPortal_Token` obtido pelo login do portal. Ver `client.ts` e o CLAUDE.md.

# Handoff CIGAM — dúvidas para o Claude do amigo (sistema que "funciona")

Contexto: duas equipes integrando a MESMA instância CIGAM
(`gostinhomineiroportais.cigam.cloud`, base REST `/api/api/`). O sistema de vocês
está mais adiantado. Precisamos que vocês confirmem alguns pontos, porque do
nosso lado a **criação de pedido pela API REST está travada** e queremos saber se
vocês realmente conseguiram criar pedido — e como.

---

## O que a gente acha que é o problema (nossa hipótese principal)

A sessão da API, para o nosso usuário, autentica **sem empresa**:
```
VariacaoAmbiente = "VW_GERAL"   |   EmpresaLogada = ""   |   Empresa = ""
```
Com isso, TUDO que depende de contexto de empresa retorna **HTTP 500
"Ocorreu uma falha."** — `Pedido/Salvar`, `Pedido/Buscar`, `Padrao/Buscar`,
`Configuracao/Buscar`. O que NÃO depende de empresa funciona (login, `Pessoa/Buscar`,
`Materiais/Buscar`, `PrecosTabela/Buscar`, `Estoque/Buscar` → todos 200).

Nossa suspeita: o `web.config` da Web API mapeia nomes lógicos
(`NL_FAPEDIDO = %CGVARIACAOAMBIENTE%_FAPEDIDO`) para views de variação
(ex. `VW_GERAL_FAPEDIDO`) que **não existem** nesta instância, então qualquer
operação sobre FAPEDIDO estoura no banco. Todos os Grupos de Direitos aqui estão
com o campo "Variação do ambiente" em branco (→ cai no default VW_GERAL).

**Testamos com DOIS usuários independentes (o nosso e o do amigo, JULIO.S) —
os dois dão exatamente o mesmo 500 no `Pedido/Salvar`.**

---

## Fatos que já confirmamos (para vocês não perderem tempo)

- Base correta é `/api/api/` (duplo). Auth via `Login/Autenticar` **e** via login
  do portal (cookie `CGPortal_Token` usado como Bearer) — os DOIS tokens dão
  resultado idêntico (reads 200, pedido 500).
- Schema oficial do `Pedido/Salvar`: obrigatórios só `Codigo` e `CodigoCliente`.
  Item (`SalvarItemPedido`): `CodigoPedido`, `Sequencia`, `CodigoMaterial`,
  `Quantidade`. `PrazoEntrega`/`PrazoProgramado` são "Opcional" no schema, mas o
  portal SEMPRE os envia (default = data do pedido) — no cabeçalho e no item.
- Pela TELA do portal (endpoints MVC `/portalrepresentante/fa/pedido/cadastro/`)
  a criação de pedido FUNCIONA (criamos o pedido 003429). Só a API REST falha.
- Código de cliente é 6 dígitos com zeros à esquerda (ex.: `007619`, não `7619`).

---

## Nossas dúvidas (o que precisamos que vocês respondam)

### 1. Vocês REALMENTE criaram pedido pela API REST? (a pergunta principal)
No doc de vocês, `POST comercial/fa/Pedido/Salvar` está como "⏳ Não testado" e
`Pedido/Buscar` como "❌ 500". Então:
- Vocês já receberam **HTTP 200 / success:true** do `Pedido/Salvar` alguma vez?
- Se sim: **cole a resposta e o pedido gerado**. Se não: confirmem que a criação
  ainda está aberta aí também (isso já nos ajuda muito).

### 2. Como está a sessão de vocês? (o teste que isola o problema)
Rodem o login de vocês e mandem os campos da resposta:
- `VariacaoAmbiente`, `EmpresaLogada`, `Empresa`, `NomeEmpresa`
- Vem **vazio/VW_GERAL** igual ao nosso, ou vem com uma **empresa preenchida**?
  (Se vier com empresa, vocês acharam a chave — nos digam COMO.)

### 3. `Pedido/Buscar` e `FAPEDIDO_P`
- `GET comercial/fa/Pedido/Buscar` retorna 200 ou 500 aí hoje?
- Vocês conseguiram a permissão `FAPEDIDO_P`? Foi o admin do CIGAM que liberou, ou
  resolveu de outro jeito? Mudou o comportamento do 500?

### 4. Variação de ambiente / empresa
- No CIGAM de vocês, o campo **"Variação do ambiente"** (Grupos de Direitos) está
  preenchido com algo (ex.: `EXVW_UN001`) ou em branco?
- O usuário de vocês tem uma **empresa/filial padrão** amarrada? Onde isso foi
  configurado?

### 5. Criação de pedido: REST ou portal MVC?
- Quando vocês falam que "funciona", é **criação de pedido** ou é o **sync de
  leitura** (clientes/produtos/preços/estoque)?
- Se criam pedido, é pela **API REST** (`/api/api/.../Pedido/Salvar`) ou pelo
  **portal MVC** (`/portalrepresentante/fa/pedido/cadastro/`, form + cookie)?

### 6. CalcularImposto e idempotência
- `Pedido/CalcularImposto` é **pré-requisito** obrigatório antes do `Salvar`?
- Tem algum campo de **UUID/id externo** aceito pelo `Salvar` para idempotência?

---

## Resumo em uma linha
Precisamos saber, com evidência: **vocês criam pedido pela API REST de fato?**
E se sim, **como a sessão de vocês tem empresa/variação que a nossa não tem?**
Se vocês também estão presos no mesmo 500, é confirmação de que o bloqueio é
server-side do CIGAM (config de variação de ambiente / views VW_GERAL_*) e o
próximo passo é acionar a consultoria com esse diagnóstico.
