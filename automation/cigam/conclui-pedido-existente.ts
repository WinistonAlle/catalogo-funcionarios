/**
 * Conclui, sozinho, o pedido que o CIGAM já tem INTEIRO mas que ficou em ERROR
 * aqui. Correção de raiz de 24/09/2026.
 *
 * O CASO: `AbortSignal.timeout` corta a chamada do nosso lado aos 30s, mas o
 * CIGAM continua e conclui. O pedido nasce no ERP (número já salvo em
 * `erp_external_id`, itens lançados, imposto calculado) e para em controle 20,
 * porque a exceção sobe antes do passo que leva a 30. Aqui ele vira ERROR e
 * ficava assim para sempre: reenfileirar é proibido (duplicaria o pedido no
 * ERP) e o processador só varre PENDING.
 *
 * Isso já tinha sido resolvido na mão uma vez (script de 16/09), e voltou: de
 * 02/09 a 17/09 foram 8 pedidos. Agora a varredura faz sozinha o mesmo que o
 * script fazia, com as MESMAS guardas — qualquer dúvida sobre a identidade do
 * pedido PULA em vez de adivinhar, e o motivo fica em `erp_error` para gente
 * ver no painel:
 *   - o pedido existe no CIGAM;
 *   - é do cliente de funcionário (009752);
 *   - o total bate com o daqui (1 centavo de tolerância, float do CIGAM) — é
 *     isso que prova que os itens entraram inteiros;
 *   - está em controle 20 ou 30 (40 = já efetivado, só corrige a linha daqui).
 *
 * O que NÃO faz: não cria pedido, não mexe em saldo, não toca em pedido sem
 * número do CIGAM (esse é caso de reenfileirar, pelo painel).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { CigamClient, type CigamPedidoConferencia } from "./client";
import { buildItens, efetivacaoConcluiu } from "./process-pending-orders";

const CLIENTE_ESPERADO = process.env.CIGAM_CLIENTE_FUNCIONARIO ?? "009752";
const TOLERANCIA_REAIS = 0.01;

export type DecisaoConclusao =
  | { acao: "pular"; motivo: string }
  | { acao: "so-marcar" }
  | { acao: "liberar-e-efetivar" }
  | { acao: "efetivar" };

/** As guardas, sem rede — é aqui que mora a regra, e é isto que os testes cobrem. */
export function decidirConclusao(
  p: CigamPedidoConferencia | null,
  totalEsperadoCents: number,
  clienteEsperado = CLIENTE_ESPERADO
): DecisaoConclusao {
  if (!p) {
    return {
      acao: "pular",
      motivo: "Não existe mais no CIGAM (foi excluído no ERP). Reenfileirar com force pelo painel.",
    };
  }
  if (p.codigoCliente !== clienteEsperado) {
    return {
      acao: "pular",
      motivo: `No CIGAM está no cliente ${p.codigoCliente}, esperado ${clienteEsperado}. Conferir na mão.`,
    };
  }
  const esperado = totalEsperadoCents / 100;
  if (!Number.isFinite(p.totalPedido) || Math.abs(p.totalPedido - esperado) > TOLERANCIA_REAIS) {
    return {
      acao: "pular",
      motivo: `Total no CIGAM ${Number(p.totalPedido).toFixed(2)} contra ${esperado.toFixed(2)} aqui: itens incompletos ou divergentes. Conferir na mão.`,
    };
  }
  const controle = p.codigoControle ?? "";
  if (controle === "40") return { acao: "so-marcar" };
  if (controle === "20") return { acao: "liberar-e-efetivar" };
  if (controle === "30") return { acao: "efetivar" };
  return {
    acao: "pular",
    motivo: `No CIGAM está em controle ${controle || "?"} (${p.situacaoDescricao ?? p.situacao ?? "sem descrição"}). Só concluo 20 e 30.`,
  };
}

export type ResultadoConclusao = {
  orderNumber: string;
  cigamCode: string;
  status: "DONE" | "PULADO" | "FALHOU";
  motivo?: string;
};

export async function concluirPedidosComNumero(options: {
  supabase: SupabaseClient;
  exec: boolean;
  log?: (msg: string) => void;
}): Promise<ResultadoConclusao[]> {
  const { supabase, exec, log = () => {} } = options;

  const { data, error } = await supabase
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

  if (error) throw new Error(`Falha ao buscar pedidos em ERROR com número do CIGAM: ${error.message}`);
  const pedidos = (data ?? []) as any[];
  if (pedidos.length === 0) return [];

  const cigam = new CigamClient();
  await cigam.autenticar();

  const resultados: ResultadoConclusao[] = [];

  for (const o of pedidos) {
    const codigo = String(o.erp_external_id).trim();
    const etiqueta = `${o.order_number} (CIGAM ${codigo}, ${o.employee_name})`;
    const base = { orderNumber: o.order_number, cigamCode: codigo };

    try {
      const decisao = decidirConclusao(await cigam.buscarPedido(codigo), o.total_cents);

      if (decisao.acao === "pular") {
        log(`⏭️  ${etiqueta}: ${decisao.motivo}`);
        // O motivo vai para a tela, no lugar do "timeout" que não diz nada.
        if (exec && o.erp_error !== decisao.motivo) await gravarMotivo(supabase, o.id, decisao.motivo);
        resultados.push({ ...base, status: "PULADO", motivo: decisao.motivo });
        continue;
      }

      if (decisao.acao === "so-marcar") {
        log(`✅ ${etiqueta}: já está em controle 40 no CIGAM. Só corrijo o status aqui.`);
        if (exec) await marcarConcluido(supabase, o.id);
        resultados.push({ ...base, status: "DONE" });
        continue;
      }

      const itens = buildItens(o);
      log(
        `${exec ? "▶️ " : "○ "} ${etiqueta}: ${decisao.acao === "liberar-e-efetivar" ? "liberar para faturamento e efetivar" : "efetivar"} em REC.`
      );
      if (!exec) {
        resultados.push({ ...base, status: "DONE", motivo: "simulação" });
        continue;
      }

      if (decisao.acao === "liberar-e-efetivar") await cigam.liberarPedidoParaFaturamento(codigo);

      const resultado = await cigam.efetivarPedido(
        codigo,
        // Mesma ordem 1..N do lançamento original (criarPedidoCompleto).
        itens.map((item, index) => ({ sequencia: index + 1, quantidade: item.quantidade }))
      );

      // "Efetivação concluída. Erro ao enviar a nota." é SUCESSO na série REC.
      if (resultado.success || efetivacaoConcluiu(resultado.erro)) {
        await marcarConcluido(supabase, o.id, resultado.codigoNotaFiscal);
        log(`   ✅ efetivado.`);
        resultados.push({ ...base, status: "DONE" });
      } else {
        const motivo = `Pedido inteiro no CIGAM, mas a efetivação não concluiu: ${
          resultado.erro?.trim() || "o CIGAM não informou o motivo"
        }. Nova tentativa automática; se persistir, concluir no Desktop.`;
        log(`   ⚠️  ${motivo}`);
        await gravarMotivo(supabase, o.id, motivo);
        resultados.push({ ...base, status: "FALHOU", motivo });
      }
    } catch (err: any) {
      // Timeout de novo, sessão, rede: o pedido continua no CIGAM sem duplicar,
      // e a próxima rodada tenta de novo.
      const motivo = String(err?.message ?? err).slice(0, 300);
      log(`   ❌ ${etiqueta}: ${motivo}`);
      resultados.push({ ...base, status: "FALHOU", motivo });
    }
  }

  return resultados;
}

async function gravarMotivo(supabase: SupabaseClient, id: string, motivo: string) {
  await supabase.from("orders").update({ erp_error: motivo }).eq("id", id).eq("erp_status", "ERROR");
}

async function marcarConcluido(supabase: SupabaseClient, id: string, notaFiscal?: string) {
  const { error } = await supabase
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
