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
  /** Documento (série REC) emitido na efetivação automática, quando houve. */
  notaFiscal?: string;
  /** Pedido criado OK, mas a efetivação/emissão falhou — resolver no Desktop. */
  aviso?: string;
  error?: string;
  payload?: unknown;
};

/**
 * O CIGAM responde `success:false` mesmo quando a efetivação deu certo, se o
 * envio do documento ao fisco falhar. A resposta real (confirmada ao vivo no
 * pedido 011736, 12/08/2026) é:
 *
 *     "Efetivação concluída. Erro ao enviar a nota."
 *
 * Para o pedido de funcionário isso é o comportamento ESPERADO, não uma falha:
 * a série é REC (recibo) e **não se quer transmitir nota nenhuma** — decisão do
 * Winiston, 12/08/2026. O que importa é a primeira frase: a efetivação em si
 * concluiu e o pedido foi a controle 40.
 *
 * Por isso o casamento é pelo prefixo "Efetivação concluída" e não por "erro ao
 * enviar a nota": o que autoriza tratar como sucesso é a efetivação ter
 * concluído, não o motivo do envio ter falhado. Uma efetivação que realmente
 * falhar não traz essa frase e continua virando aviso.
 *
 * ⚠️ Não copiar esta tolerância para o PDV: lá a série é CF1/NFE e o envio ao
 * fisco é justamente o objetivo, então o mesmo erro é uma falha de verdade.
 */
export function efetivacaoConcluiu(erro: string | undefined): boolean {
  return /efetiva[çc][ãa]o\s+conclu[íi]da/i.test(erro ?? "");
}

/**
 * Efetiva o pedido (controle 40) emitindo o documento da série REC.
 *
 * Decisão do usuário 06/08/2026: a efetivação é AUTOMÁTICA. Por isso o padrão
 * aqui é LIGADO — quem quiser desligar define `CIGAM_AUTO_EFETIVAR_PEDIDO=0`.
 * O padrão é ligado de propósito: o `.env` é gitignorado e não sobe no deploy,
 * então um padrão desligado faria o servidor silenciosamente não efetivar nada
 * depois de um `git pull`, que é exatamente o oposto do que foi decidido.
 *
 * Best-effort de propósito: se a emissão falhar, o pedido em si continua criado
 * e correto no CIGAM, então ele NÃO vira ERROR — só ganha um aviso para alguém
 * concluir o faturamento no Desktop. Tratar isso como falha faria a próxima
 * varredura tentar recriar um pedido que já existe.
 */
async function efetivarSeConfigurado(
  cigam: CigamClient,
  cigamOrderId: string,
  itens: Array<{ quantidade: number }>,
  liberadoParaFaturamento: boolean
): Promise<{ notaFiscal?: string; aviso?: string }> {
  if (process.env.CIGAM_AUTO_EFETIVAR_PEDIDO === "0") return {};

  if (!liberadoParaFaturamento) {
    return {
      aviso: `Pedido ${cigamOrderId} criado, mas não foi liberado para faturamento — efetivação não tentada. Concluir no CIGAM Desktop.`,
    };
  }

  try {
    const resultado = await cigam.efetivarPedido(
      cigamOrderId,
      // As sequências espelham a ordem em que os itens foram lançados em
      // criarPedidoCompleto (1..N).
      itens.map((item, index) => ({ sequencia: index + 1, quantidade: item.quantidade }))
    );

    if (resultado.success || efetivacaoConcluiu(resultado.erro)) {
      return { notaFiscal: resultado.codigoNotaFiscal };
    }

    // O CIGAM às vezes responde `success:false` com o motivo EM BRANCO — visto
    // no pedido 011850 em 12/08/2026, onde a mensagem saiu como "falhou: .".
    //
    // Vazio NÃO é tratado como sucesso de propósito: sem a frase "Efetivação
    // concluída" não há como saber se o pedido chegou a controle 40, e assumir
    // que sim engoliria uma falha de verdade. Fica como aviso, que é o
    // comportamento seguro — o pedido em si está criado e correto no CIGAM.
    const motivo = resultado.erro?.trim() || "o CIGAM não informou o motivo";
    const documento = resultado.codigoNotaFiscal
      ? ` O CIGAM retornou o documento ${resultado.codigoNotaFiscal} — conferir se foi emitido.`
      : "";

    return {
      notaFiscal: resultado.codigoNotaFiscal,
      aviso:
        `Pedido ${cigamOrderId} criado, mas a emissão do documento falhou: ${motivo}.` +
        `${documento} Conferir a situação do pedido no CIGAM Desktop.`,
    };
  } catch (err: any) {
    return {
      aviso: `Pedido ${cigamOrderId} criado, mas a efetivação falhou: ${String(
        err?.message ?? err
      ).slice(0, 300)}. Concluir no CIGAM Desktop.`,
    };
  }
}

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
    // "Foi pago" — três sinais, de propósito.
    //
    // `wallet_debited` NÃO é escrito pelo RPC de pagamento: quem escreve é um
    // `.update()` separado no Checkout (`Checkout.tsx`), numa segunda chamada de
    // rede, cujo erro é apenas logado — o carrinho é limpo e o funcionário vê
    // sucesso de qualquer forma. Se esse update falha, o saldo JÁ foi debitado
    // pelo RPC e o pedido fica com `wallet_debited = false`.
    //
    // Isso ficou perigoso quando o pagamento na retirada saiu do sistema
    // (12/08/2026): antes, um pedido nessas condições ainda era pego pelo
    // `pay_on_pickup_cents > 0`; hoje esse valor é sempre 0, então o pedido
    // ficaria PENDING para sempre — dinheiro debitado e nada no ERP.
    //
    // `wallet_used_cents` fecha o buraco porque o RPC o grava na MESMA
    // transação em que debita o saldo do funcionário: se o saldo saiu, este
    // campo está preenchido. Os outros dois ficam por compatibilidade com os
    // pedidos antigos de pagar-na-retirada.
    .or("wallet_debited.eq.true,pay_on_pickup_cents.gt.0,wallet_used_cents.gt.0")
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

      const { cigamOrderId, liberadoParaFaturamento } = await cigam.criarPedidoCompleto(
        pedido,
        itens,
        // Persiste o número do CIGAM ANTES de lançar os itens: se cair no meio, a
        // próxima varredura enxerga o erp_external_id e não cria pedido duplicado.
        async (id) => {
          await supabase.from("orders").update({ erp_external_id: id }).eq("id", order.id);
        }
      );

      const { notaFiscal, aviso } = await efetivarSeConfigurado(
        cigam,
        cigamOrderId,
        itens,
        liberadoParaFaturamento
      );

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          erp_status: "DONE",
          // `aviso` só existe quando o pedido foi criado certo mas a emissão do
          // documento falhou — o pedido em si está válido, então não vira ERROR.
          erp_error: aviso ?? null,
          erp_external_id: cigamOrderId,
          erp_nota_fiscal: notaFiscal ?? null,
          erp_synced_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      // Este ponto é o mais perigoso do fluxo: o pedido JÁ existe no CIGAM (e
      // possivelmente já foi efetivado, com documento emitido), mas o nosso
      // banco não conseguiu registrar isso. Antes esse erro era ignorado em
      // silêncio, e o pedido ficava eternamente PENDING enquanto existia de
      // verdade no ERP — a varredura seguinte o marcaria como ERROR de
      // "cabeçalho já existe", sem ninguém saber que a nota tinha saído.
      //
      // A causa mais provável é a coluna erp_nota_fiscal não existir ainda
      // (PARTE 1 do SQL não rodada). Por isso o erro é gritado com todos os
      // dados necessários para reconciliar na mão.
      if (updateError) {
        const message =
          `Pedido ${cigamOrderId} foi criado no CIGAM` +
          (notaFiscal ? ` e o documento ${notaFiscal} foi emitido` : "") +
          `, mas NÃO foi possível gravar isso no Supabase: ${updateError.message}. ` +
          `Se a coluna erp_nota_fiscal não existe, rode a PARTE 1 de ` +
          `scripts/2026-08-06-atualizacao-banco.sql. Reconciliar o pedido ` +
          `${order.order_number} manualmente antes de reprocessar.`;
        console.error(`❌ [cigam] ${message}`);
        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          status: "ERROR",
          cigamCode: cigamOrderId,
          notaFiscal,
          error: message,
        });
        continue;
      }

      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        status: "DONE",
        cigamCode: cigamOrderId,
        notaFiscal,
        aviso,
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
      if (r.notaFiscal) console.log(`   📄 documento REC emitido: ${r.notaFiscal}`);
      if (r.aviso) console.log("   ⚠️ ", r.aviso);
      if (r.error) console.log("   erro:", r.error);
      if (r.payload) console.log(JSON.stringify(r.payload, null, 2));
    }
  })().catch((err) => {
    console.error("❌ Falha no processamento:", err?.message ?? err);
    process.exit(1);
  });
}
