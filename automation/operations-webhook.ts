import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { processPendingOrders } from "./cigam/process-pending-orders";
import { syncEstoque } from "./cigam/sync-estoque";
import { gerarPdfPortaria, printPortariaList } from "./print/portariaList";
import { CigamClient } from "./cigam/client";
import {
  filtrarPayloadAviso,
  filtrarPayloadFuncionario,
  filtrarPayloadProduto,
} from "./admin-payloads";
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

function runEmployeeSyncScript(opts: { forceCreditSync?: boolean } = {}): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(PROJECT_ROOT, "scripts", "syncEmployeesFromSheet.mjs");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: PROJECT_ROOT,
      // SYNC_CREDITO_MENSAL=1 força a rodada MENSAL (a que reabastece
      // credito_mensal_cents de todo mundo a partir da planilha) mesmo fora
      // do dia 27 — é o que dá ao botão "Restaurar saldo" um efeito de
      // verdade, e serve de catch-up se o cron do dia 27 tiver falhado.
      env: opts.forceCreditSync ? { ...process.env, SYNC_CREDITO_MENSAL: "1" } : process.env,
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

    // O reabastecimento de verdade é isto: reler a planilha e sobrescrever
    // credito_mensal_cents de todo mundo — a MESMA rotina que roda sozinha
    // no dia 27 (ver scripts/syncEmployeesFromSheet.mjs), só que forçada por
    // SYNC_CREDITO_MENSAL=1 pra valer em qualquer dia dentro da janela. Até
    // 19/08/2026 este endpoint só zerava employee_monthly_spend.spent_cents
    // — uma tabela que nunca é incrementada em lugar nenhum do fluxo normal
    // de pedido, então "restaurar saldo" não restaurava saldo nenhum.
    let syncOutput: ChildOutput;
    try {
      syncOutput = await runEmployeeSyncScript({ forceCreditSync: true });
    } catch (syncError: any) {
      balanceRestoreRunning = false;
      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: `Falha ao reabastecer credito_mensal_cents do ciclo ${monthKey} pela planilha.`,
        metadata: {
          code: syncError?.code ?? null,
          stdout: String(syncError?.stdout || "").slice(0, 2000),
          stderr: String(syncError?.stderr || "").slice(0, 2000),
        },
      }).catch(() => null);

      return res.status(500).json({
        ok: false,
        message: "Não foi possível reabastecer o saldo a partir da planilha.",
      });
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
      balanceRestoreRunning = false;
      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: `credito_mensal_cents foi reabastecido, mas falhou ao zerar employee_monthly_spend do ciclo ${monthKey}.`,
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
        syncStdout: syncOutput.stdout.slice(0, 2000),
        syncStderr: syncOutput.stderr.slice(0, 2000),
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

/**
 * Materiais do CIGAM (grupo "002", produto acabado) que ainda NÃO viraram
 * produto aqui — pra tela de cadastro deixar de ser "digite o código na mão"
 * e virar "escolha da lista do que já existe no ERP".
 *
 * Sem isto não existe NENHUM jeito de ligar um produto novo ao código CIGAM
 * dele (confirmado 19/08/2026: nenhuma tela grava cigam_code) — produto
 * cadastrado sem código fica comprável (fail-open) e quebra o pedido inteiro
 * na hora de sincronizar, com o saldo do funcionário já debitado.
 */
app.get("/admin/cigam-materiais-nao-cadastrados", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const [materiais, existentes] = await Promise.all([
      cigamStockClient.buscarTodosMateriais(),
      supabase
        .from("products")
        .select("cigam_code")
        .not("cigam_code", "is", null)
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return new Set((data ?? []).map((p: any) => String(p.cigam_code ?? "").trim()).filter(Boolean));
        }),
    ]);

    const naoCadastrados = materiais.filter((m) => !existentes.has(m.codigo));

    return res.status(200).json({ ok: true, materiais: naoCadastrados });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Falha ao consultar materiais do CIGAM." });
  }
});

/**
 * Cadastra um produto novo A PARTIR de um material do CIGAM já escolhido na
 * lista acima — não aceita `codigoMaterial` de qualquer jeito: revalida
 * contra o CIGAM na hora (busca de novo, com o mesmo filtro do grupo "002")
 * antes de gravar, então um código adulterado ou já usado por outro produto
 * nunca entra. `cigam_code`/`cigam_unit`/peso vêm do CIGAM, não do que o
 * cliente mandou — só nome/preço/categoria/foto/descrição são do formulário.
 *
 * Por isso esta rota é separada de POST /admin/products (que continua
 * recusando cigam_code — ver filtrarPayloadProduto): ali seria texto livre
 * digitado por alguém; aqui é sempre um código que acabou de ser confirmado
 * como existente e ainda não usado, escolhido de uma lista, nunca digitado.
 */
app.post("/admin/products-from-cigam", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const codigoMaterial = String(req.body?.codigoMaterial ?? "").trim();
    if (!codigoMaterial) {
      return res.status(400).json({ ok: false, message: "codigoMaterial é obrigatório." });
    }

    const payload = filtrarPayloadProduto(req.body?.payload ?? {});
    if (!payload.name) {
      return res.status(400).json({ ok: false, message: "Nome do produto é obrigatório." });
    }

    const [materiais, jaUsado] = await Promise.all([
      cigamStockClient.buscarTodosMateriais(),
      supabase
        .from("products")
        .select("id")
        .eq("cigam_code", codigoMaterial)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) throw new Error(error.message);
          return !!data;
        }),
    ]);

    const material = materiais.find((m) => m.codigo === codigoMaterial);
    if (!material) {
      return res.status(400).json({
        ok: false,
        message: "Esse código não existe mais no CIGAM como produto acabado (grupo 002) — atualize a lista e tente de novo.",
      });
    }
    if (jaUsado) {
      return res.status(409).json({
        ok: false,
        message: `Esse material já foi cadastrado como produto (${material.descricao}) — alguém deve ter cadastrado ao mesmo tempo.`,
      });
    }

    const { data: produto, error: insertError } = await supabase
      .from("products")
      .insert({ ...payload, cigam_code: material.codigo, cigam_unit: material.unidadeMedida })
      .select()
      .maybeSingle();

    if (insertError) {
      return res.status(400).json({ ok: false, message: insertError.message, code: insertError.code });
    }

    if (material.pesoEmbalagemKg && produto?.id) {
      const { error: weightError } = await supabase
        .from("weight")
        .upsert({ product_id: produto.id, weight: material.pesoEmbalagemKg }, { onConflict: "product_id" });
      if (weightError) {
        // Produto já foi criado — não desfaz, só avisa. Peso dá pra corrigir
        // depois na tela normal de edição.
        return res.status(200).json({
          ok: true,
          product: produto,
          warning: `Produto criado, mas falhou ao gravar o peso (${material.pesoEmbalagemKg}kg): ${weightError.message}`,
        });
      }
    }

    return res.status(200).json({ ok: true, product: produto });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Falha ao cadastrar produto a partir do CIGAM." });
  }
});

/**
 * Escrita de produtos por Admin/RH.
 *
 * Existe para tirar essa escrita do navegador. Até 12/08/2026 a tela de admin
 * gravava `products` direto com a chave anon — que está no bundle público, então
 * QUALQUER pessoa podia alterar `employee_price` e mudar o que o funcionário
 * paga. Aqui a escrita passa por `authorizePrivilegedUser` e usa a service role.
 *
 * O payload continua sendo montado no frontend (`mapEditingToDbPayload`), para
 * não duplicar regra em dois lugares — o servidor só autoriza e filtra colunas.
 */
app.post("/admin/products", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const payload = filtrarPayloadProduto(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    const { data, error } = await supabase.from("products").insert(payload).select().maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, product: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.patch("/admin/products/:id", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "id obrigatório." });

    // `id` nunca vai no SET: ele identifica a linha, não é campo editável.
    const { id: _ignorado, ...payload } = filtrarPayloadProduto(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    const { data, error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, product: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.delete("/admin/products/:id", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "id obrigatório." });

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * Escrita de funcionário por Admin/RH.
 *
 * `credito_mensal_cents` NÃO está na lista de colunas permitidas, de propósito:
 * é o campo que decide quanto o funcionário pode gastar, nenhuma tela o edita, e
 * deixá-lo passar aqui reabriria por outra porta o buraco que estamos fechando.
 * Quem escreve saldo é o RPC de pagamento, a planilha e /reset-employee-balances.
 */
app.post("/admin/employees", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const payload = filtrarPayloadFuncionario(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    const { data, error } = await supabase.from("employees").insert(payload).select().maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, employee: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.patch("/admin/employees/:id", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "id obrigatório." });

    const payload = filtrarPayloadFuncionario(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    const { data, error } = await supabase
      .from("employees")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, employee: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.post("/admin/notices", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const payload = filtrarPayloadAviso(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    // A autoria vem da SESSÃO, não do corpo da requisição: quem assina o aviso é
    // quem está autenticado. Antes o cliente mandava esse id e podia assinar
    // como qualquer um.
    const { data, error } = await supabase
      .from("notices")
      .insert({ ...payload, created_by_employee_id: auth.actor.employeeId })
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, notice: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.patch("/admin/notices/:id", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "id obrigatório." });

    const payload = filtrarPayloadAviso(req.body?.payload ?? req.body);
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok: false, message: "Payload vazio ou sem colunas válidas." });
    }

    const { data, error } = await supabase
      .from("notices")
      .update(payload)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true, notice: data });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

app.delete("/admin/notices/:id", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) return res.status(auth.status).json({ ok: false, message: auth.error });

    const id = String(req.params.id ?? "").trim();
    if (!id) return res.status(400).json({ ok: false, message: "id obrigatório." });

    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) return res.status(400).json({ ok: false, message: error.message, code: error.code });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
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
 * Painel de integração: pedidos que não chegaram ao CIGAM.
 *
 * Junta três situações que antes só se enxergava com SQL na mão:
 *
 *  - ERROR    — falhou em algum ponto. A maioria (56, em 13/08/2026) é lixo da
 *               era Saibweb: `erp_error` é timeout de locator do Playwright e
 *               nenhum tem `erp_external_id`. Vêm marcados com `legado: true`
 *               para não se misturarem com problema de verdade.
 *  - PENDING  — na fila. O auto-sync varre a cada 2 min, então PENDING parado
 *               há muito tempo é sintoma, não estado normal: `preso: true`
 *               marca os que passaram de 15 min.
 *  - órfão    — DONE/sem status mas sem `erp_external_id`. É o caso do pedido
 *               excluído no ERP: o processador só varre PENDING, então ele
 *               nunca é reenviado e fica parado para sempre.
 */
const MINUTOS_ATE_CONSIDERAR_PRESO = 15;

/**
 * Quando a integração CIGAM entrou no ar (primeiro pedido real: GM-20260811-4844
 * → CIGAM 011750). Pedido anterior a esta data nunca teve chance de ir ao CIGAM:
 * os 278 `SYNCED` e os 56 `ERROR` são todos da era Saibweb. Classificar por data
 * é mais honesto do que adivinhar pelo texto do `erp_error`.
 */
const CIGAM_NO_AR_DESDE = new Date("2026-08-11T00:00:00-03:00");

app.get("/admin/integracao/pedidos", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);

    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, erp_status, erp_error, erp_external_id, created_at, total_cents, employee_name"
      )
      .or("erp_status.eq.ERROR,erp_status.eq.PENDING,erp_external_id.is.null")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }

    const agora = Date.now();
    const rows = (data ?? []).map((row: any) => {
      const status = String(row.erp_status ?? "").toUpperCase();
      const criadoEm = new Date(row.created_at);
      const idadeMin = (agora - criadoEm.getTime()) / 60000;

      // Nada anterior à integração é acionável: não existia caminho para o
      // CIGAM. Marcar como legado tira 334 linhas do caminho de quem precisa
      // ver o que está quebrado hoje.
      const legado = criadoEm < CIGAM_NO_AR_DESDE;

      // DISCARDED é decisão tomada (os 20 pedidos de 10/07–06/08, resolvidos
      // na mão antes da integração existir). Não é problema, não é órfão.
      const descartado = status === "DISCARDED";

      return {
        id: row.id,
        order_number: row.order_number,
        erp_status: row.erp_status,
        erp_error: row.erp_error,
        erp_external_id: row.erp_external_id,
        created_at: row.created_at,
        total_cents: row.total_cents,
        funcionario: row.employee_name ?? null,
        legado,
        descartado,
        preso: !legado && status === "PENDING" && idadeMin > MINUTOS_ATE_CONSIDERAR_PRESO,
        // Sem número do CIGAM e fora da fila: o processador só varre PENDING,
        // então ninguém vai reenviar sozinho. É o caso do pedido excluído no ERP.
        orfao:
          !legado &&
          !descartado &&
          !row.erp_external_id &&
          status !== "PENDING",
      };
    });

    return res.status(200).json({ ok: true, rows });
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * Recoloca um pedido na fila do processador.
 *
 * O conserto que antes era manual: voltar `erp_status` para PENDING e limpar
 * `erp_external_id`/`erp_error`. Sem isso o pedido fica órfão, porque
 * `processPendingOrders` só varre PENDING.
 *
 * ⚠️ Recusa pedido que JÁ tem `erp_external_id`, senão o próximo ciclo do
 * auto-sync cria um segundo pedido no CIGAM — documento fiscal duplicado. Para
 * esse caso o pedido precisa primeiro ser excluído no ERP, e aí o `force`
 * assume que isso foi feito.
 */
app.post("/admin/integracao/pedidos/:id/reenfileirar", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const { id } = req.params;
    const force = req.body?.force === true;

    const { data: pedido, error: readErr } = await supabase
      .from("orders")
      .select("id, order_number, erp_status, erp_external_id")
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      return res.status(500).json({ ok: false, message: readErr.message });
    }

    if (!pedido) {
      return res.status(404).json({ ok: false, message: "Pedido não encontrado." });
    }

    if (pedido.erp_external_id && !force) {
      return res.status(409).json({
        ok: false,
        message:
          `Este pedido já foi criado no CIGAM (${pedido.erp_external_id}). ` +
          "Reenfileirar criaria um pedido duplicado no ERP. " +
          "Exclua-o no CIGAM primeiro e repita confirmando.",
        requerConfirmacao: true,
        erp_external_id: pedido.erp_external_id,
      });
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ erp_status: "PENDING", erp_external_id: null, erp_error: null })
      .eq("id", id);

    if (updateErr) {
      return res.status(500).json({ ok: false, message: updateErr.message });
    }

    console.log(
      `🔁 Pedido ${pedido.order_number} reenfileirado por ${auth.actor.fullName || auth.actor.cpf}` +
        (force ? " (forçado, tinha CIGAM " + pedido.erp_external_id + ")" : "")
    );

    return res.status(200).json({ ok: true, order_number: pedido.order_number });
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

/* ==========================================================================
   PRIMEIRO ACESSO DE ADMIN/RH — sem senha padrão

   Decisão do Winiston (17/08/2026): não existe mais senha pré-definida. Quem
   nunca acessou cria a própria senha na primeira entrada, informando só o CPF.

   ⚠️ RISCO ACEITO E CONHECIDO: este endpoint é PÚBLICO por decisão de produto.
   O CPF é público (crachá, folha, planilha), então quem souber o CPF de um
   admin que ainda não acessou pode criar a senha dele e virar admin. Foi
   apresentado ao Winiston em 17/08/2026, com as duas alternativas fechadas
   (código único por pessoa / liberação pelo painel), e ele escolheu o acesso
   aberto mesmo assim.

   O que limita o estrago, e por que cada pedaço existe:
   - A janela fecha sozinha: `must_change_password` vira false na primeira
     criação, e daí em diante o CPF sozinho não abre mais nada — só a senha.
     Ou seja, o risco dura até cada pessoa fazer o primeiro acesso, e some
     conta a conta. Por isso vale distribuir isso rápido.
   - Toda criação vira linha em `admin_operation_logs` com IP e user agent
     (action `first_access`). Se uma conta for tomada, dá para ver quando e
     de onde — é o que permite reagir em vez de descobrir pelo estrago.
   - Só vale para admin/RH que ainda não acessaram. Funcionário comum não
     passa por aqui, e conta já criada recebe 409.
   ========================================================================== */

const MIN_PASSWORD_LENGTH = 8;

function normalizeCpf(raw: unknown): string {
  return String(raw ?? "").replace(/\D/g, "");
}

function isPrivilegedRole(role: unknown): boolean {
  const normalized = String(role ?? "").toLowerCase();
  return normalized === "admin" || normalized === "rh";
}

type FirstAccessLookup =
  | { pendente: false; motivo: string }
  | {
      pendente: true;
      userId: string;
      employee: { id: string; full_name: string; cpf: string; role: string };
      metadata: Record<string, any>;
    };

/**
 * Responde se o CPF é de admin/RH que ainda não criou senha.
 *
 * Deliberadamente não distingue "CPF não existe" de "CPF é de funcionário
 * comum" de "já criou a senha": tudo vira `pendente: false`. O app já descobre
 * o papel pelo `get_employee_by_cpf`, então isso não esconde nada de quem olha
 * de fora — mas evita transformar este endpoint num segundo lugar que confirma
 * quem é admin.
 */
async function lookupPrimeiroAcesso(cpf: string): Promise<FirstAccessLookup> {
  const { data: rows, error } = await supabase
    .from("employees")
    .select("id, full_name, cpf, role, user_id")
    .eq("cpf", cpf)
    .limit(1);

  if (error) throw new Error(error.message);

  const employee = rows?.[0];
  if (!employee) return { pendente: false, motivo: "CPF não encontrado." };
  if (!isPrivilegedRole(employee.role)) {
    return { pendente: false, motivo: "Conta não é de admin/RH." };
  }
  if (!employee.user_id) {
    // Conta privilegiada sem usuário no Auth: não dá para criar senha por aqui.
    // Cai no fluxo de senha e falha no login, que é o comportamento honesto —
    // criar o usuário aqui deixaria qualquer um provisionar um admin.
    return { pendente: false, motivo: "Conta sem usuário de autenticação." };
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    employee.user_id
  );
  if (userError) throw new Error(userError.message);

  const metadata = (userData?.user?.user_metadata ?? {}) as Record<string, any>;
  if (metadata.must_change_password !== true) {
    return { pendente: false, motivo: "Primeiro acesso já foi feito." };
  }

  return {
    pendente: true,
    userId: employee.user_id,
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      cpf: employee.cpf,
      role: String(employee.role),
    },
    metadata,
  };
}

/** GET /automation/primeiro-acesso?cpf=... → { pendente: boolean } */
app.get("/primeiro-acesso", async (req, res) => {
  try {
    const cpf = normalizeCpf(req.query.cpf);
    if (cpf.length !== 11) {
      return res.status(400).json({ ok: false, error: "Informe um CPF válido." });
    }

    const info = await lookupPrimeiroAcesso(cpf);
    return res.json({ ok: true, pendente: info.pendente });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Unexpected error" });
  }
});

/** POST /automation/primeiro-acesso  { cpf, senha } → cria a senha da conta. */
app.post("/primeiro-acesso", async (req, res) => {
  try {
    const cpf = normalizeCpf(req.body?.cpf);
    const senha = String(req.body?.senha ?? "");

    if (cpf.length !== 11) {
      return res.status(400).json({ ok: false, error: "Informe um CPF válido." });
    }
    if (senha.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      });
    }

    const info = await lookupPrimeiroAcesso(cpf);
    if (!info.pendente) {
      // 409 e não 403: para a conta já criada, a mensagem certa é "entre com
      // sua senha", que é exatamente o que a tela faz com este status.
      return res.status(409).json({
        ok: false,
        error: "Este acesso já tem senha. Entre com a sua senha.",
      });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(info.userId, {
      password: senha,
      user_metadata: { ...info.metadata, must_change_password: false },
    });

    if (updateError) {
      return res.status(500).json({
        ok: false,
        error: updateError.message || "Não foi possível criar a senha.",
      });
    }

    // Rastro de quem criou cada acesso. É o que sobra de defesa no desenho
    // aberto: não impede a conta ser tomada, mas deixa ver que foi.
    try {
      await insertOperationLog(supabase, {
        action: "first_access",
        status: "success",
        actor: {
          userId: info.userId,
          employeeId: info.employee.id,
          cpf: info.employee.cpf,
          fullName: info.employee.full_name,
          role: info.employee.role,
        },
        message: `Senha criada no primeiro acesso de ${info.employee.full_name}.`,
        metadata: {
          ip:
            String(req.headers["x-forwarded-for"] ?? "")
              .split(",")[0]
              .trim() || req.socket.remoteAddress || null,
          userAgent: req.headers["user-agent"] ?? null,
        },
      });
    } catch (logErr: any) {
      // Log é rastro, não pré-requisito: já criamos a senha, e devolver erro
      // aqui deixaria a pessoa achando que não funcionou.
      console.error("Falha ao registrar primeiro acesso:", logErr?.message ?? logErr);
    }

    return res.json({ ok: true });
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

/**
 * Cache curto do saldo ao vivo.
 *
 * Este endpoint é público e sem autenticação, e cada chamada vira uma consulta
 * por material no CIGAM — que admite **uma sessão por usuário**, compartilhada
 * com o PDV da loja. Sem cache, finalizar carrinho em sequência (ou qualquer um
 * batendo no endpoint de fora) vira carga direta no ERP e briga de sessão com o
 * caixa.
 *
 * 20s é curto o bastante para o checkout continuar sendo "ao vivo" — a
 * alternativa que ele substitui é o `stock_qty` do Supabase, que pode ter até
 * 30 min de idade.
 */
const ESTOQUE_CACHE_TTL_MS = 20_000;
const estoqueCache = new Map<string, { saldo: number; ts: number }>();

app.get("/estoque", async (req, res) => {
  try {
    const raw = String(req.query.materiais ?? "").trim();
    if (!raw) return res.json({ saldos: {} });
    const codigos = raw.split(",").map((c) => c.trim()).filter(Boolean).slice(0, 100);

    const agora = Date.now();
    const saldos = new Map<string, number>();
    const aConsultar: string[] = [];
    for (const codigo of codigos) {
      const cacheado = estoqueCache.get(codigo);
      if (cacheado && agora - cacheado.ts < ESTOQUE_CACHE_TTL_MS) saldos.set(codigo, cacheado.saldo);
      else aConsultar.push(codigo);
    }

    if (aConsultar.length > 0) {
      // Serial, igual ao sync: concorrência faz o CIGAM devolver linha vazia, e
      // aqui uma linha vazia é pior que lenta — vira fail-open e LIBERA a venda
      // de um item esgotado, no exato momento em que deveria barrar. Ver
      // CigamClient.buscarDisponibilidades.
      const novos = await cigamStockClient.buscarDisponibilidades(aConsultar);
      for (const [codigo, saldo] of novos) {
        saldos.set(codigo, saldo);
        estoqueCache.set(codigo, { saldo, ts: agora });
      }
    }

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

/**
 * Lista de separação impressa na portaria: uma folha por pedido pago e ainda
 * não impresso, uma vez por dia útil às 13:40 (o resto das checagens no
 * mesmo dia não fazem nada além de retentar o que falhou — ver
 * print/portariaList.ts). Desligado por padrão — só liga com
 * PORTARIA_PRINTER_HOST e PORTARIA_PRINT_INTERVAL_MS > 0 configurados.
 */
const PORTARIA_PRINTER_HOST = process.env.PORTARIA_PRINTER_HOST;
const PORTARIA_PRINT_INTERVAL_MS = Number(process.env.PORTARIA_PRINT_INTERVAL_MS ?? 0);
let portariaPrintRunning = false;

async function runPortariaPrint() {
  if (portariaPrintRunning) return; // evita sobreposição de execuções
  if (!PORTARIA_PRINTER_HOST) return;
  portariaPrintRunning = true;
  try {
    const resultados = await printPortariaList({ supabase, printerHost: PORTARIA_PRINTER_HOST });
    if (resultados.length > 0) {
      const ok = resultados.filter((r) => r.status === "IMPRESSO").length;
      const erros = resultados.filter((r) => r.status === "ERRO");
      console.log(`🖨️ Lista da portaria: ${ok} impresso(s), ${erros.length} com erro.`);
      for (const e of erros) console.log(`   ⚠️ ${e.orderNumber}: ${e.error}`);
    }
  } catch (err: any) {
    console.error("🖨️ Lista da portaria falhou:", err?.message ?? err);
  } finally {
    portariaPrintRunning = false;
  }
}

/**
 * Geração manual do PDF da lista de separação, pro faturamento resgatar o
 * fluxo de antes: eles clicam, baixam UM arquivo com todos os pedidos
 * pendentes (uma folha por pedido) e imprimem como imprimem qualquer
 * documento — sem IP de impressora nenhum envolvido. Convive sem conflito
 * com o disparo automático das 13:40 (que continua mandando direto pra
 * impressora da portaria): os dois só pegam pedido com printed_at nulo — o
 * que sair aqui não é pego de novo lá, e vice-versa.
 *
 * ignoreCutoffGuard: true porque isto é intenção explícita de alguém, pode
 * rodar a qualquer hora do dia útil (não só depois das 13:40) — mas o
 * critério de QUAIS pedidos entram (criados antes do corte de hoje)
 * continua o mesmo.
 */
app.post("/print-portaria-now", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    if (portariaPrintRunning) {
      return res.status(409).json({
        ok: false,
        message: "Já existe uma geração da lista da portaria em andamento.",
      });
    }

    portariaPrintRunning = true;
    const runningLog = await insertOperationLog(supabase, {
      action: "print_portaria",
      status: "running",
      actor: auth.actor,
      message: "Geração manual do PDF da lista da portaria iniciada.",
    }).catch(() => null);

    try {
      const { pdf, pedidos } = await gerarPdfPortaria({ supabase, ignoreCutoffGuard: true });

      await updateOperationLog(supabase, runningLog?.id, {
        status: "success",
        message: `PDF gerado com ${pedidos.length} pedido(s).`,
        metadata: { total: pedidos.length, pedidos },
      }).catch(() => null);

      if (pedidos.length === 0) {
        return res.status(200).json({ ok: true, message: "Nenhum pedido pendente pra imprimir." });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="lista-portaria-${new Date().toISOString().slice(0, 10)}.pdf"`
      );
      return res.status(200).send(pdf);
    } catch (err: any) {
      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: "Falha ao gerar o PDF da lista da portaria.",
        metadata: { error: err?.message ?? String(err) },
      }).catch(() => null);

      return res.status(500).json({ ok: false, message: err?.message || "Falha ao gerar o PDF." });
    } finally {
      portariaPrintRunning = false;
    }
  } catch (err: any) {
    portariaPrintRunning = false;
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

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

  if (PORTARIA_PRINT_INTERVAL_MS > 0 && PORTARIA_PRINTER_HOST) {
    const segundos = Math.round(PORTARIA_PRINT_INTERVAL_MS / 1000);
    console.log(
      `🖨️ Lista da portaria LIGADA — checando a cada ${segundos}s (imprime uma vez por dia útil, às 13:40).`
    );
    setInterval(runPortariaPrint, PORTARIA_PRINT_INTERVAL_MS);
  } else {
    console.log(
      "🖨️ Lista da portaria desligada (defina PORTARIA_PRINTER_HOST e PORTARIA_PRINT_INTERVAL_MS para ligar)."
    );
  }
});
