-- ============================================================================
-- CRÍTICO: fecha public.employees_active e public.rh_spending_report —
-- mesma família de bug já corrigida em employee_wallet_view (13/08/2026),
-- em duas views irmãs que ficaram de fora daquela correção.
-- ============================================================================
--
-- rh_spending_report é AINDA MAIS SENSÍVEL: agrega orders (que tem RLS
-- restrito, orders_self/orders_privileged) por funcionário e mês —
-- nome, CPF, quantidade de pedidos, total gasto, quanto foi descontado em
-- folha, quanto foi pago na retirada. Sem security_invoker, também ignora o
-- RLS de orders. Com anon tendo SELECT, dava pra puxar o histórico de gasto
-- e desconto em folha de TODOS os funcionários, todo mês, sem login nenhum.
-- Também não é referenciada em nenhum lugar do código (RHSpendingReport.tsx
-- calcula por outro caminho) — só ficou exposta à toa.
--
-- employees_active é `select id, full_name, cpf, cpf_hash, email, phone,
-- role, notes, ... from employees where status = 'active'` — SEM
-- security_invoker. Uma view sem security_invoker roda com o privilégio do
-- DONO da view (postgres), não de quem consulta — ou seja, ignora
-- completamente o RLS de employees (que já está correto: só
-- is_privileged_user() ou dono da própria linha).
--
-- E anon tinha SELECT + INSERT + UPDATE + DELETE + TRUNCATE nessa view. Ou
-- seja, com só a anon key pública (embutida no bundle, extraível por
-- qualquer um), sem login nenhum, dava pra:
--   - ler nome, CPF, cpf_hash, e-mail, telefone, role e notas dos 255
--     funcionários ativos (GET /rest/v1/employees_active);
--   - e, por ser uma view simples de uma tabela só (sem join/agregação,
--     "simply updatable" no Postgres), possivelmente ESCREVER na tabela
--     employees por trás dela — inclusive a coluna role, que o gatilho
--     trg_employees_bloqueia_credito NÃO cobre (ele só barra
--     credito_mensal_cents). Ou seja, um caminho pra um estranho virar
--     admin sem senha nenhuma, sem passar pelo primeiro-acesso.
--
-- A view não é referenciada em nenhum lugar do código do app (grep
-- confirmado 19/08/2026) — não é usada, só ficou exposta.
--
-- A CORREÇÃO
--
-- security_invoker = true faz a view rodar com o privilégio de QUEM
-- CONSULTA, não do dono — volta a respeitar o RLS de employees (que já é
-- correto). Como anon não tem SELECT em employees, consultar a view como
-- anon passa a devolver 0 linhas. Revoga também os grants de escrita da
-- view (defesa em profundidade — com security_invoker eles já falhariam
-- pela falta de grant em employees, mas não custa fechar os dois lados).
-- ============================================================================

begin;

alter view public.employees_active set (security_invoker = true);
revoke insert, update, delete, truncate on public.employees_active from anon, authenticated;

alter view public.rh_spending_report set (security_invoker = true);
revoke insert, update, delete, truncate on public.rh_spending_report from anon, authenticated;

commit;
