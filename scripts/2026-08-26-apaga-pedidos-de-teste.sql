-- ============================================================================
-- Apaga os 3 pedidos de teste do Winiston (26/08/2026)
-- ============================================================================
--
-- Backup tirado ANTES de rodar isto:
--   ~/backups/orders-20260826-antes-limpeza-testes.sql
--   (pg_dump --data-only de public.orders + public.order_items)
--
-- ESCOPO: só os 3 pedidos de R$ 6,80 do Winiston, de 12/08. O pedido do IAN
-- SANTOS (GM-20260811-4844, R$ 69,00) FICA: ele tem printed_at de 19/08, ou
-- seja, a folha desceu para a portaria e a mercadoria provavelmente foi
-- retirada. Apagá-lo devolveria R$ 69,00 ao saldo dele — dinheiro já gasto.
--
-- POR QUE CANCELAR ANTES DE APAGAR — não inverta a ordem.
--
-- `orders` tem gatilho de INSERT e de UPDATE (trg_orders_wallet_ins /
-- trg_orders_wallet_upd -> handle_wallet_on_orders), mas NÃO tem gatilho de
-- DELETE. O estorno do saldo só acontece no UPDATE de status para 'cancelado'.
-- Apagando direto, o débito na carteira ficaria de pé sem nenhum pedido para
-- justificá-lo: R$ 20,40 sumiriam do saldo do Winiston.
--
-- order_items e order_admin_actions caem sozinhos: as duas FKs para orders são
-- ON DELETE CASCADE (confdeltype = 'c').
-- ============================================================================

begin;

create temp table alvo(order_number text) on commit drop;
insert into alvo values
  ('GM-20260812-3575'),  -- Winiston, R$ 6,80, recibo CIGAM 011856
  ('GM-20260812-3488'),  -- Winiston, R$ 6,80, recibo CIGAM 011850
  ('GM-20260812-3797');  -- Winiston, R$ 6,80, recibo CIGAM 011836

-- confere o alvo antes de mexer (tem que listar exatamente 3 linhas, todas
-- do CPF 03554321109 e todas com printed_at nulo)
select o.order_number, o.employee_name, o.employee_cpf, o.total_value,
       o.status, o.erp_external_id, o.printed_at
from public.orders o join alvo a using (order_number)
order by o.created_at;

-- 1) cancelar — é este UPDATE que devolve o saldo, via gatilho
update public.orders o
set status        = 'cancelado',
    cancelled_at  = now(),
    cancel_reason = 'pedido de teste - limpeza 26/08/2026'
from alvo a
where o.order_number = a.order_number
  and coalesce(o.status,'') <> 'cancelado';

-- 2) apagar
delete from public.orders o using alvo a where o.order_number = a.order_number;

-- confere o saldo depois: Winiston 102774 -> 104814 (+2040).
-- O IAN (23100) tem de ficar INALTERADO — se mudou, o alvo pegou demais.
select full_name, cpf, credito_mensal_cents
from public.employees where cpf in ('03554321109','06102170113');

commit;
