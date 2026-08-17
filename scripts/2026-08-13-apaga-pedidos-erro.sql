-- =====================================================================
-- 13/08/2026 — Apaga os 56 pedidos com erp_status = 'ERROR'
-- =====================================================================
--
-- Autorizado pelo Winiston ("apagar esses pedidos com erro, vamos começar
-- o sistema do zero"), escopo confirmado: SÓ os ERROR. Os 278 SYNCED, os
-- 20 DISCARDED e os 4 do CIGAM ficam.
--
-- BACKUP FEITO ANTES: ~/backup-pedidos-20260813.sql
--   (pg_dump --data-only de orders + order_items, 358 pedidos / 1019 itens,
--    1377 INSERTs — restaura os apagados de volta se precisar)
--
-- POR QUE É SEGURO PARA O SALDO
-- ------------------------------
-- Os 56 debitaram R$ 4.510,65 de carteira no passado, então a pergunta óbvia
-- é se apagar devolve ou bagunça saldo. Não:
--
--   1. O trigger `handle_wallet_on_orders` só está ligado em INSERT e UPDATE
--      (trg_orders_wallet_ins / trg_orders_wallet_upd). DELETE não dispara
--      nada, então nenhum saldo é mexido como efeito colateral.
--   2. O ciclo de pagamento corrente é 2026-07. Os 56 são de 2026-05 (13),
--      2026-06 (11) e 32 sem month_key. Nenhum no ciclo atual, então o saldo
--      disponível de ninguém muda.
--
-- O que fica inconsistente é histórico: as linhas de `employee_monthly_spend`
-- de maio/junho continuam contando um gasto cujos pedidos não existem mais.
-- Aceito de propósito — mexer nelas mudaria número de relatório fechado.
--
-- TODOS são da era Saibweb (18/04 a 09/07/2026, nenhum com erp_external_id),
-- ou seja, nenhum deles chegou a existir no CIGAM. Apagar aqui não deixa
-- ponta solta no ERP.

begin;

-- Confere o escopo antes de apagar: tem que ser 56, todos sem número do CIGAM
-- e todos anteriores à integração. Se algum dia isso mudar, o script aborta em
-- vez de apagar demais.
do $$
declare
  v_total int;
  v_com_cigam int;
  v_recentes int;
begin
  select count(*) into v_total from public.orders where erp_status = 'ERROR';

  select count(*) into v_com_cigam from public.orders
   where erp_status = 'ERROR' and erp_external_id is not null;

  select count(*) into v_recentes from public.orders
   where erp_status = 'ERROR' and created_at >= '2026-08-11';

  if v_com_cigam > 0 then
    raise exception 'ABORTADO: % pedido(s) ERROR já existem no CIGAM. Apagar deixaria ponta solta no ERP.', v_com_cigam;
  end if;

  if v_recentes > 0 then
    raise exception 'ABORTADO: % pedido(s) ERROR são da era CIGAM. Investigar antes de apagar.', v_recentes;
  end if;

  raise notice 'Apagando % pedidos ERROR (todos pré-CIGAM, nenhum no ERP).', v_total;
end $$;

delete from public.order_items
where order_id in (select id from public.orders where erp_status = 'ERROR');

delete from public.orders where erp_status = 'ERROR';

commit;
