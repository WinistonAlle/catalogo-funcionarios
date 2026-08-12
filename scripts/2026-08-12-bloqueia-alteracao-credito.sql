-- ============================================================================
-- Impede que o cliente (chave anon) altere o saldo do funcionário.
-- Aplicado em 12/08/2026. Ver o bloco de segurança no CLAUDE.md.
-- ============================================================================
--
-- POR QUE
--
-- A chave anon está embutida no bundle JS (pública por construção) e tinha
-- UPDATE em public.employees, com a política `employees_update_all` valendo
-- USING (true). Resultado: qualquer pessoa podia alterar credito_mensal_cents
-- de qualquer funcionário — inclusive dar saldo a si mesma — e, com o disparo
-- automático ligado, o pedido iria ao CIGAM em até 2 minutos.
--
-- POR QUE NÃO DROPAR A POLÍTICA `employees_update_all`
--
-- Porque hoje ela é a ÚNICA coisa que faz as telas de Admin/RH funcionarem: os
-- 5 admins e os 2 usuários de RH estão com auth_user_id NULL e hr_users está
-- vazia, então as políticas `_hr`/`_rh` (que dependem de auth.uid()) não casam
-- com ninguém. Dropar derrubaria o RH na hora.
--
-- POR QUE NÃO REVOGAR A COLUNA (`revoke update (credito_mensal_cents)`)
--
-- upsertEmployee faz `.update(updates)` espalhando um objeto que veio de
-- `select("*")`, então a coluna pode ir junto no payload mesmo sem ninguém
-- querer mudá-la — e o revoke por coluna recusa pelo simples fato de a coluna
-- estar presente. Quebraria a edição de funcionário sem necessidade.
--
-- A ABORDAGEM
--
-- Um gatilho que só barra quando o valor MUDA DE FATO e só quando vem do
-- navegador. Quem escreve saldo legitimamente não é afetado:
--   * place_order_with_wallet_v2 / gm_apply_balance_delta — SECURITY DEFINER,
--     rodam como `postgres`;
--   * sincronização da planilha e webhook de operações — `service_role`.
-- Nenhuma tela do frontend escreve credito_mensal_cents (conferido em
-- 12/08/2026), então nada legítimo passa por aqui vindo de `anon`.
-- ============================================================================

begin;

create or replace function public.gm_bloquear_alteracao_de_credito()
returns trigger
language plpgsql
as $$
begin
  -- Só barra alteração de verdade: um UPDATE que reenvia o mesmo valor (o que
  -- a tela de RH faz ao salvar o funcionário inteiro) passa sem ruído.
  if new.credito_mensal_cents is distinct from old.credito_mensal_cents
     and current_user in ('anon', 'authenticated') then
    raise exception
      'credito_mensal_cents nao pode ser alterado pelo cliente (papel %). Use o webhook de operacoes ou a sincronizacao da planilha.',
      current_user
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_bloqueia_credito on public.employees;

create trigger trg_employees_bloqueia_credito
  before update of credito_mensal_cents on public.employees
  for each row execute function public.gm_bloquear_alteracao_de_credito();

commit;

-- Para reverter:
--   drop trigger if exists trg_employees_bloqueia_credito on public.employees;
