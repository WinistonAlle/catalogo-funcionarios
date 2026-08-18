# Lista de separação impressa na portaria, às 13:40

## Contexto

A câmara fria só separa pedido de funcionário até as 13:40. Hoje isso é só um
aviso na tela do Checkout (`isAfterSeparationCutoff`, `src/pages/Checkout.tsx`)
— o pedido feito às 15h entra no CIGAM e é efetivado igual ao das 9h, sem
nenhum rastro de que devia esperar. Quem separa não tem como saber pelo
sistema o que é de hoje e o que não é.

Decisão do Winiston (18/08/2026): imprimir, na impressora da portaria, uma
folha por pedido — separada porque a câmara fria grampeia cada uma —, uma vez
por dia, às 13:40, com os pedidos acumulados desde a impressão anterior.
**O envio ao CIGAM não muda**: continua em até 2 minutos, como hoje. A única
coisa nova é a impressão, agrupada e no horário certo.

## Como vai funcionar

1. Todo dia, quando o relógio (fuso `America/Sao_Paulo`) passa das 13:40 **e
   é dia útil**, o webhook dispara a rotina de impressão.
2. Ela busca todo pedido pago (mesmo critério de "foi pago" que o processador
   do CIGAM já usa: `wallet_debited`, `pay_on_pickup_cents` ou
   `wallet_used_cents`) que ainda não foi impresso.
3. Para cada pedido, gera um PDF de uma página: nome do funcionário e os itens
   dele (ex.: "Marcelo: 1 Pão de Queijo, 1 Coxinha, 1 Kibe").
4. Manda cada PDF, um de cada vez, para a impressora da portaria via IPP,
   confirmando que o job realmente completou (não só que foi aceito — ver
   "Reaproveitando o PDV" abaixo).
5. Marca o pedido como impresso (`printed_at`). Se a impressão de um pedido
   falhar, ele **não** é marcado — continua na lista da próxima tentativa.

**Dia não útil = a rotina não roda.** Pedido feito num sábado, domingo ou
feriado simplesmente fica sem `printed_at`, e é pego pela próxima execução em
dia útil — como o filtro é "desde a última impressão" (via `printed_at IS
NULL`), nada se perde nem duplica.

## Cálculo de dia útil

- **Fim de semana**: sábado e domingo, sempre.
- **Feriados nacionais**: calculados no código, sem tabela e sem depender de
  serviço externo. São datas fixas (Confraternização, Tiradentes, Trabalho,
  Independência, Nossa Senhora Aparecida, Finados, Proclamação da República,
  Natal) mais as que derivam da Páscoa (Carnaval, Sexta-feira Santa, Corpus
  Christi) — fórmula fechada, correta para qualquer ano, zero manutenção.
- **Feriados locais** (municipal de Ituiutaba, pontos facultativos, recesso):
  uma tabela pequena (`scripts/2026-08-18-feriados-locais.sql` ou uma
  constante no código — a decidir na hora de implementar, sem tela de
  cadastro por ora). O Winiston atualiza uma vez por ano.

Um feriado local esquecido não é catastrófico: a rotina simplesmente não roda
naquele dia (porque ninguém está lá pra receber o papel) e os pedidos entram
na lista do próximo dia útil, sem intervenção manual.

## Retentativa em caso de falha de impressão

Se a impressora estiver offline, sem papel ou fora de rede às 13:40, os
pedidos não são marcados como impressos e a próxima checagem do webhook
(minutos depois, mesmo intervalo curto do auto-sync de pedidos) tenta de
novo sozinha — sem intervenção de ninguém. Assim que a impressora voltar, a
lista sai.

## Reaproveitando o PDV

O projeto irmão (`pdv-gostinho-mineiro/server/src/print/printClient.ts`) já
resolveu, ao vivo, as armadilhas destas impressoras:

- Não aceitam PDF direto por IPP — precisa converter para PostScript
  (`cupsfilter` no Mac, `pdftops` como fallback no Linux).
- `-o media=A4` é obrigatório: sem isso, o PPD assume Letter e a impressora
  pode "completar" o job sem sair papel nenhum, sem erro em lugar nenhum.
- `Print-Job` retornar `successful-ok` não significa que saiu papel — só que
  a impressora recebeu o arquivo. O módulo do PDV faz `aguardarJob` (polling
  de `Get-Jobs` até `job-impressions-completed` bater com o esperado) antes
  de considerar sucesso.

Este projeto **não** tem hoje nenhuma infra de impressão. A ideia é portar
(não importar entre repos) as partes relevantes de `printClient.ts` para
`automation/print/` aqui — conversão PDF→PostScript e envio IPP com
confirmação real — e escrever um gerador de PDF novo e mais simples que o
`receiptPdf.ts` do PDV (que cobre cupom fiscal, formas de pagamento etc., que
não existem aqui). Uma folha por pedido: nome + lista de itens, sem cálculo
de troco nem via fiscal.

## Impressoras

Reaproveitando o cadastro que já existe no Supabase do PDV
(`printer_settings`):

| uso | host |
|---|---|
| **Teste** (todo desenvolvimento e validação) | `192.168.100.142` ("Impressora da Sala") |
| **Produção** (portaria) | `192.168.100.53` |

O host de produção fica em variável de ambiente
(`PORTARIA_PRINTER_HOST`, no `.env` do servidor) — mesmo padrão das outras
configurações do `operations-webhook.ts`. Não é necessária uma tabela própria
de impressoras aqui: há uma só, fixa.

## Banco de dados

Nova coluna em `orders`:

```sql
alter table public.orders add column if not exists printed_at timestamptz;
```

Sem índice dedicado necessário — o volume diário é baixo (dezenas de pedidos,
não milhares) e a consulta já filtra por critério de pagamento antes.

## O que fica de fora, de propósito

- **Painel de acompanhamento das impressões.** Se a retentativa automática se
  mostrar insuficiente na prática, isso pode entrar depois — não construir
  antecipando um problema que ainda não apareceu.
- **Tela de cadastro de feriados locais.** Uma tabela/constante simples
  resolve; tela é o tipo de coisa que se constrói e não se usa.
- **Mudar o momento em que o pedido entra no CIGAM.** Decisão explícita do
  Winiston: CIGAM continua imediato, só a impressão é agrupada.
- **Aviso ao funcionário de que o pedido "aguarda separação".** Fora de
  escopo desta rodada — quem recebe a informação de separação é a câmara
  fria, pelo papel; o funcionário já vê seu pedido normalmente em "Meus
  Pedidos".

## Teste antes de produção

Toda validação roda contra `192.168.100.142` (impressora de testes), nunca
contra `192.168.100.53`, até o fluxo estar confirmado ponta a ponta —
inclusive o caso de falha (impressora desligada) e a retentativa automática.
