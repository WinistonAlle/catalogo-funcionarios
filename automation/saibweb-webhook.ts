import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
import path from "path";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.SAIBWEB_WEBHOOK_PORT ?? 3333);
const DEFAULT_SLOWMO = process.env.SAIBWEB_SLOWMO ?? "250";

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
 * GOOGLE SHEETS SYNC
 * =====================
 */
const SHEET_SYNC_INTERVAL_MS = 60 * 1000; // 1 hora
const SHEET_SCRIPT_PATH =
  "C:\\Users\\JULIO\\Desktop\\catalogo-funcionario\\catalogo-funcionarios\\scripts\\syncEmployeesFromSheet.mjs";

let sheetSyncRunning = false;
let lastSheetSyncAt: number | null = null;

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
      args: ["/c", "npx", "tsx", "automation/saibweb-runner.ts"],
      printable: "cmd.exe /c npx tsx automation/saibweb-runner.ts",
    };
  }

  return {
    command: "npx",
    args: ["tsx", "automation/saibweb-runner.ts"],
    printable: "npx tsx automation/saibweb-runner.ts",
  };
}

function buildChildEnv(orderId?: string | null): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SAIBWEB_SLOWMO: String(process.env.SAIBWEB_SLOWMO ?? DEFAULT_SLOWMO),
    ...(process.env.SAIBWEB_KEEP_OPEN === "1" ? { SAIBWEB_KEEP_OPEN: "1" } : {}),
    ...(process.env.SAIBWEB_PAUSE === "1" ? { SAIBWEB_PAUSE: "1" } : {}),
    ...(orderId ? { ORDER_ID: String(orderId) } : {}),
  };
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
      cwd: process.cwd(),
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

      if (result.ok) {
        console.log("✅ Finalizado com sucesso.");
      } else {
        console.log("⚠️ Finalizado com erro.");
      }
    }
  } finally {
    isRunning = false;
    console.log("🏁 Fila SAIBWEB vazia.");
  }
}

/**
 * =====================
 * GOOGLE SHEETS JOB
 * =====================
 */
function runSheetSync() {
  if (sheetSyncRunning) {
    console.log("🟡 Sync Google Sheets já em execução. Pulando.");
    return;
  }

  sheetSyncRunning = true;
  lastSheetSyncAt = Date.now();

  console.log("📊 Iniciando sync Google Sheets");
  console.log("▶️ node", SHEET_SCRIPT_PATH);

  const child = spawn("node", [SHEET_SCRIPT_PATH], {
    cwd: path.dirname(SHEET_SCRIPT_PATH),
    stdio: "inherit",
    shell: false,
  });

  child.on("close", (code) => {
    sheetSyncRunning = false;
    console.log("✅ Sync Google Sheets finalizado. code =", code);
  });

  child.on("error", (err) => {
    sheetSyncRunning = false;
    console.error("❌ Erro no sync Google Sheets:", err);
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
    saibweb: {
      running: isRunning,
      queued: queue.length,
      lastRunAt,
    },
    sheetSync: {
      running: sheetSyncRunning,
      lastRunAt: lastSheetSyncAt,
      intervalMs: SHEET_SYNC_INTERVAL_MS,
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

/**
 * =====================
 * BOOT
 * =====================
 */
app.listen(PORT, () => {
  console.log(`🧩 SAIBWEB webhook rodando em http://localhost:${PORT}`);
  console.log("⏱️ Google Sheets sync a cada 1 hora");
});

// ⏱️ inicia o job após subir o servidor
setTimeout(() => {
  runSheetSync(); // primeira execução
  setInterval(runSheetSync, SHEET_SYNC_INTERVAL_MS);
}, 5_000);
