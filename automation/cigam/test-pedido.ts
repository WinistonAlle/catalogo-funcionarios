/**
 * Cria UM pedido de teste no CIGAM para validação visual e depois consulta o
 * resultado. Uso: npx tsx automation/cigam/test-pedido.ts
 */
import dotenv from "dotenv";
dotenv.config();

import { CigamClient } from "./client";

const CODIGO_PEDIDO_TESTE = "TESTE1";

async function main() {
  const client = new CigamClient();

  console.log(`🧪 Criando pedido de teste ${CODIGO_PEDIDO_TESTE} no CIGAM...`);

  const resultado = await client.criarPedidoCompleto(
    {
      codigo: CODIGO_PEDIDO_TESTE,
      observacao: "*** PEDIDO DE TESTE - INTEGRACAO CATALOGO FUNCIONARIOS - PODE EXCLUIR ***",
      dataPedido: new Date().toISOString().slice(0, 10),
      ...(process.env.CIGAM_TIPO_NOTA ? { tipoNota: process.env.CIGAM_TIPO_NOTA } : {}),
    },
    [
      {
        codigoMaterial: "2004000007", // Chipa – Pacote 1kg
        quantidade: 1,
        precoUnitario: 15.25,
      },
    ]
  );

  console.log("✅ Resultado:", resultado);

  console.log("🔎 Conferindo no CIGAM...");
  const pedido = await client.buscarPedido(CODIGO_PEDIDO_TESTE);
  console.log(JSON.stringify(pedido, null, 2).slice(0, 3000));

  const itens = await client.buscarItensPedido(CODIGO_PEDIDO_TESTE);
  console.log("Itens:", JSON.stringify(itens, null, 2).slice(0, 2000));
}

main().catch((err) => {
  console.error("❌ Falha no pedido de teste:", err?.message ?? err);
  if (err?.cigamMessages?.length) console.error("Mensagens CIGAM:", err.cigamMessages);
  process.exit(1);
});
