// src/lib/orders.ts
import { supabase } from "@/lib/supabase";

export type Order = {
  id: string;
  order_number: string;
  employee_id: string | null;
  total_items: number;
  total_value: number;
  status: string;
  notes: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

// Gera algo tipo GM-000123
export function generateOrderNumber(lastNumber?: number) {
  const n = (lastNumber ?? 0) + 1;
  return `GM-${String(n).padStart(6, "0")}`;
}

// cria pedido a partir do carrinho
export async function createOrderFromCart(params: {
  employeeId: string | null;
  cartItems: {
    product: { id: string; name: string; price: number };
    quantity: number;
  }[];
  notes?: string;
}) {
  const { employeeId, cartItems, notes } = params;

  if (!cartItems.length) {
    throw new Error("Carrinho vazio");
  }

  const total_items = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const total_value = cartItems.reduce(
    (sum, item) => sum + item.quantity * item.product.price,
    0
  );

  // Opcional: pegar último número de pedido pra incrementar
  const { data: lastOrder, error: lastError } = await supabase
    .from("orders")
    .select("order_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) {
    console.error(lastError);
  }

  let lastNumeric = 0;
  if (lastOrder?.order_number) {
    const parsed = parseInt(lastOrder.order_number.replace(/\D/g, ""), 10);
    if (!Number.isNaN(parsed)) lastNumeric = parsed;
  }

  const order_number = generateOrderNumber(lastNumeric);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number,
      employee_id: employeeId,
      total_items,
      total_value,
      status: "pendente",
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (orderError || !order) {
    console.error(orderError);
    throw new Error("Erro ao criar pedido");
  }

  const itemsPayload = cartItems.map((item) => ({
    order_id: order.id,
    product_id: item.product.id,
    product_name: item.product.name,
    unit_price: item.product.price,
    quantity: item.quantity,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsPayload);

  if (itemsError) {
    console.error(itemsError);
    throw new Error("Erro ao salvar itens do pedido");
  }

  return order as Order;
}

// pega pedidos de um funcionário
export async function getOrdersByEmployee(employeeId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    throw new Error("Erro ao carregar pedidos");
  }

  return (data ?? []) as Order[];
}

// pega pedido + itens
export async function getOrderWithItems(orderId: string) {
  const [{ data: order, error: orderError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId),
    ]);

  if (orderError || !order) {
    console.error(orderError);
    throw new Error("Pedido não encontrado");
  }

  if (itemsError) {
    console.error(itemsError);
    throw new Error("Erro ao buscar itens do pedido");
  }

  return {
    order: order as Order,
    items: (items ?? []) as OrderItem[],
  };
}
