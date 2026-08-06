-- =====================================================================
-- Atualizacao do banco — catalogo-funcionarios — 06/08/2026
--
-- Rodar no SQL Editor do Supabase. O Postgres nao e acessivel de fora do
-- servidor (portas 54322/5432 filtradas), por isso isso e manual.
--
-- A PARTE 1 e obrigatoria e segura: roda direto.
-- As PARTES 2 e 3 estao COMENTADAS de proposito — leia antes de descomentar.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — OBRIGATORIA: estoque em tempo real (CIGAM -> catalogo)
-- Aditiva e idempotente. Nao altera nenhum dado existente.
-- =====================================================================

-- Semantica do stock_qty (o app depende disso):
--   numero >= 0  -> saldo real. 0 bloqueia a compra no catalogo.
--   NULL         -> DESCONHECIDO, nao "zero". Pode ser material sem linha de
--                   estoque no CIGAM, ou a consulta pode ter falhado. O app
--                   trata como DISPONIVEL (fail-open) de proposito: melhor
--                   deixar passar um pedido do que bloquear o funcionario por
--                   falha tecnica nossa.
--
-- Nao confundir com a coluna ja existente `in_stock` (booleano manual, mexido
-- pelo admin na tela). As duas convivem: in_stock = false bloqueia sempre,
-- independente do que o CIGAM disser.

alter table public.products
  add column if not exists stock_qty numeric;

alter table public.products
  add column if not exists stock_synced_at timestamptz;

comment on column public.products.stock_qty is
  'Saldo disponivel no CIGAM (fisico menos demanda em carteira) na ultima sincronizacao. NULL = desconhecido, tratado como disponivel pelo app (fail-open). 0 = sem estoque, bloqueia a compra.';

comment on column public.products.stock_synced_at is
  'Quando stock_qty foi atualizado pela ultima vez pelo sync do CIGAM.';

create index if not exists products_stock_sync_idx
  on public.products (cigam_code)
  where cigam_code is not null;


-- =====================================================================
-- PARTE 2 — OPCIONAL: pesos zerados dos produtos KG
--
-- 44 dos 106 produtos KG estao com weight = 0. Em 37 deles nao ha problema
-- pratico: sao "Pacote 1kg" e o codigo cai num fallback de peso = 1, que por
-- acaso e o valor certo. Nos 7 abaixo o fallback erra.
--
-- Efeito de deixar como esta: o valor cobrado do funcionario continua CERTO
-- (quantidade x preco da o mesmo total). O que sai errado e a quantidade em kg
-- mandada ao CIGAM — um pacote de 5kg da baixa de 1kg. Ou seja, o estoque do
-- ERP vai divergindo a cada pedido.
--
-- Voce optou por deixar como esta por ora (06/08/2026), por isso esta
-- comentado. Descomente quando quiser corrigir — de preferencia ANTES de
-- ligar o disparo automatico de pedidos.
-- =====================================================================

-- -- Estes dois da pra deduzir com seguranca do proprio nome do produto:
-- update public.products set weight = 3
--   where cigam_code = '002003000033';  -- Kibe com Creme de Alho 30g – Pacote 3kg
-- update public.products set weight = 5
--   where cigam_code = '002005000027';  -- Pao de Queijo Impar 30g – Pacote 5kg
--
-- -- Estes 5 nao tem o tamanho no nome. NAO chute: confira a embalagem/CIGAM e
-- -- troque o ? pelo peso real em kg antes de rodar.
-- update public.products set weight = ? where cigam_code = '002005000024';  -- PdQ Recheado com Frango
-- update public.products set weight = ? where cigam_code = '002005000039';  -- PdQ Recheado com Goiabada
-- update public.products set weight = ? where cigam_code = '002005000032';  -- PdQ Recheado com Carne
-- update public.products set weight = ? where cigam_code = '002005000033';  -- PdQ Recheado com Linguica Apimentada
-- update public.products set weight = ? where cigam_code = '002004000014';  -- Biscoito 4 Queijo Comprido

-- Conferencia (pode rodar a vontade, so le):
-- select cigam_code, name, weight from public.products
--  where cigam_unit = 'KG' and coalesce(weight, 0) <= 0 order by name;


-- =====================================================================
-- PARTE 3 — OPCIONAL E DESTRUTIVA: limpeza dos restos do Saibweb
--
-- O Saibweb foi substituido pelo CIGAM em julho/2026. Confirmado em
-- 06/08/2026 que NAO existe mais nenhuma referencia a saibweb no codigo
-- (nem em src/, nem em automation/).
--
-- POR QUE AINDA NAO FOI DROPADO: as colunas saibweb_status/saibweb_error em
-- orders foram mantidas como compatibilidade para bundles ANTIGOS do PWA que
-- ainda estivessem no celular/navegador de algum funcionario. O prazo estimado
-- era ~2 semanas a partir de meados de julho — ja passou.
--
-- RISCO REAL: se algum funcionario ainda estiver com um bundle antigo em cache
-- que escreva nessas colunas, o pedido dele passa a falhar. Baixo a essa
-- altura, mas nao zero. Se quiser risco zero, e so nao rodar esta parte: essas
-- colunas nao atrapalham nada, so ocupam espaco.
-- =====================================================================

-- alter table public.orders drop column if exists saibweb_status;
-- alter table public.orders drop column if exists saibweb_error;
-- alter table public.products drop column if exists saibweb_code;
-- drop table if exists public.saibweb_jobs;


-- =====================================================================
-- PARTE 4 — OPCIONAL: sequencia de codigo de pedido que virou codigo morto
--
-- cigam_order_code_seq + next_cigam_order_code() foram criados quando a ideia
-- era NOS gerarmos o numero do pedido no CIGAM (faixa 9xxxxx). Com a migracao
-- para REST puro (06/08/2026), quem gera o numero e o proprio CIGAM — mandamos
-- Codigo vazio no Pedido/Salvar e guardamos o que ele devolve em
-- orders.erp_external_id.
--
-- Confirmado em 06/08/2026 que nada no codigo chama essa funcao. Dropar e
-- seguro; manter tambem nao causa dano. So evita confundir quem abrir o banco
-- daqui a seis meses.
-- =====================================================================

-- drop function if exists public.next_cigam_order_code();
-- drop sequence if exists public.cigam_order_code_seq;
