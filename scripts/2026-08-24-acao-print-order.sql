-- ============================================================================
-- Libera a ação 'print_order' no log de operações administrativas
-- ============================================================================
--
-- Novo botão "Imprimir" avulso por pedido no Admin (reimprimir ou imprimir
-- um pedido específico na hora, sem esperar o disparo automático nem baixar
-- a lista inteira) — precisa registrar em admin_operation_logs, mesmo padrão
-- de 'print_portaria' (scripts/2026-08-19-acao-print-portaria.sql).
-- ============================================================================

begin;

alter table public.admin_operation_logs drop constraint admin_operation_logs_action_check;
alter table public.admin_operation_logs add constraint admin_operation_logs_action_check
  check (action = any (array['sync_employees', 'restore_employee_balances', 'first_access', 'print_portaria', 'print_order']));

commit;
