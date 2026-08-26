-- 2026-08-26 — admin_operation_logs aceita as ações que o código já usa.
--
-- O CHECK de `action` foi escrito quando existiam 4 ações e nunca acompanhou o
-- código. `print_order` (impressão avulsa de um pedido, AdminOrders) grava log
-- desde 25/08 e SEMPRE foi recusado pelo banco — sem ninguém ver, porque as
-- chamadas de log terminam em `.catch(() => null)` de propósito (log não pode
-- derrubar a operação). Resultado: toda reimpressão avulsa acontecia sem
-- rastro nenhum.
--
-- Deixa a lista igual à do tipo AdminOperationAction em src/lib/adminOperations.ts.

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
    'print_order'::text
  ]));

select conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid = 'public.admin_operation_logs'::regclass
   and conname = 'admin_operation_logs_action_check';

commit;
