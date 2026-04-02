import { supabase } from "@/lib/supabase";

export type Employee = {
  id?: string;
  cpf: string;
  full_name: string;
  role?: string | null;
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

export type EmployeeBalanceSnapshot = {
  employeeId: string;
  cpf: string;
  monthKey: string;
  monthlyLimitCents: number;
  spentCents: number;
  availableCents: number;
};

export async function getEmployeesBalanceSnapshots(employees: Pick<Employee, "id" | "cpf">[]) {
  const normalized = employees
    .map((employee) => ({
      employeeId: String(employee.id || "").trim(),
      cpf: String(employee.cpf || "").replace(/\D/g, ""),
    }))
    .filter((employee) => employee.employeeId && employee.cpf);

  if (normalized.length === 0) {
    return { monthKey: "", byEmployeeId: {} as Record<string, EmployeeBalanceSnapshot> };
  }

  const { data: cycleData, error: cycleError } = await supabase.rpc("current_pay_cycle_key");
  if (cycleError) throw cycleError;

  const monthKey =
    typeof cycleData === "string"
      ? cycleData
      : (cycleData as any)?.key ?? (cycleData as any)?.month_key ?? (cycleData as any)?.current_pay_cycle_key ?? "";

  if (!monthKey) {
    throw new Error("Não foi possível identificar o ciclo atual do saldo.");
  }

  const cpfs = Array.from(new Set(normalized.map((employee) => employee.cpf)));
  const { data: walletRows, error: walletError } = await supabase
    .from("employee_wallet_view")
    .select("employee_id, cpf, credito_mensal_cents")
    .in("cpf", cpfs);

  if (walletError) throw walletError;

  const walletByEmployeeId = new Map<string, { cpf: string; monthlyLimitCents: number }>();
  for (const row of walletRows ?? []) {
    const employeeId = String((row as any).employee_id || "").trim();
    if (!employeeId) continue;
    walletByEmployeeId.set(employeeId, {
      cpf: String((row as any).cpf || "").replace(/\D/g, ""),
      monthlyLimitCents: Number((row as any).credito_mensal_cents ?? 0) || 0,
    });
  }

  const employeeIds = Array.from(new Set(normalized.map((employee) => employee.employeeId)));
  const { data: spendRows, error: spendError } = await supabase
    .from("employee_monthly_spend")
    .select("employee_id, spent_cents")
    .in("employee_id", employeeIds)
    .eq("month_key", monthKey);

  if (spendError) throw spendError;

  const spentByEmployeeId = new Map<string, number>();
  for (const row of spendRows ?? []) {
    const employeeId = String((row as any).employee_id || "").trim();
    if (!employeeId) continue;
    spentByEmployeeId.set(employeeId, Number((row as any).spent_cents ?? 0) || 0);
  }

  const byEmployeeId: Record<string, EmployeeBalanceSnapshot> = {};
  for (const employee of normalized) {
    const wallet = walletByEmployeeId.get(employee.employeeId);
    const monthlyLimitCents = wallet?.monthlyLimitCents ?? 0;
    const spentCents = spentByEmployeeId.get(employee.employeeId) ?? 0;

    byEmployeeId[employee.employeeId] = {
      employeeId: employee.employeeId,
      cpf: employee.cpf,
      monthKey,
      monthlyLimitCents,
      spentCents,
      availableCents: Math.max(monthlyLimitCents - spentCents, 0),
    };
  }

  return { monthKey, byEmployeeId };
}

export async function upsertEmployee(input: Employee) {
  if (input.id) {
    const { id, ...updates } = input;
    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Employee;
  }

  const payload = {
    status: "active",
    ...input,
  };
  const { data, error } = await supabase
    .from("employees")
    .insert(payload)
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
