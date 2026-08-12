import { requestWithAuth } from "@/lib/adminOperations";

/**
 * Escrita de produto pelo Admin — via webhook autenticado, não direto na tabela.
 *
 * Até 12/08/2026 a tela gravava `products` com a chave anon, que está embutida
 * no bundle público: qualquer pessoa podia alterar `employee_price` e mudar o
 * que o funcionário paga. Agora a escrita passa por `authorizePrivilegedUser` no
 * servidor, que usa a service role.
 *
 * O payload continua sendo montado na tela (`mapEditingToDbPayload`) — só o
 * transporte mudou. O servidor filtra as colunas contra uma lista fixa.
 */

/**
 * Devolve o mesmo formato `{ error }` do supabase-js de propósito: a tela já
 * tem tratamento em cima disso (inclusive o fallback de `is_hidden` para bancos
 * sem a coluna), e trocar o transporte não deveria obrigar a reescrever aquilo.
 */
export type ResultadoEscrita = {
  error: { message: string; code?: string } | null;
};

function comoResultado(promessa: Promise<unknown>): Promise<ResultadoEscrita> {
  return promessa.then(
    () => ({ error: null }),
    (err: any) => ({ error: { message: String(err?.message ?? err), code: err?.code } })
  );
}

export function inserirProduto(payload: Record<string, any>): Promise<ResultadoEscrita> {
  return comoResultado(
    requestWithAuth(["/automation/admin/products", "/api/admin-products"], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    })
  );
}

export function atualizarProduto(
  id: string,
  payload: Record<string, any>
): Promise<ResultadoEscrita> {
  return comoResultado(
    requestWithAuth(
      [
        `/automation/admin/products/${encodeURIComponent(id)}`,
        `/api/admin-products/${encodeURIComponent(id)}`,
      ],
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      }
    )
  );
}

export function excluirProduto(id: string): Promise<ResultadoEscrita> {
  return comoResultado(
    requestWithAuth(
      [
        `/automation/admin/products/${encodeURIComponent(id)}`,
        `/api/admin-products/${encodeURIComponent(id)}`,
      ],
      { method: "DELETE" }
    )
  );
}

/**
 * Escrita de funcionário pelo RH — mesma razão dos produtos.
 *
 * O servidor descarta `credito_mensal_cents` do payload, então mexer em saldo
 * por aqui não funciona nem por acidente. Quem restaura saldo é a ação própria
 * de "Restauração de saldo" (`resetAllEmployeeBalances`).
 */
export async function inserirFuncionario<T = any>(payload: Record<string, any>): Promise<T> {
  const resposta = await requestWithAuth<{ employee: T }>(
    ["/automation/admin/employees", "/api/admin-employees"],
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    }
  );
  return resposta.employee;
}

export async function atualizarFuncionario<T = any>(
  id: string,
  payload: Record<string, any>
): Promise<T> {
  const resposta = await requestWithAuth<{ employee: T }>(
    [
      `/automation/admin/employees/${encodeURIComponent(id)}`,
      `/api/admin-employees/${encodeURIComponent(id)}`,
    ],
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    }
  );
  return resposta.employee;
}

/** Criação de aviso pelo Admin — via webhook autenticado. */
export async function criarAviso<T = any>(payload: Record<string, any>): Promise<T> {
  const resposta = await requestWithAuth<{ notice: T }>(
    ["/automation/admin/notices", "/api/admin-notices"],
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    }
  );
  return resposta.notice;
}

export async function atualizarAviso<T = any>(
  id: string,
  payload: Record<string, any>
): Promise<T> {
  const resposta = await requestWithAuth<{ notice: T }>(
    [
      `/automation/admin/notices/${encodeURIComponent(id)}`,
      `/api/admin-notices/${encodeURIComponent(id)}`,
    ],
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    }
  );
  return resposta.notice;
}

export function excluirAviso(id: string): Promise<void> {
  return requestWithAuth<void>(
    [
      `/automation/admin/notices/${encodeURIComponent(id)}`,
      `/api/admin-notices/${encodeURIComponent(id)}`,
    ],
    { method: "DELETE" }
  ).then(() => undefined);
}
