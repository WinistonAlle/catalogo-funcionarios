-- =====================================================================
-- 13/08/2026 — Limpeza dos restos do Saibweb
-- =====================================================================
--
-- ⚠️ NÃO RODAR SEM O OK DO WINISTON. Substitui as PARTE 3 e 4 (comentadas)
-- de scripts/2026-08-06-atualizacao-banco.sql.
--
-- LEVANTAMENTO (13/08/2026, contado no banco)
-- -------------------------------------------
--   orders.saibweb_status    0 de 358 preenchidos  → vazio
--   orders.saibweb_error     0 de 358 preenchidos  → vazio
--   saibweb_jobs             0 linhas              → vazia
--   cigam_order_code_seq     is_called = false     → nunca usada
--   next_cigam_order_code()  existe, ninguém chama → morta
--   products.saibweb_code    180 de 181 PREENCHIDOS → tem dado, ver PARTE B
--
-- Checagens feitas antes de escrever isto:
--   - Nenhum código funcional referencia saibweb (só comentários explicativos
--     em automation/operations-webhook.ts).
--   - O bundle publicado tem 0 ocorrências de "saibweb", então não há PWA
--     antigo em cache que fosse pedir essas colunas e quebrar.
--   - O projeto vizinho totem-loja, que AINDA usa Saibweb, aponta para outro
--     Supabase (jsltcdtwdeemwchfyylk.supabase.co), não para este banco. Ou
--     seja: nada fora deste projeto depende dessas colunas.

begin;

-- ---------------------------------------------------------------------
-- PARTE A — o que está comprovadamente vazio (risco baixo)
-- ---------------------------------------------------------------------

alter table public.orders drop column if exists saibweb_status;
alter table public.orders drop column if exists saibweb_error;

drop table if exists public.saibweb_jobs;

-- Quem gera o número do pedido hoje é o CIGAM. A sequência nunca chegou a ser
-- usada (is_called = false) e a função não é chamada de lugar nenhum.
drop function if exists public.next_cigam_order_code();
drop sequence if exists public.cigam_order_code_seq;

commit;

-- ---------------------------------------------------------------------
-- PARTE B — products.saibweb_code (tinha 180 de 181 preenchidos)
-- ---------------------------------------------------------------------
--
-- Autorizada pelo Winiston em 13/08/2026, com backup feito antes:
--
--   ~/backup-saibweb-code-20260813.csv   (180 linhas + cabeçalho)
--
-- gerado com:
--   \copy (SELECT id, name, saibweb_code FROM public.products
--          WHERE saibweb_code IS NOT NULL ORDER BY name) TO STDOUT CSV HEADER
--
-- Para restaurar, recrie a coluna e faça UPDATE casando por `id`.

begin;

alter table public.products drop column if exists saibweb_code;

commit;

-- ---------------------------------------------------------------------
-- O QUE ESTE SCRIPT DELIBERADAMENTE NÃO FAZ
-- ---------------------------------------------------------------------
--
-- Os 56 pedidos com erp_status = 'ERROR' ficam como estão. O CLAUDE.md
-- sugeria limpá-los "junto com o resto do Saibweb" porque poluíam qualquer
-- contagem de erro — mas isso deixou de ser verdade em 13/08/2026: o painel
-- de integração passou a classificar por data (CIGAM_NO_AR_DESDE), então
-- eles já não aparecem como problema. Mexer no erp_status de pedido real
-- seria reescrever histórico para resolver um sintoma que não existe mais.
