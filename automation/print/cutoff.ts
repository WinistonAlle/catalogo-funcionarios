/**
 * Horário de corte da câmara fria: 13:40, fuso América/São_Paulo. Mesma regra
 * que a tela do Checkout mostra ao funcionário (`isAfterSeparationCutoff`,
 * src/pages/Checkout.tsx) — duplicada aqui porque automation/ roda em Node
 * (tsx) e não importa de src/ (bundle de navegador). Se o horário mudar,
 * mudar nos dois lugares.
 */
const TIMEZONE = "America/Sao_Paulo";
const CUTOFF_HOUR = 13;
const CUTOFF_MINUTE = 40;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isAfterCutoffInSaoPaulo(agora: Date = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return hora * 60 + minuto >= CUTOFF_HOUR * 60 + CUTOFF_MINUTE;
}

/**
 * O instante exato de "hoje às 13:40" em São Paulo, como Date — usado para
 * filtrar quais pedidos entram na lista de hoje (`created_at` antes deste
 * instante) sem precisar de flag de "já rodou hoje": pedido feito depois
 * deste instante simplesmente não é alcançado pelo filtro, e some para a
 * lista do próximo dia útil sozinho.
 *
 * São Paulo não observa horário de verão desde 2019 — UTC-3 é fixo, então dá
 * para montar a string ISO direto, sem lib de fuso horário.
 */
export function cutoffInstantForToday(agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  const dia = partes.find((p) => p.type === "day")?.value;
  return new Date(`${ano}-${mes}-${dia}T${pad(CUTOFF_HOUR)}:${pad(CUTOFF_MINUTE)}:00-03:00`);
}
