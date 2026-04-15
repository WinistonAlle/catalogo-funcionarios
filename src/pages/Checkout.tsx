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

function isAfterSeparationCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const totalMinutes = hour * 60 + minute;

  return totalMinutes > 13 * 60 + 40;
}

function isWeekendInSaoPaulo(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now);

  return weekday === "Sat" || weekday === "Sun";
}

type PurchaseFlowNotice = "insufficient_balance" | "physical_store_only";

const Checkout: React.FC = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ✅ employee reativo (NÃO congele em useMemo([]))
  const [employee, setEmployee] = useState<any>(() => safeGetEmployee() ?? {});
  const [employeeReady, setEmployeeReady] = useState(false);
  const [showLateOrderPopup, setShowLateOrderPopup] = useState(false);

  const [purchaseFlowNotice, setPurchaseFlowNotice] = useState<PurchaseFlowNotice | null>(null);

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
  const isWeekendOrder = useMemo(() => isWeekendInSaoPaulo(), []);
  const isLateOrder = useMemo(() => isAfterSeparationCutoff(), []);

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

  const walletUsedCents = useMemo(() => {
    if (!canPayWithWallet) return 0;
    return totalCents;
  }, [canPayWithWallet, totalCents]);

  const afterOrderAvailableCents = useMemo(() => {
    if (!canPayWithWallet) return availableCents;
    return Math.max(availableCents - totalCents, 0);
  }, [canPayWithWallet, availableCents, totalCents]);

  useEffect(() => {
    if (isLateOrder) {
      setShowLateOrderPopup(true);
    }
  }, [isLateOrder]);

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

    if (!canPayWithWallet) {
      setPurchaseFlowNotice("insufficient_balance");
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

      const { data, error } = await supabase.rpc("place_order_with_wallet_v2", {
        p_order_id: orderId,
        p_employee_id: employeeId,
        p_use_wallet: true,
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
        if (totalCents > 0) {
          setSpentCents((prev) => (Number.isFinite(prev) ? prev : 0) + totalCents);
        }
      }

      const { data: updated, error: upErr } = await supabase
        .from("orders")
        .update({
          payment_method: "wallet",
          wallet_debited: true,
          spent_from_balance_cents: totalCents,
          pay_on_pickup_cents: 0,
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
      descParts.push(`Pago com saldo: ${formatBRLFromCents(totalCents)}`);
      descParts.push(`Saldo após: ${formatBRLFromCents(afterOrderAvailableCents)}`);

      toast.success("Pedido confirmado!", {
        description: `Pedido ${
          orderNumber ?? `#${orderId}`
        } enviado para separação. ${descParts.join(" • ")}`,
      });

      navigate("/catalogo");
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

        .late-order-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(17, 24, 39, 0.56);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 60;
          animation: late-order-fade 0.25s ease-out;
        }

        .late-order-popup {
          width: min(560px, 100%);
          border-radius: 28px;
          background: #ffffff;
          border: 1px solid rgba(17, 24, 39, 0.08);
          box-shadow: 0 28px 90px rgba(17, 24, 39, 0.26);
          padding: 32px 28px;
          transform-origin: center;
          animation: late-order-pop 0.35s cubic-bezier(.22,1,.36,1);
        }

        .glass-store-backdrop {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at top, rgba(255,255,255,0.22), transparent 36%),
            rgba(9, 14, 26, 0.38);
          backdrop-filter: blur(22px) saturate(180%);
          -webkit-backdrop-filter: blur(22px) saturate(180%);
          animation: late-order-fade 0.25s ease-out;
        }

        .glass-store-modal {
          position: relative;
          overflow: hidden;
          width: min(560px, 100%);
          border-radius: 34px;
          padding: 30px;
          color: #0f172a;
          background: linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,255,255,0.38));
          border: 1px solid rgba(255,255,255,0.55);
          box-shadow:
            0 30px 80px rgba(15, 23, 42, 0.28),
            inset 0 1px 0 rgba(255,255,255,0.65);
          animation: late-order-pop 0.35s cubic-bezier(.22,1,.36,1);
        }

        .glass-store-modal::before {
          content: "";
          position: absolute;
          inset: -30% auto auto -10%;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          background: rgba(255,255,255,0.42);
          filter: blur(18px);
          pointer-events: none;
        }

        .glass-store-modal::after {
          content: "";
          position: absolute;
          right: -40px;
          bottom: -50px;
          width: 210px;
          height: 210px;
          border-radius: 999px;
          background: rgba(191, 219, 254, 0.36);
          filter: blur(24px);
          pointer-events: none;
        }

        @keyframes late-order-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes late-order-pop {
          from {
            opacity: 0;
            transform: translateY(22px) scale(0.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>

      {showLateOrderPopup ? (
        <div className="late-order-backdrop" role="dialog" aria-modal="true">
          <div className="late-order-popup text-center">
            <h2 className="text-3xl font-black leading-tight text-gray-900 md:text-4xl">
              {isWeekendOrder
                ? "Seu pedido será separado apenas na segunda-feira"
                : "Seu pedido será separado apenas no dia seguinte"}
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-700">
              {isWeekendOrder
                ? "Pedidos feitos no final de semana entram na fila para separação na segunda-feira."
                : "Pedidos feitos após as 13:40 entram na fila para separação no próximo dia."}
            </p>
            <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
              Se quiser continuar agora, o pedido será registrado normalmente, mas a separação não
              {isWeekendOrder ? " acontece no final de semana." : " acontece hoje."}
            </div>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                className="rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
                onClick={() => setShowLateOrderPopup(false)}
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {purchaseFlowNotice ? (
        <div className="glass-store-backdrop" role="dialog" aria-modal="true">
          <div className="glass-store-modal">
            <div className="relative z-10">
              <div className="inline-flex rounded-full border border-white/60 bg-white/45 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
                Loja física
              </div>

              <h2 className="mt-5 text-3xl font-black leading-tight text-slate-900 md:text-4xl">
                {purchaseFlowNotice === "insufficient_balance"
                  ? "Seu saldo não cobre este pedido."
                  : "Esta compra precisa ser feita presencialmente."}
              </h2>

              <p className="mt-4 text-base leading-7 text-slate-700">
                {purchaseFlowNotice === "insufficient_balance"
                  ? "As compras no sistema agora são feitas exclusivamente com saldo. Como o valor disponível não cobre 100% do pedido, finalize essa compra na loja física."
                  : "Quando você não quiser usar o saldo para esta compra, o atendimento deve acontecer diretamente na loja física."}
              </p>

              <div className="mt-6 rounded-[28px] border border-white/60 bg-white/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Total do pedido</span>
                  <span className="font-semibold text-slate-900">
                    {formatBRLFromCents(totalCents)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                  <span>Saldo disponível</span>
                  <span className="font-semibold text-slate-900">
                    {walletLoading || walletError ? "—" : formatBRLFromCents(availableCents)}
                  </span>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
                <button
                  type="button"
                  className="rounded-2xl border border-white/60 bg-white/35 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/55"
                  onClick={() => setPurchaseFlowNotice(null)}
                >
                  Entendi
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(15,23,42,0.25)] transition hover:bg-slate-800"
                  onClick={() => {
                    setPurchaseFlowNotice(null);
                    navigate("/catalogo");
                  }}
                >
                  Voltar ao catálogo
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border p-6 md:p-8">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Logo" className="h-20 w-auto select-none" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Revisão do pedido</h1>
        <p className="text-sm text-gray-600 mb-6">
          Confira os itens abaixo antes de confirmar. Após a confirmação, o pedido segue para
          separação interna.
        </p>

        {isWeekendOrder ? (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Atenção ao prazo de separação</p>
            <p className="mt-1">
              Pedidos realizados no final de semana serão separados somente na segunda-feira.
            </p>
          </div>
        ) : null}

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

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-950">
                  Pagamento exclusivo com saldo
                </p>
                <p className="text-xs text-emerald-900/80">
                  O saldo disponível precisa cobrir 100% do total do pedido para concluir no sistema.
                </p>
              </div>

              <button
                type="button"
                className="rounded-xl border border-emerald-200 bg-white/90 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-white"
                onClick={() => setPurchaseFlowNotice("physical_store_only")}
              >
                Não quero usar saldo
              </button>
            </div>

            {!walletLoading && !walletError && !canPayWithWallet ? (
              <p className="mt-3 text-xs font-medium text-amber-800">
                Saldo insuficiente para este pedido. Nesse caso, a compra deve ser feita na loja física.
              </p>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl bg-white border p-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total do pedido</span>
              <span className="font-semibold">{formatBRLFromCents(totalCents)}</span>
            </div>

            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-600">Será descontado do saldo</span>
              <span className="font-semibold">{formatBRLFromCents(walletUsedCents)}</span>
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
            disabled={isSubmitting || walletLoading || Boolean(walletError)}
            aria-busy={isSubmitting ? "true" : "false"}
          >
            {isSubmitting ? "Enviando..." : "Confirmar pedido"}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Este checkout aceita apenas compras com saldo. Se o valor disponível não cobrir o pedido,
          ou se você preferir não usar saldo, a compra precisa ser feita na loja física.
        </p>
      </div>
    </div>
  );
};

export default Checkout;
