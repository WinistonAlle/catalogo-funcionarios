import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { processPendingOrders } from "./cigam/process-pending-orders";
import { syncEstoque } from "./cigam/sync-estoque";
import { CigamClient } from "./cigam/client";
import {
  authorizePrivilegedUser,
  getBearerToken,
  getOperationsStatus,
  getResetWindow,
  hasSuccessfulRestoreForCycle,
  insertOperationLog,
  listOperationHistory,
  resolveCurrentCycleKey,
  updateOperationLog,
} from "../server/adminOperations";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.OPERATIONS_WEBHOOK_PORT ?? 3333);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let sheetSyncRunning = false;
let balanceRestoreRunning = false;

type ChildOutput = {
  stdout: string;
  stderr: string;
};

function appendLimited(current: string, chunk: Buffer, maxLength: number) {
  const next = current + chunk.toString();
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function runEmployeeSyncScript(): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(PROJECT_ROOT, "scripts", "syncEmployeesFromSheet.mjs");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PROJECT_ROOT,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const maxOutput = 10 * 1024 * 1024;

    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, maxOutput);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk, maxOutput);
    });

    child.on("error", (error: any) => {
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error: any = new Error(`Employee sync failed with exit code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

/**
 * =====================
 * ROTAS
 * =====================
 */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    now: Date.now(),
  });
});

app.post("/sync-employees", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    if (sheetSyncRunning) {
      return res.status(409).json({
        ok: false,
        error: "Já existe uma sincronização de funcionários em andamento.",
      });
    }

    sheetSyncRunning = true;
    const runningLog = await insertOperationLog(supabase, {
      action: "sync_employees",
      status: "running",
      actor: auth.actor,
      message: "Sincronização manual iniciada.",
    }).catch(() => null);

    try {
      const { stdout, stderr } = await runEmployeeSyncScript();
      sheetSyncRunning = false;

      await updateOperationLog(supabase, runningLog?.id, {
        status: "success",
        message: "Sincronização de funcionários concluída com sucesso.",
        metadata: {
          stdout: (stdout || "").slice(0, 2000),
          stderr: (stderr || "").slice(0, 2000),
        },
      }).catch(() => null);

      return res.json({
        ok: true,
        message: "Sync completed",
        stdout: (stdout || "").slice(0, 8000),
        stderr: (stderr || "").slice(0, 8000),
      });
    } catch (error: any) {
      sheetSyncRunning = false;
      const stdout = String(error?.stdout || "");
      const stderr = String(error?.stderr || "");

      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: "Falha na sincronização manual de funcionários.",
        metadata: {
          code: error?.code ?? null,
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 2000),
        },
      }).catch(() => null);

      return res.status(500).json({
        ok: false,
        error: "Sync failed",
        stdout: stdout.slice(0, 8000),
        stderr: stderr.slice(0, 8000),
        code: error?.code ?? null,
      });
    }
  } catch (err: any) {
    sheetSyncRunning = false;
    return res.status(500).json({ ok: false, error: err?.message || "Unexpected error" });
  }
});

app.post("/reset-employee-balances", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    if (balanceRestoreRunning) {
      return res.status(409).json({
        ok: false,
        message: "Já existe uma restauração de saldo em andamento.",
      });
    }

    const window = getResetWindow();
    if (!window.allowed) {
      await insertOperationLog(supabase, {
        action: "restore_employee_balances",
        status: "blocked",
        actor: auth.actor,
        message: `Tentativa fora da janela permitida (${window.start} até ${window.end}).`,
      }).catch(() => null);

      return res.status(400).json({
        ok: false,
        message: `Você só pode resetar o saldo de ${window.start} até ${window.end}.`,
        allowedWindow: window,
      });
    }

    const monthKey = await resolveCurrentCycleKey(supabase);
    const alreadyRestored = await hasSuccessfulRestoreForCycle(supabase, monthKey);
    if (alreadyRestored) {
      await insertOperationLog(supabase, {
        action: "restore_employee_balances",
        status: "blocked",
        actor: auth.actor,
        targetMonthKey: monthKey,
        message: `Restauração bloqueada: o ciclo ${monthKey} já foi restaurado.`,
      }).catch(() => null);

      return res.status(409).json({
        ok: false,
        message: `O saldo deste ciclo (${monthKey}) já foi restaurado anteriormente.`,
        monthKey,
      });
    }

    balanceRestoreRunning = true;
    const runningLog = await insertOperationLog(supabase, {
      action: "restore_employee_balances",
      status: "running",
      actor: auth.actor,
      targetMonthKey: monthKey,
      message: `Restauração iniciada para o ciclo ${monthKey}.`,
    }).catch(() => null);

    const { data: updatedRows, error: updateError } = await supabase
      .from("employee_monthly_spend")
      .update({
        spent_cents: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("month_key", monthKey)
      .gt("spent_cents", 0)
      .select("employee_id");

    if (updateError) {
      balanceRestoreRunning = false;
      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: `Falha ao restaurar saldo do ciclo ${monthKey}.`,
        metadata: { error: updateError.message },
      }).catch(() => null);

      return res.status(500).json({ ok: false, message: "Não foi possível restaurar o saldo atual." });
    }

    balanceRestoreRunning = false;
    await updateOperationLog(supabase, runningLog?.id, {
      status: "success",
      message: "Saldo de todos os funcionários restaurado para o valor inicial da planilha.",
      metadata: {
        updatedCount: updatedRows?.length ?? 0,
      },
    }).catch(() => null);

    return res.status(200).json({
      ok: true,
      message: "Saldo de todos os funcionários restaurado para o valor inicial da planilha.",
      monthKey,
      updatedCount: updatedRows?.length ?? 0,
      allowedWindow: window,
    });
  } catch (err: any) {
    balanceRestoreRunning = false;
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.get("/operations/status", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const payload = await getOperationsStatus(supabase, {
      syncInProgress: sheetSyncRunning,
      resetInProgress: balanceRestoreRunning,
    });

    return res.status(200).json(payload);
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.get("/operations/history", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const limit = Number(req.query.limit ?? 30);
    const action =
      typeof req.query.action === "string" && req.query.action.trim() ? req.query.action.trim() : "all";
    const payload = await listOperationHistory(supabase, {
      limit,
      action: action as any,
    });

    return res.status(200).json({
      ok: true,
      storageReady: payload.storageReady,
      rows: payload.rows,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * Integração CIGAM: processa pedidos pendentes (erp_status = PENDING).
 * Protegido por token próprio (CIGAM_INTEGRATION_TOKEN) para permitir disparo
 * por agendador externo. Sem o token configurado, o endpoint fica desativado.
 */
app.post("/integration/cigam/pedidos/exec", async (req, res) => {
  try {
    const expected = process.env.CIGAM_INTEGRATION_TOKEN;
    if (!expected) {
      return res.status(503).json({ ok: false, error: "Integração CIGAM não configurada." });
    }
    if (getBearerToken(req.headers.authorization) !== expected) {
      return res.status(401).json({ ok: false, error: "Token inválido." });
    }

    const limit = Math.min(Math.max(Number(req.query.limit ?? 10) || 10, 1), 50);
    const dryRun = req.body?.dryRun !== false; // padrão: simulação

    const results = await processPendingOrders({ supabase, limit, dryRun });
    return res.json({ ok: true, dryRun, processed: results.length, results });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Unexpected error" });
  }
});

/**
 * Consulta de estoque ao vivo (usado pelo app no adicionar/checkout).
 * Público e somente-leitura — saldo de estoque não é dado sensível.
 * GET /automation/estoque?materiais=cod1,cod2  → { saldos: { cod: number } }
 * Material sem linha de estoque simplesmente não aparece no retorno
 * (o app trata ausência como disponível / fail-open).
 */
const cigamStockClient = new CigamClient();

app.get("/estoque", async (req, res) => {
  try {
    const raw = String(req.query.materiais ?? "").trim();
    if (!raw) return res.json({ saldos: {} });
    const codigos = raw.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100);

    // Mesmo número do sync (disponível, não físico) — senão o checkout ao vivo
    // liberaria item que a listagem já mostrou como esgotado, e vice-versa.
    // O carrinho tem poucos itens, então a concorrência baixa não pesa aqui.
    const saldos = await cigamStockClient.buscarDisponibilidades(codigos, { concorrencia: 4 });
    return res.json({ saldos: Object.fromEntries(saldos) });
  } catch (err: any) {
    // Fail-open: em erro, o app usa o último saldo do Supabase e não bloqueia.
    return res.status(502).json({ saldos: {}, error: err?.message || "Falha ao consultar estoque." });
  }
});

/**
 * Sync periódico de estoque CIGAM → Supabase. Desligado por padrão; liga com
 * STOCK_SYNC_INTERVAL_MS > 0 (ex.: 300000 = 5 min).
 */
const STOCK_SYNC_INTERVAL_MS = Number(process.env.STOCK_SYNC_INTERVAL_MS ?? 0);
let stockSyncRunning = false;

async function runStockSync() {
  if (stockSyncRunning) return;
  stockSyncRunning = true;
  try {
    const r = await syncEstoque({ supabase, dryRun: false });
    console.log(
      `📦 Estoque sync: ${r.gravados} gravados (${r.comSaldo} c/ saldo, ${r.semLinha} sem linha` +
        (r.preservados > 0 ? `, ${r.preservados} c/ saldo antigo preservado` : "") +
        ")."
    );
  } catch (err: any) {
    console.error("📦 Estoque sync falhou:", err?.message ?? err);
  } finally {
    stockSyncRunning = false;
  }
}

/**
 * Disparo automático da integração CIGAM: varre pedidos pendentes de tempos em
 * tempos e lança no ERP. Desligado por padrão — só liga se
 * CIGAM_AUTO_SYNC_INTERVAL_MS > 0 (ex.: 120000 = 2 min). Mantém desligado até a
 * condição de pagamento (desconto em folha) estar configurada.
 */
const CIGAM_AUTO_SYNC_INTERVAL_MS = Number(process.env.CIGAM_AUTO_SYNC_INTERVAL_MS ?? 0);
let cigamAutoSyncRunning = false;

async function runCigamAutoSync() {
  if (cigamAutoSyncRunning) return; // evita sobreposição de execuções
  cigamAutoSyncRunning = true;
  try {
    const results = await processPendingOrders({ supabase, limit: 50, dryRun: false });
    if (results.length > 0) {
      const done = results.filter((r) => r.status === "DONE").length;
      const errors = results.filter((r) => r.status === "ERROR");
      console.log(`🧾 CIGAM auto-sync: ${done} enviado(s), ${errors.length} com erro.`);
      for (const e of errors) console.log(`   ⚠️ ${e.orderNumber}: ${e.error}`);
    }
  } catch (err: any) {
    console.error("🧾 CIGAM auto-sync falhou:", err?.message ?? err);
  } finally {
    cigamAutoSyncRunning = false;
  }
}

app.listen(PORT, () => {
  console.log(`🧩 Webhook de operações rodando em http://localhost:${PORT}`);
  if (CIGAM_AUTO_SYNC_INTERVAL_MS > 0) {
    const segundos = Math.round(CIGAM_AUTO_SYNC_INTERVAL_MS / 1000);
    console.log(`🧾 CIGAM auto-sync LIGADO — varrendo pedidos pendentes a cada ${segundos}s.`);
    setInterval(runCigamAutoSync, CIGAM_AUTO_SYNC_INTERVAL_MS);
  } else {
    console.log("🧾 CIGAM auto-sync desligado (defina CIGAM_AUTO_SYNC_INTERVAL_MS para ligar).");
  }

  if (STOCK_SYNC_INTERVAL_MS > 0) {
    const segundos = Math.round(STOCK_SYNC_INTERVAL_MS / 1000);
    console.log(`📦 Estoque sync LIGADO — sincronizando saldo a cada ${segundos}s.`);
    setInterval(runStockSync, STOCK_SYNC_INTERVAL_MS);
    void runStockSync(); // primeira carga logo ao subir
  } else {
    console.log("📦 Estoque sync desligado (defina STOCK_SYNC_INTERVAL_MS para ligar).");
  }
});
