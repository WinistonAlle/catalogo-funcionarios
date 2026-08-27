import { supabase } from "@/lib/supabase";

/**
 * Quem está clicando. Mesma busca que AdminOrders faz há tempos (localStorage
 * primeiro, sessão do Supabase como reserva) — extraída aqui porque a tela de
 * liberação de pedido precisa do mesmo dado, e ela vive no RH, longe do Admin.
 *
 * O localStorage vem primeiro porque o login de funcionário é por CPF e nem
 * sempre existe usuário do Auth por trás. No iPhone/PWA o Safari às vezes
 * limpa o storage — daí a segunda tentativa.
 */
function apenasDigitos(s: string) {
  return (s || "").replace(/\D/g, "");
}

function cpfDoLocalStorage(): string {
  if (typeof window === "undefined") return "";

  const direto =
    localStorage.getItem("gm_employee_cpf") ||
    localStorage.getItem("employee_cpf") ||
    localStorage.getItem("cpf");
  if (direto) return apenasDigitos(direto);

  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return "";
    const obj = JSON.parse(raw);
    return apenasDigitos(obj?.cpf || obj?.employee_cpf || "");
  } catch {
    return "";
  }
}

export async function getActorCpf(): Promise<string> {
  const local = cpfDoLocalStorage();
  if (local) return local;

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return "";

  const { data, error } = await supabase
    .from("employees")
    .select("cpf")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "";

  return apenasDigitos((data as any)?.cpf || "");
}

/** O nome de quem está clicando; cai no CPF quando não achar nome. */
export async function getActorNome(cpf: string): Promise<string> {
  if (!cpf) return "";
  const { data, error } = await supabase
    .from("employees")
    .select("full_name")
    .eq("cpf", cpf)
    .maybeSingle();
  if (error || !data) return cpf;
  return ((data as any)?.full_name as string) || cpf;
}
