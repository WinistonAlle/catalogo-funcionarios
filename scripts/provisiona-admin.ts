/**
 * Dá conta de admin de verdade a quem virou privilegiado pela planilha.
 *
 * O PROBLEMA: quem entra por CPF ganha sessão ANÔNIMA (signInAnonymously).
 * Quando essa pessoa vira admin, ela fica presa: a sessão anônima expira e o
 * login de admin exige senha, que a conta anônima nunca teve. Resultado: o
 * localStorage ainda diz "admin" e as telas abrem, mas toda leitura do banco
 * falha, porque não há sessão válida por baixo.
 *
 * O QUE FAZ: cria (ou rearma) a conta com e-mail interno derivado do CPF,
 * marca must_change_password e aponta employees.user_id para ela. Depois disso
 * a pessoa digita o CPF e cai em "Crie sua senha", como Eva e Mateus fizeram.
 *
 *   npx tsx scripts/provisiona-admin.ts                 # simulação
 *   PROV_EXEC=1 npx tsx scripts/provisiona-admin.ts     # aplica
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const EXEC = process.env.PROV_EXEC === "1";
const CPFS = (process.env.PROV_CPFS || "08810440161,71132432154").split(",").map((c) => c.trim());

async function main() {
  for (const cpf of CPFS) {
    const email = `${cpf}@interno.gostinhomineiro.com`;
    const { data: emp } = await sb
      .from("employees")
      .select("id, full_name, role, user_id")
      .eq("cpf", cpf)
      .maybeSingle();

    if (!emp) { console.log(`\n${cpf}: employee não encontrado`); continue; }
    if (!["admin", "rh"].includes(String(emp.role).toLowerCase())) {
      console.log(`\n${emp.full_name}: papel é "${emp.role}" — só admin/RH precisa de senha. Pulando.`);
      continue;
    }

    const atual = emp.user_id ? (await sb.auth.admin.getUserById(emp.user_id)).data?.user : null;
    console.log(`\n== ${emp.full_name} (${cpf}) — papel ${emp.role}`);
    console.log(`   conta hoje: ${atual ? (atual.is_anonymous ? "ANÔNIMA (é o problema)" : atual.email) : "(sem conta)"}`);

    const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existente = (lista?.users ?? []).find((u) => u.email === email);

    if (!EXEC) {
      console.log(`   [simulação] ${existente ? "rearmaria a conta existente" : "criaria " + email} e apontaria o user_id`);
      continue;
    }

    let uid = existente?.id;
    if (!uid) {
      const { data: novo, error } = await sb.auth.admin.createUser({
        email,
        password: randomBytes(36).toString("base64url").slice(0, 48), // descartável de propósito
        email_confirm: true,
        user_metadata: { must_change_password: true },
      });
      if (error) { console.log("   ERRO ao criar conta:", error.message); continue; }
      uid = novo.user.id;
      console.log("   conta criada:", email);
    } else {
      await sb.auth.admin.updateUserById(uid, {
        password: randomBytes(36).toString("base64url").slice(0, 48),
        user_metadata: { must_change_password: true },
      });
      console.log("   conta existente rearmada para primeiro acesso");
    }

    const { error: upErr } = await sb.from("employees").update({ user_id: uid }).eq("cpf", cpf);
    console.log(upErr ? `   ERRO ao apontar user_id: ${upErr.message}` : "   pronto: employees.user_id aponta para a conta nova");
  }
  console.log(EXEC ? "\nFeito. Cada um digita o CPF e cria a própria senha." : "\nSimulação. Rode com PROV_EXEC=1 para aplicar.");
}

main().catch((e) => { console.error("Falhou:", e?.message ?? e); process.exit(1); });
