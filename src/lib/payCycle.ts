const TIMEZONE = "America/Sao_Paulo";
/** O ciclo vira no dia 27 — entao ele fecha no dia 26 do mes seguinte. */
export const CYCLE_START_DAY = 27;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function getSaoPauloPayCycleKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  let year = Number(parts.find((part) => part.type === "year")?.value ?? 0);
  let month = Number(parts.find((part) => part.type === "month")?.value ?? 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 1);

  if (day < CYCLE_START_DAY) {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${pad(month)}`;
}
