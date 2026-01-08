import { supabase } from "@/lib/supabase";

export type Employee = {
  id?: string;
  cpf: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  job_title?: string | null;
  status?: "active" | "inactive" | "onboarding";
  hired_at?: string | null;       // ISO date
  terminated_at?: string | null;  // ISO date
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
};

export async function listEmployees(opts: {
  search?: string;            // nome ou cpf
  status?: "active" | "inactive" | "onboarding" | "all";
  page?: number;
  pageSize?: number;
}) {
  const { search = "", status = "all", page = 1, pageSize = 20 } = opts ?? {};
  let query = supabase.from("employees").select("*", { count: "exact" });

  if (status !== "all") query = query.eq("status", status);

  if (search.trim()) {
    // busca simples: nome ILIKE ou cpf =
    // (se tiver pg_trgm você pode fazer ILIKE no cpf também)
    query = query.or(`full_name.ilike.%${search}%,cpf.eq.${search}`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await query
    .order("full_name", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return { data: (data ?? []) as Employee[], count: count ?? 0 };
}

export async function upsertEmployee(input: Employee) {
  // status default = active ao admitir
  const payload = {
    status: "active",
    ...input,
  };
  const { data, error } = await supabase
    .from("employees")
    .upsert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as Employee;
}

export async function terminateEmployee(id: string, whenISO: string, reason?: string) {
  const updates = {
    status: "inactive" as const,
    terminated_at: whenISO,
    notes: reason ? reason : null,
  };
  const { data, error } = await supabase
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Employee;
}

export async function getEmployeeById(id: string) {
  const { data, error } = await supabase.from("employees").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Employee;
}

// checar se usuário logado é RH (tabela hr_users)
export async function isCurrentUserHR(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase
    .from("hr_users")
    .select("user_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}
