// scripts/syncEmployeesFromSheet.test.ts
import { describe, expect, it } from "vitest";
// @ts-expect-error — script .mjs sem tipos; só as funções puras interessam aqui.
import { inicioDoCicloAtual } from "./syncEmployeesFromSheet.mjs";

/**
 * O CICLO QUE DECIDE SE O SALDO É REESCRITO.
 *
 * `credito_mensal_cents` é o saldo corrente, não um teto: a rodada mensal o
 * reescreve com o valor da planilha. Se ela rodar duas vezes no mesmo ciclo,
 * todo mundo recupera o saldo cheio e o que gastaram some — comida de graça,
 * sem erro nenhum na tela. A trava que impede isso pergunta "já recarregou
 * neste ciclo?", e a resposta depende inteiramente de onde o ciclo começa.
 *
 * Por isso este teste existe: errar a virada do ciclo por um dia é errar
 * dinheiro de 250 pessoas.
 */
function iso(d: Date) {
  return d.toISOString();
}

describe("inicioDoCicloAtual: o ciclo vira dia 27", () => {
  it("antes do dia 27, o ciclo ainda é o que começou no mês passado", () => {
    // 26/08 é o ÚLTIMO dia do ciclo que começou em 27/07.
    expect(iso(inicioDoCicloAtual(new Date("2026-08-26T23:00:00-03:00")))).toBe(
      "2026-07-27T03:00:00.000Z"
    );
  });

  it("no dia 27 o ciclo vira, da primeira hora à última", () => {
    expect(iso(inicioDoCicloAtual(new Date("2026-08-27T00:05:00-03:00")))).toBe(
      "2026-08-27T03:00:00.000Z"
    );
    // A recarga roda às 03:00; um sync manual às 23h do mesmo dia tem que cair
    // no MESMO ciclo, senão a trava não veria a recarga da madrugada.
    expect(iso(inicioDoCicloAtual(new Date("2026-08-27T23:59:00-03:00")))).toBe(
      "2026-08-27T03:00:00.000Z"
    );
  });

  it("vira o ano junto: 05/01 ainda pertence ao ciclo de 27/12", () => {
    expect(iso(inicioDoCicloAtual(new Date("2026-01-05T10:00:00-03:00")))).toBe(
      "2025-12-27T03:00:00.000Z"
    );
  });

  it("fevereiro não atrapalha — o 27 existe em todo mês", () => {
    expect(iso(inicioDoCicloAtual(new Date("2026-03-01T10:00:00-03:00")))).toBe(
      "2026-02-27T03:00:00.000Z"
    );
  });

  it("usa o fuso de São Paulo, não o do servidor", () => {
    // 27/08 00:30 em São Paulo = 27/08 03:30 UTC. Se a conta fosse feita em
    // UTC o dia daria 27 do mesmo jeito — o caso que separa é a virada ao
    // contrário: 26/08 23:30 em São Paulo já é 27/08 02:30 UTC, e aí ler o dia
    // em UTC diria "27" e recarregaria o saldo um dia antes da hora.
    expect(iso(inicioDoCicloAtual(new Date("2026-08-27T02:30:00Z")))).toBe(
      "2026-07-27T03:00:00.000Z"
    );
  });
});
