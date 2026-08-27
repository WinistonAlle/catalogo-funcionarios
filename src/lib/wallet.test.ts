import { describe, it, expect } from "vitest";
import { deriveWallet, WALLET_VIEW_COLUMNS } from "./wallet";

describe("deriveWallet", () => {
  it("separa direito de saldo e deriva o gasto", () => {
    // Direito de R$ 300, gastou R$ 80, sobrou R$ 220.
    const w = deriveWallet({
      credito_direito_cents: 30000,
      credito_mensal_cents: 22000,
    });
    expect(w.monthlyLimitCents).toBe(30000);
    expect(w.availableCents).toBe(22000);
    expect(w.spentCents).toBe(8000);
  });

  it("ciclo novo, ninguém gastou: direito == saldo, gasto zero", () => {
    const w = deriveWallet({
      credito_direito_cents: 30000,
      credito_mensal_cents: 30000,
    });
    expect(w.spentCents).toBe(0);
    expect(w.availableCents).toBe(30000);
  });

  it("gastou tudo: disponível zero, e o gasto é o direito inteiro", () => {
    const w = deriveWallet({
      credito_direito_cents: 30000,
      credito_mensal_cents: 0,
    });
    expect(w.availableCents).toBe(0);
    expect(w.spentCents).toBe(30000);
  });

  it("NÃO subtrai o gasto do saldo de novo — o saldo já vem descontado", () => {
    // Era o bug latente: a conta antiga faria 22000 - 8000 = 14000, mostrando
    // R$ 140 pra quem tem R$ 220. O saldo é devolvido intacto.
    const w = deriveWallet({
      credito_direito_cents: 30000,
      credito_mensal_cents: 22000,
    });
    expect(w.availableCents).toBe(22000);
  });

  it("linha sem direito (antes da migração) cai no saldo, e não inventa gasto", () => {
    const w = deriveWallet({ credito_mensal_cents: 15000 });
    expect(w.monthlyLimitCents).toBe(15000);
    expect(w.availableCents).toBe(15000);
    expect(w.spentCents).toBe(0);
  });

  it("direito menor que o saldo nunca vira gasto negativo", () => {
    // Direito reduzido na planilha no meio do ciclo, pessoa já com saldo alto.
    const w = deriveWallet({
      credito_direito_cents: 10000,
      credito_mensal_cents: 25000,
    });
    expect(w.spentCents).toBe(0);
    expect(w.availableCents).toBe(25000);
    expect(w.monthlyLimitCents).toBe(25000);
  });

  it("saldo negativo ou lixo vira zero, não NaN", () => {
    expect(deriveWallet({ credito_mensal_cents: -500 }).availableCents).toBe(0);
    expect(deriveWallet({ credito_mensal_cents: null }).availableCents).toBe(0);
    expect(deriveWallet(null).availableCents).toBe(0);
    expect(deriveWallet(undefined).spentCents).toBe(0);
    expect(
      deriveWallet({ credito_mensal_cents: "abc" as unknown as number }).availableCents
    ).toBe(0);
  });

  it("pede as duas colunas de crédito na view", () => {
    expect(WALLET_VIEW_COLUMNS).toContain("credito_mensal_cents");
    expect(WALLET_VIEW_COLUMNS).toContain("credito_direito_cents");
  });
});
