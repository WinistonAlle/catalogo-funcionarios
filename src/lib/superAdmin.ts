/**
 * Superadmin — quem enxerga TODAS as telas, inclusive as do RH.
 *
 * Por que isso existe (26/08/2026): `employees.role` guarda um valor só por
 * pessoa, então ninguém consegue ser `admin` e `rh` ao mesmo tempo. O Winiston
 * precisa das duas visões, e criar um papel novo no banco significaria mexer
 * em RLS de produção — caro demais para o que é, no fundo, uma questão de
 * navegação.
 *
 * ⚠️ ISTO NÃO É UMA BARREIRA DE SEGURANÇA, é de navegação. O backend
 * (`authorizePrivilegedUser`, em `server/adminOperations.ts`) e as policies de
 * RLS tratam `admin` e `rh` como a MESMA coisa — qualquer admin já pode chamar
 * toda operação do RH pela API. A lista abaixo só decide de quem a tela deixa
 * de ficar escondida. Não use ela para proteger nada.
 */

/** CPFs (só dígitos) que enxergam o app inteiro. */
export const SUPERADMIN_CPFS = [
  "03554321109", // Winiston
] as const;

function onlyDigits(raw: string | null | undefined): string {
  return String(raw || "").replace(/\D/g, "");
}

/** O CPF informado é de superadmin? Aceita com ou sem pontuação. */
export function isSuperAdminCpf(cpf: string | null | undefined): boolean {
  const normalized = onlyDigits(cpf);
  if (!normalized) return false;
  return (SUPERADMIN_CPFS as readonly string[]).includes(normalized);
}

/** Mesma pergunta, para quem está logado agora (lê a sessão local). */
export function isSuperAdminSession(): boolean {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return false;
    return isSuperAdminCpf(JSON.parse(raw)?.cpf);
  } catch {
    return false;
  }
}
