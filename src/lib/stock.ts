import { Product } from "@/types/products";

/**
 * Regra de "sem estoque":
 *  - flag manual `inStock === false`, OU
 *  - saldo do CIGAM (`stock_qty`) é um número <= 0.
 * Se `stock_qty` é null/undefined (desconhecido) e o flag manual não bloqueia,
 * o produto é considerado DISPONÍVEL (fail-open).
 */
export function isOutOfStock(
  product: Pick<Product, "inStock" | "stock_qty">
): boolean {
  if (product.inStock === false) return true;
  const q = product.stock_qty;
  return typeof q === "number" && q <= 0;
}

/**
 * Aplica um saldo recém-consultado ao produto e diz se ficou sem estoque.
 * Usa a mesma regra do sync (null = desconhecido = disponível).
 */
export function applyLiveSaldo(product: Product, saldo: number | undefined): Product {
  return { ...product, stock_qty: saldo === undefined ? product.stock_qty ?? null : saldo };
}

/**
 * Consulta o saldo ao vivo no backend (webhook via nginx /automation/).
 * Fail-open: qualquer erro retorna um Map vazio, e o chamador mantém o último
 * saldo conhecido (não bloqueia o funcionário por falha técnica).
 * Retorna um Map código-do-material → saldo.
 */
export async function checkStockLive(cigamCodes: (string | null | undefined)[]): Promise<Map<string, number>> {
  const codes = [...new Set(cigamCodes.map((c) => (c ?? "").trim()).filter(Boolean))];
  if (codes.length === 0) return new Map();
  try {
    const res = await fetch(`/automation/estoque?materiais=${encodeURIComponent(codes.join(","))}`);
    if (!res.ok) return new Map();
    const data = await res.json();
    const saldos = (data?.saldos ?? {}) as Record<string, number>;
    return new Map(Object.entries(saldos).map(([k, v]) => [k, Number(v)]));
  } catch {
    return new Map();
  }
}
