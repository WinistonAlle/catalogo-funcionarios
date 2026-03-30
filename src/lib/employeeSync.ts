import { supabase } from "@/lib/supabase";

export async function triggerEmployeeSyncNow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  const response = await fetch("/api/sync-employees", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Não foi possível sincronizar os funcionários.");
  }

  return payload;
}
