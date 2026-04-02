import { supabase } from "@/lib/supabase";

async function postWithAuth(paths: string[]) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  let lastPayload: any = null;
  let lastErrorMessage = "";

  for (const path of paths) {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = await response.json().catch(() => null);
      lastPayload = payload;

      if (response.ok && payload?.ok) {
        return payload;
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
  return postWithAuth(["/automation/sync-employees", "/api/sync-employees"]);
}

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

export async function resetAllEmployeeBalances() {
  return (await postWithAuth([
    "/automation/reset-employee-balances",
    "/api/reset-employee-balances",
  ])) as ResetEmployeeBalancesResponse;
}
