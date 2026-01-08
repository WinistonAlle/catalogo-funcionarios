// automation/saibweb-webhook.ts
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { exec } from "child_process";

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.SAIBWEB_WEBHOOK_PORT ?? 3333);

// Em produção você quer somente:
// SAIBWEB_SLOWMO=250 npx tsx automation/saibweb-runner.ts
// Em teste, se quiser abrir:
// SAIBWEB_KEEP_OPEN=1 (e opcional SAIBWEB_PAUSE=1)
const DEFAULT_SLOWMO = process.env.SAIBWEB_SLOWMO ?? "250";

// 🔒 lock simples (um pedido por vez por processo)
// (depois a gente evolui pra fila + lock no banco)
let isRunning = false;
let lastRunAt: number | null = null;

function extractOrderId(payload: any): string | null {
  // Webhook Supabase geralmente manda { record: {...}, old_record: null, ... }
  const id = payload?.record?.id ?? payload?.id ?? payload?.order_id ?? null;
  if (!id) return null;
  return String(id);
}

function buildRunnerCommand(orderId?: string) {
  // A automação atual pega o próximo PENDING, então ORDER_ID é opcional.
  // Se no futuro você adaptar seu runner para processar um id específico,
  // este env já fica pronto.
  const envParts: string[] = [];

  // Mantém o slowMo default (pode sobrescrever pelo .env)
  envParts.push(`SAIBWEB_SLOWMO=${DEFAULT_SLOWMO}`);

  // Se estiver em modo teste (KEEP_OPEN=1), ele abre UI e pode pausar
  if (process.env.SAIBWEB_KEEP_OPEN === "1") {
    envParts.push(`SAIBWEB_KEEP_OPEN=1`);
  }
  if (process.env.SAIBWEB_PAUSE === "1") {
    envParts.push(`SAIBWEB_PAUSE=1`);
  }

  // Opcional: passar ORDER_ID (mesmo que hoje você não use no runner)
  if (orderId) envParts.push(`ORDER_ID=${orderId}`);

  // Comando final
  return `${envParts.join(" ")} npx tsx automation/saibweb-runner.ts`;
}

async function runAutomation(orderId: string | null) {
  if (isRunning) {
    console.log("🟡 Já existe uma execução em andamento. Ignorando gatilho.");
    return { started: false, reason: "already_running" as const };
  }

  isRunning = true;
  lastRunAt = Date.now();

  const cmd = buildRunnerCommand(orderId ?? undefined);

  console.log("🚀 Disparando automação SAIBWEB");
  if (orderId) console.log("🧾 order_id recebido:", orderId);
  console.log("▶️", cmd);

  return await new Promise<{ started: true }>((resolve) => {
    const child = exec(cmd, { env: process.env }, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Automação terminou com erro:", error.message);
      }
      if (stdout?.trim()) console.log("📄 stdout:\n", stdout);
      if (stderr?.trim()) console.log("📄 stderr:\n", stderr);

      isRunning = false;
      console.log("✅ Execução finalizada. Liberando lock.");
      resolve({ started: true });
    });

    // Se quiser ver logs em tempo real
    child.stdout?.on("data", (d) => process.stdout.write(String(d)));
    child.stderr?.on("data", (d) => process.stderr.write(String(d)));
  });
}

// Healthcheck simples
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    running: isRunning,
    lastRunAt,
    now: Date.now(),
  });
});

// Endpoint de webhook (Supabase -> aqui)
app.post("/webhook/new-order", async (req, res) => {
  try {
    const orderId = extractOrderId(req.body);

    // ✅ sempre responde rápido pro Supabase (evita retries desnecessários)
    res.status(200).json({ ok: true, received: true, order_id: orderId });

    // Se não veio id, ainda dá pra rodar o runner (ele pega o próximo PENDING)
    await runAutomation(orderId);
  } catch (err: any) {
    console.error("❌ Erro no webhook:", err?.message ?? String(err));
    // Mesmo em erro, responda com 200 se você não quiser retry.
    // Mas aqui vou mandar 500 pra ficar evidente durante testes.
    // Em produção, podemos decidir a estratégia.
    // (Se preferir 200 sempre, me fala.)
    // Nota: se já respondeu acima, não dá pra mudar status.
    try {
      res.status(500).json({ ok: false, error: err?.message ?? String(err) });
    } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`🧩 SAIBWEB webhook rodando em http://localhost:${PORT}`);
  console.log(`✅ Endpoint: POST /webhook/new-order`);
  console.log(`✅ Health:   GET  /health`);
});
