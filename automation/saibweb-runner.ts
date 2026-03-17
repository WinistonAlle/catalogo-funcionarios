// automation/saibweb-runner.ts
import * as dotenv from "dotenv";
dotenv.config();

import { chromium, Page } from "playwright";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

// =====================
// ENV - SAIBWEB
// =====================
const SAIBWEB_URL = process.env.SAIBWEB_URL;
const SAIBWEB_USER = process.env.SAIBWEB_USER;
const SAIBWEB_PASS = process.env.SAIBWEB_PASS;

const SLOW_MO = Number(process.env.SAIBWEB_SLOWMO ?? 600);
// ✅ Headless automaticamente quando NÃO estiver testando com KEEP_OPEN
const KEEP_OPEN = process.env.SAIBWEB_KEEP_OPEN === "1";
const HEADLESS = !KEEP_OPEN;

const TYPE_DELAY = Number(process.env.SAIBWEB_TYPE_DELAY ?? 0);

// ✅ Quando estiver no servidor, você NÃO quer pausar pedindo ENTER
// Se quiser pausar em teste, use SAIBWEB_PAUSE=1 (opcional)
const SHOULD_PAUSE = process.env.SAIBWEB_PAUSE === "1" || KEEP_OPEN;

// ✅ (NOVO) se o webhook passar ORDER_ID, o runner tenta processar exatamente ele
const TARGET_ORDER_ID = process.env.ORDER_ID ? String(process.env.ORDER_ID) : null;

// =====================
// ENV - SUPABASE
// =====================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SAIBWEB_URL || !SAIBWEB_USER || !SAIBWEB_PASS) {
  throw new Error("Missing SAIBWEB_URL / SAIBWEB_USER / SAIBWEB_PASS");
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// =====================
// TYPES (compat com retorno do Supabase: pode vir null)
// =====================
type DbOrder = {
  id: string;
  order_number: string | null;
  created_at: string | null;

  employee_cpf: string | null;
  employee_name: string | null;

  wallet_debited: boolean | null;
  spent_from_balance_cents: number | null;
  pay_on_pickup_cents: number | null;

  saibweb_status: string | null; // PENDING | PROCESSING | SYNCED | ERROR
  saibweb_error: string | null;
  saibweb_synced_at: string | null;
  saibweb_external_id: string | null;

  cancelled_at: string | null;
};

type DbItem = {
  product_code: string; // aqui vai o product_old_id (código SAIBWEB)
  qty: number; // quantity original do pedido (mantido pra validação)
  weight: number | null; // weight do produto no supabase
  saibweb_qty: number; // ✅ quantidade que será enviada pro SAIBWEB (qty * peso quando peso>1)
};

type OrderItemRow = {
  product_old_id: string | number | null;
  quantity: number | string | null;
};

type ProductRow = {
  old_id: string | number | null;
  weight: number | string | null;
};

// =====================
// Utils
// =====================
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function safeShot(page: Page, name: string) {
  try {
    const shot = path.resolve("automation_screenshots", `${name}-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log("📸 Screenshot:", shot);
  } catch {
    return;
  }
}

// ✅ Só pausa se SHOULD_PAUSE=true (em servidor fica false e não trava)
function waitForEnter(prompt: string) {
  if (!SHOULD_PAUSE) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toFiniteNumberOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err ?? "Erro desconhecido");
}

function orderTag(order: Pick<DbOrder, "id" | "order_number"> | { id: string; order_number?: string | null }) {
  return `[order ${order.order_number ?? order.id}]`;
}

/**
 * ✅ REGRA:
 * - fator = (weight > 1 ? weight : 1)
 * - qty_saibweb = qty_pedido * fator
 */
function computeSaibwebQtyFromWeightAndQty(weight: number | null, orderQty: number): number {
  const w = weight ?? 0;
  const fator = w > 1 ? w : 1;

  const q = Number(orderQty);
  const qtyPedido = Number.isFinite(q) && q > 0 ? q : 0;

  const result = qtyPedido * fator;
  return Number.isFinite(result) ? result : 0;
}

function formatQtyForInput(q: number): string {
  if (!Number.isFinite(q)) return "0";
  return q.toFixed(3).replace(/\.?0+$/, "");
}

// =====================
// OBS NF
// =====================
function buildObsFromOrder(order: DbOrder): string {
  const spent = order.spent_from_balance_cents ?? 0;
  const pickup = order.pay_on_pickup_cents ?? 0;

  if (order.wallet_debited === true && spent > 0) {
    return "PAGO COM SALDO, APTO PARA RETIRAR";
  }

  if (pickup > 0) {
    return `PAGAR NA RETIRADA ${centsToBRL(pickup)}`;
  }

  return "PAGAMENTO NÃO IDENTIFICADO";
}

// =====================
// SUPABASE: pegar 1 pedido pendente + lock + itens
// (NOVO) se vier orderId, tenta pegar exatamente ele
// =====================
async function pickNextOrderToProcess(
  orderId?: string | null
): Promise<{ order: DbOrder; items: DbItem[] } | null> {
  // 1) Busca o pedido alvo (se veio)
  if (orderId) {
    const { data: one, error } = await supabase
      .from("orders")
      .select(
        `
          id,
          order_number,
          created_at,
          employee_cpf,
          employee_name,
          wallet_debited,
          spent_from_balance_cents,
          pay_on_pickup_cents,
          saibweb_status,
          saibweb_error,
          saibweb_synced_at,
          saibweb_external_id,
          cancelled_at
        `
      )
      .eq("id", orderId)
      .eq("saibweb_status", "PENDING")
      .is("cancelled_at", null)
      .limit(1);

    if (error) throw error;
    if (!one || one.length === 0) {
      console.log(`⏭️ ORDER_ID=${orderId} não está mais PENDING ou não existe.`);
      return null;
    }
    const order = one[0] as DbOrder;
    return await lockAndLoadOrder(order);
  }

  // 2) Se não veio/alvo não está pending, pega o mais antigo pending
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `
        id,
        order_number,
        created_at,
        employee_cpf,
        employee_name,
        wallet_debited,
        spent_from_balance_cents,
        pay_on_pickup_cents,
        saibweb_status,
        saibweb_error,
        saibweb_synced_at,
        saibweb_external_id,
        cancelled_at
      `
    )
    .eq("saibweb_status", "PENDING")
    .is("cancelled_at", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  if (!orders || orders.length === 0) return null;

  const order = orders[0] as DbOrder;
  return await lockAndLoadOrder(order);
}

async function lockAndLoadOrder(order: DbOrder): Promise<{ order: DbOrder; items: DbItem[] } | null> {
  console.log(`${orderTag(order)} 🔒 Tentando mover PENDING -> PROCESSING`);

  const { data: locked, error: lockErr } = await supabase
    .from("orders")
    .update({ saibweb_status: "PROCESSING", saibweb_error: null })
    .eq("id", order.id)
    .eq("saibweb_status", "PENDING")
    .select("id");

  if (lockErr) throw lockErr;
  if (!locked || locked.length === 0) {
    console.log(`${orderTag(order)} ⏭️ Lock não obtido; outro processo pegou este pedido.`);
    return null;
  }

  const { data: rawItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("product_old_id, quantity")
    .eq("order_id", order.id);

  if (itemsErr) throw itemsErr;

  const baseItems = ((rawItems ?? []) as OrderItemRow[])
    .map((it) => {
      const code = it.product_old_id;
      const qty = Number(it.quantity);

      return {
        product_code: code !== null && code !== undefined ? String(code) : "",
        qty: Number.isFinite(qty) ? qty : 0,
      };
    })
    .filter((it) => it.product_code && it.qty > 0);

  if (baseItems.length === 0) {
    return { order, items: [] };
  }

  // ✅ Buscar weight na tabela products (assumindo products.old_id = order_items.product_old_id)
  const uniqueCodes = Array.from(new Set(baseItems.map((i) => i.product_code)));
  const uniqueOldIdsAsNumber = uniqueCodes.map((c) => Number(c)).filter((n) => Number.isFinite(n));

  const weightByOldId = new Map<string, number | null>();

  if (uniqueOldIdsAsNumber.length > 0) {
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("old_id, weight")
      .in("old_id", uniqueOldIdsAsNumber);

    if (prodErr) throw prodErr;

    for (const p of (products ?? []) as ProductRow[]) {
      const oldId = p.old_id;
      const w = toFiniteNumberOrNull(p.weight);
      if (oldId !== null && oldId !== undefined) {
        weightByOldId.set(String(oldId), w);
      }
    }
  } else {
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("old_id, weight")
      .in("old_id", uniqueCodes);

    if (prodErr) throw prodErr;

    for (const p of (products ?? []) as ProductRow[]) {
      const oldId = p.old_id;
      const w = toFiniteNumberOrNull(p.weight);
      if (oldId !== null && oldId !== undefined) {
        weightByOldId.set(String(oldId), w);
      }
    }
  }

  const items: DbItem[] = baseItems.map((it) => {
    const weight = weightByOldId.get(it.product_code) ?? null;
    const saibweb_qty = computeSaibwebQtyFromWeightAndQty(weight, it.qty);

    return {
      product_code: it.product_code,
      qty: it.qty,
      weight,
      saibweb_qty,
    };
  });

  return { order, items };
}

async function markOrderSuccess(orderId: string, extra?: { externalId?: string | null }) {
  console.log(`[order ${orderId}] ✅ Marcando status SYNCED`);
  await supabase
    .from("orders")
    .update({
      saibweb_status: "SYNCED",
      saibweb_synced_at: new Date().toISOString(),
      saibweb_error: null,
      saibweb_external_id: extra?.externalId ?? null,
    })
    .eq("id", orderId);
}

async function markOrderError(orderId: string, message: string) {
  console.log(`[order ${orderId}] ❌ Marcando status ERROR: ${message}`);
  await supabase
    .from("orders")
    .update({
      saibweb_status: "ERROR",
      saibweb_error: (message ?? "Erro desconhecido").slice(0, 1000),
    })
    .eq("id", orderId);
}

// =====================
// PLAYWRIGHT HELPERS (XPath)
// =====================
async function clickByXPath(page: Page, xpath: string, opts?: { timeout?: number; force?: boolean }) {
  const locator = page.locator(`xpath=${xpath}`).first();
  await locator.waitFor({ state: "attached", timeout: opts?.timeout ?? 15000 });
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.waitFor({ state: "visible", timeout: opts?.timeout ?? 15000 }).catch(() => {});
  await locator.click({ delay: 30, force: opts?.force ?? false });
}

async function clickByXPathPreferButton(page: Page, xpath: string, opts?: { timeout?: number }) {
  const base = page.locator(`xpath=${xpath}`).first();
  await base.waitFor({ state: "attached", timeout: opts?.timeout ?? 15000 });

  const button = base.locator("xpath=ancestor::button[1]").first();
  if ((await button.count().catch(() => 0)) > 0) {
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await button.click({ delay: 30 }).catch(async () => {
      await base.click({ delay: 30 }).catch(async () => {
        await button.click({ delay: 30, force: true });
      });
    });
    return;
  }

  await base.scrollIntoViewIfNeeded().catch(() => {});
  await base.click({ delay: 30 }).catch(async () => {
    await base.click({ delay: 30, force: true });
  });
}

async function clearAndType(page: Page, value: string) {
  await page.keyboard.press("Control+A").catch(() => {});
  await page.keyboard.press("Meta+A").catch(() => {});
  await page.keyboard.press("Backspace").catch(() => {});

  if (TYPE_DELAY > 0) {
    await page.keyboard.type(value, { delay: TYPE_DELAY });
  } else {
    await page.keyboard.insertText(value).catch(async () => {
      await page.keyboard.type(value, { delay: 0 });
    });
  }
}

async function fillByXPathAndEnter(page: Page, clickXpath: string, value: string) {
  await clickByXPathPreferButton(page, clickXpath, { timeout: 15000 });
  await page.waitForTimeout(60);

  await clearAndType(page, value);

  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(140);

  await page.keyboard.press("Tab").catch(() => {});
  await page.waitForTimeout(90);
}

async function selectOperationByEnterOnly(page: Page, clickXpath: string) {
  await clickByXPathPreferButton(page, clickXpath, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(150);
  await page.keyboard.press("Tab").catch(() => {});
  await page.waitForTimeout(100);
}

// =====================
// Login SAIBWEB
// =====================
async function loginSaibweb(page: Page) {
  console.log("🔐 Login SAIBWEB");

  await page.goto(SAIBWEB_URL!, { waitUntil: "domcontentloaded" });

  await page.locator("input").first().fill(SAIBWEB_USER!);
  await page.locator("input[type='password']").fill(SAIBWEB_PASS!);
  await page.keyboard.press("Enter");

  await page.waitForLoadState("networkidle");
  await sleep(250);

  console.log("✅ Login OK");
}

// =====================
// Fluxo SAIBWEB
// =====================
async function clickHamburgerMenu(page: Page) {
  console.log("🍔 Menu hamburger");

  const hamburgerSvgXPath = '//*[@id="root"]/div/main/div/div[1]/div[1]/nav/div/button/span[1]/svg';
  const hamburgerButtonXPath = '//*[@id="root"]/div/main/div/div[1]/div[1]/nav/div/button';

  await clickByXPath(page, hamburgerButtonXPath).catch(async () => {
    await clickByXPathPreferButton(page, hamburgerSvgXPath);
  });

  await sleep(250);
  console.log("✅ Menu hamburger aberto");
}

async function clickSFA(page: Page) {
  console.log("📂 SFA");
  await clickByXPath(page, '//*[@id="root"]/div/main/div/div[1]/div[1]/nav/div/aside/div[1]/div[2]/a[4]');
  await sleep(220);
  console.log("✅ SFA clicado");
}

async function clickMovimentacoes(page: Page) {
  console.log("📦 Movimentações");
  await clickByXPath(
    page,
    '//*[@id="root"]/div/main/div/div[1]/div[1]/nav/div/aside/div[1]/div[2]/div[3]/a[4]'
  );
  await sleep(220);
  console.log("✅ Movimentações clicado");
}

async function clickSFAPedidoFaturamento(page: Page) {
  console.log("🧾 SFA - Pedido de Faturamento");
  await clickByXPath(
    page,
    '//*[@id="root"]/div/main/div/div[1]/div[1]/nav/div/aside/div[1]/div[2]/div[3]/a[1]'
  );
  await sleep(650);
  console.log("✅ Tela Pedido de Faturamento aberta");
}

async function clickNovoCadastro(page: Page) {
  console.log("➕ Novo Cadastro (robusto)");

  await page.getByText(/LISTAGEM DE PEDIDOS/i).waitFor({ state: "visible", timeout: 25000 });

  const novoCadastroSvgXPath =
    '//*[@id="scrollable-force-tabpanel-0"]/div/div/div[1]/div[1]/button[2]/svg';
  const novoCadastroButtonXPath =
    '//*[@id="scrollable-force-tabpanel-0"]/div/div/div[1]/div[1]/button[2]';

  try {
    await clickByXPath(page, novoCadastroButtonXPath, { timeout: 15000 });
    await sleep(650);
    console.log("✅ Novo cadastro clicado (button)");
    return;
  } catch {
    // tenta o seletor alternativo
  }

  try {
    await clickByXPathPreferButton(page, novoCadastroSvgXPath, { timeout: 15000 });
    await sleep(650);
    console.log("✅ Novo cadastro clicado (svg->button)");
    return;
  } catch {
    // tenta o clique forçado
  }

  try {
    await clickByXPath(page, novoCadastroButtonXPath, { timeout: 8000, force: true });
    await sleep(650);
    console.log("✅ Novo cadastro clicado (force)");
    return;
  } catch {
    // cai no erro final com screenshot
  }

  await safeShot(page, "novo-cadastro-falhou");
  throw new Error("Não consegui clicar no NOVO CADASTRO.");
}

async function preencherNovoCadastro(page: Page, cpf: string, obs: string) {
  console.log("🧾 Preenchendo campos (Cliente/Operação/Obs)");

  const clienteXPath =
    '//*[@id="scrollable-force-tabpanel-1"]/div/div/div[2]/form/div[1]/div[4]/div/div[2]/div/div/div[1]/div[2]';

  const operacaoXPath =
    '//*[@id="scrollable-force-tabpanel-1"]/div/div/div[2]/form/div[2]/div[1]/div/div[2]/div/div/div[1]/div[2]';

  await fillByXPathAndEnter(page, clienteXPath, cpf);
  await selectOperationByEnterOnly(page, operacaoXPath);

  const obsEl = page.locator("#obs_nota").first();
  await obsEl.waitFor({ state: "visible", timeout: 15000 });
  await obsEl.scrollIntoViewIfNeeded().catch(() => {});
  await obsEl.click({ delay: 30 }).catch(() => {});
  await obsEl.fill("").catch(() => {});
  await obsEl.fill(obs);

  await page.waitForTimeout(150);
  console.log("✅ Campos preenchidos");
}

async function abrirItensDoPedido(page: Page) {
  console.log("📦 Abrindo ITENS DO PEDIDO");

  const itensTabXPath =
    '//*[@id="root"]/div/main/div/div[2]/div/div[5]/header/div/div[2]/div/button[3]/span[1]';

  await clickByXPath(page, itensTabXPath, { timeout: 20000 });
  await sleep(350);

  console.log("✅ Aba Itens do Pedido aberta");
}

async function selecionarTabelaPrecoAntesDosItens(page: Page) {
  console.log("💲 Selecionando TABELA DE PREÇO: 18");

  const tabelaPrecoXPath =
    '//*[@id="scrollable-force-tabpanel-2"]/div/div/div[2]/span/form/div/div[1]/div/div[2]/div/div/div[1]/div[2]';

  await fillByXPathAndEnter(page, tabelaPrecoXPath, "18");
  await page.waitForTimeout(250);

  console.log("✅ Tabela de preço definida: 18");
}

async function adicionarItemDoPedido(page: Page, itemCode: string, qtdSaibweb: number) {
  console.log(`🧩 Adicionando item: código=${itemCode} qtd_saibweb=${qtdSaibweb}`);

  const pesquisarItemXPath =
    '//*[@id="scrollable-force-tabpanel-2"]/div/div/div[2]/span/form/div/div[2]/div/div[2]/div/div/div[1]/div[2]';

  const adicionarXPath =
    '//*[@id="scrollable-force-tabpanel-2"]/div/div/div[1]/div[1]/button[4]';

  await fillByXPathAndEnter(page, pesquisarItemXPath, itemCode);

  const qtdEl = page.locator("#qtd_produto_add").first();
  await qtdEl.waitFor({ state: "visible", timeout: 15000 });
  await qtdEl.scrollIntoViewIfNeeded().catch(() => {});
  await qtdEl.click({ delay: 30 }).catch(() => {});
  await qtdEl.fill("").catch(() => {});
  await qtdEl.fill(formatQtyForInput(qtdSaibweb));

  await page.waitForTimeout(120);

  await clickByXPath(page, adicionarXPath, { timeout: 15000 });
  await sleep(520);

  console.log("✅ Item adicionado");
}

async function confirmarPedido(page: Page) {
  console.log("✅ Confirmando pedido");

  const confirmarXPath = '//*[@id="scrollable-force-tabpanel-2"]/div/div/div[1]/div[1]/button[2]';

  await clickByXPath(page, confirmarXPath, { timeout: 20000 });
  await sleep(900);

  console.log("🎉 Pedido confirmado");
}

// =====================
// PROCESSA 1 PEDIDO (extraído do antigo main)
// =====================
async function processOne(orderIdHint?: string | null) {
  const job = await pickNextOrderToProcess(orderIdHint);

  if (!job) {
    console.log("📭 Nenhum pedido com saibweb_status = PENDING. Encerrando este ciclo.");
    return { processed: false };
  }

  const { order, items } = job;
  const orderId = order.id;

  console.log(`${orderTag(order)} 🧾 Iniciando processamento`);
  console.log(`${orderTag(order)} 👤 CPF:`, order.employee_cpf);
  console.log(`${orderTag(order)} 🧩 Itens:`, items.length);

  if (!order.employee_cpf) {
    const msg = "Pedido sem employee_cpf (NULL).";
    console.log(`${orderTag(order)} ❌ ${msg}`);
    await markOrderError(orderId, msg);
    return { processed: true };
  }

  if (!items.length) {
    const msg = "Pedido sem itens válidos em order_items (product_old_id/quantity).";
    console.log(`${orderTag(order)} ❌ ${msg}`);
    await markOrderError(orderId, msg);
    return { processed: true };
  }

  const obs = buildObsFromOrder(order);
  console.log(`${orderTag(order)} 📝 OBS NF:`, obs);

  if (obs === "PAGAMENTO NÃO IDENTIFICADO") {
    const msg =
      "Pagamento não identificado: verifique wallet_debited/spent_from_balance_cents/pay_on_pickup_cents.";
    console.log(`${orderTag(order)} ❌ ${msg}`);
    await markOrderError(orderId, msg);
    return { processed: true };
  }

  for (const it of items) {
    const fator = (it.weight ?? 0) > 1 ? it.weight : 1;
    console.log(
      `${orderTag(order)} ⚖️ item ${it.product_code} -> weight=${it.weight ?? "null"} | qtyPedido=${it.qty} | fator=${fator} | qtySAIBWEB=${it.saibweb_qty}`
    );
  }

  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOW_MO });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();

  try {
    await loginSaibweb(page);
    await clickHamburgerMenu(page);
    await clickSFA(page);
    await clickMovimentacoes(page);
    await clickSFAPedidoFaturamento(page);
    await clickNovoCadastro(page);
    await preencherNovoCadastro(page, order.employee_cpf, obs);
    await abrirItensDoPedido(page);
    await selecionarTabelaPrecoAntesDosItens(page);

    for (const it of items) {
      await adicionarItemDoPedido(page, it.product_code, it.saibweb_qty);
    }

    await confirmarPedido(page);

    await markOrderSuccess(orderId, { externalId: null });

    console.log(`${orderTag(order)} 🏁 SUCESSO! Pedido sincronizado.`);

    await waitForEnter("👉 Aperte ENTER para encerrar...");
  } catch (err: unknown) {
    const msg = getErrorMessage(err);
    console.error(`${orderTag(order)} ❌ Erro:`, msg);

    await safeShot(page, `err-order-${orderId}`);
    await markOrderError(orderId, msg);

    await waitForEnter("👉 Aperte ENTER para encerrar...");
  } finally {
    if (KEEP_OPEN) {
      console.log("🟣 SAIBWEB_KEEP_OPEN=1 -> mantendo navegador aberto.");
      await waitForEnter("👉 Aperte ENTER para fechar o navegador...");
    }
    await browser.close();
  }

  return { processed: true };
}

// =====================
// MAIN (AGORA: drena)
// =====================
async function main() {
  console.log("🚀 SAIBWEB runner — Supabase -> SAIBWEB (drain)");
  console.log(`⚙️ headless=${HEADLESS} slowMo=${SLOW_MO} keepOpen=${KEEP_OPEN}`);
  console.log(`🎯 ORDER_ID=${TARGET_ORDER_ID ?? "(none)"} (se vier, tenta processar esse primeiro)`);

  ensureDir(path.resolve("automation_screenshots"));

  if (TARGET_ORDER_ID) {
    const { processed } = await processOne(TARGET_ORDER_ID);
    console.log(
      processed
        ? `🏁 Execução pontual finalizada para ORDER_ID=${TARGET_ORDER_ID}.`
        : `🏁 Nenhuma ação necessária para ORDER_ID=${TARGET_ORDER_ID}.`
    );
    return;
  }

  while (true) {
    const { processed } = await processOne(null);

    if (!processed) break;

    // Pequeno respiro pra não martelar
    await sleep(250);
  }

  console.log("🏁 Drain finalizado: sem pendências PENDING.");
}

main();
