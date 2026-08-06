/**
 * Sincroniza o saldo de estoque do CIGAM para o Supabase.
 *
 * Lê os produtos com cigam_code, consulta o saldo no CIGAM (centro/unidade
 * configurados) e grava em products.stock_qty / stock_synced_at.
 *
 * Semântica do stock_qty:
 *   - número >= 0  → saldo real (0 = sem estoque, bloqueia no app)
 *   - null         → material sem linha de estoque no CIGAM = desconhecido;
 *                    o app trata como DISPONÍVEL (fail-open)
 *
 * Uso (simulação): npx tsx automation/cigam/sync-estoque.ts
 * Execução real:   STOCK_EXEC=1 npx tsx automation/cigam/sync-estoque.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CigamClient } from "./client";

type ProductRow = { id: string; cigam_code: string | null; name: string | null };

export type StockSyncResult = {
  total: number;
  gravados: number;
  comSaldo: number;
  semLinha: number;
  /** Saldo <= 0: é o que o catálogo vai bloquear com o overlay "Sem Estoque". */
  zerados: number;
  /** Nomes dos que serão bloqueados — pra conferir antes de ligar de vez. */
  nomesZerados: string[];
};

export async function syncEstoque(options: {
  supabase: SupabaseClient;
  dryRun?: boolean;
}): Promise<StockSyncResult> {
  const { supabase, dryRun = false } = options;

  const { data, error } = await supabase
    .from("products")
    .select("id, cigam_code, name")
    .not("cigam_code", "is", null);
  if (error) throw new Error(`Falha ao buscar produtos: ${error.message}`);

  const products = (data ?? []) as ProductRow[];
  const codes = products.map((p) => (p.cigam_code ?? "").trim()).filter(Boolean);
  if (codes.length === 0)
    return { total: 0, gravados: 0, comSaldo: 0, semLinha: 0, zerados: 0, nomesZerados: [] };

  const cigam = new CigamClient();
  // Disponível (físico − demanda em carteira), não físico puro — ver
  // CigamClient.buscarDisponibilidades.
  const saldos = await cigam.buscarDisponibilidades(codes, {
    onProgresso: (feitos, total) => {
      if (feitos % 25 === 0 || feitos === total) {
        process.stdout.write(`\r   consultando CIGAM: ${feitos}/${total}   `);
      }
    },
  });
  process.stdout.write("\n");

  const now = new Date().toISOString();
  let gravados = 0;
  let comSaldo = 0;
  let semLinha = 0;
  let zerados = 0;
  const nomesZerados: string[] = [];

  for (const p of products) {
    const code = (p.cigam_code ?? "").trim();
    // null = sem linha de estoque no CIGAM (desconhecido → disponível no app)
    const saldo = saldos.has(code) ? saldos.get(code)! : null;
    if (saldo === null) semLinha++;
    else {
      comSaldo++;
      if (saldo <= 0) {
        zerados++;
        nomesZerados.push(`${p.name ?? code} (${saldo})`);
      }
    }

    if (dryRun) continue;

    const { error: upErr } = await supabase
      .from("products")
      .update({ stock_qty: saldo, stock_synced_at: now })
      .eq("id", p.id);
    if (!upErr) gravados++;
  }

  return { total: products.length, gravados, comSaldo, semLinha, zerados, nomesZerados };
}

// Execução direta via CLI
if (process.argv[1]?.endsWith("sync-estoque.ts")) {
  (async () => {
    const dotenv = await import("dotenv");
    dotenv.config();

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const dryRun = process.env.STOCK_EXEC !== "1";
    console.log(dryRun ? "🧪 Modo SIMULAÇÃO (não grava)" : "🚀 Modo EXECUÇÃO REAL");

    const r = await syncEstoque({ supabase, dryRun });
    console.log(
      `📦 Estoque: ${r.total} produtos | ${r.comSaldo} com saldo | ${r.semLinha} sem linha (desconhecido)` +
        (dryRun ? "" : ` | ${r.gravados} gravados`)
    );
    console.log(`🚫 Serão bloqueados no catálogo (saldo <= 0): ${r.zerados}`);
    for (const nome of r.nomesZerados) console.log(`   - ${nome}`);
  })().catch((err) => {
    console.error("❌ Falha no sync de estoque:", err?.message ?? err);
    process.exit(1);
  });
}
