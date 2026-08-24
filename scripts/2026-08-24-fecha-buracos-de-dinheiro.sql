-- ============================================================================
-- Fecha os buracos de dinheiro e de dados encontrados na auditoria de 24/08/2026
-- ============================================================================
--
-- Cinco problemas, todos confirmados contra o banco de produção:
--
-- 1. O NAVEGADOR DECIDIA QUANTO O FUNCIONÁRIO PAGAVA.
--    `order_items.unit_price` vem do cliente, `subtotal` é gerada
--    (unit_price × quantity) e a RPC cobrava `sum(subtotal)`. Como
--    `authenticated` tem INSERT em order_items, dava pra montar a requisição
--    na mão com unit_price = 0,01 e levar mercadoria real por 1 centavo — e o
--    CIGAM recebia o preço falso junto (buildItens lê order_items.unit_price).
--    → Agora a RPC RECALCULA o preço a partir de `products` e sobrescreve
--      order_items.unit_price. O navegador deixa de ter voz no preço.
--
-- 2. DAVA PRA GASTAR MAIS DO QUE O SALDO, SEM ERRO.
--    `least(saldo, total)` aceitava pagamento parcial em silêncio e jogava a
--    diferença em pay_on_pickup_cents — forma de pagamento que saiu do sistema
--    em 12/08, ou seja, ninguém cobra. E pay_on_pickup_cents > 0 é um dos
--    sinais de "foi pago" da varredura, então o pedido subpago ainda ia pro
--    CIGAM e era efetivado na série REC. Não precisava de má fé: o
--    `canPayWithWallet` do checkout é checagem de CLIENTE sobre saldo em
--    cache, então saldo desatualizado já bastava.
--    → Agora a RPC RECUSA quando o saldo não cobre o total.
--
-- 3. A RPC NÃO VALIDAVA QUEM CHAMAVA.
--    SECURITY DEFINER com EXECUTE liberado pra anon, e `p_employee_id` vinha
--    do cliente sem nunca ser conferido contra o dono do pedido — dava pra
--    debitar o saldo de um colega. Também não era idempotente (chamar duas
--    vezes debitava duas vezes) nem checava pedido cancelado.
--    → Agora exige sessão do próprio dono (ou admin/RH), confere o dono,
--      recusa cancelado e é idempotente.
--
-- 4. `admin_get_employees_basic` VAZAVA OS 255 CPFs SEM LOGIN.
--    SECURITY DEFINER, sem checagem nenhuma, EXECUTE pra anon: um `POST
--    /rest/v1/rpc/admin_get_employees_basic` com a chave publishable (que está
--    dentro do bundle JS, é pública por definição) devolvia cpf + full_name de
--    todo mundo. Confirmado ao vivo em 24/08/2026. Como o funcionário comum
--    loga só com CPF, isso é a credencial de todos vazando — desfaz na prática
--    o `2026-08-13-fecha-leitura-publica.sql`.
--    → Agora exige is_privileged_user() e não é mais executável por anon.
--
-- 5. FUNÇÕES ADMINISTRATIVAS ABERTAS PRA QUALQUER UM.
--    Cancelamento e remoção de item (que ESTORNAM saldo) eram executáveis por
--    anon. As _v2 checam `is_admin_by_cpf(p_actor_cpf)`, mas isso é
--    autorização por parâmetro: basta saber o CPF de um admin, que circula em
--    crachá e folha. As versões legadas (admin_cancel_order, _qty_v1) não
--    checam nada — um funcionário podia remover item do próprio pedido depois
--    de receber a mercadoria e ficar com o estorno.
--    → REVOKE de anon + exigência de sessão privilegiada de verdade.
--
-- Reversão: o fim do arquivo tem o bloco comentado para voltar cada parte.
-- ============================================================================

begin;

-- ============================================================================
-- PARTE 1 — place_order_with_wallet_v2: preço vem do banco, saldo é exigido,
--           chamador é validado
-- ============================================================================
--
-- ⚠️ A FÓRMULA DE PREÇO É A ARMADILHA CENTRAL DO PROJETO (ver CLAUDE.md).
-- Espelha `src/lib/pricing.ts` EXATAMENTE — não "simplificar":
--
--   getKgPrice       = employee_price se > 0, senão price se > 0, senão 0
--   getProductWeight = weight se > 0, senão 1   ← fallback, NÃO é peso real
--   getUnitPrice     = getKgPrice × getProductWeight
--
-- `employee_price` é preço por UNIDADE DE MEDIDA (para KG, R$/kg — não o preço
-- do pacote). Mexer nesta conta muda o que o funcionário paga.
--
-- ⚠️ O fallback para `price` do pricing.ts NÃO é replicado aqui de propósito:
-- a coluna `products.price` NÃO EXISTE no banco (conferido em 24/08/2026 —
-- products só tem `employee_price` e `weight`). No front esse fallback só
-- alcança os dados mock de `src/data/products.ts`; contra o banco real ele
-- sempre lê `undefined` e cai em 0. Referenciar `p.price` aqui compila (o
-- corpo de PL/pgSQL só é validado em execução) e quebraria TODO checkout em
-- tempo de execução.

create or replace function public.place_order_with_wallet_v2(
  p_employee_id uuid,
  p_order_id uuid,
  p_use_wallet boolean default true
)
returns table(
  total_cents bigint,
  wallet_used_cents bigint,
  pay_on_pickup_cents bigint,
  month_key text,
  new_spent_cents bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order          record;
  v_owner_user_id  uuid;
  v_wallet_balance bigint;
  v_total_cents    bigint;
  v_month_key      text;
  v_itens_ruins    int;
begin
  v_month_key := public.current_pay_cycle_key();

  -- Trava o pedido primeiro: tudo que vem depois decide dinheiro.
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  -- --------------------------------------------------------------------
  -- Autorização. Antes NÃO EXISTIA: p_employee_id vinha do cliente e era
  -- usado direto. Agora o dono do pedido tem de ser quem está na sessão
  -- (ou um admin/RH agindo pelo painel).
  -- --------------------------------------------------------------------
  if v_order.employee_id is null then
    raise exception 'Pedido sem funcionário vinculado';
  end if;

  if p_employee_id is distinct from v_order.employee_id then
    raise exception 'Funcionário informado não é o dono deste pedido';
  end if;

  select user_id, coalesce(credito_mensal_cents, 0)
    into v_owner_user_id, v_wallet_balance
  from public.employees
  where id = v_order.employee_id
  for update;

  if not found then
    raise exception 'Funcionário não encontrado';
  end if;

  -- auth.uid() é NULL para chamadas sem JWT (papel anon puro) — e NULL nunca
  -- casa aqui, nem com user_id NULL, porque `is not distinct from` só é usado
  -- de propósito onde ambos existem.
  if not public.is_privileged_user() then
    if v_owner_user_id is null or auth.uid() is null or v_owner_user_id <> auth.uid() then
      raise exception 'Acesso negado: este pedido não é seu';
    end if;
  end if;

  if coalesce(v_order.status, '') = 'cancelado' or v_order.cancelled_at is not null then
    raise exception 'Pedido cancelado não pode ser pago';
  end if;

  -- --------------------------------------------------------------------
  -- Idempotência. Antes, chamar duas vezes debitava duas vezes. Agora a
  -- segunda chamada devolve o que já foi gravado, sem tocar no saldo.
  -- --------------------------------------------------------------------
  if coalesce(v_order.wallet_debited, false)
     or coalesce(v_order.wallet_used_cents, 0) > 0 then
    total_cents         := coalesce(v_order.total_cents, 0);
    wallet_used_cents   := coalesce(v_order.wallet_used_cents, 0);
    pay_on_pickup_cents := coalesce(v_order.pay_on_pickup_cents, 0);
    month_key           := v_month_key;
    new_spent_cents     := coalesce(v_order.wallet_used_cents, 0);
    return next;
    return;
  end if;

  -- --------------------------------------------------------------------
  -- PREÇO REAL, VINDO DO BANCO. É esta linha que tira o preço das mãos do
  -- navegador: o unit_price que veio do cliente é sobrescrito.
  -- --------------------------------------------------------------------
  update public.order_items oi
  set unit_price =
        (case when coalesce(p.employee_price, 0) > 0 then p.employee_price else 0 end)
        * (case when coalesce(p.weight, 0) > 0 then p.weight else 1 end)
  from public.products p
  where oi.product_id = p.id
    and oi.order_id = p_order_id;

  -- Item sem produto vinculado ou com preço zerado não pode virar cobrança:
  -- seria mercadoria saindo de graça. Mesma recusa que o front já fazia em
  -- services/orders.ts, agora valendo também para quem não passa pelo front.
  select count(*) into v_itens_ruins
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and (p.id is null or coalesce(oi.unit_price, 0) <= 0 or coalesce(oi.quantity, 0) <= 0);

  if v_itens_ruins > 0 then
    raise exception 'Pedido tem % item(ns) sem produto válido ou com preço/quantidade zerada', v_itens_ruins;
  end if;

  select coalesce(sum(round(oi.subtotal * 100)), 0)::bigint
    into v_total_cents
  from public.order_items oi
  where oi.order_id = p_order_id;

  if v_total_cents <= 0 then
    raise exception 'Pedido sem itens ou com total zerado';
  end if;

  -- --------------------------------------------------------------------
  -- Saldo tem de cobrir o total. Antes usava least() e aceitava pagamento
  -- parcial em silêncio; hoje não existe forma de cobrar a diferença.
  -- --------------------------------------------------------------------
  if not p_use_wallet then
    raise exception 'Pagamento só é possível com saldo (desconto em folha)';
  end if;

  if v_wallet_balance < v_total_cents then
    raise exception 'Saldo insuficiente: disponível R$ %, pedido R$ %',
      to_char(v_wallet_balance / 100.0, 'FM999999990.00'),
      to_char(v_total_cents / 100.0, 'FM999999990.00');
  end if;

  -- --------------------------------------------------------------------
  -- Grava tudo numa transação só. `payment_method` e `wallet_debited`
  -- passam a sair daqui — antes eram um segundo .update() do Checkout, cujo
  -- erro era apenas logado, o que já tinha obrigado a varredura do CIGAM a
  -- carregar `wallet_used_cents` como rede de segurança (ver CLAUDE.md).
  -- --------------------------------------------------------------------
  update public.orders
  set total_cents              = v_total_cents,
      total_value              = v_total_cents / 100.0,
      wallet_used_cents        = v_total_cents,
      spent_from_balance_cents = v_total_cents,
      pay_on_pickup_cents      = 0,
      payment_method           = 'wallet',
      wallet_debited           = true,
      wallet_refunded          = false
  where id = p_order_id;

  update public.employees
  set credito_mensal_cents = credito_mensal_cents - v_total_cents
  where id = v_order.employee_id;

  total_cents         := v_total_cents;
  wallet_used_cents   := v_total_cents;
  pay_on_pickup_cents := 0;
  month_key           := v_month_key;
  new_spent_cents     := v_total_cents;
  return next;
end;
$function$;

-- ============================================================================
-- PARTE 2 — admin_get_employees_basic deixa de ser um dump público de CPF
-- ============================================================================

create or replace function public.admin_get_employees_basic()
returns table(cpf text, full_name text)
language sql
security definer
set search_path to 'public'
as $function$
  select e.cpf, e.full_name
  from public.employees e
  where public.is_privileged_user();
$function$;

-- ============================================================================
-- PARTE 3 — tira da mão de `anon` tudo que mexe em dinheiro ou lista gente
-- ============================================================================
--
-- `anon` é quem chega só com a chave publishable do bundle, sem login nenhum.
-- O fluxo real do funcionário faz signInAnonymously() ANTES de qualquer uma
-- destas chamadas, então ele é `authenticated` e não perde nada aqui.
--
-- ⚠️ REVOGAR DE `anon` NÃO BASTA — foi assim que a primeira versão desta
-- migração nasceu inócua. No Postgres, função criada já vem com EXECUTE
-- concedido a **PUBLIC**, e `anon`/`authenticated` herdam de PUBLIC: o
-- `revoke ... from anon` tira um privilégio que ele nem tinha diretamente e o
-- acesso continua de pé. Confirmado em teste (has_function_privilege seguia
-- `true` depois do revoke). O certo é revogar de PUBLIC e devolver EXECUTE
-- só para quem precisa, nominalmente.
--
-- Ficam de fora de propósito (o login precisa delas antes de existir sessão):
--   get_employee_by_cpf, auth_check_cpf, link_employee_to_user

revoke execute on function public.admin_get_employees_basic() from public, anon;
revoke execute on function public.place_order_with_wallet_v2(uuid, uuid, boolean) from public, anon;
revoke execute on function public.gm_apply_balance_delta(uuid, bigint) from public, anon, authenticated;
revoke execute on function public.admin_cancel_order_v2(uuid, text, text) from public, anon;
revoke execute on function public.admin_cancel_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_cancel_order(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_remove_order_item_v2(text, uuid, uuid, text) from public, anon;
revoke execute on function public.admin_remove_order_item_v3(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.admin_remove_order_item_qty_v1(uuid, uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.admin_recalc_employee_monthly_spend(uuid, text) from public, anon, authenticated;
revoke execute on function public.place_order_with_wallet(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.place_order_with_wallet(uuid, uuid) from public, anon, authenticated;

-- Devolve EXECUTE nominalmente a quem o app de fato usa. Admin e funcionário
-- comum são o MESMO papel no Postgres (`authenticated`), então grant aqui não
-- separa os dois — quem separa é a checagem de sessão privilegiada dentro de
-- cada função (PARTE 6).
grant execute on function public.admin_get_employees_basic() to authenticated;
grant execute on function public.place_order_with_wallet_v2(uuid, uuid, boolean) to authenticated;
grant execute on function public.admin_cancel_order_v2(uuid, text, text) to authenticated;
grant execute on function public.admin_remove_order_item_v2(text, uuid, uuid, text) to authenticated;

-- O service_role (webhook) herdava de PUBLIC como todo mundo; devolve
-- explicitamente para não depender disso.
grant execute on function public.admin_get_employees_basic() to service_role;
grant execute on function public.place_order_with_wallet_v2(uuid, uuid, boolean) to service_role;
grant execute on function public.gm_apply_balance_delta(uuid, bigint) to service_role;
grant execute on function public.admin_cancel_order_v2(uuid, text, text) to service_role;
grant execute on function public.admin_remove_order_item_v2(text, uuid, uuid, text) to service_role;
grant execute on function public.admin_recalc_employee_monthly_spend(uuid, text) to service_role;

-- ============================================================================
-- PARTE 4 — funcionário comum não escreve mais em pedido já criado
-- ============================================================================
--
-- `orders_self` e `order_items_self` eram `FOR ALL`, então o funcionário podia
-- dar UPDATE nos próprios itens DEPOIS de pagar — inclusive em `unit_price`,
-- que é exatamente o que a varredura manda pro CIGAM. Fecha a janela que
-- sobrava do problema 1.
--
-- Ele continua podendo CRIAR pedido e LER o que é dele. Admin/RH seguem com
-- ALL pela policy privilegiada. O UPDATE que o Checkout fazia (payment_method
-- / wallet_debited) deixou de existir: agora é a RPC que grava.

drop policy if exists orders_self on public.orders;
create policy orders_self_select on public.orders
  for select to authenticated
  using (employee_id in (select e.id from public.employees e where e.user_id = auth.uid()));
create policy orders_self_insert on public.orders
  for insert to authenticated
  with check (employee_id in (select e.id from public.employees e where e.user_id = auth.uid()));

drop policy if exists order_items_self on public.order_items;
create policy order_items_self_select on public.order_items
  for select to authenticated
  using (order_id in (
    select o.id from public.orders o
    join public.employees e on e.id = o.employee_id
    where e.user_id = auth.uid()
  ));
create policy order_items_self_insert on public.order_items
  for insert to authenticated
  with check (order_id in (
    select o.id from public.orders o
    join public.employees e on e.id = o.employee_id
    where e.user_id = auth.uid()
  ));

-- ============================================================================
-- PARTE 6 — autorização de verdade nas funções que ESTORNAM saldo
-- ============================================================================
--
-- Grant não separa admin de funcionário: os dois são `authenticated`. Quem
-- separa tem de ser a própria função. Estado encontrado em 24/08/2026:
--
--   * `admin_cancel_order_v2` — NENHUMA checagem. `p_actor_cpf` só era
--     gravado no log. Qualquer pessoa logada podia cancelar QUALQUER pedido,
--     e cancelar estorna saldo (via trg_orders_wallet_upd): dava pra receber
--     a mercadoria, cancelar o próprio pedido e ficar com o dinheiro de volta.
--   * `admin_remove_order_item_v2` — checava `is_admin_by_cpf(p_actor_cpf)`,
--     que é autorização por PARÂMETRO: bastava saber o CPF de um admin, que
--     circula em crachá e folha (e até 24/08 vazava inteiro pela
--     `admin_get_employees_basic`).
--
-- Passa a valer a sessão real: `is_privileged_user()` casa employees.user_id
-- com auth.uid(), então não dá pra forjar por parâmetro.

-- Reforça na raiz: quem usa is_admin_by_cpf é o admin_remove_order_item_v2.
-- Vira SECURITY DEFINER porque agora lê employees para valer (a versão antiga
-- dependia de rodar dentro de outra função SECURITY DEFINER para enxergar a
-- tabela sob RLS).
create or replace function public.is_admin_by_cpf(p_cpf text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_privileged_user()
     and exists (
       select 1
       from public.employees e
       where regexp_replace(coalesce(e.cpf,''), '\D', '', 'g')
           = regexp_replace(coalesce(p_cpf,''), '\D', '', 'g')
         and e.role = 'admin'::employee_role
     );
$function$;

-- Recriado a partir de scripts/2026-08-19-remove-estorno-morto-cancelamento.sql,
-- com a checagem de sessão acrescentada no topo. O resto do corpo é idêntico —
-- quem estorna de verdade continua sendo o gatilho disparado pelo UPDATE.
create or replace function public.admin_cancel_order_v2(p_order_id uuid, p_reason text, p_actor_cpf text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order record;
  v_refund bigint := 0;
  v_total bigint := 0;
begin
  if not public.is_privileged_user() then
    raise exception 'Acesso negado: só admin/RH pode cancelar pedido';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if coalesce(v_order.status,'') = 'cancelado' then
    -- idempotente
    return;
  end if;

  v_total := coalesce(v_order.total_cents, 0);
  if v_total <= 0 then
    v_total := round(coalesce(v_order.total_value,0)::numeric * 100);
  end if;

  v_refund := greatest(
    coalesce(v_order.wallet_used_cents,0),
    coalesce(v_order.spent_from_balance_cents,0),
    0
  );

  update public.orders
  set status = 'cancelado',
      cancelled_at = now(),
      cancel_reason = p_reason,
      wallet_refunded = case when v_refund > 0 then true else wallet_refunded end
  where id = p_order_id;

  insert into public.order_admin_actions (id, order_id, actor_cpf, action, reason, created_at)
  values (gen_random_uuid(), p_order_id, p_actor_cpf, 'cancel_order', p_reason, now());
end;
$function$;

-- ============================================================================
-- PARTE 5 — limpeza das policies mortas de `products`
-- ============================================================================
--
-- `products` tinha 10 policies, e nenhuma das 8 de escrita é alcançável: os
-- grants de `anon` e `authenticated` nessa tabela são só SELECT (conferido em
-- 24/08/2026), e quem escreve produto é o webhook, com service role, que
-- ignora RLS. Duas delas nem funcionariam se fossem alcançadas:
--   * `is_admin()` — não é SECURITY DEFINER e consulta employees, o mesmo
--     defeito que já causou "infinite recursion" em 13/08 (ver CLAUDE.md);
--   * `auth.jwt() ->> 'role' = 'admin'` — o role do JWT do Supabase é sempre
--     'authenticated', nunca 'admin', então é sempre falso.
--
-- Sobra `sel_products_public` (public, USING true), que é quem de fato deixa o
-- catálogo ser lido — inclusive por quem ainda não logou. Nada de leitura muda.

drop policy if exists "Produtos - admin CRUD" on public.products;
drop policy if exists mod_products_admin on public.products;
drop policy if exists admin_delete_products on public.products;
drop policy if exists admin_insert_products on public.products;
drop policy if exists admin_update_products on public.products;
drop policy if exists admin_select_products on public.products;
drop policy if exists "Produtos - leitura para autenticados" on public.products;

commit;

-- ============================================================================
-- COMO REVERTER (cada parte é independente)
-- ============================================================================
-- PARTE 4:
--   drop policy orders_self_select on public.orders;
--   drop policy orders_self_insert on public.orders;
--   create policy orders_self on public.orders for all to authenticated
--     using (employee_id in (select e.id from public.employees e where e.user_id = auth.uid()))
--     with check (employee_id in (select e.id from public.employees e where e.user_id = auth.uid()));
--   (idem para order_items_self)
--
-- PARTE 3: grant execute on function <assinatura> to anon;  -- ou authenticated
--
-- PARTE 2/1: as versões antigas estão no histórico do git deste arquivo e em
--   `pg_get_functiondef` de antes da migração — mas reverter a PARTE 1
--   reabre os três buracos de dinheiro. Não reverter sem substituto.
