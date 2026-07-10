/**
 * Smoke test da conexão com o CIGAM (somente leitura, não cria nada).
 * Uso: npm run cigam:check
 */
import dotenv from "dotenv";
dotenv.config();

import { CigamClient } from "./client";

async function main() {
  const client = new CigamClient();

  console.log("🔐 Autenticando no CIGAM...");
  await client.autenticar();
  console.log("✅ Autenticado.");

  const sessaoOk = await client.verificarSessao();
  console.log(sessaoOk ? "✅ Sessão válida." : "❌ Sessão inválida.");

  console.log("🔎 Consultando pedido de teste (inexistente, só para validar acesso)...");
  const pedido = await client.buscarPedido("CHECK0");
  console.log("✅ Módulo de pedidos acessível. Retorno:", pedido);

  console.log("\n🏁 Conexão com o CIGAM OK.");
}

main().catch((err) => {
  console.error("❌ Falha no check do CIGAM:", err?.message ?? err);
  process.exit(1);
});
