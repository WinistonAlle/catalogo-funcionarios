import { describe, expect, it } from "vitest";
import {
  getKgPrice,
  getLineSubtotal,
  getPositivePrice,
  getProductWeight,
  getUnitPrice,
} from "./pricing";

/** O que estas funções de fato recebem: linha de produto vinda do banco, sem garantia de tipo. */
type ProdutoQualquer = Parameters<typeof getUnitPrice>[0];

/**
 * Estes testes existem porque esta é a única lógica do sistema que decide
 * QUANTO o funcionário paga, e ela já errou em produção duas vezes (auditoria
 * de 06/08/2026): uma vez cobrando 1kg por um pacote de 5kg, outra cobrando em
 * dobro por `employee_price` cadastrado como preço do pacote.
 *
 * A regra: `employee_price` é preço por unidade de medida (para material KG, é
 * R$/kg — NÃO o preço do pacote). O valor cobrado é esse preço vezes o peso da
 * embalagem.
 */
describe("getPositivePrice", () => {
  it("usa o primário quando ele é positivo", () => {
    expect(getPositivePrice(17.5, 99)).toBe(17.5);
  });

  it("cai no fallback quando o primário é zero, nulo ou negativo", () => {
    expect(getPositivePrice(0, 14)).toBe(14);
    expect(getPositivePrice(null, 14)).toBe(14);
    expect(getPositivePrice(-3, 14)).toBe(14);
  });

  it("devolve 0 quando nenhum dos dois presta, em vez de NaN", () => {
    expect(getPositivePrice(undefined, undefined)).toBe(0);
    expect(getPositivePrice("abacaxi", null)).toBe(0);
  });
});

describe("getProductWeight", () => {
  it("usa o peso cadastrado", () => {
    expect(getProductWeight({ weight: 5 })).toBe(5);
  });

  /**
   * O fallback 1 é o que mascarou o bug dos 42 produtos KG com weight = 0: eles
   * eram de 1kg mesmo, então ninguém notou. Quem NÃO era de 1kg (o pacote de
   * 5kg) saía por 1/5 do preço.
   */
  it("cai em 1 quando o peso é 0, negativo ou ausente", () => {
    expect(getProductWeight({ weight: 0 })).toBe(1);
    expect(getProductWeight({ weight: -2 })).toBe(1);
    expect(getProductWeight({})).toBe(1);
    expect(getProductWeight(null)).toBe(1);
  });
});

describe("getUnitPrice — preço/kg × peso", () => {
  it("multiplica o preço por kg pelo peso da embalagem", () => {
    // Pão de Queijo Ímpar 40g, pacote de 5kg, R$ 10,90/kg (caso real, 002005000027).
    expect(getUnitPrice({ employee_price: 10.9, weight: 5 })).toBeCloseTo(54.5, 2);
  });

  it("usa `price` quando `employee_price` não está cadastrado", () => {
    expect(getUnitPrice({ price: 8, weight: 2 })).toBeCloseTo(16, 2);
  });

  it("com peso zerado, cobra como se fosse 1kg — o bug de 06/08/2026", () => {
    // Era exatamente isto que fazia o pacote de 5kg sair por R$ 10,90.
    expect(getUnitPrice({ employee_price: 10.9, weight: 0 })).toBeCloseTo(10.9, 2);
  });

  it("cobra em dobro se o preço for cadastrado como preço do pacote", () => {
    // 002003000032: tinha 52,50 (preço do pacote de 3kg) em vez de 17,50/kg.
    // Com weight = 3, o peso multiplica de novo e vira R$ 157,50.
    expect(getUnitPrice({ employee_price: 52.5, weight: 3 })).toBeCloseTo(157.5, 2);
    // O valor correto, depois da PARTE 2C do SQL:
    expect(getUnitPrice({ employee_price: 17.5, weight: 3 })).toBeCloseTo(52.5, 2);
  });

  it("devolve 0 em vez de NaN quando não dá para calcular", () => {
    expect(getUnitPrice(null)).toBe(0);
    expect(getUnitPrice({})).toBe(0);
    // O cast é proposital: o tipo não permite string, mas o dado vem do banco
    // sem garantia nenhuma, e a guarda em runtime (`finiteNumber`) é o que
    // impede um NaN de virar preço na tela.
    expect(getUnitPrice({ employee_price: "abacaxi", weight: 3 } as ProdutoQualquer)).toBe(0);
  });
});

describe("getKgPrice", () => {
  it("prefere employee_price a price", () => {
    expect(getKgPrice({ employee_price: 17.5, price: 30 })).toBe(17.5);
  });

  it("devolve 0 para produto ausente", () => {
    expect(getKgPrice(null)).toBe(0);
    expect(getKgPrice(undefined)).toBe(0);
  });
});

describe("getLineSubtotal", () => {
  it("multiplica o preço unitário pela quantidade", () => {
    expect(getLineSubtotal({ employee_price: 10.9, weight: 5 }, 2)).toBeCloseTo(109, 2);
  });

  it("trata quantidade inválida como 0 — não deixa virar NaN no carrinho", () => {
    expect(getLineSubtotal({ employee_price: 10.9, weight: 5 }, 0)).toBe(0);
    expect(getLineSubtotal({ employee_price: 10.9, weight: 5 }, -1)).toBe(0);
    expect(getLineSubtotal({ employee_price: 10.9, weight: 5 }, "abacaxi")).toBe(0);
  });
});
