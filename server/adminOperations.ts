import type { SupabaseClient } from "@supabase/supabase-js";

export type PrivilegedActor = {
  userId: string;
  employeeId: string | null;
  cpf: string | null;
  fullName: string | null;
  role: string;
};

export type ResetWindow = {
  allowed: boolean;
  start: string;
  end: string;
};

export type AdminOperationAction = "sync_employees" | "restore_employee_balances";
export type AdminOperationStatus = "running" | "success" | "failed" | "blocked";

export type AdminOperationLogRow = {
  id: string;
  action: AdminOperationAction;
  status: AdminOperationStatus;
  actor_user_id: string | null;
  actor_employee_id: string | null;
  actor_cpf: string | null;
  actor_name: string | null;
  actor_role: string | null;
  target_month_key: string | null;
  message: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

const OPERATIONS_TABLE = "admin_operation_logs";
const TIMEZONE = "America/Sao_Paulo";

export function isMissingTableError(error: any) {
  return error?.code === "42P01" || /does not exist/i.test(String(error?.message || ""));
}

export function getBearerToken(headerValue?: string | string[] | null) {
  const auth = Array.isArray(headerValue) ? headerValue[0] : headerValue || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function authorizePrivilegedUser(
  supabase: SupabaseClient,
  token: string | null
): Promise<{ ok: true; actor: PrivilegedActor } | { ok: false; status: number; error: string }> {
  if (!token) {
    return { ok: false, status: 401, error: "Missing Bearer token" };
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "Invalid session" };
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, user_id, cpf, full_name, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (employeeError) {
    return { ok: false, status: 500, error: "Failed to check role" };
  }

  if (!employee) {
    return { ok: false, status: 403, error: "Employee not found / not linked" };
  }

  const role = String((employee as any).role || "").toLowerCase();
  if (role !== "admin" && role !== "rh") {
    return { ok: false, status: 403, error: "Not allowed" };
  }

  return {
    ok: true,
    actor: {
      userId: userData.user.id,
      employeeId: (employee as any).id ?? null,
      cpf: (employee as any).cpf ?? null,
      fullName: (employee as any).full_name ?? null,
      role,
    },
  };
}

export function getSaoPauloDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || 0),
    month: Number(parts.find((part) => part.type === "month")?.value || 0),
    day: Number(parts.find((part) => part.type === "day")?.value || 0),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getResetWindow(date = new Date()): ResetWindow {
  const { year, month, day } = getSaoPauloDateParts(date);
  const allowed = day >= 28 || day <= 2;

  if (day >= 28) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return {
      allowed,
      start: formatIsoDate(year, month, 28),
      end: formatIsoDate(nextYear, nextMonth, 2),
    };
  }

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  if (day <= 2) {
    return {
      allowed,
      start: formatIsoDate(previousYear, previousMonth, 28),
      end: formatIsoDate(year, month, 2),
    };
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return {
    allowed,
    start: formatIsoDate(year, month, 28),
    end: formatIsoDate(nextYear, nextMonth, 2),
  };
}

export async function resolveCurrentCycleKey(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("current_pay_cycle_key");
  if (error) throw error;

  const key =
    typeof data === "string"
      ? data
      : (data as any)?.key ?? (data as any)?.month_key ?? (data as any)?.current_pay_cycle_key ?? "";

  if (!key) throw new Error("RPC current_pay_cycle_key não retornou um month_key válido.");
  return key as string;
}

export async function insertOperationLog(
  supabase: SupabaseClient,
  payload: {
    action: AdminOperationAction;
    status: AdminOperationStatus;
    actor: PrivilegedActor;
    targetMonthKey?: string | null;
    message?: string | null;
    metadata?: Record<string, any> | null;
  }
) {
  const { action, status, actor, targetMonthKey = null, message = null, metadata = {} } = payload;

  const { data, error } = await supabase
    .from(OPERATIONS_TABLE)
    .insert({
      action,
      status,
      actor_user_id: actor.userId,
      actor_employee_id: actor.employeeId,
      actor_cpf: actor.cpf,
      actor_name: actor.fullName,
      actor_role: actor.role,
      target_month_key: targetMonthKey,
      message,
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  return data as AdminOperationLogRow;
}

export async function updateOperationLog(
  supabase: SupabaseClient,
  id: string | null | undefined,
  patch: {
    status?: AdminOperationStatus;
    message?: string | null;
    metadata?: Record<string, any> | null;
  }
) {
  if (!id) return null;

  const { data, error } = await supabase
    .from(OPERATIONS_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  return data as AdminOperationLogRow;
}

export async function getLatestOperation(
  supabase: SupabaseClient,
  action: AdminOperationAction,
  status?: AdminOperationStatus
) {
  let query = supabase
    .from(OPERATIONS_TABLE)
    .select("*")
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1);

  if (status) query = query.eq("status", status);

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  return (data ?? null) as AdminOperationLogRow | null;
}

export async function listOperationHistory(
  supabase: SupabaseClient,
  opts?: {
    limit?: number;
    action?: AdminOperationAction | "all";
  }
) {
  const limit = Math.max(1, Math.min(100, Number(opts?.limit ?? 30)));
  let query = supabase
    .from(OPERATIONS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts?.action && opts.action !== "all") {
    query = query.eq("action", opts.action);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return { rows: [] as AdminOperationLogRow[], storageReady: false };
    }
    throw error;
  }

  return { rows: (data ?? []) as AdminOperationLogRow[], storageReady: true };
}

export async function hasSuccessfulRestoreForCycle(supabase: SupabaseClient, monthKey: string) {
  const { data, error } = await supabase
    .from(OPERATIONS_TABLE)
    .select("id")
    .eq("action", "restore_employee_balances")
    .eq("status", "success")
    .eq("target_month_key", monthKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return false;
    throw error;
  }

  return !!data;
}

export async function getOperationsStatus(
  supabase: SupabaseClient,
  runtime: {
    syncInProgress?: boolean;
    resetInProgress?: boolean;
  } = {}
) {
  const resetWindow = getResetWindow();
  let currentCycleKey: string | null = null;

  try {
    currentCycleKey = await resolveCurrentCycleKey(supabase);
  } catch {
    currentCycleKey = null;
  }

  const [latestSync, latestRestore, historyInfo] = await Promise.all([
    getLatestOperation(supabase, "sync_employees").catch(() => null),
    getLatestOperation(supabase, "restore_employee_balances").catch(() => null),
    listOperationHistory(supabase, { limit: 6 }).catch(() => ({
      rows: [] as AdminOperationLogRow[],
      storageReady: false,
    })),
  ]);

  const restoredCurrentCycle =
    currentCycleKey ? await hasSuccessfulRestoreForCycle(supabase, currentCycleKey).catch(() => false) : false;

  return {
    ok: true,
    storageReady: historyInfo.storageReady,
    currentCycleKey,
    resetWindow,
    canResetNow: resetWindow.allowed,
    syncInProgress: !!runtime.syncInProgress,
    resetInProgress: !!runtime.resetInProgress,
    restoredCurrentCycle,
    latestSync,
    latestRestore,
    recent: historyInfo.rows,
  };
}
