> ⚠️ **DOCUMENTO SUPERADO — NÃO ENVIAR À CIGAM.**
> O diagnóstico abaixo está **errado**. O 500 não era bug de parametrização da
> CIGAM: o token do login REST autentica sem contexto de empresa, e é isso que
> derruba a gravação. Usando o `CGPortal_Token` (login do portal) como Bearer,
> o `Pedido/Salvar` funciona normalmente — validado em produção em 06/08/2026
> (pedido 010329). Mantido só como registro da investigação.

# Relatório de erro — API REST Portais Web (Pedido/Salvar retorna 500)

**Cliente:** Gostinho Mineiro
**Contrato:** 3094/26 — release 251103.d
**Instância:** https://gostinhomineiroportais.cigam.cloud (cloud, gerida pela CIGAM)
**Usuário de teste:** `winiston.a`
**Data da coleta:** 13/07/2026

---

## Resumo

Estamos integrando nosso sistema de pedidos ao ERP via **API REST Portais Web**
(`/api/api/...`). O endpoint **`POST comercial/fa/Pedido/Salvar` retorna HTTP 500
"Ocorreu uma falha."** — um erro genérico, sem mensagem de validação.

O mesmo usuário, com o mesmo cliente e os mesmos parâmetros, **cria pedido
normalmente pela tela do Portal do Representante**. Ou seja: os dados e as
permissões do usuário estão corretos; a falha é específica da API REST na
gravação, e o erro genérico indica **exceção não tratada no servidor**.

Como a instância é cloud e só a CIGAM acessa o log da Web API, **pedimos que
verifiquem o log do servidor** no momento da chamada a `Pedido/Salvar` para
identificar a exceção.

---

## O que funciona

| Chamada | Método | Resultado |
|---|---|---|
| `genericos/ge/Login/Autenticar` | POST | **200** — retorna hash ✓ |
| `comercial/fa/Pedido/BuscarPedido` | GET | **200** ✓ |
| `comercial/fa/Pedido/BuscarItensPedido` | GET | **200** ✓ |

> Observação: as **leituras**, que em 10/07/2026 retornavam 500, hoje (13/07)
> retornam 200 — algo mudou no servidor nesse intervalo. Porém a **gravação
> continua com 500** (abaixo). Nota adicional: um pedido criado hoje pela tela
> (nº **003429**, empresa/cliente 5) **não aparece** no `BuscarPedido` da API
> (`codigoPedido=003429` retorna `null`), o que sugere que a API pode estar
> lendo/escrevendo em um contexto de empresa/parametrização diferente do portal.

## O que falha

### Requisição
```
POST https://gostinhomineiroportais.cigam.cloud/api/api/comercial/fa/Pedido/Salvar
Authorization: Bearer <hash da autenticação>
Content-Type: application/json

{
  "Codigo": "TESTE1",
  "CodigoCliente": "5",
  "CodigoTabelaPreco": "005",
  "CodigoCondicaoPagamento": "260",
  "Observacao": "TESTE PODE EXCLUIR",
  "DataPedido": "2026-07-13"
}
```

### Resposta
```
HTTP/1.1 500
{"success":false,"hash":null,"messages":["Ocorreu uma falha."],"data":null,"tipoLogin":null}
```

## Testes que descartam causa no nosso lado (payload / dados)

O 500 se repete **igual** em todas estas variações — sempre
`{"messages":["Ocorreu uma falha."]}`, HTTP 500:

- Sem `CodigoCondicaoPagamento` e com ele (`260`)
- `CodigoTabelaPreco` = `005` e = `002`
- Autenticação sempre OK (hash válido, usado como Bearer)

Já descartado anteriormente (10/07): token expirado, cliente/produto/condição
inválidos. A autenticação e as leituras provam que credencial e sessão estão OK.

## Prova de que os dados/permissões estão corretos (portal funciona)

Com o **mesmo usuário `winiston.a`**, criamos hoje pela tela do Portal do
Representante o pedido **nº 003429**:
- Cliente **5** (CONSUMIDOR), condição de pagamento **260** (À vista dinheiro),
  tabela de preço **002**, unidade de negócio **001**
- Item: material `002003000009` (SALG FESTA KIBE TRADICIONAL PCT), 1 PCT, R$ 20,15

Ou seja, a operação equivalente **funciona pela tela** e falha **somente pela API
REST**.

## O que pedimos à CIGAM

1. **Verificar o log da Web API (server-side)** no momento de uma chamada
   `POST comercial/fa/Pedido/Salvar` — a mensagem "Ocorreu uma falha." é genérica
   e esconde a exceção real (parametrização, permissão de módulo, stack trace).
2. Confirmar se há **parametrização pendente no módulo Portais** para liberar a
   gravação de pedido via API REST (diferente do que já está liberado para a tela).
3. Esclarecer por que um pedido criado pela tela (nº 003429) **não é retornado**
   pela API (`BuscarPedido`) — se é questão de empresa/filial/contexto na
   configuração da integração.

## Contato para reproduzir junto

Podemos reproduzir o erro em conjunto a qualquer momento; a chamada é imediata e
não depende de dados nossos (é a própria API respondendo 500).
