import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getBearerToken(req: VercelRequest) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing Bearer token" });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, error: "Invalid session" });
    }

    const { data: emp, error: empErr } = await supabaseAdmin
      .from("employees")
      .select("role, is_admin, user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (empErr) return res.status(500).json({ ok: false, error: "Failed to check role" });
    if (!emp) return res.status(403).json({ ok: false, error: "Employee not found / not linked" });

    const role = String((emp as any).role || "").toLowerCase();
    const isAdmin = Boolean((emp as any).is_admin);
    const isRh = role === "rh";

    if (!isAdmin && !isRh) {
      return res.status(403).json({ ok: false, error: "Not allowed" });
    }

    // ✅ Importante: aumentar maxBuffer pra não estourar com logs do script
    exec(
      "npm run sync:employees",
      {
        cwd: process.cwd(),
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
      (error, stdout, stderr) => {
        if (error) {
          return res.status(500).json({
            ok: false,
            error: "Sync failed",
            stdout: (stdout || "").slice(0, 8000),
            stderr: (stderr || "").slice(0, 8000),
            code: (error as any).code ?? null,
          });
        }

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
