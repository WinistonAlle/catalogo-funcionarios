import { describe, expect, it } from "vitest";
import { applyLiveSaldo, isOutOfStock } from "./stock";
import type { Product } from "@/types/products";

/**
 * A regra de estoque é deliberadamente assimétrica e é fácil "consertar" errado:
 * saldo desconhecido tem que DEIXAR PASSAR (fail-open). Melhor deixar passar um
 * pedido do que bloquear o funcionário por falha técnica nossa — no PDV, tratar
 * ausência como zero fez ~90% do catálogo aparecer esgotado.
 */
describe("isOutOfStock", () => {
  it("bloqueia com saldo zero", () => {
    expect(isOutOfStock({ stock_qty: 0 } as Product)).toBe(true);
  });

  it("bloqueia com saldo negativo — negativo é real no CIGAM, não erro", () => {
    // O ERP comprometeu mais do que tem; isso deve bloquear a venda.
    expect(isOutOfStock({ stock_qty: -11 } as Product)).toBe(true);
  });

  it("libera com saldo positivo", () => {
    expect(isOutOfStock({ stock_qty: 708 } as Product)).toBe(false);
  });

  it("LIBERA quando o saldo é desconhecido (fail-open)", () => {
    expect(isOutOfStock({ stock_qty: null } as Product)).toBe(false);
    expect(isOutOfStock({} as Product)).toBe(false);
    expect(isOutOfStock({ stock_qty: undefined } as Product)).toBe(false);
  });

  it("respeita o bloqueio manual independente do saldo", () => {
    expect(isOutOfStock({ inStock: false, stock_qty: 999 } as Product)).toBe(true);
  });

  it("não confunde inStock indefinido com bloqueio manual", () => {
    expect(isOutOfStock({ stock_qty: 5 } as Product)).toBe(false);
  });
});

describe("applyLiveSaldo", () => {
  const base = { id: "1", stock_qty: 10 } as Product;

  it("aplica o saldo recém-consultado", () => {
    expect(applyLiveSaldo(base, 0).stock_qty).toBe(0);
  });

  it("mantém o saldo anterior quando a consulta não trouxe o material", () => {
    // undefined = o CIGAM não respondeu este código; não é zero confirmado.
    expect(applyLiveSaldo(base, undefined).stock_qty).toBe(10);
  });

  it("não muta o produto original", () => {
    applyLiveSaldo(base, 0);
    expect(base.stock_qty).toBe(10);
  });
});
