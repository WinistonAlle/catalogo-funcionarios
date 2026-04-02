import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import {
  authorizePrivilegedUser,
  getBearerToken,
  getResetWindow,
  hasSuccessfulRestoreForCycle,
  insertOperationLog,
  resolveCurrentCycleKey,
  updateOperationLog,
} from "../server/adminOperations";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const auth = await authorizePrivilegedUser(supabaseAdmin, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const window = getResetWindow();
    if (!window.allowed) {
      await insertOperationLog(supabaseAdmin, {
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

    const monthKey = await resolveCurrentCycleKey(supabaseAdmin);
    const alreadyRestored = await hasSuccessfulRestoreForCycle(supabaseAdmin, monthKey);
    if (alreadyRestored) {
      await insertOperationLog(supabaseAdmin, {
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

    const runningLog = await insertOperationLog(supabaseAdmin, {
      action: "restore_employee_balances",
      status: "running",
      actor: auth.actor,
      targetMonthKey: monthKey,
      message: `Restauração iniciada para o ciclo ${monthKey}.`,
    }).catch(() => null);

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("employee_monthly_spend")
      .update({
        spent_cents: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("month_key", monthKey)
      .gt("spent_cents", 0)
      .select("employee_id");

    if (updateError) {
      await updateOperationLog(supabaseAdmin, runningLog?.id, {
        status: "failed",
        message: `Falha ao restaurar saldo do ciclo ${monthKey}.`,
        metadata: { error: updateError.message },
      }).catch(() => null);

      return res.status(500).json({ ok: false, message: "Não foi possível resetar o saldo atual." });
    }

    await updateOperationLog(supabaseAdmin, runningLog?.id, {
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
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message || "Unexpected error" });
  }
}
