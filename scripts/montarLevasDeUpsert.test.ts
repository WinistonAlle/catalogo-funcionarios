import { describe, expect, it } from "vitest";

import { montarLevasDeUpsert } from "./syncEmployeesFromSheet.mjs";

const planilha = [
  { cpf: "11111111111", full_name: "ANA", role: "employee", credito_direito_cents: 30000 },
  { cpf: "22222222222", full_name: "BRUNO", role: "employee", credito_direito_cents: 25000 },
];

describe("montarLevasDeUpsert — quem leva SALDO nesta rodada", () => {
  it("rodada de CADASTRO não manda saldo de ninguém que já existe", () => {
    const { comCadastroApenas, comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: planilha,
      cpfsInDbSet: new Set(["11111111111", "22222222222"]),
      syncCredit: false,
    });

    expect(comSaldoTambem).toHaveLength(0);
    expect(comCadastroApenas).toHaveLength(2);

    // O ponto da mudança: a chave nem existe. Não é "manda o valor certo", é
    // "não tem como mandar valor nenhum".
    for (const linha of comCadastroApenas) {
      expect(linha).not.toHaveProperty("credito_mensal_cents");
      expect(linha.credito_direito_cents).toBeGreaterThan(0);
    }
  });

  it("rodada MENSAL manda saldo := direito para todo mundo", () => {
    const { comCadastroApenas, comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: planilha,
      cpfsInDbSet: new Set(["11111111111", "22222222222"]),
      syncCredit: true,
    });

    expect(comCadastroApenas).toHaveLength(0);
    expect(comSaldoTambem).toHaveLength(2);
    expect(comSaldoTambem[0].credito_mensal_cents).toBe(30000);
    expect(comSaldoTambem[0].credito_direito_cents).toBe(30000);
    expect(comSaldoTambem[1].credito_mensal_cents).toBe(25000);
  });

  it("funcionário NOVO nasce com saldo cheio mesmo fora do dia 27", () => {
    const { comCadastroApenas, comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: planilha,
      cpfsInDbSet: new Set(["11111111111"]), // BRUNO é novo
      syncCredit: false,
    });

    expect(comCadastroApenas.map((l: any) => l.cpf)).toEqual(["11111111111"]);
    expect(comSaldoTambem.map((l: any) => l.cpf)).toEqual(["22222222222"]);
    expect(comSaldoTambem[0].credito_mensal_cents).toBe(25000);
  });

  it("cada leva tem chaves homogêneas — o PostgREST recusa array misturado", () => {
    // Foi a armadilha que quase entrou junto com a mudança: um único
    // funcionário novo numa rodada de cadastro produziria objetos com chaves
    // diferentes no mesmo upsert, e o PostgREST responde "All object keys must
    // match" — derrubando o CADASTRO inteiro por causa de uma regra de SALDO.
    const { comCadastroApenas, comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: planilha,
      cpfsInDbSet: new Set(["11111111111"]),
      syncCredit: false,
    });

    for (const leva of [comCadastroApenas, comSaldoTambem]) {
      if (leva.length === 0) continue;
      const referencia = JSON.stringify(Object.keys(leva[0]).sort());
      for (const linha of leva) {
        expect(JSON.stringify(Object.keys(linha).sort())).toBe(referencia);
      }
    }
  });

  it("direito zero na planilha continua indo (é a trava de soma-zero que decide, não esta função)", () => {
    const { comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: [
        { cpf: "33333333333", full_name: "CARLA", role: "employee", credito_direito_cents: 0 },
      ],
      cpfsInDbSet: new Set(),
      syncCredit: false,
    });

    expect(comSaldoTambem[0].credito_direito_cents).toBe(0);
    expect(comSaldoTambem[0].credito_mensal_cents).toBe(0);
  });

  it("planilha vazia não produz leva nenhuma", () => {
    const { comCadastroApenas, comSaldoTambem } = montarLevasDeUpsert({
      sheetEmployees: [],
      cpfsInDbSet: new Set(),
      syncCredit: true,
    });

    expect(comCadastroApenas).toHaveLength(0);
    expect(comSaldoTambem).toHaveLength(0);
  });
});
