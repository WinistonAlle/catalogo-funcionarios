// src/services/auth.ts
import { supabase } from "@/lib/supabase";

export type EmployeeSession = {
  id: string;
  full_name: string;
  cpf: string;
  role: string;
};

type EmployeeFromRPC = {
  id: string;
  full_name: string;
  cpf: string;
  role: string | null;
};

function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function checkCpfLogin(rawCpf: string): Promise<EmployeeSession> {
  const cpf = normalizeCpf(rawCpf);

  if (!cpf || cpf.length !== 11) {
    throw new Error("Informe um CPF válido.");
  }

  /* -------------------------------------------------
     0) SEMPRE zera a sessão Auth antes de logar outro CPF
     (isso garante que não exista “vínculo por dispositivo”)
  ------------------------------------------------- */
  try {
    await supabase.auth.signOut();
  } catch {
    // ignorar
  }

  // também limpa a sessão local do app
  localStorage.removeItem("employee_session");

  /* -------------------------------------------------
     1) valida CPF via RPC (sem RLS)
     precisa existir no Supabase: public.get_employee_by_cpf(p_cpf text)
  ------------------------------------------------- */
  const { data, error } = await supabase.rpc("get_employee_by_cpf", { p_cpf: cpf });

  if (error) {
    console.error("Erro ao validar CPF:", error);
    throw new Error("Erro ao validar CPF. Tente novamente.");
  }

  const rows = data as EmployeeFromRPC[] | null;

  if (!rows || rows.length === 0) {
    throw new Error("CPF não encontrado na base de funcionários.");
  }

  const employee = rows[0];

  /* -------------------------------------------------
     2) cria uma sessão Auth nova (JWT novo)
  ------------------------------------------------- */
  const { error: authError } = await supabase.auth.signInAnonymously();

  if (authError) {
    console.error("Erro no signInAnonymously:", authError);
    throw new Error(authError.message || "Não foi possível iniciar sessão no sistema.");
  }

  /* -------------------------------------------------
     3) vincula employees.user_id ao auth.uid()
     RPC: public.link_employee_to_user(p_cpf text)
  ------------------------------------------------- */
  const { error: linkError } = await supabase.rpc("link_employee_to_user", { p_cpf: cpf });

  if (linkError) {
    console.error("Erro ao vincular usuário:", linkError);
    throw new Error(linkError.message || "Erro ao vincular usuário.");
  }

  /* -------------------------------------------------
     4) monta sessão local do app
  ------------------------------------------------- */
  const session: EmployeeSession = {
    id: employee.id,
    full_name: employee.full_name,
    cpf: employee.cpf,
    role: employee.role ?? "employee",
  };

  localStorage.setItem("employee_session", JSON.stringify(session));
  return session;
}

export async function logoutEmployee() {
  localStorage.removeItem("employee_session");
  await supabase.auth.signOut();
}
