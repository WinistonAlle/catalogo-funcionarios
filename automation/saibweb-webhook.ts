import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
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
const WEBHOOK_TOKEN = process.env.SAIBWEB_WEBHOOK_TOKEN || "";
const RECOVER_ON_BOOT = process.env.SAIBWEB_RECOVER_PROCESSING_ON_BOOT === "1";
const PROCESSING_RECOVERY_MINUTES = Number(
  process.env.SAIBWEB_PROCESSING_RECOVERY_MINUTES ?? 20
);

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

function getRequestToken(req: express.Request) {
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  const headerToken = String(req.headers["x-webhook-token"] || "");
  return bearer || headerToken;
}

function requireWebhookAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!WEBHOOK_TOKEN) {
    console.warn("🟡 SAIBWEB_WEBHOOK_TOKEN não configurado; bloqueando endpoint por segurança.");
    return res.status(503).json({ ok: false, error: "Webhook token not configured" });
  }

  const provided = getRequestToken(req);
  if (!provided || provided !== WEBHOOK_TOKEN) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  next();
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

/**
 * =====================
 * ROTAS
 * =====================
 */
app.get("/health", requireWebhookAuth, (_req, res) => {
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

app.post("/webhook/new-order", requireWebhookAuth, (req, res) => {
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

  console.log(`🧩 SAIBWEB webhook rodando em http://localhost:${PORT}`);
  console.log(`🔐 Webhook auth: ${WEBHOOK_TOKEN ? "obrigatória" : "token ausente"}`);
});
