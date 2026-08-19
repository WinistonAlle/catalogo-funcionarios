-- ============================================================================
-- Remove a chamada morta (e perigosa) a gm_apply_balance_delta em
-- admin_cancel_order_v2
-- ============================================================================
--
-- O QUE ESTAVA ACONTECENDO
--
-- admin_cancel_order_v2 chamava gm_apply_balance_delta(employee_id, v_refund)
-- pra devolver o saldo do pedido cancelado. Essa função "adivinha" a tabela
-- certa por introspecção (information_schema) e SEMPRE encontra
-- employee_monthly_spend primeiro (nome bate com o padrão employee_month%) —
-- então o estorno vai pra spent_cents, uma coluna que nunca é incrementada em
-- lugar nenhum do fluxo normal. Ou seja: essa chamada é um no-op.
--
-- O cancelamento funciona hoje MESMO ASSIM, por um motivo à parte: o UPDATE
-- que este mesmo function faz em orders (status = 'cancelado') dispara o
-- gatilho trg_orders_wallet_upd (handle_wallet_on_orders), que tem sua
-- PRÓPRIA lógica de estorno e credita employees.credito_mensal_cents
-- corretamente. É esse gatilho — não a chamada explícita — quem devolve o
-- dinheiro de verdade.
--
-- POR QUE REMOVER EM VEZ DE CONSERTAR gm_apply_balance_delta
--
-- Se um dia alguém corrigir gm_apply_balance_delta pra também aceitar
-- credito_mensal_cents como alvo válido, o cancelamento passaria a estornar
-- em DOBRO (uma vez pelo gatilho, outra pela chamada explícita) — sem que
-- ninguém ligasse os dois fatos. É mais seguro deixar só o gatilho fazer o
-- trabalho (que já é o comportamento real hoje) e tirar a chamada morta que
-- passa a falsa impressão de que o estorno é feito aqui.
-- ============================================================================

begin;

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

  -- total em cents (prioriza total_cents, fallback total_value * 100)
  v_total := coalesce(v_order.total_cents, 0);
  if v_total <= 0 then
    v_total := round(coalesce(v_order.total_value,0)::numeric * 100);
  end if;

  -- quanto foi pago no saldo (wallet_used_cents ou spent_from_balance_cents)
  -- — só pra registro/diagnóstico agora: quem estorna de verdade é o
  -- gatilho trg_orders_wallet_upd, disparado pelo UPDATE logo abaixo.
  v_refund := greatest(
    coalesce(v_order.wallet_used_cents,0),
    coalesce(v_order.spent_from_balance_cents,0),
    0
  );

  -- atualiza pedido — este UPDATE (status -> 'cancelado') é o que dispara
  -- o estorno real em employees.credito_mensal_cents, via handle_wallet_on_orders.
  update public.orders
  set status = 'cancelado',
      cancelled_at = now(),
      cancel_reason = p_reason,
      wallet_refunded = case when v_refund > 0 then true else wallet_refunded end
  where id = p_order_id;

  -- registra ação
  insert into public.order_admin_actions (id, order_id, actor_cpf, action, reason, created_at)
  values (gen_random_uuid(), p_order_id, p_actor_cpf, 'cancel_order', p_reason, now());
end;
$function$;

commit;

-- Para reverter: recriar com a chamada a gm_apply_balance_delta de volta
-- (não recomendado — ela não fazia nada além de mascarar de onde vem o
-- estorno de verdade).
