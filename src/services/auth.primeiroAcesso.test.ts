import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { createFirstPassword } from "./auth";

const sessao = { role: "admin" } as any;
const CPF = "529.982.247-25";

function respostaDoServidor(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => vi.unstubAllGlobals());

/**
 * O segundo envio da tela de criar senha voltava "Este acesso já tem senha"
 * para quem tinha acabado de criar a senha no primeiro (JOAO VITOR, 28/09).
 */
describe("createFirstPassword", () => {
  it("cria a senha e entra", async () => {
    respostaDoServidor(200, { ok: true });
    const login = vi.fn(async () => sessao);
    await expect(createFirstPassword(CPF, "senha-nova-1", login)).resolves.toBe(sessao);
    expect(login).toHaveBeenCalledWith("52998224725", "senha-nova-1");
  });

  it("já tem senha e a digitada abre a conta: entra, sem erro", async () => {
    respostaDoServidor(409, { ok: false, error: "Este acesso já tem senha. Entre com a sua senha." });
    const login = vi.fn(async () => sessao);
    await expect(createFirstPassword(CPF, "senha-nova-1", login)).resolves.toBe(sessao);
  });

  it("já tem senha e a digitada NÃO abre a conta: mensagem de sempre", async () => {
    respostaDoServidor(409, { ok: false, error: "Este acesso já tem senha. Entre com a sua senha." });
    const login = vi.fn(async () => {
      throw new Error("Senha incorreta.");
    });
    await expect(createFirstPassword(CPF, "outra-senha-9", login)).rejects.toThrow(
      "Este acesso já tem senha. Entre com a sua senha."
    );
  });

  it("outro erro do servidor continua sendo erro, sem tentar entrar", async () => {
    respostaDoServidor(500, { ok: false, error: "falhou" });
    const login = vi.fn(async () => sessao);
    await expect(createFirstPassword(CPF, "senha-nova-1", login)).rejects.toThrow("falhou");
    expect(login).not.toHaveBeenCalled();
  });
});
