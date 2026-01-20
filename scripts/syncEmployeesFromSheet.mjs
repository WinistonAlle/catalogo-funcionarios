// scripts/syncEmployeesFromSheet.mjs
import "dotenv/config";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

// -------------------------
// 1. Credencial Google (preferência: ENV)
//    - Produção (Vercel): GOOGLE_SERVICE_ACCOUNT_JSON
//    - Local (fallback): google-service-account.json na raiz
// -------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_KEY_FILE = path.resolve(__dirname, "../google-service-account.json");

function loadGoogleCredentials() {
  // ✅ 1) ENV (recomendado em produção)
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw && raw.trim()) {
    const creds = JSON.parse(raw);
    // garante que quebras de linha da private_key estejam ok
    if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, "\n");
    return creds;
  }

  // ✅ 2) Fallback: arquivo local (dev)
  if (fs.existsSync(GOOGLE_KEY_FILE)) {
    const fileRaw = fs.readFileSync(GOOGLE_KEY_FILE, "utf8");
    const creds = JSON.parse(fileRaw);
    if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, "\n");
    return creds;
  }

  console.error("❌ Missing Google credentials.");
  console.error("   Use ENV GOOGLE_SERVICE_ACCOUNT_JSON (recommended),");
  console.error("   or create google-service-account.json at project root (dev only).");
  process.exit(1);
}

const googleCreds = loadGoogleCredentials();

// -------------------------
// 2. Supabase client (service role)
// -------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error("❌ Faltam variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no ambiente");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

// -------------------------
// 3. Google Sheets client
// -------------------------
const auth = new google.auth.GoogleAuth({
  credentials: googleCreds,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// -------------------------
// Helpers
// -------------------------
function normalizeHeader(h) {
  return (h || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove acentos
    .replace(/\s+/g, "_");
}

function normalizeCpf(cpf) {
  return (cpf || "").toString().trim();
}

// Aceita "350", "350,00", "R$ 350,00", "1.234,56", etc.
function parseMoneyToCentsBR(value) {
  if (value === null || value === undefined) return 0;

  const raw = value.toString().trim();
  if (!raw) return 0;

  let s = raw.replace(/[R$\s]/g, "").replace(/[^\d.,-]/g, "");

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  const num = Number(s);
  if (!Number.isFinite(num)) return 0;

  return Math.round(num * 100);
}

// Decide se hoje é “rodada mensal” (dia 1) ou diária.
// Você pode FORÇAR o modo mensal para teste com: SYNC_CREDITO_MENSAL=1
function shouldSyncMonthlyCredit() {
  if (process.env.SYNC_CREDITO_MENSAL === "1") return true;

  // timezone Brasil/São Paulo
  const now = new Date();
  const daySP = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(now)
  );
  return daySP === 1;
}

// -------------------------
// 4. Ler funcionários da planilha (com cabeçalho)
// -------------------------
async function readEmployeesFromSheet() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || "Funcionarios!A1:Z";

  if (!spreadsheetId) {
    console.error("❌ Faltando GOOGLE_SHEETS_SPREADSHEET_ID no ambiente");
    process.exit(1);
  }

  console.log("📄 Lendo dados da planilha...");
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const allRows = res.data.values || [];

  if (allRows.length < 2) {
    console.log("⚠️ Nenhuma linha encontrada na planilha (verifique se há dados após o cabeçalho).");
    return [];
  }

  const headerRow = allRows[0].map(normalizeHeader);
  const rows = allRows.slice(1);

  const idx = (name) => headerRow.indexOf(name);

  // Cabeçalhos esperados (do seu sheet):
  const iName = idx("full_name"); // A
  const iCpf = idx("cpf"); // B
  const iCredit = idx("credito_mensal"); // C
  const iRole = idx("role"); // D

  if (iName === -1 || iCpf === -1) {
    console.error("❌ Cabeçalho inválido. Precisa ter pelo menos as colunas: full_name e cpf.");
    console.error("   Cabeçalhos encontrados:", headerRow);
    process.exit(1);
  }

  const employees = rows
    .filter((row) => row[iName] && row[iCpf])
    .map((row) => {
      const full_name = row[iName].toString().trim();
      const cpf = normalizeCpf(row[iCpf]);

      const roleRaw = iRole !== -1 ? (row[iRole] || "").toString().trim() : "";
      const role = roleRaw || "employee";

      const creditoRaw = iCredit !== -1 ? row[iCredit] : "";
      const credito_mensal_cents = parseMoneyToCentsBR(creditoRaw);

      return {
        full_name,
        cpf,
        role,
        credito_mensal_cents,
      };
    })
    .filter((e) => e.cpf && e.full_name);

  console.log(`✅ Funcionários lidos da planilha: ${employees.length}`);
  return employees;
}

// -------------------------
// 5. Sincronizar com Supabase
// -------------------------
async function syncEmployees() {
  try {
    const sheetEmployees = await readEmployeesFromSheet();

    if (sheetEmployees.length === 0) {
      console.log("⚠️ Nada para sincronizar.");
      return;
    }

    const cpfsInSheet = sheetEmployees.map((e) => e.cpf);

    console.log("🔎 Buscando funcionários atuais no Supabase...");
    const { data: dbEmployees, error: dbError } = await supabase.from("employees").select("id, cpf");

    if (dbError) {
      console.error("❌ Erro ao buscar employees no Supabase:", dbError);
      return;
    }

    const cpfsInDb = (dbEmployees || []).map((e) => normalizeCpf(e.cpf));
    const cpfsInDbSet = new Set(cpfsInDb);

    // ✅ Regra:
    // - Todo dia: só cadastra/atualiza dados “cadastro”
    // - Dia 1: atualiza o credito_mensal_cents de todo mundo
    // - Qualquer dia: se for funcionário novo (CPF não existe ainda), insere já com crédito
    const syncCredit = shouldSyncMonthlyCredit();

    console.log(
      syncCredit
        ? "📅 Hoje é rodada MENSAL: vai sincronizar credito_mensal de todos."
        : "🗓️ Rodada DIÁRIA: vai sincronizar cadastro; e crédito só para funcionários NOVOS."
    );

    const payload = sheetEmployees.map((e) => {
      const base = {
        cpf: e.cpf,
        full_name: e.full_name,
        role: e.role,
      };

      const isNew = !cpfsInDbSet.has(e.cpf);

      if (syncCredit || isNew) {
        return {
          ...base,
          credito_mensal_cents: e.credito_mensal_cents,
        };
      }

      return base;
    });

    console.log("⬆️ Fazendo upsert dos funcionários da planilha...");
    const { error: upsertError } = await supabase.from("employees").upsert(payload, {
      onConflict: "cpf",
    });

    if (upsertError) {
      console.error("❌ Erro no upsert de employees:", upsertError);
      return;
    }

    const cpfsToDelete = cpfsInDb.filter((cpf) => cpf && !cpfsInSheet.includes(cpf));

    if (cpfsToDelete.length > 0) {
      console.log("🗑️ Removendo do Supabase (não estão mais na planilha):", cpfsToDelete);
      const { error: deleteError } = await supabase.from("employees").delete().in("cpf", cpfsToDelete);

      if (deleteError) {
        console.error("❌ Erro ao deletar employees:", deleteError);
        return;
      }
    } else {
      console.log("👌 Nenhum funcionário para remover.");
    }

    console.log("🎉 Sincronização concluída com sucesso!");
    console.log(`   Total na planilha: ${sheetEmployees.length}`);
    console.log(`   Removidos: ${cpfsToDelete.length}`);
    console.log(`   Crédito mensal sincronizado hoje? ${syncCredit ? "SIM (todos)" : "NÃO (só novos)"}`);
  } catch (err) {
    console.error("💥 Erro geral na sincronização:", err);
  }
}

syncEmployees();
