import { SupabaseClient } from "@supabase/supabase-js";
import { isBusinessDayInSaoPaulo } from "../holidays";
import { cutoffInstantForToday, isAfterCutoffInSaoPaulo } from "./cutoff";
import { buildOrderSheetPdf, buildOrderSheetsPdf, VIAS_PADRAO, type OrderSheetData } from "./pdfBuilder";
import { printOrderSheet } from "./printClient";

type ItemRow = {
  product_name: string;
  quantity: number;
  unit_price: number;
  products: {
    cigam_code: string | null;
    cigam_unit: string | null;
    weight: number | null;
  } | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  employee_name: string | null;
  erp_external_id: string | null;
  order_items: ItemRow[];
};

export type PortariaPrintResult = {
  orderId: string;
  orderNumber: string;
  status: "IMPRESSO" | "ERRO";
  error?: string;
};

async function buscarPedidosParaImprimir(
  supabase: SupabaseClient,
  corte: Date,
  limit: number
): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .is("printed_at", null)
    .is("cancelled_at", null)
    .lt("created_at", corte.toISOString())
    // Mesmo critério de "foi pago" que automation/cigam/process-pending-orders.ts —
    // wallet_debited não é escrito de forma confiável (ver comentário lá), então
    // os três sinais juntos são a rede de segurança.
    .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0,wallet_used_cents.gt.0")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar pedidos para a lista da portaria: ${error.message}`);
  return (data ?? []) as unknown as OrderRow[];
}

function paraOrderSheetData(pedido: OrderRow): OrderSheetData {
  return {
    orderNumber: pedido.order_number,
    cigamOrderId: pedido.erp_external_id,
    employeeName: pedido.employee_name ?? "Funcionário",
    items: pedido.order_items.map((item) => ({
      cigamCode: item.products?.cigam_code ?? null,
      productName: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      // Peso total só faz sentido para item vendido por KG — mesma regra
      // de src/lib/pricing.ts (getProductWeight): peso <= 0 vira 1 (ex.:
      // "Pacote 1kg"), pra bater com o que o funcionário de fato pagou.
      packageWeightKg:
        (item.products?.cigam_unit ?? "").trim().toUpperCase() === "KG"
          ? item.products?.weight && item.products.weight > 0
            ? item.products.weight
            : 1
          : undefined,
    })),
  };
}

export type PortariaPdfResultado = {
  pdf: Buffer;
  pedidos: { orderId: string; orderNumber: string }[];
};

export type PedidoUnicoResultado = {
  pdf: Buffer;
  orderNumber: string;
  /** true quando este pedido já tinha `printed_at` — reimpressão, não marca de novo. */
  jaImpresso: boolean;
};

/**
 * Gera o PDF de UM pedido específico, fora do fluxo normal (corte, dia útil,
 * "foi pago") — botão "Imprimir" avulso em AdminOrders, pra reimprimir ou
 * imprimir na hora um pedido específico se algo sair fora do previsto (folha
 * perdida, impressora falhou, pedido esquecido). Por isso NÃO tem os
 * filtros de `buscarPedidosParaImprimir`: o admin já escolheu o pedido pela
 * tela, então a intenção é explícita — só pedido cancelado continua
 * recusado, porque não faz sentido separar mercadoria de um pedido que não
 * vale mais.
 *
 * Marca `printed_at` só se ainda estiver nulo — reimprimir um pedido que já
 * tinha saído não mexe no timestamp original nem duplica no relatório do
 * disparo automático.
 */
export async function gerarPdfPedidoUnico(params: {
  supabase: SupabaseClient;
  orderId: string;
}): Promise<PedidoUnicoResultado> {
  const { supabase, orderId } = params;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, cancelled_at, printed_at, wallet_debited, wallet_used_cents, pay_on_pickup_cents, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar o pedido: ${error.message}`);
  if (!data) throw new Error("Pedido não encontrado.");

  const pedido = data as unknown as OrderRow & {
    cancelled_at: string | null;
    printed_at: string | null;
    wallet_debited: boolean | null;
    wallet_used_cents: number | null;
    pay_on_pickup_cents: number | null;
  };

  if (pedido.cancelled_at) {
    throw new Error("Este pedido está cancelado — a portaria não separa mercadoria dele.");
  }

  // Mesmo critério de "foi pago" de `buscarPedidosParaImprimir`. O corte de
  // horário e o de dia útil ficam de fora de propósito (é ação explícita do
  // admin), mas este NÃO pode: se o pagamento falhar entre o insert do pedido
  // e o RPC, sobra um pedido zerado que ninguém pagou — mandar separar
  // mercadoria dele é prejuízo, e ainda marcaria printed_at, escondendo-o da
  // lista automática se algum dia fosse pago de verdade.
  const foiPago =
    pedido.wallet_debited === true ||
    Number(pedido.wallet_used_cents ?? 0) > 0 ||
    Number(pedido.pay_on_pickup_cents ?? 0) > 0;

  if (!foiPago) {
    throw new Error(
      "Este pedido não consta como pago — o pagamento pode ter falhado. Confira antes de mandar separar."
    );
  }

  // Duas vias como na leva do dia: a avulsa é o caminho de recuperação
  // (folha atolou, pedido entrou depois), e nesse caso o RH e a portaria
  // precisam da cópia deles tanto quanto na impressão normal.
  const pdf = await buildOrderSheetPdf(paraOrderSheetData(pedido), VIAS_PADRAO);
  const jaImpresso = !!pedido.printed_at;

  if (!jaImpresso) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({ printed_at: new Date().toISOString() })
      .eq("id", orderId);
    if (updateError) {
      throw new Error(`PDF gerado, mas falhou ao marcar printed_at: ${updateError.message}`);
    }
  }

  return { pdf, orderNumber: pedido.order_number, jaImpresso };
}

/**
 * Gera UM PDF com todos os pedidos pendentes (uma folha por pedido) e marca
 * printed_at em todos — pro botão manual "Imprimir pedidos da portaria"
 * (AdminOrders/RhHome). Diferente do disparo automático (que só marca
 * printed_at depois da impressora confirmar o job), aqui não tem como
 * confirmar impressão física: o arquivo é baixado e impresso como
 * qualquer documento, sem IP de impressora nenhum envolvido. printed_at
 * marca o MOMENTO EM QUE O ARQUIVO FOI GERADO — mesmo princípio de quando
 * a portaria recebia o papel em mãos antes de existir disparo automático.
 *
 * `pedidos: []` quando não tem nada pendente — devolve PDF `null` nesse
 * caso (nada pra gerar).
 */
export async function gerarPdfPortaria(params: {
  supabase: SupabaseClient;
  now?: Date;
  limit?: number;
  ignoreCutoffGuard?: boolean;
}): Promise<PortariaPdfResultado> {
  const { supabase, now = new Date(), limit = 200, ignoreCutoffGuard = false } = params;

  if (!isBusinessDayInSaoPaulo(now)) return { pdf: Buffer.alloc(0), pedidos: [] };
  if (!ignoreCutoffGuard && !isAfterCutoffInSaoPaulo(now)) return { pdf: Buffer.alloc(0), pedidos: [] };

  const corte = cutoffInstantForToday(now);
  const pedidos = await buscarPedidosParaImprimir(supabase, corte, limit);

  if (pedidos.length === 0) return { pdf: Buffer.alloc(0), pedidos: [] };

  // controleDeRetirada: a canhoteira que fecha a pilha da portaria — uma
  // folha só, com todos os pedidos da leva em linhas, onde o funcionário
  // assina na entrega. Só sai aqui, no PDF da leva: num pedido avulso
  // (gerarPdfPedidoUnico) uma folha de controle de UMA linha não controla
  // nada — lá a assinatura do rodapé da própria folha já resolve.
  const pdf = await buildOrderSheetsPdf(pedidos.map(paraOrderSheetData), VIAS_PADRAO, {
    controleDeRetirada: true,
  });

  const ids = pedidos.map((p) => p.id);
  const { error: updateError } = await supabase
    .from("orders")
    .update({ printed_at: new Date().toISOString() })
    .in("id", ids);

  if (updateError) {
    throw new Error(
      `PDF gerado, mas falhou ao marcar printed_at em ${ids.length} pedido(s) — rodar de novo reimprimiria os mesmos: ${updateError.message}`
    );
  }

  return {
    pdf,
    pedidos: pedidos.map((p) => ({ orderId: p.id, orderNumber: p.order_number })),
  };
}

/**
 * Imprime a lista de separação do dia: uma folha por pedido pago e ainda não
 * impresso, criado antes do corte de hoje (13:40). Roda só em dia útil e só
 * depois do corte — chamar fora dessas condições não faz nada (devolve []).
 *
 * Idempotente e retry-safe por construção: o filtro `created_at < corte de
 * hoje` não muda dentro do mesmo dia, então chamar de novo (porque a
 * impressora falhou às 13:40, por exemplo) pega exatamente o mesmo conjunto
 * de pedidos ainda sem `printed_at` — nunca um pedido feito DEPOIS do corte,
 * que só entra no corte de amanhã.
 */
export async function printPortariaList(params: {
  supabase: SupabaseClient;
  printerHost: string;
  now?: Date;
  limit?: number;
  /**
   * O disparo automático só age depois do corte (13:40) — pra não pegar
   * pedido feito no meio da tarde antes da hora certa. O botão manual do
   * faturamento ("Imprimir pedidos da portaria" em AdminOrders) é o oposto:
   * intenção explícita de alguém, pode rodar a qualquer hora do dia útil.
   * O filtro por `created_at < corte de hoje` continua valendo do mesmo
   * jeito — só pula a checagem de HORÁRIO, não a de QUAIS pedidos entram.
   */
  ignoreCutoffGuard?: boolean;
}): Promise<PortariaPrintResult[]> {
  const { supabase, printerHost, now = new Date(), limit = 200, ignoreCutoffGuard = false } = params;

  if (!isBusinessDayInSaoPaulo(now)) return [];
  if (!ignoreCutoffGuard && !isAfterCutoffInSaoPaulo(now)) return [];

  const corte = cutoffInstantForToday(now);
  const pedidos = await buscarPedidosParaImprimir(supabase, corte, limit);

  const resultados: PortariaPrintResult[] = [];

  for (const pedido of pedidos) {
    try {
      // Via única, e marcada PORTARIA: este caminho sai direto na
      // impressora da portaria, então não existe ninguém no meio para
      // entregar a segunda via ao RH — mandar as duas só deixaria a folha
      // do RH esquecida na bandeja de lá.
      const pdf = await buildOrderSheetPdf(paraOrderSheetData(pedido), ["PORTARIA"]);

      await printOrderSheet(pdf, printerHost);

      // A folha já saiu de verdade (printOrderSheet só resolve depois de a
      // impressora confirmar). Se o UPDATE falhar daqui pra frente, isolar
      // esse erro para dizer isso explicitamente: sem marcar printed_at, a
      // próxima checagem vai reimprimir este pedido — uma folha extra, não
      // uma falha de impressão de verdade. Quem olhar o log precisa
      // distinguir os dois casos.
      try {
        const { error: updateError } = await supabase
          .from("orders")
          .update({ printed_at: new Date().toISOString() })
          .eq("id", pedido.id);
        if (updateError) throw new Error(updateError.message);
      } catch (updateErr: any) {
        throw new Error(
          `Folha impressa com sucesso, mas falhou ao marcar printed_at — este pedido será impresso de novo na próxima checagem: ${updateErr?.message ?? updateErr}`
        );
      }

      resultados.push({ orderId: pedido.id, orderNumber: pedido.order_number, status: "IMPRESSO" });
    } catch (err: any) {
      // Não marca printed_at: a próxima chamada tenta este pedido de novo.
      resultados.push({
        orderId: pedido.id,
        orderNumber: pedido.order_number,
        status: "ERRO",
        error: err?.message ?? String(err),
      });
    }
  }

  return resultados;
}
