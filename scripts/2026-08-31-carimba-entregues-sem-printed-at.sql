-- 2026-08-31 — carimba os pedidos ENTREGUES que ficaram sem `printed_at`.
--
-- Eram 6 pedidos de 25 a 27/08 já entregues ao funcionário que voltavam em
-- TODA impressão da lista da portaria, junto com o único pendente de verdade.
-- Dois deles (GM-20260825-3235, GM-20260826-5795) vieram do script de 26/08
-- que devolveu a leva carimbada sem imprimir — que avisava "não devolva pedido
-- já entregue" e devolveu. Os outros quatro vieram do caminho normal: alguém
-- gerou o PDF, imprimiu, entregou a mercadoria e não confirmou na tela.
--
-- Entregue implica que a folha saiu — a portaria não separa mercadoria sem
-- papel. Carimbar aqui é escrever o fato que já aconteceu, não inventar um.
-- O carimbo é o `now()` da correção, e NÃO a hora da impressão real, que
-- ninguém registrou; é por isso que este script existe uma vez só e o conserto
-- de verdade é o filtro `.neq("status", "entregue")` em portariaList.ts.
--
-- Status fica como está: já é `entregue`, que é o estado correto e final.

begin;

select order_number, erp_external_id, employee_name, status, created_at
  from public.orders
 where status = 'entregue'
   and printed_at is null
   and cancelled_at is null
 order by created_at;

update public.orders
   set printed_at = now()
 where status = 'entregue'
   and printed_at is null
   and cancelled_at is null;

-- Deve voltar zero linha.
select count(*) as entregues_sem_carimbo_restantes
  from public.orders
 where status = 'entregue'
   and printed_at is null
   and cancelled_at is null;

commit;
