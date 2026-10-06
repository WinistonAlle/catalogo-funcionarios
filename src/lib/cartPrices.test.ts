import { describe, expect, it } from "vitest";
import { aplicarPrecosAtuais, itensForaDoCatalogo } from "./cartPrices";
import type { CartItem } from "@/types/products";

const item = (id: string, employee_price: number, weight: number, quantity = 1): CartItem =>
  ({ product: { id, name: `Produto ${id}`, price: 0, employee_price, weight } as any, quantity });

describe("aplicarPrecosAtuais", () => {
  it("não mexe no carrinho quando o preço do banco é o mesmo", () => {
    const itens = [item("a", 14.85, 1)];
    const r = aplicarPrecosAtuais(itens, [{ id: "a", employee_price: 14.85, weight: 1 }]);
    expect(r.mudancas).toEqual([]);
    expect(r.itens).toBe(itens);
  });

  it("troca o preço reajustado e diz de quanto pra quanto (pastelão, 28/09)", () => {
    const r = aplicarPrecosAtuais([item("a", 27.45, 1, 2)], [{ id: "a", employee_price: 30.2, weight: 1 }]);
    expect(r.itens[0].product.employee_price).toBe(30.2);
    expect(r.itens[0].quantity).toBe(2);
    expect(r.mudancas).toEqual([{ nome: "Produto a", antes: 27.45, depois: 30.2 }]);
  });

  it("peso também é preço: pacote de 5kg com peso corrigido muda o valor", () => {
    const r = aplicarPrecosAtuais([item("a", 10.9, 0)], [{ id: "a", employee_price: 10.9, weight: 5 }]);
    expect(r.mudancas[0].antes).toBeCloseTo(10.9);
    expect(r.mudancas[0].depois).toBeCloseTo(54.5);
  });

  it("produto que não voltou do banco fica como está", () => {
    const itens = [item("a", 10, 1), item("b", 20, 1)];
    const r = aplicarPrecosAtuais(itens, [{ id: "b", employee_price: 22, weight: 1 }]);
    expect(r.itens[0]).toBe(itens[0]);
    expect(r.mudancas.map((m) => m.nome)).toEqual(["Produto b"]);
  });

  it("ruído de centavo quebrado não conta como mudança", () => {
    const r = aplicarPrecosAtuais([item("a", 6.4, 7)], [{ id: "a", employee_price: 6.400000001, weight: 7 }]);
    expect(r.mudancas).toEqual([]);
  });
});

describe("itensForaDoCatalogo", () => {
  const situacao = (id: string, extra: Partial<{ active: boolean; is_hidden: boolean; cigam_code: string | null }> = {}) => ({
    id,
    active: true,
    is_hidden: false,
    cigam_code: "002001000004",
    ...extra,
  });

  it("aponta o produto oculto que ficou no carrinho (alho OMG da CARLA, 06/10)", () => {
    const fora = itensForaDoCatalogo(
      [item("alho", 8.5, 0), item("mini", 27.75, 0)],
      [situacao("alho", { is_hidden: true }), situacao("mini")]
    );
    expect(fora.map((i) => i.product.id)).toEqual(["alho"]);
  });

  it("aponta inativo, sem código CIGAM e o que não voltou do banco", () => {
    const fora = itensForaDoCatalogo(
      [item("a", 1, 1), item("b", 1, 1), item("c", 1, 1), item("d", 1, 1)],
      [situacao("a", { active: false }), situacao("b", { cigam_code: "  " }), situacao("d")]
    );
    expect(fora.map((i) => i.product.id)).toEqual(["a", "b", "c"]);
  });

  it("não tira nada quando a consulta não enxergou produto nenhum", () => {
    expect(itensForaDoCatalogo([item("a", 1, 1)], [])).toEqual([]);
  });
});
