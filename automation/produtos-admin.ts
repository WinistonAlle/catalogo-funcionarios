/**
 * Colunas de `products` que a tela de admin realmente edita.
 *
 * Espelha `mapEditingToDbPayload` em `src/pages/Admin.tsx` — se um campo novo
 * aparecer lá, precisa aparecer aqui, senão ele é silenciosamente descartado.
 */
export const COLUNAS_PRODUTO_PERMITIDAS = new Set([
  "id",
  "old_id",
  "name",
  "employee_price",
  "unit",
  "category_id",
  "image_path",
  "description",
  "package_info",
  "is_package",
  "featured",
  "is_launch",
  "is_hidden",
]);

/**
 * Filtra o corpo recebido contra a lista acima.
 *
 * Não é desconfiança de quem já passou pela autorização: é impedir que a rota
 * vire uma porta genérica de UPDATE na tabela. Sem isso, um bug no cliente ou um
 * payload malformado poderia escrever `stock_qty`, `stock_synced_at`,
 * `cigam_code` ou `weight` — campos de que o sync do CIGAM é dono, e que mexem
 * em preço cobrado e em baixa de estoque no ERP.
 */
export function filtrarPayloadProduto(corpo: unknown): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const entradas = Object.entries(corpo as Record<string, unknown>).filter(([chave]) =>
    COLUNAS_PRODUTO_PERMITIDAS.has(chave)
  );
  return Object.fromEntries(entradas);
}
