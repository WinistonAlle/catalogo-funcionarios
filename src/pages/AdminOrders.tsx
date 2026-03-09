// src/pages/AdminOrders.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  order_number: string | null;
  employee_id: string | null;
  employee_cpf: string | null;
  employee_name: string | null;

  total_items: number | null;
  total_value: number | null; // legacy (R$)
  total_cents: number | null; // new (cents)

  wallet_used_cents: number | null; // new (cents)
  spent_from_balance_cents: number | null; // new (cents) (fallback)
  pay_on_pickup_cents: number | null; // new (cents)

  status: string | null;
  created_at: string;

  cancelled_at: string | null;
  cancel_reason: string | null;
};

type AdminActionRow = {
  id: string;
  order_id: string;
  actor_cpf: string | null;
  action: string;
  reason: string | null;
  created_at: string;
};

type CancellationLogRow = {
  order_id: string;
  order_number: string | null;

  employee_cpf: string | null;
  employee_name: string | null;

  actor_cpf: string | null;
  actor_name: string | null;

  cancelled_at: string | null;
  reason: string | null;

  total_value: number | null;
  total_cents: number | null;
  wallet_used_cents: number | null;
  spent_from_balance_cents: number | null;
  pay_on_pickup_cents: number | null;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string | null;

  quantity: number | null;

  unit_price_cents: number | null;
  total_cents: number | null; // calculado no front
};

const CATALOG_ROUTE = "/catalogo"; // ajuste se seu catálogo tiver outro path

const STATUS_LABEL: Record<string, string> = {
  aguardando_separacao: "Aguardando separação",
  em_separacao: "Em separação",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function onlyDigits(s: string) {
  return (s || "").replace(/\D/g, "");
}

function formatCPF(raw?: string | null) {
  const digits = onlyDigits(raw || "").slice(0, 11);
  if (!digits) return "—";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function brlFromCents(cents?: number | null) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function brlFromReais(reais?: number | null) {
  return Number(reais || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toCentsFromOrder(
  order: Pick<OrderRow, "total_cents" | "total_value">,
) {
  const cents = Number(order.total_cents ?? 0);
  if (cents > 0) return cents;
  const legacy = Number(order.total_value ?? 0);
  return Math.round(legacy * 100);
}

function getWalletUsed(
  order: Pick<OrderRow, "wallet_used_cents" | "spent_from_balance_cents">,
) {
  const a = Number(order.wallet_used_cents ?? 0);
  if (a > 0) return a;
  return Number(order.spent_from_balance_cents ?? 0);
}

type PaymentKind = "wallet" | "pickup" | "mixed" | "none";

function getPaymentMeta(
  order: Pick<
    OrderRow,
    | "total_cents"
    | "total_value"
    | "wallet_used_cents"
    | "spent_from_balance_cents"
    | "pay_on_pickup_cents"
  >,
) {
  const total = toCentsFromOrder(order as any);
  const wallet = getWalletUsed(order as any);
  const pickup =
    order.pay_on_pickup_cents === null ||
    typeof order.pay_on_pickup_cents === "undefined"
      ? Math.max(0, total - wallet)
      : Number(order.pay_on_pickup_cents || 0);

  let kind: PaymentKind = "none";
  if (wallet > 0 && pickup > 0) kind = "mixed";
  else if (wallet > 0) kind = "wallet";
  else if (pickup > 0) kind = "pickup";
  else kind = "none";

  const tooltip =
    kind === "wallet"
      ? `Pago com saldo: ${brlFromCents(wallet)}`
      : kind === "pickup"
        ? `Pagar na retirada: ${brlFromCents(pickup)}`
        : kind === "mixed"
          ? `Saldo: ${brlFromCents(wallet)}\nRetirada: ${brlFromCents(pickup)}`
          : "Sem informação";

  return { total, wallet, pickup, kind, tooltip };
}

function IconWallet({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3.5 7.5A3 3 0 0 1 6.5 4.5h11a3 3 0 0 1 3 3v1.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3.5 9.5h14.75a2.25 2.25 0 0 1 2.25 2.25v6.25A3.5 3.5 0 0 1 17 21.5H6.5a3 3 0 0 1-3-3v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16.8 13.2h3.7v3.6h-3.7a1.8 1.8 0 0 1 0-3.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M18.2 15h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPickup({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 18a2 2 0 1 0 0.001 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17 18a2 2 0 1 0 0.001 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3.5 6.5h2l2.2 10.5h9.8l2-7H7.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 9.5h14.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMixed({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6.5 6.5h11a3 3 0 0 1 3 3v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3.5 9.5h14.5a2.5 2.5 0 0 1 2.5 2.5v6A3.5 3.5 0 0 1 17 21.5H7a3.5 3.5 0 0 1-3.5-3.5v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M7 15h4M13 15h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Badge({ kind, tooltip }: { kind: PaymentKind; tooltip: string }) {
  const cfg = useMemo(() => {
    if (kind === "wallet") {
      return {
        label: "Saldo",
        icon: <IconWallet />,
        style: {
          background: "rgba(16,185,129,0.12)",
          color: "#065F46",
          borderColor: "rgba(16,185,129,0.22)",
        },
      };
    }
    if (kind === "pickup") {
      return {
        label: "Retirada",
        icon: <IconPickup />,
        style: {
          background: "rgba(107,114,128,0.10)",
          color: "#374151",
          borderColor: "rgba(107,114,128,0.22)",
        },
      };
    }
    if (kind === "mixed") {
      return {
        label: "Misto",
        icon: <IconMixed />,
        style: {
          background: "rgba(99,102,241,0.12)",
          color: "#3730A3",
          borderColor: "rgba(99,102,241,0.22)",
        },
      };
    }
    return {
      label: "N/D",
      icon: null,
      style: {
        background: "rgba(0,0,0,0.05)",
        color: "#111827",
        borderColor: "rgba(0,0,0,0.12)",
      },
    };
  }, [kind]);

  return (
    <span
      className="gm-tip"
      data-tip={tooltip}
      style={{ ...styles.badge, ...(cfg.style as any) }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {cfg.icon}
        <span>{cfg.label}</span>
      </span>
    </span>
  );
}

function statusPill(status?: string | null): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(0,0,0,0.08)",
    whiteSpace: "nowrap",
  };

  switch (status) {
    case "aguardando_separacao":
      return { ...base, background: "rgba(59,130,246,0.10)", color: "#1D4ED8" };
    case "em_separacao":
      return { ...base, background: "rgba(245,158,11,0.12)", color: "#92400E" };
    case "pronto_para_retirada":
      return { ...base, background: "rgba(16,185,129,0.12)", color: "#065F46" };
    case "entregue":
      return { ...base, background: "rgba(34,197,94,0.12)", color: "#166534" };
    case "cancelado":
      return { ...base, background: "rgba(239,68,68,0.12)", color: "#991B1B" };
    default:
      return { ...base, background: "rgba(0,0,0,0.04)", color: "#111827" };
  }
}

/** Hook: isMobile reativo */
function useIsMobile(breakpoint = 940) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [breakpoint]);

  return isMobile;
}

export default function AdminOrders() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [cpfFilter, setCpfFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);

  const [history, setHistory] = useState<AdminActionRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [cancelHistOpen, setCancelHistOpen] = useState(false);
  const [cancelLogs, setCancelLogs] = useState<CancellationLogRow[]>([]);
  const [cancelLogsLoading, setCancelLogsLoading] = useState(false);
  const [cancelLogsErr, setCancelLogsErr] = useState<string | null>(null);

  // ✅ Itens do pedido
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsErr, setItemsErr] = useState<string | null>(null);

  const [removeReason, setRemoveReason] = useState("");
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);

  const isMobile = useIsMobile(940);

  function actorCpfFromLocalStorage() {
    if (typeof window === "undefined") return "";

    const possible =
      localStorage.getItem("gm_employee_cpf") ||
      localStorage.getItem("employee_cpf") ||
      localStorage.getItem("cpf");

    if (possible) return onlyDigits(possible);

    try {
      const raw = localStorage.getItem("employee_session");
      if (!raw) return "";
      const obj = JSON.parse(raw);
      return onlyDigits(obj?.cpf || obj?.employee_cpf || "");
    } catch {
      return "";
    }
  }

  async function getActorCpf(): Promise<string> {
    const fromLocal = actorCpfFromLocalStorage();
    if (fromLocal) return fromLocal;

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return "";

    const { data: emp, error } = await supabase
      .from("employees")
      .select("cpf")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return "";

    return onlyDigits((emp as any)?.cpf || "");
  }

  async function fetchEmployeeMap(): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    const { data: rpcData } = await supabase.rpc("admin_get_employees_basic");
    if (Array.isArray(rpcData)) {
      for (const r of rpcData as any[]) {
        const cpf = onlyDigits(r?.cpf || "");
        const nm = r?.full_name || null;
        if (cpf && nm) map.set(cpf, nm);
      }
      return map;
    }

    const { data } = await supabase.from("employees").select("cpf, full_name");
    if (Array.isArray(data)) {
      for (const r of data as any[]) {
        const cpf = onlyDigits(r?.cpf || "");
        const nm = r?.full_name || null;
        if (cpf && nm) map.set(cpf, nm);
      }
    }
    return map;
  }

  async function loadOrders() {
    setLoading(true);
    setErr(null);

    let q = supabase
      .from("orders")
      .select(
        [
          "id",
          "order_number",
          "employee_id",
          "employee_cpf",
          "employee_name",
          "total_items",
          "total_value",
          "total_cents",
          "wallet_used_cents",
          "spent_from_balance_cents",
          "pay_on_pickup_cents",
          "status",
          "created_at",
          "cancelled_at",
          "cancel_reason",
        ].join(","),
      )
      .order("created_at", { ascending: false });

    const cpf = onlyDigits(cpfFilter);
    if (cpf) q = q.ilike("employee_cpf", `%${cpf}%`);
    if (orderFilter.trim())
      q = q.ilike("order_number", `%${orderFilter.trim()}%`);
    if (statusFilter) q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) {
      setErr(error.message);
      setOrders([]);
      setLoading(false);
      return;
    }

    const list = (Array.isArray(data) ? data : []) as unknown as OrderRow[];

    const needName = list.some((o) => !o.employee_name && o.employee_cpf);
    if (needName) {
      const cpfMap = await fetchEmployeeMap();
      const patched = list.map((o) => {
        if (o.employee_name) return o;
        const cpfKey = onlyDigits(o.employee_cpf || "");
        return { ...o, employee_name: cpfMap.get(cpfKey) ?? null };
      });
      setOrders(patched);
    } else {
      setOrders(list);
    }

    setLoading(false);
  }

  async function reloadSelectedOrder(orderId: string) {
    const { data, error } = await supabase
      .from("orders")
      .select(
        [
          "id",
          "order_number",
          "employee_id",
          "employee_cpf",
          "employee_name",
          "total_items",
          "total_value",
          "total_cents",
          "wallet_used_cents",
          "spent_from_balance_cents",
          "pay_on_pickup_cents",
          "status",
          "created_at",
          "cancelled_at",
          "cancel_reason",
        ].join(","),
      )
      .eq("id", orderId)
      .maybeSingle();

    if (!error && data) setSelected(data as any);
  }

  async function loadHistory(orderId: string) {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("order_admin_actions")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) setHistory([]);
    else setHistory(Array.isArray(data) ? (data as AdminActionRow[]) : []);
    setHistoryLoading(false);
  }

  // ✅ Robust: não depende de colunas específicas existirem no order_items
  async function loadOrderItems(orderId: string) {
    setItemsLoading(true);
    setItemsErr(null);

    try {
      // 1) tenta ordenar por created_at (se existir)
      let res = await supabase
        .from("order_items")
        .select("*, products(name)")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      // 2) fallback: schema não tem created_at
      if (
        res.error &&
        String(res.error.message || "")
          .toLowerCase()
          .includes("created_at")
      ) {
        res = await supabase
          .from("order_items")
          .select("*, products(name)")
          .eq("order_id", orderId)
          .order("id", { ascending: true });
      }

      if (res.error) throw new Error(res.error.message);

      const rows = (Array.isArray(res.data) ? res.data : []) as any[];

      const mapped: OrderItemRow[] = rows.map((r) => {
        const q = Number(r?.quantity ?? r?.qtd ?? r?.amount ?? r?.qty ?? 0);

        const unitCents =
          Number(r?.unit_price_cents ?? 0) ||
          Number(r?.price_cents ?? 0) ||
          Math.round(Number(r?.unit_price ?? 0) * 100) ||
          Math.round(Number(r?.price ?? 0) * 100) ||
          Math.round(Number(r?.unit_value ?? 0) * 100) ||
          Math.round(Number(r?.value ?? 0) * 100) ||
          0;

        const name = r?.products?.name ?? r?.product_name ?? r?.name ?? null;

        return {
          id: r.id,
          order_id: r.order_id,
          product_id: r.product_id ?? null,
          product_name: name,
          quantity: q,
          unit_price_cents: unitCents,
          total_cents: q * unitCents,
        };
      });

      setOrderItems(mapped);
    } catch (e: any) {
      setItemsErr(e?.message || "Erro ao carregar itens do pedido");
      setOrderItems([]);
    } finally {
      setItemsLoading(false);
    }
  }

  async function cancelOrder() {
    if (!selected) return;

    const actorCpf = await getActorCpf();
    if (!actorCpf) {
      alert(
        "Não encontrei seu CPF de login (localStorage/Auth). Faça login novamente.\n\nDica: no iPhone/PWA o Safari às vezes limpa o storage.",
      );
      return;
    }
    if (!cancelReason.trim()) {
      alert("Informe o motivo do cancelamento.");
      return;
    }

    setCanceling(true);
    const { error } = await supabase.rpc("admin_cancel_order_v2", {
      p_order_id: selected.id,
      p_reason: cancelReason,
      p_actor_cpf: actorCpf,
    });

    if (error) {
      alert(error.message);
      setCanceling(false);
      return;
    }

    setSelected(null);
    setCancelReason("");
    await loadOrders();
    setCanceling(false);
  }

  // ✅ Remover item (RPC v2)
  async function removeOrderItem(item: OrderItemRow) {
    if (!selected) return;

    if (!removeReason.trim()) {
      alert("Informe o motivo da remoção do item.");
      return;
    }

    const actorCpf = await getActorCpf();
    if (!actorCpf) {
      alert(
        "Não encontrei seu CPF de login (localStorage/Auth). Faça login novamente.",
      );
      return;
    }

    const ok = confirm(
      `Remover este item do pedido?\n\n${item.product_name || "Produto"}\nQtd: ${item.quantity ?? 0}\nValor: ${brlFromCents(
        item.total_cents,
      )}\n\nIsso pode estornar saldo do funcionário.`,
    );
    if (!ok) return;

    setRemovingItemId(item.id);

    const { error } = await supabase.rpc("admin_remove_order_item_v2", {
      p_order_id: selected.id,
      p_order_item_id: item.id,
      p_reason: removeReason,
      p_actor_cpf: actorCpf,
    });

    if (error) {
      alert(error.message);
      setRemovingItemId(null);
      return;
    }

    await loadOrders();
    await reloadSelectedOrder(selected.id);
    await loadOrderItems(selected.id);
    await loadHistory(selected.id);

    setRemoveReason("");
    setRemovingItemId(null);
  }

  async function loadCancellationHistory() {
    setCancelLogsLoading(true);
    setCancelLogsErr(null);

    try {
      const cpfMap = await fetchEmployeeMap();

      const { data: actions, error: aErr } = await supabase
        .from("order_admin_actions")
        .select("order_id, actor_cpf, reason, created_at, action")
        .eq("action", "cancel_order")
        .order("created_at", { ascending: false })
        .limit(200);

      if (aErr) throw new Error(aErr.message);

      const actionRows = (Array.isArray(actions) ? actions : []) as any[];
      const orderIds = Array.from(
        new Set(actionRows.map((x) => x.order_id).filter(Boolean)),
      );

      const { data: ords, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, order_number, employee_cpf, employee_name, total_value, total_cents, wallet_used_cents, spent_from_balance_cents, pay_on_pickup_cents, cancelled_at",
        )
        .in("id", orderIds);

      if (oErr) throw new Error(oErr.message);

      const orderMap = new Map<string, any>();
      for (const o of (Array.isArray(ords) ? ords : []) as any[])
        orderMap.set(o.id, o);

      const merged: CancellationLogRow[] = actionRows.map((a) => {
        const ord = orderMap.get(a.order_id);
        const empCpfKey = onlyDigits(ord?.employee_cpf || "");
        const actorCpfKey = onlyDigits(a?.actor_cpf || "");

        return {
          order_id: a.order_id,
          order_number: ord?.order_number ?? null,
          employee_cpf: ord?.employee_cpf ?? null,
          employee_name: ord?.employee_name ?? cpfMap.get(empCpfKey) ?? null,
          actor_cpf: a?.actor_cpf ?? null,
          actor_name: cpfMap.get(actorCpfKey) ?? null,
          cancelled_at: ord?.cancelled_at ?? a?.created_at ?? null,
          reason: a?.reason ?? null,
          total_value: ord?.total_value ?? null,
          total_cents: ord?.total_cents ?? null,
          wallet_used_cents: ord?.wallet_used_cents ?? null,
          spent_from_balance_cents: ord?.spent_from_balance_cents ?? null,
          pay_on_pickup_cents: ord?.pay_on_pickup_cents ?? null,
        };
      });

      setCancelLogs(merged);
    } catch (e: any) {
      setCancelLogsErr(
        e?.message || "Erro ao carregar histórico de cancelamentos",
      );
      setCancelLogs([]);
    } finally {
      setCancelLogsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (selected) {
      loadHistory(selected.id);
      loadOrderItems(selected.id);
      setRemoveReason("");
      setItemsErr(null);
    } else {
      setOrderItems([]);
      setItemsErr(null);
      setItemsLoading(false);
      setRemovingItemId(null);
      setRemoveReason("");
    }
  }, [selected]);

  const summary = useMemo(() => {
    const total = orders.length;
    const canceled = orders.filter((o) => o.status === "cancelado").length;
    const delivered = orders.filter((o) => o.status === "entregue").length;
    const pending = orders.filter((o) =>
      ["aguardando_separacao", "em_separacao", "pronto_para_retirada"].includes(
        o.status || "",
      ),
    ).length;
    const withWallet = orders.filter((o) => getWalletUsed(o) > 0).length;
    return { total, canceled, delivered, pending, withWallet };
  }, [orders]);

  const isManageLocked = (o?: OrderRow | null) => {
    const st = o?.status || "";
    return st === "cancelado" || st === "entregue";
  };

  const kpisWrapStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return styles.kpis;
    return {
      display: "flex",
      gap: 12,
      overflowX: "auto",
      paddingBottom: 6,
      WebkitOverflowScrolling: "touch",
      scrollSnapType: "x mandatory",
      marginBottom: 14,
    };
  }, [isMobile]);

  const kpiCardStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return styles.kpiCard;
    return {
      ...styles.kpiCard,
      minWidth: 160,
      flex: "0 0 auto",
      scrollSnapAlign: "start",
    };
  }, [isMobile]);

  const filtersGridStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return styles.filtersGrid;
    return { display: "grid", gridTemplateColumns: "1fr", gap: 12 };
  }, [isMobile]);

  const headerInnerStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return styles.headerInner;
    return {
      ...styles.headerInner,
      padding: "12px 14px",
      flexDirection: "column",
      alignItems: "stretch",
      gap: 10,
    };
  }, [isMobile]);

  const headerTopRowStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return { display: "flex", alignItems: "center", gap: 12 };
    return {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    };
  }, [isMobile]);

  const headerActionsStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return { display: "flex", alignItems: "center", gap: 10 };
    return {
      display: "grid",
      gridTemplateColumns: "1fr 90px",
      gap: 10,
      alignItems: "center",
    };
  }, [isMobile]);

  const mainStyle: CSSProperties = useMemo(() => {
    if (!isMobile) return styles.main;
    return { ...styles.main, padding: "14px 14px 22px" };
  }, [isMobile]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={headerInnerStyle}>
          <div style={headerTopRowStyle}>
            <button
              style={{
                ...styles.backBtn,
                ...(isMobile
                  ? { width: "auto", height: 38, borderRadius: 12 }
                  : {}),
              }}
              onClick={() => navigate(CATALOG_ROUTE)}
              title="Voltar ao catálogo"
            >
              {isMobile ? "← Catálogo" : "← Voltar ao catálogo"}
            </button>

            <div style={{ flex: 1, marginLeft: isMobile ? 0 : 10 }}>
              <div style={styles.hTitle}>Administração de pedidos</div>
              <div style={styles.hSub}>
                Visualize, cancele, remova itens e consulte histórico
              </div>
            </div>

            {isMobile && <span style={styles.headerChip}>Admin</span>}
          </div>

          <div style={headerActionsStyle}>
            <button
              style={{
                ...styles.ghostBtn,
                ...(isMobile
                  ? { width: "100%", height: 42, borderRadius: 14 }
                  : {}),
              }}
              onClick={() => {
                setCancelHistOpen(true);
                loadCancellationHistory();
              }}
              title="Ver histórico de cancelamentos"
            >
              {isMobile
                ? "Histórico (cancelamentos)"
                : "Histórico de cancelamentos"}
            </button>

            {!isMobile && <span style={styles.headerChip}>Admin</span>}
          </div>
        </div>
      </header>

      <main style={mainStyle}>
        <section style={kpisWrapStyle}>
          <div style={kpiCardStyle}>
            <div style={styles.kpiLabel}>Total</div>
            <div style={styles.kpiValue}>{summary.total}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={styles.kpiLabel}>Pendentes</div>
            <div style={styles.kpiValue}>{summary.pending}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={styles.kpiLabel}>Entregues</div>
            <div style={styles.kpiValue}>{summary.delivered}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={styles.kpiLabel}>Cancelados</div>
            <div style={styles.kpiValue}>{summary.canceled}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={styles.kpiLabel}>Com saldo</div>
            <div style={styles.kpiValue}>{summary.withWallet}</div>
          </div>

          <button
            style={{
              ...styles.refreshBtn,
              ...(isMobile
                ? {
                    minWidth: 140,
                    height: 46,
                    flex: "0 0 auto",
                    scrollSnapAlign: "start",
                  }
                : {}),
            }}
            onClick={loadOrders}
            title="Atualizar"
          >
            Atualizar
          </button>
        </section>

        <section style={styles.filters}>
          <div style={filtersGridStyle}>
            <div style={styles.field}>
              <label style={styles.label}>CPF</label>
              <input
                style={styles.input}
                placeholder="Digite o CPF"
                inputMode="numeric"
                value={cpfFilter}
                onChange={(e) => setCpfFilter(e.target.value)}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Nº do pedido</label>
              <input
                style={styles.input}
                placeholder="Ex.: GM-20260102-1234"
                value={orderFilter}
                onChange={(e) => setOrderFilter(e.target.value)}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Status</label>
              <select
                style={styles.select}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos</option>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>&nbsp;</label>
              <button
                style={{ ...styles.primaryBtn, width: "100%" }}
                onClick={loadOrders}
              >
                Filtrar
              </button>
            </div>
          </div>

          <div style={styles.helpRow}>
            <span style={styles.helpText}>
              {isMobile
                ? "Toque no badge de pagamento (segure) para ver detalhes."
                : "Passe o mouse sobre o badge de pagamento para ver detalhes."}
            </span>
          </div>
        </section>

        {loading && (
          <div style={styles.stateBox}>
            <div style={styles.spinner} />
            <div>
              <div style={styles.stateTitle}>Carregando pedidos…</div>
              <div style={styles.stateText}>Aguarde alguns segundos.</div>
            </div>
          </div>
        )}

        {err && !loading && (
          <div
            style={{ ...styles.stateBox, borderColor: "rgba(239,68,68,0.35)" }}
          >
            <div style={styles.errorDot} />
            <div>
              <div style={{ ...styles.stateTitle, color: "#991B1B" }}>
                Erro ao carregar
              </div>
              <div style={styles.stateText}>{err}</div>
            </div>
          </div>
        )}

        {!loading && !err && orders.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyTitle}>Nenhum pedido encontrado</div>
            <div style={styles.emptyText}>
              Ajuste os filtros ou tente novamente.
            </div>
          </div>
        )}

        {!loading && !err && orders.length > 0 && (
          <>
            {!isMobile ? (
              <div style={styles.tableCard}>
                <div style={styles.tableHeader}>
                  <div style={styles.tableTitle}>Pedidos</div>
                  <div style={styles.tableSub}>
                    Mostrando <b>{orders.length}</b> registro(s)
                  </div>
                </div>

                <div style={styles.tableScroll}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Pedido</th>
                        <th style={styles.th}>Funcionário</th>
                        <th style={styles.th}>Pagamento</th>
                        <th style={styles.th}>Total</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Data</th>
                        <th style={{ ...styles.th, textAlign: "right" }}>
                          Ações
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {orders.map((o) => {
                        const meta = getPaymentMeta(o);
                        const isCanceled = o.status === "cancelado";

                        return (
                          <tr key={o.id} style={styles.tr}>
                            <td style={styles.tdStrong}>
                              {o.order_number || "—"}
                              <div style={styles.tdMuted}>{o.id}</div>
                            </td>

                            <td style={styles.td}>
                              <div style={{ fontWeight: 950 }}>
                                {o.employee_name || "Nome não encontrado"}
                              </div>
                              <div style={styles.tdMuted}>
                                {formatCPF(o.employee_cpf)}
                              </div>
                            </td>

                            <td style={styles.td}>
                              <Badge kind={meta.kind} tooltip={meta.tooltip} />
                              <div style={styles.payMini}>
                                {meta.wallet > 0 && (
                                  <span style={styles.payLine}>
                                    Saldo: {brlFromCents(meta.wallet)}
                                  </span>
                                )}
                                {meta.pickup > 0 && (
                                  <span style={styles.payLine}>
                                    Retirada: {brlFromCents(meta.pickup)}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={styles.td}>
                              {o.total_cents
                                ? brlFromCents(o.total_cents)
                                : brlFromReais(o.total_value)}
                            </td>

                            <td style={styles.td}>
                              <span style={statusPill(o.status)}>
                                {STATUS_LABEL[o.status || ""] ||
                                  o.status ||
                                  "—"}
                              </span>
                            </td>

                            <td style={styles.td}>
                              {new Date(o.created_at).toLocaleString("pt-BR")}
                            </td>

                            <td style={{ ...styles.td, textAlign: "right" }}>
                              <button
                                style={{
                                  ...styles.smallBtn,
                                  ...(isCanceled ? styles.disabledBtn : {}),
                                }}
                                disabled={isCanceled}
                                onClick={() => setSelected(o)}
                              >
                                Gerenciar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={styles.mobileList}>
                {orders.map((o) => {
                  const meta = getPaymentMeta(o);
                  const isCanceled = o.status === "cancelado";

                  return (
                    <div key={o.id} style={styles.mobileCard}>
                      <div style={styles.mobileTop}>
                        <div style={{ minWidth: 0 }}>
                          <div style={styles.mobileTitle}>
                            {o.order_number || "—"}
                          </div>
                          <div
                            style={styles.mobileSub}
                            title={o.employee_name || ""}
                          >
                            <b
                              style={{
                                display: "inline-block",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {o.employee_name || "Nome não encontrado"}
                            </b>{" "}
                            • {formatCPF(o.employee_cpf)}
                          </div>
                          <div style={styles.mobileSub}>
                            {new Date(o.created_at).toLocaleString("pt-BR")}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                            gap: 8,
                          }}
                        >
                          <span style={statusPill(o.status)}>
                            {STATUS_LABEL[o.status || ""] || o.status || "—"}
                          </span>
                          <Badge kind={meta.kind} tooltip={meta.tooltip} />
                        </div>
                      </div>

                      <div style={styles.mobileBottom}>
                        <div>
                          <div style={styles.mobileTotal}>
                            {o.total_cents
                              ? brlFromCents(o.total_cents)
                              : brlFromReais(o.total_value)}
                          </div>
                          <div style={styles.payMini}>
                            {meta.wallet > 0 && (
                              <span style={styles.payLine}>
                                Saldo: {brlFromCents(meta.wallet)}
                              </span>
                            )}
                            {meta.pickup > 0 && (
                              <span style={styles.payLine}>
                                Retirada: {brlFromCents(meta.pickup)}
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          style={{
                            ...styles.primaryBtn,
                            padding: "10px 12px",
                            height: 42,
                            borderRadius: 14,
                            ...(isCanceled ? styles.disabledBtn : {}),
                          }}
                          disabled={isCanceled}
                          onClick={() => setSelected(o)}
                        >
                          {isCanceled ? "Cancelado" : "Gerenciar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      <footer style={styles.footer}>
        <div style={styles.footerInner}>
          <span style={styles.footerText}>
            Gostinho Mineiro • Catálogo Funcionários
          </span>
          <span style={styles.footerTextMuted}>Painel interno</span>
        </div>
      </footer>

      {/* Modal: gerenciar pedido */}
      {selected && (
        <div style={styles.overlay} role="dialog" aria-modal="true">
          <div
            style={{
              ...styles.modal,
              ...(isMobile
                ? {
                    width: "100%",
                    height: "min(100vh - 24px, 900px)",
                    maxHeight: "calc(100vh - 24px)",
                    borderRadius: 18,
                  }
                : {}),
            }}
          >
            <div style={styles.modalTop}>
              <div style={{ minWidth: 0 }}>
                <div style={styles.modalTitle}>
                  Pedido {selected.order_number || "—"}
                </div>
                <div style={styles.modalSub}>
                  {selected.employee_name || "Nome não encontrado"} •{" "}
                  {formatCPF(selected.employee_cpf)} •{" "}
                  {new Date(selected.created_at).toLocaleString("pt-BR")}
                </div>
              </div>

              <button
                style={styles.iconBtn}
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                ...styles.modalBody,
                ...(isMobile ? { padding: 12, overflow: "auto" } : {}),
              }}
            >
              {/* Resumo */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Resumo</div>

                {(() => {
                  const meta = getPaymentMeta(selected);
                  const summaryGridStyle: CSSProperties = isMobile
                    ? {
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }
                    : styles.summaryGrid;

                  const summaryItemStyle: CSSProperties = {
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    minWidth: 0,
                  };

                  return (
                    <div style={summaryGridStyle}>
                      <div style={summaryItemStyle}>
                        <div style={styles.summaryLabel}>Status</div>
                        <span style={statusPill(selected.status)}>
                          {STATUS_LABEL[selected.status || ""] ||
                            selected.status ||
                            "—"}
                        </span>
                      </div>

                      <div style={summaryItemStyle}>
                        <div style={styles.summaryLabel}>Total</div>
                        <div style={styles.summaryValue}>
                          {selected.total_cents
                            ? brlFromCents(selected.total_cents)
                            : brlFromReais(selected.total_value)}
                        </div>
                      </div>

                      <div style={summaryItemStyle}>
                        <div style={styles.summaryLabel}>Pagamento</div>
                        <Badge kind={meta.kind} tooltip={meta.tooltip} />
                      </div>

                      <div style={summaryItemStyle}>
                        <div style={styles.summaryLabel}>Saldo</div>
                        <div style={styles.summaryValue}>
                          {brlFromCents(meta.wallet)}
                        </div>
                      </div>

                      <div style={summaryItemStyle}>
                        <div style={styles.summaryLabel}>Retirada</div>
                        <div style={styles.summaryValue}>
                          {brlFromCents(meta.pickup)}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Itens do pedido + remoção */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Itens do pedido</div>
                <div style={styles.sectionHint}>
                  Remova itens em falta. Se o pedido usou saldo, o sistema
                  estorna automaticamente a parte correspondente do item.
                  {isManageLocked(selected)
                    ? " (Pedidos entregues/cancelados ficam travados.)"
                    : ""}
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={styles.field}>
                    <label style={styles.label}>
                      Motivo da remoção (obrigatório)
                    </label>
                    <input
                      style={styles.input}
                      placeholder="Ex.: Item sem estoque"
                      value={removeReason}
                      onChange={(e) => setRemoveReason(e.target.value)}
                      disabled={isManageLocked(selected) || itemsLoading}
                    />
                  </div>
                </div>

                {itemsLoading && (
                  <div style={{ ...styles.historyLoading, marginTop: 12 }}>
                    <div style={styles.spinnerSmall} /> Carregando itens…
                  </div>
                )}

                {itemsErr && !itemsLoading && (
                  <div
                    style={{
                      ...styles.stateBox,
                      marginTop: 12,
                      borderColor: "rgba(239,68,68,0.35)",
                    }}
                  >
                    <div style={styles.errorDot} />
                    <div>
                      <div style={{ ...styles.stateTitle, color: "#991B1B" }}>
                        Erro ao carregar itens
                      </div>
                      <div style={styles.stateText}>{itemsErr}</div>
                    </div>
                  </div>
                )}

                {!itemsLoading && !itemsErr && orderItems.length === 0 && (
                  <div style={{ ...styles.emptyBox, marginTop: 12 }}>
                    <div style={styles.emptyTitle}>Nenhum item encontrado</div>
                    <div style={styles.emptyText}>
                      Se isso estiver errado, verifique RLS/relacionamento em
                      order_items → products.
                    </div>
                  </div>
                )}

                {!itemsLoading && !itemsErr && orderItems.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {!isMobile ? (
                      <div style={{ ...styles.tableCard, boxShadow: "none" }}>
                        <div style={styles.tableScroll}>
                          <table style={{ ...styles.table, minWidth: 720 }}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Produto</th>
                                <th style={styles.th}>Qtd</th>
                                <th style={styles.th}>Unitário</th>
                                <th style={styles.th}>Total</th>
                                <th
                                  style={{ ...styles.th, textAlign: "right" }}
                                >
                                  Ação
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderItems.map((it) => {
                                const locked =
                                  isManageLocked(selected) ||
                                  removingItemId === it.id;
                                const unit = Number(it.unit_price_cents ?? 0);
                                const total = Number(
                                  it.total_cents ??
                                    Number(it.quantity ?? 0) * unit,
                                );
                                return (
                                  <tr key={it.id} style={styles.tr}>
                                    <td style={styles.td}>
                                      <div style={{ fontWeight: 950 }}>
                                        {it.product_name || "—"}
                                      </div>
                                      <div style={styles.tdMuted}>{it.id}</div>
                                    </td>
                                    <td style={styles.td}>
                                      {Number(it.quantity ?? 0)}
                                    </td>
                                    <td style={styles.td}>
                                      {brlFromCents(unit)}
                                    </td>
                                    <td style={styles.tdStrong}>
                                      {brlFromCents(total)}
                                    </td>
                                    <td
                                      style={{
                                        ...styles.td,
                                        textAlign: "right",
                                      }}
                                    >
                                      <button
                                        style={{
                                          ...styles.dangerBtn,
                                          height: 36,
                                          padding: "0 12px",
                                          borderRadius: 12,
                                          ...(locked ? styles.disabledBtn : {}),
                                        }}
                                        disabled={locked}
                                        onClick={() => removeOrderItem(it)}
                                      >
                                        {removingItemId === it.id
                                          ? "Removendo…"
                                          : "Remover"}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 10,
                        }}
                      >
                        {orderItems.map((it) => {
                          const locked =
                            isManageLocked(selected) ||
                            removingItemId === it.id;
                          const unit = Number(it.unit_price_cents ?? 0);
                          const total = Number(
                            it.total_cents ?? Number(it.quantity ?? 0) * unit,
                          );
                          return (
                            <div key={it.id} style={styles.historyItem}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 10,
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 1000,
                                      fontSize: 13,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {it.product_name || "—"}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 12,
                                      opacity: 0.8,
                                    }}
                                  >
                                    Qtd: <b>{Number(it.quantity ?? 0)}</b> •
                                    Unit: <b>{brlFromCents(unit)}</b>
                                  </div>
                                  <div
                                    style={{
                                      marginTop: 6,
                                      fontSize: 12,
                                      opacity: 0.8,
                                    }}
                                  >
                                    Total: <b>{brlFromCents(total)}</b>
                                  </div>
                                </div>

                                <button
                                  style={{
                                    ...styles.dangerBtn,
                                    height: 40,
                                    padding: "0 12px",
                                    borderRadius: 14,
                                    ...(locked ? styles.disabledBtn : {}),
                                  }}
                                  disabled={locked}
                                  onClick={() => removeOrderItem(it)}
                                >
                                  {removingItemId === it.id ? "…" : "Remover"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 12,
                    ...(isMobile ? { flexDirection: "column" } : {}),
                  }}
                >
                  <button
                    style={{
                      ...styles.secondaryBtn,
                      ...(isMobile ? { width: "100%" } : {}),
                    }}
                    onClick={() => loadOrderItems(selected.id)}
                    disabled={itemsLoading}
                  >
                    Atualizar itens
                  </button>
                </div>
              </div>

              {/* Cancelamento */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Cancelar pedido</div>
                <div style={styles.sectionHint}>
                  O cancelamento registra histórico. Se o pedido tiver usado
                  saldo, a função de cancelamento deve devolver o valor.
                </div>

                {selected.status === "cancelado" ? (
                  <div style={styles.infoBox}>
                    <div style={{ fontWeight: 900 }}>
                      Esse pedido já está cancelado.
                    </div>
                    {selected.cancel_reason && (
                      <div style={{ marginTop: 6, opacity: 0.9 }}>
                        Motivo: {selected.cancel_reason}
                      </div>
                    )}
                    {selected.cancelled_at && (
                      <div style={{ marginTop: 6, opacity: 0.75 }}>
                        Cancelado em:{" "}
                        {new Date(selected.cancelled_at).toLocaleString(
                          "pt-BR",
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <textarea
                      style={styles.textarea}
                      placeholder="Informe o motivo do cancelamento..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />

                    <div
                      style={{
                        ...styles.actions,
                        ...(isMobile
                          ? { flexDirection: "column", alignItems: "stretch" }
                          : {}),
                      }}
                    >
                      <button
                        style={{
                          ...styles.secondaryBtn,
                          ...(isMobile ? { width: "100%" } : {}),
                        }}
                        onClick={() => setSelected(null)}
                        disabled={canceling}
                      >
                        Voltar
                      </button>

                      <button
                        style={{
                          ...styles.dangerBtn,
                          ...(isMobile ? { width: "100%" } : {}),
                          ...(canceling ? styles.disabledBtn : {}),
                        }}
                        onClick={cancelOrder}
                        disabled={canceling}
                      >
                        {canceling ? "Cancelando…" : "Confirmar cancelamento"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Histórico */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>
                  Histórico de movimentações
                </div>

                {historyLoading ? (
                  <div style={styles.historyLoading}>
                    <div style={styles.spinnerSmall} />
                    Carregando…
                  </div>
                ) : history.length === 0 ? (
                  <div style={styles.emptyInline}>
                    Nenhum registro encontrado.
                  </div>
                ) : (
                  <div style={styles.historyList}>
                    {history.map((h) => (
                      <div key={h.id} style={styles.historyItem}>
                        <div style={styles.historyTop}>
                          <div style={styles.historyAction}>{h.action}</div>
                          <div style={styles.historyTime}>
                            {new Date(h.created_at).toLocaleString("pt-BR")}
                          </div>
                        </div>
                        <div style={styles.historyMeta}>
                          Por: {h.actor_cpf ? formatCPF(h.actor_cpf) : "—"}
                        </div>
                        {h.reason && (
                          <div style={styles.historyReason}>{h.reason}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  ...(isMobile ? { flexDirection: "column" } : {}),
                }}
              >
                <button
                  style={{
                    ...styles.secondaryBtn,
                    ...(isMobile ? { width: "100%" } : {}),
                  }}
                  onClick={async () => {
                    await loadOrders();
                    await reloadSelectedOrder(selected.id);
                    await loadOrderItems(selected.id);
                    await loadHistory(selected.id);
                  }}
                >
                  Atualizar
                </button>
                <button
                  style={{
                    ...styles.primaryBtn,
                    ...(isMobile ? { width: "100%" } : {}),
                  }}
                  onClick={() => setSelected(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: histórico de cancelamentos */}
      {cancelHistOpen && (
        <div style={styles.overlay} role="dialog" aria-modal="true">
          <div
            style={{
              ...styles.modal,
              width: isMobile ? "100%" : "min(1100px, 100%)",
              height: isMobile ? "min(100vh - 24px, 900px)" : undefined,
              maxHeight: isMobile ? "calc(100vh - 24px)" : undefined,
              borderRadius: isMobile ? 18 : styles.modal.borderRadius,
            }}
          >
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Histórico de cancelamentos</div>
                <div style={styles.modalSub}>
                  Quem cancelou, quando e o motivo (últimos 200)
                </div>
              </div>

              <button
                style={styles.iconBtn}
                onClick={() => setCancelHistOpen(false)}
                aria-label="Fechar"
                title="Fechar"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                ...styles.modalBody,
                ...(isMobile ? { padding: 12, overflow: "auto" } : {}),
              }}
            >
              {cancelLogsLoading && (
                <div style={styles.stateBox}>
                  <div style={styles.spinner} />
                  <div>
                    <div style={styles.stateTitle}>Carregando…</div>
                    <div style={styles.stateText}>Buscando registros.</div>
                  </div>
                </div>
              )}

              {cancelLogsErr && !cancelLogsLoading && (
                <div
                  style={{
                    ...styles.stateBox,
                    borderColor: "rgba(239,68,68,0.35)",
                  }}
                >
                  <div style={styles.errorDot} />
                  <div>
                    <div style={{ ...styles.stateTitle, color: "#991B1B" }}>
                      Erro
                    </div>
                    <div style={styles.stateText}>{cancelLogsErr}</div>
                  </div>
                </div>
              )}

              {!cancelLogsLoading &&
                !cancelLogsErr &&
                cancelLogs.length === 0 && (
                  <div style={styles.emptyBox}>
                    <div style={styles.emptyTitle}>
                      Nenhum cancelamento encontrado
                    </div>
                    <div style={styles.emptyText}>
                      Quando um pedido for cancelado, ele aparecerá aqui.
                    </div>
                  </div>
                )}

              {!cancelLogsLoading &&
                !cancelLogsErr &&
                cancelLogs.length > 0 && (
                  <>
                    {!isMobile ? (
                      <div style={styles.tableCard}>
                        <div style={styles.tableHeader}>
                          <div style={styles.tableTitle}>Cancelamentos</div>
                          <div style={styles.tableSub}>
                            Mostrando <b>{cancelLogs.length}</b> registro(s)
                          </div>
                        </div>

                        <div style={styles.tableScroll}>
                          <table style={styles.table}>
                            <thead>
                              <tr>
                                <th style={styles.th}>Pedido</th>
                                <th style={styles.th}>Funcionário</th>
                                <th style={styles.th}>Pagamento</th>
                                <th style={styles.th}>Total</th>
                                <th style={styles.th}>Cancelado em</th>
                                <th style={styles.th}>Cancelado por</th>
                                <th style={styles.th}>Motivo</th>
                              </tr>
                            </thead>

                            <tbody>
                              {cancelLogs.map((r) => {
                                const meta = getPaymentMeta(r as any);
                                const total = r.total_cents
                                  ? brlFromCents(r.total_cents)
                                  : brlFromReais(r.total_value);

                                return (
                                  <tr
                                    key={`${r.order_id}-${r.cancelled_at || ""}`}
                                    style={styles.tr}
                                  >
                                    <td style={styles.tdStrong}>
                                      {r.order_number || "—"}
                                      <div style={styles.tdMuted}>
                                        {r.order_id}
                                      </div>
                                    </td>

                                    <td style={styles.td}>
                                      <div style={{ fontWeight: 950 }}>
                                        {r.employee_name || "—"}
                                      </div>
                                      <div style={styles.tdMuted}>
                                        {formatCPF(r.employee_cpf)}
                                      </div>
                                    </td>

                                    <td style={styles.td}>
                                      <Badge
                                        kind={meta.kind}
                                        tooltip={meta.tooltip}
                                      />
                                      <div style={styles.payMini}>
                                        {meta.wallet > 0 && (
                                          <span style={styles.payLine}>
                                            Saldo: {brlFromCents(meta.wallet)}
                                          </span>
                                        )}
                                        {meta.pickup > 0 && (
                                          <span style={styles.payLine}>
                                            Retirada:{" "}
                                            {brlFromCents(meta.pickup)}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    <td style={styles.td}>{total}</td>
                                    <td style={styles.td}>
                                      {r.cancelled_at
                                        ? new Date(
                                            r.cancelled_at,
                                          ).toLocaleString("pt-BR")
                                        : "—"}
                                    </td>

                                    <td style={styles.td}>
                                      <div style={{ fontWeight: 900 }}>
                                        {r.actor_name || "—"}
                                      </div>
                                      <div style={styles.tdMuted}>
                                        {formatCPF(r.actor_cpf)}
                                      </div>
                                    </td>

                                    <td style={styles.td}>
                                      <div
                                        style={{
                                          fontWeight: 800,
                                          whiteSpace: "pre-wrap",
                                        }}
                                      >
                                        {r.reason || "—"}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div style={styles.mobileList}>
                        {cancelLogs.map((r) => {
                          const meta = getPaymentMeta(r as any);
                          const total = r.total_cents
                            ? brlFromCents(r.total_cents)
                            : brlFromReais(r.total_value);

                          return (
                            <div
                              key={`${r.order_id}-${r.cancelled_at || ""}`}
                              style={styles.mobileCard}
                            >
                              <div style={styles.mobileTop}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={styles.mobileTitle}>
                                    {r.order_number || "—"}
                                  </div>
                                  <div
                                    style={styles.mobileSub}
                                    title={r.employee_name || ""}
                                  >
                                    <b
                                      style={{
                                        display: "inline-block",
                                        maxWidth: "100%",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {r.employee_name || "—"}
                                    </b>{" "}
                                    • {formatCPF(r.employee_cpf)}
                                  </div>

                                  <div style={styles.mobileSub}>
                                    Cancelado em:{" "}
                                    {r.cancelled_at
                                      ? new Date(r.cancelled_at).toLocaleString(
                                          "pt-BR",
                                        )
                                      : "—"}
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "flex-end",
                                    gap: 8,
                                  }}
                                >
                                  <Badge
                                    kind={meta.kind}
                                    tooltip={meta.tooltip}
                                  />
                                  <span
                                    style={{
                                      ...styles.badge,
                                      background: "rgba(239,68,68,0.10)",
                                      color: "#991B1B",
                                      borderColor: "rgba(239,68,68,0.22)",
                                    }}
                                  >
                                    Cancelado
                                  </span>
                                </div>
                              </div>

                              <div style={styles.mobileBottom}>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 6,
                                  }}
                                >
                                  <div style={styles.mobileTotal}>{total}</div>

                                  <div style={styles.payMini}>
                                    {meta.wallet > 0 && (
                                      <span style={styles.payLine}>
                                        Saldo: {brlFromCents(meta.wallet)}
                                      </span>
                                    )}
                                    {meta.pickup > 0 && (
                                      <span style={styles.payLine}>
                                        Retirada: {brlFromCents(meta.pickup)}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ marginTop: 6 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 900,
                                        color: "#111827",
                                      }}
                                    >
                                      Cancelado por: {r.actor_name || "—"}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                      {formatCPF(r.actor_cpf)}
                                    </div>
                                  </div>

                                  <div style={{ marginTop: 6 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 900,
                                        color: "#111827",
                                      }}
                                    >
                                      Motivo
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        opacity: 0.9,
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {r.reason || "—"}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  style={{
                                    ...styles.secondaryBtn,
                                    padding: "10px 12px",
                                    height: 42,
                                    borderRadius: 14,
                                  }}
                                  onClick={() => {
                                    const found = orders.find(
                                      (o) => o.id === r.order_id,
                                    );
                                    if (found) setSelected(found);
                                    else
                                      alert(
                                        "Esse pedido não está na lista atual (filtros). Clique em 'Atualizar' e tente novamente.",
                                      );
                                  }}
                                >
                                  Abrir pedido
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                        marginTop: 14,
                        ...(isMobile ? { flexDirection: "column" } : {}),
                      }}
                    >
                      <button
                        style={{
                          ...styles.secondaryBtn,
                          ...(isMobile ? { width: "100%" } : {}),
                        }}
                        onClick={() => loadCancellationHistory()}
                        disabled={cancelLogsLoading}
                      >
                        Atualizar
                      </button>
                      <button
                        style={{
                          ...styles.primaryBtn,
                          ...(isMobile ? { width: "100%" } : {}),
                        }}
                        onClick={() => setCancelHistOpen(false)}
                      >
                        Fechar
                      </button>
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .gm-tip { position: relative; user-select: none; }
        .gm-tip::after {
          content: attr(data-tip);
          position: absolute;
          left: 50%;
          top: calc(100% + 8px);
          transform: translateX(-50%);
          background: rgba(17,24,39,0.95);
          color: #fff;
          padding: 8px 10px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.2;
          white-space: pre;
          opacity: 0;
          pointer-events: none;
          transition: opacity .15s ease;
          z-index: 9999;
          min-width: 140px;
          text-align: left;
          box-shadow: 0 10px 30px rgba(0,0,0,0.18);
        }
        .gm-tip:hover::after { opacity: 1; }
      `}</style>
    </div>
  );
}

/* ----------------------------- styles ----------------------------- */
const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#F6F7FB", color: "#111827" },

  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    background: "rgba(246,247,251,0.85)",
    backdropFilter: "blur(12px)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },

  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },

  backBtn: {
    height: 42,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
  },

  hTitle: { fontSize: 18, fontWeight: 1000, letterSpacing: "-0.02em" },
  hSub: { marginTop: 2, fontSize: 12, opacity: 0.7 },

  headerChip: {
    height: 30,
    padding: "0 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    display: "inline-flex",
    alignItems: "center",
    fontWeight: 950,
    fontSize: 12,
  },

  main: { maxWidth: 1200, margin: "0 auto", padding: "18px 18px 28px" },

  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 16,
    alignItems: "stretch",
  },

  kpiCard: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    padding: 14,
    boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },

  kpiLabel: { fontSize: 12, fontWeight: 900, opacity: 0.65 },
  kpiValue: { marginTop: 8, fontSize: 22, fontWeight: 1000 },

  refreshBtn: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#111827",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 18px 45px rgba(17,24,39,0.22)",
  },

  filters: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    padding: 14,
    boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
    marginBottom: 16,
  },

  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "1.1fr 1.4fr 1fr 0.8fr",
    gap: 12,
    alignItems: "end",
  },

  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },

  label: { fontSize: 12, fontWeight: 900, opacity: 0.7 },

  input: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: "0 12px",
    outline: "none",
    background: "#fff",
    fontWeight: 800,
  },

  select: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: "0 12px",
    outline: "none",
    background: "#fff",
    fontWeight: 800,
  },

  primaryBtn: {
    height: 44,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#111827",
    color: "#fff",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 30px rgba(17,24,39,0.20)",
  },

  ghostBtn: {
    height: 42,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.70)",
    cursor: "pointer",
    fontWeight: 900,
  },

  secondaryBtn: {
    height: 44,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 950,
  },

  dangerBtn: {
    height: 44,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.30)",
    background: "rgba(239,68,68,0.12)",
    color: "#991B1B",
    cursor: "pointer",
    fontWeight: 1000,
  },

  disabledBtn: { opacity: 0.55, cursor: "not-allowed" },

  helpRow: {
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  helpText: { fontSize: 12, opacity: 0.65 },

  tableCard: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
    overflow: "hidden",
  },

  tableHeader: {
    padding: "14px 14px 10px",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },

  tableTitle: { fontWeight: 1000, fontSize: 14 },
  tableSub: { fontSize: 12, opacity: 0.7 },

  tableScroll: { overflow: "auto" },

  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 980,
  },

  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 1000,
    opacity: 0.75,
    background: "rgba(0,0,0,0.02)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },

  tr: { borderBottom: "1px solid rgba(0,0,0,0.06)" },

  td: {
    padding: "12px 14px",
    verticalAlign: "top",
    fontSize: 13,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },

  tdStrong: {
    padding: "12px 14px",
    verticalAlign: "top",
    fontSize: 13,
    fontWeight: 1000,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },

  tdMuted: { marginTop: 4, fontSize: 12, opacity: 0.65 },

  payMini: { marginTop: 6, display: "flex", flexDirection: "column", gap: 2 },
  payLine: { fontSize: 12, opacity: 0.75 },

  smallBtn: {
    height: 36,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 950,
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 1000,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(0,0,0,0.04)",
  },

  stateBox: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    padding: 14,
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
  },

  stateTitle: { fontWeight: 1000 },
  stateText: { fontSize: 12, opacity: 0.75, marginTop: 2 },

  spinner: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "3px solid rgba(0,0,0,0.10)",
    borderTopColor: "rgba(0,0,0,0.45)",
    animation: "gmspin 1s linear infinite",
  },

  spinnerSmall: {
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "3px solid rgba(0,0,0,0.10)",
    borderTopColor: "rgba(0,0,0,0.45)",
    animation: "gmspin 1s linear infinite",
  },

  errorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "rgba(239,68,68,0.75)",
  },

  emptyBox: {
    borderRadius: 18,
    border: "1px dashed rgba(0,0,0,0.18)",
    background: "rgba(255,255,255,0.60)",
    padding: 18,
    textAlign: "center",
  },

  emptyTitle: { fontWeight: 1000 },
  emptyText: { marginTop: 6, fontSize: 12, opacity: 0.75 },

  mobileList: { display: "flex", flexDirection: "column", gap: 12 },

  mobileCard: {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "#fff",
    padding: 14,
    boxShadow: "0 18px 45px rgba(0,0,0,0.06)",
  },

  mobileTop: { display: "flex", justifyContent: "space-between", gap: 12 },
  mobileTitle: { fontSize: 14, fontWeight: 1000 },
  mobileSub: { marginTop: 4, fontSize: 12, opacity: 0.75 },

  mobileBottom: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-end",
  },
  mobileTotal: { fontSize: 18, fontWeight: 1000 },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    zIndex: 50,
  },

  modal: {
    width: "min(860px, 100%)",
    borderRadius: 22,
    background: "#fff",
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 25px 70px rgba(0,0,0,0.22)",
    overflow: "hidden",
  },

  modalTop: {
    padding: "14px 14px 10px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },

  modalTitle: { fontWeight: 1000, fontSize: 14 },
  modalSub: { marginTop: 4, fontSize: 12, opacity: 0.75 },

  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    cursor: "pointer",
    fontWeight: 1000,
  },

  modalBody: { padding: 14 },

  section: {
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 18,
    padding: 14,
    background: "rgba(0,0,0,0.015)",
    marginBottom: 12,
  },

  sectionTitle: { fontWeight: 1000, fontSize: 13 },
  sectionHint: { marginTop: 6, fontSize: 12, opacity: 0.75 },

  summaryGrid: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 12,
  },

  summaryLabel: { fontSize: 12, opacity: 0.75, fontWeight: 900 },
  summaryValue: { fontSize: 14, fontWeight: 1000 },

  infoBox: {
    marginTop: 10,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    padding: 12,
  },

  textarea: {
    marginTop: 10,
    width: "100%",
    minHeight: 90,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
    outline: "none",
    resize: "vertical",
    fontWeight: 700,
  },

  actions: {
    marginTop: 10,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },

  historyLoading: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    opacity: 0.8,
  },

  historyList: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  historyItem: {
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "#fff",
    padding: 12,
  },

  historyTop: { display: "flex", justifyContent: "space-between", gap: 10 },
  historyAction: { fontWeight: 1000, fontSize: 12, textTransform: "none" },
  historyTime: { fontSize: 12, opacity: 0.75 },
  historyMeta: { marginTop: 6, fontSize: 12, opacity: 0.75 },
  historyReason: { marginTop: 6, fontSize: 12, whiteSpace: "pre-wrap" },
  emptyInline: { marginTop: 10, fontSize: 12, opacity: 0.75 },

  footer: {
    borderTop: "1px solid rgba(0,0,0,0.06)",
    marginTop: 22,
    padding: "14px 0",
  },

  footerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "0 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  footerText: { fontSize: 12, fontWeight: 900, opacity: 0.75 },
  footerTextMuted: { fontSize: 12, opacity: 0.6 },
};

/* animação do spinner (CSS global dentro do arquivo) */
const _injectKeyframes = (() => {
  if (typeof document === "undefined") return;
  const id = "gm-adminorders-keyframes";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.innerHTML = `
    @keyframes gmspin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();
