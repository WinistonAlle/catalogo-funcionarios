/**
 * Conclui os pedidos que o CIGAM já tem INTEIROS, mas que ficaram em ERROR aqui.
 *
 * O CASO (16/09/2026): sete pedidos de 02/09 a 15/09 gravaram
 * `erp_error = "The operation was aborted due to timeout"`. O nome engana: o
 * pedido NÃO se perdeu. `AbortSignal.timeout` (30s, TIMEOUT_PADRAO_MS) corta do
 * lado do cliente, mas o CIGAM continua processando e conclui. Conferido ao vivo
 * com `buscarPedido`: os sete existem, no cliente 009752, com o total batendo ao
 * centavo — prova de que os itens entraram E o CalcularImposto rodou, porque sem
 * ele os totais ficariam zerados. Todos pararam em controle 20 (Pendente),
 * porque a exceção subiu antes do passo que leva a 30.
 *
 * POR QUE NÃO É CASO DE REENFILEIRAR: o painel de integração recusa com 409
 * qualquer pedido que já tenha `erp_external_id`, e está certo — reenviar criaria
 * um SEGUNDO pedido no CIGAM para a mesma compra. O que falta nestes sete não é
 * criar, é terminar: liberar para faturamento (30) e efetivar em REC (40).
 *
 * O QUE ESTE SCRIPT NÃO FAZ: não cria pedido, não mexe em saldo, não toca em
 * pedido sem `erp_external_id`. Os dois pedidos de 02/09 que falharam no login do
 * portal (sem número no CIGAM) não são assunto daqui — aqueles sim vão pelo
 * caminho normal do /admin/integracao.
 *
 *   npx tsx scripts/2026-09-16-conclui-pedidos-controle-20.ts       # simulação
 *   RECUP_EXEC=1 npx tsx scripts/...                                # aplica
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { CigamClient } from "../automation/cigam/client";
import { buildItens, efetivacaoConcluiu } from "../automation/cigam/process-pending-orders";

const EXEC = process.env.RECUP_EXEC === "1";
const CLIENTE_ESPERADO = process.env.CIGAM_CLIENTE_FUNCIONARIO ?? "009752";
const TOLERANCIA_REAIS = 0.01;

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, order_number, employee_name, total_cents, erp_external_id, erp_error, " +
        "order_items(product_name, quantity, unit_price, products(cigam_code, cigam_unit, weight))"
    )
    .eq("erp_status", "ERROR")
    .not("erp_external_id", "is", null)
    .neq("erp_external_id", "")
    .is("cancelled_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao buscar pedidos: ${error.message}`);
  const pedidos = (data ?? []) as any[];

  console.log(`${EXEC ? "⚠️  MODO REAL" : "🔍 SIMULAÇÃO"} — ${pedidos.length} pedido(s) em ERROR com número do CIGAM.\n`);
  if (pedidos.length === 0) return;

  const cigam = new CigamClient();
  await cigam.autenticar();

  let concluidos = 0;
  let jaEstavamEm40 = 0;
  let pulados = 0;

  for (const o of pedidos) {
    const codigo = String(o.erp_external_id).trim();
    const esperado = o.total_cents / 100;
    const etiqueta = `${o.order_number} (CIGAM ${codigo}, ${o.employee_name})`;

    // --- Guardas. Qualquer dúvida sobre identidade do pedido PULA, não adivinha.
    const p = await cigam.buscarPedido(codigo);
    if (!p) {
      console.log(`⏭️  ${etiqueta}: não existe mais no CIGAM. Foi excluído no ERP — este é o caso de reenfileirar com force, não daqui.`);
      pulados++;
      continue;
    }
    if (p.codigoCliente !== CLIENTE_ESPERADO) {
      console.log(`⏭️  ${etiqueta}: cliente ${p.codigoCliente}, esperado ${CLIENTE_ESPERADO}. Não é pedido de funcionário — não mexo.`);
      pulados++;
      continue;
    }
    if (Math.abs(p.totalPedido - esperado) > TOLERANCIA_REAIS) {
      console.log(`⏭️  ${etiqueta}: total no CIGAM ${p.totalPedido.toFixed(2)} contra ${esperado.toFixed(2)} aqui. Diverge — precisa de gente.`);
      pulados++;
      continue;
    }

    const controle = p.codigoControle ?? "";

    // Já efetivado: nada a fazer no ERP, só a linha daqui está velha.
    if (controle === "40") {
      console.log(`✅ ${etiqueta}: já está em controle 40 no CIGAM. Só corrijo o status aqui.`);
      if (EXEC) await marcarConcluido(o.id);
      jaEstavamEm40++;
      continue;
    }

    if (controle !== "20" && controle !== "30") {
      console.log(`⏭️  ${etiqueta}: controle ${controle} (${p.situacaoDescricao ?? p.situacao}). Só trato 20 e 30.`);
      pulados++;
      continue;
    }

    const itens = buildItens(o);
    console.log(
      `${EXEC ? "▶️ " : "○ "} ${etiqueta}: controle ${controle}, total ${p.totalPedido.toFixed(2)}, ${itens.length} item(ns). ` +
        `${controle === "20" ? "Liberar para faturamento e efetivar" : "Efetivar"} em REC.`
    );
    if (!EXEC) continue;

    try {
      if (controle === "20") await cigam.liberarPedidoParaFaturamento(codigo);

      const resultado = await cigam.efetivarPedido(
        codigo,
        // As sequências espelham a ordem do lançamento original (1..N), a mesma
        // que criarPedidoCompleto usou.
        itens.map((item, index) => ({ sequencia: index + 1, quantidade: item.quantidade }))
      );

      // "Efetivação concluída. Erro ao enviar a nota." é SUCESSO: série REC é
      // recibo, não NF-e, e a transmissão ao fisco não é para acontecer.
      if (resultado.success || efetivacaoConcluiu(resultado.erro)) {
        await marcarConcluido(o.id, resultado.codigoNotaFiscal);
        console.log(`   ✅ efetivado.`);
        concluidos++;
      } else {
        const motivo = resultado.erro?.trim() || "o CIGAM não informou o motivo";
        console.log(`   ⚠️  não efetivou: ${motivo}. Pedido segue inteiro no CIGAM; concluir no Desktop.`);
        pulados++;
      }
    } catch (err: any) {
      console.log(`   ❌ falhou: ${err?.message ?? err}. O pedido continua no CIGAM, sem duplicar.`);
      pulados++;
    }
  }

  console.log(
    `\nResumo: ${concluidos} efetivado(s), ${jaEstavamEm40} já estava(m) em 40, ${pulados} pulado(s).` +
      (EXEC ? "" : "\nNada foi escrito. Rode com RECUP_EXEC=1 para aplicar.")
  );
}

async function marcarConcluido(id: string, notaFiscal?: string) {
  const { error } = await sb
    .from("orders")
    .update({
      erp_status: "DONE",
      erp_synced_at: new Date().toISOString(),
      erp_error: null,
      // Em REC fica nulo, e isso é o esperado: recibo não gera documento fiscal.
      ...(notaFiscal ? { erp_nota_fiscal: notaFiscal } : {}),
    })
    .eq("id", id);
  if (error) throw new Error(`Falha ao atualizar pedido ${id}: ${error.message}`);
}

main().catch((err) => {
  console.error("❌", err?.message ?? err);
  process.exit(1);
});
