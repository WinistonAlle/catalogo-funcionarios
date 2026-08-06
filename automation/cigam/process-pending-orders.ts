/**
 * Processador de pedidos pendentes → CIGAM.
 *
 * Busca pedidos pagos com erp_status = PENDING, monta o pedido no formato do
 * CIGAM (convertendo quantidade conforme a unidade do material) e lança via
 * API. Grava o resultado em erp_status / erp_external_id / erp_error.
 *
 * Conversão de quantidade (products.cigam_unit, vinda do cadastro do CIGAM):
 * - KG:          quantidade = pacotes × peso do pacote; preço = R$/kg
 * - PCT/CX/UN:   quantidade = nº de pacotes;            preço = preço do pacote
 * O total lançado sempre bate com o subtotal cobrado do funcionário.
 *
 * Uso direto (simulação): npx tsx automation/cigam/process-pending-orders.ts
 * Execução real:          CIGAM_EXEC=1 npx tsx automation/cigam/process-pending-orders.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CigamClient } from "./client";

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

export type ProcessResult = {
  orderId: string;
  orderNumber: string;
  status: "DONE" | "ERROR" | "DRY_RUN";
  cigamCode?: string;
  error?: string;
  payload?: unknown;
};

function buildObservacao(order: OrderRow): string {
  const nome = (order.employee_name ?? "FUNCIONARIO NAO IDENTIFICADO").toUpperCase();
  return `${nome} - PEDIDO ${order.order_number}`.slice(0, 251);
}

function buildItens(order: OrderRow) {
  const centroArmazenagem = process.env.CIGAM_CENTRO_ARMAZENAGEM ?? "001";

  return order.order_items.map((item) => {
    const produto = item.products;
    if (!produto?.cigam_code) {
      throw new Error(`Produto sem código CIGAM: ${item.product_name}`);
    }

    const unidade = (produto.cigam_unit ?? "UN").trim().toUpperCase();
    const peso = Number(produto.weight) > 0 ? Number(produto.weight) : 1;
    const porKg = unidade === "KG";

    return {
      codigoMaterial: produto.cigam_code,
      quantidade: porKg ? item.quantity * peso : item.quantity,
      precoUnitario: porKg
        ? Math.round((item.unit_price / peso) * 100) / 100
        : item.unit_price,
      unidadeMedida: unidade,
      codigoCentroArmazenagem: centroArmazenagem,
    };
  });
}

export async function processPendingOrders(options: {
  supabase: SupabaseClient;
  limit?: number;
  dryRun?: boolean;
}): Promise<ProcessResult[]> {
  const { supabase, limit = 10, dryRun = true } = options;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, employee_name, erp_external_id, order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .eq("erp_status", "PENDING")
    .is("cancelled_at", null)
    .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Falha ao buscar pedidos pendentes: ${error.message}`);

  const rows = (orders ?? []) as unknown as OrderRow[];
  if (rows.length === 0) return [];

  const cigam = new CigamClient();
  const results: ProcessResult[] = [];

  for (const order of rows) {
    try {
      const itens = buildItens(order);
      const pedido = {
        codigo: order.order_number, // referência nossa; o portal gera o número real
        observacao: buildObservacao(order),
        dataPedido: new Date().toISOString().slice(0, 10),
        ...(process.env.CIGAM_CONDICAO_PAGAMENTO
          ? { codigoCondicaoPagamento: process.env.CIGAM_CONDICAO_PAGAMENTO }
          : {}),
        ...(process.env.CIGAM_TABELA_PRECO
          ? { tabelaPreco: process.env.CIGAM_TABELA_PRECO }
          : {}),
        ...(process.env.CIGAM_TIPO_NOTA ? { tipoNota: process.env.CIGAM_TIPO_NOTA } : {}),
      };

      if (dryRun) {
        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          status: "DRY_RUN",
          payload: { pedido, itens },
        });
        continue;
      }

      // Anti-duplicata: o portal gera um número novo a cada criação. Se este
      // pedido já tem erp_external_id, um cabeçalho já foi criado no CIGAM numa
      // tentativa anterior (que falhou antes de concluir os itens). NÃO recriar —
      // sinaliza para revisão manual, senão duplicaria o pedido.
      if (order.erp_external_id) {
        const message = `Cabeçalho já existe no CIGAM (${order.erp_external_id}) de tentativa anterior; itens podem estar incompletos. Conferir/completar na tela antes de reprocessar.`;
        await supabase
          .from("orders")
          .update({ erp_status: "ERROR", erp_error: message })
          .eq("id", order.id)
          .then(() => undefined, () => undefined);
        results.push({ orderId: order.id, orderNumber: order.order_number, status: "ERROR", error: message });
        continue;
      }

      const { cigamOrderId } = await cigam.criarPedidoCompleto(
        pedido,
        itens,
        // Persiste o número do CIGAM ANTES de lançar os itens: se cair no meio, a
        // próxima varredura enxerga o erp_external_id e não cria pedido duplicado.
        async (id) => {
          await supabase.from("orders").update({ erp_external_id: id }).eq("id", order.id);
        }
      );

      await supabase
        .from("orders")
        .update({
          erp_status: "DONE",
          erp_error: null,
          erp_external_id: cigamOrderId,
          erp_synced_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: "DONE",
        cigamCode: cigamOrderId,
      });
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 500);

      if (!dryRun) {
        await supabase
          .from("orders")
          .update({ erp_status: "ERROR", erp_error: message })
          .eq("id", order.id)
          .then(() => undefined, () => undefined);
      }

      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: "ERROR",
        error: message,
      });
    }
  }

  return results;
}

// Execução direta via CLI
if (process.argv[1]?.endsWith("process-pending-orders.ts")) {
  (async () => {
    const dotenv = await import("dotenv");
    dotenv.config();

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const dryRun = process.env.CIGAM_EXEC !== "1";
    console.log(dryRun ? "🧪 Modo SIMULAÇÃO (nada será enviado/gravado)" : "🚀 Modo EXECUÇÃO REAL");

    const results = await processPendingOrders({ supabase, dryRun });
    if (results.length === 0) {
      console.log("👌 Nenhum pedido pendente para processar.");
      return;
    }

    for (const r of results) {
      console.log(`\n===== ${r.orderNumber} → ${r.status}${r.cigamCode ? ` (CIGAM ${r.cigamCode})` : ""}`);
      if (r.error) console.log("   erro:", r.error);
      if (r.payload) console.log(JSON.stringify(r.payload, null, 2));
    }
  })().catch((err) => {
    console.error("❌ Falha no processamento:", err?.message ?? err);
    process.exit(1);
  });
}
