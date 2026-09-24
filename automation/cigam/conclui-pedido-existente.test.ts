import { describe, expect, it } from "vitest";
import { decidirConclusao } from "./conclui-pedido-existente";
import { ehFalhaDeLogin } from "./process-pending-orders";
import type { CigamPedidoConferencia } from "./client";

/**
 * As guardas da conclusão automática (24/09/2026). Ela escreve no ERP sem
 * ninguém olhando, então a regra é: qualquer dúvida sobre a identidade do
 * pedido PULA. Os números são de um caso real: GM-20260915-3441, CIGAM 020604,
 * R$ 125,85, preso em controle 20 por timeout.
 */
function pedido(over: Partial<CigamPedidoConferencia> = {}): CigamPedidoConferencia {
  return {
    codigo: "020604",
    dataPedido: "2026-09-15",
    situacao: "A",
    situacaoDescricao: "Pendente",
    codigoControle: "20",
    codigoCliente: "009752",
    totalPedido: 125.85,
    ...over,
  };
}

describe("decidirConclusao", () => {
  it("controle 20 com tudo batendo: libera e efetiva", () => {
    expect(decidirConclusao(pedido(), 12585, "009752")).toEqual({ acao: "liberar-e-efetivar" });
  });

  it("controle 30: só efetiva (já foi liberado)", () => {
    expect(decidirConclusao(pedido({ codigoControle: "30" }), 12585, "009752")).toEqual({ acao: "efetivar" });
  });

  it("controle 40: não escreve nada no ERP, só corrige a linha daqui", () => {
    expect(decidirConclusao(pedido({ codigoControle: "40" }), 12585, "009752")).toEqual({ acao: "so-marcar" });
  });

  it("tolera o float do CIGAM dentro de 1 centavo", () => {
    expect(decidirConclusao(pedido({ totalPedido: 125.8500001 }), 12585, "009752").acao).toBe("liberar-e-efetivar");
    expect(decidirConclusao(pedido({ totalPedido: 125.84 }), 12585, "009752").acao).toBe("liberar-e-efetivar");
  });

  it("PULA quando o total diverge: é o sinal de item faltando", () => {
    const d = decidirConclusao(pedido({ totalPedido: 89.1 }), 12585, "009752");
    expect(d.acao).toBe("pular");
  });

  it("PULA pedido de outro cliente: não é pedido de funcionário", () => {
    expect(decidirConclusao(pedido({ codigoCliente: "000005" }), 12585, "009752").acao).toBe("pular");
  });

  it("PULA pedido que sumiu do CIGAM: é caso de reenfileirar, não de concluir", () => {
    expect(decidirConclusao(null, 12585, "009752").acao).toBe("pular");
  });

  it("PULA controle fora de 20/30/40 (ex.: cancelado)", () => {
    expect(decidirConclusao(pedido({ codigoControle: "90" }), 12585, "009752").acao).toBe("pular");
    expect(decidirConclusao(pedido({ codigoControle: null }), 12585, "009752").acao).toBe("pular");
  });

  it("PULA total que não é número", () => {
    expect(decidirConclusao(pedido({ totalPedido: Number.NaN }), 12585, "009752").acao).toBe("pular");
  });
});

/**
 * Falha de login antes de o pedido ganhar número deixa o pedido na fila em vez
 * de prender em ERROR. Timeout NÃO pode casar aqui: nele o CIGAM pode ter
 * criado o pedido sem devolver o número, e tentar de novo duplicaria.
 */
describe("ehFalhaDeLogin", () => {
  it("reconhece a mensagem real de 02/09/2026", () => {
    expect(ehFalhaDeLogin("Login no portal falhou (CGPortal_Token não retornado). Confira usuário/senha.")).toBe(true);
  });

  it("reconhece sessão derrubada e CSRF ausente", () => {
    expect(ehFalhaDeLogin("Sessão CIGAM expirada (usuário não autenticado).")).toBe(true);
    expect(ehFalhaDeLogin("CSRF não encontrado na página de login do portal.")).toBe(true);
  });

  it("NÃO trata timeout como falha de login", () => {
    expect(ehFalhaDeLogin("The operation was aborted due to timeout")).toBe(false);
  });

  it("NÃO trata produto sem código como falha de login", () => {
    expect(ehFalhaDeLogin("Produto sem código CIGAM: Alho Em Creme com Cebola OMG Pote – 200g")).toBe(false);
    expect(ehFalhaDeLogin(undefined)).toBe(false);
  });
});
