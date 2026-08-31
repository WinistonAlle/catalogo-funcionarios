-- 2026-08-31 — admin_operation_logs aceita `print_canhoteira`.
--
-- Mesma armadilha de 26/08 (ver 2026-08-26-admin-logs-aceita-print-order.sql):
-- o CHECK de `action` é uma lista fixa, e as chamadas de log terminam em
-- `.catch(() => null)` de propósito — ação nova sem migration não dá erro,
-- só não deixa rastro nenhum. Aqui é o botão "Canhoteira" do Admin Pedidos.
--
-- A lista abaixo é a do tipo AdminOperationAction em src/lib/adminOperations.ts.

begin;

alter table public.admin_operation_logs
  drop constraint if exists admin_operation_logs_action_check;

alter table public.admin_operation_logs
  add constraint admin_operation_logs_action_check
  check (action = any (array[
    'sync_employees'::text,
    'restore_employee_balances'::text,
    'first_access'::text,
    'print_portaria'::text,
    'print_order'::text,
    'print_canhoteira'::text,
    'health_check'::text
  ]));

select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.admin_operation_logs'::regclass
   and conname = 'admin_operation_logs_action_check';

commit;
