import dotenv from "dotenv";
dotenv.config();

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const SHEET_SYNC_INTERVAL_MS = Number(
  process.env.SHEET_SYNC_INTERVAL_MS ?? 60 * 60 * 1000
);
const INITIAL_DELAY_MS = Number(process.env.SHEET_SYNC_INITIAL_DELAY_MS ?? 5_000);
const SHEET_SCRIPT_PATH =
  process.env.SHEET_SYNC_SCRIPT_PATH ||
  path.resolve(PROJECT_ROOT, "scripts", "syncEmployeesFromSheet.mjs");

let sheetSyncRunning = false;
let lastSheetSyncAt: number | null = null;

function runSheetSync() {
  if (sheetSyncRunning) {
    console.log("🟡 Sync Google Sheets já em execução. Pulando.");
    return;
  }

  sheetSyncRunning = true;
  lastSheetSyncAt = Date.now();

  console.log("📊 Iniciando sync Google Sheets");
  console.log("▶️ node", SHEET_SCRIPT_PATH);

  const child = spawn(process.execPath, [SHEET_SCRIPT_PATH], {
    cwd: PROJECT_ROOT,
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

console.log("🧩 Sheet sync service iniciado");
console.log(`⏱️ Intervalo: ${SHEET_SYNC_INTERVAL_MS} ms`);
console.log(`⏳ Delay inicial: ${INITIAL_DELAY_MS} ms`);

setTimeout(() => {
  runSheetSync();
  setInterval(runSheetSync, SHEET_SYNC_INTERVAL_MS);
}, INITIAL_DELAY_MS);

process.on("SIGTERM", () => {
  console.log("🛑 Encerrando sheet sync service");
  process.exit(0);
});
