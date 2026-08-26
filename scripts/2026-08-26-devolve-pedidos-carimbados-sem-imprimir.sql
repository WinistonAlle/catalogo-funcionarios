-- 2026-08-26 — devolve à lista da portaria os pedidos que foram carimbados
-- como impressos sem que folha nenhuma saísse.
--
-- O que aconteceu: às 17:04:40 UTC o JOSIAS clicou em "Imprimir pedidos da
-- portaria". O `gerarPdfPortaria` antigo marcava `printed_at` na leva inteira
-- no momento de GERAR o PDF, antes de qualquer papel. O PDF não virou papel, e
-- os três pedidos sumiram da lista — os cinco cliques seguintes (17:05:10 a
-- 17:05:55, em admin_operation_logs) devolveram "0 pedido(s)" com os pedidos
-- ali na tela do faturamento.
--
-- Desfaz só os DOIS que ainda não foram entregues. O GM-20260825-9590
-- (LUDMILLA) já está `entregue` — reimprimir folha de separação de pedido
-- entregue é papel jogado fora, então esse fica como está.
--
-- A causa foi corrigida no código: gerar o PDF não marca mais nada, quem marca
-- é a confirmação do faturamento (/print-portaria-confirm).

begin;

update public.orders
   set printed_at = null
 where order_number in ('GM-20260825-3235', 'GM-20260826-5795')
   and status <> 'entregue'
   and cancelled_at is null;

-- Confere antes de fechar: as duas linhas devem voltar com printed_at nulo.
select order_number, employee_name, status, printed_at
  from public.orders
 where order_number in ('GM-20260825-9590', 'GM-20260825-3235', 'GM-20260826-5795')
 order by created_at;

commit;
