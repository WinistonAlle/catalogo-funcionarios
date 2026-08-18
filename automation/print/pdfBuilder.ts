import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import PDFDocument from "pdfkit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = join(__dirname, "assets", "logo.png");

export interface OrderSheetItem {
  /** Código do material no CIGAM (com padding de espaços) — ver formatCigamCode. */
  cigamCode?: string | null;
  productName: string;
  quantity: number;
  /** Peso da embalagem em kg — só presente em item vendido por KG (ver formatPesoCell). */
  packageWeightKg?: number;
  /** Preço do PACOTE já cobrado do funcionário (não R$/kg) — ver nota em formatUnitPriceCell. */
  unitPrice: number;
}

export interface OrderSheetData {
  orderNumber: string;
  /** Número do pedido no CIGAM, quando já sincronizado — cai no orderNumber interno se ainda não tiver. */
  cigamOrderId?: string | null;
  employeeName: string;
  items: OrderSheetItem[];
}

/**
 * Layout deliberadamente igual ao do PDV
 * (`pdv-gostinho-mineiro/server/src/print/receiptPdf.ts`) — mesma paleta,
 * mesmas colunas (Cód./Produto/Qtde/Peso/Pr. Unit./Total), mesma tabela
 * zebrada com quebra de página cuidadosa, mesmo bloco de "cliente em
 * destaque" e mesma linha de assinatura. A câmara fria já lê os cupons da
 * loja nesse formato havia meses; replicar em vez de inventar um novo deixa
 * esta folha reconhecível de cara, e é exatamente o que o PDV já faz para
 * venda na tabela de preço "005" (Funcionários) — lá a única diferença é o
 * nome vir prefixado "FUNCIONÁRIO - " (`formatReceiptCustomerName`).
 *
 * Duas diferenças deliberadas em relação ao PDV, e por quê:
 *
 * 1. Selo "PEDIDO DE FUNCIONÁRIO — SEPARAÇÃO INTERNA" (faixa escura, logo
 *    abaixo do cabeçalho): esta folha nunca é um cupom de venda de balcão —
 *    o pedido é feito pelo próprio funcionário no catálogo, sem caixa
 *    envolvido — então precisa ficar óbvio de onde ela veio, mesmo de longe.
 *
 * 2. "Pr. Unit." mostra o preço do PACOTE, não R$/kg como no PDV. O motivo é
 *    o modelo de preço deste sistema: `order_items.unit_price` já é
 *    `getUnitPrice()` (preço/kg × peso, ver src/lib/pricing.ts) — o preço
 *    do pacote inteiro, calculado no checkout. Mostrar R$/kg aqui exigiria
 *    reverter essa conta só para a tela, e o resultado quebraria a conferência
 *    óbvia "Pr. Unit. × Qtde = Total" que a folha existe para dar de bandeja.
 *
 * Sem caixa de Nota Fiscal no cabeçalho: pedido de funcionário sai pela série
 * REC (recibo) — nunca emite NF-e (ver CLAUDE.md, "Integração CIGAM").
 */

// Impressoras da loja são lasers monocromáticas (confirmado no PDV) — mesma
// paleta de lá: preenchimento escuro só na faixa de identificação e nos
// cabeçalhos, cinza para zebra, resto é preto sobre branco.
const INK = "#1A1A1A";
const MUTED = "#6B6B6B";
const RULE = "#B5B5B5";
const BANNER_BG = "#1A1A1A";
const TABLE_HEADER_BG = "#2B2B2B";
// Mais escuro que o #EFEFEF do PDV: no papel impresso (laser mono) a versão
// mais clara quase não se distinguia do branco puro da linha ao lado.
const ZEBRA_BG = "#E0E0E0";
const BOX_BORDER = "#C9C9C9";

const PAGE_MARGIN = 40;

const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const qtyFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
// Peso admite fração (ex.: a linha Alho OMG é 1,01kg — 3 pacotes dão 3,03 kg).
const pesoFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

function formatBRL(value: number): string {
  return brlFormatter.format(value);
}

/** Trims CIGAM's space-padded material code down to its real digits — mesma função do PDV. */
function formatCigamCode(cigamCode: string | null | undefined): string {
  if (!cigamCode) return "—";
  return cigamCode.trim().replace(/^0+(?=\d)/, "");
}

/**
 * "Peso" da linha — total em kg para item vendido por KG (ex.: 2 pacotes de
 * 5kg = "10 kg"). Traço para item vendido por unidade/caixa/pacote fechado,
 * onde um peso total não significaria nada — mesma regra do PDV
 * (formatPesoCell em receiptPdf.ts).
 */
function formatPesoCell(item: OrderSheetItem): string {
  if (!item.packageWeightKg) return "—";
  return `${pesoFormatter.format(item.quantity * item.packageWeightKg)} kg`;
}

interface Column {
  x: number;
  width: number;
}

interface TableColumns {
  codigo: Column;
  produto: Column;
  qtde: Column;
  peso: Column;
  precoUnit: Column;
  total: Column;
}

function buildColumns(contentLeft: number, contentRight: number): TableColumns {
  const codigoW = 46;
  const qtdeW = 62;
  const pesoW = 58;
  const precoW = 74;
  const totalW = 74;
  const produtoW = contentRight - contentLeft - codigoW - qtdeW - pesoW - precoW - totalW;

  const codigo = { x: contentLeft, width: codigoW };
  const produto = { x: codigo.x + codigo.width, width: produtoW };
  const qtde = { x: produto.x + produto.width, width: qtdeW };
  const peso = { x: qtde.x + qtde.width, width: pesoW };
  const precoUnit = { x: peso.x + peso.width, width: precoW };
  const total = { x: precoUnit.x + precoUnit.width, width: totalW };

  return { codigo, produto, qtde, peso, precoUnit, total };
}

/** Desenha o texto de uma célula, centralizado verticalmente na linha. */
function cellText(
  doc: PDFKit.PDFDocument,
  text: string,
  col: Column,
  rowY: number,
  rowHeight: number,
  options: { align?: "left" | "right"; padding?: number } = {}
) {
  const padding = options.padding ?? 6;
  const textHeight = doc.heightOfString(text, { width: col.width - padding * 2 });
  const textY = rowY + Math.max(0, (rowHeight - textHeight) / 2);
  doc.text(text, col.x + padding, textY, { width: col.width - padding * 2, align: options.align ?? "left" });
}

/**
 * Uma folha A4 por pedido — separada de propósito, porque a câmara fria
 * grampeia cada uma antes de separar.
 */
export function buildOrderSheetPdf(pedido: OrderSheetData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const contentLeft = PAGE_MARGIN;
    const contentRight = doc.page.width - PAGE_MARGIN;
    const contentWidth = contentRight - contentLeft;

    // ------------------------------------------------------------------
    // Cabeçalho: logo à esquerda, caixa "Pedido" à direita — mesmo desenho
    // do cupom do PDV, sem a caixa de Nota Fiscal (não existe aqui).
    // ------------------------------------------------------------------
    const HEADER_TOP = PAGE_MARGIN;
    const HEADER_HEIGHT = 70;
    const INFO_BOX_W = 130;

    if (existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, contentLeft, HEADER_TOP, { fit: [140, HEADER_HEIGHT] });
    }

    const infoBoxX = contentRight - INFO_BOX_W;
    doc.roundedRect(infoBoxX, HEADER_TOP, INFO_BOX_W, HEADER_HEIGHT, 4).lineWidth(1).strokeColor(BOX_BORDER).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(MUTED)
      .text("PEDIDO", infoBoxX, HEADER_TOP + 14, { width: INFO_BOX_W, align: "center", characterSpacing: 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(INK)
      .text(pedido.cigamOrderId ?? pedido.orderNumber, infoBoxX + 6, HEADER_TOP + 32, {
        width: INFO_BOX_W - 12,
        align: "center",
      });

    let y = HEADER_TOP + HEADER_HEIGHT + 16;

    // ------------------------------------------------------------------
    // Selo "PEDIDO DE FUNCIONÁRIO" — faixa escura de ponta a ponta. É o
    // que deixa impossível confundir esta folha com um cupom de venda de
    // balcão do PDV: aqui não teve caixa nenhum, foi o próprio funcionário
    // que fez o pedido no catálogo.
    // ------------------------------------------------------------------
    const BANNER_H = 26;
    doc.rect(contentLeft, y, contentWidth, BANNER_H).fill(BANNER_BG);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#FFFFFF")
      .text("PEDIDO DE FUNCIONÁRIO — SEPARAÇÃO INTERNA", contentLeft, y + 8, {
        width: contentWidth,
        align: "center",
        characterSpacing: 0.5,
      });
    y += BANNER_H + 18;

    // ------------------------------------------------------------------
    // Nome do funcionário em destaque — mesmo tratamento do nome do
    // cliente no cupom do PDV (rótulo pequeno em cima, nome grande embaixo,
    // régua grossa fechando o bloco).
    // ------------------------------------------------------------------
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("FUNCIONÁRIO", contentLeft, y, { characterSpacing: 0.5 });
    y += 13;
    doc.font("Helvetica-Bold").fontSize(19).fillColor(INK).text(pedido.employeeName, contentLeft, y, { width: contentWidth });
    y += doc.heightOfString(pedido.employeeName, { width: contentWidth }) + 6;

    doc.moveTo(contentLeft, y).lineTo(contentRight, y).lineWidth(2).strokeColor(INK).stroke();
    y += 16;

    // ------------------------------------------------------------------
    // Data do pedido / forma de pagamento — mesmo par de colunas do PDV.
    // "Desconto em Folha" é fixo: neste sistema é a única forma de
    // pagamento que existe, não varia por pedido (saldo mensal debitado no
    // checkout).
    // ------------------------------------------------------------------
    const halfWidth = contentWidth / 2;
    const dataHoje = new Date().toLocaleDateString("pt-BR");

    function labeledValue(x: number, width: number, label: string, value: string): number {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.5 });
      doc.font("Helvetica").fontSize(11).fillColor(INK).text(value, x, y + 13, { width });
      return y + 13 + doc.heightOfString(value, { width });
    }

    const dataBottom = labeledValue(contentLeft, halfWidth - 10, "Data do Pedido", dataHoje);
    const paymentBottom = labeledValue(contentLeft + halfWidth, halfWidth, "Forma de Pagamento", "Desconto em Folha");
    y = Math.max(dataBottom, paymentBottom) + 14;

    // ------------------------------------------------------------------
    // Tabela de itens — zebrada, pra quem separa escanear a lista rápido.
    // A linha cresce pra caber nome de produto longo, em vez de cortar.
    // ------------------------------------------------------------------
    const cols = buildColumns(contentLeft, contentRight);
    const HEADER_ROW_H = 24;
    const MIN_ROW_H = 22;
    const CELL_PADDING = 6;

    const pageBottom = doc.page.height - PAGE_MARGIN;

    function drawTableHeader(topY: number): number {
      doc.rect(contentLeft, topY, contentWidth, HEADER_ROW_H).fill(TABLE_HEADER_BG);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
      cellText(doc, "Cód.", cols.codigo, topY, HEADER_ROW_H);
      cellText(doc, "Produto", cols.produto, topY, HEADER_ROW_H);
      cellText(doc, "Qtde", cols.qtde, topY, HEADER_ROW_H, { align: "right" });
      cellText(doc, "Peso", cols.peso, topY, HEADER_ROW_H, { align: "right" });
      cellText(doc, "Pr. Unit.", cols.precoUnit, topY, HEADER_ROW_H, { align: "right" });
      cellText(doc, "Total", cols.total, topY, HEADER_ROW_H, { align: "right" });
      return topY + HEADER_ROW_H;
    }

    // Bordas desenhadas por trecho de tabela (o pedaço que cabe numa
    // página), não sobre a tabela inteira — com quebra de página, uma
    // borda só do topo da primeira ao fim da última atravessaria o papel.
    function closeTableSegment(topY: number, bottomY: number) {
      doc.lineWidth(0.5).strokeColor(RULE);
      for (const col of [cols.produto, cols.qtde, cols.peso, cols.precoUnit, cols.total]) {
        doc.moveTo(col.x, topY).lineTo(col.x, bottomY).stroke();
      }
      doc.lineWidth(1).strokeColor(INK).rect(contentLeft, topY, contentWidth, bottomY - topY).stroke();
    }

    y = drawTableHeader(y);
    let segmentTop = y - HEADER_ROW_H;

    if (pedido.items.length === 0) {
      const rowHeight = MIN_ROW_H;
      cellText(doc.font("Helvetica").fontSize(9.5).fillColor(MUTED), "(pedido sem itens)", cols.produto, y, rowHeight);
      y += rowHeight;
    }

    pedido.items.forEach((item, index) => {
      const produtoHeight = doc
        .font("Helvetica")
        .fontSize(9.5)
        .heightOfString(item.productName, { width: cols.produto.width - CELL_PADDING * 2 });
      const rowHeight = Math.max(MIN_ROW_H, produtoHeight + CELL_PADDING * 2);

      // A quebra acontece ANTES de desenhar — sem isso o PDFKit cria uma
      // página nova por célula que passa do fim do papel (mesmo problema já
      // corrigido no PDV, ver o comentário equivalente em receiptPdf.ts).
      if (y + rowHeight > pageBottom) {
        closeTableSegment(segmentTop, y);
        doc.addPage();
        y = PAGE_MARGIN;
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(MUTED)
          .text(`Pedido ${pedido.cigamOrderId ?? pedido.orderNumber} — continuação`, contentLeft, y);
        y += 18;
        y = drawTableHeader(y);
        segmentTop = y - HEADER_ROW_H;
      }

      if (index % 2 === 1) {
        doc.rect(contentLeft, y, contentWidth, rowHeight).fill(ZEBRA_BG);
      }

      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      cellText(doc, formatCigamCode(item.cigamCode), cols.codigo, y, rowHeight);
      cellText(doc, item.productName, cols.produto, y, rowHeight);

      // Peso e quantidade em negrito e maior: são os dois números que quem
      // separa a mercadoria precisa achar de relance, olhando de longe.
      doc.font("Helvetica-Bold").fontSize(12);
      cellText(doc, qtyFormatter.format(item.quantity), cols.qtde, y, rowHeight, { align: "right" });
      cellText(doc, formatPesoCell(item), cols.peso, y, rowHeight, { align: "right" });

      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      cellText(doc, formatBRL(item.unitPrice), cols.precoUnit, y, rowHeight, { align: "right" });
      cellText(doc, formatBRL(item.unitPrice * item.quantity), cols.total, y, rowHeight, { align: "right" });

      doc.moveTo(contentLeft, y + rowHeight).lineTo(contentRight, y + rowHeight).lineWidth(0.5).strokeColor(RULE).stroke();

      y += rowHeight;
    });

    closeTableSegment(segmentTop, y);
    y += 18;

    // Altura do fechamento (totais + assinaturas), somada das MESMAS
    // medidas usadas para desenhá-lo logo abaixo — não estimada (mesma
    // lição do PDV: "por segurança" chutado grande demais custa uma folha
    // extra em todo pedido; chutado pequeno demais corta o fechamento).
    const FECHAMENTO_H = 44 + 50 + 20;
    if (y + FECHAMENTO_H > pageBottom) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    // ------------------------------------------------------------------
    // Totais — contagem de itens à esquerda, caixa de TOTAL à direita.
    // ------------------------------------------------------------------
    const quantTotal = pedido.items.reduce((sum, i) => sum + i.quantity, 0);
    const total = pedido.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text(
        `${pedido.items.length} ite${pedido.items.length === 1 ? "m" : "ns"} · Quantidade total: ${qtyFormatter.format(quantTotal)}`,
        contentLeft,
        y + 14
      );

    const totalBoxW = 200;
    const totalBoxH = 44;
    const totalBoxX = contentRight - totalBoxW;
    doc.lineWidth(1.5).strokeColor(INK).rect(totalBoxX, y, totalBoxW, totalBoxH).stroke();
    doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED).text("TOTAL", totalBoxX + 14, y + 9, { characterSpacing: 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor(INK)
      .text(formatBRL(total), totalBoxX, y + 8, { width: totalBoxW - 14, align: "right" });

    y += totalBoxH + 50;

    // ------------------------------------------------------------------
    // Assinatura — prova física de que o funcionário retirou o pedido,
    // mesmo par do PDV ("CONSUMIDOR / GOSTINHO MINEIRO"), relabeled aqui.
    // ------------------------------------------------------------------
    const sigWidth = (contentWidth - 30) / 2;
    const sigLeftX = contentLeft;
    const sigRightX = contentLeft + sigWidth + 30;

    doc.lineWidth(1).strokeColor(INK);
    doc.moveTo(sigLeftX, y).lineTo(sigLeftX + sigWidth, y).stroke();
    doc.moveTo(sigRightX, y).lineTo(sigRightX + sigWidth, y).stroke();

    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("FUNCIONÁRIO", sigLeftX, y + 8, { width: sigWidth, align: "center" });
    doc.text("GOSTINHO MINEIRO", sigRightX, y + 8, { width: sigWidth, align: "center" });

    doc.end();
  });
}
