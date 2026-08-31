// automation/print/portariaList.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  gerarPdfCanhoteira,
  gerarPdfPedidoUnico,
  gerarPdfPortaria,
  listarPedidosDaCanhoteira,
  marcarPortariaImpressa,
} from "./portariaList";

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

  for (const metodo of ["select", "is", "lt", "gte", "neq", "or", "not", "in", "order"]) {
    query[metodo] = (...args: unknown[]) => {
      chamadas[metodo] = [...(chamadas[metodo] ?? []), ...args];
      return query;
    };
  }
  query.limit = (...args: unknown[]) => {
    chamadas.limit = args;
    return Promise.resolve({ data: linhas, error: null });
  };
  // Thenable: a consulta da canhoteira termina em `.order()` e é aguardada
  // direto, sem `.limit()` no fim como a da leva. Sem isto o `await` devolvia
  // o próprio objeto de mentira e o erro saía como "in is not a function",
  // que não diz nada sobre o que o teste queria checar.
  query.then = (resolve: (valor: { data: unknown[]; error: null }) => unknown) =>
    resolve({ data: linhas, error: null });
  query.update = (...args: unknown[]) => {
    chamadas.update = args;
    return { in: () => Promise.resolve({ error: null }) };
  };

  return {
    supabase: { from: () => query } as never,
    chamadas,
  };
}

/**
 * O instante que a consulta usou como corte, como Date — ou null quando a
 * consulta não olhou o corte (caso dos liberados pelo RH, que entram sem ele).
 *
 * Desde 27/08/2026 o corte não vai mais num `.lt()` solto: ele é um dos lados
 * do `.or(created_at.lt.<corte>,released_for_today_at.not.is.null)`.
 */
function corteUsadoOuNull(chamadas: Record<string, unknown[]>): Date | null {
  for (const arg of chamadas.or ?? []) {
    const texto = String(arg);
    const m = texto.match(/created_at\.lt\.([^,]+)/);
    if (m) return new Date(m[1]);
  }
  return null;
}

/** Idem, exigindo que o corte esteja lá. */
function corteUsado(chamadas: Record<string, unknown[]>): Date {
  const corte = corteUsadoOuNull(chamadas);
  expect(corte).not.toBeNull();
  return corte as Date;
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
    expect(corteUsadoOuNull(cedo.chamadas)).toBeNull(); // não montou a leva do dia

    // Mesma hora, com o botão: consulta — e ainda com o corte de hoje.
    const comBotao = fakeSupabase([]);
    await gerarPdfPortaria({
      supabase: comBotao.supabase,
      now: new Date("2026-08-25T09:00:00-03:00"),
      ignoreCutoffGuard: true,
    });
    expect(corteUsado(comBotao.chamadas).toISOString()).toBe("2026-08-25T16:40:00.000Z");
  });

  it("em dia não útil a leva normal não roda — a consulta só procura liberado", async () => {
    const sabado = fakeSupabase([]);
    const r = await gerarPdfPortaria({
      supabase: sabado.supabase,
      now: new Date("2026-08-22T15:00:00-03:00"), // sábado
      ignoreCutoffGuard: true,
    });

    expect(r.pedidos).toEqual([]);
    // Nenhum pedido do sábado entra por hora de criação...
    expect(corteUsadoOuNull(sabado.chamadas)).toBeNull();
    // ...mas o que o RH liberou entra, senão a faixa da tela apontaria pra um
    // botão que responde "nenhum pedido pendente".
    expect(sabado.chamadas.not).toEqual(["released_for_today_at", "is", null]);
  });

  /**
   * LIBERADO PELO RH (27/08/2026) — o pedido tardio que alguém autorizou a
   * sair no mesmo dia. Ele não passa pelo corte: entra pelo outro lado do
   * `.or`, e entra inclusive quando a leva normal nem roda (antes das 13:40,
   * ou em dia não útil). Se dependesse do corte, a tela mostraria "1 pedido
   * liberado" e o botão responderia "nenhum pedido pendente" — a lista
   * teimosamente vazia que já custou caro aqui.
   */
  it("a leva do dia aceita quem passou do corte OU quem foi liberado", async () => {
    const { supabase, chamadas } = fakeSupabase([]);
    await gerarPdfPortaria({ supabase, now: new Date("2026-08-25T15:10:00-03:00") });

    const clausula = (chamadas.or ?? []).map(String).find((t) => t.includes("created_at.lt."));
    expect(clausula).toContain("released_for_today_at.not.is.null");
  });

  it("pedido liberado sai antes do corte, sem esperar as 13:40", async () => {
    const cedo = fakeSupabase([pedidoDeMentira("id-liberado", "GM-20260825-7777")]);

    const r = await gerarPdfPortaria({
      supabase: cedo.supabase,
      now: new Date("2026-08-25T09:00:00-03:00"), // terça, antes do corte
    });

    expect(r.pedidos.map((p) => p.orderNumber)).toEqual(["GM-20260825-7777"]);
    expect(cedo.chamadas.not).toEqual(["released_for_today_at", "is", null]);
    expect(r.pdf.length).toBeGreaterThan(0);
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
    chamadas.is = [...(chamadas.is ?? []), ...args];
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
    // A trava contra reescrever o timestamp de quem já saiu, e a que impede
    // um pedido cancelado no meio do caminho de voltar como "entregue".
    expect(chamadas.is).toEqual(["printed_at", null, "cancelled_at", null]);
  });

  /**
   * IMPRIMIR É ENTRAR EM SEPARAÇÃO (27/08/2026) — o status é a única coisa que
   * o faturamento vê na tela, então é ele que precisa mudar quando a folha
   * sai. Sem isto o pedido ficava "aguardando separação" depois de impresso e
   * nada na tela impedia imprimir a mesma folha de novo. Não é "entregue":
   * entregue é a assinatura do funcionário na portaria, passo de humano.
   */
  it("carimba printed_at E marca o pedido como em_separacao, no mesmo update", async () => {
    const { supabase, chamadas } = fakeSupabaseUpdate([{ id: "id-1" }]);

    await marcarPortariaImpressa(supabase, ["id-1"]);

    const payload = (chamadas.update ?? [])[0] as {
      printed_at: string;
      status: string;
    };
    expect(payload.status).toBe("em_separacao");
    expect(Number.isNaN(Date.parse(payload.printed_at))).toBe(false);
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


/**
 * A IMPRESSÃO AVULSA — o botão "Imprimir" de uma linha só, em AdminOrders.
 *
 * Passa por fora do corte e do dia útil de propósito (é escolha explícita de
 * um admin), mas segue a mesma regra do resto desde 27/08: quando carimba,
 * carimba as duas coisas — `printed_at` e `em_separacao`. E não recarimba pedido
 * que já saiu, pra reimpressão de folha atolada não apagar o horário original.
 */
function fakeSupabasePedidoUnico(pedido: Record<string, unknown>) {
  const chamadas: Record<string, unknown[]> = {};
  const query: Record<string, unknown> = {};

  query.select = () => query;
  query.eq = (...args: unknown[]) => {
    chamadas.eq = args;
    return query;
  };
  query.maybeSingle = () => Promise.resolve({ data: pedido, error: null });
  query.update = (...args: unknown[]) => {
    chamadas.update = args;
    return { eq: () => Promise.resolve({ error: null }) };
  };

  return { supabase: { from: () => query } as never, chamadas };
}

function pedidoAvulso(extra: Record<string, unknown> = {}) {
  return {
    ...pedidoDeMentira("id-avulso", "GM-20260827-6656"),
    cancelled_at: null,
    printed_at: null,
    wallet_debited: true,
    wallet_used_cents: 3855,
    pay_on_pickup_cents: 0,
    ...extra,
  };
}

describe("gerarPdfPedidoUnico: imprimir é entrar em separação", () => {
  it("marca printed_at e em_separacao quando o pedido ainda não tinha saído", async () => {
    const { supabase, chamadas } = fakeSupabasePedidoUnico(pedidoAvulso());

    const r = await gerarPdfPedidoUnico({ supabase, orderId: "id-avulso" });

    expect(r.jaImpresso).toBe(false);
    expect(r.pdf.length).toBeGreaterThan(0);

    const payload = (chamadas.update ?? [])[0] as {
      printed_at: string;
      status: string;
    };
    expect(payload.status).toBe("em_separacao");
    expect(Number.isNaN(Date.parse(payload.printed_at))).toBe(false);
  });

  it("reimpressão não recarimba: pedido já impresso sai em papel sem UPDATE nenhum", async () => {
    const { supabase, chamadas } = fakeSupabasePedidoUnico(
      pedidoAvulso({ printed_at: "2026-08-26T17:04:40.000Z" })
    );

    const r = await gerarPdfPedidoUnico({ supabase, orderId: "id-avulso" });

    expect(r.jaImpresso).toBe(true);
    expect(r.pdf.length).toBeGreaterThan(0);
    expect(chamadas.update).toBeUndefined();
  });

  it("pedido cancelado não entra em separação por um clique em Imprimir", async () => {
    const { supabase, chamadas } = fakeSupabasePedidoUnico(
      pedidoAvulso({ cancelled_at: "2026-08-27T12:00:00.000Z" })
    );

    await expect(gerarPdfPedidoUnico({ supabase, orderId: "id-avulso" })).rejects.toThrow(
      /cancelado/i
    );
    expect(chamadas.update).toBeUndefined();
  });

  it("pedido sem pagamento não entra em separação por um clique em Imprimir", async () => {
    const { supabase, chamadas } = fakeSupabasePedidoUnico(
      pedidoAvulso({ wallet_debited: false, wallet_used_cents: 0, pay_on_pickup_cents: 0 })
    );

    await expect(gerarPdfPedidoUnico({ supabase, orderId: "id-avulso" })).rejects.toThrow(
      /não consta como pago/i
    );
    expect(chamadas.update).toBeUndefined();
  });
});

/**
 * PEDIDO ENTREGUE NUNCA MAIS VOLTA PRA LEVA (31/08/2026).
 *
 * O bug que isto tranca: `printed_at` nulo não significa só "a folha não
 * saiu" — ele também fica nulo quando a folha SAIU e ninguém confirmou na
 * tela. Como a consulta não tem limite inferior de data, esses pedidos
 * voltavam em toda impressão, para sempre. Em 31/08 eram 6 pedidos já
 * entregues de 25 a 27/08 saindo junto com o único pendente de verdade.
 */
describe("a leva não repesca pedido já entregue", () => {
  it("a consulta exclui status entregue", async () => {
    const { supabase, chamadas } = fakeSupabase([]);

    await gerarPdfPortaria({ supabase, now: new Date("2026-08-25T15:10:00-03:00") });

    expect(chamadas.neq).toEqual(["status", "entregue"]);
  });

  it("exclui entregue também quando a leva normal não roda (só os liberados pelo RH)", async () => {
    // Sábado: `incluirLevaNormal` é falso, a consulta traz só os liberados —
    // e o filtro de entregue tem que continuar de pé nesse caminho também.
    const { supabase, chamadas } = fakeSupabase([]);

    await gerarPdfPortaria({ supabase, now: new Date("2026-08-29T15:10:00-03:00") });

    expect(corteUsadoOuNull(chamadas)).toBeNull();
    expect(chamadas.neq).toEqual(["status", "entregue"]);
  });
});

/**
 * A CANHOTEIRA AVULSA — a folha de controle de retirada tirada sozinha, pelos
 * pedidos que alguém marcou no modal.
 *
 * O conteúdo do papel é verificado em `pdfBuilder.test.ts` (`linhasDoControle`),
 * porque o texto não existe legível dentro do PDF gerado. O que se verifica
 * aqui é a SELEÇÃO: qual dia, quais pedidos, e — o mais importante — que
 * nada é escrito no banco.
 */
describe("canhoteira avulsa", () => {
  it("lista o dia pedido em São Paulo, sem entregue e sem cancelado", async () => {
    const { supabase, chamadas } = fakeSupabase([]);

    await listarPedidosDaCanhoteira({ supabase, dia: "2026-08-28" });

    expect(chamadas.gte).toEqual(["created_at", "2026-08-28T03:00:00.000Z"]);
    expect(chamadas.lt).toEqual(["created_at", "2026-08-29T03:00:00.000Z"]);
    expect(chamadas.neq).toEqual(["status", "entregue"]);
    expect(chamadas.is).toEqual(["cancelled_at", null]);
  });

  it("mantém o pedido cuja folha JÁ saiu — em separação é quem vai retirar", async () => {
    const { supabase } = fakeSupabase([
      {
        id: "a",
        order_number: "GM-1",
        erp_external_id: "015393",
        employee_name: "FULANO",
        status: "em_separacao",
        printed_at: "2026-08-28T18:00:00Z",
        released_for_today_at: null,
        created_at: "2026-08-28T12:00:00Z",
        wallet_debited: true,
        order_items: [{ product_name: "PAO", quantity: 2, unit_price: 10, products: null }],
      },
    ]);

    const { pedidos } = await listarPedidosDaCanhoteira({ supabase, dia: "2026-08-28" });

    expect(pedidos).toHaveLength(1);
    // O número que sai no papel é o do CIGAM, não o interno — tem que bater
    // com a folha grampeada no maço de mercadoria.
    expect(pedidos[0].pedido).toBe("015393");
    expect(pedidos[0].totalCents).toBe(2000);
  });

  it("deixa de fora o pedido que não consta como pago", async () => {
    const { supabase } = fakeSupabase([
      {
        id: "a",
        order_number: "GM-1",
        employee_name: "FULANO",
        status: "pedido_feito",
        created_at: "2026-08-28T12:00:00Z",
        wallet_debited: false,
        wallet_used_cents: 0,
        pay_on_pickup_cents: 0,
        order_items: [],
      },
    ]);

    const { pedidos } = await listarPedidosDaCanhoteira({ supabase, dia: "2026-08-28" });

    expect(pedidos).toEqual([]);
  });

  it("gerar a canhoteira NÃO escreve no banco", async () => {
    const { supabase, chamadas } = fakeSupabase([
      {
        id: "a",
        order_number: "GM-1",
        erp_external_id: "015393",
        employee_name: "FULANO",
        cancelled_at: null,
        created_at: "2026-08-28T12:00:00Z",
        wallet_debited: true,
        order_items: [{ product_name: "PAO", quantity: 1, unit_price: 10, products: null }],
      },
    ]);

    const { pdf, pedidos } = await gerarPdfCanhoteira({
      supabase,
      orderIds: ["a"],
      dia: "2026-08-28",
    });

    expect(pdf.length).toBeGreaterThan(0);
    expect(pedidos).toEqual([{ orderId: "a", orderNumber: "GM-1" }]);
    // O carimbo é só da leva de separação, com confirmação. Um segundo
    // caminho mexendo em printed_at seria um segundo jeito de perder pedido.
    expect(chamadas.update).toBeUndefined();
  });

  it("recusa lista vazia em vez de gerar folha em branco", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(gerarPdfCanhoteira({ supabase, orderIds: [] })).rejects.toThrow(
      /pelo menos um pedido/i
    );
  });

  it("recusa quando nenhum dos escolhidos pode entrar (cancelado ou não pago)", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(
      gerarPdfCanhoteira({ supabase, orderIds: ["a"], dia: "2026-08-28" })
    ).rejects.toThrow(/cancelados ou não constam como pagos/i);
  });
});
