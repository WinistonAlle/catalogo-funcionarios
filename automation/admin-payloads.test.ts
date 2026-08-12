import { describe, expect, it } from "vitest";
import {
  filtrarPayloadAviso,
  filtrarPayloadFuncionario,
  filtrarPayloadProduto,
} from "./admin-payloads";

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

describe("filtrarPayloadFuncionario", () => {
  it("mantém os campos cadastrais que a tela de RH edita", () => {
    const payload = filtrarPayloadFuncionario({
      full_name: "Fulano de Tal",
      cpf: "00000000000",
      role: "employee",
      department: "Produção",
      status: "active",
    });

    expect(payload).toEqual({
      full_name: "Fulano de Tal",
      cpf: "00000000000",
      role: "employee",
      department: "Produção",
      status: "active",
    });
  });

  /**
   * O teste mais importante do arquivo. `credito_mensal_cents` é quanto o
   * funcionário pode gastar; nenhuma tela o edita, e deixá-lo passar por aqui
   * reabriria, por outra porta, o buraco que motivou tirar a escrita do
   * navegador.
   */
  it("NUNCA deixa passar credito_mensal_cents", () => {
    const payload = filtrarPayloadFuncionario({
      full_name: "Fulano de Tal",
      credito_mensal_cents: 999999,
    });

    expect(payload).toEqual({ full_name: "Fulano de Tal" });
    expect(payload).not.toHaveProperty("credito_mensal_cents");
  });

  it("não deixa passar o vínculo de autenticação — é quem decide quem é admin", () => {
    const payload = filtrarPayloadFuncionario({
      full_name: "Fulano",
      user_id: "uuid-de-outro",
      auth_user_id: "uuid-de-outro",
      cpf_hash: "\\xdeadbeef",
      id: "uuid-alvo",
    });

    expect(payload).toEqual({ full_name: "Fulano" });
  });

  it("aceita a baixa de funcionário (terminateEmployee)", () => {
    const payload = filtrarPayloadFuncionario({
      status: "inactive",
      terminated_at: "2026-08-12T00:00:00Z",
      notes: "pediu demissão",
    });

    expect(payload).toEqual({
      status: "inactive",
      terminated_at: "2026-08-12T00:00:00Z",
      notes: "pediu demissão",
    });
  });
});

describe("filtrarPayloadAviso", () => {
  it("mantém os campos que o formulário edita", () => {
    expect(
      filtrarPayloadAviso({
        title: "Aviso",
        body: "Corpo",
        is_published: true,
        image_url: "https://exemplo/imagem.png",
      })
    ).toEqual({
      title: "Aviso",
      body: "Corpo",
      is_published: true,
      image_url: "https://exemplo/imagem.png",
    });
  });

  /**
   * A autoria é gravada pelo servidor a partir da sessão. Se ela passasse pelo
   * payload, daria para assinar um aviso como qualquer outra pessoa.
   */
  it("descarta a autoria vinda do cliente", () => {
    expect(
      filtrarPayloadAviso({ title: "X", created_by_employee_id: "uuid-de-outro", id: "uuid-alvo" })
    ).toEqual({ title: "X" });
  });
});
