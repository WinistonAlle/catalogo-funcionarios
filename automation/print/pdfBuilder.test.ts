// automation/print/pdfBuilder.test.ts
import { describe, expect, it } from "vitest";
import { buildOrderSheetPdf } from "./pdfBuilder";

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
});
