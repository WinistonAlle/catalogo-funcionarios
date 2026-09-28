import type { CartItem } from "@/types/products";
import { getUnitPrice } from "@/lib/pricing";

/**
 * O carrinho mora no localStorage com uma CÓPIA do produto, então guarda o
 * preço de quando o item entrou, por dias se for o caso. Quem cobra é o
 * place_order_with_wallet_v2, com o `employee_price` do banco. Desde 28/09/2026
 * o preço se alinha sozinho com o CIGAM (automation/cigam/sync-precos.ts), e a
 * diferença deixou de ser teórica: a tela mostrava 27,45 e o saldo saía 30,20.
 *
 * Esta função só troca preço e peso (os dois que entram na conta, ver
 * pricing.ts) pelos do banco e diz o que mudou. Produto que não voltou do
 * banco fica como está: quem recusa produto fora do catálogo é o RPC.
 */
export type PrecoAtual = {
  id: string;
  employee_price: number | null;
  weight: number | null;
};

export type MudancaDePreco = {
  nome: string;
  antes: number;
  depois: number;
};

const centavos = (v: number) => Math.round(v * 100);

export function aplicarPrecosAtuais(
  itens: CartItem[],
  atuais: PrecoAtual[]
): { itens: CartItem[]; mudancas: MudancaDePreco[] } {
  const porId = new Map(atuais.map((p) => [String(p.id), p]));
  const mudancas: MudancaDePreco[] = [];

  const novos = itens.map((item) => {
    const atual = porId.get(String(item.product.id));
    if (!atual) return item;

    const produto = {
      ...item.product,
      employee_price: Number(atual.employee_price ?? 0),
      weight: Number(atual.weight ?? 0),
    };
    const antes = getUnitPrice(item.product);
    const depois = getUnitPrice(produto);
    if (centavos(antes) === centavos(depois)) return item;

    mudancas.push({ nome: item.product.name, antes, depois });
    return { ...item, product: produto };
  });

  return { itens: mudancas.length > 0 ? novos : itens, mudancas };
}

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function descreverMudancas(mudancas: MudancaDePreco[]): string {
  return mudancas.map((m) => `${m.nome}: ${reais(m.antes)} → ${reais(m.depois)}`).join(" • ");
}
