-- 2026-08-31 — trava de pedido duplicado, no banco.
--
-- O caso: em 28/08 o LUCAS teve dois pedidos idênticos com 21 SEGUNDOS de
-- diferença (GM-20260828-4356 e GM-20260828-5736) — mesmos 3 itens, mesmas
-- quantidades, mesmo total. Os dois debitaram R$ 82,90: ele pagou R$ 165,80
-- por uma compra só, e os dois entraram no CIGAM.
--
-- POR QUE NO BANCO, E NÃO NA TELA. O botão do Checkout já tem
-- `disabled={isSubmitting}`, então duplo clique rápido já era barrado — e
-- ainda assim aconteceu, com 21s de intervalo. O modo de falhar que sobra é
-- outro: `place_order_with_wallet_v2` conclui, a RESPOSTA se perde no
-- caminho, o cliente cai no catch, o carrinho não é limpo e a pessoa manda
-- de novo achando que não foi. Nenhuma trava no front cobre isso, porque do
-- ponto de vista do front a primeira tentativa falhou. O pedido é inserido
-- direto pelo cliente (src/services/orders.ts), então o único lugar que
-- enxerga as duas tentativas é o Postgres.
--
-- A JANELA DE 5 MINUTOS não é chute. Levantamento no histórico inteiro:
-- existem 11 pares de pedidos idênticos do mesmo funcionário em até 5 min.
-- NOVE são de 24/03/2026 — Winiston e Mateus testando o sistema antes da
-- produção. Um é de 06/05, e terminou com um dos dois CANCELADO na mão, ou
-- seja, era duplicata mesmo. O último é o do LUCAS. Em uso real, nenhum par
-- idêntico foi intencional. Os intervalos reais observados foram 20s e ~3min,
-- então 5 minutos cobre com folga.
--
-- Pedido cancelado não conta: se a pessoa cancelou e quer refazer, o caminho
-- tem que estar livre.
--
-- SECURITY DEFINER porque o funcionário só enxerga os próprios pedidos pela
-- RLS, e a checagem precisa enxergar a linha anterior mesmo assim.
--
-- Ordem dos gatilhos: os BEFORE INSERT disparam em ordem alfabética, e
-- "trg_orders_bloqueia_duplicado" vem antes de "trg_orders_wallet_ins" — a
-- trava roda antes de qualquer coisa mexer em saldo, que é o que se quer.

begin;

create or replace function public.bloqueia_pedido_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  janela constant interval := interval '5 minutes';
  anterior record;
begin
  -- Sem CPF ou sem total não dá pra comparar nada: deixa passar e que as
  -- outras validações resolvam.
  if new.employee_cpf is null or new.total_value is null or new.total_items is null then
    return new;
  end if;

  select o.order_number, o.created_at
    into anterior
    from public.orders o
   where o.employee_cpf = new.employee_cpf
     and o.total_value  = new.total_value
     and o.total_items  = new.total_items
     and o.cancelled_at is null
     and o.created_at > now() - janela
   order by o.created_at desc
   limit 1;

  if found then
    raise exception
      using
        errcode = 'P0001',
        message = format(
          'Pedido duplicado: você já fez um pedido igual a este (%s) há menos de 5 minutos.',
          anterior.order_number
        ),
        hint = 'Confira em "Meus pedidos" — ele provavelmente já foi registrado. Se quiser mesmo repetir, espere alguns minutos ou ajuste as quantidades.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_bloqueia_duplicado on public.orders;

create trigger trg_orders_bloqueia_duplicado
  before insert on public.orders
  for each row execute function public.bloqueia_pedido_duplicado();

select tgname, pg_get_triggerdef(oid)
  from pg_trigger
 where tgrelid = 'public.orders'::regclass
   and not tgisinternal
 order by tgname;

commit;
