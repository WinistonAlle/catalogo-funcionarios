import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, result: { stdout: Buffer; stderr: Buffer }) => void
  ) => cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nfake postscript"), stderr: Buffer.from("") }),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ipp", () => {
  const execute = vi.fn((_op, _msg, cb) => cb(null, { statusCode: "successful-ok" }));
  return {
    default: {
      Printer: vi.fn().mockImplementation(function () { return { execute }; }),
    },
  };
});

describe("printOrderSheet", () => {
  it("converte o PDF para PostScript (cupsfilter) antes de mandar, com 1 via", async () => {
    const { printOrderSheet } = await import("./printClient.js");
    const ipp = (await import("ipp")).default as unknown as { Printer: ReturnType<typeof vi.fn> };
    const buffer = Buffer.from("%PDF-fake");

    await printOrderSheet(buffer, "10.0.0.10");

    expect(ipp.Printer).toHaveBeenCalledWith("http://10.0.0.10:631/ipp/print");

    const execute = ipp.Printer.mock.results[0].value.execute as ReturnType<typeof vi.fn>;
    const [, message] = execute.mock.calls[0];
    expect(message["operation-attributes-tag"]["document-format"]).toBe("application/postscript");
    expect(message["job-attributes-tag"].copies).toBe(1);
    expect(message.data.toString().startsWith("%!PS-Adobe-3.0")).toBe(true);
  });

  it("falha com erro legível quando a impressora recusa a conexão", async () => {
    vi.resetModules();
    vi.doMock("ipp", () => {
      const err = new Error("connect ECONNREFUSED") as NodeJS.ErrnoException;
      err.code = "ECONNREFUSED";
      const execute = vi.fn((_op: string, _msg: unknown, cb: (e: Error) => void) => cb(err));
      return { default: { Printer: vi.fn().mockImplementation(function () { return { execute }; }) } };
    });
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nok") }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));

    const { printOrderSheet } = await import("./printClient.js");
    await expect(printOrderSheet(Buffer.from("%PDF"), "10.0.0.10")).rejects.toThrow(/recusou a conexão/);
  });
});

/**
 * O núcleo da correção original (2026-08-14, no PDV): "a impressora aceitou"
 * não é "saiu papel". `Print-Job` volta `successful-ok` mesmo com o job
 * ainda `pending` — só `Get-Job-Attributes` confirma o que aconteceu de
 * verdade.
 */
describe("printOrderSheet: confirmação do que REALMENTE saiu", () => {
  function mockImpressora(estados: Array<{ "job-state": string; "job-state-reasons"?: string }>) {
    const enviados: Buffer[] = [];
    let i = 0;
    const execute = vi.fn((op: string, msg: Record<string, unknown>, cb: (e: Error | null, r: unknown) => void) => {
      if (op === "Print-Job") {
        enviados.push(msg.data as Buffer);
        setTimeout(
          () =>
            cb(null, {
              statusCode: "successful-ok",
              "job-attributes-tag": { "job-id": 77, "job-state": "pending" },
            }),
          100
        );
        return;
      }
      const estado = estados[Math.min(i++, estados.length - 1)];
      cb(null, { statusCode: "successful-ok", "job-attributes-tag": estado });
    });
    vi.doMock("ipp", () => ({ default: { Printer: vi.fn().mockImplementation(function () { return { execute }; }) } }));
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.from("%!PS-Adobe-3.0\nok") }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));
    return { execute, enviados };
  }

  it("só resolve depois de a impressora confirmar o job como concluído", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { execute } = mockImpressora([{ "job-state": "processing" }, { "job-state": "completed" }]);
    const { printOrderSheet } = await import("./printClient.js");

    let terminou = false;
    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10").then(() => {
      terminou = true;
    });

    await vi.advanceTimersByTimeAsync(1200);
    expect(terminou).toBe(false);

    await vi.advanceTimersByTimeAsync(1200);
    await p;
    expect(terminou).toBe(true);
    expect(execute.mock.calls.map((c) => c[0])).toEqual(["Print-Job", "Get-Job-Attributes", "Get-Job-Attributes"]);
    vi.useRealTimers();
  });

  it("falha com o motivo em português quando a impressora aborta o job", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "aborted", "job-state-reasons": "media-empty" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const esperado = expect(p).rejects.toThrow(/sem papel/);
    await vi.advanceTimersByTimeAsync(1500);
    await esperado;
    vi.useRealTimers();
  });

  it("falha quando o job fica preso em pending sem começar, dizendo o que conferir", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "pending", "job-state-reasons": "media-empty" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const esperado = expect(p).rejects.toThrow(/não começou a imprimir em 60s.*sem papel/s);
    await vi.advanceTimersByTimeAsync(70_000);
    await esperado;
    vi.useRealTimers();
  });

  it("NÃO acusa falha num job lento que já está imprimindo", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockImpressora([{ "job-state": "processing", "job-state-reasons": "resources-are-not-ready" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const p = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    await vi.advanceTimersByTimeAsync(70_000);
    await expect(p).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("não manda para a impressora um conversor que saiu sem erro mas sem PostScript", async () => {
    vi.resetModules();
    const execute = vi.fn();
    vi.doMock("ipp", () => ({ default: { Printer: vi.fn().mockImplementation(function () { return { execute }; }) } }));
    vi.doMock("node:child_process", () => ({
      execFile: (_c: string, _a: string[], _o: unknown, cb: (e: null, r: { stdout: Buffer }) => void) =>
        cb(null, { stdout: Buffer.alloc(0) }),
    }));
    vi.doMock("node:fs/promises", () => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    }));
    const { printOrderSheet } = await import("./printClient.js");

    await expect(printOrderSheet(Buffer.from("%PDF"), "10.0.0.10")).rejects.toThrow(/não produziu PostScript/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("enfileira envios para a MESMA impressora, sem sobrepor conexões", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    const { execute } = mockImpressora([{ "job-state": "completed" }]);
    const { printOrderSheet } = await import("./printClient.js");

    const a = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");
    const b = printOrderSheet(Buffer.from("%PDF"), "10.0.0.10");

    await vi.advanceTimersByTimeAsync(0);
    expect(execute.mock.calls.filter((c) => c[0] === "Print-Job")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([a, b]);
    expect(execute.mock.calls.filter((c) => c[0] === "Print-Job")).toHaveLength(2);
    vi.useRealTimers();
  });
});
