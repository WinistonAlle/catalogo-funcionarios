import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_TIMEZONE = "America/Sao_Paulo";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getBearerToken(req: VercelRequest) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function getZonedParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Missing Bearer token" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, message: "Invalid session" });
    }

    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("role, user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (empErr) return res.status(500).json({ ok: false, message: "Failed to check role" });
    if (!emp) return res.status(403).json({ ok: false, message: "Employee not found / not linked" });

    const role = String((emp as any).role || "").toLowerCase();
    const isAdmin = role === "admin";
    const isRh = role === "rh";

    if (!isAdmin && !isRh) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }

    const window = getResetWindow();
    if (!window.allowed) {
      return res.status(400).json({
        ok: false,
        message: `Você só pode resetar o saldo de ${window.start} até ${window.end}.`,
        allowedWindow: window,
      });
    }

    const { data: cycleData, error: cycleError } = await supabaseAdmin.rpc("current_pay_cycle_key");
    if (cycleError) {
      return res.status(500).json({ ok: false, message: "Não foi possível identificar o ciclo atual." });
    }

    const monthKey =
      typeof cycleData === "string"
        ? cycleData
        : cycleData?.key ?? cycleData?.month_key ?? cycleData?.current_pay_cycle_key ?? null;

    if (!monthKey) {
      return res.status(500).json({ ok: false, message: "O ciclo atual não retornou um month_key válido." });
    }

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
      return res.status(500).json({ ok: false, message: "Não foi possível resetar o saldo atual." });
    }

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
