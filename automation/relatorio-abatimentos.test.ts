import { describe, expect, it } from "vitest";

import {
  avaliarPedido,
  montarRelatorio,
  semanaSabadoASexta,
  reaisParaCentavos,
  type PedidoDoCatalogo,
} from "./relatorio-abatimentos";

const pedidoOk = (over: Partial<PedidoDoCatalogo> = {}): PedidoDoCatalogo => ({
  id: "1",
  order_number: "GM-20260825-9590",
  employee_name: "LUDMILLA FERREIRA OLIVEIRA",
  employee_cpf: "12345678901",
  created_at: "2026-08-25T15:25:00Z",
  total_cents: 3855,
  wallet_used_cents: 3855,
  cancelled_at: null,
  printed_at: "2026-08-25T18:00:00Z",
  erp_external_id: "015046",
  erp_status: "DONE",
  ...over,
});

const noCigamOk = (over = {}) => ({
  codigo: "015046",
  dataPedido: "2026-08-25",
  situacao: "F",
  situacaoDescricao: "Faturado",
  codigoControle: "40",
  codigoCliente: "009752",
  totalPedido: 38.55,
  ...over,
});

describe("avaliarPedido — quem pode ser abatido da folha", () => {
  it("pedido efetivado, impresso e batendo de valor passa limpo", () => {
    const { motivos } = avaliarPedido(pedidoOk(), noCigamOk());
    expect(motivos).toEqual([]);
  });

  it("pedido não impresso NÃO é abatido, mas também não some", () => {
    const { motivos, detalhe } = avaliarPedido(pedidoOk({ printed_at: null }), noCigamOk());
    expect(motivos).toContain("nao_impresso");
    expect(detalhe).toContain("portaria");
  });

  it("recibo que o CIGAM não conhece é a divergência que importa", () => {
    // O caso real: recibo excluído no ERP depois de gravado aqui.
    const { motivos, detalhe } = avaliarPedido(pedidoOk(), null);
    expect(motivos).toContain("ausente_no_cigam");
    expect(detalhe).toContain("015046");
  });

  it("pedido sem recibo nenhum nem chega a consultar o CIGAM", () => {
    const { motivos } = avaliarPedido(
      pedidoOk({ erp_external_id: null, erp_status: "ERROR" }),
      null
    );
    expect(motivos).toContain("sem_recibo");
    expect(motivos).not.toContain("ausente_no_cigam");
  });

  it("recibo parado no controle 30 não gerou documento — não abate", () => {
    const { motivos, detalhe } = avaliarPedido(
      pedidoOk(),
      noCigamOk({ codigoControle: "30", situacaoDescricao: "Pedido gerado" })
    );
    expect(motivos).toContain("nao_efetivado");
    expect(detalhe).toContain("30");
  });

  it("recibo de OUTRO cliente não é pedido de funcionário", () => {
    const { motivos } = avaliarPedido(pedidoOk(), noCigamOk({ codigoCliente: "000123" }));
    expect(motivos).toContain("cliente_diferente");
  });

  it("valor diferente entre catálogo e CIGAM vira pendência", () => {
    const { motivos, detalhe } = avaliarPedido(pedidoOk(), noCigamOk({ totalPedido: 44.8 }));
    expect(motivos).toContain("valor_divergente");
    expect(detalhe).toContain("44,80");
  });

  it("tolera 1 centavo de arredondamento do float do CIGAM", () => {
    // 38.55 * 100 pode dar 3854.9999999999995 dependendo do caminho.
    const { motivos } = avaliarPedido(
      pedidoOk({ total_cents: 3855 }),
      noCigamOk({ totalPedido: 38.5499999 })
    );
    expect(motivos).toEqual([]);
  });

  it("falha ao consultar o CIGAM não vira 'ausente' — são coisas diferentes", () => {
    const { motivos, detalhe } = avaliarPedido(pedidoOk(), null, "timeout");
    expect(motivos).toContain("erro_na_consulta");
    expect(motivos).not.toContain("ausente_no_cigam");
    expect(detalhe).toContain("timeout");
  });

  it("acumula mais de um motivo quando há mais de um problema", () => {
    const { motivos } = avaliarPedido(
      pedidoOk({ printed_at: null }),
      noCigamOk({ codigoControle: "30", totalPedido: 99 })
    );
    expect(motivos).toEqual(
      expect.arrayContaining(["nao_impresso", "nao_efetivado", "valor_divergente"])
    );
  });
});

describe("semanaSabadoASexta", () => {
  it("numa SEXTA devolve a semana que fecha naquele dia", () => {
    // 2026-08-28 é uma sexta-feira.
    const { inicio, fim } = semanaSabadoASexta(new Date("2026-08-28T15:00:00-03:00"));
    expect(fim).toBe("2026-08-28");
    expect(inicio).toBe("2026-08-22"); // sábado anterior
  });

  it("num SÁBADO a semana começa naquele dia", () => {
    const { inicio, fim } = semanaSabadoASexta(new Date("2026-08-29T10:00:00-03:00"));
    expect(inicio).toBe("2026-08-29");
    expect(fim).toBe("2026-09-04");
  });

  it("no meio da semana devolve a semana corrente", () => {
    // 2026-08-26 é uma quarta.
    const { inicio, fim } = semanaSabadoASexta(new Date("2026-08-26T10:00:00-03:00"));
    expect(inicio).toBe("2026-08-22");
    expect(fim).toBe("2026-08-28");
  });

  it("o intervalo tem sempre 7 dias", () => {
    for (const dia of ["2026-08-22", "2026-08-25", "2026-08-28", "2026-09-01"]) {
      const { inicio, fim } = semanaSabadoASexta(new Date(`${dia}T12:00:00-03:00`));
      const dias = (new Date(fim).getTime() - new Date(inicio).getTime()) / 86_400_000;
      expect(dias).toBe(6);
    }
  });

  it("atravessa a virada de mês sem quebrar", () => {
    const { inicio, fim } = semanaSabadoASexta(new Date("2026-09-02T10:00:00-03:00"));
    expect(inicio).toBe("2026-08-29");
    expect(fim).toBe("2026-09-04");
  });
});

describe("montarRelatorio", () => {
  it("separa as duas listas e soma só a de abater", async () => {
    const pedidos = [
      pedidoOk({ id: "1", order_number: "A", total_cents: 1000, wallet_used_cents: 1000 }),
      pedidoOk({ id: "2", order_number: "B", printed_at: null, total_cents: 2000, wallet_used_cents: 2000 }),
    ];

    const rel = await montarRelatorio(pedidos, "2026-08-22", "2026-08-28", async () =>
      noCigamOk({ totalPedido: 10 })
    );

    expect(rel.abater.map((l) => l.orderNumber)).toEqual(["A"]);
    expect(rel.conferir.map((l) => l.orderNumber)).toEqual(["B"]);
    expect(rel.totais.abaterCents).toBe(1000);
    expect(rel.totais.conferirCents).toBe(2000);
  });

  it("agrupa por funcionário — é assim que a folha consome", async () => {
    const pedidos = [
      pedidoOk({ id: "1", order_number: "A", employee_cpf: "111", employee_name: "ANA", total_cents: 1000, wallet_used_cents: 1000 }),
      pedidoOk({ id: "2", order_number: "B", employee_cpf: "111", employee_name: "ANA", total_cents: 1500, wallet_used_cents: 1500 }),
      pedidoOk({ id: "3", order_number: "C", employee_cpf: "222", employee_name: "BRUNO", total_cents: 500, wallet_used_cents: 500 }),
    ];

    const rel = await montarRelatorio(pedidos, "2026-08-22", "2026-08-28", async (codigo) =>
      noCigamOk({ codigo, totalPedido: 10 })
    );

    // Todos batem de valor? Não — o mock devolve sempre R$ 10. Só o de R$ 10
    // passa; os outros viram pendência. Isso é proposital: confirma que o
    // agrupamento usa a lista ABATER, não todos os pedidos.
    expect(rel.porFuncionario).toEqual([
      { employeeName: "ANA", employeeCpf: "111", pedidos: 1, totalCents: 1000 },
    ]);
  });

  it("abate o que saiu do SALDO, não o total do pedido", async () => {
    // Pedido antigo, da era "pagamento na retirada": parte foi paga na hora.
    const rel = await montarRelatorio(
      [pedidoOk({ total_cents: 5000, wallet_used_cents: 3000 })],
      "2026-08-22",
      "2026-08-28",
      async () => noCigamOk({ totalPedido: 50 })
    );

    expect(rel.abater[0].valorCents).toBe(3000);
    expect(rel.totais.abaterCents).toBe(3000);
  });

  it("CIGAM fora do ar não derruba o relatório — marca e segue", async () => {
    const rel = await montarRelatorio([pedidoOk()], "2026-08-22", "2026-08-28", async () => {
      throw new Error("ECONNREFUSED");
    });

    expect(rel.cigamIndisponivel).toBe(true);
    expect(rel.abater).toHaveLength(0);
    expect(rel.conferir[0].motivos).toContain("erro_na_consulta");
  });

  it("semana sem pedido nenhum gera relatório vazio, não erro", async () => {
    const rel = await montarRelatorio([], "2026-08-22", "2026-08-28", async () => null);
    expect(rel.totais.pedidosAbater).toBe(0);
    expect(rel.totais.abaterCents).toBe(0);
    expect(rel.porFuncionario).toEqual([]);
    expect(rel.cigamIndisponivel).toBe(false);
  });
});

describe("reaisParaCentavos", () => {
  it("arredonda o float do CIGAM sem perder centavo", () => {
    expect(reaisParaCentavos(38.55)).toBe(3855);
    expect(reaisParaCentavos(44.8)).toBe(4480);
    expect(reaisParaCentavos(0)).toBe(0);
  });
});
