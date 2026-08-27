-- =====================================================================
-- 27/08/2026 — Separa DIREITO de SALDO, e limpa o entulho que sobrou.
--
-- POR QUE
-- -------
-- `employees.credito_mensal_cents` acumulava dois papéis incompatíveis:
--   * o DIREITO mensal (quanto a pessoa ganha por ciclo, vem da planilha)
--   * o SALDO CORRENTE (quanto ainda resta, o checkout desconta daqui)
-- Era a raiz de todo susto de recarga: qualquer rodada de sincronização que
-- encostasse na coluna reescrevia o saldo de 256 pessoas de uma vez. As duas
-- travas de 26/08 (SYNC_CREDITO_MENSAL=0 e jaRecarregouNesteCiclo) são cintos
-- de segurança em volta desse buraco — não o fecham.
--
-- Depois desta migração:
--   credito_direito_cents  = direito mensal. SÓ a planilha escreve. Reescrever
--                            é inofensivo: não é dinheiro de ninguém.
--   credito_mensal_cents   = saldo corrente. SÓ o checkout (débito), o estorno
--                            de cancelamento e a recarga mensal escrevem.
-- A recarga mensal deixa de ser "escreve a planilha no saldo" e passa a ser
-- "copia direito -> saldo". Uma rodada de cadastro não tem mais como tocar em
-- dinheiro, porque `credito_mensal_cents` sai do payload de cadastro.
--
-- JANELA DO BACKFILL
-- ------------------
-- Rodando em 27/08/2026: a recarga mensal rodou às 03:00 e não houve NENHUM
-- pedido desde então (conferido: 0 pedidos, R$ 0,00 gastos no dia). Logo, neste
-- instante `credito_mensal_cents` É o valor da planilha para os 256 — o
-- backfill `direito := saldo` é exato, não aproximado. A rodada de sync logo em
-- seguida reescreve `credito_direito_cents` direto da planilha e confirma.
--
-- Reversão: `alter table public.employees drop column credito_direito_cents;`
-- devolve o comportamento antigo (o saldo nunca deixa de ser
-- `credito_mensal_cents`, então nada de dinheiro depende desta coluna existir).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PARTE 1 — a coluna do direito
-- ---------------------------------------------------------------------
alter table public.employees
  add column if not exists credito_direito_cents integer not null default 0;

comment on column public.employees.credito_direito_cents is
  'DIREITO mensal em centavos (o que a planilha diz que a pessoa ganha por ciclo). '
  'So a sincronizacao da planilha escreve aqui. Nao e dinheiro gasto nem saldo — '
  'reescrever esta coluna e inofensivo. O saldo corrente e credito_mensal_cents.';

comment on column public.employees.credito_mensal_cents is
  'SALDO CORRENTE em centavos (quanto ainda resta neste ciclo). O checkout '
  'desconta daqui, o cancelamento estorna, e a recarga mensal copia '
  'credito_direito_cents para ca. NAO e um teto: nunca escreva a planilha '
  'direto nesta coluna fora da recarga mensal.';

-- Backfill exato (ver "JANELA DO BACKFILL" acima).
update public.employees
   set credito_direito_cents = coalesce(credito_mensal_cents, 0)
 where credito_direito_cents = 0;

-- Saldo negativo nunca deveria existir; o checkout recusa gasto acima do saldo
-- desde 24/08. A trava vira estrutural aqui.
alter table public.employees
  drop constraint if exists employees_credito_mensal_nao_negativo;
alter table public.employees
  add constraint employees_credito_mensal_nao_negativo
  check (credito_mensal_cents is null or credito_mensal_cents >= 0);

alter table public.employees
  drop constraint if exists employees_credito_direito_nao_negativo;
alter table public.employees
  add constraint employees_credito_direito_nao_negativo
  check (credito_direito_cents >= 0);

-- ---------------------------------------------------------------------
-- PARTE 2 — a view que o app le passa a devolver os dois numeros
--
-- O frontend calculava `disponivel = credito_mensal_cents - spent_cents`,
-- tratando o saldo como se fosse teto. So nao dava erro porque
-- employee_monthly_spend.spent_cents e sempre 0 (nada no fluxo de pedido a
-- incrementa). Ver PARTE 4: isso era uma bomba armada, nao um detalhe.
-- ---------------------------------------------------------------------
drop view if exists public.employee_wallet_view;
create view public.employee_wallet_view as
  select id as employee_id,
         cpf,
         credito_mensal_cents,   -- saldo corrente (o que o checkout aceita)
         credito_direito_cents   -- direito do ciclo (para exibir "de R$ X")
    from public.employees;

alter view public.employee_wallet_view set (security_invoker = true);
revoke all on public.employee_wallet_view from anon;
grant select on public.employee_wallet_view to authenticated;

-- ---------------------------------------------------------------------
-- PARTE 3 — `status` deixa de ser nulo nos 256
--
-- `is_active` e coluna GERADA a partir de `status`, e `status` estava NULL em
-- 256 de 256 — entao `is_active` era NULL em todo mundo e a view
-- `employees_active` (where status = 'active') devolvia 0 linhas. Pior: a tela
-- de RH (src/pages/rh/EmployeesPage.tsx) pinta um badge por status e desabilita
-- acoes quando `status = 'inactive'`; com tudo nulo, o badge saia vazio e a
-- regra nunca valia. Ninguem esta desligado (terminated_at = 0 de 256), entao
-- 'active' e o valor correto para todos.
-- ---------------------------------------------------------------------
update public.employees
   set status = 'active'
 where status is null
   and terminated_at is null;

alter table public.employees
  drop constraint if exists employees_status_check;
alter table public.employees
  add constraint employees_status_check
  check (status is null or status in ('active','onboarding','inactive'));

-- ---------------------------------------------------------------------
-- PARTE 4 — o entulho
--
-- Cada item aqui foi conferido como sem chamador no app (grep em src/,
-- automation/, scripts/) e sem chamador dentro do banco (varredura em
-- pg_get_functiondef de todas as funcoes plpgsql de public).
-- ---------------------------------------------------------------------

-- 4a) admin_remove_order_item_v3 e _qty_v1: MORTAS E PERIGOSAS.
--     O app chama `admin_remove_order_item_v2` (AdminOrders.tsx:991) — estas
--     duas nunca sao chamadas, mas continuam expostas pelo PostgREST a
--     qualquer usuario privilegiado. As duas chamam
--     admin_recalc_employee_monthly_spend, que PREENCHE
--     employee_monthly_spend.spent_cents com o gasto real do ciclo. Como o
--     frontend fazia `disponivel = saldo - spent_cents` e o saldo JA esta
--     descontado, uma unica chamada faria o saldo visivel de um funcionario
--     cair pelo gasto do mes inteiro uma segunda vez. Bomba armada.
drop function if exists public.admin_remove_order_item_v3(text, uuid, uuid, text);
drop function if exists public.admin_remove_order_item_qty_v1(text, uuid, uuid, numeric, text);
drop function if exists public.admin_recalc_employee_monthly_spend(uuid, text);

-- 4b) gm_apply_balance_delta: 0 chamadores. Descobria "onde fica o saldo"
--     lendo information_schema e montando SQL dinamico — adivinhacao sobre
--     dinheiro. Com o direito separado do saldo, ela adivinharia errado.
drop function if exists public.gm_apply_balance_delta(uuid, bigint);

-- 4c) Versoes antigas substituidas por _v2 (o app so chama as _v2).
drop function if exists public.admin_cancel_order(text, uuid, text);
drop function if exists public.admin_cancel_order(uuid, text);
drop function if exists public.place_order_with_wallet(uuid, uuid, boolean);
drop function if exists public.place_order_with_wallet(uuid, uuid);

-- 4d) auth_check_cpf: 0 chamadores no app, 0 no banco, 0 em policy.
drop function if exists public.auth_check_cpf(text);

-- 4e) set_updated_at_saibweb_jobs: resto da limpeza do Saibweb de 13/08 —
--     a tabela saibweb_jobs foi removida, o trigger dela ficou orfao.
drop function if exists public.set_updated_at_saibweb_jobs();

-- 4f) hr_users: tabela VAZIA desde sempre. `isCurrentUserHR()`
--     (src/lib/employeeService.ts) a consultava e portanto devolvia false para
--     todo mundo, inclusive para o RH. Quem manda em permissao e
--     is_privileged_user()/employees.role. A funcao morre junto no frontend.
drop table if exists public.hr_users cascade;

-- 4g) employees_active: 0 linhas (ver PARTE 3), 0 chamadores. Com `status`
--     preenchido ela passaria a devolver 256 — mas continua sem ninguem lendo,
--     e view sobre employees e justamente a familia de vazamento que precisou
--     ser fechada em 13/08 e 19/08. Menos superficie e melhor.
drop view if exists public.employees_active;

-- 4h) rh_spending_report: 0 chamadores. Agrega orders por month_key em UTC e
--     por mes de calendario — o mesmo bug de ciclo ja corrigido na tela de
--     gastos em 26/08 (o ciclo e 27→26, nao 01→31). Manter e oferecer um
--     numero errado para quem achar a view.
drop view if exists public.rh_spending_report;

-- 4i) employees.auth_user_id: 0 de 256 preenchidas. O vinculo real com
--     auth.users e `user_id` (tem FK, indice unico e e o que a RLS usa).
--     A coluna morta ja confundiu auditoria antes — os scripts de 12/08
--     conferiam admins por `auth_user_id is null`, que dava "todos nulos"
--     independentemente da verdade.
alter table public.employees drop column if exists auth_user_id;

-- 4j) employee_monthly_spend: fica SEM NENHUM ESCRITOR depois de 4a/4b/4c.
--     Varredura no banco: os unicos 5 que escreviam nela eram
--     admin_remove_order_item_v3, _qty_v1, admin_recalc_employee_monthly_spend
--     e as duas versoes antigas de place_order_with_wallet — todas removidas
--     acima. As versoes vivas (place_order_with_wallet_v2,
--     admin_remove_order_item_v2, admin_cancel_order_v2) nunca a tocaram, que e
--     por que ela guardava 7 linhas zeradas enquanto 303 pedidos reais
--     aconteciam. O ultimo escritor de fora era o endpoint "Restaurar saldo",
--     que so zerava a coluna — removido em automation/operations-webhook.ts
--     nesta mesma leva.
--
--     Com direito e saldo separados, o gasto do ciclo passa a ser DERIVADO
--     (credito_direito_cents - credito_mensal_cents) em vez de mantido a mao
--     numa tabela paralela que ninguem alimentava. Numero derivado nao
--     dessincroniza.
--
--     Nada de historico se perde: as 7 linhas (abr/mai/jun) estao todas com
--     spent_cents = 0. O historico de verdade e `orders`, e a tela de gastos ja
--     le de la.
drop table if exists public.employee_monthly_spend cascade;

-- ---------------------------------------------------------------------
-- PARTE 5 — o vigia precisa poder gravar o que encontrou
--
-- O CHECK de `action` recusa em silencio qualquer valor fora da lista — foi
-- exatamente assim que `print_order` ficou sendo rejeitado sem ninguem ver,
-- de 25 a 26/08. Adicionar 'health_check' ANTES de o vigia tentar gravar.
-- ---------------------------------------------------------------------
alter table public.admin_operation_logs
  drop constraint if exists admin_operation_logs_action_check;
alter table public.admin_operation_logs
  add constraint admin_operation_logs_action_check
  check (action in (
    'sync_employees',
    'restore_employee_balances',
    'first_access',
    'print_portaria',
    'print_order',
    'health_check'
  ));

commit;
