import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { processPendingOrders, isEligibleForCigamEntry } from "./cigam/process-pending-orders";
import { syncEstoque } from "./cigam/sync-estoque";
import {
  gerarPdfPortaria,
  gerarPdfPedidoUnico,
  marcarPortariaImpressa,
  printPortariaList,
} from "./print/portariaList";
import { CigamClient } from "./cigam/client";
import {
  consultarComCliente,
  montarRelatorio,
  semanaSabadoASexta,
} from "./relatorio-abatimentos";
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

    // 27/08/2026: aqui existia um segundo passo que zerava
    // `employee_monthly_spend.spent_cents` do ciclo. Ele saiu junto com a
    // tabela, que foi removida por não ter escritor nenhum no fluxo real de
    // pedido (as 5 funções que escreviam nela estavam mortas). Com direito e
    // saldo separados, o gasto do ciclo é DERIVADO — `direito - saldo` — então
    // reabastecer o saldo já zera o gasto exibido, por construção. Não há mais
    // um segundo lugar para ficar dessincronizado, nem um segundo passo que
    // pudesse falhar deixando o reabastecimento pela metade.
    const { count: restauradosCount } = await supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .gt("credito_mensal_cents", 0);

    balanceRestoreRunning = false;
    await updateOperationLog(supabase, runningLog?.id, {
      status: "success",
      message: "Saldo de todos os funcionários restaurado para o valor inicial da planilha.",
      metadata: {
        updatedCount: restauradosCount ?? 0,
        syncStdout: syncOutput.stdout.slice(0, 2000),
        syncStderr: syncOutput.stderr.slice(0, 2000),
      },
    }).catch(() => null);

    return res.status(200).json({
      ok: true,
      message: "Saldo de todos os funcionários restaurado para o valor inicial da planilha.",
      monthKey,
      updatedCount: restauradosCount ?? 0,
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
 * Relatório de abatimentos da folha — o papel que o faturamento entregava ao RH
 * toda sexta (27/08/2026). Agora o próprio RH puxa.
 *
 * GET /relatorio-abatimentos?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 *
 * Sem datas, usa a semana de SÁBADO A SEXTA corrente.
 *
 * Cada pedido com recibo é perguntado ao CIGAM, um a um — é o único jeito de
 * pegar recibo que o catálogo acha que existe e o ERP não conhece. Isso custa
 * uma chamada por pedido; com o volume real (dezenas por semana) fica em poucos
 * segundos, e a trava abaixo impede duas gerações simultâneas brigando pela
 * sessão única do CIGAM.
 */
let relatorioAbatimentosRunning = false;

app.get("/relatorio-abatimentos", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    if (relatorioAbatimentosRunning) {
      return res.status(409).json({
        ok: false,
        message: "Já tem um relatório sendo gerado. Espere ele terminar e tente de novo.",
      });
    }

    const padrao = semanaSabadoASexta();
    const inicio = validarData(req.query.inicio) ?? padrao.inicio;
    const fim = validarData(req.query.fim) ?? padrao.fim;

    if (inicio > fim) {
      return res.status(400).json({ ok: false, message: "A data inicial é depois da final." });
    }

    // O intervalo é em data de São Paulo; created_at é timestamptz. -03:00
    // explícito para a sexta-feira inteira entrar (até 23:59:59 local).
    const de = `${inicio}T00:00:00-03:00`;
    const ate = `${fim}T23:59:59-03:00`;

    const { data: pedidos, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, employee_name, employee_cpf, created_at, total_cents, " +
          "wallet_used_cents, cancelled_at, printed_at, erp_external_id, erp_status"
      )
      // Cancelado nunca entra: o saldo foi estornado, não há o que abater.
      .is("cancelled_at", null)
      // Sem débito no saldo não há abatimento — pedido zerado ou só retirada.
      .gt("wallet_used_cents", 0)
      .gte("created_at", de)
      .lte("created_at", ate)
      .order("created_at", { ascending: true })
      .limit(2000);

    if (error) {
      return res.status(500).json({ ok: false, message: error.message });
    }

    relatorioAbatimentosRunning = true;
    try {
      const relatorio = await montarRelatorio(
        (pedidos ?? []) as any,
        inicio,
        fim,
        consultarComCliente(cigamStockClient)
      );
      return res.status(200).json({ ok: true, relatorio });
    } finally {
      relatorioAbatimentosRunning = false;
    }
  } catch (err: any) {
    relatorioAbatimentosRunning = false;
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/** Aceita só YYYY-MM-DD; qualquer outra coisa vira "use o padrão". */
function validarData(valor: unknown): string | null {
  const s = String(valor ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

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

/**
 * Produto visível sem `cigam_code` é uma bomba-relógio: `buildItens`
 * (automation/cigam/process-pending-orders.ts) lança "Produto sem código CIGAM"
 * no PRIMEIRO item sem código e derruba o pedido INTEIRO — com o saldo do
 * funcionário já debitado no checkout, porque o débito acontece antes de o
 * pedido chegar no ERP. Não é hipótese: em 13/08/2026 o Pão de Queijo Gourmet
 * 1kg estava comprável assim.
 *
 * A tela não protege: `isOutOfStock` (src/lib/stock.ts) é fail-open, então
 * produto com saldo desconhecido aparece como disponível.
 *
 * Até 26/08 a defesa era um SQL no CLAUDE.md que alguém tinha que lembrar de
 * rodar depois de cada carga de produto. Agora a checagem anda junto do sync de
 * estoque, que já roda de 30 em 30 min. Só GRITA no log — esconder produto do
 * catálogo é decisão de quem vende, não do robô.
 */
async function checarProdutosSemCodigoCigam() {
  const { data, error } = await supabase
    .from("products")
    .select("name, cigam_code, is_hidden")
    .is("cigam_code", null)
    .or("is_hidden.is.null,is_hidden.eq.false");

  if (error) {
    console.error("🚨 Não deu para checar produtos sem código CIGAM:", error.message);
    return;
  }

  const semCodigo = data ?? [];
  if (semCodigo.length === 0) return;

  console.error(
    `🚨 ATENÇÃO: ${semCodigo.length} produto(s) VISÍVEIS no catálogo sem código CIGAM. ` +
      "Qualquer pedido que incluir um deles vai falhar INTEIRO com o saldo do funcionário " +
      "já debitado. Esconda no admin (is_hidden = true) ou cadastre o código:"
  );
  for (const p of semCodigo) console.error(`   • ${p.name}`);
}

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
    await checarProdutosSemCodigoCigam();
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
        message: `PDF gerado com ${pedidos.length} pedido(s) — aguardando confirmação de impressão.`,
        metadata: { total: pedidos.length, pedidos, marcados: false },
      }).catch(() => null);

      if (pedidos.length === 0) {
        return res.status(200).json({ ok: true, message: "Nenhum pedido pendente pra imprimir." });
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="lista-portaria-${new Date().toISOString().slice(0, 10)}.pdf"`
      );
      // Os ids da leva viajam no header porque o corpo é o PDF. A tela
      // devolve essa mesma lista em /print-portaria-confirm depois que o
      // faturamento diz que as folhas saíram — ver gerarPdfPortaria.
      res.setHeader("X-Portaria-Pedidos", pedidos.map((p) => p.orderId).join(","));
      res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Portaria-Pedidos");
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

/**
 * Segundo passo do botão da portaria: o faturamento confirma que as folhas
 * saíram no papel e SÓ ENTÃO os pedidos somem da lista.
 *
 * Gerar o PDF não marca mais nada (ver `gerarPdfPortaria`), então um PDF que
 * não vira papel deixa os pedidos exatamente onde estavam — prontos pra
 * próxima tentativa. O preço de não confirmar é uma folha repetida; o preço de
 * marcar cedo demais era um pedido invisível.
 */
app.post("/print-portaria-confirm", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String) : [];
    if (orderIds.length === 0) {
      return res.status(400).json({ ok: false, message: "orderIds é obrigatório." });
    }

    try {
      const { marcados } = await marcarPortariaImpressa(supabase, orderIds);

      await insertOperationLog(supabase, {
        action: "print_portaria",
        status: "success",
        actor: auth.actor,
        message: `Impressão confirmada: ${marcados.length} de ${orderIds.length} pedido(s) marcados como impressos.`,
        metadata: { pedidos: orderIds, marcados, confirmado: true },
      }).catch(() => null);

      return res.status(200).json({
        ok: true,
        marcados: marcados.length,
        message: `${marcados.length} pedido(s) marcados como impressos.`,
      });
    } catch (err: any) {
      await insertOperationLog(supabase, {
        action: "print_portaria",
        status: "failed",
        actor: auth.actor,
        message: "Falha ao confirmar a impressão da lista da portaria.",
        metadata: { pedidos: orderIds, error: err?.message ?? String(err) },
      }).catch(() => null);

      return res
        .status(500)
        .json({ ok: false, message: err?.message || "Falha ao confirmar a impressão." });
    }
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * Impressão avulsa de UM pedido — botão "Imprimir" por linha em AdminOrders,
 * pra reimprimir ou imprimir na hora um pedido específico sem esperar o
 * disparo automático ou baixar a lista inteira ("vai que acontece algo").
 * Sem os filtros de corte/dia útil/pago do fluxo normal — ver
 * gerarPdfPedidoUnico para o porquê.
 */
app.post("/print-order-now/:orderId", async (req, res) => {
  try {
    const auth = await authorizePrivilegedUser(supabase, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const orderId = String(req.params.orderId ?? "").trim();
    if (!orderId) {
      return res.status(400).json({ ok: false, message: "orderId é obrigatório." });
    }

    const runningLog = await insertOperationLog(supabase, {
      action: "print_order",
      status: "running",
      actor: auth.actor,
      message: `Impressão avulsa do pedido ${orderId} iniciada.`,
    }).catch(() => null);

    try {
      const { pdf, orderNumber, jaImpresso } = await gerarPdfPedidoUnico({ supabase, orderId });

      await updateOperationLog(supabase, runningLog?.id, {
        status: "success",
        message: `PDF do pedido ${orderNumber} gerado.`,
        metadata: { orderId, orderNumber, jaImpresso },
      }).catch(() => null);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="pedido-${orderNumber}.pdf"`
      );
      return res.status(200).send(pdf);
    } catch (err: any) {
      await updateOperationLog(supabase, runningLog?.id, {
        status: "failed",
        message: "Falha ao gerar o PDF do pedido.",
        metadata: { orderId, error: err?.message ?? String(err) },
      }).catch(() => null);

      return res.status(500).json({ ok: false, message: err?.message || "Falha ao gerar o PDF." });
    }
  } catch (err: any) {
    return res.status(500).json({ ok: false, message: err?.message || "Unexpected error" });
  }
});

/**
 * CHECAGEM DE SAÚDE — o vigia que faltava.
 *
 * Por que existe (26/08/2026): o cron que sincroniza a planilha morreu num
 * upgrade de node em ~abril e ninguém percebeu por quatro meses. Foram 9919
 * falhas empilhadas num arquivo de log que ninguém abre. O sistema inteiro é
 * assim: quando uma peça para, ela para em SILÊNCIO — nada quebra na cara do
 * usuário, o pedido só deixa de andar.
 *
 * Isto não é monitoramento de verdade (não avisa ninguém fora do servidor). É o
 * mínimo honesto: um resumo em intervalo fixo no log do pm2, gritando em
 * `console.error` só quando tem coisa errada, pra que `pm2 logs webhook` responda
 * "está tudo de pé?" sem precisar de quatro consultas SQL na mão.
 */
const HEALTH_CHECK_INTERVAL_MS = Number(process.env.HEALTH_CHECK_INTERVAL_MS ?? 60 * 60 * 1000);

/**
 * Para onde o vigia grita além do log (27/08/2026).
 *
 * O vigia nasceu em 26/08 gritando só em `console.error`, o que quer dizer: em
 * `pm2 logs webhook`, que alguém precisa lembrar de abrir. Isso repete o defeito
 * que ele foi criado para cobrir — a recarga mensal passou 4 meses morta
 * empilhando falha em `~/sheets.log` sem ninguém ver. Alerta que só existe num
 * log é alerta que não existe.
 *
 * Agora ele faz três coisas com o que encontra:
 *
 *   1. GRAVA em `admin_operation_logs` (action `health_check`). Fica no banco,
 *      consultável, com histórico — dá pra responder "desde quando isso está
 *      quebrado?" sem ler log rotacionado.
 *   2. MOSTRA no /admin: o painel lê a última linha e pinta uma faixa. Quem
 *      abre o admin vê, sem precisar de acesso ao servidor.
 *   3. ENVIA para `HEALTH_ALERT_WEBHOOK_URL`, se estiver definida. Um POST JSON
 *      simples, sem credencial nenhuma no código.
 *
 * (3) está desligada por padrão porque hoje não há canal ligado: o
 * `whatsapp-sender` roda no mesmo servidor, mas o container `whatsapp-service`
 * está parado e conectar o número exige alguém escanear um QR code. Quando
 * houver canal — WhatsApp, um webhook do Slack, o que for — é só apontar a
 * variável; nada aqui muda.
 *
 * Falha de envio NUNCA derruba a checagem: o alerta já está no banco e no log
 * antes de a rede ser tocada.
 */
const HEALTH_ALERT_WEBHOOK_URL = process.env.HEALTH_ALERT_WEBHOOK_URL ?? "";

async function enviarAlertaExterno(alertas: string[]) {
  if (!HEALTH_ALERT_WEBHOOK_URL) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const resposta = await fetch(HEALTH_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        origem: "catalogo-funcionarios",
        severidade: "alerta",
        quando: new Date().toISOString(),
        // `texto` já vem pronto para cair num WhatsApp/Slack sem formatação.
        texto:
          `🚨 Catálogo de funcionários — ${alertas.length} problema(s):\n` +
          alertas.map((a) => `• ${a}`).join("\n"),
        alertas,
      }),
    });

    clearTimeout(timeout);

    if (!resposta.ok) {
      console.error(
        `⚠️ Vigia: HEALTH_ALERT_WEBHOOK_URL respondeu ${resposta.status}. ` +
          "O alerta está gravado no banco e no log, mas não saiu daqui."
      );
    }
  } catch (err: any) {
    console.error(
      `⚠️ Vigia: falha ao enviar alerta externo (${err?.message ?? err}). ` +
        "O alerta está gravado no banco e no log, mas não saiu daqui."
    );
  }
}

async function runHealthCheck() {
  const alertas: string[] = [];
  const agora = new Date();

  // 1. A planilha ainda sincroniza? Foi esta peça que morreu calada.
  try {
    const { data } = await supabase
      .from("admin_operation_logs")
      .select("created_at, metadata")
      .eq("action", "sync_employees")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1);

    const ultimo = data?.[0]?.created_at ? new Date(data[0].created_at) : null;
    if (!ultimo) {
      alertas.push("Nunca houve um sync da planilha bem-sucedido registrado.");
    } else {
      const horas = (agora.getTime() - ultimo.getTime()) / 3_600_000;
      // O cron roda de 20 em 20 min; 26h de silêncio é peça parada, não folga.
      if (horas > 26) {
        alertas.push(
          `Sync da planilha parado há ${Math.floor(horas)}h (último em ${ultimo.toISOString()}). ` +
            "Confira o crontab do xulio e o ~/sheets.log."
        );
      }
    }
  } catch (err: any) {
    alertas.push(`Não deu para checar o sync da planilha: ${err?.message ?? err}`);
  }

  // 2. Fila do CIGAM travada — pedido pago que não vira recibo é dinheiro
  //    debitado sem contrapartida no ERP.
  //
  //    ⚠️ `PENDING` sozinho NÃO é sintoma: pedido feito depois do corte das
  //    13:40 (ou em dia não útil) fica em PENDING de propósito até o próximo
  //    dia útil. A primeira versão desta checagem ignorava isso e acusou o
  //    GM-20260826-6865, das 14:30, que estava perfeitamente normal. Alerta que
  //    grita à toa é alerta que todo mundo aprende a ignorar — e aí volta a ser
  //    o log que ninguém lê. Por isso a régua aqui é a MESMA da integração:
  //    `isEligibleForCigamEntry`.
  try {
    const limite = new Date(agora.getTime() - 30 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("orders")
      .select("order_number, erp_status, created_at")
      .in("erp_status", ["PENDING", "ERROR"])
      .lt("created_at", limite)
      .is("cancelled_at", null)
      .limit(50);

    const travados = (data ?? []).filter((o: any) =>
      // ERROR é falha de verdade em qualquer horário. PENDING só conta como
      // travado se o pedido JÁ podia ter entrado e mesmo assim não entrou.
      o.erp_status === "ERROR" || isEligibleForCigamEntry(new Date(o.created_at), agora)
    );

    if (travados.length > 0) {
      alertas.push(
        `${travados.length} pedido(s) parados na fila do CIGAM: ` +
          travados.map((o: any) => `${o.order_number} (${o.erp_status})`).join(", ") +
          ". Painel em /admin/integracao."
      );
    }
  } catch (err: any) {
    alertas.push(`Não deu para checar a fila do CIGAM: ${err?.message ?? err}`);
  }

  // 3. Pedido pago esperando separação há mais de um dia. Foi o sintoma de
  //    26/08: três pedidos parados porque ninguém imprimiu a lista.
  try {
    const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("orders")
      .select("order_number, employee_name, created_at")
      .is("printed_at", null)
      .is("cancelled_at", null)
      .lt("created_at", ontem)
      .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0,wallet_used_cents.gt.0")
      .limit(20);

    if (data && data.length > 0) {
      alertas.push(
        `${data.length} pedido(s) pagos há mais de 24h e ainda não impressos — ninguém puxou a ` +
          "lista da portaria: " +
          data.map((o: any) => `${o.order_number} (${o.employee_name})`).join(", ")
      );
    }
  } catch (err: any) {
    alertas.push(`Não deu para checar pedidos não impressos: ${err?.message ?? err}`);
  }

  // 4. Dia 27 é o único dia em que o saldo de todo mundo é recarregado. Se
  //    passar em branco, 250 pessoas entram no ciclo novo com a sobra do
  //    anterior — e ninguém repara até alguém reclamar que não dá pra comprar.
  try {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(agora);
    const dia = Number(partes.find((p) => p.type === "day")?.value ?? "0");
    const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");

    // A rodada mensal é às 03:00; a partir das 05:00 a ausência já é sintoma.
    if (dia === 27 && hora >= 5) {
      const inicioDoDia = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("admin_operation_logs")
        .select("created_at, metadata")
        .eq("action", "sync_employees")
        .eq("status", "success")
        .gte("created_at", inicioDoDia)
        .limit(50);

      const recarregou = (data ?? []).some(
        (linha: any) => linha?.metadata?.creditoSincronizado === true
      );
      if (!recarregou) {
        alertas.push(
          "HOJE É DIA 27 e a recarga mensal de crédito ainda NÃO rodou. Sem ela todo mundo " +
            "começa o ciclo novo com a sobra do anterior. Rode o sync da planilha (ou o botão " +
            "Restaurar saldo, que só abre de 27 a 2)."
        );
      }
    }
  } catch (err: any) {
    alertas.push(`Não deu para checar a recarga mensal: ${err?.message ?? err}`);
  }

  // 5. Saldo maior que o direito é impossível pelo caminho normal: o checkout
  //    só desconta, o estorno nunca devolve mais do que tirou, e a recarga faz
  //    saldo := direito. Se aparecer, alguma escrita passou por fora — foi
  //    exatamente esse tipo de escrita (planilha caindo direto no saldo) que a
  //    separação de 27/08/2026 fechou. É a checagem que confere se a separação
  //    continua valendo.
  //
  //    Uma exceção legítima e esperada: se o RH REDUZIR o direito de alguém no
  //    meio do ciclo, essa pessoa fica com saldo acima do direito novo até a
  //    próxima recarga. Por isso o alerta lista os nomes em vez de só contar —
  //    quem lê precisa distinguir "o RH mexeu na planilha" de "tem escrita
  //    solta no saldo".
  try {
    const { data } = await supabase
      .from("employees")
      .select("full_name, credito_mensal_cents, credito_direito_cents")
      .order("full_name")
      .limit(500);

    const acimaDoDireito = (data ?? []).filter(
      (e: any) => Number(e.credito_mensal_cents ?? 0) > Number(e.credito_direito_cents ?? 0)
    );

    if (acimaDoDireito.length > 0) {
      const amostra = acimaDoDireito
        .slice(0, 5)
        .map(
          (e: any) =>
            `${e.full_name} (saldo ${formatarReais(e.credito_mensal_cents)} > direito ${formatarReais(
              e.credito_direito_cents
            )})`
        )
        .join(", ");

      alertas.push(
        `${acimaDoDireito.length} funcionário(s) com SALDO maior que o DIREITO: ${amostra}` +
          (acimaDoDireito.length > 5 ? ", …" : "") +
          ". Se o direito foi reduzido na planilha no meio do ciclo, é esperado e se " +
          "resolve na próxima recarga. Se não foi, alguma escrita está caindo direto no saldo."
      );
    }
  } catch (err: any) {
    alertas.push(`Não deu para checar saldo contra direito: ${err?.message ?? err}`);
  }

  if (alertas.length === 0) {
    console.log("💚 Checagem de saúde: tudo de pé.");
    // O silêncio também é gravado: sem isso não dá pra distinguir "está tudo
    // bem" de "o vigia parou de rodar" — que é o mesmo engano que deixou a
    // recarga morta por 4 meses.
    await insertOperationLog(supabase, {
      action: "health_check",
      status: "success",
      message: "Tudo de pé.",
      metadata: { alertas: [], total: 0 },
    }).catch(() => null);
    return;
  }

  console.error(`🚨 Checagem de saúde encontrou ${alertas.length} problema(s):`);
  for (const alerta of alertas) console.error(`   • ${alerta}`);

  // Grava ANTES de tentar a rede: se o envio falhar, o alerta não se perde.
  await insertOperationLog(supabase, {
    action: "health_check",
    status: "failed",
    message: `${alertas.length} problema(s) encontrado(s).`,
    metadata: { alertas, total: alertas.length },
  }).catch(() => null);

  await enviarAlertaExterno(alertas);
}

function formatarReais(cents: unknown): string {
  const valor = Number(cents ?? 0) / 100;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

  if (HEALTH_CHECK_INTERVAL_MS > 0) {
    const minutos = Math.round(HEALTH_CHECK_INTERVAL_MS / 60000);
    console.log(`💚 Checagem de saúde LIGADA — a cada ${minutos} min (grita só quando tem problema).`);
    setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
    // Uma passada logo depois de subir, pra quem reinicia o webhook já ver o
    // estado sem esperar a primeira hora.
    setTimeout(() => void runHealthCheck(), 60_000);
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
