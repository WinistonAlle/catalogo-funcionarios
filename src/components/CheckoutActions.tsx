// src/components/CheckoutActions.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { toast } from "@/components/ui/sonner";
import { createOrder } from "@/services/orders";

function safeGetEmployee() {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return {};
    if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
      return JSON.parse(raw);
    }
    return {};
  } catch {
    return {};
  }
}

const CheckoutActions: React.FC = () => {
  const navigate = useNavigate();
  const { cartItems, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleFinishOrder = async () => {
    if (!cartItems.length) {
      toast("Seu carrinho está vazio.");
      return;
    }

    const employee: any = safeGetEmployee();

    if (!employee?.cpf) {
      toast("Erro ao identificar funcionário. Faça login novamente.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { orderId } = await createOrder({
        employeeId: employee.user_id || employee.id,
        employeeCpf: employee.cpf,
        employeeName: employee.full_name || employee.name,
        items: cartItems.map((ci) => ({
          product: ci.product,
          quantity: ci.quantity,
        })),
      });

      clearCart();
      toast(`Pedido #${orderId} criado com sucesso!`);
      navigate("/meus-pedidos");
    } catch (err) {
      console.error(err);
      toast("Erro ao finalizar pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <button
      onClick={handleFinishOrder}
      disabled={isSubmitting}
      className="w-full rounded-md bg-emerald-600 text-white py-3 font-semibold disabled:opacity-60"
    >
      {isSubmitting ? "Enviando..." : "Finalizar pedido"}
    </button>
  );
};

export default CheckoutActions;
