-- ============================================================================
-- CORRIGE BUG: admin_remove_order_item_v2 nunca devolvia saldo de verdade
-- ============================================================================
--
-- O QUE ESTAVA ERRADO
--
-- A função é a que o Admin realmente chama (AdminOrders.tsx, "Remover item").
-- O bloco de estorno procurava por colunas balance_cents / wallet_cents /
-- saldo_cents / balance / wallet / saldo em public.employees pra devolver o
-- valor do item removido. NENHUMA dessas colunas existe — o saldo de verdade
-- é employees.credito_mensal_cents. Resultado: v_has_balance_cents e as
-- outras 5 flags davam sempre false, nenhum ramo do IF/ELSIF executava, e o
-- estorno não acontecia. Sem erro, sem log — o funcionário simplesmente
-- perdia o valor do item removido até o próximo reabastecimento da planilha
-- (dia 27). Já aconteceu 1 vez em produção: order_admin_actions, ação
-- 'remove_item', pedido 8705de2e-ae69-4633-a2d1-5856940123dd, 12/06/2026
-- (funcionário Vitor Hugo Barbosa de Jesus).
--
-- A CORREÇÃO
--
-- Troca o bloco de "adivinhar a coluna certa" por um UPDATE direto em
-- employees.credito_mensal_cents, na mesma linha que
-- place_order_with_wallet_v2 e o refund de admin_cancel_order_v2 (via
-- trigger) já usam. A função continua SECURITY DEFINER, então o gatilho
-- trg_employees_bloqueia_credito (scripts/2026-08-12-bloqueia-alteracao-credito.sql)
-- não barra — ele só bloqueia current_user in ('anon','authenticated').
--
-- Prioriza employee_id (já resolvido na linha do pedido por
-- handle_wallet_on_orders no insert) e cai pro CPF normalizado só se
-- employee_id vier nulo — mesma robustez que admin_remove_order_item_v3 já
-- tinha (essa função nunca foi ligada no frontend, mas acertava essa parte).
-- ============================================================================

begin;

create or replace function public.admin_remove_order_item_v2(
  p_actor_cpf text,
  p_order_id uuid,
  p_order_item_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;

  v_order record;
  v_item  record;

  j_order jsonb;
  j_item  jsonb;

  v_qty numeric := 0;
  v_unit_cents bigint := 0;
  v_item_total_cents bigint := 0;

  v_order_total_cents bigint := 0;
  v_wallet_used_cents bigint := 0;
  v_pickup_cents bigint := 0;

  v_refund_cents bigint := 0;
  v_move_to_pickup_cents bigint := 0;

  v_emp_cpf text := null;
  v_employee_id uuid := null;
begin
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'Motivo (p_reason) é obrigatório';
  end if;

  v_is_admin := public.is_admin_by_cpf(p_actor_cpf);
  if not v_is_admin then
    raise exception 'Acesso negado: CPF não é admin';
  end if;

  -- trava o pedido
  select *
    into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  j_order := to_jsonb(v_order);

  if coalesce(j_order->>'status','') in ('cancelado','entregue') then
    raise exception 'Pedido travado: status=%', (j_order->>'status');
  end if;

  v_emp_cpf := j_order->>'employee_cpf';
  v_employee_id := v_order.employee_id;

  -- trava o item
  select *
    into v_item
  from public.order_items oi
  where oi.id = p_order_item_id
    and oi.order_id = p_order_id
  for update;

  if not found then
    raise exception 'Item do pedido não encontrado';
  end if;

  j_item := to_jsonb(v_item);

  -- quantidade (tolerante: quantity/qtd/qty/amount)
  v_qty :=
    coalesce(
      nullif(j_item->>'quantity','')::numeric,
      nullif(j_item->>'qtd','')::numeric,
      nullif(j_item->>'qty','')::numeric,
      nullif(j_item->>'amount','')::numeric,
      0
    );

  -- preço unitário em centavos (tolerante)
  v_unit_cents :=
    coalesce(
      nullif(j_item->>'unit_price_cents','')::bigint,
      nullif(j_item->>'price_cents','')::bigint,
      nullif(j_item->>'unit_cents','')::bigint,
      nullif(j_item->>'value_cents','')::bigint,
      null
    );

  if v_unit_cents is null then
    -- fallback: unit_price/price/value em reais
    v_unit_cents :=
      greatest(
        0,
        round(
          coalesce(
            nullif(j_item->>'unit_price','')::numeric,
            nullif(j_item->>'price','')::numeric,
            nullif(j_item->>'unit_value','')::numeric,
            nullif(j_item->>'value','')::numeric,
            0
          ) * 100
        )::bigint
      );
  end if;

  v_item_total_cents := greatest(0, round(v_qty * v_unit_cents)::bigint);

  -- totais do pedido (cents). fallback no total_value (reais)
  v_order_total_cents :=
    coalesce(
      nullif(j_order->>'total_cents','')::bigint,
      round(coalesce(nullif(j_order->>'total_value','')::numeric, 0) * 100)::bigint,
      0
    );

  v_wallet_used_cents :=
    coalesce(
      nullif(j_order->>'wallet_used_cents','')::bigint,
      nullif(j_order->>'spent_from_balance_cents','')::bigint,
      0
    );

  v_pickup_cents :=
    coalesce(
      nullif(j_order->>'pay_on_pickup_cents','')::bigint,
      greatest(0, v_order_total_cents - v_wallet_used_cents)
    );

  -- regra:
  -- estorna do saldo até o limite do wallet_used
  v_refund_cents := least(v_item_total_cents, v_wallet_used_cents);
  v_move_to_pickup_cents := greatest(0, v_item_total_cents - v_refund_cents);

  -- remove o item
  delete from public.order_items
  where id = p_order_item_id;

  -- atualiza pedido (sem updated_at)
  update public.orders
  set
    total_cents = greatest(0, v_order_total_cents - v_item_total_cents),
    wallet_used_cents = greatest(0, v_wallet_used_cents - v_refund_cents),
    spent_from_balance_cents = greatest(
      0,
      coalesce(nullif(j_order->>'spent_from_balance_cents','')::bigint, v_wallet_used_cents) - v_refund_cents
    ),
    pay_on_pickup_cents = greatest(0, v_pickup_cents - v_move_to_pickup_cents),
    total_items = greatest(0, coalesce(nullif(j_order->>'total_items','')::int, 0) - 1)
  where id = p_order_id;

  -- histórico
  insert into public.order_admin_actions (order_id, actor_cpf, action, reason)
  values (p_order_id, p_actor_cpf, 'remove_item', p_reason);

  -- =========================================================
  -- Estorno de saldo — direto em employees.credito_mensal_cents,
  -- a coluna que o app inteiro trata como saldo de verdade.
  -- =========================================================
  if v_refund_cents > 0 then
    if v_employee_id is not null then
      update public.employees
      set credito_mensal_cents = coalesce(credito_mensal_cents, 0) + v_refund_cents
      where id = v_employee_id;
    elsif v_emp_cpf is not null then
      update public.employees
      set credito_mensal_cents = coalesce(credito_mensal_cents, 0) + v_refund_cents
      where regexp_replace(coalesce(cpf,''), '\D', '', 'g') = regexp_replace(v_emp_cpf, '\D', '', 'g');
    end if;
  end if;

end;
$function$;

commit;

-- Para reverter: recriar a função com o corpo antigo (ver git blame deste
-- arquivo / migração anterior que a criou) — não recomendado, o bug volta.
