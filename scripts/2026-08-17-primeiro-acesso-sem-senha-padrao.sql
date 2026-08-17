-- ============================================================================
-- Primeiro acesso de admin/RH sem senha padrão — 17/08/2026
--
-- Decisão do Winiston: acaba a senha padrão `12345678` compartilhada pelas 7
-- contas. Quem ainda não acessou cria a própria senha na primeira entrada,
-- informando só o CPF (rota pública POST /automation/primeiro-acesso).
--
-- Este arquivo faz UMA coisa: liberar a ação `first_access` no log de
-- operações, para que cada criação de senha deixe rastro (quem, quando, de
-- qual IP). A invalidação da senha padrão em si NÃO é feita aqui — é feita
-- pelo `scripts/reset-primeiro-acesso.ts`, que troca a senha de cada conta por
-- uma aleatória descartável via Admin API do Supabase (o hash é bcrypt e o
-- lugar certo de gerar isso é a API, não SQL na mão).
--
-- Ordem de aplicação:
--   1) este SQL
--   2) npx tsx scripts/reset-primeiro-acesso.ts   (invalida a senha padrão)
--   3) npm run build && pm2 restart frontend webhook
-- ============================================================================

ALTER TABLE public.admin_operation_logs
  DROP CONSTRAINT IF EXISTS admin_operation_logs_action_check;

ALTER TABLE public.admin_operation_logs
  ADD CONSTRAINT admin_operation_logs_action_check
  CHECK (action = ANY (ARRAY[
    'sync_employees'::text,
    'restore_employee_balances'::text,
    'first_access'::text
  ]));

-- Conferência: deve listar as três ações.
-- SELECT pg_get_constraintdef(con.oid)
--   FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
--  WHERE rel.relname = 'admin_operation_logs'
--    AND con.conname = 'admin_operation_logs_action_check';

-- Quem já criou senha (acompanhar a distribuição do primeiro acesso):
-- SELECT e.full_name, e.role,
--        (u.raw_user_meta_data->>'must_change_password') AS falta_criar
--   FROM public.employees e JOIN auth.users u ON u.id = e.user_id
--  WHERE e.role IN ('admin','rh') ORDER BY e.role, e.full_name;
