import { supabase } from "@/lib/supabase";
import { atualizarFuncionario, inserirFuncionario } from "@/lib/adminWrites";
import {
  deriveWallet,
  WALLET_VIEW_COLUMNS,
  type WalletRow,
  type WalletSnapshot,
} from "@/lib/wallet";

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

  // Saldo e direito saem da mesma linha da VIEW segura — uma consulta em vez
  // de duas, e sem `employee_monthly_spend` no meio (tabela que nenhuma função
  // viva alimentava; ver src/lib/wallet.ts).
  const cpfs = Array.from(new Set(normalized.map((employee) => employee.cpf)));
  const { data: walletRows, error: walletError } = await supabase
    .from("employee_wallet_view")
    .select(WALLET_VIEW_COLUMNS)
    .in("cpf", cpfs);

  if (walletError) throw walletError;

  const walletByEmployeeId = new Map<string, WalletSnapshot>();
  for (const row of walletRows ?? []) {
    const employeeId = String((row as any).employee_id || "").trim();
    if (!employeeId) continue;
    walletByEmployeeId.set(employeeId, deriveWallet(row as WalletRow));
  }

  const byEmployeeId: Record<string, EmployeeBalanceSnapshot> = {};
  for (const employee of normalized) {
    const wallet = walletByEmployeeId.get(employee.employeeId) ?? deriveWallet(null);

    byEmployeeId[employee.employeeId] = {
      employeeId: employee.employeeId,
      cpf: employee.cpf,
      monthKey,
      monthlyLimitCents: wallet.monthlyLimitCents,
      spentCents: wallet.spentCents,
      availableCents: wallet.availableCents,
    };
  }

  return { monthKey, byEmployeeId };
}

/**
 * Escrita via webhook autenticado, não direto na tabela.
 *
 * A chave anon está embutida no bundle público, então gravar `employees` daqui
 * deixava o cadastro (e o saldo) aberto para qualquer um. O servidor autoriza
 * por `authorizePrivilegedUser` e descarta colunas fora da lista — inclusive
 * `credito_mensal_cents`. Ver `src/lib/adminWrites.ts`.
 */
export async function upsertEmployee(input: Employee) {
  if (input.id) {
    const { id, ...updates } = input;
    return (await atualizarFuncionario<Employee>(String(id), updates)) as Employee;
  }

  const payload = {
    status: "active",
    ...input,
  };
  return (await inserirFuncionario<Employee>(payload)) as Employee;
}

export async function terminateEmployee(id: string, whenISO: string, reason?: string) {
  const updates = {
    status: "inactive" as const,
    terminated_at: whenISO,
    notes: reason ? reason : null,
  };
  return (await atualizarFuncionario<Employee>(id, updates)) as Employee;
}

export async function getEmployeeById(id: string) {
  const { data, error } = await supabase.from("employees").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Employee;
}

// `isCurrentUserHR()` foi removida em 27/08/2026 junto com a tabela `hr_users`.
// A tabela estava VAZIA desde que existe, então a função devolvia `false` para
// todo mundo — inclusive para o RH de verdade. Quem manda em permissão é
// `employees.role` (via `is_privileged_user()` no banco e `RequireRole` no
// app); esta era uma segunda fonte de verdade que nunca teve verdade nenhuma.
