import { supabase } from "@/lib/supabase";

export type ResetEmployeeBalancesResponse = {
  ok: boolean;
  message?: string;
  monthKey?: string | null;
  updatedCount?: number;
  allowedWindow?: {
    start: string;
    end: string;
  };
};

export type AdminOperationAction = "sync_employees" | "restore_employee_balances";
export type AdminOperationStatus = "running" | "success" | "failed" | "blocked";

export type AdminOperationLog = {
  id: string;
  action: AdminOperationAction;
  status: AdminOperationStatus;
  actor_user_id?: string | null;
  actor_employee_id?: string | null;
  actor_cpf?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  target_month_key?: string | null;
  message?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type AdminOperationsStatusResponse = {
  ok: boolean;
  storageReady: boolean;
  currentCycleKey: string | null;
  resetWindow: {
    allowed: boolean;
    start: string;
    end: string;
  };
  canResetNow: boolean;
  syncInProgress: boolean;
  resetInProgress: boolean;
  restoredCurrentCycle: boolean;
  latestSync: AdminOperationLog | null;
  latestRestore: AdminOperationLog | null;
  recent: AdminOperationLog[];
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  return accessToken;
}

async function requestWithAuth<T>(paths: string[], init?: RequestInit) {
  const accessToken = await getAccessToken();
  let lastErrorMessage = "";

  for (const path of paths) {
    try {
      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
      });

      const payload = (await response.json().catch(() => null)) as T & {
        ok?: boolean;
        error?: string;
        message?: string;
      } | null;

      if (response.ok && payload?.ok !== false) {
        return payload as T;
      }

      lastErrorMessage =
        payload?.message || payload?.error || `Falha ao executar a ação em ${path}.`;
    } catch (error: any) {
      lastErrorMessage = error?.message || `Falha de rede ao acessar ${path}.`;
    }
  }

  throw new Error(lastErrorMessage || "Não foi possível executar a ação.");
}

export async function triggerEmployeeSyncNow() {
  return requestWithAuth<any>(["/automation/sync-employees", "/api/sync-employees"], {
    method: "POST",
  });
}

export async function resetAllEmployeeBalances() {
  return requestWithAuth<ResetEmployeeBalancesResponse>(
    ["/automation/reset-employee-balances", "/api/reset-employee-balances"],
    {
      method: "POST",
    }
  );
}

export async function getAdminOperationsStatus() {
  return requestWithAuth<AdminOperationsStatusResponse>(
    ["/automation/operations/status", "/api/operations-status"],
    {
      method: "GET",
    }
  );
}

export async function listAdminOperationHistory(opts?: {
  limit?: number;
  action?: AdminOperationAction | "all";
}) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.action) params.set("action", opts.action);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestWithAuth<{ ok: boolean; storageReady: boolean; rows: AdminOperationLog[] }>(
    [`/automation/operations/history${suffix}`, `/api/operations-history${suffix}`],
    {
      method: "GET",
    }
  );
}

export function formatOperationAction(action?: AdminOperationAction | null) {
  if (action === "sync_employees") return "Sincronização de funcionários";
  if (action === "restore_employee_balances") return "Restauração de saldo";
  return "Operação";
}

export function formatOperationStatus(status?: AdminOperationStatus | null) {
  if (status === "running") return "Em andamento";
  if (status === "success") return "Concluído";
  if (status === "failed") return "Falhou";
  if (status === "blocked") return "Bloqueado";
  return "Desconhecido";
}
