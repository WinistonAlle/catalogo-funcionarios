-- ============================================================================
-- Direito reduzido no meio do ciclo leva o saldo junto.
-- Aplicado em 24/09/2026.
--
-- POR QUE: o RAFAEL PRADO E SILVA recebeu R$ 1.000,00 na recarga de 27/08
-- (direito da planilha na época). Depois a planilha baixou o direito para
-- R$ 300,00, a rodada de cadastro gravou o direito novo, e o saldo ficou em
-- R$ 940,00 (R$ 1.000 menos um pedido de R$ 60) até a recarga seguinte: ele
-- podia gastar R$ 640 além do que a planilha dava. A rodada de cadastro não
-- encosta no saldo de propósito (ver montarLevasDeUpsert), então ninguém
-- fazia a conta.
--
-- A REGRA: se o direito CAI, o saldo cai na mesma diferença, sem ficar
-- negativo. Quem já gastou mais que o direito novo fica com zero. Se o direito
-- SOBE, nada muda aqui: o aumento entra na recarga do dia 27, como sempre.
--
-- POR QUE UMA FUNÇÃO E NÃO UM GATILHO: o gatilho não tem como saber se o
-- UPDATE mandou o saldo ou não. Na recarga (saldo := direito), se o saldo
-- antigo por acaso fosse igual ao direito novo, ele descontaria de novo.
-- Aqui o chamador (a rodada de cadastro do sync) diz explicitamente que é uma
-- redução.
--
-- ATÔMICA E IDEMPOTENTE: um único UPDATE lê o direito antigo e escreve os dois
-- campos na mesma linha travada, então não disputa com o checkout, e rodar de
-- novo não desconta duas vezes (a condição direito > novo deixa de valer).
-- ============================================================================

begin;

create or replace function public.gm_reduz_direito_e_saldo(p_cpf text, p_novo_direito_cents integer)
returns table(saldo_antes integer, saldo_depois integer, direito_antes integer)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  with antes as (
    select e.id, e.credito_mensal_cents as saldo, e.credito_direito_cents as direito
    from public.employees e
    where e.cpf = p_cpf
      and p_novo_direito_cents >= 0
      and e.credito_direito_cents > p_novo_direito_cents
    for update
  )
  update public.employees e
  set credito_direito_cents = p_novo_direito_cents,
      credito_mensal_cents  = greatest(0, antes.saldo - (antes.direito - p_novo_direito_cents))
  from antes
  where e.id = antes.id
  returning antes.saldo, e.credito_mensal_cents, antes.direito;
end;
$$;

-- Mexe em dinheiro: só o sync (service_role) chama.
revoke all on function public.gm_reduz_direito_e_saldo(text, integer) from public, anon, authenticated;
grant execute on function public.gm_reduz_direito_e_saldo(text, integer) to service_role;

commit;

notify pgrst, 'reload schema';
