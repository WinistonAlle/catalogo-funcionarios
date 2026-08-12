import { describe, expect, it } from "vitest";
import { efetivacaoConcluiu } from "./process-pending-orders";

/**
 * O CIGAM responde `success: false` na efetivação mesmo quando ela deu certo, se
 * o envio do documento ao fisco falhar. Para pedido de funcionário isso é o
 * comportamento ESPERADO: a série é REC (recibo) e não se quer transmitir nota
 * nenhuma.
 *
 * O casamento é pelo prefixo "Efetivação concluída" e NÃO por "erro ao enviar a
 * nota": o que autoriza tratar como sucesso é a efetivação ter concluído, não o
 * motivo de o envio ter falhado.
 *
 * ⚠️ Esta tolerância é específica deste projeto. No PDV a série é CF1/NFE e
 * transmitir ao fisco é o objetivo, então a mesma string é falha real.
 */
describe("efetivacaoConcluiu", () => {
  it("reconhece a resposta real do CIGAM (pedido 011736, 12/08/2026)", () => {
    expect(efetivacaoConcluiu("Efetivação concluída. Erro ao enviar a nota.")).toBe(true);
  });

  it("tolera acento e caixa, que a resposta do CIGAM não garante", () => {
    expect(efetivacaoConcluiu("Efetivacao concluida. Erro ao enviar a nota.")).toBe(true);
    expect(efetivacaoConcluiu("EFETIVAÇÃO CONCLUÍDA. Erro ao enviar a nota.")).toBe(true);
    expect(efetivacaoConcluiu("efetivação  concluída")).toBe(true);
  });

  it("NÃO casa com falha de verdade que só menciona efetivar", () => {
    // Contém "efetivado", mas a efetivação não concluiu — tem que virar aviso.
    expect(efetivacaoConcluiu("Pedido não pode ser efetivado. Situação inválida.")).toBe(false);
    expect(efetivacaoConcluiu("Falha ao efetivar o pedido.")).toBe(false);
  });

  it("NÃO casa com erro de sessão", () => {
    expect(efetivacaoConcluiu("Usuário não autenticado")).toBe(false);
  });

  it("trata ausência de mensagem como falha, não como sucesso", () => {
    expect(efetivacaoConcluiu(undefined)).toBe(false);
    expect(efetivacaoConcluiu("")).toBe(false);
  });
});
