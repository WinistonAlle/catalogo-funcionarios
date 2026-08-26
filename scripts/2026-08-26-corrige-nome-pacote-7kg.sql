-- 2026-08-26 — o nome dos dois pães para de mentir o peso.
--
-- `002006000017` e `002006000016` dizem "Pacote 6kg" mas têm weight = 7 desde a
-- correção de 06/08/2026 contra a tabela 005 do CIGAM. O peso 7 é o CERTO — foi
-- ele que consertou o preço (R$ 44,80) e a baixa de estoque no ERP. Quem estava
-- errado sempre foi o nome: o funcionário lia "6kg" e pagava por 7.
--
-- Só o texto muda. `weight`, `employee_price` e `cigam_code` ficam intactos —
-- preço = employee_price × weight (src/lib/pricing.ts), então mexer em qualquer
-- um deles seria reajuste, não correção de rótulo.

begin;

select cigam_code, name, weight, employee_price
  from public.products
 where cigam_code in ('002006000017', '002006000016');

update public.products
   set name = replace(name, 'Pacote 6kg', 'Pacote 7kg')
 where cigam_code in ('002006000017', '002006000016')
   and name like '%Pacote 6kg%';

select cigam_code, name, weight, employee_price
  from public.products
 where cigam_code in ('002006000017', '002006000016');

commit;
