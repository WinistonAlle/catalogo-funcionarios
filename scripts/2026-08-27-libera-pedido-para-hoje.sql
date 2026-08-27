-- 2026-08-27 — "Liberar para hoje": o pedido tardio que o RH autoriza a sair
-- no mesmo dia.
--
-- Pedido feito depois do corte das 13:40 espera o próximo dia útil, tanto pra
-- lista da portaria quanto pra entrada no CIGAM. Às vezes o RH autoriza um
-- deles a sair no mesmo dia, e até aqui isso acontecia só por voz: o
-- faturamento tinha que ser avisado por fora e caçar o pedido na tela.
--
-- Estas três colunas são a autorização registrada no sistema. Ninguém escreve
-- nelas sem passar pelo botão (RLS: `orders_privileged` — só admin/RH).
alter table public.orders
  add column if not exists released_for_today_at timestamptz,
  add column if not exists released_by_cpf text,
  add column if not exists released_authorized_by text;

comment on column public.orders.released_for_today_at is
  'Quando o pedido foi liberado para separação HOJE, fora do corte das 13:40. Nulo = segue a regra normal (próximo dia útil).';
comment on column public.orders.released_by_cpf is
  'CPF de quem clicou em "Liberar para hoje" (RH ou faturamento).';
comment on column public.orders.released_authorized_by is
  'Quem do RH autorizou, quando o clique foi do faturamento a pedido de alguém. Preenchido com o próprio nome quando o RH libera direto.';

-- A leva da portaria e a varredura do CIGAM procuram por "liberado e ainda
-- não impresso". São poucos pedidos, mas o índice parcial é barato e mantém a
-- consulta imune ao crescimento da tabela.
create index if not exists orders_liberados_para_hoje_idx
  on public.orders (released_for_today_at)
  where released_for_today_at is not null;
