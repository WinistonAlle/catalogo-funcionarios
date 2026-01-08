import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, Maximize2, Minimize2, ClipboardList } from "lucide-react";

// Status reais usados no banco (ajuste aqui se o nome for diferente)
const STATUS_SEPARATION = "aguardando_separacao"; // Em separação
const STATUS_PENDING = "aguardando_pagamento"; // Aguardando pagamento
const STATUS_PAID = "pago"; // Pago

type OrderStatus = string;

type Order = {
  id: string;
  order_number: string;
  employee_id: string | null;
  employee_name?: string | null;
  total_items: number;
  total_value: number;
  status: OrderStatus;
  created_at: string;
  notes: string | null;

  paid_at?: string | null;
  ready_at?: string | null;

  // "pickup" | "wallet" | "split"
  payment_method?: string | null;

  // opcional se existir
  picked_up_at?: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

type HoverModalState = {
  open: boolean;
  x: number;
  y: number;
  order: Order | null;
};

const SeparationBoard: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [employeeNames, setEmployeeNames] = useState<Record<string, string>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ids que devem "pulsar" por 3s (pedido novo)
  const [pulseIds, setPulseIds] = useState<Record<string, number>>({}); // id -> expiresAt(ms)

  // hover modal
  const [hoverModal, setHoverModal] = useState<HoverModalState>({
    open: false,
    x: 0,
    y: 0,
    order: null,
  });

  // painel mostra: separação + aguardando pagamento + pago (pra filtrar wallet)
  const relevantStatuses = useMemo(
    () => [STATUS_SEPARATION, STATUS_PENDING, STATUS_PAID],
    []
  );

  const sortByCreatedAt = (a: Order, b: Order) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  // --------- Tela cheia ---------
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  // -------------------------------

  // ✅ pronto para retirada SOMENTE se payment_method === "wallet"
  const isWalletOnly = (order: Order) => {
    const pm = (order.payment_method || "").toLowerCase().trim();
    return pm === "wallet";
  };

  const paymentMethodLabelPT = (order: Order) => {
    const pm = (order.payment_method || "").toLowerCase().trim();
    if (pm === "wallet") return "Pago com saldo";
    // split entra como pagar na retirada (como você pediu)
    return "Pagar na retirada";
  };

  const closeHoverModal = () => {
    setHoverModal((s) => ({ ...s, open: false, order: null }));
  };

  // ✅ fecha modal se o pedido do modal sumir da lista (card desmonta e mouseleave não roda)
  useEffect(() => {
    if (!hoverModal.open || !hoverModal.order) return;

    const exists = orders.some((o) => o.id === hoverModal.order!.id);
    if (!exists) {
      closeHoverModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  // ✅ ESC fecha modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeHoverModal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ rolar fecha modal (evita “modal perdido”)
  useEffect(() => {
    const onScroll = () => {
      if (hoverModal.open) closeHoverModal();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverModal.open]);

  // pulse por 3s quando entra pedido novo em separação
  const markPulse = (orderId: string) => {
    const expiresAt = Date.now() + 3000;
    setPulseIds((prev) => ({ ...prev, [orderId]: expiresAt }));

    window.setTimeout(() => {
      setPulseIds((prev) => {
        const copy = { ...prev };
        if (copy[orderId] && copy[orderId] <= Date.now()) {
          delete copy[orderId];
        }
        return copy;
      });
    }, 3200);
  };

  // carrega nomes dos funcionários a partir dos IDs
  const loadEmployeeNames = async (employeeIds: string[]) => {
    const uniqueIds = Array.from(new Set(employeeIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;

    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name")
      .in("id", uniqueIds);

    if (error) {
      console.error("Erro ao buscar nomes de funcionários:", error);
      return;
    }

    const map: Record<string, string> = {};
    (data as Employee[]).forEach((emp) => {
      map[emp.id] = emp.full_name;
    });

    setEmployeeNames((prev) => ({ ...prev, ...map }));
  };

  const ensureEmployeeName = async (employeeId: string | null) => {
    if (!employeeId) return;
    if (employeeNames[employeeId]) return;

    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("id", employeeId)
      .maybeSingle();

    if (error || !data) return;

    const emp = data as Employee;
    setEmployeeNames((prev) => ({ ...prev, [emp.id]: emp.full_name }));
  };

  const fetchOrders = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", relevantStatuses)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao buscar pedidos para o painel:", error);
      setLoading(false);
      return;
    }

    const all = (data || []) as Order[];
    all.sort(sortByCreatedAt);
    setOrders(all);
    setLastUpdated(new Date());

    const employeeIds = all
      .map((o) => o.employee_id)
      .filter((id): id is string => !!id);
    loadEmployeeNames(employeeIds);

    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("orders-separation-board")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        async (payload) => {
          const newRow = payload.new as Order | null;
          const oldRow = payload.old as Order | null;

          setOrders((current) => {
            let updated = [...current];

            if (payload.eventType === "INSERT" && newRow) {
              if (relevantStatuses.includes(newRow.status)) {
                updated = updated.filter((o) => o.id !== newRow.id);
                updated.push(newRow);
                if (newRow.status === STATUS_SEPARATION) markPulse(newRow.id);
              }
            }

            if (payload.eventType === "UPDATE" && newRow && oldRow) {
              updated = updated.filter((o) => o.id !== oldRow.id);

              if (relevantStatuses.includes(newRow.status)) {
                updated.push(newRow);

                if (
                  oldRow.status !== STATUS_SEPARATION &&
                  newRow.status === STATUS_SEPARATION
                ) {
                  markPulse(newRow.id);
                }
              }
            }

            if (payload.eventType === "DELETE" && oldRow) {
              updated = updated.filter((o) => o.id !== oldRow.id);
            }

            updated.sort(sortByCreatedAt);
            setLastUpdated(new Date());
            return updated;
          });

          if (newRow?.employee_id) ensureEmployeeName(newRow.employee_id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const separatingOrders = orders.filter((o) => o.status === STATUS_SEPARATION);
  const pendingOrders = orders.filter((o) => o.status === STATUS_PENDING);

  // pronto para retirada: status pago + wallet-only
  const readyForPickupOrders = orders.filter(
    (o) => o.status === STATUS_PAID && isWalletOnly(o)
  );

  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatLastUpdated = () => {
    const date = lastUpdated || new Date();
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatMoney = (value: number) => {
    try {
      return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    } catch {
      return `R$ ${value.toFixed(2)}`;
    }
  };

  const getDisplayName = (order: Order) => {
    if (order.employee_name) return order.employee_name;
    if (order.employee_id && employeeNames[order.employee_id])
      return employeeNames[order.employee_id];
    return "Pedido";
  };

  // fluxo:
  // Em separação:
  //  - wallet => pago (vai pra pronto retirada)
  //  - pickup/split => aguardando pagamento
  // Aguardando pagamento => Pago (some do painel)
  // Pronto para retirada => finaliza retirada e some do painel
  const advanceOrder = async (order: Order) => {
    // ✅ fecha o modal imediatamente ao clicar (evita “modal preso”)
    closeHoverModal();

    const nowIso = new Date().toISOString();

    // 1) Em separação
    if (order.status === STATUS_SEPARATION) {
      const pm = (order.payment_method || "").toLowerCase().trim();

      const next: Partial<Order> =
        pm === "wallet"
          ? { status: STATUS_PAID, ready_at: nowIso, paid_at: nowIso }
          : { status: STATUS_PENDING, ready_at: nowIso };

      // otimista
      setOrders((curr) =>
        curr.map((o) => (o.id === order.id ? ({ ...o, ...next } as Order) : o))
      );
      setLastUpdated(new Date());

      const { error } = await supabase
        .from("orders")
        .update(next)
        .eq("id", order.id);

      if (error) console.error("Erro ao avançar pedido:", error);
      return;
    }

    // 2) Aguardando pagamento -> Pago
    if (order.status === STATUS_PENDING) {
      const next: Partial<Order> = { status: STATUS_PAID, paid_at: nowIso };

      // otimista
      setOrders((curr) =>
        curr.map((o) => (o.id === order.id ? ({ ...o, ...next } as Order) : o))
      );
      setLastUpdated(new Date());

      const { error } = await supabase
        .from("orders")
        .update(next)
        .eq("id", order.id);

      if (error) console.error("Erro ao avançar pedido:", error);
      return;
    }

    // 3) Pronto para retirada (pago + wallet) -> finalizar retirada
    if (order.status === STATUS_PAID && isWalletOnly(order)) {
      const next: Partial<Order> = { picked_up_at: nowIso };

      // otimista: some do painel
      setOrders((curr) => curr.filter((o) => o.id !== order.id));
      setLastUpdated(new Date());

      const { error } = await supabase
        .from("orders")
        .update(next as any)
        .eq("id", order.id);

      if (error) {
        console.warn(
          "Não consegui atualizar picked_up_at (talvez não exista).",
          error
        );
      }
      return;
    }
  };

  // ---------------- HOVER MODAL ----------------
  const onCardMouseMove = (e: React.MouseEvent, order: Order) => {
    const pad = 16;
    const x = Math.min(e.clientX + pad, window.innerWidth - 380);
    const y = Math.min(e.clientY + pad, window.innerHeight - 220);
    setHoverModal((s) => ({ ...s, x, y, order }));
  };

  const onCardMouseEnter = (e: React.MouseEvent, order: Order) => {
    const pad = 16;
    const x = Math.min(e.clientX + pad, window.innerWidth - 380);
    const y = Math.min(e.clientY + pad, window.innerHeight - 220);
    setHoverModal({ open: true, x, y, order });
  };

  const onCardMouseLeave = () => {
    closeHoverModal();
  };
  // --------------------------------------------

  const renderOrderCard = (
    order: Order,
    variant: "yellow" | "red" | "green",
    hintText: string
  ) => {
    const name = getDisplayName(order);

    const styles =
      variant === "yellow"
        ? {
            border: "border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.35)]",
            bg: "bg-yellow-50",
          }
        : variant === "red"
        ? {
            border: "border-red-400 shadow-[0_0_20px_rgba(248,113,113,0.35)]",
            bg: "bg-red-50",
          }
        : {
            border: "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]",
            bg: "bg-emerald-50",
          };

    const shouldPulse = !!pulseIds[order.id] && pulseIds[order.id] > Date.now();

    return (
      <button
        key={order.id}
        onClick={() => advanceOrder(order)}
        onMouseEnter={(e) => onCardMouseEnter(e, order)}
        onMouseMove={(e) => onCardMouseMove(e, order)}
        onMouseLeave={onCardMouseLeave}
        className={[
          "w-full text-left rounded-3xl border-2 px-4 md:px-6 py-4 md:py-5",
          "flex items-center justify-between cursor-pointer transition-transform duration-150",
          "hover:scale-[1.02] active:scale-[0.99]",
          styles.bg,
          styles.border,
          shouldPulse ? "animate-pulse" : "",
        ].join(" ")}
        style={
          shouldPulse
            ? ({ animationDuration: "3s" } as React.CSSProperties)
            : undefined
        }
      >
        <div className="flex flex-col gap-1">
          <span className="text-2xl md:text-4xl font-extrabold tracking-tight">
            {name}
          </span>

          <span className="text-xs md:text-sm text-slate-600">
            {order.total_items} item{order.total_items === 1 ? "" : "s"} •{" "}
            {formatMoney(order.total_value)}
          </span>
        </div>

        <div className="text-right text-xs md:text-sm text-slate-700">
          <div className="font-medium">Criado às {formatTime(order.created_at)}</div>

          {order.ready_at && (
            <div>
              Pronto às{" "}
              <span className="font-semibold">{formatTime(order.ready_at)}</span>
            </div>
          )}

          {order.paid_at && (
            <div>
              Pago às{" "}
              <span className="font-semibold">{formatTime(order.paid_at)}</span>
            </div>
          )}

          <div className="mt-1 text-[0.65rem] md:text-xs text-slate-500">
            {hintText}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      <header className="w-full border-b border-slate-700 bg-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Painel de Pedidos
            </h1>
            <span className="text-xs md:text-sm uppercase tracking-[0.25em] text-slate-200/90">
              GOSTINHO MINEIRO
            </span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={toggleFullScreen}
              aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              className="px-3 py-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition flex items-center justify-center"
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </button>
            <div className="text-xs md:text-sm text-slate-100 font-medium">
              Atualizado em{" "}
              <span className="font-bold">{formatLastUpdated()}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="relative flex-1 max-w-7xl mx-auto w-full px-4 md:px-6 py-4 md:py-6 flex flex-col gap-4 md:gap-6">
        {loading && (
          <div className="text-center text-slate-500 text-xl md:text-2xl">
            Carregando pedidos...
          </div>
        )}

        <div className="hidden md:block pointer-events-none absolute inset-y-0 left-1/3 w-px bg-slate-200" />
        <div className="hidden md:block pointer-events-none absolute inset-y-0 left-2/3 w-px bg-slate-200" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 h-full">
          {/* Em separação */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-lg p-4 md:p-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.9)]" />
                Em separação
              </h2>
              <span className="text-xs md:text-sm text-slate-500">
                {separatingOrders.length} pedido
                {separatingOrders.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              {separatingOrders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-base md:text-lg text-center px-4">
                  Nenhum pedido em separação
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4 overflow-y-auto pr-1 pb-2">
                  {separatingOrders.map((order) =>
                    renderOrderCard(
                      order,
                      "yellow",
                      isWalletOnly(order)
                        ? "Clique: pronto para retirada"
                        : "Clique: enviar para pagamento"
                    )
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Aguardando pagamento */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-lg p-4 md:p-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(248,113,113,0.9)]" />
                Aguardando pagamento
              </h2>
              <span className="text-xs md:text-sm text-slate-500">
                {pendingOrders.length} pedido
                {pendingOrders.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              {pendingOrders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-base md:text-lg text-center px-4">
                  Nenhum pedido aguardando pagamento
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4 overflow-y-auto pr-1 pb-2">
                  {pendingOrders.map((order) =>
                    renderOrderCard(order, "red", "Clique: marcar como pago")
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Pronto para retirada (wallet only) */}
          <section className="bg-white rounded-3xl border border-slate-200 shadow-lg p-4 md:p-5 flex flex-col min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/15">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </span>
                Pronto para retirada
              </h2>
              <span className="text-xs md:text-sm text-slate-500">
                {readyForPickupOrders.length} pedido
                {readyForPickupOrders.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="flex-1 overflow-hidden">
              {readyForPickupOrders.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-base md:text-lg text-center px-4">
                  Nenhum pedido pronto para retirada
                </div>
              ) : (
                <div className="space-y-3 md:space-y-4 overflow-y-auto pr-1 pb-2">
                  {readyForPickupOrders.map((order) =>
                    renderOrderCard(order, "green", "Clique: finalizar retirada")
                  )}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Hover modal (detalhes) */}
        {hoverModal.open && hoverModal.order && (
          <div
            className="fixed z-50 w-[360px] rounded-2xl border border-slate-200 bg-white shadow-2xl p-4 pointer-events-none"
            style={{ left: hoverModal.x, top: hoverModal.y }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  <span>Detalhes do pedido</span>
                </div>
                <div className="mt-1 text-lg font-extrabold text-slate-900 truncate">
                  {getDisplayName(hoverModal.order)}
                </div>
              </div>

              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                {hoverModal.order.status === STATUS_SEPARATION
                  ? "Em separação"
                  : hoverModal.order.status === STATUS_PENDING
                  ? "Aguardando pagamento"
                  : "Pronto p/ retirada"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="text-[11px] text-slate-500">Itens</div>
                <div className="font-bold">{hoverModal.order.total_items}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="text-[11px] text-slate-500">Total</div>
                <div className="font-bold">
                  {formatMoney(hoverModal.order.total_value)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="text-[11px] text-slate-500">Criado</div>
                <div className="font-semibold">
                  {formatTime(hoverModal.order.created_at)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2">
                <div className="text-[11px] text-slate-500">Pagamento</div>
                <div className="font-semibold">
                  {paymentMethodLabelPT(hoverModal.order)}
                </div>
              </div>
            </div>

            {hoverModal.order.notes && (
              <div className="mt-3 rounded-xl bg-slate-50 p-2">
                <div className="text-[11px] text-slate-500">Observações</div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">
                  {hoverModal.order.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default SeparationBoard;
