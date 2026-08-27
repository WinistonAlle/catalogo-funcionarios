/**
 * A carteira do funcionário: direito, saldo e gasto — e qual dos três é a
 * verdade.
 *
 * ANTES (até 27/08/2026), quatro telas repetiam esta conta:
 *
 *     limite      = employee_wallet_view.credito_mensal_cents
 *     gasto       = employee_monthly_spend.spent_cents
 *     disponível  = max(limite - gasto, 0)
 *
 * Ela dava o número certo por acidente. `credito_mensal_cents` nunca foi um
 * limite: é o SALDO, já descontado pelo checkout. E `spent_cents` era sempre 0,
 * porque nenhuma função viva escrevia em `employee_monthly_spend` — as cinco que
 * escreviam estavam mortas. Então `saldo - 0 = saldo`, e ninguém percebeu.
 *
 * O acidente tinha data pra dar errado: bastava alguém chamar
 * `admin_remove_order_item_v3` ou `_qty_v1` (mortas no app, mas expostas pelo
 * PostgREST) para `spent_cents` ser preenchido com o gasto real do ciclo. Aí a
 * conta subtrairia o gasto UMA SEGUNDA VEZ — o saldo já vinha descontado — e o
 * funcionário veria a carteira encolher sem ter comprado nada.
 *
 * AGORA as duas coisas são colunas diferentes, e a única fonte de verdade sobre
 * "posso comprar?" é o SALDO — a mesma coluna que `place_order_with_wallet_v2`
 * confere antes de aceitar o pedido. O que a tela mostra e o que o checkout
 * aceita não têm mais como divergir.
 *
 * O gasto vira número DERIVADO (direito - saldo). Número derivado não
 * dessincroniza: não existe tabela paralela pra ficar velha.
 */

/** As colunas a pedir de `employee_wallet_view`. */
export const WALLET_VIEW_COLUMNS =
  "employee_id, cpf, credito_mensal_cents, credito_direito_cents";

export type WalletRow = {
  employee_id?: string | null;
  cpf?: string | null;
  /** SALDO corrente em centavos. */
  credito_mensal_cents?: number | null;
  /** DIREITO do ciclo em centavos. */
  credito_direito_cents?: number | null;
};

export type WalletSnapshot = {
  /** Direito do ciclo — o "de R$ X" que a tela mostra. */
  monthlyLimitCents: number;
  /** Saldo corrente — o que dá pra gastar AGORA. É o número que manda. */
  availableCents: number;
  /** Derivado: direito - saldo. Nunca negativo. */
  spentCents: number;
};

const naoNegativo = (valor: unknown): number => {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

export function deriveWallet(row: WalletRow | null | undefined): WalletSnapshot {
  const saldo = naoNegativo(row?.credito_mensal_cents);

  // O direito só existe a partir da migração de 27/08. Se vier ausente ou menor
  // que o saldo (planilha ainda não sincronizada, direito reduzido no meio do
  // ciclo com a pessoa já carregada de saldo), o saldo manda: exibir um direito
  // menor que o saldo faria a tela anunciar gasto negativo.
  const direito = Math.max(naoNegativo(row?.credito_direito_cents), saldo);

  return {
    monthlyLimitCents: direito,
    availableCents: saldo,
    spentCents: direito - saldo,
  };
}
