-- 2026-08-31 — estorno do pedido DUPLICADO do LUCAS.
--
-- GM-20260828-4356 e GM-20260828-5736 sao identicos (mesmos 3 itens, mesmo
-- total, 21 segundos de diferenca). Os dois debitaram R$ 82,90: ele pagou
-- R$ 165,80 por uma compra so. O 5736 foi entregue; o 4356 nunca foi impresso.
--
-- Este e o UNICO dos pedidos em aberto que merece estorno de verdade, e a
-- razao e a data: foi feito em 28/08, DEPOIS da recarga mensal de 27/08 03:00.
-- O debito dele esta vivo no saldo corrente. Todos os outros pendentes sao
-- anteriores a recarga, que reescreveu o saldo de todo mundo — neles o
-- dinheiro ja voltou, e estornar daria credito de graca (ver o script
-- 2026-08-31-cancela-pedidos-orfaos-sem-estorno.sql).
--
-- Quem estorna e o gatilho `handle_wallet_on_orders`: mudar o status para
-- 'cancelado' devolve old.wallet_used_cents ao saldo. Nada de UPDATE manual
-- em employees aqui.
--
-- Conta esperada: 13420 + 8290 = 21710 (R$ 217,10), abaixo do direito de
-- R$ 300,00. A asserção no fim desfaz tudo se nao bater.

begin;

select full_name, credito_mensal_cents as saldo_antes
  from public.employees
 where full_name = 'LUCAS HENRIQUE SANTOS DO NASCIMENTO';

update public.orders
   set status       = 'cancelado',
       cancelled_at = now(),
       cancel_reason = 'Pedido duplicado: identico a GM-20260828-5736, feito 21s antes e ja entregue. Saldo debitado duas vezes pela mesma compra. Estorno em 31/08/2026.'
 where order_number = 'GM-20260828-4356'
   and cancelled_at is null;

do $$
declare
  v_saldo int;
  v_direito int;
  v_refunded boolean;
begin
  select e.credito_mensal_cents, e.credito_direito_cents
    into v_saldo, v_direito
    from public.employees e
   where e.full_name = 'LUCAS HENRIQUE SANTOS DO NASCIMENTO';

  select o.wallet_refunded into v_refunded
    from public.orders o where o.order_number = 'GM-20260828-4356';

  if v_saldo <> 21710 then
    raise exception 'Saldo esperado 21710, veio %. Desfazendo.', v_saldo;
  end if;

  if v_saldo > v_direito then
    raise exception 'Saldo % passou do direito % — nao pode. Desfazendo.', v_saldo, v_direito;
  end if;

  if not coalesce(v_refunded, false) then
    raise exception 'O gatilho nao marcou wallet_refunded. Desfazendo.';
  end if;

  raise notice 'OK: saldo do LUCAS agora e % centavos (direito %).', v_saldo, v_direito;
end $$;

select full_name, credito_mensal_cents as saldo_depois, credito_direito_cents as direito
  from public.employees
 where full_name = 'LUCAS HENRIQUE SANTOS DO NASCIMENTO';

commit;
