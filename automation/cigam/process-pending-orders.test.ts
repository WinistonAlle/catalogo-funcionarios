import { describe, expect, it } from "vitest";
import { buildItens, efetivacaoConcluiu, isEligibleForCigamEntry } from "./process-pending-orders";

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

/**
 * A conversão de KG é o caminho que decide quanto o CIGAM dá de baixa no estoque
 * e por quanto fatura. Em 13/08/2026 ela ainda NÃO tinha rodado em produção: os
 * 4 pedidos reais até então eram todos de peso 1 ou PCT.
 *
 * O gabarito é o PDV, que roda essa conversão há mais tempo
 * (`cigamQuantity` em pdv-gm/server/src/orders/orderService.ts). Lá o item
 * guarda o preço POR KG e ele vai direto; aqui o item guarda o preço DO PACOTE
 * (kg × peso) e `buildItens` divide de volta. Os dois entregam ao CIGAM o mesmo
 * par preço-por-kg × quantidade-em-kg — estes testes fixam essa equivalência.
 */
function pedidoCom(item: {
  quantity: number;
  unit_price: number;
  cigam_code?: string | null;
  cigam_unit?: string | null;
  weight?: number | null;
}) {
  return {
    order_items: [
      {
        product_name: "Produto de teste",
        quantity: item.quantity,
        unit_price: item.unit_price,
        products: {
          // `??` não serve aqui: o teste do código faltando passa `null` de
          // propósito, e `null ?? padrão` devolveria o padrão.
          cigam_code: "cigam_code" in item ? item.cigam_code : "002005000027",
          cigam_unit: item.cigam_unit ?? "KG",
          weight: item.weight ?? 5,
        },
      },
    ],
  } as any;
}

describe("buildItens — conversão de KG", () => {
  it("manda quantidade em kg e preço por kg (pacote 5kg a R$ 12,85/kg)", () => {
    // O funcionário pagou 12,85 × 5 = 64,25 pelo pacote.
    const [linha] = buildItens(pedidoCom({ quantity: 1, unit_price: 64.25, weight: 5 }));

    expect(linha.quantidade).toBe(5);
    expect(linha.precoUnitario).toBe(12.85);
    // O total no CIGAM tem que bater com o que foi cobrado.
    expect(linha.quantidade * linha.precoUnitario).toBeCloseTo(64.25, 2);
  });

  it("não estraga o float com peso fracionário (é o que o PDV evita com toFixed(3))", () => {
    // 1,01kg é a bisnaga da linha Alho OMG. Sem arredondar, 3 × 1.01 daria
    // 3.0300000000000002 e o CIGAM receberia lixo.
    const [linha] = buildItens(pedidoCom({ quantity: 3, unit_price: 25.25, weight: 1.01 }));

    expect(linha.quantidade).toBe(3.03);
  });

  it("passa PCT direto, sem multiplicar nem dividir", () => {
    const [linha] = buildItens(
      pedidoCom({ quantity: 2, unit_price: 6.8, cigam_unit: "PCT", weight: 0 })
    );

    expect(linha.quantidade).toBe(2);
    expect(linha.precoUnitario).toBe(6.8);
  });

  it("trata peso 0 num item KG como 1, em vez de dividir por zero", () => {
    const [linha] = buildItens(pedidoCom({ quantity: 2, unit_price: 10, weight: 0 }));

    expect(linha.quantidade).toBe(2);
    expect(linha.precoUnitario).toBe(10);
  });

  it("recusa o pedido inteiro quando falta cigam_code", () => {
    // Não é a linha que falha: é o pedido, e o saldo do funcionário já foi
    // debitado no checkout. Por isso produto sem código não pode ficar visível.
    expect(() => buildItens(pedidoCom({ quantity: 1, unit_price: 17.7, cigam_code: null }))).toThrow(
      /sem código CIGAM/i
    );
  });
});

/**
 * Decisão do Winiston, 24/08/2026: pedido feito depois do corte de separação
 * (13:40) só entra no CIGAM no próximo dia útil — a separação física só
 * acontece nesse dia, então lançar (e dar baixa de estoque) no mesmo dia do
 * pedido tardio estaria adiantando o CIGAM a algo que ainda não existe
 * separado. Pedido feito ANTES do corte não muda: entra normalmente, sem
 * atraso, na próxima varredura.
 *
 * 21/08/2026 é sexta-feira e 24/08/2026 é segunda — o par usado nos testes
 * de fim de semana abaixo.
 */
describe("isEligibleForCigamEntry", () => {
  it("libera na hora um pedido feito ANTES do corte", () => {
    const criadoEm = new Date("2026-08-21T10:00:00-03:00"); // sexta, 10h
    const agora = new Date("2026-08-21T10:01:00-03:00");
    expect(isEligibleForCigamEntry(criadoEm, agora)).toBe(true);
  });

  it("segura um pedido feito DEPOIS do corte, no mesmo dia", () => {
    const criadoEm = new Date("2026-08-21T15:00:00-03:00"); // sexta, 15h — depois do corte
    const agora = new Date("2026-08-21T16:00:00-03:00");
    expect(isEligibleForCigamEntry(criadoEm, agora)).toBe(false);
  });

  it("no instante exato do corte, ainda conta como depois (segura)", () => {
    const criadoEm = new Date("2026-08-21T13:40:00-03:00");
    expect(isEligibleForCigamEntry(criadoEm, criadoEm)).toBe(false);
  });

  it("libera um pedido tardio de sexta só na segunda — pula sábado e domingo", () => {
    const criadoEm = new Date("2026-08-21T15:00:00-03:00"); // sexta, 15h

    // Sábado e domingo: ainda preso.
    expect(isEligibleForCigamEntry(criadoEm, new Date("2026-08-22T09:00:00-03:00"))).toBe(false);
    expect(isEligibleForCigamEntry(criadoEm, new Date("2026-08-23T09:00:00-03:00"))).toBe(false);

    // Segunda, virada da meia-noite: libera — não precisa esperar o corte
    // da segunda, só o dia útil começar.
    expect(isEligibleForCigamEntry(criadoEm, new Date("2026-08-24T00:00:01-03:00"))).toBe(true);
  });

  it("pedido feito de madrugada (antes do corte) não é afetado pela regra", () => {
    const criadoEm = new Date("2026-08-24T00:05:00-03:00"); // segunda, pouco depois da meia-noite
    expect(isEligibleForCigamEntry(criadoEm, criadoEm)).toBe(true);
  });
});
