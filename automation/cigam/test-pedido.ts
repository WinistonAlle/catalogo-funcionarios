/**
 * Cria UM pedido de teste no CIGAM (via API REST) para validação visual.
 * O CIGAM gera o número do pedido — confira na tela e exclua depois.
 * Uso: npx tsx automation/cigam/test-pedido.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { CigamClient } from "./client";

async function main() {
  const client = new CigamClient();

  console.log("🔐 Logando no portal do representante...");
  await client.autenticar();
  console.log("✅ Sessão criada.");

  console.log("🧪 Criando pedido de teste no CIGAM...");
  const { cigamOrderId, itensEnviados, liberadoParaFaturamento } = await client.criarPedidoCompleto(
    {
      codigo: "TESTE-LOCAL",
      observacao: "*** PEDIDO DE TESTE - INTEGRACAO CATALOGO FUNCIONARIOS - PODE EXCLUIR ***",
      dataPedido: new Date().toISOString().slice(0, 10),
    },
    [
      {
        codigoMaterial: "002003000009", // SALG FESTA KIBE TRADICIONAL PCT 50 UNID
        quantidade: 1,
        precoUnitario: 20.15,
        unidadeMedida: "PCT",
      },
    ]
  );

  console.log(`\n✅ Pedido criado no CIGAM: ${cigamOrderId} (${itensEnviados} item(ns)).`);
  console.log(
    liberadoParaFaturamento
      ? "   Controle: 30 (Liberado para Faturamento)."
      : "   ⚠️  Controle segue em 20 — não foi liberado para faturamento automaticamente."
  );
  console.log("   Confira na tela do portal: Tipo Operação e os totais devem estar preenchidos");
  console.log("   (é o que o CalcularImposto faz). Depois exclua o pedido de teste.");
}

main().catch((err) => {
  console.error("❌ Falha no pedido de teste:", err?.message ?? err);
  process.exit(1);
});
