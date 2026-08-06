/**
 * Smoke test da conexão com o CIGAM (somente login no portal, não cria nada).
 * Uso: npm run cigam:check
 */
import dotenv from "dotenv";
dotenv.config();

import { CigamClient } from "./client";

async function main() {
  const client = new CigamClient();

  console.log("🔐 Logando no portal do representante...");
  await client.autenticar();
  console.log("✅ Login OK — sessão do portal criada (CGPortal_Token).");

  const ok = await client.verificarSessao();
  console.log(ok ? "✅ Sessão válida." : "❌ Sessão inválida.");

  console.log("\n🏁 Conexão com o CIGAM OK.");
}

main().catch((err) => {
  console.error("❌ Falha no check do CIGAM:", err?.message ?? err);
  process.exit(1);
});
