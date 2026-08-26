// automation/print/portariaList.test.ts
import { describe, expect, it, vi } from "vitest";
import { gerarPdfPortaria, marcarPortariaImpressa } from "./portariaList";

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


/**
 * OS DOIS PASSOS — o bug de 26/08/2026.
 *
 * Gerar o PDF marcava a leva inteira como impressa antes de qualquer papel
 * sair. Quem fechasse a aba sem dar Ctrl+P perdia os pedidos: eles somiam da
 * lista pra sempre e o botão respondia "nenhum pedido pendente pra imprimir"
 * com os pedidos ali na tela. Aconteceu em produção — três pedidos carimbados
 * de uma vez, seguidos de cinco cliques devolvendo zero.
 *
 * A garantia que estes testes seguram: gerar NÃO marca, e marcar só acontece
 * por confirmação explícita.
 */
function pedidoDeMentira(id: string, numero: string) {
  return {
    id,
    order_number: numero,
    employee_name: "FULANO DE TAL",
    erp_external_id: "015550",
    order_items: [
      {
        product_name: "Pão de Queijo Premium 1kg",
        quantity: 2,
        unit_price: 14.85,
        products: { cigam_code: "002001000001", cigam_unit: "KG", weight: 1 },
      },
    ],
  };
}

/** Supabase de mentira para o UPDATE de confirmação: `.in().is().select()`. */
function fakeSupabaseUpdate(linhasAfetadas: { id: string }[]) {
  const chamadas: Record<string, unknown[]> = {};
  const query: Record<string, unknown> = {};

  query.update = (...args: unknown[]) => {
    chamadas.update = args;
    return query;
  };
  query.in = (...args: unknown[]) => {
    chamadas.in = args;
    return query;
  };
  query.is = (...args: unknown[]) => {
    chamadas.is = args;
    return query;
  };
  query.select = (...args: unknown[]) => {
    chamadas.select = args;
    return Promise.resolve({ data: linhasAfetadas, error: null });
  };

  return { supabase: { from: () => query } as never, chamadas };
}

describe("gerarPdfPortaria NÃO marca printed_at", () => {
  it("gera o PDF da leva sem carimbar nada — quem carimba é a confirmação", async () => {
    const { supabase, chamadas } = fakeSupabase([
      pedidoDeMentira("id-1", "GM-20260825-3235"),
      pedidoDeMentira("id-2", "GM-20260826-5795"),
    ]);

    const r = await gerarPdfPortaria({
      supabase,
      now: new Date("2026-08-26T15:10:00-03:00"),
    });

    expect(r.pedidos.map((p) => p.orderNumber)).toEqual([
      "GM-20260825-3235",
      "GM-20260826-5795",
    ]);
    expect(r.pdf.length).toBeGreaterThan(0);
    // O ponto do teste: nenhum UPDATE saiu na geração.
    expect(chamadas.update).toBeUndefined();
  });
});

describe("marcarPortariaImpressa: o segundo passo", () => {
  it("marca só os pedidos que ainda não tinham printed_at", async () => {
    // O banco devolve 1 linha: o outro id já estava impresso e o `.is` filtrou.
    const { supabase, chamadas } = fakeSupabaseUpdate([{ id: "id-1" }]);

    const r = await marcarPortariaImpressa(supabase, ["id-1", "id-2"]);

    expect(r.marcados).toEqual(["id-1"]);
    expect(chamadas.in).toEqual(["id", ["id-1", "id-2"]]);
    // A trava contra reescrever o timestamp de quem já saiu.
    expect(chamadas.is).toEqual(["printed_at", null]);
  });

  it("ignora id repetido e vazio, e não vai ao banco com lista vazia", async () => {
    const repetido = fakeSupabaseUpdate([{ id: "id-1" }]);
    await marcarPortariaImpressa(repetido.supabase, ["id-1", "id-1", "  "]);
    expect(repetido.chamadas.in).toEqual(["id", ["id-1"]]);

    const vazio = fakeSupabaseUpdate([]);
    const r = await marcarPortariaImpressa(vazio.supabase, []);
    expect(r.marcados).toEqual([]);
    expect(vazio.chamadas.update).toBeUndefined();
  });
});
