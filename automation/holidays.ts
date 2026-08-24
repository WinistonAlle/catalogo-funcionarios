/**
 * Dia útil no fuso de São Paulo, para a lista de separação impressa às 13:40
 * (ver automation/print/portariaList.ts). Sábado e domingo são sempre
 * pulados; feriado nacional é CALCULADO, não cadastrado — datas fixas mais as
 * que derivam da Páscoa pelo algoritmo de Gauss, correto para qualquer ano
 * sem manutenção. Só os feriados locais (municipal de Ituiutaba, ponto
 * facultativo, recesso) exigem atualização manual, em FERIADOS_LOCAIS logo
 * abaixo — uma vez por ano.
 *
 * Um feriado local esquecido não é grave: a rotina de impressão simplesmente
 * não roda naquele dia (ninguém estaria lá para receber o papel), e os
 * pedidos entram na lista do próximo dia útil sozinhos.
 */
const TIMEZONE = "America/Sao_Paulo";

/** "YYYY-MM-DD". Atualizar uma vez por ano — ver CLAUDE.md, "Lista da portaria". */
export const FERIADOS_LOCAIS = new Set<string>([]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Domingo de Páscoa pelo algoritmo de Gauss (anonymous Gregorian algorithm).
 * Correto para qualquer ano do calendário gregoriano. Conferido contra dois
 * anos de fato público: 2025 = 20/04, 2026 = 05/04 (ver holidays.test.ts).
 */
function pascoa(ano: number): { mes: number; dia: number } {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return { mes, dia };
}

function somarDias(ano: number, mes: number, dia: number, deslocamento: number): string {
  // Meio-dia UTC evita o dia mudar por causa de fuso na hora de somar.
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));
  data.setUTCDate(data.getUTCDate() + deslocamento);
  return `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}`;
}

/** Feriados nacionais do ano, como chaves "YYYY-MM-DD". */
export function feriadosNacionais(ano: number): Set<string> {
  const p = pascoa(ano);
  return new Set<string>([
    `${ano}-01-01`, // Confraternização Universal
    somarDias(ano, p.mes, p.dia, -47), // Carnaval (terça)
    somarDias(ano, p.mes, p.dia, -2), // Sexta-feira Santa
    `${ano}-04-21`, // Tiradentes
    `${ano}-05-01`, // Dia do Trabalho
    somarDias(ano, p.mes, p.dia, 60), // Corpus Christi
    `${ano}-09-07`, // Independência
    `${ano}-10-12`, // Nossa Senhora Aparecida
    `${ano}-11-02`, // Finados
    `${ano}-11-15`, // Proclamação da República
    `${ano}-12-25`, // Natal
  ]);
}

function chaveSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const ano = partes.find((p) => p.type === "year")?.value ?? "1970";
  const mes = partes.find((p) => p.type === "month")?.value ?? "01";
  const dia = partes.find((p) => p.type === "day")?.value ?? "01";
  return `${ano}-${mes}-${dia}`;
}

function diaDaSemanaSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, weekday: "short" }).format(data);
}

/**
 * true se `data` cai num dia útil em São Paulo: não é sábado/domingo, não é
 * feriado nacional (calculado) nem local (FERIADOS_LOCAIS).
 */
export function isBusinessDayInSaoPaulo(data: Date = new Date()): boolean {
  const diaSemana = diaDaSemanaSaoPaulo(data);
  if (diaSemana === "Sat" || diaSemana === "Sun") return false;

  const chave = chaveSaoPaulo(data);
  const ano = Number(chave.slice(0, 4));
  if (feriadosNacionais(ano).has(chave)) return false;
  if (FERIADOS_LOCAIS.has(chave)) return false;

  return true;
}

/**
 * Meia-noite (00:00 -03:00) do próximo dia útil ESTRITAMENTE depois do dia
 * de `data`. Usado para atrasar o lançamento no CIGAM de pedidos feitos após
 * o corte de separação (13:40) — decisão do Winiston, 24/08/2026: pedido
 * feito depois do corte só entra no CIGAM no próximo dia útil, mesma lógica
 * de "próximo dia útil" já usada pela lista da portaria (pula fim de semana
 * e feriado nacional/local calculado).
 */
export function nextBusinessDayStart(data: Date = new Date()): Date {
  let [ano, mes, dia] = chaveSaoPaulo(data).split("-").map(Number);
  let chave = somarDias(ano, mes, dia, 1);

  while (!isBusinessDayInSaoPaulo(new Date(`${chave}T12:00:00Z`))) {
    [ano, mes, dia] = chave.split("-").map(Number);
    chave = somarDias(ano, mes, dia, 1);
  }

  return new Date(`${chave}T00:00:00-03:00`);
}
