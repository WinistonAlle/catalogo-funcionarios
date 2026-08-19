-- ============================================================================
-- Fecha 8 tabelas que estavam com RLS DESLIGADO e a chave anon (pública,
-- embutida no bundle JS) com grants de escrita.
-- ============================================================================
--
-- O MAIS GRAVE: public.weight
--
-- Existe uma tabela SEPARADA (product_id -> weight) que o front usa pra
-- SOBRESCREVER products.weight na hora de montar o catálogo (ver
-- "Merge weights from separate weight table" em src/pages/Index.tsx e
-- src/pages/Admin.tsx). E `getUnitPrice = employee_price × weight`
-- (src/lib/pricing.ts) — peso não é detalhe técnico, é multiplicador de
-- preço. Com RLS desligado e anon tendo INSERT/UPDATE/DELETE/TRUNCATE,
-- QUALQUER PESSOA sem login, só com a anon key do bundle (pública por
-- construção), conseguia:
--   update weight set weight = 0.001 where product_id = '<qualquer>';
-- e derrubar o preço de um produto pra quase zero pra todo mundo — driblando
-- por uma porta lateral a trava que já existia em products.employee_price
-- (fechada em 12/08/2026).
--
-- OUTRAS 7 TABELAS
--
-- admin_operation_logs: anon tinha INSERT/SELECT/UPDATE. Além de vazar o
-- histórico de ações administrativas (nomes, CPFs, mensagens), dava pra
-- FORJAR uma entrada de 'restore_employee_balances'/success pro ciclo atual
-- e bloquear o admin de verdade de rodar o reset (hasSuccessfulRestoreForCycle
-- checa exatamente essa tabela). Nenhuma tela legítima lê/escreve aqui direto
-- — tudo passa pelo webhook com service_role (ver OperationsHistory.tsx ->
-- listAdminOperationHistory -> /automation/operations/history). Fecha total.
--
-- carousel_settings / featured_products: CRUD completo pra anon. Vitrine da
-- loja (Destaques.tsx é a tela de admin, Index.tsx só lê) — sem dado
-- sensível, mas dava pra qualquer um apagar/desfigurar a vitrine pública.
--
-- products_employee_update / products_staging / profiles: 0 linhas, não
-- referenciadas em nenhum lugar do código (grep confirmado 19/08/2026) —
-- tabelas mortas. Fecha total, sem risco de quebrar nada.
--
-- notices: já era só leitura pra anon (sem write) — não precisa mexer, mas
-- entra no RLS por consistência (fica mais fácil auditar no futuro).
--
-- A ABORDAGEM
--
-- Mesmo padrão já usado em orders/order_items/employees: RLS ligado, leitura
-- liberada onde já era pública, escrita só pra is_privileged_user() (admin ou
-- rh logado — a MESMA função que products/categories/orders já usam). Isso
-- não quebra a tela de Admin (Destaques.tsx, Admin.tsx) porque ela já roda
-- autenticada como admin — só passa a exigir isso de verdade.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------
-- weight — o mais urgente
-- ---------------------------------------------------------------------
alter table public.weight enable row level security;

drop policy if exists weight_select_all on public.weight;
create policy weight_select_all on public.weight
  for select using (true);

drop policy if exists weight_write_privileged on public.weight;
create policy weight_write_privileged on public.weight
  for all using (public.is_privileged_user()) with check (public.is_privileged_user());

revoke insert, update, delete, truncate on public.weight from anon, authenticated;
grant select on public.weight to anon, authenticated;

-- ---------------------------------------------------------------------
-- admin_operation_logs — ninguém no navegador precisa tocar aqui
-- ---------------------------------------------------------------------
alter table public.admin_operation_logs enable row level security;

revoke insert, select, update, delete, truncate on public.admin_operation_logs from anon, authenticated;
-- Sem nenhuma policy: RLS ligado + zero grant = fechado até pra quem tenta
-- via authenticated. service_role (usado pelo webhook) ignora RLS e grants.

-- ---------------------------------------------------------------------
-- carousel_settings / featured_products — vitrine pública, escrita só admin
-- ---------------------------------------------------------------------
alter table public.carousel_settings enable row level security;

drop policy if exists carousel_settings_select_all on public.carousel_settings;
create policy carousel_settings_select_all on public.carousel_settings
  for select using (true);

drop policy if exists carousel_settings_write_privileged on public.carousel_settings;
create policy carousel_settings_write_privileged on public.carousel_settings
  for all using (public.is_privileged_user()) with check (public.is_privileged_user());

revoke insert, update, delete, truncate on public.carousel_settings from anon, authenticated;
grant select on public.carousel_settings to anon, authenticated;

alter table public.featured_products enable row level security;

drop policy if exists featured_products_select_all on public.featured_products;
create policy featured_products_select_all on public.featured_products
  for select using (true);

drop policy if exists featured_products_write_privileged on public.featured_products;
create policy featured_products_write_privileged on public.featured_products
  for all using (public.is_privileged_user()) with check (public.is_privileged_user());

revoke insert, update, delete, truncate on public.featured_products from anon, authenticated;
grant select on public.featured_products to anon, authenticated;

-- ---------------------------------------------------------------------
-- notices — já era só leitura; só liga o RLS por consistência
-- ---------------------------------------------------------------------
alter table public.notices enable row level security;

drop policy if exists notices_select_all on public.notices;
create policy notices_select_all on public.notices
  for select using (true);

-- ---------------------------------------------------------------------
-- Tabelas mortas: 0 linhas, não referenciadas no código. Fecha total.
-- ---------------------------------------------------------------------
alter table public.products_employee_update enable row level security;
revoke insert, select, update, delete, truncate on public.products_employee_update from anon, authenticated;

alter table public.products_staging enable row level security;
revoke insert, select, update, delete, truncate on public.products_staging from anon, authenticated;

alter table public.profiles enable row level security;
revoke insert, select, update, delete, truncate on public.profiles from anon, authenticated;

commit;

-- Para reverter (se alguma tela quebrar de um jeito inesperado):
--   alter table public.<tabela> disable row level security;
--   grant insert, update, delete, truncate on public.<tabela> to anon, authenticated;
-- (não recomendado — volta a expor o que este script fechou)
