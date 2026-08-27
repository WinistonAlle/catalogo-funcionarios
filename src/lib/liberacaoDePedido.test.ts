import { describe, expect, it } from "vitest";
import {
  cutoffInstantForToday,
  entraNaLevaDeHoje,
  liberadoEAindaNaoImpresso,
  precisaDeLiberacao,
  type PedidoParaLiberar,
} from "./liberacaoDePedido";

/**
 * A REGRA QUE DECIDE SE O PEDIDO PRECISA DE LIBERAÇÃO.
 *
 * É a mesma pergunta do lado do servidor ("este pedido entra na leva de
 * hoje?"), respondida no navegador porque `automation/` não é importável do
 * bundle. Como são duas cópias da mesma regra, ela precisa de teste dos dois
 * lados: se divergirem, a tela do RH oferece "liberar" para um pedido que já
 * ia sair sozinho — ou, pior, esconde um que não ia.
 */
function pedido(extra: Partial<PedidoParaLiberar> = {}): PedidoParaLiberar {
  return {
    id: "id-1",
    order_number: "GM-20260827-1234",
    erp_external_id: null,
    employee_name: "FULANA DE TAL",
    employee_cpf: "00000000000",
    created_at: "2026-08-27T18:30:00.000Z", // quinta, 15:30 em SP — depois do corte
    total_cents: 3855,
    wallet_used_cents: 3855,
    printed_at: null,
    released_for_today_at: null,
    released_by_cpf: null,
    released_authorized_by: null,
    ...extra,
  };
}

describe("o corte, do lado do navegador", () => {
  it("é 13:40 de São Paulo do dia corrente", () => {
    const corte = cutoffInstantForToday(new Date("2026-08-27T20:00:00Z"));
    expect(corte.toISOString()).toBe("2026-08-27T16:40:00.000Z");
  });
});

describe("entraNaLevaDeHoje", () => {
  const quinta1530 = new Date("2026-08-27T18:30:00Z"); // 15:30 em SP

  it("pedido feito antes do corte entra sozinho", () => {
    expect(entraNaLevaDeHoje(new Date("2026-08-27T15:00:00Z"), quinta1530)).toBe(true);
  });

  it("pedido feito depois do corte NÃO entra", () => {
    expect(entraNaLevaDeHoje(new Date("2026-08-27T18:00:00Z"), quinta1530)).toBe(false);
  });

  it("em fim de semana nada entra — nem o pedido da manhã", () => {
    const sabado10 = new Date("2026-08-29T13:00:00Z"); // sábado, 10:00 em SP
    expect(entraNaLevaDeHoje(new Date("2026-08-29T12:00:00Z"), sabado10)).toBe(false);
  });
});

describe("precisaDeLiberacao", () => {
  const agora = new Date("2026-08-27T18:30:00Z"); // quinta, 15:30 em SP

  it("pedido tardio, pago e sem liberação: precisa", () => {
    expect(precisaDeLiberacao(pedido(), agora)).toBe(true);
  });

  it("pedido já liberado não aparece de novo pra liberar", () => {
    const p = pedido({ released_for_today_at: "2026-08-27T18:35:00.000Z" });
    expect(precisaDeLiberacao(p, agora)).toBe(false);
    // Mas é exatamente ele que o faturamento precisa ver.
    expect(liberadoEAindaNaoImpresso(p)).toBe(true);
  });

  it("pedido já impresso não precisa de liberação nenhuma", () => {
    const p = pedido({ printed_at: "2026-08-27T18:40:00.000Z" });
    expect(precisaDeLiberacao(p, agora)).toBe(false);
    expect(liberadoEAindaNaoImpresso(p)).toBe(false);
  });

  it("pedido da manhã não precisa: ele entra na leva de hoje sozinho", () => {
    expect(precisaDeLiberacao(pedido({ created_at: "2026-08-27T15:00:00Z" }), agora)).toBe(
      false
    );
  });

  it("liberado E impresso some das duas listas — o ciclo fechou", () => {
    const p = pedido({
      released_for_today_at: "2026-08-27T18:35:00.000Z",
      printed_at: "2026-08-27T18:40:00.000Z",
    });
    expect(precisaDeLiberacao(p, agora)).toBe(false);
    expect(liberadoEAindaNaoImpresso(p)).toBe(false);
  });
});
