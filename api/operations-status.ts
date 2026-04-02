import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { authorizePrivilegedUser, getBearerToken, getOperationsStatus } from "../server/adminOperations";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ ok: false, message: "Method not allowed" });
    }

    const auth = await authorizePrivilegedUser(supabaseAdmin, getBearerToken(req.headers.authorization));
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, message: auth.error });
    }

    const payload = await getOperationsStatus(supabaseAdmin);
    return res.status(200).json(payload);
  } catch (e: any) {
    return res.status(500).json({ ok: false, message: e?.message || "Unexpected error" });
  }
}

