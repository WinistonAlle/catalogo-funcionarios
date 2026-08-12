-- ============================================================================
-- SEGURANÇA: fechar o acesso público de escrita/leitura ao banco
-- Levantado em 12/08/2026. NÃO RODE TUDO DE UMA VEZ — leia parte por parte.
-- ============================================================================
--
-- O PROBLEMA
--
-- O frontend fala direto com o Supabase usando a chave anon, que está embutida
-- no bundle JS e é pública por definição. A REST API está exposta em
-- https://apifuncionarios.gostinhomineiro.com. Hoje isso significa que qualquer
-- pessoa com a chave (basta abrir o devtools) pode, de fora:
--
--   * LER os 356 pedidos de todos os funcionários, com nome e CPF (confirmado
--     ao vivo em 12/08/2026 pela URL pública);
--   * LER a lista de funcionários com CPF e crédito;
--   * ALTERAR employees.credito_mensal_cents de qualquer um, inclusive o
--     próprio — dar saldo infinito a si mesmo;
--   * ALTERAR products.employee_price;
--   * APAGAR ou TRUNCAR orders, order_items, products, profiles.
--
-- Causa: `orders`, `order_items`, `products`, `profiles` e
-- `admin_operation_logs` estão com RLS DESLIGADO, e `anon` tem
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE em todas. `employees` tem RLS LIGADO,
-- mas as políticas `employees_select_all` e `employees_update_all` são
-- `USING (true)`, o que anula as políticas corretas (`_hr`/`_rh`, baseadas em
-- auth.uid()) que existem logo ao lado.
--
-- O QUE TORNA ISSO CORRIGÍVEL SEM QUEBRAR O PEDIDO
--
-- Os caminhos que mexem em dinheiro são SECURITY DEFINER e portanto ignoram
-- RLS: place_order_with_wallet_v2, place_order_with_wallet, gm_apply_balance_delta,
-- handle_wallet_on_orders. O login também: get_employee_by_cpf é SECURITY
-- DEFINER. Ou seja, apertar o RLS não derruba nem o login nem o pagamento.
--
-- O QUE PODE QUEBRAR
--
-- As telas de Admin/RH leem e escrevem employees/products direto com a chave
-- anon (src/lib/employeeService.ts, src/pages/AdminOrders.tsx,
-- src/pages/SeparationBoard.tsx). Elas dependem hoje das políticas `_all`.
-- As políticas `_hr`/`_rh` só cobrem quem tem sessão do Supabase Auth vinculada
-- (employees.auth_user_id / hr_users). ANTES da PARTE 3, confirme que os
-- usuários de Admin/RH estão vinculados — senão essas telas param.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1 — RISCO ZERO. Tirar o que nenhuma tela usa.
-- Nada no frontend trunca tabela nem apaga pedido/funcionário. Isso só reduz o
-- estrago possível; não muda nenhum comportamento do app.
-- ----------------------------------------------------------------------------

revoke truncate on public.orders, public.order_items, public.products,
                   public.profiles, public.employees, public.admin_operation_logs
  from anon, authenticated;

revoke delete on public.orders, public.order_items, public.employees,
                 public.profiles, public.admin_operation_logs
  from anon, authenticated;

-- products.delete FICA: a tela de admin de produtos usa (src/pages/*, .from("products").delete).

-- ----------------------------------------------------------------------------
-- PARTE 2 — O buraco do saldo. É o mais grave e o mais contido.
-- `employees_update_all` permite a QUALQUER UM alterar credito_mensal_cents.
-- O débito do pedido NÃO passa por aqui (é SECURITY DEFINER), então derrubar
-- esta política não afeta comprar com saldo.
--
-- ⚠️ Afeta a edição de funcionário nas telas de RH (employeeService.ts:140/155/171).
-- Depois de rodar, TESTE: editar um funcionário pelo RH.
-- Reverter:  create policy employees_update_all on public.employees for update using (true);
-- ----------------------------------------------------------------------------

-- drop policy if exists employees_update_all on public.employees;

-- ----------------------------------------------------------------------------
-- PARTE 3 — Vazamento de CPF (LGPD). Mais delicado: quebra tela se os usuários
-- de RH/Admin não estiverem vinculados ao Supabase Auth.
--
-- Confira ANTES quantos privilegiados estão vinculados:
--   select count(*) from public.employees where role in ('admin','rh') and auth_user_id is null;
--   -- se vier > 0, esses vão perder acesso. Vincule antes.
-- ----------------------------------------------------------------------------

-- drop policy if exists employees_select_all on public.employees;

-- ----------------------------------------------------------------------------
-- PARTE 4 — orders/order_items: a leitura pública dos 356 pedidos com CPF.
--
-- NÃO habilite RLS aqui sem antes resolver o desenho: o login é por CPF
-- (sessão própria em localStorage), não por Supabase Auth, então não existe
-- auth.uid() para escopar "os pedidos DESTE funcionário". Habilitar RLS sem
-- política de SELECT derruba "Meus Pedidos", Admin e RH de uma vez.
--
-- O caminho certo é o que o projeto irmão (PDV) já faz: as leituras/escritas
-- privilegiadas passam por um backend com autenticação (aqui já existe um:
-- automation/operations-webhook.ts, com authorizePrivilegedUser), e o browser
-- deixa de falar direto com a tabela. Ver o bloco de segurança no CLAUDE.md.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- VERIFICAÇÃO — rode depois de cada parte.
-- ----------------------------------------------------------------------------

-- Quem ainda pode escrever o quê:
-- select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
-- from information_schema.role_table_grants
-- where table_schema='public' and grantee in ('anon','authenticated')
--   and table_name in ('orders','order_items','products','profiles','employees','admin_operation_logs')
-- group by table_name, grantee order by table_name, grantee;

-- Políticas catch-all que ainda anulam as corretas:
-- select tablename, policyname, cmd, qual from pg_policies
-- where schemaname='public' and qual = 'true';
