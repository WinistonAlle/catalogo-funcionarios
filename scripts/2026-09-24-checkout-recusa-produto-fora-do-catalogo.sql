-- ============================================================================
-- Checkout recusa produto oculto, inativo ou sem código CIGAM.
-- Aplicado em 24/09/2026.
--
-- POR QUE: GM-20260918-2219 comprou 4 potes de alho OMG que estavam OCULTOS
-- no catálogo e sem código CIGAM. O RPC não olhava nada disso: debitou o
-- saldo, o pedido foi entregue, e a integração
-- travou em "Produto sem código CIGAM" por 6 dias. A tela esconde o produto,
-- mas quem decide o que pode ser pago é este RPC, então a regra mora aqui.
--
-- Só acrescenta uma checagem logo depois da de itens ruins. O resto da função
-- é idêntico ao que estava no banco. CREATE OR REPLACE preserva os GRANTs
-- (authenticated, service_role).
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION public.place_order_with_wallet_v2(p_employee_id uuid, p_order_id uuid, p_use_wallet boolean DEFAULT true)
 RETURNS TABLE(total_cents bigint, wallet_used_cents bigint, pay_on_pickup_cents bigint, month_key text, new_spent_cents bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order          record;
  v_owner_user_id  uuid;
  v_wallet_balance bigint;
  v_total_cents    bigint;
  v_month_key      text;
  v_itens_ruins    int;
  v_itens_fora     text;
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

  -- Produto fora do catálogo não pode ser pago (24/09/2026). Oculto, inativo
  -- ou sem código CIGAM: o pedido passava aqui, debitava o saldo e travava na
  -- integração, porque não há como lançar no ERP item sem código. Foi o caso
  -- do GM-20260918-2219: 4 potes de alho OMG ocultos no catálogo, pagos
  -- mesmo assim.
  select string_agg(distinct p.name, ', ' order by p.name) into v_itens_fora
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and (coalesce(p.active, false) = false
         or coalesce(p.is_hidden, false) = true
         or coalesce(trim(p.cigam_code), '') = '');

  if v_itens_fora is not null then
    raise exception 'Produto indisponível no catálogo: %. Remova do carrinho e tente de novo.', v_itens_fora;
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

commit;
