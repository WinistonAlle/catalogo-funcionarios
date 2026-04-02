import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { exec, spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.SAIBWEB_WEBHOOK_PORT ?? 3333);
const DEFAULT_SLOWMO = process.env.SAIBWEB_SLOWMO ?? "250";
const RECOVER_ON_BOOT = process.env.SAIBWEB_RECOVER_PROCESSING_ON_BOOT === "1";
const PROCESSING_RECOVERY_MINUTES = Number(
  process.env.SAIBWEB_PROCESSING_RECOVERY_MINUTES ?? 20
);
const PENDING_SCAN_MS = Number(process.env.SAIBWEB_PENDING_SCAN_MS ?? 30000);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/**
 * =====================
 * FILA EM MEMÓRIA (FIFO)
 * =====================
 */
const queue: string[] = [];
const queuedOrRunning = new Set<string>();
let isRunning = false;
let lastRunAt: number | null = null;

function getBearerToken(req: express.Request) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function requirePrivilegedUser(req: express.Request) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Missing Bearer token" };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "Invalid session" };
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select("role, user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (empErr) {
    return { ok: false as const, status: 500, error: "Failed to check role" };
  }

  if (!emp) {
    return { ok: false as const, status: 403, error: "Employee not found / not linked" };
  }

  const role = String((emp as any).role || "").toLowerCase();
  if (role !== "admin" && role !== "rh") {
    return { ok: false as const, status: 403, error: "Not allowed" };
  }

  return { ok: true as const, userId: userData.user.id, role };
}

function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 0);
  const day = Number(parts.find((part) => part.type === "day")?.value || 0);

  return { year, month, day };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function buildDateLabel(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function getResetWindow(date = new Date()) {
  const { year, month, day } = getZonedParts(date);
  const allowed = day >= 28 || day <= 2;

  if (day >= 28) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return {
      allowed,
      start: buildDateLabel(year, month, 28),
      end: buildDateLabel(nextYear, nextMonth, 2),
    };
  }

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  if (day <= 2) {
    return {
      allowed,
      start: buildDateLabel(previousYear, previousMonth, 28),
      end: buildDateLabel(year, month, 2),
    };
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return {
    allowed,
    start: buildDateLabel(year, month, 28),
    end: buildDateLabel(nextYear, nextMonth, 2),
  };
}

/**
 * =====================
 * HELPERS
 * =====================
 */
function extractOrderId(payload: any): string | null {
  const id = payload?.record?.id ?? payload?.id ?? payload?.order_id ?? null;
  return id ? String(id) : null;
}

function buildCommand() {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "npx", "tsx", path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")],
      printable: `cmd.exe /c npx tsx ${path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")}`,
    };
  }

  return {
    command: "npx",
    args: ["tsx", path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")],
    printable: `npx tsx ${path.resolve(PROJECT_ROOT, "automation", "saibweb-runner.ts")}`,
  };
}

function buildChildEnv(orderId?: string | null): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SAIBWEB_SLOWMO: String(process.env.SAIBWEB_SLOWMO ?? DEFAULT_SLOWMO),
    ...(process.env.SAIBWEB_KEEP_OPEN === "1" ? { SAIBWEB_KEEP_OPEN: "1" } : {}),
    ...(process.env.SAIBWEB_PAUSE === "1" ? { SAIBWEB_PAUSE: "1" } : {}),
    ...(orderId ? { ORDER_ID: String(orderId) } : {}), // ✅ agora o runner usa isso
  };
}

async function recoverStuckOrders() {
  const safeMinutes = Number.isFinite(PROCESSING_RECOVERY_MINUTES)
    ? Math.max(1, PROCESSING_RECOVERY_MINUTES)
    : 20;
  const cutoffIso = new Date(Date.now() - safeMinutes * 60 * 1000).toISOString();

  console.log(
    `🩺 Verificando pedidos órfãos em PROCESSING com created_at <= ${cutoffIso}...`
  );

  const { data: candidates, error: candidatesError } = await supabase
    .from("orders")
    .select("id, order_number, created_at")
    .eq("saibweb_status", "PROCESSING")
    .lte("created_at", cutoffIso);

  if (candidatesError) {
    console.error("❌ Falha ao buscar pedidos PROCESSING para recovery:", candidatesError);
    return;
  }

  const recoverable = Array.isArray(candidates) ? candidates : [];
  if (recoverable.length === 0) {
    console.log("👌 Nenhum pedido PROCESSING antigo o suficiente para recuperar.");
    return;
  }

  const idsToRecover = recoverable.map((row: any) => row.id).filter(Boolean);

  const { data: recovered, error } = await supabase
    .from("orders")
    .update({
      saibweb_status: "PENDING",
      saibweb_error: `Recuperado automaticamente após reinício do serviço webhook (>${safeMinutes} min em PROCESSING).`,
    })
    .in("id", idsToRecover)
    .select("id, order_number");

  if (error) {
    console.error("❌ Falha ao recuperar pedidos PROCESSING:", error);
    return;
  }

  console.log(
    "♻️ Pedidos recuperados para PENDING:",
    recovered.map((row: any) => row.order_number || row.id)
  );
}

async function hasPendingOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("saibweb_status", "PENDING")
    .is("cancelled_at", null)
    .limit(1);

  if (error) {
    console.error("❌ Falha ao verificar pedidos PENDING:", error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

/**
 * =====================
 * FILA SAIBWEB
 * =====================
 */
function enqueue(orderId: string | null) {
  const id = orderId ?? "__NO_ID__";

  if (queuedOrRunning.has(id)) {
    console.log("🟠 Gatilho duplicado ignorado:", id);
    return { enqueued: false };
  }

  queuedOrRunning.add(id);
  queue.push(id);

  console.log("📥 Enfileirado:", id, "| fila:", queue.length);
  return { enqueued: true };
}

function runOne(orderId: string) {
  return new Promise<{ ok: boolean; code: number | null }>((resolve) => {
    const { command, args, printable } = buildCommand();

    const realOrderId = orderId === "__NO_ID__" ? null : orderId;
    const childEnv = buildChildEnv(realOrderId);

    console.log("🚀 Iniciando automação SAIBWEB");
    console.log("🧾 order_id:", realOrderId ?? "(sem id)");
    console.log("▶️", printable);

    const child = spawn(command, args, {
      env: childEnv,
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, code: code ?? null });
    });

    child.on("error", (err) => {
      console.error("❌ Falha ao iniciar automação:", err);
      resolve({ ok: false, code: null });
    });
  });
}

async function processQueue() {
  if (isRunning) return;
  isRunning = true;

  try {
    while (queue.length > 0) {
      const next = queue.shift()!;
      lastRunAt = Date.now();

      console.log("➡️ Processando:", next, "| restante:", queue.length);

      const result = await runOne(next);

      queuedOrRunning.delete(next);

      if (result.ok) console.log("✅ Finalizado com sucesso.");
      else console.log("⚠️ Finalizado com erro.");
    }
  } finally {
    isRunning = false;
    console.log("🏁 Fila SAIBWEB vazia.");
  }
}

async function kickPendingDrain(reason: string) {
  if (queue.length > 0 || queuedOrRunning.has("__NO_ID__")) return;

  const hasPending = await hasPendingOrders();
  if (!hasPending) return;

  console.log(`🔁 Encontrados pedidos PENDING sem webhook (${reason}). Iniciando varredura.`);
  enqueue(null);
  void processQueue();
}

/**
 * =====================
 * ROTAS
 * =====================
 */
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    saibweb: {
      running: isRunning,
      queued: queue.length,
      lastRunAt,
    },
    now: Date.now(),
  });
});

app.post("/webhook/new-order", (req, res) => {
  const orderId = extractOrderId(req.body);
  const r = enqueue(orderId);

  res.status(200).json({
    ok: true,
    order_id: orderId,
    enqueued: r.enqueued,
    queue_size: queue.length,
    running: isRunning,
  });

  void processQueue();
});

app.post("/sync-employees", async (req, res) => {
  try {
    const auth = await requirePrivilegedUser(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    exec(
      "npm run sync:employees",
      {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({
            ok: false,
            error: "Sync failed",
            stdout: (stdout || "").slice(0, 8000),
            stderr: (stderr || "").slice(0, 8000),
            code: (error as any).code ?? null,
          });
        }

        return res.json({
          ok: true,
          message: "Sync completed",
          stdout: (stdout || "").slice(0, 8000),
          stderr: (stderr || "").slice(0, 8000),
        });
      }
    );
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Unexpected error" });
  }
});

app.post("/reset-employee-balances", async (req, res) => {
  try {
    const auth = await requirePrivilegedUser(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const window = getResetWindow();
    if (!window.allowed) {
      return res.status(400).json({
        ok: false,
        message: `Você só pode resetar o saldo de ${window.start} até ${window.end}.`,
        allowedWindow: window,
      });
    }

    const { data: cycleData, error: cycleError } = await supabase.rpc("current_pay_cycle_key");
    if (cycleError) {
      return res.status(500).json({ ok: false, message: "Não foi possível identificar o ciclo atual." });
    }

    const monthKey =
      typeof cycleData === "string"
        ? cycleData
        : (cycleData as any)?.key ??
          (cycleData as any)?.month_key ??
          (cycleData as any)?.current_pay_cycle_key ??
          null;

    if (!monthKey) {
      return res.status(500).json({ ok: false, message: "O ciclo atual não retornou um month_key válido." });
    }

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
      return res.status(500).json({ ok: false, message: "Não foi possível restaurar o saldo atual." });
    }

    return res.status(200).json({
      ok: true,
      message: "Saldo de todos os funcionários restaurado para o valor inicial da planilha.",
      monthKey,
      updatedCount: updatedRows?.length ?? 0,
      allowedWindow: window,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * =====================
 * BOOT
 * =====================
 */
app.listen(PORT, async () => {
  if (RECOVER_ON_BOOT) {
    await recoverStuckOrders().catch((err) => {
      console.error("❌ Erro ao executar recovery on boot:", err);
    });
  }

  await kickPendingDrain("boot").catch((err) => {
    console.error("❌ Erro ao iniciar varredura de pedidos PENDING no boot:", err);
  });

  if (Number.isFinite(PENDING_SCAN_MS) && PENDING_SCAN_MS > 0) {
    setInterval(() => {
      void kickPendingDrain("scan");
    }, PENDING_SCAN_MS);
  }

  console.log(`🧩 SAIBWEB webhook rodando em http://localhost:${PORT}`);
  console.log(`🛰️ Fallback scan de pedidos PENDING: ${PENDING_SCAN_MS > 0 ? `${PENDING_SCAN_MS}ms` : "desativado"}`);
});
