import { describe, it, expect } from "vitest";
import {
  ADMIN_OPERATION_ACTIONS,
  formatOperationAction,
  formatOperationStatus,
} from "./adminOperations";

/**
 * Estes testes existem por causa de 31/08/2026, quando a MESMA lista de ações
 * tinha três cópias divergentes — o union daqui, o de
 * `server/adminOperations.ts` e o CHECK de `admin_operation_logs.action` no
 * banco —, cada uma faltando uma ação diferente.
 *
 * O sintoma na tela era mudo: `first_access` e `print_canhoteira` caíam no
 * `return` genérico e apareciam para o admin como "Operação", sem dizer o que
 * foram. E `first_access` é justamente a ação que o CLAUDE.md manda auditar
 * (quem criou senha de admin/RH, de qual IP).
 */
describe("formatOperationAction", () => {
  it("dá rótulo próprio a TODAS as ações, sem cair no genérico", () => {
    const semRotulo = ADMIN_OPERATION_ACTIONS.filter(
      (action) => formatOperationAction(action) === "Operação"
    );

    expect(semRotulo).toEqual([]);
  });

  it("não repete o mesmo rótulo em duas ações", () => {
    // Rótulo repetido é tão ilegível quanto rótulo genérico: duas linhas
    // diferentes do histórico ficariam indistinguíveis.
    const rotulos = ADMIN_OPERATION_ACTIONS.map((a) => formatOperationAction(a));

    expect(new Set(rotulos).size).toBe(ADMIN_OPERATION_ACTIONS.length);
  });

  it("cai no genérico só para o que não é ação conhecida", () => {
    expect(formatOperationAction(null)).toBe("Operação");
    expect(formatOperationAction(undefined)).toBe("Operação");
    // @ts-expect-error — valor fora do union, como viria de uma linha antiga
    // do banco gravada antes de a ação existir no código.
    expect(formatOperationAction("acao_que_nao_existe")).toBe("Operação");
  });
});

describe("formatOperationStatus", () => {
  it("cobre os quatro status e só cai em Desconhecido fora deles", () => {
    expect(formatOperationStatus("running")).toBe("Em andamento");
    expect(formatOperationStatus("success")).toBe("Concluído");
    expect(formatOperationStatus("failed")).toBe("Falhou");
    expect(formatOperationStatus("blocked")).toBe("Bloqueado");
    expect(formatOperationStatus(null)).toBe("Desconhecido");
  });
});
