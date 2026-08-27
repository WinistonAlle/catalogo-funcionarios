/**
 * Relatório de abatimentos — o papel que o faturamento entregava ao RH toda
 * sexta, agora puxado pelo próprio RH (27/08/2026).
 *
 * O QUE ELE RESPONDE
 * ------------------
 * "Quanto descontar de cada funcionário na folha desta semana, e isso confere
 * com o que o CIGAM registrou?"
 *
 * A SEMANA VAI DE SÁBADO A SEXTA. Não é arbitrário: o relatório era entregue na
 * sexta cobrindo a semana que se fechava naquele dia, então a semana começa no
 * sábado seguinte ao fechamento anterior. As datas são editáveis para quem
 * precisar de outro intervalo.
 *
 * AS DUAS LISTAS, E POR QUE SÃO DUAS
 * ----------------------------------
 * O pedido foi "todos os pedidos que de fato foram efetivados e impressos,
 * desconsiderando os cancelados". Se o relatório PARASSE aí, ele perderia
 * dinheiro em silêncio: existe pedido com o saldo do funcionário JÁ DEBITADO
 * que nunca foi impresso (a impressão da lista da portaria é manual desde
 * 24/08/2026 e depende de alguém lembrar). Sumir com esses do papel faria o RH
 * abater a menos — o funcionário levou a mercadoria e não teve desconto.
 *
 * Então o relatório tem duas seções:
 *
 *   ABATER      — efetivado no CIGAM, impresso, não cancelado, conferido.
 *                 É a lista que o pedido original descreve, e a que o RH usa.
 *   CONFERIR    — pedidos com saldo debitado que NÃO passaram em algum ponto:
 *                 sem impressão, sem recibo, ausentes do CIGAM ou com valor
 *                 divergente. Não entram no total; precisam de decisão humana.
 *
 * Nada é descartado em silêncio. Um pedido que sai da primeira lista aparece na
 * segunda, com o motivo escrito.
 *
 * A CONFERÊNCIA É AO VIVO
 * -----------------------
 * Não basta o catálogo ter `erp_external_id` gravado: o recibo pode ter sido
 * excluído no CIGAM depois (já aconteceu neste projeto, e é inclusive o
 * procedimento para reenfileirar um pedido). Cada pedido é perguntado ao CIGAM
 * por `buscarPedido`, e quatro coisas são checadas — existe, é do cliente de
 * funcionário, está efetivado (controle 40) e o valor bate.
 */
import type { CigamClient, CigamPedidoConferencia } from "./cigam/client";

/** Um pedido do catálogo, do jeito que o relatório precisa dele. */
export type PedidoDoCatalogo = {
  id: string;
  order_number: string;
  employee_name: string | null;
  employee_cpf: string | null;
  created_at: string;
  total_cents: number;
  wallet_used_cents: number;
  cancelled_at: string | null;
  printed_at: string | null;
  erp_external_id: string | null;
  erp_status: string | null;
};

export type MotivoPendencia =
  | "nao_impresso"
  | "sem_recibo"
  | "ausente_no_cigam"
  | "nao_efetivado"
  | "cliente_diferente"
  | "valor_divergente"
  | "erro_na_consulta";

export type LinhaRelatorio = {
  orderNumber: string;
  employeeName: string;
  employeeCpf: string;
  criadoEm: string;
  /** O que sai da folha: o que foi debitado do saldo. */
  valorCents: number;
  recibo: string | null;
  impressoEm: string | null;
  /** O que o CIGAM devolveu, em centavos, quando devolveu algo. */
  valorNoCigamCents: number | null;
  motivos: MotivoPendencia[];
  detalhe: string | null;
};

export type RelatorioAbatimentos = {
  inicio: string;
  fim: string;
  geradoEm: string;
  abater: LinhaRelatorio[];
  conferir: LinhaRelatorio[];
  totais: {
    abaterCents: number;
    conferirCents: number;
    pedidosAbater: number;
    pedidosConferir: number;
    funcionarios: number;
  };
  /** Total por funcionário — é assim que a folha consome. */
  porFuncionario: Array<{
    employeeName: string;
    employeeCpf: string;
    pedidos: number;
    totalCents: number;
  }>;
  /** Falhou a conversa com o CIGAM? O relatório sai, mas avisando. */
  cigamIndisponivel: boolean;
};

/** Cliente exclusivo de pedido de funcionário. Recibo de outro cliente não é nosso. */
export const CLIENTE_PEDIDO_FUNCIONARIO = "009752";

/** Controle 40 = efetivado (documento gerado). 30 = parado, sem documento. */
export const CONTROLE_EFETIVADO = "40";

/**
 * Centavos toleram 1 de diferença por arredondamento de ponto flutuante: o
 * CIGAM devolve reais como float (38.55) e 38.55 * 100 pode dar 3854.9999...
 */
const TOLERANCIA_CENTAVOS = 1;

export function reaisParaCentavos(valor: number): number {
  return Math.round(Number(valor ?? 0) * 100);
}

/**
 * A régua. Recebe o pedido do catálogo e o que o CIGAM disse (ou null, ou o
 * erro da consulta) e devolve os motivos pelos quais ele NÃO pode ser abatido.
 * Lista vazia = pode abater.
 *
 * Separada da consulta de propósito: é a parte que decide dinheiro, e precisa
 * ser testável sem CIGAM nenhum na frente.
 */
export function avaliarPedido(
  pedido: PedidoDoCatalogo,
  noCigam: CigamPedidoConferencia | null,
  erroDaConsulta?: string | null
): { motivos: MotivoPendencia[]; detalhe: string | null } {
  const motivos: MotivoPendencia[] = [];
  const detalhes: string[] = [];

  if (!pedido.printed_at) {
    motivos.push("nao_impresso");
    detalhes.push("nunca saiu na lista da portaria");
  }

  if (erroDaConsulta) {
    motivos.push("erro_na_consulta");
    detalhes.push(`não deu para perguntar ao CIGAM: ${erroDaConsulta}`);
    return { motivos, detalhe: detalhes.join("; ") || null };
  }

  if (!pedido.erp_external_id) {
    motivos.push("sem_recibo");
    detalhes.push(`nunca recebeu número de recibo (erp_status=${pedido.erp_status ?? "—"})`);
    return { motivos, detalhe: detalhes.join("; ") || null };
  }

  if (!noCigam) {
    motivos.push("ausente_no_cigam");
    detalhes.push(
      `o catálogo guarda o recibo ${pedido.erp_external_id}, mas o CIGAM não conhece esse código`
    );
    return { motivos, detalhe: detalhes.join("; ") || null };
  }

  if (noCigam.codigoCliente && noCigam.codigoCliente !== CLIENTE_PEDIDO_FUNCIONARIO) {
    motivos.push("cliente_diferente");
    detalhes.push(
      `o recibo ${noCigam.codigo} no CIGAM é do cliente ${noCigam.codigoCliente}, ` +
        `não do cliente de pedido de funcionário (${CLIENTE_PEDIDO_FUNCIONARIO})`
    );
  }

  if (noCigam.codigoControle && noCigam.codigoControle !== CONTROLE_EFETIVADO) {
    motivos.push("nao_efetivado");
    detalhes.push(
      `parado no controle ${noCigam.codigoControle} (${noCigam.situacaoDescricao ?? "sem situação"}) — ` +
        "nenhum documento foi gerado"
    );
  }

  const cigamCents = reaisParaCentavos(noCigam.totalPedido);
  if (Math.abs(cigamCents - pedido.total_cents) > TOLERANCIA_CENTAVOS) {
    motivos.push("valor_divergente");
    detalhes.push(
      `catálogo diz ${formatarReais(pedido.total_cents)} e o CIGAM diz ${formatarReais(cigamCents)}`
    );
  }

  return { motivos, detalhe: detalhes.join("; ") || null };
}

export function formatarReais(cents: number): string {
  return (Number(cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * O intervalo padrão: a semana de SÁBADO a SEXTA que contém (ou acabou de
 * fechar em) a data dada.
 *
 * Rodando numa sexta — o dia em que o relatório sempre foi entregue — devolve a
 * semana que fecha HOJE. Em qualquer outro dia, devolve a semana corrente
 * (sábado passado até a próxima sexta).
 *
 * Datas em YYYY-MM-DD, no fuso de São Paulo, porque é nele que "que dia é hoje"
 * significa alguma coisa para quem trabalha na loja.
 */
export function semanaSabadoASexta(referencia = new Date()): { inicio: string; fim: string } {
  const emSP = new Date(
    referencia.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  // 0 = domingo, 6 = sábado.
  const diaDaSemana = emSP.getDay();

  // Quantos dias voltar para chegar no sábado que abre a semana.
  // sáb(6)->0, dom(0)->1, seg(1)->2, ter(2)->3, qua(3)->4, qui(4)->5, sex(5)->6
  const diasDesdeSabado = (diaDaSemana + 1) % 7;

  const inicio = new Date(emSP);
  inicio.setDate(inicio.getDate() - diasDesdeSabado);

  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);

  return { inicio: paraISO(inicio), fim: paraISO(fim) };
}

function paraISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/**
 * Monta o relatório a partir dos pedidos já lidos do banco, perguntando ao
 * CIGAM sobre cada um que tenha recibo.
 *
 * `consultarCigam` é injetado para o teste poder rodar sem rede — e para o
 * endpoint poder decidir se reaproveita uma sessão já aberta.
 */
export async function montarRelatorio(
  pedidos: PedidoDoCatalogo[],
  inicio: string,
  fim: string,
  consultarCigam: (codigo: string) => Promise<CigamPedidoConferencia | null>
): Promise<RelatorioAbatimentos> {
  const abater: LinhaRelatorio[] = [];
  const conferir: LinhaRelatorio[] = [];
  let cigamIndisponivel = false;

  for (const pedido of pedidos) {
    let noCigam: CigamPedidoConferencia | null = null;
    let erro: string | null = null;

    if (pedido.erp_external_id) {
      try {
        noCigam = await consultarCigam(pedido.erp_external_id);
      } catch (err: any) {
        erro = String(err?.message ?? err).slice(0, 200);
        cigamIndisponivel = true;
      }
    }

    const { motivos, detalhe } = avaliarPedido(pedido, noCigam, erro);

    const linha: LinhaRelatorio = {
      orderNumber: pedido.order_number,
      employeeName: pedido.employee_name ?? "Sem nome",
      employeeCpf: pedido.employee_cpf ?? "",
      criadoEm: pedido.created_at,
      // O que a folha abate é o que saiu do saldo, não o total do pedido: são
      // iguais hoje (o checkout exige saldo cobrindo 100%), mas o histórico tem
      // pedidos da era "pagamento na retirada", e abater o total ali cobraria
      // do funcionário uma parte que ele já pagou na hora.
      valorCents: pedido.wallet_used_cents || pedido.total_cents,
      recibo: pedido.erp_external_id,
      impressoEm: pedido.printed_at,
      valorNoCigamCents: noCigam ? reaisParaCentavos(noCigam.totalPedido) : null,
      motivos,
      detalhe,
    };

    if (motivos.length === 0) abater.push(linha);
    else conferir.push(linha);
  }

  const porCpf = new Map<string, { employeeName: string; employeeCpf: string; pedidos: number; totalCents: number }>();
  for (const linha of abater) {
    const chave = linha.employeeCpf || linha.employeeName;
    const atual = porCpf.get(chave) ?? {
      employeeName: linha.employeeName,
      employeeCpf: linha.employeeCpf,
      pedidos: 0,
      totalCents: 0,
    };
    atual.pedidos += 1;
    atual.totalCents += linha.valorCents;
    porCpf.set(chave, atual);
  }

  const porFuncionario = Array.from(porCpf.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, "pt-BR")
  );

  return {
    inicio,
    fim,
    geradoEm: new Date().toISOString(),
    abater,
    conferir,
    totais: {
      abaterCents: abater.reduce((s, l) => s + l.valorCents, 0),
      conferirCents: conferir.reduce((s, l) => s + l.valorCents, 0),
      pedidosAbater: abater.length,
      pedidosConferir: conferir.length,
      funcionarios: porFuncionario.length,
    },
    porFuncionario,
    cigamIndisponivel,
  };
}

/** Conveniência: usa um CigamClient já autenticado. */
export function consultarComCliente(client: CigamClient) {
  return (codigo: string) => client.buscarPedido(codigo);
}
