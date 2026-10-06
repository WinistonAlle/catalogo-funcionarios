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

/**
 * O mesmo carrinho guardado por dias também segura produto que saiu do
 * catálogo depois de entrar nele. Em 06/10/2026 a CARLA tinha dois potes de
 * alho OMG ocultos no carrinho: o place_order_with_wallet_v2 recusou a
 * cobrança, mas o pedido já tinha sido criado e ficou no Admin como "N/D",
 * duas vezes. A regra é a mesma do RPC (ver
 * scripts/2026-09-24-checkout-recusa-produto-fora-do-catalogo.sql): inativo,
 * oculto ou sem código CIGAM não pode ser pago.
 */
export type SituacaoNoCatalogo = {
  id: string;
  active: boolean | null;
  is_hidden: boolean | null;
  cigam_code: string | null;
};

export function itensForaDoCatalogo(itens: CartItem[], atuais: SituacaoNoCatalogo[]): CartItem[] {
  // Lista vazia com carrinho cheio é consulta que não enxergou nada (sessão,
  // permissão), não catálogo vazio: aí quem decide é o RPC, como antes.
  if (atuais.length === 0) return [];
  const porId = new Map(atuais.map((p) => [String(p.id), p]));
  return itens.filter((item) => {
    const atual = porId.get(String(item.product.id));
    // Não voltou do banco: apagado, ou escondido pela política de leitura.
    if (!atual) return true;
    return atual.active === false || atual.is_hidden === true || !String(atual.cigam_code ?? "").trim();
  });
}
