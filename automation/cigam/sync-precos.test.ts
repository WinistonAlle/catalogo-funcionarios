import { describe, expect, it } from "vitest";
import { decidirPreco } from "./sync-precos";

/**
 * `decidirPreco` é quem autoriza mudar o que o funcionário paga sem ninguém
 * olhar. Cada recusa aqui é um caso em que gravar seria pior que esperar.
 */
describe("decidirPreco", () => {
  it("não mexe quando o preço já bate centavo a centavo", () => {
    expect(decidirPreco(14.85, 14.85)).toEqual({ acao: "igual" });
    // Ruído de ponto flutuante do CIGAM não é reajuste.
    expect(decidirPreco(14.85, 14.850000001)).toEqual({ acao: "igual" });
  });

  it("atualiza reajuste normal e arredonda para centavo", () => {
    expect(decidirPreco(10.9, 11.5)).toEqual({ acao: "atualizar", novo: 11.5 });
    expect(decidirPreco(10.9, 11.456)).toEqual({ acao: "atualizar", novo: 11.46 });
  });

  it("aceita redução de preço também", () => {
    expect(decidirPreco(20, 18)).toEqual({ acao: "atualizar", novo: 18 });
  });

  it("produto sem preço hoje recebe o do CIGAM, sem checagem de salto", () => {
    expect(decidirPreco(null, 17.5)).toEqual({ acao: "atualizar", novo: 17.5 });
    expect(decidirPreco(0, 17.5)).toEqual({ acao: "atualizar", novo: 17.5 });
  });

  it("material ausente da tabela mantém o preço atual (nunca zera)", () => {
    expect(decidirPreco(14.85, undefined)).toEqual({ acao: "sem_preco" });
  });

  it("recusa preço zero ou negativo vindo do CIGAM", () => {
    expect(decidirPreco(14.85, 0)).toEqual({ acao: "invalido", cigam: 0 });
    expect(decidirPreco(14.85, -1)).toEqual({ acao: "invalido", cigam: -1 });
  });

  it("recusa material duplicado com preços diferentes", () => {
    expect(decidirPreco(14.85, 15, true)).toEqual({ acao: "conflito" });
  });

  it("segura o preço do pacote digitado no lugar do R$/kg (06/08/2026)", () => {
    // 002003000032: 17,50/kg, pacote de 3kg a 52,50. Gravar 52,50 cobraria 157,50.
    expect(decidirPreco(17.5, 52.5)).toEqual({ acao: "salto", cigam: 52.5 });
  });

  it("segura queda brusca também", () => {
    expect(decidirPreco(20, 5)).toEqual({ acao: "salto", cigam: 5 });
  });

  it("50% exatos ainda passam; acima disso não", () => {
    expect(decidirPreco(10, 15)).toEqual({ acao: "atualizar", novo: 15 });
    expect(decidirPreco(10, 15.01)).toEqual({ acao: "salto", cigam: 15.01 });
  });
});
