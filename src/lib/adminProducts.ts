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
