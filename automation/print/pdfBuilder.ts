import PDFDocument from "pdfkit";

export interface OrderSheetItem {
  productName: string;
  quantity: number;
}

export interface OrderSheetData {
  orderNumber: string;
  employeeName: string;
  items: OrderSheetItem[];
}

const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/**
 * Uma folha A4 por pedido — separada de propósito, porque a câmara fria
 * grampeia cada uma antes de separar. Simples: nome do funcionário e o que
 * ele pediu. Sem preço nem dado fiscal — isso já está no CIGAM; esta folha é
 * só para a separação física do produto.
 */
export function buildOrderSheetPdf(pedido: OrderSheetData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("Separação — Pedido de Funcionário");
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(11).fillColor("#555555").text(`Pedido ${pedido.orderNumber}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000").text(pedido.employeeName);
    doc.moveDown(0.8);

    doc.font("Helvetica").fontSize(13).fillColor("#000000");
    if (pedido.items.length === 0) {
      doc.text("(pedido sem itens)");
    }
    for (const item of pedido.items) {
      doc.text(`• ${qtyFormatter.format(item.quantity)}x  ${item.productName}`);
      doc.moveDown(0.3);
    }

    doc.end();
  });
}
