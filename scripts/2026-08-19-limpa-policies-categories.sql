-- ============================================================================
-- Limpa as 8 policies acumuladas em public.categories, de gerações
-- diferentes do sistema, e consolida em 2 policies limpas.
-- ============================================================================
--
-- O QUE TINHA (8 policies, RLS já ligado):
--
--   "Categorias - admin CRUD"       -- (auth.jwt()->>'role') = 'admin'
--   "Categorias - leitura..."       -- true (SELECT)
--   admin_delete_categories         -- is_admin(uuid) -> consulta public.profiles
--   admin_insert_categories         -- is_admin(uuid) -> consulta public.profiles
--   admin_select_categories         -- is_admin(uuid) -> consulta public.profiles
--   admin_update_categories         -- is_admin(uuid) -> consulta public.profiles
--   mod_categories_admin            -- is_admin() -> consulta public.employees (A ÚNICA QUE FUNCIONA)
--   sel_categories_public           -- true (SELECT, duplicada da primeira)
--
-- is_admin(uuid) lê public.profiles, que tem 0 linhas e não é referenciada em
-- nenhum lugar do código (confirmado 19/08/2026) — essas 4 policies nunca
-- autorizam ninguém, são peso morto de uma versão antiga do sistema que usava
-- profiles em vez de employees. auth.jwt()->>'role' também nunca vale
-- 'admin' neste projeto (não há custom claim/access-token-hook configurado;
-- o valor real é sempre o papel do Postgres, 'authenticated' ou 'anon') —
-- também nunca autoriza ninguém.
--
-- Comportamento efetivo HOJE (antes desta migração): leitura pública (pelas
-- duas policies "true" duplicadas) e escrita só pra quem tem
-- employees.role = 'admin' (via mod_categories_admin/is_admin()). RH NÃO
-- tem acesso de escrita em categorias hoje — esta migração preserva isso
-- de propósito, sem ampliar pra RH sem confirmar com o Winiston.
--
-- Também revoga TRUNCATE (ninguém precisa) e o INSERT/UPDATE/DELETE de anon
-- especificamente (RLS já barrava anon na prática, mas por defesa em
-- profundidade). authenticated MANTÉM o grant de escrita — RLS é filtro por
-- LINHA em cima de um privilégio que já precisa existir a nível de tabela;
-- revogar o grant de authenticated também quebraria o admin de verdade
-- (mesmo erro cometido e corrigido em weight/carousel_settings/
-- featured_products hoje, ver 2026-08-19-corrige-grants-authenticated.sql).
-- ============================================================================

begin;

drop policy if exists "Categorias - admin CRUD" on public.categories;
drop policy if exists "Categorias - leitura para autenticados" on public.categories;
drop policy if exists admin_delete_categories on public.categories;
drop policy if exists admin_insert_categories on public.categories;
drop policy if exists admin_select_categories on public.categories;
drop policy if exists admin_update_categories on public.categories;
drop policy if exists mod_categories_admin on public.categories;
drop policy if exists sel_categories_public on public.categories;

create policy categories_select_all on public.categories
  for select using (true);

create policy categories_write_admin on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete, truncate on public.categories from anon;
revoke truncate on public.categories from authenticated;
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;

commit;

-- Para reverter: recriar as 8 policies antigas (ver git blame deste arquivo
-- / histórico de migrations anteriores) — não recomendado, eram redundantes
-- ou mortas.
