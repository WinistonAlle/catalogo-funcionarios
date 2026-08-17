-- =====================================================================
-- 13/08/2026 — Fecha a escalada de privilégio por CPF
-- =====================================================================
--
-- O PROBLEMA
-- ----------
-- O papel de admin/RH vinha colado ao CPF, e o CPF é público: a chave
-- `sb_publishable_...` está dentro do bundle JS servido em
-- funcionarios.gostinhomineiro.com, e com ela dava para listar de fora
--
--   GET /rest/v1/employees?select=full_name,cpf,role&role=eq.admin
--
-- Com um CPF de admin em mãos, qualquer pessoa na internet fazia:
--   1. signInAnonymously()            -> JWT válido, sem senha
--   2. rpc link_employee_to_user(cpf) -> employees.user_id := auth.uid()
--   3. chamava /admin/* no webhook, que autoriza casando employees.user_id
--
-- ...e virava admin: preço de produto, saldo de funcionário, reset de
-- saldos, disparo de pedido no CIGAM. De quebra, o admin de verdade perdia
-- o acesso, porque o user_id dele era sobrescrito.
--
-- A CORREÇÃO
-- ----------
-- Admin/RH passam a ter usuário de verdade no Supabase Auth (e-mail interno
-- <cpf>@interno.gostinhomineiro.com + senha), criados fora deste script pela
-- Admin API. Aqui a gente:
--
--   PARTE 1 — fixa employees.user_id no id dessas contas com senha
--   PARTE 2 — proíbe link_employee_to_user de tocar em admin/RH
--
-- Rodar SÓ DEPOIS de publicar o frontend que pede senha para admin/RH
-- (src/services/auth.ts), senão eles ficam sem caminho de entrada.

begin;

-- ---------------------------------------------------------------------
-- PARTE 1 — vínculo fixo com a conta que tem senha
-- ---------------------------------------------------------------------
-- Casa pelo e-mail interno derivado do CPF. Não inventa vínculo: só liga
-- quem já tem employee com aquele CPF e conta Auth com aquele e-mail.

update public.employees e
set user_id = u.id,
    updated_at = now()
from auth.users u
where u.email = e.cpf || '@interno.gostinhomineiro.com'
  and lower(e.role::text) in ('admin', 'rh');

-- ---------------------------------------------------------------------
-- PARTE 2 — a RPC não vincula mais conta privilegiada
-- ---------------------------------------------------------------------

create or replace function public.link_employee_to_user(p_cpf text)
returns void
language plpgsql
security definer
as $$
declare
  v_uid uuid := auth.uid();
  v_emp_id uuid;
  v_role text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- existe employee com esse CPF?
  select id, lower(role::text) into v_emp_id, v_role
  from public.employees
  where cpf = p_cpf
  limit 1;

  if v_emp_id is null then
    raise exception 'CPF não encontrado';
  end if;

  -- 🔒 Admin/RH nunca se vinculam por aqui. O user_id deles é fixo e vem de
  -- uma conta com senha; era exatamente esta função que deixava qualquer um
  -- que soubesse o CPF de um admin apontar o vínculo para si mesmo.
  if v_role in ('admin', 'rh') then
    raise exception 'Esta conta exige login com senha';
  end if;

  -- garante que esse user_id não esteja preso em outro employee (só por segurança).
  -- Nunca mexe em linha privilegiada, para não desligar um admin por acidente.
  update public.employees
  set user_id = null
  where user_id = v_uid
    and id <> v_emp_id
    and lower(role::text) not in ('admin', 'rh');

  -- ✅ vincula (atualiza) o CPF logado ao auth.uid() atual
  update public.employees
  set user_id = v_uid
  where id = v_emp_id;
end;
$$;

commit;
