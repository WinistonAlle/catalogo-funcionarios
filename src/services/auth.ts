// src/services/auth.ts
import { supabase } from "@/lib/supabase";

export type EmployeeSession = {
  id: string;
  full_name: string;
  cpf: string;
  role: string;
};

export type LoginResult = EmployeeSession & {
  /** Conta privilegiada que ainda não definiu senha própria: precisa criar antes de seguir. */
  mustChangePassword: boolean;
};

type EmployeeFromRPC = {
  id: string;
  full_name: string;
  cpf: string;
  role: string | null;
};

/**
 * Contas privilegiadas (admin/RH) NÃO entram por CPF.
 *
 * O CPF é público — está legível na própria API e circula em crachá, folha e
 * planilha. Enquanto o papel vinha só do CPF, qualquer um que soubesse o CPF de
 * um admin virava admin: bastava abrir sessão anônima e chamar
 * `link_employee_to_user`, que reapontava `employees.user_id` para o uid de quem
 * chamasse. Por isso admin/RH tem usuário de verdade no Supabase Auth, com
 * senha, e o vínculo `user_id` deles é fixo — nunca passa pela RPC.
 */
export function isPrivilegedRole(role: string | null | undefined): boolean {
  const normalized = String(role || "").toLowerCase();
  return normalized === "admin" || normalized === "rh";
}

/** E-mail interno derivado do CPF. Não recebe mensagem, é só o identificador do Auth. */
export function privilegedEmailForCpf(cpf: string): string {
  return `${normalizeCpf(cpf)}@interno.gostinhomineiro.com`;
}

/** Sinaliza para a tela que este CPF exige senha, sem dizer mais nada. */
export class PasswordRequiredError extends Error {
  constructor() {
    super("Esta conta exige senha.");
    this.name = "PasswordRequiredError";
  }
}

/** Admin/RH que ainda não tem senha: a tela deve pedir para criar uma. */
export class FirstAccessRequiredError extends Error {
  constructor() {
    super("Primeiro acesso: crie sua senha.");
    this.name = "FirstAccessRequiredError";
  }
}

export const MIN_PASSWORD_LENGTH = 8;

function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Primeiro acesso de admin/RH — não existe mais senha padrão (17/08/2026).
 *
 * Quem decide se o acesso está pendente é o webhook, porque a flag mora no
 * metadata do Auth e o navegador não tem como ler isso sem estar logado. O
 * fluxo inteiro (criar senha sem apresentar nada além do CPF) é aberto por
 * decisão do Winiston — o risco está documentado na rota, em
 * `automation/operations-webhook.ts`.
 */
export async function isFirstAccessPending(rawCpf: string): Promise<boolean> {
  const cpf = normalizeCpf(rawCpf);

  try {
    const response = await fetch(`/automation/primeiro-acesso?cpf=${encodeURIComponent(cpf)}`);
    if (!response.ok) return false;
    const body = await response.json();
    return body?.pendente === true;
  } catch {
    // Webhook fora do ar: cai no fluxo de senha, que é o caminho conservador —
    // pior mostrar "senha incorreta" do que abrir criação de senha por engano.
    return false;
  }
}

/** Cria a senha do primeiro acesso e já devolve a sessão logada. */
export async function createFirstPassword(
  rawCpf: string,
  newPassword: string
): Promise<LoginResult> {
  const cpf = normalizeCpf(rawCpf);

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const response = await fetch("/automation/primeiro-acesso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, senha: newPassword }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body?.error || "Não foi possível criar a senha.");
  }

  // A senha acabou de existir: entra por ela, pelo caminho normal.
  return checkCpfLogin(cpf, newPassword);
}

export async function checkCpfLogin(
  rawCpf: string,
  password?: string
): Promise<LoginResult> {
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
  const privileged = isPrivilegedRole(employee.role);
  let mustChangePassword = false;

  if (privileged) {
    /* -----------------------------------------------
       2a) Admin/RH: senha obrigatória, sessão de verdade.
       O `user_id` já está fixo no banco, então NÃO chamamos
       `link_employee_to_user` — é justamente a chamada que
       deixava a conta ser sequestrada por quem soubesse o CPF.
    ----------------------------------------------- */
    if (!password) {
      // Conta que nunca acessou não tem senha para pedir: manda a tela abrir a
      // criação de senha em vez do campo "Senha".
      if (await isFirstAccessPending(cpf)) {
        throw new FirstAccessRequiredError();
      }
      throw new PasswordRequiredError();
    }

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: privilegedEmailForCpf(cpf),
        password,
      });

    if (signInError) {
      throw new Error("Senha incorreta.");
    }

    // Rede de segurança: se alguma conta ficar com a flag ligada e senha
    // conhecida, ela ainda cai na tela de criar senha em vez de entrar.
    mustChangePassword = signInData.user?.user_metadata?.must_change_password === true;
  } else {
    /* -----------------------------------------------
       2b) Funcionário comum: segue por CPF, sessão anônima
    ----------------------------------------------- */
    const { error: authError } = await supabase.auth.signInAnonymously();

    if (authError) {
      console.error("Erro no signInAnonymously:", authError);
      throw new Error(authError.message || "Não foi possível iniciar sessão no sistema.");
    }

    /* -----------------------------------------------
       3) vincula employees.user_id ao auth.uid()
       RPC: public.link_employee_to_user(p_cpf text)
    ----------------------------------------------- */
    const { error: linkError } = await supabase.rpc("link_employee_to_user", { p_cpf: cpf });

    if (linkError) {
      console.error("Erro ao vincular usuário:", linkError);
      throw new Error(linkError.message || "Erro ao vincular usuário.");
    }
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

  // Só grava a sessão local depois que a troca de senha estiver resolvida —
  // senão dava para fechar a tela de troca e seguir usando o app.
  if (!mustChangePassword) {
    localStorage.setItem("employee_session", JSON.stringify(session));
  }

  return { ...session, mustChangePassword };
}

/**
 * Troca a senha do usuário logado. Roda com a sessão que o login acabou de
 * abrir, então não precisa da senha antiga.
 */
export async function changeOwnPassword(
  newPassword: string,
  session: EmployeeSession
): Promise<void> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    data: { must_change_password: false },
  });

  if (error) {
    throw new Error(error.message || "Não foi possível trocar a senha.");
  }

  // Agora sim a sessão do app vale.
  localStorage.setItem("employee_session", JSON.stringify(session));
}

export async function logoutEmployee() {
  localStorage.removeItem("employee_session");
  await supabase.auth.signOut();
}
