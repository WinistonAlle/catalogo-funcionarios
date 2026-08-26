// automation/print/portariaList.test.ts
import { describe, expect, it, vi } from "vitest";
import { gerarPdfPortaria } from "./portariaList";

/**
 * O CORTE DO LADO DA IMPRESSÃO — a metade que não tinha teste.
 *
 * `cutoff.test.ts` cobre os helpers isolados e
 * `process-pending-orders.test.ts` cobre a entrada no CIGAM
 * (`isEligibleForCigamEntry`). O que ninguém cobria era a LIGAÇÃO: se
 * `gerarPdfPortaria` de fato monta a consulta com o corte de HOJE, e se um
 * pedido feito depois do corte fica mesmo de fora da leva de hoje.
 *
 * É esse pedaço que decide se o pedido tardio "aparece pra imprimir só no dia
 * seguinte". Como a regra é uma comparação de instantes, dá pra verificar sem
 * banco: basta capturar o argumento que vai no `.lt("created_at", ...)`.
 */

/** Supabase de mentira: registra a consulta montada e devolve `linhas`. */
function fakeSupabase(linhas: unknown[] = []) {
  const chamadas: Record<string, unknown[]> = {};
  const query: Record<string, unknown> = {};

  for (const metodo of ["select", "is", "lt", "or", "order"]) {
    query[metodo] = (...args: unknown[]) => {
      chamadas[metodo] = [...(chamadas[metodo] ?? []), ...args];
      return query;
    };
  }
  query.limit = (...args: unknown[]) => {
    chamadas.limit = args;
    return Promise.resolve({ data: linhas, error: null });
  };
  query.update = (...args: unknown[]) => {
    chamadas.update = args;
    return { in: () => Promise.resolve({ error: null }) };
  };

  return {
    supabase: { from: () => query } as never,
    chamadas,
  };
}

/** O instante que a consulta usou como corte, como Date. */
function corteUsado(chamadas: Record<string, unknown[]>): Date {
  const args = chamadas.lt ?? [];
  const i = args.indexOf("created_at");
  expect(i).toBeGreaterThanOrEqual(0);
  return new Date(String(args[i + 1]));
}

describe("gerarPdfPortaria: qual leva o pedido cai", () => {
  it("filtra pelo corte das 13:40 de HOJE, não pelo instante da chamada", async () => {
    const { supabase, chamadas } = fakeSupabase([]);

    // Terça, 15:10 — bem depois do corte.
    await gerarPdfPortaria({ supabase, now: new Date("2026-08-25T15:10:00-03:00") });

    expect(corteUsado(chamadas).toISOString()).toBe("2026-08-25T16:40:00.000Z"); // 13:40 -03:00
  });

  it("um pedido feito depois do corte fica FORA da leva de hoje e DENTRO da de amanhã", async () => {
    const pedidoTardio = new Date("2026-08-25T15:00:00-03:00"); // terça, 15h

    // Hoje (terça, 16h): o corte de hoje é 13:40 — o pedido das 15h não alcança.
    const hoje = fakeSupabase([]);
    await gerarPdfPortaria({ supabase: hoje.supabase, now: new Date("2026-08-25T16:00:00-03:00") });
    expect(pedidoTardio.getTime()).toBeGreaterThan(corteUsado(hoje.chamadas).getTime());

    // Amanhã (quarta, 13:45): o corte vira 13:40 de quarta — agora alcança.
    const amanha = fakeSupabase([]);
    await gerarPdfPortaria({ supabase: amanha.supabase, now: new Date("2026-08-26T13:45:00-03:00") });
    expect(pedidoTardio.getTime()).toBeLessThan(corteUsado(amanha.chamadas).getTime());
  });

  it("o botão manual pula a checagem de HORÁRIO, mas não a de QUAIS pedidos entram", async () => {
    // Terça, 09:00 — antes do corte. Sem ignoreCutoffGuard não roda nada.
    const cedo = fakeSupabase([]);
    const semBotao = await gerarPdfPortaria({
      supabase: cedo.supabase,
      now: new Date("2026-08-25T09:00:00-03:00"),
    });
    expect(semBotao.pedidos).toEqual([]);
    expect(cedo.chamadas.lt).toBeUndefined(); // nem consultou

    // Mesma hora, com o botão: consulta — e ainda com o corte de hoje.
    const comBotao = fakeSupabase([]);
    await gerarPdfPortaria({
      supabase: comBotao.supabase,
      now: new Date("2026-08-25T09:00:00-03:00"),
      ignoreCutoffGuard: true,
    });
    expect(corteUsado(comBotao.chamadas).toISOString()).toBe("2026-08-25T16:40:00.000Z");
  });

  it("não imprime em dia não útil — nem com o botão manual", async () => {
    const sabado = fakeSupabase([]);
    const r = await gerarPdfPortaria({
      supabase: sabado.supabase,
      now: new Date("2026-08-22T15:00:00-03:00"), // sábado
      ignoreCutoffGuard: true,
    });

    expect(r.pedidos).toEqual([]);
    expect(sabado.chamadas.lt).toBeUndefined();
  });

  it("só busca pedido ainda não impresso e não cancelado", async () => {
    const { supabase, chamadas } = fakeSupabase([]);
    await gerarPdfPortaria({ supabase, now: new Date("2026-08-25T15:10:00-03:00") });

    expect(chamadas.is).toEqual(["printed_at", null, "cancelled_at", null]);
  });
});
