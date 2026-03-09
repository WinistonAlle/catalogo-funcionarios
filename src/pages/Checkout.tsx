// src/pages/Checkout.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    if (!raw) return null;

    const t = raw.trim();
    if (t === "null" || t === "undefined") return null;

    if (t.startsWith("{") || t.startsWith("[")) {
      const parsed = JSON.parse(t);
      return parsed && typeof parsed === "object" ? parsed : null;
    }
    return null;
  } catch {
    return null;
  }
}

function formatBRLFromCents(cents: number) {
  const v = (Number.isFinite(cents) ? cents : 0) / 100;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getMonthKeySaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

/** ✅ Checkbox UI (Uiverse 31) mas usado como "radio" (seleção única) */
function CheckRadio31({
  checked,
  onChange,
  disabled,
  label,
  subLabel,
  warn,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
  subLabel?: string;
  warn?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!disabled) onChange();
      }}
      className={`w-full rounded-xl border p-3 text-left transition bg-white ${
        checked ? "border-gray-900" : "border-gray-200"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "hover:border-gray-400"}`}
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled ? "true" : "false"}
      title={title}
      disabled={disabled}
    >
      <div className="flex items-start gap-3">
        <div className="checkbox-wrapper-31 mt-0.5" aria-hidden>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              if (!disabled) onChange();
            }}
            disabled={disabled}
          />
          <svg viewBox="0 0 35.6 35.6">
            <circle className="background" cx="17.8" cy="17.8" r="17.8" />
            <circle className="stroke" cx="17.8" cy="17.8" r="14.37" />
            <polyline className="check" points="11.78 18.12 15.55 22.23 25.17 12.87" />
          </svg>
        </div>

        <div className="flex-1">
          <p className="text-sm font-semibold">{label}</p>
          {subLabel ? <p className="text-xs text-gray-600">{subLabel}</p> : null}
          {warn ? <p className="mt-1 text-xs text-amber-700">{warn}</p> : null}
        </div>
      </div>
    </button>
  );
}

const Checkout: React.FC = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ employee reativo (NÃO congele em useMemo([]))
  const [employee, setEmployee] = useState<any>(() => safeGetEmployee() ?? {});
  const [employeeReady, setEmployeeReady] = useState(false);

  // UI pagamento
  const [payMode, setPayMode] = useState<"wallet" | "pickup">("wallet");
  const [userTouchedPayMode, setUserTouchedPayMode] = useState(false);

  // Saldo mensal
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  // ✅ importante: não comece “zerando” como verdade final, mas ok como default.
  const [monthlyLimitCents, setMonthlyLimitCents] = useState(0);
  const [spentCents, setSpentCents] = useState(0);

  // ✅ employee_id resolvido (view > session)
  const [resolvedEmployeeId, setResolvedEmployeeId] = useState<string | null>(null);

  const safeCartTotal = Number.isFinite(cartTotal) ? cartTotal : 0;
  const totalCents = useMemo(() => Math.round(safeCartTotal * 100), [safeCartTotal]);

  const monthKey = useMemo(() => getMonthKeySaoPaulo(), []);

  const availableCents = useMemo(() => {
    const avail = (monthlyLimitCents || 0) - (spentCents || 0);
    return Math.max(avail, 0);
  }, [monthlyLimitCents, spentCents]);

  // ✅ só permite pagar com saldo se cobrir 100% do total
  const canPayWithWallet = useMemo(() => {
    if (walletLoading) return false;
    if (walletError) return false;
    return availableCents >= totalCents && totalCents > 0;
  }, [walletLoading, walletError, availableCents, totalCents]);

  useEffect(() => {
    if (walletLoading) return;

    if (payMode === "wallet" && !canPayWithWallet) {
      setPayMode("pickup");
      return;
    }

    if (!userTouchedPayMode && canPayWithWallet && payMode !== "wallet") {
      setPayMode("wallet");
    }
  }, [walletLoading, canPayWithWallet, payMode, userTouchedPayMode]);

  const walletUsedCents = useMemo(() => {
    if (payMode !== "wallet") return 0;
    if (!canPayWithWallet) return 0;
    return totalCents;
  }, [payMode, canPayWithWallet, totalCents]);

  const payOnPickupCents = useMemo(() => {
    return payMode === "pickup" ? totalCents : 0;
  }, [payMode, totalCents]);

  const afterOrderAvailableCents = useMemo(() => {
    if (payMode !== "wallet") return availableCents;
    return Math.max(availableCents - totalCents, 0);
  }, [payMode, availableCents, totalCents]);

  /**
   * ✅ Mantém employee_session sincronizado no Checkout
   * - tenta ler do localStorage ao montar
   * - tenta novamente após 0ms (pega escrita que aconteceu “junto” da navegação)
   * - escuta storage event (outra aba / ou updates)
   * - escuta auth state change e, se precisar, refaz leitura do storage
   */
  useEffect(() => {
    let alive = true;

    const readEmployee = () => {
      const e = safeGetEmployee();
      if (!alive) return;
      if (e) setEmployee(e);
      // se não tiver nada, mantém o que já tinha (não derruba pra {})
    };

    readEmployee();
    // 2º tick: resolve “às vezes” que vem de timing
    setTimeout(readEmployee, 0);

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "employee_session") readEmployee();
    };
    window.addEventListener("storage", onStorage);

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // auth mudou: tenta re-ler o employee_session (se sua app atualiza ele no login)
      readEmployee();
    });

    // Também tenta pegar sessão atual e marcar ready (pra não ficar “sem employee” silencioso)
    (async () => {
      try {
        await supabase.auth.getSession();
      } finally {
        if (alive) setEmployeeReady(true);
      }
    })();

    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 🔒 evita corridas: resposta antiga não pode sobrescrever estado novo
  const loadIdRef = useRef(0);

  const loadWallet = useCallback(async () => {
    const loadId = ++loadIdRef.current;

    // ✅ não derrube números imediatamente; só entra em loading
    setWalletLoading(true);
    setWalletError(null);

    try {
      const employeeCpf = (employee?.cpf ?? "").toString().trim();
      const employeeIdFromSession =
        employee?.user_id || employee?.id || employee?.employee_id || null;

      // Se ainda não tem cpf, não “zera”; apenas sinaliza e espera
      if (!employeeCpf) {
        if (loadId !== loadIdRef.current) return;
        setResolvedEmployeeId(null);
        setWalletError("Carregando seu perfil… (se persistir, faça login novamente)");
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

      const resolvedId = (walletRow?.employee_id || employeeIdFromSession) as string | undefined;

      if (!resolvedId) {
        if (loadId !== loadIdRef.current) return;
        // ✅ atualiza limite se veio, mas não inventa spent=0 como verdade final
        setMonthlyLimitCents(limit);
        setResolvedEmployeeId(null);
        setWalletError("Não foi possível identificar seu cadastro. Faça login novamente.");
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

      if (loadId !== loadIdRef.current) return;

      setMonthlyLimitCents(limit);
      setSpentCents(spent);
      setResolvedEmployeeId(resolvedId);
      setWalletError(null);
    } catch (e: any) {
      if (loadId !== loadIdRef.current) return;
      console.error("Erro ao carregar saldo mensal:", e);

      // ✅ NÃO zera aqui (isso é o que estava “matando” o saldo por falha transitória)
      setResolvedEmployeeId(null);
      setWalletError(e?.message || "Não foi possível carregar seu saldo agora.");
    } finally {
      if (loadId === loadIdRef.current) setWalletLoading(false);
    }
  }, [employee, monthKey]);

  // carrega quando employee mudar (agora ele é reativo)
  useEffect(() => {
    // evita spam no primeiro paint se ainda não está pronto
    if (!employeeReady) return;
    loadWallet();
  }, [employeeReady, loadWallet]);

  // bônus: quando a aba volta pro foco, recarrega saldo (resolve “às vezes” por rede)
  useEffect(() => {
    const onFocus = () => {
      if (!isSubmitting) loadWallet();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isSubmitting, loadWallet]);

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

    const employeeId =
      resolvedEmployeeId || employee?.user_id || employee?.id || employee?.employee_id || null;

    if (!employeeId) {
      toast.error("Erro ao identificar funcionário", {
        description:
          "Não foi possível identificar seu cadastro (employee_id). Faça login novamente.",
      });
      return;
    }

    if (payMode === "wallet" && !canPayWithWallet) {
      toast.error("Saldo insuficiente para pagar com saldo", {
        description: "Este pedido deve ser pago na retirada.",
      });
      setPayMode("pickup");
      return;
    }

    setIsSubmitting(true);

    try {
      const { orderId, orderNumber } = await createOrder({
        employeeId,
        employeeCpf,
        employeeName: employee.full_name || employee.name,
        items: cartItems.map((ci) => ({
          product: ci.product,
          quantity: ci.quantity,
        })),
      });

      if (!orderId) throw new Error("Falha ao criar pedido (orderId vazio).");

      const useWallet = payMode === "wallet" && canPayWithWallet;

      const { data, error } = await supabase.rpc("place_order_with_wallet_v2", {
        p_order_id: orderId,
        p_employee_id: employeeId,
        p_use_wallet: useWallet,
      });

      if (error) {
        console.error("Erro ao aplicar pagamento (RPC v2):", error);
        throw error;
      }

      const row: any = Array.isArray(data) ? data[0] : data;

      if (row && row.new_spent_cents !== undefined && row.new_spent_cents !== null) {
        const newSpent = Number(row.new_spent_cents) || 0;
        setSpentCents(newSpent);
      } else {
        if (useWallet && totalCents > 0) {
          setSpentCents((prev) => (Number.isFinite(prev) ? prev : 0) + totalCents);
        }
      }

      const paymentMethod = useWallet ? "wallet" : "pickup";
      const walletDebited = useWallet;

      const spentFromBalance = useWallet ? totalCents : 0;
      const payOnPickup = useWallet ? 0 : totalCents;

      const { data: updated, error: upErr } = await supabase
        .from("orders")
        .update({
          payment_method: paymentMethod,
          wallet_debited: walletDebited,
          spent_from_balance_cents: spentFromBalance,
          pay_on_pickup_cents: payOnPickup,
        })
        .eq("id", orderId)
        .select("id, payment_method, wallet_debited, spent_from_balance_cents, pay_on_pickup_cents")
        .maybeSingle();

      if (upErr) {
        console.error("Erro ao salvar pagamento no pedido (orders.update):", upErr);
      } else {
        console.log("✅ Pedido atualizado com pagamento:", updated);
      }

      clearCart();

      const descParts: string[] = [];
      if (useWallet) {
        descParts.push(`Pago com saldo: ${formatBRLFromCents(totalCents)}`);
        descParts.push(`Saldo após: ${formatBRLFromCents(afterOrderAvailableCents)}`);
      } else {
        descParts.push(`Pagamento na retirada: ${formatBRLFromCents(totalCents)}`);
        descParts.push(`Saldo após: ${formatBRLFromCents(afterOrderAvailableCents)}`);
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
          <img src={logo} alt="Logo" className="mx-auto mb-4 h-16 w-auto select-none" />
          <h1 className="text-xl font-semibold mb-2">Nenhum item para revisar</h1>
          <p className="text-sm text-gray-600 mb-6">
            Seu carrinho está vazio. Adicione produtos no catálogo para revisar e confirmar o
            pedido.
          </p>
          <Button onClick={() => navigate("/catalogo")}>Voltar para o catálogo</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <style>{`
        /* Uiverse checkbox 31 (scoped via className) */
        .checkbox-wrapper-31:hover .check { stroke-dashoffset: 0; }

        .checkbox-wrapper-31 {
          position: relative;
          display: inline-block;
          width: 28px;
          height: 28px;
          flex: 0 0 auto;
        }

        .checkbox-wrapper-31 .background {
          fill: #ccc;
          transition: ease all 0.6s;
          -webkit-transition: ease all 0.6s;
        }

        .checkbox-wrapper-31 .stroke {
          fill: none;
          stroke: #fff;
          stroke-miterlimit: 10;
          stroke-width: 2px;
          stroke-dashoffset: 100;
          stroke-dasharray: 100;
          transition: ease all 0.6s;
          -webkit-transition: ease all 0.6s;
        }

        .checkbox-wrapper-31 .check {
          fill: none;
          stroke: #fff;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-width: 2px;
          stroke-dashoffset: 22;
          stroke-dasharray: 22;
          transition: ease all 0.6s;
          -webkit-transition: ease all 0.6s;
        }

        .checkbox-wrapper-31 input[type=checkbox] {
          position: absolute;
          width: 100%;
          height: 100%;
          left: 0;
          top: 0;
          margin: 0;
          opacity: 0;
          appearance: none;
          -webkit-appearance: none;
        }

        .checkbox-wrapper-31 input[type=checkbox]:hover { cursor: pointer; }

        /* cor do "checked" */
        .checkbox-wrapper-31 input[type=checkbox]:checked + svg .background { fill: #111827; }
        .checkbox-wrapper-31 input[type=checkbox]:checked + svg .stroke { stroke-dashoffset: 0; }
        .checkbox-wrapper-31 input[type=checkbox]:checked + svg .check { stroke-dashoffset: 0; }

        /* ✅ Uiverse button (arieshiphop) - ESCOPADO */
        .uiverse-aries {
          font-size: 17px;
          padding: 0.5em 2em;
          border: transparent;
          box-shadow: 2px 2px 4px rgba(0,0,0,0.4);
          background: dodgerblue;
          color: white;
          border-radius: 4px;
          transition: all 0.2s ease;
          width: 100%;
        }

        .uiverse-aries:hover {
          background: rgb(2,0,36);
          background: linear-gradient(
            90deg,
            rgba(30,144,255,1) 0%,
            rgba(0,212,255,1) 100%
          );
        }

        .uiverse-aries:active {
          transform: translate(0em, 0.2em);
        }

        .uiverse-aries:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }
      `}</style>

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border p-6 md:p-8">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Logo" className="h-20 w-auto select-none" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Revisão do pedido</h1>
        <p className="text-sm text-gray-600 mb-6">
          Confira os itens abaixo antes de confirmar. Após a confirmação, o pedido segue para
          separação interna.
        </p>

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
                    <span className="font-semibold">{formatBRLFromCents(monthlyLimitCents)}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Usado: <span className="font-semibold">{formatBRLFromCents(spentCents)}</span>
                  </p>
                  <p className="text-base">
                    Disponível:{" "}
                    <span className="font-bold">{formatBRLFromCents(availableCents)}</span>
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Forma de pagamento">
            <CheckRadio31
              checked={payMode === "wallet"}
              onChange={() => {
                setUserTouchedPayMode(true);
                setPayMode("wallet");
              }}
              disabled={walletLoading || !canPayWithWallet}
              label="Usar saldo do mês"
              subLabel="Disponível precisa cobrir 100% do total do pedido."
              warn={
                !walletLoading && !walletError && !canPayWithWallet
                  ? "Saldo insuficiente para este pedido — pagamento será na retirada."
                  : undefined
              }
              title={!canPayWithWallet ? "Saldo insuficiente para pagar este pedido com saldo." : ""}
            />

            <CheckRadio31
              checked={payMode === "pickup"}
              onChange={() => {
                setUserTouchedPayMode(true);
                setPayMode("pickup");
              }}
              disabled={walletLoading}
              label="Pagar tudo na retirada"
              subLabel="Não utiliza seu saldo mensal."
            />
          </div>

          <div className="mt-4 rounded-xl bg-white border p-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total do pedido</span>
              <span className="font-semibold">{formatBRLFromCents(totalCents)}</span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Pago com saldo</span>
              <span className="font-semibold">{formatBRLFromCents(walletUsedCents)}</span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Pagar na retirada</span>
              <span className="font-semibold">{formatBRLFromCents(payOnPickupCents)}</span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Saldo após este pedido</span>
              <span className="font-semibold">
                {walletLoading || walletError ? "—" : formatBRLFromCents(afterOrderAvailableCents)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {cartItems.map((item) => (
            <div key={item.product.id} className="flex justify-between items-center border-b pb-3">
              <div>
                <p className="font-medium text-sm md:text-base">{item.product.name}</p>
                <p className="text-xs md:text-sm text-gray-600">
                  {item.quantity} ×{" "}
                  {Number(item.product.employee_price ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              </div>

              <p className="font-semibold text-sm md:text-base">
                {(Number(item.product.employee_price ?? 0) * item.quantity).toLocaleString(
                  "pt-BR",
                  { style: "currency", currency: "BRL" }
                )}
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

          <button
            type="button"
            className="uiverse-aries flex-1"
            onClick={handleConfirm}
            disabled={isSubmitting}
            aria-busy={isSubmitting ? "true" : "false"}
          >
            {isSubmitting ? "Enviando..." : "Confirmar pedido"}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          O pagamento com saldo só é liberado quando o saldo disponível cobre 100% do pedido. Caso
          contrário, o pedido deve ser pago na retirada.
        </p>
      </div>
    </div>
  );
};

export default Checkout;