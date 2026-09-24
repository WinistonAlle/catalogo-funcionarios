import { describe, expect, it } from "vitest";

import { calcularReducoesDeDireito, reducaoPareceEmMassa } from "./syncEmployeesFromSheet.mjs";

/**
 * Direito reduzido no meio do ciclo leva o saldo junto (24/09/2026). O caso
 * real: RAFAEL PRADO E SILVA, direito de R$ 1.000 na recarga, depois R$ 300 na
 * planilha, com o saldo parado em R$ 940 até o dia 27.
 */
const atuais = new Map([
  ["00699635179", { cpf: "00699635179", direito: 100000 }],
  ["11111111111", { cpf: "11111111111", direito: 30000 }],
]);

function cadastro(cpf: string, direito: number) {
  return { cpf, full_name: `FUNC ${cpf}`, role: "employee", credito_direito_cents: direito };
}

describe("calcularReducoesDeDireito", () => {
  it("pega o direito que caiu (caso do Rafael)", () => {
    const r = calcularReducoesDeDireito({
      comCadastroApenas: [cadastro("00699635179", 30000)],
      atuaisPorCpf: atuais,
    });
    expect(r).toEqual([
      { cpf: "00699635179", full_name: "FUNC 00699635179", direitoAtual: 100000, novoDireito: 30000 },
    ]);
  });

  it("ignora direito igual e direito que SUBIU (aumento fica para a recarga)", () => {
    const r = calcularReducoesDeDireito({
      comCadastroApenas: [cadastro("00699635179", 100000), cadastro("11111111111", 50000)],
      atuaisPorCpf: atuais,
    });
    expect(r).toEqual([]);
  });

  it("ignora quem não está no banco (funcionário novo nasce com saldo = direito)", () => {
    const r = calcularReducoesDeDireito({
      comCadastroApenas: [cadastro("99999999999", 0)],
      atuaisPorCpf: atuais,
    });
    expect(r).toEqual([]);
  });

  it("ignora valor que não é inteiro válido, em vez de reduzir por lixo da planilha", () => {
    const r = calcularReducoesDeDireito({
      comCadastroApenas: [cadastro("00699635179", Number.NaN), cadastro("11111111111", -100)],
      atuaisPorCpf: atuais,
    });
    expect(r).toEqual([]);
  });

  it("usa o CPF como está no banco, que é o que a função SQL compara", () => {
    const r = calcularReducoesDeDireito({
      comCadastroApenas: [cadastro("00699635179", 0)],
      atuaisPorCpf: new Map([["00699635179", { cpf: "006.996.351-79", direito: 30000 }]]),
    });
    expect(r[0].cpf).toBe("006.996.351-79");
  });
});

describe("reducaoPareceEmMassa — trava contra planilha quebrada", () => {
  const n = (k: number) => Array.from({ length: k }, () => ({}));

  it("uma ou poucas reduções passam", () => {
    expect(reducaoPareceEmMassa(n(1), 256)).toBe(false);
    expect(reducaoPareceEmMassa(n(10), 256)).toBe(false);
  });

  it("coluna vazia (todo mundo caindo para zero) trava", () => {
    expect(reducaoPareceEmMassa(n(256), 256)).toBe(true);
    expect(reducaoPareceEmMassa(n(60), 256)).toBe(true);
  });

  it("em planilha pequena, o piso de 10 evita travar à toa", () => {
    expect(reducaoPareceEmMassa(n(8), 20)).toBe(false);
  });
});
