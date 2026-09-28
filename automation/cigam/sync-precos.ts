/**
 * Sincroniza o preço de funcionário do CIGAM (tabela 005) para o Supabase.
 *
 * Lê os produtos com cigam_code, busca a tabela de preço inteira de uma vez e
 * grava em products.employee_price só o que mudou.
 *
 * Semântica: `PrecoUnitario` da tabela é preço por UNIDADE DE MEDIDA (R$/kg em
 * material KG), a mesma de `employee_price` — ver src/lib/pricing.ts. A
 * auditoria de 06/08/2026 bateu 169 de 172 centavo a centavo com essa leitura
 * direta, sem conversão nenhuma. Não multiplicar pelo peso aqui.
 *
 * O que NÃO é gravado (só aparece no log):
 *   - material sem preço na tabela → mantém o preço atual (nunca zera);
 *   - preço <= 0 vindo do CIGAM → cadastro incompleto lá, não preço de verdade;
 *   - material duplicado na tabela com preços diferentes → não escolhe no escuro;
 *   - variação acima de SALTO_MAXIMO → provável erro de digitação no CIGAM
 *     (ex.: preço do pacote no lugar do R$/kg, que já mordeu em 06/08). Quem
 *     confirma é gente, pelo admin.
 *
 * Uso (simulação): npx tsx automation/cigam/sync-precos.ts
 * Execução real:   PRICE_EXEC=1 npx tsx automation/cigam/sync-precos.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CigamClient } from "./client";

export const TABELA_FUNCIONARIO = "005";

/** Variação máxima aceita sozinha: 50% para cima ou para baixo. */
export const SALTO_MAXIMO = 0.5;

type ProductRow = {
  id: string;
  cigam_code: string | null;
  name: string | null;
  employee_price: number | null;
};

export type DecisaoPreco =
  | { acao: "igual" }
  | { acao: "atualizar"; novo: number }
  | { acao: "sem_preco" }
  | { acao: "invalido"; cigam: number }
  | { acao: "conflito" }
  | { acao: "salto"; cigam: number };

const centavos = (v: number) => Math.round(v * 100);

export function decidirPreco(
  atual: number | null,
  cigam: number | undefined,
  conflito = false
): DecisaoPreco {
  if (conflito) return { acao: "conflito" };
  if (cigam === undefined) return { acao: "sem_preco" };
  if (!Number.isFinite(cigam) || cigam <= 0) return { acao: "invalido", cigam };

  const novo = centavos(cigam) / 100;
  const base = Number(atual ?? 0);
  if (base > 0 && centavos(base) === centavos(novo)) return { acao: "igual" };

  // Sem preço hoje não tem com o que comparar: o do CIGAM é melhor que zero.
  if (base > 0 && Math.abs(novo - base) / base > SALTO_MAXIMO) return { acao: "salto", cigam: novo };

  return { acao: "atualizar", novo };
}

export type PriceSyncResult = {
  total: number;
  iguais: number;
  /** "Nome: 10,90 → 11,50" — sempre logado, é mudança do que o funcionário paga. */
  mudancas: string[];
  gravados: number;
  semPreco: string[];
  /** Não gravados de propósito: precisam de alguém olhar. */
  alertas: string[];
};

const reais = (v: number) => v.toFixed(2).replace(".", ",");

export async function syncPrecos(options: {
  supabase: SupabaseClient;
  dryRun?: boolean;
}): Promise<PriceSyncResult> {
  const { supabase, dryRun = false } = options;

  const { data, error } = await supabase
    .from("products")
    .select("id, cigam_code, name, employee_price")
    .not("cigam_code", "is", null);
  if (error) throw new Error(`Falha ao buscar produtos: ${error.message}`);

  const products = (data ?? []) as ProductRow[];
  const result: PriceSyncResult = {
    total: products.length,
    iguais: 0,
    mudancas: [],
    gravados: 0,
    semPreco: [],
    alertas: [],
  };
  if (products.length === 0) return result;

  const conflitos = new Set<string>();
  const precos = await new CigamClient().buscarPrecosTabela(TABELA_FUNCIONARIO, { conflitos });

  // Tabela vazia é falha de leitura, não "todos os produtos perderam o preço".
  if (precos.size === 0) throw new Error(`Tabela ${TABELA_FUNCIONARIO} voltou vazia do CIGAM.`);

  for (const p of products) {
    const code = (p.cigam_code ?? "").trim();
    const nome = p.name ?? code;
    const atual = p.employee_price === null ? null : Number(p.employee_price);
    const d = decidirPreco(atual, precos.get(code), conflitos.has(code));

    switch (d.acao) {
      case "igual":
        result.iguais++;
        continue;
      case "sem_preco":
        result.semPreco.push(`${nome} (${code})`);
        continue;
      case "invalido":
        result.alertas.push(`${nome} (${code}): CIGAM diz ${d.cigam}, ignorado`);
        continue;
      case "conflito":
        result.alertas.push(`${nome} (${code}): aparece com preços diferentes na tabela ${TABELA_FUNCIONARIO}`);
        continue;
      case "salto":
        result.alertas.push(
          `${nome} (${code}): ${reais(atual ?? 0)} → ${reais(d.cigam)} no CIGAM, variação grande demais, confirmar no admin`
        );
        continue;
      case "atualizar": {
        result.mudancas.push(`${nome} (${code}): ${reais(atual ?? 0)} → ${reais(d.novo)}`);
        if (dryRun) continue;
        const { error: upErr } = await supabase
          .from("products")
          .update({ employee_price: d.novo })
          .eq("id", p.id);
        if (upErr) result.alertas.push(`${nome} (${code}): falha ao gravar, ${upErr.message}`);
        else result.gravados++;
      }
    }
  }

  return result;
}

// Execução direta via CLI
if (process.argv[1]?.endsWith("sync-precos.ts")) {
  (async () => {
    const dotenv = await import("dotenv");
    dotenv.config();

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const dryRun = process.env.PRICE_EXEC !== "1";
    console.log(dryRun ? "🧪 Modo SIMULAÇÃO (não grava)" : "🚀 Modo EXECUÇÃO REAL");

    const r = await syncPrecos({ supabase, dryRun });
    console.log(
      `💲 Preços: ${r.total} produtos | ${r.iguais} iguais ao CIGAM | ${r.mudancas.length} diferentes` +
        (dryRun ? "" : ` | ${r.gravados} gravados`) +
        ` | ${r.semPreco.length} sem preço na tabela ${TABELA_FUNCIONARIO}`
    );
    for (const m of r.mudancas) console.log(`   ${dryRun ? "mudaria" : "mudou"}: ${m}`);
    for (const s of r.semPreco) console.log(`   sem preço: ${s}`);
    for (const a of r.alertas) console.log(`   🚨 ${a}`);
  })().catch((err) => {
    console.error("❌ Falha no sync de preços:", err?.message ?? err);
    process.exit(1);
  });
}
