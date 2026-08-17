-- =====================================================================
-- 13/08/2026 — Fecha a leitura pública de CPF, pedidos e saldo
-- =====================================================================
--
-- O QUE ESTAVA ABERTO (confirmado ao vivo pela URL pública, com a chave
-- `sb_publishable_...` que está dentro do bundle JS):
--
--   employees              255 linhas — nome, CPF e papel de todo mundo
--   employee_wallet_view   255 linhas — CPF + crédito mensal, sem filtro
--   employee_monthly_spend       aberta — quanto cada um gastou
--   orders                 358 linhas — nome e CPF em cada pedido
--   order_items                  aberta
--
-- `employee_wallet_view` era a porta mais discreta: `SELECT id, cpf,
-- credito_mensal_cents FROM employees`, sem WHERE, e como view sem
-- security_invoker rodava como postgres — ou seja, ignorava a RLS da
-- tabela. Fechar `employees` sem tratar a view não teria adiantado nada.
--
-- COMO FICA
-- ---------
-- Quem não logou (`anon`) não lê nada disso. Quem logou (`authenticated`,
-- inclusive a sessão anônima do funcionário comum) lê só o que é seu.
-- Admin/RH leem tudo, identificados por `is_privileged_user()`.
--
-- POR QUE UM HELPER NOVO
-- ----------------------
-- `is_admin()` consulta `employees` e NÃO é security definer, então usá-la
-- numa policy de `employees` dá recursão infinita — o mesmo defeito de
-- `employees_select_rh`, que este script remove. `is_privileged_user()` é
-- SECURITY DEFINER: roda como dono, ignora RLS, não recursiona.
--
-- O QUE NÃO MUDA
-- --------------
-- Login (`get_employee_by_cpf`), vínculo (`link_employee_to_user`), compra
-- (`place_order_with_wallet_v2`) e saldo (`gm_apply_balance_delta`) são
-- SECURITY DEFINER e seguem passando por cima da RLS.
-- O webhook usa a service role, que também ignora RLS.

begin;

-- ---------------------------------------------------------------------
-- 0) Helper não-recursivo
-- ---------------------------------------------------------------------

create or replace function public.is_privileged_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employees e
    where e.user_id = auth.uid()
      and lower(e.role::text) in ('admin', 'rh')
  );
$$;

revoke all on function public.is_privileged_user() from public;
grant execute on function public.is_privileged_user() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1) employees — limpa o emaranhado e deixa duas regras
-- ---------------------------------------------------------------------
-- As policies antigas eram: 4 catch-alls USING(true) que anulavam todo o
-- resto, 2 recursivas (_rh, via EXISTS em employees), 2 que apontam para
-- `hr_users` (tabela vazia) e 2 baseadas em `is_admin()` (recursiva).
-- Nenhuma protegia nada; várias explodiam se as catch-alls saíssem.

drop policy if exists employees_select_all         on public.employees;
drop policy if exists employees_update_all         on public.employees;
drop policy if exists employees_insert_all         on public.employees;
drop policy if exists employees_select_rh          on public.employees;
drop policy if exists employees_update_rh          on public.employees;
drop policy if exists employees_insert_rh          on public.employees;
drop policy if exists employees_select_hr          on public.employees;
drop policy if exists employees_update_hr          on public.employees;
drop policy if exists employees_insert_hr          on public.employees;
drop policy if exists p_employees_admin_select     on public.employees;
drop policy if exists p_employees_admin_modify     on public.employees;
drop policy if exists p_employees_allow_all_select on public.employees;
drop policy if exists p_employees_allow_all_update on public.employees;
drop policy if exists p_employees_default          on public.employees;

create policy employees_self_select on public.employees
  for select to authenticated
  using (user_id = auth.uid());

create policy employees_privileged_select on public.employees
  for select to authenticated
  using (public.is_privileged_user());

revoke select on public.employees from anon;

-- ---------------------------------------------------------------------
-- 2) employee_wallet_view — passa a respeitar a RLS de employees
-- ---------------------------------------------------------------------
-- Com security_invoker a view roda com os direitos de quem chama, então
-- herda as duas policies acima: o funcionário vê a própria carteira,
-- admin/RH veem todas.

alter view public.employee_wallet_view set (security_invoker = true);

revoke select on public.employee_wallet_view from anon;

-- ---------------------------------------------------------------------
-- 3) orders / order_items — cada um vê o seu
-- ---------------------------------------------------------------------
-- FOR ALL (não só SELECT) porque o Checkout dá UPDATE direto em `orders`
-- logo depois da RPC, gravando wallet_debited e spent_from_balance_cents.
-- Escopar isso pelo dono do pedido mantém o caminho do dinheiro intacto.

alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

drop policy if exists orders_self             on public.orders;
drop policy if exists orders_privileged       on public.orders;
drop policy if exists order_items_self        on public.order_items;
drop policy if exists order_items_privileged  on public.order_items;

create policy orders_self on public.orders
  for all to authenticated
  using (
    employee_id in (select e.id from public.employees e where e.user_id = auth.uid())
  )
  with check (
    employee_id in (select e.id from public.employees e where e.user_id = auth.uid())
  );

create policy orders_privileged on public.orders
  for all to authenticated
  using (public.is_privileged_user())
  with check (public.is_privileged_user());

create policy order_items_self on public.order_items
  for all to authenticated
  using (
    order_id in (
      select o.id from public.orders o
      join public.employees e on e.id = o.employee_id
      where e.user_id = auth.uid()
    )
  )
  with check (
    order_id in (
      select o.id from public.orders o
      join public.employees e on e.id = o.employee_id
      where e.user_id = auth.uid()
    )
  );

create policy order_items_privileged on public.order_items
  for all to authenticated
  using (public.is_privileged_user())
  with check (public.is_privileged_user());

revoke select, insert, update, delete on public.orders      from anon;
revoke select, insert, update, delete on public.order_items from anon;

-- ---------------------------------------------------------------------
-- 4) employee_monthly_spend — mesmo escopo
-- ---------------------------------------------------------------------

alter table public.employee_monthly_spend enable row level security;

drop policy if exists employee_monthly_spend_self       on public.employee_monthly_spend;
drop policy if exists employee_monthly_spend_privileged on public.employee_monthly_spend;

create policy employee_monthly_spend_self on public.employee_monthly_spend
  for select to authenticated
  using (
    employee_id in (select e.id from public.employees e where e.user_id = auth.uid())
  );

create policy employee_monthly_spend_privileged on public.employee_monthly_spend
  for select to authenticated
  using (public.is_privileged_user());

revoke select, insert, update, delete on public.employee_monthly_spend from anon;

commit;
