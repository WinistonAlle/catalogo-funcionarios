-- 2026-08-31 — fecha os pedidos orfaos SEM estornar saldo.
--
-- Sao 13 pedidos de julho/2026, feitos com o sistema fora do ar (nunca
-- entraram no CIGAM, nunca foram separados), mais o GM-20260811-4844 do IAN,
-- que era teste. Ficaram em 'pedido_feito' desde entao, com printed_at que e
-- ficcao do backfill de 19/08 (ver PRINTED_AT_DO_BACKFILL no webhook).
--
-- ⚠️ POR QUE NAO PODE ESTORNAR — e o ponto inteiro deste script.
--
-- O gatilho `handle_wallet_on_orders` devolve old.wallet_used_cents ao saldo
-- assim que o status vira 'cancelado'. Aqui isso seria ERRADO duas vezes:
--
--   1. O dinheiro JA VOLTOU. A recarga mensal de 27/08 03:00 reescreve
--      credito_mensal_cents de todo mundo com o valor da planilha — ela nao
--      desconta o que foi gasto antes, ela SUBSTITUI. Todo debito anterior a
--      essa data foi apagado por ela. Prova: 11 dos 14 estao hoje com saldo
--      exatamente igual ao direito (30000).
--
--   2. Estourava o teto. O direito e R$ 300,00. Com estorno o VESPARZIANO
--      iria a R$ 500,90, o WENDERSON a R$ 418,00, o IAN a R$ 369,00.
--
-- COMO SE EVITA O ESTORNO. O gatilho so devolve se
-- `old.wallet_refunded = false`. E ele e um trigger POR COLUNA
-- (BEFORE UPDATE OF status, total_cents, pay_on_pickup_cents, employee_id,
-- employee_cpf), entao mexer so em wallet_refunded NAO o dispara. Por isso
-- sao dois passos, nesta ordem: marca refunded, depois cancela.
--
-- `wallet_refunded = true` aqui nao e mentira: o dinheiro voltou de fato ao
-- funcionario, pela recarga do dia 27 — so nao foi por este caminho.
--
-- A asserção compara a SOMA de todos os saldos antes e depois. Qualquer
-- centavo de diferenca desfaz tudo.

begin;

create temp table saldo_antes on commit drop as
  select id, credito_mensal_cents from public.employees;

create temp table alvos on commit drop as
  select id, order_number, employee_name, wallet_used_cents
    from public.orders
   where order_number in (
     'GM-20260701-4498','GM-20260701-7548','GM-20260710-5993','GM-20260710-2355',
     'GM-20260710-4511','GM-20260710-7587','GM-20260710-4353','GM-20260711-9754',
     'GM-20260713-6586','GM-20260714-8102','GM-20260717-2485','GM-20260717-2171',
     'GM-20260718-9085','GM-20260811-4844'
   )
     and cancelled_at is null;

select count(*) as alvos_encontrados from alvos;

-- Passo 1: fecha a porta do estorno. Nao dispara o gatilho.
update public.orders
   set wallet_refunded = true
 where id in (select id from alvos);

-- Passo 2: cancela. O gatilho dispara, ve wallet_refunded ja true e nao mexe
-- em saldo nenhum.
update public.orders
   set status        = 'cancelado',
       cancelled_at  = now(),
       cancel_reason = 'Fechado em 31/08/2026: pedido feito com o sistema fora do ar, nunca entrou no CIGAM nem foi separado. Sem estorno — o saldo ja havia sido restituido pela recarga mensal de 27/08.'
 where id in (select id from alvos);

do $$
declare
  v_dif int;
  v_abertos int;
begin
  select count(*) into v_dif
    from public.employees e
    join saldo_antes a on a.id = e.id
   where e.credito_mensal_cents <> a.credito_mensal_cents;

  if v_dif > 0 then
    raise exception '% funcionario(s) tiveram o saldo alterado. Nenhum podia. Desfazendo.', v_dif;
  end if;

  select count(*) into v_abertos
    from public.orders o
    join alvos t on t.id = o.id
   where o.cancelled_at is null;

  if v_abertos > 0 then
    raise exception '% pedido(s) continuam abertos. Desfazendo.', v_abertos;
  end if;

  raise notice 'OK: pedidos fechados e nenhum saldo mexeu.';
end $$;

select o.order_number, o.employee_name, o.status, o.cancelled_at is not null as cancelado,
       e.credito_mensal_cents as saldo, e.credito_direito_cents as direito
  from public.orders o
  join alvos t on t.id = o.id
  left join public.employees e on e.id = o.employee_id
 order by o.order_number;

commit;
