import { SupabaseClient } from "@supabase/supabase-js";
import { isBusinessDayInSaoPaulo } from "../holidays";
import {
  cutoffAnteriorEmSaoPaulo,
  cutoffInstantForToday,
  diaEmSaoPaulo,
  isAfterCutoffInSaoPaulo,
  janelaDoDiaEmSaoPaulo,
} from "./cutoff";
import {
  buildControleDeRetiradaPdf,
  buildOrderSheetPdf,
  buildOrderSheetsPdf,
  VIAS_PADRAO,
  type OrderSheetData,
} from "./pdfBuilder";
import { printOrderSheet } from "./printClient";

/**
 * O que "imprimir" grava no pedido: o carimbo de que a folha saiu E o status
 * `em_separacao`.
 *
 * Por que os dois juntos (27/08/2026): `printed_at` não aparece em lugar
 * nenhum da tela — quem olha a lista de pedidos vê o STATUS. Com o pedido
 * continuando "aguardando separação" depois de a folha sair, a única defesa
 * contra imprimir a mesma folha duas vezes era a memória de quem clicou. Na
 * prática o pessoal já vinha marcando o pedido na mão logo depois de imprimir
 * (5 pedidos entre 25 e 27/08 marcados "entregue" com printed_at nulo) — agora
 * a impressão marca sozinha, no mesmo instante em que o pedido vira papel.
 *
 * Por que `em_separacao` e não `entregue`: imprimir a folha é o pedido ENTRAR
 * em separação; entregue é quando o funcionário assina na portaria. Marcar
 * entregue aqui apagaria o único estado que o quadro de separação existe pra
 * mostrar, e diria ao funcionário que o pedido já foi retirado antes de ele
 * sair da loja. A retirada continua sendo um passo de humano.
 *
 * `em_separacao` também NÃO tranca a edição de itens (só `cancelado` e
 * `entregue` trancam, ver isManageLocked em AdminOrders) — o que é coerente:
 * o pedido ainda está aberto e a mercadoria ainda está sendo juntada. Cancelar
 * segue liberado em qualquer status, com estorno de saldo.
 */
function marcaDeImpressao(agora: Date = new Date()) {
  return { printed_at: agora.toISOString(), status: "em_separacao" };
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
  released_for_today_at: string | null;
  order_items: ItemRow[];
};

export type PortariaPrintResult = {
  orderId: string;
  orderNumber: string;
  status: "IMPRESSO" | "ERRO";
  error?: string;
};

/**
 * Os pedidos que entram numa impressão da portaria.
 *
 * São DUAS origens, e a diferença importa:
 *
 * 1. **A leva do dia** — tudo que foi feito antes do corte das 13:40 de hoje.
 *    É o fluxo normal, e só existe em dia útil depois do corte.
 * 2. **Os liberados pelo RH** (`released_for_today_at`) — pedidos feitos DEPOIS
 *    do corte que alguém autorizou a sair no mesmo dia. Entram sempre, inclusive
 *    quando a leva normal não roda: se o RH libera um pedido às 15h e a leva já
 *    saiu às 14h, ou se libera num sábado, o pedido PRECISA aparecer. Um botão
 *    que responde "nenhum pedido pendente" com o pedido liberado na tela é
 *    exatamente o modo de falhar que custou caro em 26/08.
 *
 * `incluirLevaNormal` é falso quando os guardas de dia útil/corte barram o
 * fluxo 1 — aí a consulta traz só os liberados.
 */
async function buscarPedidosParaImprimir(
  supabase: SupabaseClient,
  corte: Date,
  inicioDaLeva: Date,
  limit: number,
  incluirLevaNormal: boolean
): Promise<OrderRow[]> {
  let q = supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, released_for_today_at, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .is("printed_at", null)
    .is("cancelled_at", null)
    // Pedido ENTREGUE nunca mais entra na leva (31/08/2026). `printed_at` nulo
    // deveria significar "a folha ainda não saiu", mas na prática ele também
    // fica nulo quando a folha SAIU e ninguém confirmou na tela — o passo de
    // confirmação é opcional de propósito (cancelar é seguro, ver
    // `gerarPdfPortaria`), então quem imprime, entrega a mercadoria na mão e
    // fecha a aba deixa o pedido pendente para sempre.
    //
    // Sem limite inferior de data na consulta, esses pedidos voltavam em TODA
    // impressão, indefinidamente: em 31/08 eram 6 pedidos já entregues de 25 a
    // 27/08 (GM-20260825-3235, GM-20260826-5795, GM-20260826-6865,
    // GM-20260827-4061, GM-20260827-1798, GM-20260827-6656) saindo junto com o
    // único pendente de verdade. Dois deles vieram do script que devolveu a
    // leva carimbada sem imprimir em 26/08 — que avisava "não devolva pedido já
    // entregue" e devolveu.
    //
    // O status é o critério certo porque é o único fato de fluxo que "já
    // acabou": a mercadoria saiu com o funcionário e ele assinou. Folha de
    // separação de pedido entregue é papel jogado fora — a mesma regra que o
    // CLAUDE.md já dava para desfazer carimbo indevido.
    //
    // A JANELA DE DATA foi recusada em 31/08 e ACEITA em 02/09/2026, a pedido
    // do Winiston: a folha estava saindo com pedido de dias anteriores junto
    // com os de hoje. Medido no dia: 9 pedidos entravam, só 5 eram de hoje —
    // os outros 4 eram de 31/08 e 01/09, ainda em `pedido_feito`.
    //
    // O que fez mudar de ideia foi o straggler não sumir de verdade:
    //
    // - o vigia de `operations-webhook.ts` alerta "pagos há mais de 24h e
    //   ainda não impressos", que é exatamente o pedido que este recorte tira
    //   da folha — ele passa a ser cobrado por alarme, e não por papel;
    // - `gerarPdfPedidoUnico` (botão "Imprimir" de cada linha em AdminOrders)
    //   imprime qualquer pedido antigo na hora, sem passar por estes filtros;
    // - o RH pode liberar (`released_for_today_at`), e liberado entra sempre,
    //   de qualquer data — é a porta oficial para "este antigo sai hoje".
    //
    // E a tela já PROMETIA isto: o botão diz "os pedidos de hoje ainda não
    // impressos" (AdminOrders.tsx). O código é que não cumpria.
    .neq("status", "entregue");

  // A leva normal é uma JANELA FECHADA, **de corte a corte**: do corte do dia
  // útil anterior até o corte de hoje. Não é "os pedidos de hoje" — é tudo que
  // entrou desde que a última folha saiu.
  //
  // O limite de baixo nasceu errado em 02/09/2026 (começo do dia de HOJE) e
  // cortou fora o pedido feito ontem depois das 13:40 — justamente o caso que
  // a regra do corte existe para atender, e que o Checkout promete ao
  // funcionário ("seu pedido sai amanhã"). De corte a corte, ele volta, e o
  // pedido velho que ninguém confirmou continua fora.
  //
  // O liberado pelo RH continua fora da janela, de propósito: ele é a exceção
  // explícita, e um pedido de ontem que o RH mandou sair hoje TEM de sair.
  q = incluirLevaNormal
    ? q.or(
        `and(created_at.gte.${inicioDaLeva.toISOString()},created_at.lt.${corte.toISOString()}),` +
          `released_for_today_at.not.is.null`
      )
    : q.not("released_for_today_at", "is", null);

  const { data, error } = await q
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
 * Marca `printed_at` e o status `em_separacao` (ver `marcaDeImpressao`) só se
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
      "id, order_number, employee_name, erp_external_id, released_for_today_at, cancelled_at, printed_at, wallet_debited, wallet_used_cents, pay_on_pickup_cents, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
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
        `PDF gerado, mas falhou ao marcar o pedido como impresso/em separação: ${updateError.message}`
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

  // Os guardas não abortam mais a função: eles decidem só se a LEVA NORMAL
  // entra. Pedido liberado pelo RH sai fora de hora e fora de dia útil — é
  // justamente pra isso que a liberação existe.
  const incluirLevaNormal =
    isBusinessDayInSaoPaulo(now) && (ignoreCutoffGuard || isAfterCutoffInSaoPaulo(now));

  const corte = cutoffInstantForToday(now);
  const inicioDaLeva = cutoffAnteriorEmSaoPaulo(now);
  const pedidos = await buscarPedidosParaImprimir(supabase, corte, inicioDaLeva, limit, incluirLevaNormal);

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

// ======================================================================
// Canhoteira avulsa: escolher os pedidos e tirar só a folha de controle
// ======================================================================

/**
 * Os campos que a tela precisa pra montar a lista de seleção da canhoteira.
 * `pedido` já vem resolvido (CIGAM quando existe, interno quando ainda não)
 * porque é EXATAMENTE o número que vai sair no papel — a tela não deve
 * escolher isso por conta, senão a folha e a tela discordam.
 */
export type PedidoDaCanhoteira = {
  orderId: string;
  pedido: string;
  orderNumber: string;
  erpExternalId: string | null;
  employeeName: string;
  itens: number;
  totalCents: number;
  status: string;
  printedAt: string | null;
  releasedForTodayAt: string | null;
  createdAt: string;
};

/** Só pedido pago entra em qualquer papel da portaria — mesmos três sinais
 *  de `buscarPedidosParaImprimir` (wallet_debited não é confiável sozinho). */
function foiPago(pedido: {
  wallet_debited?: boolean | null;
  wallet_used_cents?: number | null;
  pay_on_pickup_cents?: number | null;
}): boolean {
  return (
    pedido.wallet_debited === true ||
    Number(pedido.wallet_used_cents ?? 0) > 0 ||
    Number(pedido.pay_on_pickup_cents ?? 0) > 0
  );
}

function totalEmCents(itens: readonly ItemRow[]): number {
  return itens.reduce((soma, item) => soma + Math.round(item.unit_price * 100) * item.quantity, 0);
}

/**
 * Os pedidos que a tela oferece pra marcar na canhoteira: os de UM DIA, pagos,
 * não cancelados e AINDA NÃO ENTREGUES.
 *
 * Por que ainda não entregues, e não "ainda não impressos" (31/08/2026): a
 * canhoteira não é papel de separação, é o papel onde o funcionário assina ao
 * RETIRAR. Um pedido em separação — folha já impressa, mercadoria sendo
 * juntada — é justamente quem vai retirar hoje e PRECISA de uma linha na
 * folha; filtrar por `printed_at` deixaria de fora a maioria da lista. Já o
 * entregue não entra porque a assinatura dele já aconteceu, e repetir a linha
 * convida a coletar duas assinaturas do mesmo pedido.
 *
 * O dia é o de São Paulo, não o do servidor, e a janela é [00:00, 00:00 do dia
 * seguinte) — ver `janelaDoDiaEmSaoPaulo`.
 */
export async function listarPedidosDaCanhoteira(params: {
  supabase: SupabaseClient;
  dia?: string;
  limit?: number;
}): Promise<{ dia: string; pedidos: PedidoDaCanhoteira[] }> {
  const { supabase, limit = 300 } = params;
  const dia = params.dia?.trim() || diaEmSaoPaulo();
  const { inicio, fim } = janelaDoDiaEmSaoPaulo(dia);

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, status, printed_at, released_for_today_at, created_at, wallet_debited, wallet_used_cents, pay_on_pickup_cents, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .is("cancelled_at", null)
    .neq("status", "entregue")
    .gte("created_at", inicio.toISOString())
    .lt("created_at", fim.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Falha ao buscar os pedidos da canhoteira: ${error.message}`);
  }

  const pedidos = ((data ?? []) as any[])
    .filter(foiPago)
    .map((linha) => ({
      orderId: linha.id as string,
      pedido: (linha.erp_external_id ?? linha.order_number) as string,
      orderNumber: linha.order_number as string,
      erpExternalId: (linha.erp_external_id ?? null) as string | null,
      employeeName: (linha.employee_name ?? "Funcionário") as string,
      itens: (linha.order_items ?? []).length,
      totalCents: totalEmCents(linha.order_items ?? []),
      status: (linha.status ?? "") as string,
      printedAt: (linha.printed_at ?? null) as string | null,
      releasedForTodayAt: (linha.released_for_today_at ?? null) as string | null,
      createdAt: linha.created_at as string,
    }));

  return { dia, pedidos };
}

/**
 * A folha de controle SOZINHA, com os pedidos que alguém marcou na tela.
 *
 * **Não escreve nada no banco, de propósito.** A canhoteira é papel de
 * conferência: quem manda no `printed_at` é a leva de separação (dois passos,
 * com confirmação — ver `gerarPdfPortaria`), e um segundo caminho carimbando
 * o mesmo campo seria um segundo jeito de perder pedido. Tirar a canhoteira
 * duas vezes custa uma folha e não muda estado nenhum.
 *
 * Os ids vêm da tela, então a consulta refaz as checagens que importam em vez
 * de confiar: cancelado fica de fora (mercadoria não sai, e listá-lo pra
 * assinatura seria pedir assinatura de coisa que não existe) e não-pago
 * também. Entregue passa: se o pedido foi retirado entre abrir o modal e
 * clicar, a linha a mais na folha é inofensiva.
 *
 * A ORDEM das linhas é a da criação do pedido, não a que a tela mandou — o
 * papel tem que sair na mesma ordem toda vez pra portaria achar a linha.
 */
export async function gerarPdfCanhoteira(params: {
  supabase: SupabaseClient;
  orderIds: string[];
  /** Dia dos pedidos (YYYY-MM-DD em São Paulo) — vira a DATA do cabeçalho. */
  dia?: string;
}): Promise<{ pdf: Buffer; pedidos: { orderId: string; orderNumber: string }[] }> {
  const { supabase } = params;

  const ids = Array.from(
    new Set((params.orderIds ?? []).filter((id) => typeof id === "string" && id.trim() !== ""))
  );
  if (ids.length === 0) {
    throw new Error("Escolha pelo menos um pedido para a canhoteira.");
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, cancelled_at, created_at, wallet_debited, wallet_used_cents, pay_on_pickup_cents, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .in("id", ids)
    .is("cancelled_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Falha ao buscar os pedidos da canhoteira: ${error.message}`);
  }

  const pedidos = ((data ?? []) as any[]).filter(foiPago) as unknown as OrderRow[];

  if (pedidos.length === 0) {
    throw new Error(
      "Nenhum dos pedidos escolhidos pode entrar na canhoteira — foram cancelados ou não constam como pagos."
    );
  }

  // Meio-dia do dia escolhido, não 00:00: `drawControleDeRetirada` formata a
  // data com o fuso do processo, e a meia-noite de São Paulo cai no dia
  // anterior em qualquer fuso a oeste — a folha sairia com a data errada.
  const dia = params.dia?.trim() || diaEmSaoPaulo();
  const dataDoCabecalho = new Date(janelaDoDiaEmSaoPaulo(dia).inicio.getTime() + 12 * 60 * 60 * 1000);

  const pdf = await buildControleDeRetiradaPdf(pedidos.map(paraOrderSheetData), dataDoCabecalho);

  return {
    pdf,
    pedidos: pedidos.map((p) => ({ orderId: p.id, orderNumber: p.order_number })),
  };
}

/**
 * Marca `printed_at` — e o status `em_separacao`, ver `marcaDeImpressao` — na leva
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
    // como "em separação" — o estorno já aconteceu e a mercadoria não sai.
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
   * A janela de `created_at` (do começo do dia em São Paulo até o corte de
   * 13:40) continua valendo do mesmo jeito — só pula a checagem de HORÁRIO,
   * não a de QUAIS pedidos entram.
   */
  ignoreCutoffGuard?: boolean;
}): Promise<PortariaPrintResult[]> {
  const { supabase, printerHost, now = new Date(), limit = 200, ignoreCutoffGuard = false } = params;

  const incluirLevaNormal =
    isBusinessDayInSaoPaulo(now) && (ignoreCutoffGuard || isAfterCutoffInSaoPaulo(now));

  const corte = cutoffInstantForToday(now);
  const inicioDaLeva = cutoffAnteriorEmSaoPaulo(now);
  const pedidos = await buscarPedidosParaImprimir(supabase, corte, inicioDaLeva, limit, incluirLevaNormal);

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
