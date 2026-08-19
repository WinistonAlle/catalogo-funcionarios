-- ============================================================================
-- CORRIGE ERRO da migração anterior (2026-08-19-fecha-tabelas-sem-rls.sql)
-- ============================================================================
--
-- Aquela migração revogou INSERT/UPDATE/DELETE/TRUNCATE de anon E
-- authenticated em weight/carousel_settings/featured_products, contando com
-- as policies de RLS (is_privileged_user()) pra filtrar quem pode escrever.
--
-- Só que RLS não FUNCIONA sem o GRANT de base — policy é um filtro por
-- LINHA em cima de um privilégio que já precisa existir a nível de tabela.
-- Sem o GRANT, nem um admin de verdade (rodando como authenticated) consegue
-- mais dar INSERT/UPDATE/DELETE nessas 3 tabelas — Admin.tsx e Destaques.tsx
-- (que escrevem direto do navegador) iam quebrar com "permission denied for
-- table" na hora de salvar peso, editar o carrossel ou destacar produto.
--
-- A CORREÇÃO
--
-- Devolve o GRANT pra authenticated (não pra anon — esse continua só
-- SELECT). A partir daqui: authenticated PODE tentar escrever (grant existe),
-- mas só passa se is_privileged_user() for true pra aquele usuário (RLS
-- ainda filtra). Funcionário comum autenticado tenta e é bloqueado pela
-- policy; admin/RH autenticado escreve normalmente. anon continua sem
-- conseguir nem tentar (nem grant, nem policy).
-- ============================================================================

begin;

grant insert, update, delete on public.weight to authenticated;
grant insert, update, delete on public.carousel_settings to authenticated;
grant insert, update, delete on public.featured_products to authenticated;

commit;
