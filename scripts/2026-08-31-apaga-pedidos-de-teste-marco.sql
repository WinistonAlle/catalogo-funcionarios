-- ============================================================================
-- Apaga os 25 pedidos de teste de marco/2026 (31/08/2026)
-- ============================================================================
--
-- Backup tirado ANTES de rodar isto:
--   ~/backups/orders-20260831-antes-limpeza-marco.sql
--   (pg_dump --data-only de public.orders + public.order_items)
--
-- ESCOPO: tudo que existe em orders antes de 01/04/2026. Sao 25 pedidos de
-- 23 a 25/03, todos em 'aguardando_separacao', das quatro contas de admin
-- (Winiston 18, Julio 4, Mateus 2, Andre 1) — o sistema sendo testado antes
-- de entrar em producao. NENHUM entrou no CIGAM e NENHUM debitou saldo.
--
-- Eram tambem 25 dos 41 pedidos que carregam o printed_at do backfill de
-- 19/08 e por isso apareciam como "impressos e nao entregues" em qualquer
-- consulta ingenua (ver PRINTED_AT_DO_BACKFILL no webhook).
--
-- POR QUE CANCELAR ANTES DE APAGAR — mesmo padrao de
-- 2026-08-26-apaga-pedidos-de-teste.sql, e nao inverta a ordem.
--
-- `orders` tem gatilho de INSERT e de UPDATE, mas NAO tem gatilho de DELETE.
-- Quando ha debito, apagar direto deixaria o valor fora do saldo sem nenhum
-- pedido para justifica-lo. Aqui o debito e zero em todas as 25 linhas, entao
-- o cancelamento nao vai estornar nada — mas o passo fica, porque a ordem
-- certa nao deve depender de alguem lembrar de conferir que o debito era zero.
--
-- order_items cai sozinho: a FK para orders e ON DELETE CASCADE.
--
-- As assercoes desfazem tudo se: o alvo nao for exatamente 25, se alguma
-- linha tiver debito ou numero de CIGAM, ou se qualquer saldo mudar.
-- ============================================================================

begin;

create temp table saldo_antes on commit drop as
  select id, credito_mensal_cents from public.employees;

create temp table alvo on commit drop as
  select id, order_number, employee_name, employee_cpf, total_value,
         wallet_used_cents, wallet_debited, erp_external_id
    from public.orders
   where created_at < '2026-04-01';

select employee_name, count(*), round(sum(total_value),2) as valor
  from alvo group by 1 order by 2 desc;

do $$
declare
  v_total int;
  v_com_debito int;
  v_no_cigam int;
begin
  select count(*) into v_total from alvo;
  if v_total <> 25 then
    raise exception 'Esperava 25 pedidos, achei %. Desfazendo.', v_total;
  end if;

  select count(*) into v_com_debito
    from alvo where coalesce(wallet_used_cents,0) > 0 or coalesce(wallet_debited,false);
  if v_com_debito > 0 then
    raise exception '% pedido(s) tem debito de saldo — nao eram so teste. Desfazendo.', v_com_debito;
  end if;

  select count(*) into v_no_cigam from alvo where erp_external_id is not null;
  if v_no_cigam > 0 then
    raise exception '% pedido(s) entraram no CIGAM — apagar aqui deixaria orfao la. Desfazendo.', v_no_cigam;
  end if;

  raise notice 'Alvo conferido: 25 pedidos, sem debito, sem CIGAM.';
end $$;

-- 1) cancelar (mesmo sem debito, por consistencia com o padrao da casa)
update public.orders o
   set status        = 'cancelado',
       cancelled_at  = now(),
       cancel_reason = 'pedido de teste de marco/2026 - limpeza 31/08/2026'
  from alvo a
 where o.id = a.id
   and coalesce(o.status,'') <> 'cancelado';

-- 2) apagar
delete from public.orders o using alvo a where o.id = a.id;

do $$
declare
  v_dif int;
  v_restantes int;
begin
  select count(*) into v_dif
    from public.employees e join saldo_antes s on s.id = e.id
   where e.credito_mensal_cents <> s.credito_mensal_cents;
  if v_dif > 0 then
    raise exception '% funcionario(s) tiveram saldo alterado. Nenhum podia. Desfazendo.', v_dif;
  end if;

  select count(*) into v_restantes from public.orders where created_at < '2026-04-01';
  if v_restantes > 0 then
    raise exception 'Sobraram % pedidos antes de abril. Desfazendo.', v_restantes;
  end if;

  raise notice 'OK: 25 pedidos apagados, nenhum saldo mexeu.';
end $$;

select count(*) as pedidos_antes_de_abril from public.orders where created_at < '2026-04-01';
select count(*) as itens_orfaos from public.order_items i
  left join public.orders o on o.id = i.order_id where o.id is null;

commit;
