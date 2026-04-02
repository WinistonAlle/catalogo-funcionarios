import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import {
  authorizePrivilegedUser,
  getBearerToken,
  insertOperationLog,
  updateOperationLog,
} from "../server/adminOperations";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const auth = await authorizePrivilegedUser(supabaseAdmin, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    const runningLog = await insertOperationLog(supabaseAdmin, {
      action: "sync_employees",
      status: "running",
      actor: auth.actor,
      message: "Sincronização manual iniciada.",
    }).catch(() => null);

    // ✅ Importante: aumentar maxBuffer pra não estourar com logs do script
    exec(
      "npm run sync:employees",
      {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      async (error, stdout, stderr) => {
        if (error) {
          await updateOperationLog(supabaseAdmin, runningLog?.id, {
            status: "failed",
            message: "Falha na sincronização manual de funcionários.",
            metadata: {
              code: (error as any).code ?? null,
              stdout: (stdout || "").slice(0, 2000),
              stderr: (stderr || "").slice(0, 2000),
            },
          }).catch(() => null);

          return res.status(500).json({
            ok: false,
            error: "Sync failed",
            stdout: (stdout || "").slice(0, 8000),
            stderr: (stderr || "").slice(0, 8000),
            code: (error as any).code ?? null,
          });
        }

        await updateOperationLog(supabaseAdmin, runningLog?.id, {
          status: "success",
          message: "Sincronização de funcionários concluída com sucesso.",
          metadata: {
            stdout: (stdout || "").slice(0, 2000),
            stderr: (stderr || "").slice(0, 2000),
          },
        }).catch(() => null);

        return res.json({
          ok: true,
          message: "Sync completed",
          stdout: (stdout || "").slice(0, 8000),
          stderr: (stderr || "").slice(0, 8000),
        });
      }
    );
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Unexpected error" });
  }
}
