// automation/print/pdfBuilder.test.ts
import { describe, expect, it } from "vitest";
import { buildOrderSheetPdf, buildOrderSheetsPdf, linhasDoControle, sequenciaDeFolhas, VIAS_PADRAO } from "./pdfBuilder";

describe("buildOrderSheetPdf", () => {
  it("produz um PDF não vazio, com a assinatura %PDF", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-20260818-0001",
      cigamOrderId: "011856",
      employeeName: "MARCELO SILVA",
      items: [
        { cigamCode: "002005000027", productName: "Pão de Queijo 1kg", quantity: 1, unitPrice: 14.85 },
        { cigamCode: "002001000010", productName: "Coxinha", quantity: 2, unitPrice: 3.5 },
      ],
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("não quebra com lista de itens vazia", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-TEST",
      employeeName: "TESTE",
      items: [],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("lida com nome de funcionário e produto com acento sem lançar erro", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-ACENTO",
      employeeName: "JOÃO CONCEIÇÃO",
      items: [
        {
          productName: "Pão de Queijo Ímpar 30G – Pacote 5Kg",
          quantity: 3,
          packageWeightKg: 5,
          unitPrice: 54.5,
        },
      ],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("não quebra sem cigamOrderId nem cigamCode (pedido ainda não sincronizado com o CIGAM)", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-SEM-CIGAM",
      employeeName: "TESTE",
      items: [{ productName: "Biscoito de Queijo", quantity: 1, unitPrice: 12.9 }],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("sai em uma folha só quando ninguém pede via", async () => {
    const buffer = await buildOrderSheetPdf(pedidoDeTeste("GM-1"));
    expect(contarPaginas(buffer)).toBe(1);
  });

  it("sai em duas folhas, uma por via, quando pedem as duas", async () => {
    const buffer = await buildOrderSheetPdf(pedidoDeTeste("GM-1"), VIAS_PADRAO);
    expect(contarPaginas(buffer)).toBe(2);
  });
});

describe("buildOrderSheetsPdf", () => {
  it("sem via, é uma folha por pedido", async () => {
    const buffer = await buildOrderSheetsPdf([pedidoDeTeste("GM-1"), pedidoDeTeste("GM-2")]);
    expect(contarPaginas(buffer)).toBe(2);
  });

  /**
   * O que garante as duas PILHAS do faturamento: 3 pedidos × 2 vias = 6
   * folhas, e não 3. Se alguém trocar o laço por um intercalado, a
   * contagem continua 6 — por isso o teste seguinte, que olha a ORDEM.
   */
  it("com as duas vias, dobra o número de folhas", async () => {
    const pedidos = [pedidoDeTeste("GM-1"), pedidoDeTeste("GM-2"), pedidoDeTeste("GM-3")];
    const buffer = await buildOrderSheetsPdf(pedidos, VIAS_PADRAO);
    expect(contarPaginas(buffer)).toBe(6);
  });

  /**
   * A canhoteira é UMA folha a mais no fim, não uma por pedido — se virar
   * uma por pedido, a portaria volta a ter maço de canhotinho solto, que é
   * exatamente o que esta folha existe pra evitar.
   */
  it("com controle de retirada, sai UMA folha a mais no fim", async () => {
    const pedidos = [pedidoDeTeste("GM-1"), pedidoDeTeste("GM-2"), pedidoDeTeste("GM-3")];
    const buffer = await buildOrderSheetsPdf(pedidos, VIAS_PADRAO, { controleDeRetirada: true });
    expect(contarPaginas(buffer)).toBe(7);
  });

  it("sem pedido nenhum, não gera folha de controle em branco", async () => {
    const semControle = await buildOrderSheetsPdf([], VIAS_PADRAO);
    const comControle = await buildOrderSheetsPdf([], VIAS_PADRAO, { controleDeRetirada: true });
    expect(contarPaginas(comControle)).toBe(contarPaginas(semControle));
  });

  it("não pede controle de retirada por padrão — quem imprime uma via só não ganha folha extra", async () => {
    const buffer = await buildOrderSheetsPdf([pedidoDeTeste("GM-1")], ["PORTARIA"]);
    expect(contarPaginas(buffer)).toBe(1);
  });

  it("a canhoteira aguenta uma leva grande sem estourar a folha", async () => {
    const pedidos = Array.from({ length: 40 }, (_, i) => pedidoDeTeste(`GM-${i + 1}`));
    const buffer = await buildOrderSheetsPdf(pedidos, ["PORTARIA"], { controleDeRetirada: true });
    // 40 folhas de pedido + a canhoteira paginada (não cabe em uma folha só).
    expect(contarPaginas(buffer)).toBeGreaterThan(41);
  });
});

/**
 * O conteúdo da canhoteira não é verificável lendo o PDF (pdfkit escreve o
 * texto como índice de glifo de fonte embutida em subconjunto), então é aqui
 * que se olha o que vai na folha — mesmo motivo de sequenciaDeFolhas.
 */
describe("linhasDoControle", () => {
  it("uma linha por pedido, na ordem recebida", () => {
    const linhas = linhasDoControle([pedidoDeTeste("GM-1", "ANA"), pedidoDeTeste("GM-2", "BRUNO")]);
    expect(linhas.map((l) => l.funcionario)).toEqual(["ANA", "BRUNO"]);
  });

  /**
   * O número que a portaria usa pra achar o maço é o do CIGAM, o mesmo que
   * sai na caixa "PEDIDO" da folha — se cair no interno quando o pedido já
   * sincronizou, a folha da mercadoria e a canhoteira deixam de bater.
   */
  it("usa o número do CIGAM quando o pedido já sincronizou, e o interno quando não", () => {
    const linhas = linhasDoControle([
      { orderNumber: "GM-20260825-9590", cigamOrderId: "015046", employeeName: "ANA", items: [] },
      { orderNumber: "GM-20260825-9591", employeeName: "BRUNO", items: [] },
    ]);

    expect(linhas.map((l) => l.pedido)).toEqual(["015046", "GM-20260825-9591"]);
  });

  it("total da linha é a soma de preço × quantidade, igual ao TOTAL da folha do pedido", () => {
    const [linha] = linhasDoControle([
      {
        orderNumber: "GM-1",
        employeeName: "ANA",
        items: [
          { productName: "Pão de Queijo 1kg", quantity: 2, unitPrice: 14.85 },
          { productName: "Coxinha", quantity: 3, unitPrice: 3.5 },
        ],
      },
    ]);

    expect(linha.itens).toBe(2);
    expect(linha.total).toBeCloseTo(2 * 14.85 + 3 * 3.5, 2);
  });
});

describe("sequenciaDeFolhas", () => {
  /**
   * A ordem é o requisito, não um detalhe: em blocos o faturamento corta a
   * pilha no meio e entrega; intercalado, alguém teria que folhear o bolo
   * inteiro separando folha a folha.
   */
  it("é em blocos por via — todos os pedidos do RH, depois todos da portaria", () => {
    const pedidos = [pedidoDeTeste("GM-1"), pedidoDeTeste("GM-2"), pedidoDeTeste("GM-3")];

    const ordem = sequenciaDeFolhas(pedidos, VIAS_PADRAO).map(
      ({ pedido, via }) => `${pedido.orderNumber}/${via}`
    );

    expect(ordem).toEqual([
      "GM-1/RH",
      "GM-2/RH",
      "GM-3/RH",
      "GM-1/PORTARIA",
      "GM-2/PORTARIA",
      "GM-3/PORTARIA",
    ]);
  });

  it("sem via, é um por pedido e na ordem recebida", () => {
    const ordem = sequenciaDeFolhas([pedidoDeTeste("GM-1"), pedidoDeTeste("GM-2")], [undefined]);

    expect(ordem.map((f) => f.pedido.orderNumber)).toEqual(["GM-1", "GM-2"]);
    expect(ordem.every((f) => f.via === undefined)).toBe(true);
  });
});

function pedidoDeTeste(orderNumber: string, employeeName = "FUNCIONARIO TESTE") {
  return {
    orderNumber,
    employeeName,
    items: [{ productName: "Pão de Queijo 1kg", quantity: 1, unitPrice: 14.85 }],
  };
}

/** Conta os objetos `/Type /Page` do PDF (não `/Pages`, que é o nó da árvore). */
function contarPaginas(buffer: Buffer): number {
  return (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}
