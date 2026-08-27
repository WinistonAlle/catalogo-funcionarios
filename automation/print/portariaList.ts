import { SupabaseClient } from "@supabase/supabase-js";
import { isBusinessDayInSaoPaulo } from "../holidays";
import { cutoffInstantForToday, isAfterCutoffInSaoPaulo } from "./cutoff";
import { buildOrderSheetPdf, buildOrderSheetsPdf, VIAS_PADRAO, type OrderSheetData } from "./pdfBuilder";
import { printOrderSheet } from "./printClient";

/**
 * O que "imprimir" grava no pedido: o carimbo de que a folha saiu E o status
 * `entregue`.
 *
 * Por que os dois juntos (27/08/2026): `printed_at` não aparece em lugar
 * nenhum da tela — quem olha a lista de pedidos vê o STATUS. Com o pedido
 * continuando "aguardando separação" depois de a folha sair, a única defesa
 * contra imprimir a mesma folha duas vezes era a memória de quem clicou. Na
 * prática o pessoal já vinha marcando "entregue" na mão logo depois de
 * imprimir (5 pedidos assim entre 25 e 27/08, todos com printed_at nulo) —
 * agora a impressão marca sozinha, no mesmo instante, e o pedido sai da fila
 * da portaria e do quadro de separação de uma vez só.
 *
 * `entregue` também tranca a edição de itens (isManageLocked em AdminOrders e
 * o guard das RPCs de item), e isso é o certo depois de a folha estar
 * circulando: mudar item de um pedido cuja lista de separação já foi pra
 * portaria é papel e banco discordando. CANCELAR continua liberado
 * (`admin_cancel_order_v2` não recusa pedido entregue) — essa é a saída de
 * verdade quando o pedido não pode mais acontecer, e ela estorna o saldo.
 */
function marcaDeImpressao(agora: Date = new Date()) {
  return { printed_at: agora.toISOString(), status: "entregue" };
}

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
 * Marca `printed_at` e o status `entregue` (ver `marcaDeImpressao`) só se
 * `printed_at` ainda estiver nulo — reimprimir um pedido que já tinha saído
 * não mexe no timestamp original nem duplica no relatório do disparo
 * automático.
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
      .update(marcaDeImpressao())
      .eq("id", orderId);
    if (updateError) {
      throw new Error(
        `PDF gerado, mas falhou ao marcar o pedido como impresso/entregue: ${updateError.message}`
      );
    }
  }

  return { pdf, orderNumber: pedido.order_number, jaImpresso };
}

/**
 * Gera UM PDF com todos os pedidos pendentes (uma folha por pedido) — pro
 * botão manual "Imprimir pedidos da portaria" (AdminOrders/RhHome).
 *
 * **NÃO marca `printed_at`.** Quem marca é `marcarPortariaImpressa`, chamado
 * depois que o faturamento confirma na tela que as folhas saíram de verdade.
 *
 * Por que os dois passos (26/08/2026): antes, gerar o PDF já carimbava a leva
 * inteira como impressa. Quando o arquivo não virava papel — aba fechada sem
 * Ctrl+P, pop-up bloqueado, impressora sem papel — os pedidos sumiam da lista
 * PARA SEMPRE e o botão passava a responder "nenhum pedido pendente pra
 * imprimir" com os pedidos ali na tela, visíveis. Foi exatamente isso na leva
 * de 26/08 (GM-20260825-9590, GM-20260825-3235, GM-20260826-5795): carimbados
 * às 17:04 UTC, seguidos de cinco cliques devolvendo zero pedido.
 *
 * O jeito de falhar agora é o oposto, e é o certo: sem confirmação o pedido
 * CONTINUA na lista. Uma folha a mais é papel; um pedido que some é
 * mercadoria que ninguém separa.
 *
 * `pedidos: []` quando não tem nada pendente — PDF vazio nesse caso.
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

  return {
    pdf,
    pedidos: pedidos.map((p) => ({ orderId: p.id, orderNumber: p.order_number })),
  };
}

/**
 * Marca `printed_at` — e o status `entregue`, ver `marcaDeImpressao` — na leva
 * que o faturamento confirmou ter saído no papel: o segundo passo de
 * `gerarPdfPortaria` (ver o porquê lá em cima).
 *
 * Só mexe em quem ainda está com `printed_at` nulo: confirmar duas vezes, ou
 * confirmar uma leva que o disparo automático já carimbou no meio do caminho,
 * não reescreve o timestamp original. Devolve quantos pedidos de fato mudaram,
 * que é o número honesto pra mostrar na tela e pro log da operação.
 */
export async function marcarPortariaImpressa(
  supabase: SupabaseClient,
  orderIds: string[]
): Promise<{ marcados: string[] }> {
  const ids = Array.from(
    new Set((orderIds ?? []).filter((id) => typeof id === "string" && id.trim() !== ""))
  );
  if (ids.length === 0) return { marcados: [] };

  const { data, error } = await supabase
    .from("orders")
    .update(marcaDeImpressao())
    .in("id", ids)
    .is("printed_at", null)
    // Os ids vêm da tela, não da consulta da leva: se um pedido for cancelado
    // entre gerar o PDF e confirmar a impressão, ele não pode ressuscitar
    // como "entregue" — o estorno já aconteceu e a mercadoria não sai.
    .is("cancelled_at", null)
    .select("id");

  if (error) {
    throw new Error(`Falha ao marcar os pedidos como impressos: ${error.message}`);
  }

  return { marcados: (data ?? []).map((linha: { id: string }) => linha.id) };
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
          .update(marcaDeImpressao())
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
