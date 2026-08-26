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
    return { creds, source: "env" };
  }

  // ✅ 2) Fallback: arquivo local (servidor/dev)
  if (fs.existsSync(GOOGLE_KEY_FILE)) {
    const fileRaw = fs.readFileSync(GOOGLE_KEY_FILE, "utf8");
    const creds = JSON.parse(fileRaw);
    if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, "\n");
    return { creds, source: "file" };
  }

  console.error("❌ Missing Google credentials.");
  console.error("   Use ENV GOOGLE_SERVICE_ACCOUNT_JSON (recommended),");
  console.error("   or create google-service-account.json at project root (dev only).");
  process.exit(1);
}

const { creds: googleCreds, source: googleCredsSource } = loadGoogleCredentials();

console.log(
  `🔐 Google credentials source: ${googleCredsSource === "env" ? "GOOGLE_SERVICE_ACCOUNT_JSON" : GOOGLE_KEY_FILE}`
);
console.log(`📧 Google service account: ${googleCreds?.client_email ?? "(missing client_email)"}`);

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
  const digits = (cpf || "").toString().replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(11, "0").slice(0, 11);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

// employees.role é enum estrito no Postgres (employee/admin/rh/separacao,
// tudo minúsculo). Sem isto, um "Admin" ou "RH " digitado na planilha (erro
// fácil) derruba o upsert INTEIRO — os 255 funcionários de uma vez, não só a
// linha errada — porque o upsert manda todo mundo num lote só. Normaliza
// caixa/espaço e, se ainda assim não bater com nenhum valor válido, cai pro
// papel menos privilegiado (nunca eleva por engano a partir de um valor
// estranho) e avisa no log pra alguém arrumar a planilha.
const VALID_ROLES = new Set(["employee", "admin", "rh", "separacao"]);

function normalizeRole(roleRaw, context) {
  const normalized = (roleRaw || "").toLowerCase();
  if (!normalized) return "employee";
  if (VALID_ROLES.has(normalized)) return normalized;

  console.warn(
    `⚠️ Role inválida "${roleRaw}" para CPF ${context.cpf} (${context.full_name}) — usando "employee". ` +
      `Valores aceitos: ${Array.from(VALID_ROLES).join(", ")}.`
  );
  return "employee";
}

/**
 * Deixa rastro da rodada em admin_operation_logs.
 *
 * Por que existe (26/08/2026): as rodadas do cron não apareciam em lugar
 * nenhum. O único sinal era ~/sheets.log, que ninguém lê — e foi exatamente
 * assim que o cron quebrado (npm de um node que não existe mais) passou uns 4
 * meses despercebido, acumulando 9919 falhas. Sem rastro no banco, nem a tela
 * de operações nem a checagem de saúde do webhook conseguem dizer "faz 26h que
 * a planilha não sincroniza".
 *
 * Nunca derruba o sync: log é rastro, não a operação.
 */
async function registrarLog(status, message, metadata) {
  try {
    const { error } = await supabase.from("admin_operation_logs").insert({
      action: "sync_employees",
      status,
      message,
      metadata: { origem: process.env.SYNC_ORIGEM || "script", ...metadata },
    });
    if (error) console.error("🟡 Não deu para registrar o log da sincronização:", error.message);
  } catch (err) {
    console.error("🟡 Não deu para registrar o log da sincronização:", err?.message ?? err);
  }
}

function failSync(message, error) {
  if (error) {
    console.error(message, error);
  } else {
    console.error(message);
  }

  throw new Error(message);
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

// Decide se hoje é “rodada mensal” (dia 27) ou diária.
// Você pode FORÇAR o modo mensal para teste com: SYNC_CREDITO_MENSAL=1
function shouldSyncMonthlyCredit() {
  if (process.env.SYNC_CREDITO_MENSAL === "1") return true;

  // Recusa explícita: a rodada de CADASTRO, que roda de 20 em 20 minutos, passa
  // por aqui com SYNC_CREDITO_MENSAL=0.
  //
  // Por que isso existe (26/08/2026): a rodada mensal REESCREVE
  // credito_mensal_cents com o valor da planilha, e credito_mensal_cents é o
  // saldo corrente, não um teto. Rodar isso de 20 em 20 minutos no dia 27
  // devolveria o saldo cheio a cada 20 minutos — quem pedisse R$ 300 às 9h
  // estaria com R$ 300 de novo às 9h20, o dia inteiro. Comida de graça em
  // laço. A recarga tem que acontecer UMA vez no dia 27 (a rodada diária das
  // 03:00 no crontab), e as rodadas frequentes só cuidam de cadastro.
  if (process.env.SYNC_CREDITO_MENSAL === "0") return false;

  // timezone Brasil/São Paulo
  const now = new Date();
  const daySP = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(now)
  );
  return daySP === 27;
}

function shouldDeleteMissingEmployees() {
  return process.env.SYNC_DELETE_MISSING_FROM_SHEET === "1";
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
      const role = normalizeRole(roleRaw, { cpf, full_name });

      const creditoRaw = iCredit !== -1 ? row[iCredit] : "";
      const credito_mensal_cents = parseMoneyToCentsBR(creditoRaw);

      return {
        full_name,
        cpf,
        role,
        credito_mensal_cents,
      };
    })
    .filter((e) => e.cpf.length === 11 && e.full_name);

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

    const cpfsInSheet = unique(sheetEmployees.map((e) => e.cpf));
    const cpfsInSheetSet = new Set(cpfsInSheet);

    console.log("🔎 Buscando funcionários atuais no Supabase...");
    const { data: dbEmployees, error: dbError } = await supabase
      .from("employees")
      .select("id, cpf, credito_mensal_cents");

    if (dbError) {
      failSync("❌ Erro ao buscar employees no Supabase:", dbError);
    }

    const dbEmployeesNormalized = (dbEmployees || [])
      .map((e) => ({
        id: e.id,
        cpf_raw: e.cpf,
        cpf_normalized: normalizeCpf(e.cpf),
        credito_mensal_cents:
          e.credito_mensal_cents === null || e.credito_mensal_cents === undefined
            ? null
            : Number(e.credito_mensal_cents),
      }))
      .filter((e) => e.cpf_normalized);

    const existingCreditByCpf = new Map(
      dbEmployeesNormalized.map((employee) => [employee.cpf_normalized, employee.credito_mensal_cents])
    );

    const cpfsInDb = unique(dbEmployeesNormalized.map((e) => e.cpf_normalized));
    const cpfsInDbSet = new Set(cpfsInDb);

    // ✅ Regra:
    // - Todo dia: só cadastra/atualiza dados “cadastro”
    // - Dia 27: atualiza o credito_mensal_cents de todo mundo
    // - Qualquer dia: se for funcionário novo (CPF não existe ainda), insere já com crédito
    let syncCredit = shouldSyncMonthlyCredit();
    let creditGuardTripped = false;

    console.log(
      syncCredit
        ? "📅 Hoje é rodada MENSAL: vai sincronizar credito_mensal de todos."
        : "🗓️ Rodada DIÁRIA: vai sincronizar cadastro; e crédito só para funcionários NOVOS."
    );

    // Trava de segurança pra rodada MENSAL: ela sobrescreve
    // credito_mensal_cents de TODO MUNDO de uma vez (é o único mecanismo que
    // reabastece o saldo de verdade — ver "Restaurar saldo" no admin). Se a
    // coluna "credito_mensal" sumir da planilha, for renomeada, ou alguém
    // limpar as células por engano, todo mundo leria 0 e a rodada mensal
    // zeraria o saldo de todos os 255 funcionários de uma vez, sem erro
    // nenhum. Isso é fisicamente impossível de acontecer numa planilha real
    // preenchida — então trata como sinal de que algo está errado e aborta a
    // parte de crédito (cadastro ainda sincroniza normalmente).
    if (syncCredit) {
      const totalCreditoNaPlanilha = sheetEmployees.reduce((sum, e) => sum + e.credito_mensal_cents, 0);
      if (totalCreditoNaPlanilha <= 0) {
        console.error(
          "🛑 Rodada MENSAL abortada: a soma de credito_mensal de todos os funcionários na planilha deu " +
            "R$ 0,00. Isso indica que a coluna 'credito_mensal' sumiu, foi renomeada ou está vazia — não " +
            "que os 255 funcionários realmente têm saldo zero. Corrija a planilha e rode de novo (ou force " +
            "com SYNC_CREDITO_MENSAL=1). Ninguém teve o saldo alterado por esta rodada."
        );
        syncCredit = false;
        creditGuardTripped = true;
      }
    }

    const payload = sheetEmployees.map((e) => {
      const base = {
        cpf: e.cpf,
        full_name: e.full_name,
        role: e.role,
      };

      const isNew = !cpfsInDbSet.has(e.cpf);
      const currentCredit = existingCreditByCpf.get(e.cpf);
      const credito_mensal_cents =
        syncCredit || isNew || currentCredit === null || currentCredit === undefined
          ? e.credito_mensal_cents
          : currentCredit;

      return {
        ...base,
        credito_mensal_cents,
      };
    });

    console.log("⬆️ Fazendo upsert dos funcionários da planilha...");
    const { error: upsertError } = await supabase.from("employees").upsert(payload, {
      onConflict: "cpf",
    });

    if (upsertError) {
      failSync("❌ Erro no upsert de employees:", upsertError);
    }

    const allowDelete = shouldDeleteMissingEmployees();

    // Recarrega após o upsert para não decidir exclusão com snapshot antigo do banco.
    const { data: dbEmployeesAfterUpsert, error: dbAfterError } = await supabase
      .from("employees")
      .select("id, cpf");

    if (dbAfterError) {
      failSync("❌ Erro ao recarregar employees após upsert:", dbAfterError);
    }

    const dbEmployeesAfterNormalized = (dbEmployeesAfterUpsert || [])
      .map((e) => ({
        id: e.id,
        cpf_raw: e.cpf,
        cpf_normalized: normalizeCpf(e.cpf),
      }))
      .filter((e) => e.id && e.cpf_normalized);

    const rowsToDelete = dbEmployeesAfterNormalized.filter(
      (row) => !cpfsInSheetSet.has(row.cpf_normalized)
    );
    const cpfsToDelete = unique(rowsToDelete.map((row) => row.cpf_normalized));
    const idsToDelete = unique(rowsToDelete.map((row) => row.id));

    console.log(`🧾 CPFs planilha (normalizados): ${cpfsInSheet.length}`);
    console.log(`🗃️ CPFs banco antes do upsert (normalizados): ${cpfsInDb.length}`);
    console.log(
      `🗃️ CPFs banco após upsert (normalizados): ${unique(
        dbEmployeesAfterNormalized.map((row) => row.cpf_normalized)
      ).length}`
    );

    if (idsToDelete.length > 0 && allowDelete) {
      console.log("🗑️ Removendo do Supabase (não estão mais na planilha):", cpfsToDelete);
      const { error: deleteError } = await supabase.from("employees").delete().in("id", idsToDelete);

      if (deleteError) {
        failSync("❌ Erro ao deletar employees:", deleteError);
      }
    } else if (idsToDelete.length > 0) {
      console.log(
        "🟡 Exclusão automática desabilitada. Para remover CPFs ausentes da planilha, use SYNC_DELETE_MISSING_FROM_SHEET=1."
      );
      console.log("🟡 CPFs que seriam removidos:", cpfsToDelete);
    } else {
      console.log("👌 Nenhum funcionário para remover.");
    }

    console.log("🎉 Sincronização concluída com sucesso!");
    console.log(`   Total na planilha: ${sheetEmployees.length}`);
    console.log(`   Removidos: ${cpfsToDelete.length}`);
    console.log(`   Crédito mensal sincronizado hoje? ${syncCredit ? "SIM (todos)" : "NÃO (só novos)"}`);

    if (creditGuardTripped) {
      // Cadastro sincronizou normalmente, mas o reabastecimento mensal NÃO
      // rodou (trava de segurança acima) — sai com código diferente de 0
      // pra quem chamou este script (webhook de /reset-employee-balances,
      // ou o próprio cron) enxergar isto como falha, não como sucesso.
      process.exitCode = 2;
      await registrarLog(
        "failed",
        "Cadastro sincronizado, mas a recarga mensal de crédito foi ABORTADA pela trava: " +
          "a soma de credito_mensal na planilha deu R$ 0,00.",
        { total: sheetEmployees.length, creditoSincronizado: false, travaDeCredito: true }
      );
    } else {
      await registrarLog(
        "success",
        `Sincronização concluída: ${sheetEmployees.length} na planilha, ` +
          `${cpfsToDelete.length} removido(s), crédito mensal ${syncCredit ? "RECARREGADO" : "não tocado"}.`,
        {
          total: sheetEmployees.length,
          removidos: cpfsToDelete.length,
          creditoSincronizado: syncCredit,
        }
      );
    }
  } catch (err) {
    console.error("💥 Erro geral na sincronização:", err);
    await registrarLog("failed", `Sincronização falhou: ${err?.message ?? err}`, {
      creditoSincronizado: false,
    });
    process.exit(1);
  }
}

syncEmployees();
