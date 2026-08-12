import { describe, expect, it } from "vitest";
import { filtrarPayloadProduto } from "./produtos-admin";

/**
 * A rota de escrita de produto existe para tirar essa escrita do navegador: até
 * 12/08/2026 a tela de admin gravava `products` com a chave anon, que está no
 * bundle público. O filtro é o que impede a rota nova de virar uma porta
 * genérica de UPDATE na tabela.
 */
describe("filtrarPayloadProduto", () => {
  it("mantém as colunas que a tela de admin edita", () => {
    const payload = filtrarPayloadProduto({
      id: "uuid-1",
      name: "Pão de Queijo",
      employee_price: 14.85,
      is_hidden: false,
      category_id: 3,
    });

    expect(payload).toEqual({
      id: "uuid-1",
      name: "Pão de Queijo",
      employee_price: 14.85,
      is_hidden: false,
      category_id: 3,
    });
  });

  /**
   * Estes quatro são os perigosos: `stock_qty`/`stock_synced_at` são do sync do
   * CIGAM, e `weight`/`cigam_code` mudam o preço cobrado e a baixa de estoque no
   * ERP. Nenhum deles é editável pela tela.
   */
  it("descarta campos de que o sync do CIGAM é dono", () => {
    const payload = filtrarPayloadProduto({
      name: "Pão de Queijo",
      stock_qty: 9999,
      stock_synced_at: "2026-01-01T00:00:00Z",
      weight: 5,
      cigam_code: "002005000027",
    });

    expect(payload).toEqual({ name: "Pão de Queijo" });
  });

  it("descarta coluna desconhecida em vez de deixar o banco recusar", () => {
    expect(filtrarPayloadProduto({ name: "X", coluna_inventada: 1 })).toEqual({ name: "X" });
  });

  it("devolve objeto vazio para corpo que não é objeto", () => {
    expect(filtrarPayloadProduto(null)).toEqual({});
    expect(filtrarPayloadProduto(undefined)).toEqual({});
    expect(filtrarPayloadProduto("texto")).toEqual({});
    expect(filtrarPayloadProduto(42)).toEqual({});
  });

  it("não aceita array — senão viraria insert em lote sem querer", () => {
    expect(filtrarPayloadProduto([{ name: "X" }])).toEqual({});
  });

  it("preserva valores falsy, que são significativos aqui", () => {
    // `is_hidden: false` e `employee_price: 0` precisam chegar ao banco: são
    // "mostrar o produto" e "preço zerado", não "campo ausente".
    const payload = filtrarPayloadProduto({ is_hidden: false, employee_price: 0, featured: false });
    expect(payload).toEqual({ is_hidden: false, employee_price: 0, featured: false });
  });
});
