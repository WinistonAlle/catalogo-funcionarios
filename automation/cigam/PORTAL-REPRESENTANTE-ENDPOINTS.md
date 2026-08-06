> ⚠️ **HISTÓRICO.** Estes endpoints MVC não são mais usados: desde 06/08/2026 o
> pedido é criado por API REST pura (ver `client.ts`). O único pedaço do portal
> que sobrevive é o login por form POST, e só para obter o `CGPortal_Token`.

# Portal do Representante CIGAM — engenharia reversa do fluxo de pedido

> Capturado em 13/07/2026 navegando o portal
> `https://gostinhomineiroportais.cigam.cloud/portalrepresentante/`
> com o usuário `winiston.a`. Pedido de teste gerado: **003429** (marcado
> "TESTE CLAUDE - PODE EXCLUIR" — apagar no ERP).

## Achado principal

**O portal do representante NÃO usa a API REST (`/api/api/...`) que a nossa
integração (`automation/cigam/client.ts`) usa.** São dois backends distintos:

| | Portal do Representante | Nossa integração |
|---|---|---|
| Backend | App **ASP.NET MVC** interno (`/portalrepresentante/...`) | API REST pública (`/api/api/Pedido/Salvar`) |
| Auth | **Cookie de sessão** (login form) + `__RequestVerificationToken` (antiforgery) | Bearer hash (login/hash) |
| Formato | `application/x-www-form-urlencoded` (form do navegador) | JSON |
| Salvar pedido | POST do formulário inteiro | `POST Pedido/Salvar` |

Consequência: o portal funcionar **prova que o dado/ERP está OK** (cliente 5,
produtos, condição 260, tabela, centro 001), mas ele **nunca toca no endpoint
REST que retorna 500**. Por isso o portal salva e a nossa API não — são caminhos
separados. O 500 continua sendo bug de parametrização do módulo Portais Web API
(no lado do CIGAM), não algo que o portal contorne.

## Fluxo completo (o que o portal faz para lançar um pedido)

### 1. Login
`POST /portalrepresentante/` (form: usuário + senha) → cria **cookie de sessão**.
Todas as chamadas seguintes usam esse cookie. Cada tela renderizada embute um
`__RequestVerificationToken` (hidden) que precisa ir junto em todo POST.

### 2. Abrir cadastro de pedido
`GET /portalrepresentante/fa/pedido/cadastro/c/` → HTML do formulário (mode=c = create).

### 3. Selecionar cliente (dispara AJAX auxiliares)
- `GET /fa/pedido/_QueryClienteDetalhes/c` — detalhes do cliente
- `GET /ge/TabelaDePreco/_Select` — tabela de preço
- `POST /fa/pedido/ExisteCobranca/`
- `GET /fa/pedido/QueryTipoFreteTransportadora/c`
- `GET /fa/pedido/BuscaRegraPortador/`
- `GET /ge/entrega/BuscarEnderecoEntrega/?codigoEmpresa=5&...`

Selecionar o cliente auto-preenche: Tabela de Preço, Cobrança, Conta, Portador.

### 4. Salvar cabeçalho → **cria o pedido**
`POST /portalrepresentante/fa/pedido/cadastro/c/` (form-urlencoded)
→ redireciona para `/fa/pedido/cadastro/m/<CODIGO>` (mode=m = modify).
No teste gerou o pedido **003429**.

Campos relevantes do payload (form-urlencoded):
```
mode=c
userAction=save
__RequestVerificationToken=<antiforgery>
Cliente.CodigoEmpresa=5
Cliente.Uf=DF
DataPedido=13/07/2026
UnidadeNegocio.CodigoUnidadeNegocio=001
CondicaoPagamento.CondicaoPagamento=260
CondicaoPagamento.FormaPagamento=D
TabelaPreco=002
TipoNota=N
Cobranca.CodigoEmpresa=5
Conta=100101
Portador=G01
Controle.CodigoControle=20      (PEDIDO GERADO)
Situacao=Pendente
TipoFrete=2
Observacao=<texto>
OrigemPedido=2
PercentualDesconto=0
ValorIpi=0,00  TotalPedido=0,00  PesoLiquido=0,00  PesoBruto=0,00
```
> Obs.: números em formato pt-BR (`20,1500`), códigos com padding de espaços
> (`003429      `, `5     `, `002   `).

### 5. Adicionar item
Botão **Itens** → `POST /fa/pedido/cadastro/c/` com `userAction=itens`
→ abre `GET /fa/pedido/cadastroitem/m/<CODIGO>`.

Selecionar o material dispara (auto-preenche Centro Arm=001, Un.Med, Preço da tabela):
- `GET /fa/pedido/_QueryDetalhesMaterial/?value=<codMaterial>&parametersIn=<pedido>;002`
- `GET /FA/quantidade/_QuantidadeInput/?codigoUnidadeMedida=PCT&...`
- `POST /fa/pedido/VerificaPrecoValidadeTabela/`
- `GET /fa/pedido/AtualizaPrecoTabela?codigoMaterial=...&codigoPedido=...&tabelaPreco=002&quantidade=...&valorUnitario=...&centroArmazenagem=001&percentualICMS=20.0000&...`
- `POST /fa/pedido/VerificaUtilizaIdentEspecif/`
- `GET /fa/pedido/BuscaParametrosMaterial/?codigoMaterial=...&unidadeNegocio=001&municipio=BRASILIA&estado=DF&empresa=5`
- `GET /ge/TabelaDePreco/_Select?codigoCliente=5&codigoTabelaDePreco=002&codigoMaterial=...`

### 6. Salvar item
`POST /portalrepresentante/FA/pedido/cadastroitem/` (form-urlencoded)
→ volta para `/fa/pedido/cadastroitem/m/<CODIGO>?seq=1`.

Campos do payload do item:
```
mode=m
userAction=save
__RequestVerificationToken=<antiforgery>
Pedido.CodigoPedido=003429
Pedido.UnidadeNegocio.CodigoUnidadeNegocio=001
Sequencia=1
ClienteCodigoEmpresa=5
CodigoControleItem=20
Material.CodigoMaterial=002003000009
CodigoCentroArmazenagem=001
Quantidade=1
UnidadeMedida=PCT
PercentualDesconto=0,00
PrecoUnitario=20,1500
PrecoOriginal=20,1500
TotalItemLiquido=20,15
TabelaPreco=002
PrazoEntrega=13/07/2026
PrazoProgramado=13/07/2026
```

## Outros endpoints do módulo pedido (do JS da tela)
```
POST /fa/pedido/_DescontosEncargos
POST /fa/pedido/CalcularImposto/
GET  /fa/pedido/_QuerySituacao/
GET  /fa/pedido/BuscaEnderecoEntregaTela/
POST /fa/pedido/BuscaDadosDuplicata/
POST /fa/pedido/BuscaDescricaoEmpresaCobranca/
```

## Implicação para a estratégia de integração

Duas opções para "espelhar o portal":

- **(A) Dirigir o backend MVC** a partir do Node: fazer login form → guardar
  cookie de sessão → ler o `__RequestVerificationToken` de cada tela → postar
  form-urlencoded em `/fa/pedido/cadastro/c/` (cabeçalho) e
  `/FA/pedido/cadastroitem/` (cada item). Funciona (é literalmente o que o
  portal faz), mas é **frágil/não-oficial**: depende de HTML/token e quebra se
  o portal atualizar. Precisaria replicar todos os campos hidden do form.
- **(B) Continuar cobrando a consultoria CIGAM** a corrigir o 500 na Web API
  REST — caminho suportado, que já estava em curso (contrato 3094/26).

Recomendação: manter (B) como principal; (A) só como plano B emergencial se o
CIGAM demorar demais, e ainda assim encapsulado/isolado por causa da fragilidade.
