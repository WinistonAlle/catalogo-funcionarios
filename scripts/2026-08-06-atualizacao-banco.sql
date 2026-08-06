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


-- Numero do documento fiscal (serie REC) devolvido pelo CIGAM ao efetivar o
-- pedido. Necessario a partir da efetivacao automatica — ver PARTE 5.
alter table public.orders
  add column if not exists erp_nota_fiscal text;

comment on column public.orders.erp_nota_fiscal is
  'Numero do documento (serie REC) emitido pelo CIGAM na efetivacao automatica do pedido. NULL = ainda nao efetivado, ou a efetivacao falhou (motivo fica em erp_error).';


-- =====================================================================
-- PARTE 2 — pesos dos produtos KG
--
-- Os 106 produtos KG foram auditados em 06/08/2026 contra o cadastro do CIGAM
-- (suprimentos/es/Materiais/Buscar, filtro `Material/Codigo eq '...'`). A
-- descricao do CIGAM traz o peso da embalagem em TODOS eles, sem excecao
-- (ex.: "PAO DE QUEIJO IMPAR 30G PCT 5KG").
--
-- ATENCAO — LEIA ANTES DE MEXER EM PESO:
-- peso NAO e so um dado de estoque, ele DEFINE O PRECO. Ver src/lib/pricing.ts:
--     getUnitPrice = employee_price (preco por KG) x weight
-- Com weight = 0, o codigo cai num fallback de 1. Entao alterar o peso de um
-- produto ALTERA o valor cobrado do funcionario proporcionalmente.
--
-- Por isso esta parte esta dividida em 2A (nao mexe em preco) e 2B (mexe).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 2A — SEGURA: 42 produtos de 1kg que estao com weight = 0
--
-- O fallback ja usava 1, entao o preco cobrado NAO muda em nenhum deles.
-- O ganho e no CIGAM: a quantidade em kg do item do pedido passa a ser
-- explicita em vez de depender de um fallback.
-- ---------------------------------------------------------------------

update public.products set weight = 1
 where cigam_code in (
   '002005000048', '002005000011', '002005000001', '002005000024', '002005000039',
   '002005000032', '002005000033', '002005000061', '002005000003', '002005000002',
   '002003000027', '002005000042', '002005000059', '002005000049', '002007000021',
   '002004000013', '002004000007', '002004000005', '002004000014', '002004000006',
   '002004000004', '002004000008', '002004000017', '002005000015', '002004000016',
   '002005000018', '002005000034', '002007000035', '002002000001', '002007000019',
   '002003000002', '002007000036', '002007000004', '002006000020', '002006000002',
   '002006000004', '002006000005', '002007000006', '002007000010', '002007000005',
   '002007000020', '002007000022'
 );

-- ---------------------------------------------------------------------
-- 2B — MUDA O PRECO COBRADO DO FUNCIONARIO. NAO RODAR SEM DECIDIR.
--
-- Estes 4 produtos estao com o peso errado, e por isso vem sendo vendidos
-- ABAIXO do proporcional ao tamanho da embalagem:
--
--   codigo        embalagem  peso no banco  R$/kg   cobra hoje  passaria a cobrar
--   002005000027  5 kg       0 (usa 1)      10,90   R$ 10,90    R$ 54,50
--   002003000033  3 kg       0 (usa 1)      18,55   R$ 18,55    R$ 55,65
--   002006000017  7 kg       6               6,40   R$ 38,40    R$ 44,80
--   002006000016  7 kg       6               6,40   R$ 38,40    R$ 44,80
--
-- Para dimensionar: o Pao de Queijo Premium de 1 kg custa R$ 14,85. O Impar de
-- 5 kg esta saindo por R$ 10,90 — mais barato que o de 1 kg.
--
-- Ou seja, isto NAO e so uma correcao tecnica: e um reajuste real para quem
-- compra esses 4 itens (num caso, 5x). Precisa de decisao do negocio, e vale
-- avisar os funcionarios antes. Enquanto nao rodar, o unico efeito colateral e
-- a quantidade em kg lancada no CIGAM ficar menor que a real nesses 4 itens.
-- ---------------------------------------------------------------------

-- update public.products set weight = 5 where cigam_code = '002005000027';  -- PdQ Impar 30g PCT 5KG
-- update public.products set weight = 3 where cigam_code = '002003000033';  -- GG Kibe c/ Creme de Alho 30g 3KG
-- update public.products set weight = 7 where cigam_code = '002006000017';  -- Pao Frances Integral 12h 70g PCT 7KG
-- update public.products set weight = 7 where cigam_code = '002006000016';  -- Pao Frances Integral 6h 70g PCT 7KG

-- Conferencia (so le) — lista todo KG cujo peso diverge do que o nome indica:
-- select cigam_code, name, weight from public.products
--  where cigam_unit = 'KG' and coalesce(weight, 0) <= 0 order by name;


-- ---------------------------------------------------------------------
-- 2C — CORRIGE SOBREPRECO LATENTE. Recomendado rodar.
--
-- Em 06/08/2026 os 172 produtos foram auditados contra a TABELA DE PRECO 005
-- do CIGAM (a de funcionario), via genericos/ge/PrecosTabela/Buscar.
-- Resultado: 169 batem centavo a centavo. 3 divergem.
--
-- Nestes 2, o employee_price foi cadastrado como PRECO DO PACOTE, e nao como
-- preco por kg:
--     Enr Salsicha 3kg     : temos 52,50  | CIGAM 005 = 17,50  (52,50 = 3 x 17,50)
--     Bisc Palito Prem 3kg : temos 42,00  | CIGAM 005 = 14,00  (42,00 = 3 x 14,00)
--
-- Como os dois tambem tem weight = 3, e o app hoje faz preco/kg x peso
-- (src/lib/pricing.ts), o valor cobrado sairia MULTIPLICADO DE NOVO:
--     Enr Salsicha     : cobraria R$ 157,50 em vez de R$ 52,50
--     Bisc Palito Prem : cobraria R$ 126,00 em vez de R$  42,00
--
-- IMPORTANTE — isto ainda NAO aconteceu com ninguem. As unicas 2 vendas
-- historicas desses itens (23/03 e 06/05/2026) sairam a R$ 52,50, o valor
-- CORRETO, porque naquela epoca o preco ainda nao era multiplicado pelo peso
-- (o commit e3097c7 "Fix price calculation using kg price and product weight"
-- veio depois). Ou seja: nao ha nada a estornar, mas o proximo funcionario que
-- comprar um desses paga o triplo.
--
-- Corrigir aqui NAO aumenta preco de ninguem: restaura exatamente o valor que
-- sempre foi cobrado (17,50 x 3 = 52,50), agora com a semantica certa.
-- ---------------------------------------------------------------------

update public.products set employee_price = 17.50 where cigam_code = '002003000032';  -- GG Enr Salsicha 30g PCT 3KG
update public.products set employee_price = 14.00 where cigam_code = '002004000003';  -- Bisc Palito Premium 80g PCT 3KG


-- ---------------------------------------------------------------------
-- 2D — A terceira divergencia. RESOLVIDA POR OUTRO CAMINHO — nao rodar.
--
--     Alho Em Creme c/ Pimenta Calabresa OMG Bisnaga (002001000016, unidade CX)
--     temos R$ 25,00  |  CIGAM tabela 005 = R$ 250,00
--
-- Diferenca de 10x, redonda demais para ser coincidencia — poderia ser erro de
-- digitacao de qualquer um dos dois lados (a unidade e CX/caixa: R$ 250 faz
-- sentido se a caixa tem ~10 bisnagas; R$ 25 faz sentido se o cadastro se
-- referir a UMA bisnaga).
--
-- NAO PRECISA MAIS DECIDIR ISSO AGORA: em 06/08/2026 o usuario determinou que a
-- linha "Alho Em Creme" (OMG) sai do catalogo de funcionarios e passa a ser
-- vendida so na loja. Os 8 produtos da linha foram marcados com
-- is_hidden = true (as 4 bisnagas ja estavam ocultas; os 4 potes de 200g foram
-- ocultados nessa data). Ninguem consegue comprar, entao o preco divergente
-- ficou inofensivo.
--
-- Se um dia a linha voltar ao catalogo, resolver o preco ANTES de reexibir.
-- ---------------------------------------------------------------------

-- update public.products set employee_price = 250.00 where cigam_code = '002001000016';


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


-- =====================================================================
-- PARTE 5 — OBRIGATORIA (decisao do usuario 06/08/2026):
-- descartar os pedidos antigos que nunca foram ao CIGAM
--
-- Existem 20 pedidos com erp_status = 'PENDING', do dia 10/07 ate 06/08, que
-- nunca chegaram ao CIGAM porque a integracao ficou desligada esse tempo todo.
-- Eles ja foram resolvidos na pratica (os funcionarios ja receberam), entao
-- lanca-los agora criaria pedido duplicado no ERP.
--
-- Isto NAO apaga nada: so tira esses pedidos da fila do processador, que
-- busca exclusivamente por erp_status = 'PENDING'. O pedido continua inteiro
-- no banco, com historico, itens e valores intactos. Da pra reverter trocando
-- 'DISCARDED' de volta por 'PENDING'.
--
-- erp_status nao e lido em lugar nenhum do frontend (conferido em 06/08/2026),
-- entao um valor novo nao quebra tela nenhuma.
--
-- ATENCAO AO CORTE DE DATA: o filtro abaixo pega tudo que foi criado ANTES de
-- 07/08. Isso inclui os 20 atuais — inclusive o de hoje (GM-20260806-2508, da
-- CARLA CRISTINA). Se voce quiser que o pedido de hoje VA para o CIGAM em vez
-- de ser descartado, troque a data por '2026-08-06'.
--
-- O corte por data existe justamente para nao descartar pedidos novos, caso
-- este script so seja rodado daqui a alguns dias.
-- =====================================================================

update public.orders
   set erp_status = 'DISCARDED',
       erp_error  = 'Descartado em 06/08/2026: pedido anterior a ativacao da integracao CIGAM, ja resolvido manualmente. Nao lancar no ERP.'
 where erp_status = 'PENDING'
   and created_at < '2026-08-07 00:00:00-03';

-- Conferencia (so le):
-- select erp_status, count(*) from public.orders group by erp_status order by 2 desc;
