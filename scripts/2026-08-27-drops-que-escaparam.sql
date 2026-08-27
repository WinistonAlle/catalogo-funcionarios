-- Complemento da migração de 27/08/2026.
--
-- As quatro funções abaixo escaparam do primeiro DROP porque eu adivinhei a
-- ORDEM dos parâmetros e errei: `admin_remove_order_item_v3` recebe
-- (p_order_id, p_order_item_id, p_reason, p_actor_cpf), e não
-- (p_actor_cpf, p_order_id, ...). `drop function` casa por assinatura, então
-- o comando errado responde "does not exist, skipping" — em NOTICE, não em
-- erro. Lição: conferir com pg_get_function_identity_arguments antes, e sempre
-- reconferir o que sobrou depois de um drop em lote.
--
-- As duas primeiras são as perigosas: chamavam
-- admin_recalc_employee_monthly_spend (já removida) e continuam expostas pelo
-- PostgREST a qualquer usuário privilegiado.

begin;

drop function if exists public.admin_remove_order_item_v3(uuid, uuid, text, text);
drop function if exists public.admin_remove_order_item_qty_v1(uuid, uuid, integer, text, text);
drop function if exists public.admin_cancel_order(uuid, text, text);
drop function if exists public.place_order_with_wallet(uuid, boolean);

commit;
