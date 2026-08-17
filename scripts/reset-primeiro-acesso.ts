/**
 * Invalida a senha padrão das contas de admin/RH — 17/08/2026
 *
 * Acabou a senha compartilhada `12345678`. Este script troca a senha de cada
 * conta privilegiada que ainda não fez o primeiro acesso por uma aleatória de
 * 48 caracteres que **ninguém anota** — o objetivo não é distribuir essa senha,
 * é fazer a antiga parar de funcionar. Quem entra depois disso passa pelo
 * fluxo de primeiro acesso (`must_change_password: true`) e escolhe a própria.
 *
 * Só mexe em quem tem `must_change_password: true`. Conta que já criou senha
 * de verdade é pulada — rodar de novo não derruba ninguém.
 *
 *   npx tsx scripts/reset-primeiro-acesso.ts          # simulação
 *   RESET_EXEC=1 npx tsx scripts/reset-primeiro-acesso.ts   # aplica
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const EXEC = process.env.RESET_EXEC === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function senhaDescartavel(): string {
  return randomBytes(36).toString("base64url").slice(0, 48);
}

async function main() {
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, full_name, cpf, role, user_id")
    .in("role", ["admin", "rh"])
    .order("role")
    .order("full_name");

  if (error) throw new Error(error.message);

  console.log(
    `${EXEC ? "🔐 APLICANDO" : "🧪 SIMULAÇÃO (use RESET_EXEC=1 para aplicar)"} — ` +
      `${employees?.length ?? 0} contas privilegiadas.\n`
  );

  let trocadas = 0;
  let puladas = 0;

  for (const employee of employees ?? []) {
    const rotulo = `${employee.full_name} (${employee.role})`;

    if (!employee.user_id) {
      console.log(`⏭️  ${rotulo}: sem usuário no Auth, nada a fazer.`);
      puladas++;
      continue;
    }

    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
      employee.user_id
    );
    if (userError) {
      console.log(`❌ ${rotulo}: falha ao ler usuário — ${userError.message}`);
      puladas++;
      continue;
    }

    const metadata = (userData?.user?.user_metadata ?? {}) as Record<string, any>;
    if (metadata.must_change_password !== true) {
      console.log(`⏭️  ${rotulo}: já criou a própria senha, preservado.`);
      puladas++;
      continue;
    }

    if (!EXEC) {
      console.log(`🧪 ${rotulo}: senha padrão seria invalidada.`);
      trocadas++;
      continue;
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(employee.user_id, {
      password: senhaDescartavel(),
      user_metadata: { ...metadata, must_change_password: true },
    });

    if (updateError) {
      console.log(`❌ ${rotulo}: ${updateError.message}`);
      puladas++;
      continue;
    }

    console.log(`✅ ${rotulo}: senha padrão invalidada, primeiro acesso liberado.`);
    trocadas++;
  }

  console.log(
    `\n${EXEC ? "Aplicado" : "Simulado"}: ${trocadas} conta(s) para primeiro acesso, ` +
      `${puladas} pulada(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
