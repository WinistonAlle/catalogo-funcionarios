import { supabase } from "@/lib/supabase";

export type ResetEmployeeBalancesResponse = {
  ok: boolean;
  message?: string;
  monthKey?: string | null;
  updatedCount?: number;
  allowedWindow?: {
    start: string;
    end: string;
  };
};

/**
 * ⚠️ Esta lista tem DUAS outras cópias que precisam casar: o mesmo tipo em
 * `server/adminOperations.ts` (usado pelo webhook) e o CHECK de
 * `admin_operation_logs.action` no banco. O CHECK recusa em silêncio o que não
 * está nele — foi assim que `print_order` ficou sendo rejeitado sem ninguém
 * ver, de 25 a 26/08/2026. Em 31/08/2026 as três estavam divergentes de novo,
 * cada uma faltando uma ação diferente: faltava `first_access` aqui e
 * `print_canhoteira` no servidor, enquanto o banco já tinha as sete.
 */
export const ADMIN_OPERATION_ACTIONS = [
  "sync_employees",
  "restore_employee_balances",
  /** Criação de senha no primeiro acesso de admin/RH (ver rota /primeiro-acesso). */
  "first_access",
  "print_portaria",
  "print_order",
  /** Folha de controle de retirada tirada avulsa, pelo modal do Admin Pedidos. */
  "print_canhoteira",
  /** Passada do vigia: `success` = tudo de pé, `failed` = achou problema. */
  "health_check",
] as const;

// Derivado da lista, e não escrito à mão ao lado dela: é o que faz o teste de
// `formatOperationAction` conseguir varrer TODAS as ações. Com o union escrito
// separado, nada obrigava os dois a andarem juntos — e não andaram.
export type AdminOperationAction = (typeof ADMIN_OPERATION_ACTIONS)[number];
export type AdminOperationStatus = "running" | "success" | "failed" | "blocked";

export type AdminOperationLog = {
  id: string;
  action: AdminOperationAction;
  status: AdminOperationStatus;
  actor_user_id?: string | null;
  actor_employee_id?: string | null;
  actor_cpf?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  target_month_key?: string | null;
  message?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

export type AdminOperationsStatusResponse = {
  ok: boolean;
  storageReady: boolean;
  currentCycleKey: string | null;
  resetWindow: {
    allowed: boolean;
    start: string;
    end: string;
  };
  canResetNow: boolean;
  syncInProgress: boolean;
  resetInProgress: boolean;
  restoredCurrentCycle: boolean;
  latestSync: AdminOperationLog | null;
  latestRestore: AdminOperationLog | null;
  recent: AdminOperationLog[];
};

export async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  return accessToken;
}

export async function requestWithAuth<T>(paths: string[], init?: RequestInit) {
  const accessToken = await getAccessToken();
  let lastErrorMessage = "";

  for (const path of paths) {
    try {
      const response = await fetch(path, {
        ...init,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init?.headers ?? {}),
        },
      });

      const responseText = await response.text().catch(() => "");
      let payload: (T & {
        ok?: boolean;
        error?: string;
        message?: string;
      }) | null = null;

      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          payload = null;
        }
      }

      if (response.ok && payload?.ok !== false) {
        return payload as T;
      }

      lastErrorMessage =
        payload?.message || payload?.error || `Falha ao executar a ação em ${path}.`;

      if (response.status !== 404) {
        break;
      }
    } catch (error: any) {
      lastErrorMessage = error?.message || `Falha de rede ao acessar ${path}.`;
    }
  }

  throw new Error(lastErrorMessage || "Não foi possível executar a ação.");
}

export async function triggerEmployeeSyncNow() {
  return requestWithAuth<any>(["/automation/sync-employees", "/api/sync-employees"], {
    method: "POST",
  });
}

export async function resetAllEmployeeBalances() {
  return requestWithAuth<ResetEmployeeBalancesResponse>(
    ["/automation/reset-employee-balances", "/api/reset-employee-balances"],
    {
      method: "POST",
    }
  );
}

export type PrintPortariaResult = {
  message: string;
  /** true quando saiu um PDF de verdade (teve pedido pendente) e o download já disparou. */
  baixou: boolean;
  /**
   * Ids dos pedidos que entraram nesta leva. Eles ainda NÃO estão marcados
   * como impressos — quem marca é `confirmPortariaPrint`, depois que alguém
   * confere que as folhas saíram. Vazio quando não teve leva.
   */
  pedidos: string[];
};

/**
 * Gera o PDF da lista da portaria e abre numa aba nova, já pronta pro
 * navegador imprimir (Ctrl+P / ícone de impressora do visualizador de PDF
 * embutido) — sem passar pela pasta de Downloads. A rota devolve o PDF direto
 * (não JSON) quando tem pedido pendente; só volta JSON pro caso "nada
 * pendente" ou erro — por isso não dá pra usar requestWithAuth aqui (ele só
 * entende JSON).
 *
 * `targetWindow` deve ser aberto de forma SÍNCRONA no clique (antes do
 * `await` do fetch) e passado pra cá — abrir a aba só depois da resposta
 * chegar cai no bloqueio de pop-up da maioria dos navegadores, porque deixa
 * de contar como reação direta a um clique.
 *
 * ⚠️ Gerar o PDF **não** tira os pedidos da lista. Quem faz isso é
 * `confirmPortariaPrint`, com os ids devolvidos aqui em `pedidos` — ver o
 * comentário de `gerarPdfPortaria` (automation/print/portariaList.ts) pra
 * história de por que os dois passos são separados.
 */
export async function printPortariaNow(
  targetWindow?: Window | null
): Promise<PrintPortariaResult> {
  const accessToken = await getAccessToken();
  const response = await fetch("/automation/print-portaria-now", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/pdf")) {
    const blob = await response.blob();
    abrirOuBaixarPdf(
      blob,
      nomeDoArquivo(response, `lista-portaria-${new Date().toISOString().slice(0, 10)}.pdf`),
      targetWindow
    );
    const pedidos = (response.headers.get("X-Portaria-Pedidos") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return {
      message: "Lista aberta numa aba nova — use o botão de imprimir do navegador.",
      baixou: true,
      pedidos,
    };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    targetWindow?.close();
    throw new Error(payload?.message || "Não foi possível gerar o PDF da lista da portaria.");
  }

  targetWindow?.close();
  return {
    message: payload?.message || "Nenhum pedido pendente pra imprimir.",
    baixou: false,
    pedidos: [],
  };
}

/**
 * Confirma que as folhas da leva saíram no papel — só aqui os pedidos ganham
 * `printed_at` e somem da lista da portaria. Chamado depois de o faturamento
 * olhar a impressora, nunca automaticamente.
 */
export async function confirmPortariaPrint(orderIds: string[]) {
  return requestWithAuth<{ ok: boolean; marcados: number; message?: string }>(
    ["/automation/print-portaria-confirm"],
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds }),
    }
  );
}

/**
 * O nome bom do arquivo é o que o servidor mandou no Content-Disposition
 * (`pedido-014711.pdf`, com o número do CIGAM). Sem isto, o fallback de
 * download salvava o UUID interno do pedido no nome, que não diz nada para
 * quem depois procura o arquivo.
 */
function nomeDoArquivo(response: Response, fallback: string): string {
  const header = response.headers.get("content-disposition") || "";
  const match = header.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return match?.[1] ? decodeURIComponent(match[1]) : fallback;
}

function abrirOuBaixarPdf(blob: Blob, filename: string, targetWindow?: Window | null): void {
  const url = URL.createObjectURL(blob);

  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = url;
  } else {
    // Sem aba pré-aberta (ou o usuário fechou antes da resposta chegar):
    // cai pra download, que sempre funciona.
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  // Só libera depois de um tempo — revogar cedo demais derruba o PDF em
  // navegadores que ainda estão carregando o blob na aba nova.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type PrintOrderResult = {
  message: string;
};

/**
 * Reimpressão/impressão avulsa de UM pedido — botão "Imprimir" por linha em
 * AdminOrders. Abre numa aba nova (mesmo padrão de printPortariaNow), sem os
 * filtros de corte/dia útil/pago do fluxo normal: é intenção explícita de
 * alguém clicando num pedido específico.
 */
export async function printOrderNow(
  orderId: string,
  targetWindow?: Window | null
): Promise<PrintOrderResult> {
  const accessToken = await getAccessToken();
  const response = await fetch(`/automation/print-order-now/${orderId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/pdf")) {
    const blob = await response.blob();
    abrirOuBaixarPdf(blob, nomeDoArquivo(response, `pedido-${orderId}.pdf`), targetWindow);
    return { message: "Pedido aberto numa aba nova — use o botão de imprimir do navegador." };
  }

  const payload = await response.json().catch(() => ({}));
  targetWindow?.close();
  throw new Error(payload?.message || "Não foi possível gerar o PDF do pedido.");
}

export type PedidoDaCanhoteira = {
  orderId: string;
  /** O número que vai sair no papel: CIGAM quando já sincronizou, interno
   *  quando ainda não. Vem pronto do servidor de propósito — se a tela
   *  escolhesse por conta, a lista e a folha poderiam discordar. */
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

/**
 * Os pedidos que o modal da canhoteira oferece pra marcar: os de um dia,
 * pagos, não cancelados e ainda NÃO ENTREGUES — pedido em separação é
 * justamente quem vai retirar e precisa da linha pra assinar; entregue já
 * assinou.
 *
 * `dia` no formato YYYY-MM-DD (fuso de São Paulo). Sem ele, o dia corrente.
 */
export async function listarPedidosDaCanhoteira(dia?: string) {
  const params = new URLSearchParams();
  if (dia) params.set("dia", dia);
  const query = params.toString();

  return requestWithAuth<{ ok: boolean; dia: string; pedidos: PedidoDaCanhoteira[] }>([
    `/automation/canhoteira/pedidos${query ? `?${query}` : ""}`,
  ]);
}

/**
 * Abre a folha de controle de retirada com os pedidos marcados, numa aba nova
 * (mesmo padrão e mesma armadilha de pop-up de `printPortariaNow`: a aba tem
 * que ser aberta no clique, antes do await).
 *
 * ⚠️ Não muda o estado de pedido nenhum, e é assim de propósito: a canhoteira
 * é papel de conferência. Quem mexe em `printed_at` é só a leva de separação,
 * com o passo de confirmação. Tirar a folha duas vezes custa uma folha.
 */
export async function printCanhoteira(
  orderIds: string[],
  dia: string | undefined,
  targetWindow?: Window | null
): Promise<{ message: string }> {
  const accessToken = await getAccessToken();
  const response = await fetch("/automation/canhoteira/pdf", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderIds, dia }),
  });

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/pdf")) {
    const blob = await response.blob();
    abrirOuBaixarPdf(
      blob,
      nomeDoArquivo(response, `canhoteira-${dia ?? new Date().toISOString().slice(0, 10)}.pdf`),
      targetWindow
    );
    return { message: "Canhoteira aberta numa aba nova — use o botão de imprimir do navegador." };
  }

  const payload = await response.json().catch(() => ({}));
  targetWindow?.close();
  throw new Error(payload?.message || "Não foi possível gerar a canhoteira.");
}

export async function getAdminOperationsStatus() {
  return requestWithAuth<AdminOperationsStatusResponse>(
    ["/automation/operations/status", "/api/operations-status"],
    {
      method: "GET",
    }
  );
}

export async function listAdminOperationHistory(opts?: {
  limit?: number;
  action?: AdminOperationAction | "all";
}) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.action) params.set("action", opts.action);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestWithAuth<{ ok: boolean; storageReady: boolean; rows: AdminOperationLog[] }>(
    [`/automation/operations/history${suffix}`, `/api/operations-history${suffix}`],
    {
      method: "GET",
    }
  );
}

/* ===================== Relatório de abatimentos ===================== */

export type MotivoPendencia =
  | "nao_impresso"
  | "sem_recibo"
  | "ausente_no_cigam"
  | "nao_efetivado"
  | "cliente_diferente"
  | "valor_divergente"
  | "erro_na_consulta";

export type LinhaRelatorioAbatimento = {
  orderNumber: string;
  employeeName: string;
  employeeCpf: string;
  criadoEm: string;
  valorCents: number;
  recibo: string | null;
  impressoEm: string | null;
  valorNoCigamCents: number | null;
  motivos: MotivoPendencia[];
  detalhe: string | null;
};

export type RelatorioAbatimentos = {
  inicio: string;
  fim: string;
  geradoEm: string;
  abater: LinhaRelatorioAbatimento[];
  conferir: LinhaRelatorioAbatimento[];
  totais: {
    abaterCents: number;
    conferirCents: number;
    pedidosAbater: number;
    pedidosConferir: number;
    funcionarios: number;
  };
  porFuncionario: Array<{
    employeeName: string;
    employeeCpf: string;
    pedidos: number;
    totalCents: number;
  }>;
  cigamIndisponivel: boolean;
};

/**
 * Puxa o relatório da semana. Sem datas, o servidor usa a semana de sábado a
 * sexta corrente.
 *
 * ⚠️ Demora: cada pedido com recibo vira uma consulta ao CIGAM. Com o volume
 * real são poucos segundos, mas a tela precisa mostrar que está trabalhando.
 */
export async function gerarRelatorioAbatimentos(opts?: { inicio?: string; fim?: string }) {
  const params = new URLSearchParams();
  if (opts?.inicio) params.set("inicio", opts.inicio);
  if (opts?.fim) params.set("fim", opts.fim);

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return requestWithAuth<{ ok: boolean; relatorio: RelatorioAbatimentos }>(
    [`/automation/relatorio-abatimentos${suffix}`, `/api/relatorio-abatimentos${suffix}`],
    { method: "GET" }
  );
}

export const ROTULO_MOTIVO: Record<MotivoPendencia, string> = {
  nao_impresso: "Não impresso na portaria",
  sem_recibo: "Sem recibo no CIGAM",
  ausente_no_cigam: "Recibo não existe no CIGAM",
  nao_efetivado: "Não efetivado (sem documento)",
  cliente_diferente: "Recibo é de outro cliente",
  valor_divergente: "Valor diferente do CIGAM",
  erro_na_consulta: "Não deu para consultar o CIGAM",
};

/**
 * Rótulo de cada ação na tela de histórico. Precisa cobrir as SETE do tipo:
 * o que cai no `return` genérico aparece para o admin como "Operação", sem
 * dizer o que foi. Até 31/08/2026 faltavam duas — `first_access` e
 * `print_canhoteira` —, e a primeira é justamente a que o CLAUDE.md manda
 * auditar (quem criou senha, de qual IP).
 */
export function formatOperationAction(action?: AdminOperationAction | null) {
  if (action === "sync_employees") return "Sincronização de funcionários";
  if (action === "restore_employee_balances") return "Restauração de saldo";
  if (action === "first_access") return "Primeiro acesso (criação de senha)";
  if (action === "print_portaria") return "Impressão da lista da portaria";
  if (action === "print_order") return "Impressão avulsa de pedido";
  if (action === "print_canhoteira") return "Impressão da folha de retirada";
  if (action === "health_check") return "Checagem de saúde";
  return "Operação";
}

export function formatOperationStatus(status?: AdminOperationStatus | null) {
  if (status === "running") return "Em andamento";
  if (status === "success") return "Concluído";
  if (status === "failed") return "Falhou";
  if (status === "blocked") return "Bloqueado";
  return "Desconhecido";
}

/* ===================== Painel de integração CIGAM ===================== */

export type PedidoIntegracao = {
  id: string;
  order_number: string;
  erp_status: string | null;
  erp_error: string | null;
  erp_external_id: string | null;
  created_at: string;
  total_cents: number | null;
  funcionario: string | null;
  /** Criado antes de 11/08/2026: nunca teve caminho para o CIGAM. */
  legado: boolean;
  /** PENDING parado além do intervalo do auto-sync — sintoma, não estado normal. */
  preso: boolean;
  /** Descartado de propósito em 06/08/2026. Não é problema. */
  descartado: boolean;
  /** Sem número do CIGAM e fora da fila: nunca será reenviado sozinho. */
  orfao: boolean;
};

export function listarPedidosIntegracao(limit = 100) {
  return requestWithAuth<{ ok: boolean; rows: PedidoIntegracao[] }>(
    [`/automation/admin/integracao/pedidos?limit=${limit}`],
    { method: "GET" }
  );
}

/**
 * Devolve o pedido para a fila do processador.
 *
 * Se o pedido já tem número do CIGAM, o servidor recusa com 409 e
 * `requerConfirmacao` — reenfileirar criaria nota fiscal duplicada. Só passe
 * `force` depois que o pedido tiver sido excluído no ERP.
 */
export function reenfileirarPedido(id: string, force = false) {
  return requestWithAuth<{ ok: boolean; order_number: string }>(
    [`/automation/admin/integracao/pedidos/${encodeURIComponent(id)}/reenfileirar`],
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    }
  );
}
