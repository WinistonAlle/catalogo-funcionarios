// automation/print/cutoff.test.ts
import { describe, expect, it } from "vitest";
import { cutoffInstantForToday, isAfterCutoffInSaoPaulo } from "./cutoff";

describe("isAfterCutoffInSaoPaulo", () => {
  it("13:39 ainda não passou do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T13:39:00-03:00"))).toBe(false);
  });

  it("13:40 em ponto já conta como passado do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T13:40:00-03:00"))).toBe(true);
  });

  it("qualquer hora depois de 13:40 também conta", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T18:00:00-03:00"))).toBe(true);
  });

  it("usa o fuso de São Paulo: 16:35 UTC é 13:35 em SP, ainda antes do corte", () => {
    expect(isAfterCutoffInSaoPaulo(new Date("2026-08-18T16:35:00Z"))).toBe(false);
  });
});

describe("cutoffInstantForToday", () => {
  it("monta o instante de hoje às 13:40 em São Paulo", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const corte = cutoffInstantForToday(agora);
    expect(corte.toISOString()).toBe("2026-08-18T16:40:00.000Z"); // 13:40 -03:00 = 16:40 UTC
  });

  it("um pedido feito antes do corte fica antes do instante calculado", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const pedidoDasNove = new Date("2026-08-18T09:00:00-03:00");
    expect(pedidoDasNove.getTime()).toBeLessThan(cutoffInstantForToday(agora).getTime());
  });

  it("um pedido feito depois do corte fica depois do instante calculado", () => {
    const agora = new Date("2026-08-18T20:00:00-03:00");
    const pedidoDasQuinze = new Date("2026-08-18T15:00:00-03:00");
    expect(pedidoDasQuinze.getTime()).toBeGreaterThan(cutoffInstantForToday(agora).getTime());
  });
});
