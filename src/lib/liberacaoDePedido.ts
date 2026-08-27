import { supabase } from "@/lib/supabase";

/**
 * LIBERAR PARA HOJE — o pedido tardio que o RH autoriza a sair no mesmo dia.
 *
 * Pedido feito depois do corte das 13:40 espera o próximo dia útil: a lista da
 * portaria só o alcança amanhã e o CIGAM só o lança amanhã. Às vezes o RH
 * autoriza um deles a sair hoje, e até 27/08/2026 isso vivia fora do sistema —
 * um recado por voz e o faturamento caçando o pedido na tela.
 *
 * A liberação é esse recado registrado: marca o pedido, joga ele na leva da
 * portaria (mesmo fora de hora e fora de dia útil) e destrava a entrada no
 * CIGAM na mesma varredura de 2 minutos. Ver `buscarPedidosParaImprimir` e
 * `isEligibleForCigamEntry` em automation/.
 *
 * O horário do corte está duplicado aqui de propósito: `automation/` roda em
 * Node e não é importável do bundle do navegador (mesma razão do comentário em
 * automation/print/cutoff.ts). Se 13:40 mudar, muda nos dois lugares.
 */
const TIMEZONE = "America/Sao_Paulo";
const CUTOFF_HOUR = 13;
const CUTOFF_MINUTE = 40;

/** "Hoje às 13:40" em São Paulo. SP não tem horário de verão desde 2019. */
export function cutoffInstantForToday(agora: Date = new Date()): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  const dia = partes.find((p) => p.type === "day")?.value;
  const hh = String(CUTOFF_HOUR).padStart(2, "0");
  const mm = String(CUTOFF_MINUTE).padStart(2, "0");
  return new Date(`${ano}-${mes}-${dia}T${hh}:${mm}:00-03:00`);
}

export function isFimDeSemanaEmSaoPaulo(quando: Date = new Date()): boolean {
  const dia = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
  }).format(quando);
  return dia === "Sat" || dia === "Sun";
}

/**
 * O pedido entra na lista de separação de HOJE sozinho?
 *
 * Só se foi feito antes do corte de hoje E hoje for dia útil. Feriado não é
 * checado aqui (a lista de feriados vive em automation/holidays.ts, fora do
 * bundle) — num feriado a tela mostra o pedido como se fosse entrar, e quem
 * precisar dele usa o botão "Imprimir" avulso, que nunca teve trava nenhuma.
 */
export function entraNaLevaDeHoje(createdAt: Date, agora: Date = new Date()): boolean {
  if (isFimDeSemanaEmSaoPaulo(agora)) return false;
  return createdAt.getTime() < cutoffInstantForToday(agora).getTime();
}

export type PedidoParaLiberar = {
  id: string;
  order_number: string | null;
  erp_external_id: string | null;
  employee_name: string | null;
  employee_cpf: string | null;
  created_at: string;
  total_cents: number | null;
  wallet_used_cents: number | null;
  printed_at: string | null;
  released_for_today_at: string | null;
  released_by_cpf: string | null;
  released_authorized_by: string | null;
};

/**
 * Pedido que só sai hoje se alguém liberar: pago, não cancelado, ainda não
 * impresso, fora da leva de hoje e ainda sem liberação.
 */
export function precisaDeLiberacao(
  pedido: PedidoParaLiberar,
  agora: Date = new Date()
): boolean {
  if (pedido.printed_at) return false;
  if (pedido.released_for_today_at) return false;
  return !entraNaLevaDeHoje(new Date(pedido.created_at), agora);
}

/** Já liberado e ainda esperando o papel — é o que o faturamento precisa ver. */
export function liberadoEAindaNaoImpresso(pedido: PedidoParaLiberar): boolean {
  return !!pedido.released_for_today_at && !pedido.printed_at;
}

const SELECT_PEDIDOS =
  "id, order_number, erp_external_id, employee_name, employee_cpf, created_at, total_cents, wallet_used_cents, printed_at, released_for_today_at, released_by_cpf, released_authorized_by";

/**
 * Os pedidos pagos que ainda não viraram papel. São poucos por construção (o
 * que imprime some da lista), então vem tudo e a tela separa em "precisa de
 * liberação" e "já liberado" com as funções acima — sem espalhar a regra do
 * corte por consulta de banco.
 */
export async function listarPedidosPendentesDeImpressao(): Promise<PedidoParaLiberar[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(SELECT_PEDIDOS)
    .is("printed_at", null)
    .is("cancelled_at", null)
    // Mesmo critério de "foi pago" do resto do sistema (ver
    // buscarPedidosParaImprimir): três sinais, porque wallet_debited não é
    // escrito de forma confiável.
    .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0,wallet_used_cents.gt.0")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao buscar os pedidos pendentes: ${error.message}`);
  return (data ?? []) as unknown as PedidoParaLiberar[];
}

/**
 * Marca a liberação. Não sobrescreve uma liberação que já existe (`.is(...,
 * null)`) — duas pessoas clicando no mesmo pedido não trocam o nome de quem
 * autorizou, e a segunda recebe a recusa em vez de um sucesso mentiroso.
 *
 * O registro em `order_admin_actions` é o histórico que aparece no pedido. Se
 * ele falhar, a liberação continua valendo: perder o papel do histórico é ruim,
 * desfazer a autorização do RH por causa disso é pior.
 */
export async function liberarPedidoParaHoje(params: {
  orderId: string;
  actorCpf: string;
  autorizadoPor: string;
}): Promise<{ ok: boolean; message: string }> {
  const { orderId, actorCpf, autorizadoPor } = params;

  const { data, error } = await supabase
    .from("orders")
    .update({
      released_for_today_at: new Date().toISOString(),
      released_by_cpf: actorCpf,
      released_authorized_by: autorizadoPor.trim(),
    })
    .eq("id", orderId)
    .is("released_for_today_at", null)
    .is("cancelled_at", null)
    .is("printed_at", null)
    .select("id");

  if (error) throw new Error(`Falha ao liberar o pedido: ${error.message}`);

  if (!data || data.length === 0) {
    return {
      ok: false,
      message:
        "Nada foi liberado — o pedido já estava liberado, já foi impresso ou foi cancelado. Atualize a lista.",
    };
  }

  const { error: logError } = await supabase.from("order_admin_actions").insert({
    order_id: orderId,
    actor_cpf: actorCpf,
    action: "release_today",
    reason: `Liberado para separação hoje. Autorizado por: ${autorizadoPor.trim()}`,
  });
  if (logError) console.error("Liberação gravada, mas o histórico falhou:", logError);

  return { ok: true, message: "Pedido liberado para hoje. Ele entra na próxima impressão da portaria." };
}

/**
 * Desfaz a liberação enquanto o papel não saiu. Depois de impresso não tem o
 * que desfazer: a folha já está na portaria e a mercadoria vai ser separada.
 */
export async function desfazerLiberacao(params: {
  orderId: string;
  actorCpf: string;
}): Promise<{ ok: boolean; message: string }> {
  const { orderId, actorCpf } = params;

  const { data, error } = await supabase
    .from("orders")
    .update({
      released_for_today_at: null,
      released_by_cpf: null,
      released_authorized_by: null,
    })
    .eq("id", orderId)
    .is("printed_at", null)
    .not("released_for_today_at", "is", null)
    .select("id");

  if (error) throw new Error(`Falha ao desfazer a liberação: ${error.message}`);

  if (!data || data.length === 0) {
    return {
      ok: false,
      message:
        "Não deu pra desfazer — o pedido já foi impresso (a folha está na portaria) ou não estava liberado.",
    };
  }

  const { error: logError } = await supabase.from("order_admin_actions").insert({
    order_id: orderId,
    actor_cpf: actorCpf,
    action: "release_today_undo",
    reason: "Liberação para hoje desfeita antes da impressão.",
  });
  if (logError) console.error("Liberação desfeita, mas o histórico falhou:", logError);

  return { ok: true, message: "Liberação desfeita. O pedido volta a esperar o próximo dia útil." };
}
