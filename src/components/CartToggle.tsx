import React from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "../contexts/CartContext";
import { Button } from "./ui/button";
import clsx from "clsx";

const CartToggle: React.FC = () => {
  const { cartItems, openCart } = useCart();

  const itemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const total = cartItems.reduce((sum, item) => {
    const raw =
      (item.product as any).employee_price ??
      (item.product as any).price ??
      0;

    const price = Number(raw);
    if (!Number.isFinite(price)) return sum;

    return sum + price * item.quantity;
  }, 0);

  const formattedTotal = total.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const hasItems = itemsCount > 0;

  return (
    <div
      className="
        fixed 
        right-4 
        bottom-24
        md:bottom-6
        z-40
      "
    >
      <Button
        onClick={openCart}
        className={clsx(
          "relative flex items-center gap-3 px-4 py-3 rounded-full shadow-lg transition-all duration-300",
          hasItems
            ? "bg-red-600 hover:bg-red-700 animate-[pulse_1.3s_ease-in-out_1]"
            : "bg-gray-800 hover:bg-gray-900"
        )}
      >
        <div className="relative">
          <ShoppingCart className="h-5 w-5" />

          {hasItems && (
            <span className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-yellow-400 text-gray-900 text-xs font-bold flex items-center justify-center shadow">
              {itemsCount}
            </span>
          )}
        </div>

        {/* Exibe info somente quando tiver itens */}
        {hasItems && (
          <div className="flex flex-col items-start">
            <span className="text-xs opacity-80">Carrinho</span>
            <span className="text-sm font-semibold">{formattedTotal}</span>
          </div>
        )}
      </Button>
    </div>
  );
};

export default CartToggle;
