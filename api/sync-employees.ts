import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import path from "path";
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

type ChildOutput = {
  stdout: string;
  stderr: string;
};

function appendLimited(current: string, chunk: Buffer, maxLength: number) {
  const next = current + chunk.toString();
  return next.length > maxLength ? next.slice(next.length - maxLength) : next;
}

function runEmployeeSyncScript(): Promise<ChildOutput> {
  return new Promise((resolve, reject) => {
    const projectRoot = process.cwd();
    const scriptPath = path.resolve(projectRoot, "scripts", "syncEmployeesFromSheet.mjs");
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const maxOutput = 10 * 1024 * 1024;

    child.stdout.on("data", (chunk) => {
      stdout = appendLimited(stdout, chunk, maxOutput);
    });

    child.stderr.on("data", (chunk) => {
      stderr = appendLimited(stderr, chunk, maxOutput);
    });

    child.on("error", (error: any) => {
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error: any = new Error(`Employee sync failed with exit code ${code}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

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

    try {
      const { stdout, stderr } = await runEmployeeSyncScript();

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
    } catch (error: any) {
      const stdout = String(error?.stdout || "");
      const stderr = String(error?.stderr || "");

      await updateOperationLog(supabaseAdmin, runningLog?.id, {
        status: "failed",
        message: "Falha na sincronização manual de funcionários.",
        metadata: {
          code: error?.code ?? null,
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 2000),
        },
      }).catch(() => null);

      return res.status(500).json({
        ok: false,
        error: "Sync failed",
        stdout: stdout.slice(0, 8000),
        stderr: stderr.slice(0, 8000),
        code: error?.code ?? null,
      });
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Unexpected error" });
  }
}
