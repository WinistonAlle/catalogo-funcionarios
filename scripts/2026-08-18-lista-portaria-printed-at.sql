-- =====================================================================
-- 18/08/2026 — Coluna para a lista de separação impressa na portaria
-- =====================================================================
--
-- NULL = pedido ainda não impresso. A rotina automation/print/portariaList.ts
-- marca a hora real só depois de a impressora confirmar que o job terminou
-- (nunca antes) — ver aguardarJob em automation/print/printClient.ts.
--
-- Spec: docs/superpowers/specs/2026-08-18-lista-portaria-design.md

alter table public.orders
  add column if not exists printed_at timestamptz;
