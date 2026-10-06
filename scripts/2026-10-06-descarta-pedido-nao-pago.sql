-- ============================================================================
-- Checkout descarta o pedido quando a cobrança é recusada.
-- Aplicado em 06/10/2026.
--
-- POR QUE: o Checkout cria o pedido (insert direto) e só DEPOIS cobra pelo
-- place_order_with_wallet_v2. Quando o RPC recusa (produto fora do catálogo,
-- saldo insuficiente), a exceção desfaz só a cobrança: o pedido continua lá,
-- sem pagamento, e aparece no Admin como "N/D" e "Aguardando CIGAM" para
-- sempre. Caso real: CARLA CRISTINA DE CAMPOS SERPA, GM-20261006-8069 e
-- GM-20261006-8810, com potes de alho OMG ocultos no carrinho.
--
-- O funcionário não tem UPDATE nem DELETE em orders, por isso SECURITY
-- DEFINER, com as mesmas travas de dono do place_order_with_wallet_v2.
-- Apagar (e não cancelar) é seguro aqui porque o pedido nunca debitou nada:
-- orders não tem gatilho de DELETE, e o estorno do gatilho de UPDATE é
-- justamente o que não pode rodar para um débito que não existiu.
-- ============================================================================

begin;

create or replace function public.descartar_pedido_nao_pago(p_order_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order         record;
  v_owner_user_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  select user_id into v_owner_user_id
  from public.employees
  where id = v_order.employee_id;

  if not public.is_privileged_user() then
    if v_owner_user_id is null or auth.uid() is null or v_owner_user_id <> auth.uid() then
      raise exception 'Acesso negado: este pedido não é seu';
    end if;
  end if;

  -- Qualquer sinal de pagamento, de envio ao ERP ou de idade recusa: este
  -- caminho existe só para o pedido que acabou de nascer e não foi pago.
  if coalesce(v_order.wallet_debited, false)
     or coalesce(v_order.wallet_used_cents, 0) > 0
     or v_order.payment_method is not null
     or v_order.erp_external_id is not null
     or v_order.cancelled_at is not null
     or v_order.created_at < now() - interval '1 hour' then
    return false;
  end if;

  delete from public.orders where id = p_order_id;
  return true;
end;
$function$;

revoke all on function public.descartar_pedido_nao_pago(uuid) from public, anon;
grant execute on function public.descartar_pedido_nao_pago(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
