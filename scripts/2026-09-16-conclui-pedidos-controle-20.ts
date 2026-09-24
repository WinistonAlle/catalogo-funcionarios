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
 *
 * Desde 24/09/2026 a varredura do webhook faz isto sozinha (ver
 * automation/cigam/conclui-pedido-existente.ts, onde as guardas moram agora).
 * Este script ficou como a porta manual para o mesmo código.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { concluirPedidosComNumero } from "../automation/cigam/conclui-pedido-existente";

const EXEC = process.env.RECUP_EXEC === "1";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`${EXEC ? "⚠️  MODO REAL" : "🔍 SIMULAÇÃO"} — pedidos em ERROR com número do CIGAM.\n`);
  const r = await concluirPedidosComNumero({ supabase: sb, exec: EXEC, log: console.log });
  const n = (s: string) => r.filter((x) => x.status === s).length;
  console.log(
    `\nResumo: ${n("DONE")} concluído(s), ${n("PULADO")} pulado(s), ${n("FALHOU")} com falha.` +
      (EXEC ? "" : "\nNada foi escrito. Rode com RECUP_EXEC=1 para aplicar.")
  );
}

main().catch((err) => {
  console.error("❌", err?.message ?? err);
  process.exit(1);
});
