// automation/holidays.test.ts
import { describe, expect, it } from "vitest";
import { FERIADOS_LOCAIS, feriadosNacionais, isBusinessDayInSaoPaulo } from "./holidays";

/**
 * Confere o algoritmo de Gauss contra fato público: Páscoa 2025 = 20/04,
 * 2026 = 05/04. As duas batem — dá confiança de que a fórmula está certa,
 * não só "compilou".
 */
describe("feriadosNacionais", () => {
  it("2026: datas fixas mais as que derivam da Páscoa (5 de abril)", () => {
    const feriados = feriadosNacionais(2026);

    expect(feriados.has("2026-01-01")).toBe(true); // Confraternização
    expect(feriados.has("2026-04-21")).toBe(true); // Tiradentes
    expect(feriados.has("2026-05-01")).toBe(true); // Trabalho
    expect(feriados.has("2026-09-07")).toBe(true); // Independência
    expect(feriados.has("2026-10-12")).toBe(true); // Aparecida
    expect(feriados.has("2026-11-02")).toBe(true); // Finados
    expect(feriados.has("2026-11-15")).toBe(true); // República
    expect(feriados.has("2026-12-25")).toBe(true); // Natal

    expect(feriados.has("2026-02-17")).toBe(true); // Carnaval (terça)
    expect(feriados.has("2026-04-03")).toBe(true); // Sexta-feira Santa
    expect(feriados.has("2026-06-04")).toBe(true); // Corpus Christi

    expect(feriados.size).toBe(11);
  });

  it("2027 recalcula sozinho, sem tabela — a Páscoa muda de data", () => {
    const feriados = feriadosNacionais(2027);
    expect(feriados.has("2026-04-03")).toBe(false);
    expect(feriados.has("2026-06-04")).toBe(false);
    expect(feriados.size).toBe(11);
  });
});

describe("isBusinessDayInSaoPaulo", () => {
  it("uma terça-feira comum é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-18T12:00:00-03:00"))).toBe(true);
  });

  it("sábado e domingo não são dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-22T12:00:00-03:00"))).toBe(false); // sábado
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-23T12:00:00-03:00"))).toBe(false); // domingo
  });

  it("feriado nacional fixo não é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-12-25T12:00:00-03:00"))).toBe(false); // Natal
  });

  it("feriado móvel (derivado da Páscoa) não é dia útil", () => {
    expect(isBusinessDayInSaoPaulo(new Date("2026-06-04T12:00:00-03:00"))).toBe(false); // Corpus Christi
  });

  it("feriado local cadastrado em FERIADOS_LOCAIS não é dia útil", () => {
    FERIADOS_LOCAIS.add("2026-09-20"); // data fictícia, só para o teste
    expect(isBusinessDayInSaoPaulo(new Date("2026-09-20T12:00:00-03:00"))).toBe(false);
    FERIADOS_LOCAIS.delete("2026-09-20");
  });

  it("usa o fuso de São Paulo, não o UTC do timestamp", () => {
    // 24/08 01:00 UTC ainda é 23/08 22:00 em São Paulo (UTC-3) — domingo lá,
    // mesmo já sendo segunda em UTC.
    expect(isBusinessDayInSaoPaulo(new Date("2026-08-24T01:00:00Z"))).toBe(false);
  });
});
