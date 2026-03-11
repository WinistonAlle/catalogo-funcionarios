-- Corrige o estorno proporcional de saldo ao remover itens de pedidos no admin.
-- Rode este arquivo no SQL Editor do Supabase.

create or replace function public.admin_recalc_employee_monthly_spend(
  p_employee_id uuid,
  p_month_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_spent integer;
begin
  select coalesce(sum(coalesce(o.spent_from_balance_cents, 0)), 0)::integer
    into v_total_spent
  from public.orders o
  where o.employee_id = p_employee_id
    and o.cancelled_at is null
    and coalesce(o.spent_from_balance_cents, 0) > 0
    and (
      nullif(trim(coalesce(o.month_key, '')), '') = p_month_key
      or (
        nullif(trim(coalesce(o.month_key, '')), '') is null
        and to_char(timezone('America/Sao_Paulo', o.created_at), 'YYYY-MM') = p_month_key
      )
    );

  insert into public.employee_monthly_spend (employee_id, month_key, spent_cents)
  values (p_employee_id, p_month_key, v_total_spent)
  on conflict (employee_id, month_key) do update
    set spent_cents = excluded.spent_cents,
        updated_at = now();
end;
$$;

create or replace function public.admin_remove_order_item_v3(
  p_order_id uuid,
  p_order_item_id uuid,
  p_reason text,
  p_actor_cpf text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_item_json jsonb;
  v_actor record;
  v_employee_id uuid;
  v_month_key text;
  v_order_month_key text;
  v_calendar_month_key text;
  v_current_cycle_key text;
  v_rows_updated integer;
  v_order_total_cents integer;
  v_wallet_used_cents integer;
  v_removed_qty integer;
  v_removed_cents integer;
  v_refund_cents integer;
  v_next_total_cents integer;
  v_next_wallet_cents integer;
  v_next_pickup_cents integer;
  v_next_total_items integer;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo da remoção do item.';
  end if;

  select id, cpf, role
    into v_actor
  from public.employees
  where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_actor_cpf, ''), '\D', '', 'g')
  limit 1;

  if v_actor.id is null then
    raise exception 'CPF do administrador não encontrado.';
  end if;

  if lower(coalesce(v_actor.role::text, '')) <> 'admin' then
    raise exception 'Apenas administradores podem remover itens.';
  end if;

  select
    o.id,
    o.employee_id,
    o.employee_cpf,
    o.created_at,
    o.month_key,
    coalesce(o.total_cents, round(coalesce(o.total_value, 0) * 100)::integer) as total_cents_calc,
    greatest(coalesce(o.wallet_used_cents, o.spent_from_balance_cents, 0), 0) as wallet_used_cents_calc,
    coalesce(o.total_items, 0) as total_items_calc
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido não encontrado.';
  end if;

  select oi.*
  into v_item
  from public.order_items oi
  where oi.id = p_order_item_id
    and oi.order_id = p_order_id
  for update;

  if v_item.id is null then
    raise exception 'Item do pedido não encontrado.';
  end if;

  v_item_json := to_jsonb(v_item);
  v_removed_qty := greatest(coalesce((v_item_json ->> 'quantity')::integer, 0), 0);

  if v_removed_qty <= 0 then
    raise exception 'Quantidade do item inválida.';
  end if;

  v_removed_cents := greatest(
    coalesce((v_item_json ->> 'unit_price_cents')::integer, 0),
    coalesce((v_item_json ->> 'price_cents')::integer, 0),
    round(coalesce((v_item_json ->> 'unit_price')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'price')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'unit_value')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'value')::numeric, 0) * 100)::integer,
    0
  );

  v_order_total_cents := greatest(coalesce(v_order.total_cents_calc, 0), 0);
  v_wallet_used_cents := greatest(coalesce(v_order.wallet_used_cents_calc, 0), 0);
  v_removed_cents := greatest(v_removed_qty * v_removed_cents, 0);
  v_refund_cents := least(v_removed_cents, v_wallet_used_cents);
  v_next_total_cents := greatest(v_order_total_cents - v_removed_cents, 0);
  v_next_wallet_cents := greatest(v_wallet_used_cents - v_refund_cents, 0);
  v_next_pickup_cents := greatest(v_next_total_cents - v_next_wallet_cents, 0);
  v_next_total_items := greatest(coalesce(v_order.total_items_calc, 0) - v_removed_qty, 0);
  v_employee_id := v_order.employee_id;

  if v_employee_id is null then
    select e.id
      into v_employee_id
    from public.employees e
    where regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(v_order.employee_cpf, ''), '\D', '', 'g')
    limit 1;
  end if;

  if v_refund_cents > 0 and v_employee_id is not null then
    v_order_month_key := nullif(trim(coalesce(v_order.month_key, '')), '');
    v_calendar_month_key := to_char(timezone('America/Sao_Paulo', v_order.created_at), 'YYYY-MM');
    v_current_cycle_key := null;

    begin
      select public.current_pay_cycle_key() into v_current_cycle_key;
    exception
      when undefined_function then
        v_current_cycle_key := null;
    end;

    with candidate as (
      select s.month_key
      from public.employee_monthly_spend s
      where s.employee_id = v_employee_id
        and s.month_key in (
          coalesce(v_order_month_key, '__none__'),
          coalesce(v_current_cycle_key, '__none__'),
          v_calendar_month_key
        )
      order by case
        when s.month_key = v_order_month_key then 1
        when s.month_key = v_current_cycle_key then 2
        when s.month_key = v_calendar_month_key then 3
        else 9
      end
      limit 1
    )
    update public.employee_monthly_spend s
      set spent_cents = greatest(coalesce(s.spent_cents, 0) - v_refund_cents, 0)
    from candidate c
    where s.employee_id = v_employee_id
      and s.month_key = c.month_key;

    get diagnostics v_rows_updated = row_count;

    if coalesce(v_rows_updated, 0) = 0 then
      v_month_key := coalesce(v_order_month_key, v_current_cycle_key, v_calendar_month_key);

      insert into public.employee_monthly_spend (employee_id, month_key, spent_cents)
      values (v_employee_id, v_month_key, 0)
      on conflict (employee_id, month_key) do update
        set spent_cents = greatest(coalesce(public.employee_monthly_spend.spent_cents, 0) - v_refund_cents, 0);
    end if;
  end if;

  delete from public.order_items
  where id = p_order_item_id
    and order_id = p_order_id;

  update public.orders
    set
      total_items = v_next_total_items,
      total_cents = v_next_total_cents,
      total_value = v_next_total_cents / 100.0,
      wallet_used_cents = v_next_wallet_cents,
      spent_from_balance_cents = v_next_wallet_cents,
      pay_on_pickup_cents = v_next_pickup_cents,
      wallet_debited = (v_next_wallet_cents > 0),
      wallet_refunded = (v_refund_cents > 0),
      payment_method = (
        case
        when v_next_wallet_cents > 0 and v_next_pickup_cents > 0 then 'mixed'
        when v_next_wallet_cents > 0 then 'wallet'
        else 'pickup'
        end
      )::payment_method
  where id = p_order_id;

  if v_employee_id is not null then
    v_month_key := coalesce(
      nullif(trim(coalesce(v_order.month_key, '')), ''),
      v_current_cycle_key,
      to_char(timezone('America/Sao_Paulo', v_order.created_at), 'YYYY-MM')
    );
    perform public.admin_recalc_employee_monthly_spend(v_employee_id, v_month_key);
  end if;

  insert into public.order_admin_actions (order_id, actor_cpf, action, reason)
  values (
    p_order_id,
    regexp_replace(coalesce(p_actor_cpf, ''), '\D', '', 'g'),
    'remove_item',
    p_reason
  );
end;
$$;


create or replace function public.admin_remove_order_item_qty_v1(
  p_order_id uuid,
  p_order_item_id uuid,
  p_remove_qty integer,
  p_reason text,
  p_actor_cpf text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item record;
  v_item_json jsonb;
  v_actor record;
  v_employee_id uuid;
  v_month_key text;
  v_order_month_key text;
  v_calendar_month_key text;
  v_current_cycle_key text;
  v_rows_updated integer;
  v_order_total_cents integer;
  v_wallet_used_cents integer;
  v_removed_qty integer;
  v_removed_cents integer;
  v_refund_cents integer;
  v_next_total_cents integer;
  v_next_wallet_cents integer;
  v_next_pickup_cents integer;
  v_next_total_items integer;
  v_next_item_qty integer;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Informe o motivo da remoção do item.';
  end if;

  if coalesce(p_remove_qty, 0) <= 0 then
    raise exception 'Quantidade para remover inválida.';
  end if;

  select id, cpf, role
    into v_actor
  from public.employees
  where regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(p_actor_cpf, ''), '\D', '', 'g')
  limit 1;

  if v_actor.id is null then
    raise exception 'CPF do administrador não encontrado.';
  end if;

  if lower(coalesce(v_actor.role::text, '')) <> 'admin' then
    raise exception 'Apenas administradores podem remover itens.';
  end if;

  select
    o.id,
    o.employee_id,
    o.employee_cpf,
    o.created_at,
    o.month_key,
    coalesce(o.total_cents, round(coalesce(o.total_value, 0) * 100)::integer) as total_cents_calc,
    greatest(coalesce(o.wallet_used_cents, o.spent_from_balance_cents, 0), 0) as wallet_used_cents_calc,
    coalesce(o.total_items, 0) as total_items_calc
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'Pedido não encontrado.';
  end if;

  select oi.*
  into v_item
  from public.order_items oi
  where oi.id = p_order_item_id
    and oi.order_id = p_order_id
  for update;

  if v_item.id is null then
    raise exception 'Item do pedido não encontrado.';
  end if;

  v_item_json := to_jsonb(v_item);
  v_next_item_qty := greatest(coalesce((v_item_json ->> 'quantity')::integer, 0), 0);

  if p_remove_qty >= v_next_item_qty then
    perform public.admin_remove_order_item_v3(p_order_id, p_order_item_id, p_reason, p_actor_cpf);
    return;
  end if;

  v_removed_cents := greatest(
    coalesce((v_item_json ->> 'unit_price_cents')::integer, 0),
    coalesce((v_item_json ->> 'price_cents')::integer, 0),
    round(coalesce((v_item_json ->> 'unit_price')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'price')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'unit_value')::numeric, 0) * 100)::integer,
    round(coalesce((v_item_json ->> 'value')::numeric, 0) * 100)::integer,
    0
  );

  v_order_total_cents := greatest(coalesce(v_order.total_cents_calc, 0), 0);
  v_wallet_used_cents := greatest(coalesce(v_order.wallet_used_cents_calc, 0), 0);
  v_removed_qty := p_remove_qty;
  v_removed_cents := greatest(v_removed_qty * v_removed_cents, 0);
  v_refund_cents := least(v_removed_cents, v_wallet_used_cents);
  v_next_total_cents := greatest(v_order_total_cents - v_removed_cents, 0);
  v_next_wallet_cents := greatest(v_wallet_used_cents - v_refund_cents, 0);
  v_next_pickup_cents := greatest(v_next_total_cents - v_next_wallet_cents, 0);
  v_next_total_items := greatest(coalesce(v_order.total_items_calc, 0) - v_removed_qty, 0);
  v_next_item_qty := greatest(v_next_item_qty - v_removed_qty, 0);
  v_employee_id := v_order.employee_id;

  if v_employee_id is null then
    select e.id
      into v_employee_id
    from public.employees e
    where regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = regexp_replace(coalesce(v_order.employee_cpf, ''), '\D', '', 'g')
    limit 1;
  end if;

  if v_refund_cents > 0 and v_employee_id is not null then
    v_order_month_key := nullif(trim(coalesce(v_order.month_key, '')), '');
    v_calendar_month_key := to_char(timezone('America/Sao_Paulo', v_order.created_at), 'YYYY-MM');
    v_current_cycle_key := null;

    begin
      select public.current_pay_cycle_key() into v_current_cycle_key;
    exception
      when undefined_function then
        v_current_cycle_key := null;
    end;

    with candidate as (
      select s.month_key
      from public.employee_monthly_spend s
      where s.employee_id = v_employee_id
        and s.month_key in (
          coalesce(v_order_month_key, '__none__'),
          coalesce(v_current_cycle_key, '__none__'),
          v_calendar_month_key
        )
      order by case
        when s.month_key = v_order_month_key then 1
        when s.month_key = v_current_cycle_key then 2
        when s.month_key = v_calendar_month_key then 3
        else 9
      end
      limit 1
    )
    update public.employee_monthly_spend s
      set spent_cents = greatest(coalesce(s.spent_cents, 0) - v_refund_cents, 0)
    from candidate c
    where s.employee_id = v_employee_id
      and s.month_key = c.month_key;

    get diagnostics v_rows_updated = row_count;

    if coalesce(v_rows_updated, 0) = 0 then
      v_month_key := coalesce(v_order_month_key, v_current_cycle_key, v_calendar_month_key);

      insert into public.employee_monthly_spend (employee_id, month_key, spent_cents)
      values (v_employee_id, v_month_key, 0)
      on conflict (employee_id, month_key) do update
        set spent_cents = greatest(coalesce(public.employee_monthly_spend.spent_cents, 0) - v_refund_cents, 0);
    end if;
  end if;

  update public.order_items
    set quantity = v_next_item_qty
  where id = p_order_item_id
    and order_id = p_order_id;

  update public.orders
    set
      total_items = v_next_total_items,
      total_cents = v_next_total_cents,
      total_value = v_next_total_cents / 100.0,
      wallet_used_cents = v_next_wallet_cents,
      spent_from_balance_cents = v_next_wallet_cents,
      pay_on_pickup_cents = v_next_pickup_cents,
      wallet_debited = (v_next_wallet_cents > 0),
      wallet_refunded = (v_refund_cents > 0),
      payment_method = (
        case
        when v_next_wallet_cents > 0 and v_next_pickup_cents > 0 then 'mixed'
        when v_next_wallet_cents > 0 then 'wallet'
        else 'pickup'
        end
      )::payment_method
  where id = p_order_id;

  if v_employee_id is not null then
    v_month_key := coalesce(
      nullif(trim(coalesce(v_order.month_key, '')), ''),
      v_current_cycle_key,
      to_char(timezone('America/Sao_Paulo', v_order.created_at), 'YYYY-MM')
    );
    perform public.admin_recalc_employee_monthly_spend(v_employee_id, v_month_key);
  end if;

  insert into public.order_admin_actions (order_id, actor_cpf, action, reason)
  values (
    p_order_id,
    regexp_replace(coalesce(p_actor_cpf, ''), '\D', '', 'g'),
    'remove_item_qty',
    p_reason
  );
end;
$$;

grant execute on function public.admin_remove_order_item_v3(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_remove_order_item_qty_v1(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.admin_recalc_employee_monthly_spend(uuid, text) to authenticated;
