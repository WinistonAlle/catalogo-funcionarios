/**
 * Horário de corte da câmara fria: 13:40, fuso América/São_Paulo. Mesma regra
 * que a tela do Checkout mostra ao funcionário (`isAfterSeparationCutoff`,
 * src/pages/Checkout.tsx) — duplicada aqui porque automation/ roda em Node
 * (tsx) e não importa de src/ (bundle de navegador). Se o horário mudar,
 * mudar nos dois lugares.
 */
import { isBusinessDayInSaoPaulo } from "../holidays";

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

/**
 * O dia corrente em São Paulo, como "YYYY-MM-DD" — o valor que a tela manda
 * pra canhoteira quando ninguém escolheu data. Vive aqui junto de
 * `cutoffInstantForToday` porque é a mesma conta de fuso, e errar o dia
 * significaria montar a folha de controle com os pedidos do dia errado.
 */
export function diaEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/**
 * O corte do DIA ÚTIL ANTERIOR — o limite de baixo da leva de hoje.
 *
 * A leva de um dia não é "os pedidos de hoje": é **tudo que entrou desde a
 * última folha**. Um pedido feito ontem às 15h (depois do corte de ontem)
 * pertence à leva de HOJE, e é a regra que o funcionário vê na tela do
 * Checkout quando pede depois das 13:40.
 *
 * Existe porque a primeira tentativa de recortar a leva por data, em
 * 02/09/2026, usou o começo do dia de hoje como limite de baixo — e cortou
 * fora exatamente esse pedido tardio de ontem, que é o caso que a regra do
 * corte existe para atender. O recorte certo é de corte a corte.
 *
 * Anda para trás dia a dia até achar um dia útil, então a segunda-feira pega
 * naturalmente o corte da sexta e recolhe o que entrou no fim de semana. O
 * teto de 30 voltas é só para não girar para sempre se `isBusinessDayInSaoPaulo`
 * um dia passar a dizer que nada é dia útil — nesse caso é melhor uma leva
 * larga demais (papel a mais) que um laço infinito no servidor.
 */
export function cutoffAnteriorEmSaoPaulo(agora: Date = new Date()): Date {
  const UM_DIA_MS = 24 * 60 * 60 * 1000;
  let dia = new Date(agora.getTime());
  for (let i = 0; i < 30; i++) {
    dia = new Date(dia.getTime() - UM_DIA_MS);
    if (isBusinessDayInSaoPaulo(dia)) return cutoffInstantForToday(dia);
  }
  return cutoffInstantForToday(new Date(agora.getTime() - 30 * UM_DIA_MS));
}

/**
 * A janela [início, fim) de um dia de São Paulo, em instantes UTC — pra
 * filtrar `created_at` por dia sem depender do fuso do servidor.
 *
 * O fim é o começo do dia seguinte, e a comparação é `< fim` (exclusivo):
 * usar 23:59:59 deixaria de fora o pedido feito no último segundo do dia.
 * Mesma premissa de `cutoffInstantForToday`: São Paulo é UTC-3 fixo desde
 * 2019, então a string ISO já resolve.
 */
export function janelaDoDiaEmSaoPaulo(dia: string): { inicio: Date; fim: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new Error(`Dia inválido para a janela: "${dia}" — esperado YYYY-MM-DD.`);
  }
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  if (Number.isNaN(inicio.getTime())) {
    throw new Error(`Dia inválido para a janela: "${dia}".`);
  }
  const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { inicio, fim };
}
