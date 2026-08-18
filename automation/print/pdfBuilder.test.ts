// automation/print/pdfBuilder.test.ts
import { describe, expect, it } from "vitest";
import { buildOrderSheetPdf } from "./pdfBuilder";

describe("buildOrderSheetPdf", () => {
  it("produz um PDF não vazio, com a assinatura %PDF", async () => {
    const buffer = await buildOrderSheetPdf({
      orderNumber: "GM-20260818-0001",
      employeeName: "MARCELO SILVA",
      items: [
        { productName: "Pão de Queijo 1kg", quantity: 1 },
        { productName: "Coxinha", quantity: 2 },
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
      items: [{ productName: "Pão de Queijo Ímpar 30G – Pacote 5Kg", quantity: 3 }],
    });

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
