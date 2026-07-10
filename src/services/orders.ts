// src/services/orders.ts
import { supabase } from "@/lib/supabase";
import { getLineSubtotal, getUnitPrice } from "@/lib/pricing";
import { getSaoPauloPayCycleKey } from "@/lib/payCycle";
import type { Product } from "@/types/products";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CreateOrderParams {
  // Mantemos employeeId só para compatibilidade, mas não vamos usar agora
  employeeId?: string;
  employeeCpf: string;
  employeeName?: string;
  items: CartItem[];
}

// gera um número de pedido legível
function generateOrderNumber() {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, ""); // ex: 20251209
  const randomPart = Math.floor(1000 + Math.random() * 9000); // 4 dígitos
  return `GM-${datePart}-${randomPart}`;
}

export async function createOrder({
  employeeId, // ignorado por enquanto
  employeeCpf,
  employeeName,
  items,
}: CreateOrderParams) {
  if (!items.length) {
    throw new Error("Nenhum item no carrinho.");
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  const totalValue = items.reduce(
    (sum, item) => sum + getLineSubtotal(item.product, item.quantity),
    0
  );

  if (!Number.isFinite(totalValue) || totalValue <= 0) {
    throw new Error("Pedido bloqueado: total zerado ou inválido.");
  }

  const orderNumber = generateOrderNumber();

  const orderPayload: any = {
    order_number: orderNumber,
    employee_cpf: employeeCpf,          // 👈 liga pedido ao funcionário
    employee_name: employeeName ?? null,
    total_items: totalItems,            // 👈 qtd total de itens
    total_value: totalValue,            // 👈 valor total
    month_key: getSaoPauloPayCycleKey(),
    status: "pedido_feito",
  };

  // 1) Cria o pedido
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select("id, order_number")
    .single();

  if (orderError || !order) {
    console.error("Erro ao inserir em orders:", orderError);
    throw orderError ?? new Error("Erro ao criar pedido.");
  }

  // 2) Cria os itens do pedido
  // ❗ NÃO enviamos subtotal porque sua coluna é gerada no banco
  const itemsPayload = items.map((item) => {
    const unitPrice = getUnitPrice(item.product);
    const quantity = Number(item.quantity);

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(`Pedido bloqueado: item "${item.product.name}" está com preço zerado.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Pedido bloqueado: item "${item.product.name}" está com quantidade inválida.`);
    }

    return {
      order_id: order.id,                                     // uuid do pedido
      product_id: item.product.id,
      product_old_id: (item.product as any).old_id ?? null,   // 👈 old_id
      product_name: item.product.name,
      unit_price: unitPrice,
      quantity,                                               // 👈 qtd do item
    };
  });

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsPayload);

  if (itemsError) {
    console.error("Erro ao inserir em order_items:", itemsError);
    throw itemsError;
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number ?? orderNumber,
    total: totalValue,
  };
}
