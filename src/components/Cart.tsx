import React, { useEffect, useState } from "react";
import { useCart } from "../contexts/CartContext";
import { Button } from "./ui/button";
import { X, Trash2, Plus, Minus, ShoppingCart } from "lucide-react";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import { toast } from "./ui/sonner";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";

/* --------------------------------------------------------
   HELPERS
-------------------------------------------------------- */
function safeGetEmployee() {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function formatBRLFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* --------------------------------------------------------
   COMPONENT
-------------------------------------------------------- */
const Cart: React.FC = () => {
  const {
    cartItems,
    cartTotal,
    isCartOpen,
    closeCart,
    addToCart,
    decreaseQuantity,
    removeFromCart,
    updateQuantity,
    itemsCount,
  } = useCart();

  const employee: any = safeGetEmployee();

  /* --------------------------------------------------------
     🟢 SALDO DO FUNCIONÁRIO
  -------------------------------------------------------- */
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletAvailableCents, setWalletAvailableCents] =
    useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadWallet() {
      try {
        const cpf = employee?.cpf;
        if (!cpf) return;

        // 1) Limite mensal (VIEW segura)
        const { data: walletRow } = await supabase
          .from("employee_wallet_view")
          .select("employee_id, credito_mensal_cents")
          .eq("cpf", cpf)
          .maybeSingle();

        if (!walletRow) return;

        // 2) Gasto do mês
        const { data: spendRow } = await supabase
          .from("employee_monthly_spend")
          .select("spent_cents")
          .eq("employee_id", walletRow.employee_id)
          .eq("month_key", getMonthKey())
          .maybeSingle();

        const spent = Number(spendRow?.spent_cents ?? 0);
        const available = Math.max(
          Number(walletRow.credito_mensal_cents) - spent,
          0
        );

        if (mounted) setWalletAvailableCents(available);
      } finally {
        if (mounted) setWalletLoading(false);
      }
    }

    if (isCartOpen) loadWallet();

    return () => {
      mounted = false;
    };
  }, [employee, isCartOpen]);

  /* --------------------------------------------------------
     EFFECTS
  -------------------------------------------------------- */
  // trava o scroll quando carrinho está aberto
  useEffect(() => {
    document.body.style.overflow = isCartOpen ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isCartOpen]);

  // fecha com ESC
  useEffect(() => {
    if (!isCartOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCartOpen, closeCart]);

  const handleQuantityChange = (productId: string, value: string) => {
    const quantity = parseInt(value) || 0;
    updateQuantity(productId, quantity);
  };

  const safeCartTotal = Number.isFinite(cartTotal) ? cartTotal : 0;

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeCart}
          />

          {/* Sidebar */}
          <motion.aside
            className="fixed top-0 right-0 z-50 h-screen w-full sm:w-96 bg-white shadow-xl flex flex-col overflow-hidden"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
          >
            {/* HEADER */}
            <div className="p-4 bg-red-600 text-white flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center">
                <ShoppingCart className="mr-2 h-5 w-5" />
                Carrinho ({itemsCount})
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeCart}
                className="text-white"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* ITENS */}
            <ScrollArea className="flex-grow">
              <div className="p-4 pb-52">
                {cartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <ShoppingCart className="h-16 w-16 mb-4 opacity-20" />
                    <p className="text-lg">Seu carrinho está vazio</p>
                  </div>
                ) : (
                  cartItems.map((item) => {
                    const images = Array.isArray(item.product.images)
                      ? item.product.images
                      : [];

                    const thumb =
                      images[0] ||
                      item.product.image_path ||
                      "/placeholder.svg";

                    const price = Number(item.product.employee_price ?? 0);
                    const subtotal = price * item.quantity;

                    return (
                      <div
                        key={item.product.id}
                        className="mb-4 bg-gray-50 rounded-lg p-3"
                      >
                        <div className="flex justify-between">
                          <div className="flex flex-grow">
                            <div className="w-12 h-12 mr-3 rounded-md overflow-hidden bg-gray-200">
                              <img
                                src={thumb}
                                alt={item.product.name}
                                className="w-full h-full object-cover"
                              />
                            </div>

                            <div>
                              <h3 className="font-medium text-sm">
                                {item.product.name}
                              </h3>
                              <p className="text-red-600 font-semibold text-sm">
                                {price.toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeFromCart(item.product.id)
                            }
                            className="text-gray-500 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center mt-2">
                          <Button
                            onClick={() =>
                              decreaseQuantity(item.product.id)
                            }
                            variant="outline"
                            size="icon"
                            className="rounded-full h-8 w-8"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>

                          <Input
                            type="text"
                            value={item.quantity.toString()}
                            onChange={(e) =>
                              handleQuantityChange(
                                item.product.id,
                                e.target.value
                              )
                            }
                            className="mx-2 h-8 w-12 text-center text-sm"
                          />

                          <Button
                            onClick={() => addToCart(item.product)}
                            variant="outline"
                            size="icon"
                            className="rounded-full h-8 w-8"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>

                          <span className="ml-auto font-semibold text-sm">
                            {subtotal.toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            {/* FOOTER FIXO */}
            <div
              className="fixed z-[60] right-0 left-0 sm:left-auto sm:w-96 border-t bg-white/95 backdrop-blur-sm shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
              style={{
                bottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
              }}
            >
              <div className="p-4 space-y-2">
                {/* 🟢 SALDO */}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    Saldo disponível
                  </span>
                  <span className="font-semibold">
                    {walletLoading
                      ? "—"
                      : walletAvailableCents !== null
                      ? formatBRLFromCents(walletAvailableCents)
                      : "—"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-lg font-bold">Total:</span>
                  <span className="text-lg font-bold">
                    {safeCartTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </div>

                <Button
                  className="w-full bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    if (cartItems.length === 0) {
                      toast.error("Carrinho vazio!", {
                        description:
                          "Adicione algum produto antes de registrar o pedido.",
                      });
                      return;
                    }
                    window.location.href = "/checkout";
                  }}
                >
                  Revisar pedido
                </Button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default Cart;
