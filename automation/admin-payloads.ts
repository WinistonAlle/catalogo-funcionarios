/**
 * Listas de colunas que as telas de Admin/RH podem escrever, e o filtro que as
 * aplica.
 *
 * Contexto: até 12/08/2026 essas telas gravavam direto nas tabelas com a chave
 * anon, que está embutida no bundle público. As escritas passaram para rotas
 * autenticadas no webhook; estas listas são o que impede essas rotas de virarem
 * portas genéricas de UPDATE nas tabelas.
 *
 * Cada lista espelha o payload que a tela monta. Se um campo novo aparecer lá,
 * precisa aparecer aqui — senão é silenciosamente descartado.
 */

/** Espelha `mapEditingToDbPayload` em `src/pages/Admin.tsx`. */
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
 * Espelha o tipo `Employee` em `src/lib/employeeService.ts`.
 *
 * ⚠️ `credito_mensal_cents` (SALDO) e `credito_direito_cents` (DIREITO) estão
 * FORA de propósito. O saldo é o que decide quanto o funcionário pode gastar, e
 * nenhuma tela o edita: quem escreve é o RPC de pagamento, o estorno de
 * cancelamento e a recarga mensal. O direito só a planilha escreve. Deixar
 * qualquer um dos dois aqui reabriria, por outra porta, exatamente o buraco que
 * estamos fechando.
 *
 * Como a lista é allowlist (nega por padrão), coluna nova nasce bloqueada — foi
 * o que aconteceu com `credito_direito_cents` em 27/08/2026.
 *
 * Também fica de fora `user_id` (vínculo de autenticação — quem pode escrever
 * isso decide quem é admin) e `cpf_hash` (derivado do cpf).
 */
export const COLUNAS_FUNCIONARIO_PERMITIDAS = new Set([
  "cpf",
  "full_name",
  "email",
  "phone",
  "role",
  "notes",
  "status",
  "department",
  "job_title",
  "hired_at",
  "terminated_at",
]);

/**
 * Espelha o insert e o update em `src/pages/Avisos.tsx`.
 *
 * `id`, `created_at` e `created_by_employee_id` ficam de fora: identidade e
 * autoria não são editáveis pelo formulário — a autoria é gravada na criação e
 * não deve poder ser reescrita depois.
 */
export const COLUNAS_AVISO_PERMITIDAS = new Set([
  "title",
  "body",
  "is_published",
  "image_url",
]);

/**
 * Mantém do corpo apenas as chaves permitidas.
 *
 * Descarta silenciosamente o resto em vez de recusar a requisição: a tela às
 * vezes manda o objeto inteiro que veio de um `select("*")`, então recusar por
 * excesso quebraria o salvamento sem motivo. O que importa é que o campo extra
 * não chegue ao banco.
 */
export function filtrarPayload(
  permitidas: Set<string>,
  corpo: unknown
): Record<string, unknown> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return {};
  const entradas = Object.entries(corpo as Record<string, unknown>).filter(([chave]) =>
    permitidas.has(chave)
  );
  return Object.fromEntries(entradas);
}

export const filtrarPayloadProduto = (corpo: unknown) =>
  filtrarPayload(COLUNAS_PRODUTO_PERMITIDAS, corpo);

export const filtrarPayloadFuncionario = (corpo: unknown) =>
  filtrarPayload(COLUNAS_FUNCIONARIO_PERMITIDAS, corpo);

export const filtrarPayloadAviso = (corpo: unknown) =>
  filtrarPayload(COLUNAS_AVISO_PERMITIDAS, corpo);
