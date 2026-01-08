// src/pages/Checkout.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { createOrder } from "@/services/orders";
import { supabase } from "@/lib/supabase";

import logo from "../images/logoc.png";

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

function formatBRLFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthKeySaoPaulo() {
  // YYYY-MM, usando fuso de SP
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

const Checkout: React.FC = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI pagamento
  const [payMode, setPayMode] = useState<"wallet" | "pickup">("wallet");

  // Saldo mensal
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [monthlyLimitCents, setMonthlyLimitCents] = useState(0);
  const [spentCents, setSpentCents] = useState(0);

  // ✅ employee_id resolvido (vem do session OU da view employee_wallet_view)
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | null>(
    null
  );

  const employee: any = useMemo(() => safeGetEmployee(), []);

  const safeCartTotal = Number.isFinite(cartTotal) ? cartTotal : 0;
  const totalCents = useMemo(
    () => Math.round(safeCartTotal * 100),
    [safeCartTotal]
  );

  const monthKey = useMemo(() => getMonthKeySaoPaulo(), []);

  const availableCents = useMemo(() => {
    const avail = (monthlyLimitCents || 0) - (spentCents || 0);
    return Math.max(avail, 0);
  }, [monthlyLimitCents, spentCents]);

  const walletUsedCents = useMemo(() => {
    if (payMode !== "wallet") return 0;
    return Math.min(totalCents, availableCents);
  }, [payMode, totalCents, availableCents]);

  const payOnPickupCents = useMemo(() => {
    return Math.max(totalCents - walletUsedCents, 0);
  }, [totalCents, walletUsedCents]);

  // ✅ saldo após o pedido (preview)
  const afterOrderAvailableCents = useMemo(() => {
    if (payMode !== "wallet") return availableCents;
    return Math.max(availableCents - walletUsedCents, 0);
  }, [payMode, availableCents, walletUsedCents]);

  useEffect(() => {
    let alive = true;

    async function loadWallet() {
      try {
        setWalletLoading(true);
        setWalletError(null);

        const employeeCpf = (employee?.cpf ?? "").toString().trim();
        const employeeIdFromSession =
          employee?.user_id || employee?.id || employee?.employee_id;

        if (!employeeCpf) {
          setMonthlyLimitCents(0);
          setSpentCents(0);
          setResolvedEmployeeId(null);
          setWalletError("Faça login novamente para ver seu saldo.");
          return;
        }

        // 1) limite mensal (VIEW segura)
        const { data: walletRow, error: walletErr } = await supabase
          .from("employee_wallet_view")
          .select("employee_id, credito_mensal_cents")
          .eq("cpf", employeeCpf)
          .maybeSingle();

        if (walletErr) throw walletErr;

        const limit = Number(walletRow?.credito_mensal_cents ?? 0) || 0;

        // ✅ resolve employee_id: prefere view, senão session
        const resolvedId = (walletRow?.employee_id ||
          employeeIdFromSession) as string | undefined;

        if (!resolvedId) {
          setMonthlyLimitCents(limit);
          setSpentCents(0);
          setResolvedEmployeeId(null);
          setWalletError(
            "Não foi possível identificar seu cadastro. Faça login novamente."
          );
          return;
        }

        // 2) gasto do mês
        const { data: spendRow, error: spendErr } = await supabase
          .from("employee_monthly_spend")
          .select("spent_cents")
          .eq("employee_id", resolvedId)
          .eq("month_key", monthKey)
          .maybeSingle();

        if (spendErr) throw spendErr;

        const spent = Number(spendRow?.spent_cents ?? 0) || 0;

        if (!alive) return;
        setMonthlyLimitCents(limit);
        setSpentCents(spent);
        setResolvedEmployeeId(resolvedId);
      } catch (e: any) {
        if (!alive) return;
        console.error("Erro ao carregar saldo mensal:", e);
        setMonthlyLimitCents(0);
        setSpentCents(0);
        setResolvedEmployeeId(null);
        setWalletError(e?.message || "Não foi possível carregar seu saldo agora.");
      } finally {
        if (!alive) return;
        setWalletLoading(false);
      }
    }

    loadWallet();
    return () => {
      alive = false;
    };
  }, [employee, monthKey]);

  const handleConfirm = async () => {
    if (cartItems.length === 0) {
      toast.error("Carrinho vazio!", {
        description: "Não é possível confirmar um pedido vazio.",
      });
      return;
    }

    const employeeCpf = (employee?.cpf ?? "").toString().trim();
    if (!employeeCpf) {
      toast.error("Erro ao identificar funcionário", {
        description: "Faça login novamente para confirmar o pedido.",
      });
      return;
    }

    // ✅ usa employee_id resolvido (view > session)
    const employeeId =
      resolvedEmployeeId ||
      employee?.user_id ||
      employee?.id ||
      employee?.employee_id ||
      null;

    if (!employeeId) {
      toast.error("Erro ao identificar funcionário", {
        description:
          "Não foi possível identificar seu cadastro (employee_id). Faça login novamente.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // 1) cria pedido + itens
      const { orderId, orderNumber } = await createOrder({
        employeeId,
        employeeCpf,
        employeeName: employee.full_name || employee.name,
        items: cartItems.map((ci) => ({
          product: ci.product,
          quantity: ci.quantity,
        })),
      });

      if (!orderId) {
        throw new Error("Falha ao criar pedido (orderId vazio).");
      }

      // 2) aplica split via RPC ✅ (SOMENTE v2)
      const { data, error } = await supabase.rpc("place_order_with_wallet_v2", {
        p_order_id: orderId,
        p_employee_id: employeeId,
        p_use_wallet: payMode === "wallet",
      });

      if (error) {
        console.error("Erro ao aplicar pagamento (RPC v2):", error);
        throw error;
      }

      // ✅ ATUALIZA SALDO PELO RETORNO DA RPC (new_spent_cents)
      const row: any = Array.isArray(data) ? data[0] : data;

      if (
        row &&
        row.new_spent_cents !== undefined &&
        row.new_spent_cents !== null
      ) {
        const newSpent = Number(row.new_spent_cents) || 0;
        setSpentCents(newSpent);
      } else {
        // fallback local
        if (payMode === "wallet" && walletUsedCents > 0) {
          setSpentCents(
            (prev) => (Number.isFinite(prev) ? prev : 0) + walletUsedCents
          );
        }
      }

      // ✅ SALVA MÉTODO DE PAGAMENTO + SPLIT NO PEDIDO (orders)
      // - pickup => tudo na retirada
      // - wallet => tudo no saldo
      // - split  => parte saldo + parte retirada
      const paymentMethod =
        payMode === "pickup"
          ? "pickup"
          : walletUsedCents > 0 && payOnPickupCents > 0
          ? "split"
          : "wallet";

      const { error: upErr } = await supabase
        .from("orders")
        .update({
          payment_method: paymentMethod,
          wallet_used_cents: walletUsedCents,
          pay_on_pickup_cents: payOnPickupCents,
        })
        .eq("id", orderId);

      if (upErr) {
        console.error("Erro ao salvar payment_method no pedido:", upErr);
        // Não trava o usuário, mas fica registrado no console.
      }

      clearCart();

      // mensagem mais informativa
      const descParts: string[] = [];
      if (payMode === "wallet") {
        descParts.push(
          `Abatido do saldo: ${formatBRLFromCents(walletUsedCents)}`
        );
        descParts.push(
          `Pagar na retirada: ${formatBRLFromCents(payOnPickupCents)}`
        );
        descParts.push(
          `Saldo após: ${formatBRLFromCents(afterOrderAvailableCents)}`
        );
      } else {
        descParts.push(
          `Pagamento na retirada: ${formatBRLFromCents(totalCents)}`
        );
        descParts.push(
          `Saldo após: ${formatBRLFromCents(afterOrderAvailableCents)}`
        );
      }

      toast.success("Pedido confirmado!", {
        description: `Pedido ${
          orderNumber ?? `#${orderId}`
        } enviado para separação. ${descParts.join(" • ")}`,
      });

      navigate("/meus-pedidos");
    } catch (err: any) {
      console.error("Erro ao finalizar pedido:", err);
      toast.error("Erro ao finalizar pedido", {
        description:
          err?.message ||
          err?.hint ||
          err?.details ||
          "Ocorreu um erro inesperado. Veja o console para mais detalhes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-6 text-center">
          <img
            src={logo}
            alt="Logo"
            className="mx-auto mb-4 h-16 w-auto select-none"
          />
          <h1 className="text-xl font-semibold mb-2">
            Nenhum item para revisar
          </h1>
          <p className="text-sm text-gray-600 mb-6">
            Seu carrinho está vazio. Adicione produtos no catálogo para revisar e
            confirmar o pedido.
          </p>
          <Button onClick={() => navigate("/catalogo")}>
            Voltar para o catálogo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border p-6 md:p-8">
        {/* LOGO CENTRALIZADA */}
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Logo" className="h-20 w-auto select-none" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Revisão do pedido</h1>
        <p className="text-sm text-gray-600 mb-6">
          Confira os itens abaixo antes de confirmar. Após a confirmação, o pedido
          segue para separação interna.
        </p>

        {/* BLOCO SALDO + PAGAMENTO */}
        <div className="mb-6 rounded-2xl border bg-gray-50 p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Crédito do mês</p>
              <p className="text-xs text-gray-600">
                Referência: <span className="font-medium">{monthKey}</span>
              </p>
            </div>

            <div className="text-right">
              {walletLoading ? (
                <p className="text-sm text-gray-600">Carregando saldo…</p>
              ) : walletError ? (
                <p className="text-sm text-red-600">{walletError}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600">
                    Limite:{" "}
                    <span className="font-semibold">
                      {formatBRLFromCents(monthlyLimitCents)}
                    </span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Usado:{" "}
                    <span className="font-semibold">
                      {formatBRLFromCents(spentCents)}
                    </span>
                  </p>
                  <p className="text-base">
                    Disponível:{" "}
                    <span className="font-bold">
                      {formatBRLFromCents(availableCents)}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>

          {/* ✅ Radio visual */}
          <div
            className="mt-4 grid gap-2"
            role="radiogroup"
            aria-label="Forma de pagamento"
          >
            <button
              type="button"
              onClick={() => setPayMode("wallet")}
              className={`w-full rounded-xl border p-3 text-left transition ${
                payMode === "wallet"
                  ? "border-gray-900 bg-white"
                  : "border-gray-200 bg-white"
              }`}
              disabled={walletLoading}
              role="radio"
              aria-checked={payMode === "wallet"}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-4 w-4 rounded-full border flex-shrink-0 grid place-items-center ${
                    payMode === "wallet" ? "border-gray-900" : "border-gray-300"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`h-2 w-2 rounded-full transition ${
                      payMode === "wallet" ? "bg-gray-900" : "bg-transparent"
                    }`}
                  />
                </span>

                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    Usar saldo do mês (desconto automático)
                  </p>
                  <p className="text-xs text-gray-600">
                    Se não for suficiente, o restante fica para pagar na retirada.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPayMode("pickup")}
              className={`w-full rounded-xl border p-3 text-left transition ${
                payMode === "pickup"
                  ? "border-gray-900 bg-white"
                  : "border-gray-200 bg-white"
              }`}
              role="radio"
              aria-checked={payMode === "pickup"}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-4 w-4 rounded-full border flex-shrink-0 grid place-items-center ${
                    payMode === "pickup"
                      ? "border-gray-900"
                      : "border-gray-300"
                  }`}
                  aria-hidden
                >
                  <span
                    className={`h-2 w-2 rounded-full transition ${
                      payMode === "pickup" ? "bg-gray-900" : "bg-transparent"
                    }`}
                  />
                </span>

                <div className="flex-1">
                  <p className="text-sm font-semibold">Pagar tudo na retirada</p>
                  <p className="text-xs text-gray-600">
                    Não utiliza seu saldo mensal.
                  </p>
                </div>
              </div>
            </button>
          </div>

          {/* PREVIEW DO SPLIT */}
          <div className="mt-4 rounded-xl bg-white border p-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total do pedido</span>
              <span className="font-semibold">
                {formatBRLFromCents(totalCents)}
              </span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Abatido do saldo</span>
              <span className="font-semibold">
                {formatBRLFromCents(walletUsedCents)}
              </span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Pagar na retirada</span>
              <span className="font-semibold">
                {formatBRLFromCents(payOnPickupCents)}
              </span>
            </div>

            {/* ✅ saldo após pedido */}
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Saldo após este pedido</span>
              <span className="font-semibold">
                {walletLoading || walletError
                  ? "—"
                  : formatBRLFromCents(afterOrderAvailableCents)}
              </span>
            </div>

            {payMode === "wallet" &&
              !walletLoading &&
              !walletError &&
              availableCents === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Seu saldo disponível está zerado. O pedido ficará 100% para pagar na
                  retirada.
                </p>
              )}
          </div>
        </div>

        {/* ITENS */}
        <div className="space-y-4 mb-6">
          {cartItems.map((item) => (
            <div
              key={item.product.id}
              className="flex justify-between items-center border-b pb-3"
            >
              <div>
                <p className="font-medium text-sm md:text-base">
                  {item.product.name}
                </p>
                <p className="text-xs md:text-sm text-gray-600">
                  {item.quantity} ×{" "}
                  {Number(item.product.employee_price ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              </div>

              <p className="font-semibold text-sm md:text-base">
                {(
                  Number(item.product.employee_price ?? 0) * item.quantity
                ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center mb-6">
          <span className="text-lg font-semibold">Total:</span>
          <span className="text-xl font-bold">
            {safeCartTotal.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </span>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate("/catalogo")}
            disabled={isSubmitting}
          >
            Voltar para o catálogo
          </Button>

          <Button
            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Enviando..." : "Confirmar pedido"}
          </Button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          O desconto do saldo é aplicado automaticamente no momento da confirmação. Se o saldo não
          for suficiente, o restante fica para pagar na retirada.
        </p>
      </div>
    </div>
  );
};

export default Checkout;
