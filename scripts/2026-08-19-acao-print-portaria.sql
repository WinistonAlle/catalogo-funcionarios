-- ============================================================================
-- Libera a ação 'print_portaria' no log de operações administrativas
-- ============================================================================
--
-- Novo botão "Imprimir pedidos da portaria" no Admin (faturamento resgatando
-- o fluxo manual de antes: imprime na impressora deles e desce o papel) —
-- precisa registrar em admin_operation_logs como as outras ações
-- administrativas (sync_employees, restore_employee_balances, first_access).
-- ============================================================================

begin;

alter table public.admin_operation_logs drop constraint admin_operation_logs_action_check;
alter table public.admin_operation_logs add constraint admin_operation_logs_action_check
  check (action = any (array['sync_employees', 'restore_employee_balances', 'first_access', 'print_portaria']));

commit;
