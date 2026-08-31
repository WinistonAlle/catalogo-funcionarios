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

// Tamanhos de fonte da via impressa, todos num lugar só — mesmo ajuste feito
// no PDV em 19/08 ("diminui um pouco a letra da impressão"), copiado daqui
// (`pdv-gostinho-mineiro/server/src/print/receiptPdf.ts`) pra manter as duas
// folhas com a mesma densidade visual.
const FONT = {
  /** Rótulo das caixas PEDIDO e dos pares rótulo-valor. */
  boxLabel: 6.5,
  /** Número dentro da caixa "Pedido". */
  boxValue: 13,
  /** Rótulo "FUNCIONÁRIO". */
  sectionLabel: 8,
  employeeName: 16,
  /** Valor dos pares rótulo-valor: data do pedido, forma de pagamento. */
  fieldValue: 9.5,
  tableHeader: 8,
  tableCell: 8.5,
  /** Peso e quantidade na tabela — maiores que o resto da linha de propósito
   *  (ver comentário perto de onde são desenhados), só que também encolheram
   *  na mesma proporção do resto. */
  tableCellEmphasis: 11,
  /** "Pedido X — continuação", no topo da folha 2 em diante. */
  continuation: 8,
  itemsSummary: 9,
  totalLabel: 9,
  totalValue: 15.5,
  signature: 9,
} as const;

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
  // "center" faz parte: o PDFKit sempre aceitou (o valor é repassado cru para
  // doc.text), e drawControleHeader já pedia centro nas colunas "Hora" e
  // "Assinatura do funcionário". O tipo é que estava estreito demais, e o erro
  // ficou invisível porque `automation/` não entra em nenhum tsconfig — ver
  // "Testes" no CLAUDE.md. Nada muda no papel: já saía centralizado.
  options: { align?: "left" | "right" | "center"; padding?: number } = {}
) {
  const padding = options.padding ?? 6;
  const textHeight = doc.heightOfString(text, { width: col.width - padding * 2 });
  const textY = rowY + Math.max(0, (rowHeight - textHeight) / 2);
  doc.text(text, col.x + padding, textY, { width: col.width - padding * 2, align: options.align ?? "left" });
}

/**
 * Quem fica com cada cópia da folha. O faturamento imprime as duas e
 * entrega: uma vai para o RH (que arquiva, mesmo tendo o pedido no sistema)
 * e a outra para a portaria (que separa a mercadoria e colhe a assinatura).
 * Era assim que funcionava antes deste sistema existir, e voltou a ser em
 * 24/08/2026 — o disparo automático direto na impressora da portaria saiu de
 * cena junto.
 */
export type Via = "RH" | "PORTARIA";

/** As duas vias, na ordem em que saem do PDF. Ver buildOrderSheetsPdf. */
export const VIAS_PADRAO: readonly Via[] = ["RH", "PORTARIA"];

/**
 * Desenha uma folha de pedido a partir da página ATUAL de um doc já aberto —
 * quem chama decide se essa página é nova (doc recém-criado, ou um
 * doc.addPage() antes de chamar de novo para o próximo pedido). Extraído de
 * buildOrderSheetPdf pra dar pra colocar vários pedidos no MESMO PDF
 * (buildOrderSheetsPdf), sem duplicar a lógica de desenho.
 *
 * `via` marca a folha na faixa preta do topo. Sem ela a folha sai como
 * saía antes (faixa só com o selo), que é o certo para quem imprime uma
 * via única.
 */
function drawOrderSheet(doc: PDFKit.PDFDocument, pedido: OrderSheetData, via?: Via): void {
    const contentLeft = PAGE_MARGIN;
    const contentRight = doc.page.width - PAGE_MARGIN;
    const contentWidth = contentRight - contentLeft;

    // ------------------------------------------------------------------
    // Cabeçalho: logo à esquerda, caixa "Pedido" à direita — mesmo desenho
    // do cupom do PDV, sem a caixa de Nota Fiscal (não existe aqui).
    // ------------------------------------------------------------------
    const HEADER_TOP = PAGE_MARGIN;
    const HEADER_HEIGHT = 47;
    const INFO_BOX_W = 100;

    if (existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, contentLeft, HEADER_TOP, { fit: [96, HEADER_HEIGHT] });
    }

    const infoBoxX = contentRight - INFO_BOX_W;
    doc.roundedRect(infoBoxX, HEADER_TOP, INFO_BOX_W, HEADER_HEIGHT, 4).lineWidth(1).strokeColor(BOX_BORDER).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT.boxLabel)
      .fillColor(MUTED)
      .text("PEDIDO", infoBoxX, HEADER_TOP + 10, { width: INFO_BOX_W, align: "center", characterSpacing: 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT.boxValue)
      .fillColor(INK)
      .text(pedido.cigamOrderId ?? pedido.orderNumber, infoBoxX + 6, HEADER_TOP + 22, {
        width: INFO_BOX_W - 12,
        align: "center",
      });

    let y = HEADER_TOP + HEADER_HEIGHT + 12;

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

    // Identificação da via, encostada na ponta direita da MESMA faixa. Vai
    // aqui, e não num canto qualquer, porque as duas vias são folhas
    // idênticas: quem está separando as pilhas precisa ver de quem é a
    // folha no mesmo lugar em que já olha o selo, sem virar o papel nem
    // procurar. O selo continua centralizado na largura toda (a via é
    // curta e não chega perto dele — "VIA PORTARIA" mede ~55pt num
    // contentWidth de ~515pt).
    if (via) {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#FFFFFF")
        .text(`VIA ${via}`, contentLeft, y + 9, {
          width: contentWidth - 10,
          align: "right",
          characterSpacing: 0.5,
        });
    }
    y += BANNER_H + 18;

    // ------------------------------------------------------------------
    // Nome do funcionário em destaque — mesmo tratamento do nome do
    // cliente no cupom do PDV (rótulo pequeno em cima, nome grande embaixo,
    // régua grossa fechando o bloco).
    // ------------------------------------------------------------------
    doc.font("Helvetica-Bold").fontSize(FONT.sectionLabel).fillColor(MUTED).text("FUNCIONÁRIO", contentLeft, y, { characterSpacing: 0.5 });
    y += 13;
    doc.font("Helvetica-Bold").fontSize(FONT.employeeName).fillColor(INK).text(pedido.employeeName, contentLeft, y, { width: contentWidth });
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
      doc.font("Helvetica-Bold").fontSize(FONT.boxLabel).fillColor(MUTED).text(label.toUpperCase(), x, y, { width, characterSpacing: 0.5 });
      doc.font("Helvetica").fontSize(FONT.fieldValue).fillColor(INK).text(value, x, y + 13, { width });
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
    const MIN_ROW_H = 20;
    const CELL_PADDING = 6;

    const pageBottom = doc.page.height - PAGE_MARGIN;

    function drawTableHeader(topY: number): number {
      doc.rect(contentLeft, topY, contentWidth, HEADER_ROW_H).fill(TABLE_HEADER_BG);
      doc.font("Helvetica-Bold").fontSize(FONT.tableHeader).fillColor("#FFFFFF");
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
      cellText(doc.font("Helvetica").fontSize(FONT.tableCell).fillColor(MUTED), "(pedido sem itens)", cols.produto, y, rowHeight);
      y += rowHeight;
    }

    pedido.items.forEach((item, index) => {
      const produtoHeight = doc
        .font("Helvetica")
        .fontSize(FONT.tableCell)
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
          .fontSize(FONT.continuation)
          .fillColor(MUTED)
          .text(`Pedido ${pedido.cigamOrderId ?? pedido.orderNumber} — continuação`, contentLeft, y);
        y += 18;
        y = drawTableHeader(y);
        segmentTop = y - HEADER_ROW_H;
      }

      if (index % 2 === 1) {
        doc.rect(contentLeft, y, contentWidth, rowHeight).fill(ZEBRA_BG);
      }

      doc.font("Helvetica").fontSize(FONT.tableCell).fillColor(INK);
      cellText(doc, formatCigamCode(item.cigamCode), cols.codigo, y, rowHeight);
      cellText(doc, item.productName, cols.produto, y, rowHeight);

      // Peso e quantidade em negrito e maior: são os dois números que quem
      // separa a mercadoria precisa achar de relance, olhando de longe.
      doc.font("Helvetica-Bold").fontSize(FONT.tableCellEmphasis);
      cellText(doc, qtyFormatter.format(item.quantity), cols.qtde, y, rowHeight, { align: "right" });
      cellText(doc, formatPesoCell(item), cols.peso, y, rowHeight, { align: "right" });

      doc.font("Helvetica").fontSize(FONT.tableCell).fillColor(INK);
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
    const FECHAMENTO_H = 32 + 50 + 20;
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
      .fontSize(FONT.itemsSummary)
      .fillColor(MUTED)
      .text(
        `${pedido.items.length} ite${pedido.items.length === 1 ? "m" : "ns"} · Quantidade total: ${qtyFormatter.format(quantTotal)}`,
        contentLeft,
        y + 14
      );

    const totalBoxW = 150;
    const totalBoxH = 32;
    const totalBoxX = contentRight - totalBoxW;
    doc.lineWidth(1.5).strokeColor(INK).rect(totalBoxX, y, totalBoxW, totalBoxH).stroke();
    doc.font("Helvetica-Bold").fontSize(FONT.totalLabel).fillColor(MUTED).text("TOTAL", totalBoxX + 10, y + 6, { characterSpacing: 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(FONT.totalValue)
      .fillColor(INK)
      .text(formatBRL(total), totalBoxX, y + 13, { width: totalBoxW - 10, align: "right" });

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

    doc.font("Helvetica-Bold").fontSize(FONT.signature).fillColor(INK).text("FUNCIONÁRIO", sigLeftX, y + 8, { width: sigWidth, align: "center" });
    doc.text("GOSTINHO MINEIRO", sigRightX, y + 8, { width: sigWidth, align: "center" });
}

/**
 * Uma folha A4 por pedido — separada de propósito, porque a câmara fria
 * grampeia cada uma antes de separar.
 *
 * `vias` decide quantas folhas saem e como cada uma é marcada: passar
 * VIAS_PADRAO dá as duas cópias (RH e portaria) do fluxo do faturamento,
 * e o padrão — uma folha sem marca de via — é o que serve para quem
 * imprime direto numa impressora só, sem ninguém para entregar a segunda.
 */
export function buildOrderSheetPdf(
  pedido: OrderSheetData,
  vias: readonly Via[] | readonly [undefined] = [undefined]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    vias.forEach((via, index) => {
      if (index > 0) doc.addPage();
      drawOrderSheet(doc, pedido, via);
    });
    doc.end();
  });
}

/**
 * Vários pedidos, um PDF só — uma folha (ou mais, se o pedido for grande)
 * por pedido, cada um começando página nova. Pro botão manual "Imprimir
 * pedidos da portaria": o faturamento baixa um arquivo só com tudo que
 * está pendente, em vez de um PDF por pedido, e imprime como imprime
 * qualquer documento — sem precisar de IP de impressora nenhum.
 *
 * As vias saem em BLOCOS, não intercaladas: todos os pedidos marcados
 * "VIA RH" e, só depois, todos de novo marcados "VIA PORTARIA". Assim
 * uma impressão só devolve duas pilhas prontas — corta no meio, uma vai
 * inteira pro RH e a outra pra portaria. Intercalar (RH, portaria, RH,
 * portaria...) obrigaria a folhear o bolo inteiro separando folha a folha,
 * que é exatamente o trabalho manual que este formato existe pra evitar.
 *
 * `opcoes.controleDeRetirada` acrescenta a canhoteira no fim de tudo — a
 * folha onde a portaria colhe a assinatura de quem retira. Ver
 * drawControleDeRetirada.
 */
export function buildOrderSheetsPdf(
  pedidos: OrderSheetData[],
  vias: readonly Via[] | readonly [undefined] = [undefined],
  opcoes: { controleDeRetirada?: boolean } = {}
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    sequenciaDeFolhas(pedidos, vias).forEach(({ pedido, via }, index) => {
      if (index > 0) doc.addPage();
      drawOrderSheet(doc, pedido, via);
    });

    // A canhoteira vai por ÚLTIMO, depois do bloco da portaria — ver
    // drawControleDeRetirada. Sem pedido nenhum ela não sai: folha de
    // controle vazia é papel jogado fora.
    if (opcoes.controleDeRetirada && pedidos.length > 0) {
      doc.addPage();
      drawControleDeRetirada(doc, pedidos);
    }

    doc.end();
  });
}

/**
 * A canhoteira SOZINHA, sem as folhas de pedido — o botão "Canhoteira" do
 * Admin Pedidos (31/08/2026).
 *
 * Antes ela só existia grudada no fim do PDF da leva, o que amarrava duas
 * coisas que na portaria acontecem em horas diferentes: a folha de SEPARAÇÃO
 * sai uma vez, quando a mercadoria é juntada; a folha de CONTROLE é o papel
 * que fica na portaria colhendo assinatura enquanto o pessoal vai retirando.
 * Quem precisava de uma segunda via do controle — folha molhada, pedido que
 * entrou depois, retirada que virou o dia — só tinha a saída de reimprimir a
 * leva inteira, e aí ou levava um bolo de folha de separação repetida junto,
 * ou não levava nada.
 *
 * `hoje` é a data que sai na caixa do cabeçalho: quando a tela pede a
 * canhoteira de um dia passado, é o dia DOS PEDIDOS que tem que aparecer no
 * papel, não a data em que alguém clicou — senão a folha arquivada mente
 * sobre quando aquela retirada aconteceu.
 */
export function buildControleDeRetiradaPdf(
  pedidos: OrderSheetData[],
  hoje: Date = new Date()
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Sem pedido nenhum não sai PDF — mesma regra de `buildOrderSheetsPdf`:
    // folha de controle em branco é papel jogado fora. Quem chama trata a
    // lista vazia antes de chegar aqui; isto é só a rede.
    if (pedidos.length > 0) {
      drawControleDeRetirada(doc, pedidos, hoje);
    }

    doc.end();
  });
}

/**
 * A ordem das folhas do PDF da leva: em BLOCOS por via — todos os pedidos
 * da primeira via, depois todos da segunda.
 *
 * Separada de `buildOrderSheetsPdf` para poder ser verificada: o pdfkit
 * embute a fonte como subconjunto e escreve o texto como índice de glifo,
 * então o nome do funcionário não existe como texto legível dentro do PDF
 * gerado — não dá para afirmar a ordem lendo o arquivo. Aqui a ordem é
 * dado puro, e o teste olha exatamente o que o requisito diz.
 */
export function sequenciaDeFolhas(
  pedidos: readonly OrderSheetData[],
  vias: readonly Via[] | readonly [undefined]
): { pedido: OrderSheetData; via?: Via }[] {
  return vias.flatMap((via) => pedidos.map((pedido) => ({ pedido, via })));
}

// ======================================================================
// Canhoteira / controle de retirada da portaria
// ======================================================================

/**
 * Uma linha da canhoteira. Dado puro, separado do desenho pelo MESMO motivo
 * de `sequenciaDeFolhas`: o pdfkit embute a fonte como subconjunto e escreve
 * o texto como índice de glifo, então nada disso existe legível dentro do
 * PDF gerado — se o conteúdo da folha não for verificável aqui, não é
 * verificável em lugar nenhum.
 */
export interface LinhaControleRetirada {
  /** Número do pedido no CIGAM quando já sincronizado, senão o interno — o
   *  mesmo que sai na caixa "PEDIDO" da folha, pra bater na hora de achar o
   *  maço de mercadoria. */
  pedido: string;
  funcionario: string;
  /** Linhas de produto, não quantidade total — igual ao "N itens" do rodapé
   *  da folha do pedido. */
  itens: number;
  total: number;
}

export function linhasDoControle(pedidos: readonly OrderSheetData[]): LinhaControleRetirada[] {
  return pedidos.map((pedido) => ({
    pedido: pedido.cigamOrderId ?? pedido.orderNumber,
    funcionario: pedido.employeeName,
    itens: pedido.items.length,
    total: pedido.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  }));
}

interface ControleColumns {
  pedido: Column;
  funcionario: Column;
  itens: Column;
  total: Column;
  hora: Column;
  assinatura: Column;
}

function buildControleColumns(contentLeft: number, contentRight: number): ControleColumns {
  // 78pt e não 58: pedido ainda não sincronizado com o CIGAM sai com o
  // número interno inteiro ("GM-20260825-9596"), não com os 6 dígitos do
  // CIGAM. Em 58pt ele quebrava no meio da data.
  const pedidoW = 78;
  const itensW = 40;
  const totalW = 64;
  const horaW = 58;
  // A maior coluna da folha, de longe: é onde alguém assina À MÃO, e
  // assinatura apertada é assinatura ilegível — não adianta a folha existir
  // como prova se não dá pra ler quem assinou.
  const assinaturaW = 122;
  const funcionarioW = contentRight - contentLeft - pedidoW - itensW - totalW - horaW - assinaturaW;

  const pedido = { x: contentLeft, width: pedidoW };
  const funcionario = { x: pedido.x + pedido.width, width: funcionarioW };
  const itens = { x: funcionario.x + funcionario.width, width: itensW };
  const total = { x: itens.x + itens.width, width: totalW };
  const hora = { x: total.x + total.width, width: horaW };
  const assinatura = { x: hora.x + hora.width, width: assinaturaW };

  return { pedido, funcionario, itens, total, hora, assinatura };
}

// Alta o bastante pra caber assinatura de caneta (~12mm). A folha do pedido
// usa 20pt porque lá ninguém escreve dentro da linha; aqui escreve.
const CONTROLE_ROW_H = 34;
const CONTROLE_HEADER_H = 24;

/**
 * A canhoteira: uma folha só, com todos os pedidos da leva em linhas, onde a
 * portaria colhe a assinatura de cada funcionário na entrega.
 *
 * Por que uma folha de controle e não um canhoto destacável por pedido: a
 * portaria entrega vários pedidos na mesma janela, e um maço de canhotinhos
 * soltos se perde. Numa folha só, o que ainda não foi retirado é a linha em
 * branco — dá pra ver de relance o que sobrou no fim do dia, e o papel vai
 * inteiro pro arquivo.
 *
 * Fecha a pilha da portaria: as folhas saem em blocos (todas do RH, depois
 * todas da portaria — ver `sequenciaDeFolhas`), então esta folha, no fim de
 * tudo, cai naturalmente em cima da pilha certa quando o faturamento corta o
 * bolo no meio.
 */
function drawControleDeRetirada(
  doc: PDFKit.PDFDocument,
  pedidos: readonly OrderSheetData[],
  hoje: Date = new Date()
): void {
  const contentLeft = PAGE_MARGIN;
  const contentRight = doc.page.width - PAGE_MARGIN;
  const contentWidth = contentRight - contentLeft;
  const pageBottom = doc.page.height - PAGE_MARGIN;

  const linhas = linhasDoControle(pedidos);
  const dataHoje = hoje.toLocaleDateString("pt-BR");
  const cols = buildControleColumns(contentLeft, contentRight);

  // ------------------------------------------------------------------
  // Cabeçalho — mesmo desenho da folha do pedido (logo à esquerda, caixa à
  // direita), com a DATA no lugar do número do pedido: aqui o documento é
  // do dia, não de um pedido.
  // ------------------------------------------------------------------
  let y = PAGE_MARGIN;
  const HEADER_HEIGHT = 47;
  const INFO_BOX_W = 100;

  if (existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, contentLeft, y, { fit: [96, HEADER_HEIGHT] });
  }

  const infoBoxX = contentRight - INFO_BOX_W;
  doc.roundedRect(infoBoxX, y, INFO_BOX_W, HEADER_HEIGHT, 4).lineWidth(1).strokeColor(BOX_BORDER).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.boxLabel)
    .fillColor(MUTED)
    .text("DATA", infoBoxX, y + 10, { width: INFO_BOX_W, align: "center", characterSpacing: 0.5 });
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.boxValue)
    .fillColor(INK)
    .text(dataHoje, infoBoxX + 6, y + 22, { width: INFO_BOX_W - 12, align: "center" });

  y += HEADER_HEIGHT + 12;

  const BANNER_H = 26;
  doc.rect(contentLeft, y, contentWidth, BANNER_H).fill(BANNER_BG);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor("#FFFFFF")
    .text("CONTROLE DE RETIRADA — PORTARIA", contentLeft, y + 8, {
      width: contentWidth,
      align: "center",
      characterSpacing: 0.5,
    });
  y += BANNER_H + 16;

  const totalGeral = linhas.reduce((sum, linha) => sum + linha.total, 0);
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.itemsSummary)
    .fillColor(INK)
    .text(
      `${linhas.length} pedido${linhas.length === 1 ? "" : "s"} para retirada · Total geral ${formatBRL(totalGeral)}`,
      contentLeft,
      y,
      { width: contentWidth }
    );
  y += 15;
  doc
    .font("Helvetica")
    .fontSize(FONT.boxLabel + 1.5)
    .fillColor(MUTED)
    .text(
      "Só entregue depois de o funcionário assinar. Anote a hora. Linha em branco = pedido não retirado.",
      contentLeft,
      y,
      { width: contentWidth }
    );
  y += 20;

  // ------------------------------------------------------------------
  // Tabela — mesma zebra e mesmas réguas da folha do pedido, só que com as
  // duas últimas colunas VAZIAS de propósito: é onde a portaria escreve.
  // ------------------------------------------------------------------
  function drawControleHeader(topY: number): number {
    doc.rect(contentLeft, topY, contentWidth, CONTROLE_HEADER_H).fill(TABLE_HEADER_BG);
    doc.font("Helvetica-Bold").fontSize(FONT.tableHeader).fillColor("#FFFFFF");
    cellText(doc, "Pedido", cols.pedido, topY, CONTROLE_HEADER_H);
    cellText(doc, "Funcionário", cols.funcionario, topY, CONTROLE_HEADER_H);
    cellText(doc, "Itens", cols.itens, topY, CONTROLE_HEADER_H, { align: "right" });
    cellText(doc, "Total", cols.total, topY, CONTROLE_HEADER_H, { align: "right" });
    cellText(doc, "Hora", cols.hora, topY, CONTROLE_HEADER_H, { align: "center" });
    cellText(doc, "Assinatura do funcionário", cols.assinatura, topY, CONTROLE_HEADER_H, { align: "center" });
    return topY + CONTROLE_HEADER_H;
  }

  function closeControleSegment(topY: number, bottomY: number) {
    doc.lineWidth(0.5).strokeColor(RULE);
    for (const col of [cols.funcionario, cols.itens, cols.total, cols.hora, cols.assinatura]) {
      doc.moveTo(col.x, topY).lineTo(col.x, bottomY).stroke();
    }
    doc.lineWidth(1).strokeColor(INK).rect(contentLeft, topY, contentWidth, bottomY - topY).stroke();
  }

  /** Pauta clarinha dentro da célula, pra assinatura não sair torta nem
   *  invadir a linha de baixo. */
  function pauta(col: Column, rowY: number) {
    doc
      .moveTo(col.x + 8, rowY + CONTROLE_ROW_H - 9)
      .lineTo(col.x + col.width - 8, rowY + CONTROLE_ROW_H - 9)
      .lineWidth(0.5)
      .strokeColor(RULE)
      .stroke();
  }

  y = drawControleHeader(y);
  let segmentTop = y - CONTROLE_HEADER_H;

  if (linhas.length === 0) {
    cellText(
      doc.font("Helvetica").fontSize(FONT.tableCell).fillColor(MUTED),
      "(nenhum pedido pendente)",
      cols.funcionario,
      y,
      CONTROLE_ROW_H
    );
    y += CONTROLE_ROW_H;
  }

  linhas.forEach((linha, index) => {
    // Quebra ANTES de desenhar, mesma lição da tabela de itens: deixar o
    // pdfkit criar a página sozinho gera uma folha nova por célula.
    if (y + CONTROLE_ROW_H > pageBottom) {
      closeControleSegment(segmentTop, y);
      doc.addPage();
      y = PAGE_MARGIN;
      doc
        .font("Helvetica")
        .fontSize(FONT.continuation)
        .fillColor(MUTED)
        .text(`Controle de retirada ${dataHoje} — continuação`, contentLeft, y);
      y += 18;
      y = drawControleHeader(y);
      segmentTop = y - CONTROLE_HEADER_H;
    }

    if (index % 2 === 1) {
      doc.rect(contentLeft, y, contentWidth, CONTROLE_ROW_H).fill(ZEBRA_BG);
    }

    // Número do pedido em destaque: é por ele que a portaria acha a folha
    // grampeada no maço de mercadoria. O número do CIGAM tem 6 dígitos e
    // sai no corpo da tabela; o interno, de pedido ainda não sincronizado,
    // tem 16 caracteres e só cabe numa linha se encolher — encolhido ainda
    // é melhor que quebrado no meio da data.
    const pedidoComprido = linha.pedido.length > 8;
    doc.font("Helvetica-Bold").fontSize(pedidoComprido ? 7.5 : FONT.tableCell).fillColor(INK);
    cellText(doc, linha.pedido, cols.pedido, y, CONTROLE_ROW_H, { padding: pedidoComprido ? 4 : 6 });

    doc.font("Helvetica").fontSize(FONT.tableCell).fillColor(INK);
    cellText(doc, linha.funcionario, cols.funcionario, y, CONTROLE_ROW_H);
    cellText(doc, qtyFormatter.format(linha.itens), cols.itens, y, CONTROLE_ROW_H, { align: "right" });
    cellText(doc, formatBRL(linha.total), cols.total, y, CONTROLE_ROW_H, { align: "right" });

    pauta(cols.hora, y);
    pauta(cols.assinatura, y);

    doc.moveTo(contentLeft, y + CONTROLE_ROW_H).lineTo(contentRight, y + CONTROLE_ROW_H).lineWidth(0.5).strokeColor(RULE).stroke();
    y += CONTROLE_ROW_H;
  });

  closeControleSegment(segmentTop, y);
  y += 26;

  // ------------------------------------------------------------------
  // Fecho — quem responde pela folha. Mesma medida do fechamento da folha
  // do pedido: somada, não chutada.
  // ------------------------------------------------------------------
  const FECHO_H = 34;
  if (y + FECHO_H > pageBottom) {
    doc.addPage();
    y = PAGE_MARGIN;
  }

  const sigWidth = (contentWidth - 30) / 2;
  const sigRightX = contentLeft + sigWidth + 30;
  doc.lineWidth(1).strokeColor(INK);
  doc.moveTo(sigRightX, y).lineTo(sigRightX + sigWidth, y).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(FONT.signature)
    .fillColor(INK)
    .text("RESPONSÁVEL PELA PORTARIA", sigRightX, y + 8, { width: sigWidth, align: "center" });
  doc
    .font("Helvetica")
    .fontSize(FONT.boxLabel + 1)
    .fillColor(MUTED)
    .text(`Folha gerada em ${dataHoje}.`, contentLeft, y + 8, { width: sigWidth });
}
