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
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function brlFromCents(cents?: number | null) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function brlFromReais(reais?: number | null) {
  return Number(reais || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toCentsFromOrder(order: Pick<OrderRow, "total_cents" | "total_value">) {
  const cents = Number(order.total_cents ?? 0);
  if (cents > 0) return cents;
  const legacy = Number(order.total_value ?? 0);
  return Math.round(legacy * 100);
}

function getWalletUsed(order: Pick<OrderRow, "wallet_used_cents" | "spent_from_balance_cents">) {
  const a = Number(order.wallet_used_cents ?? 0);
  if (a > 0) return a;
  return Number(order.spent_from_balance_cents ?? 0);
}

type PaymentKind = "wallet" | "pickup" | "mixed" | "none";

function getPaymentMeta(
  order: Pick<OrderRow, "total_cents" | "total_value" | "wallet_used_cents" | "spent_from_balance_cents" | "pay_on_pickup_cents">
) {
  const total = toCentsFromOrder(order as any);
  const wallet = getWalletUsed(order as any);
  const pickup =
    order.pay_on_pickup_cents === null || typeof order.pay_on_pickup_cents === "undefined"
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
      <path d="M18.2 15h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconPickup({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18a2 2 0 1 0 0.001 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 18a2 2 0 1 0 0.001 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3.5 6.5h2l2.2 10.5h9.8l2-7H7.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.2 9.5h14.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconMixed({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 6.5h11a3 3 0 0 1 3 3v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M3.5 9.5h14.5a2.5 2.5 0 0 1 2.5 2.5v6A3.5 3.5 0 0 1 17 21.5H7a3.5 3.5 0 0 1-3.5-3.5v-8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M7 15h4M13 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Badge({ kind, tooltip }: { kind: PaymentKind; tooltip: string }) {
  const cfg = useMemo(() => {
    if (kind === "wallet") {
      return {
        label: "Saldo",
        icon: <IconWallet />,
        style: { background: "rgba(16,185,129,0.12)", color: "#065F46", borderColor: "rgba(16,185,129,0.22)" },
      };
    }
    if (kind === "pickup") {
      return {
        label: "Retirada",
        icon: <IconPickup />,
        style: { background: "rgba(107,114,128,0.10)", color: "#374151", borderColor: "rgba(107,114,128,0.22)" },
      };
    }
    if (kind === "mixed") {
      return {
        label: "Misto",
        icon: <IconMixed />,
        style: { background: "rgba(99,102,241,0.12)", color: "#3730A3", borderColor: "rgba(99,102,241,0.22)" },
      };
    }
    return {
      label: "N/D",
      icon: null,
      style: { background: "rgba(0,0,0,0.05)", color: "#111827", borderColor: "rgba(0,0,0,0.12)" },
    };
  }, [kind]);

  return (
    <span className="gm-tip" data-tip={tooltip} style={{ ...styles.badge, ...(cfg.style as any) }}>
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

  // ✅ FIX: isMobile reativo a resize
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < 940 : false));
  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < 940);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ FIX: pega CPF do ator do localStorage (inclui employee_session)
  function actorCpfFromLocalStorage() {
    const possible =
      localStorage.getItem("gm_employee_cpf") ||
      localStorage.getItem("employee_cpf") ||
      localStorage.getItem("cpf") ||
      "";

    const digits = onlyDigits(possible);
    if (digits) return digits;

    const raw = localStorage.getItem("employee_session") || localStorage.getItem("gm_employee_session") || "";
    if (!raw) return "";

    try {
      const obj = JSON.parse(raw);
      const cpf =
        obj?.cpf ||
        obj?.employee_cpf ||
        obj?.employeeCpf ||
        obj?.document ||
        obj?.employee?.cpf ||
        obj?.employee?.employee_cpf ||
        "";
      return onlyDigits(String(cpf || ""));
    } catch {
      return "";
    }
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
        ].join(",")
      )
      .order("created_at", { ascending: false });

    const cpf = onlyDigits(cpfFilter);
    if (cpf) q = q.ilike("employee_cpf", `%${cpf}%`);
    if (orderFilter.trim()) q = q.ilike("order_number", `%${orderFilter.trim()}%`);
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

  async function cancelOrder() {
    if (!selected) return;

    let actorCpf = actorCpfFromLocalStorage();

    // ✅ fallback via Supabase Auth (se existir)
    if (!actorCpf) {
      const { data } = await supabase.auth.getUser();
      const metaCpf =
        (data?.user?.user_metadata as any)?.cpf ||
        (data?.user?.user_metadata as any)?.employee_cpf ||
        "";
      actorCpf = onlyDigits(String(metaCpf || ""));
    }

    if (!actorCpf) {
      alert("Não encontrei seu CPF de login no navegador (localStorage).");
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
      const orderIds = Array.from(new Set(actionRows.map((x) => x.order_id).filter(Boolean)));

      const { data: ords, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, order_number, employee_cpf, employee_name, total_value, total_cents, wallet_used_cents, spent_from_balance_cents, pay_on_pickup_cents, cancelled_at"
        )
        .in("id", orderIds);

      if (oErr) throw new Error(oErr.message);

      const orderMap = new Map<string, any>();
      for (const o of (Array.isArray(ords) ? ords : []) as any[]) orderMap.set(o.id, o);

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
      setCancelLogsErr(e?.message || "Erro ao carregar histórico de cancelamentos");
      setCancelLogs([]);
    } finally {
      setCancelLogsLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) loadHistory(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const summary = useMemo(() => {
    const total = orders.length;
    const canceled = orders.filter((o) => o.status === "cancelado").length;
    const delivered = orders.filter((o) => o.status === "entregue").length;
    const pending = orders.filter((o) =>
      ["aguardando_separacao", "em_separacao", "pronto_para_retirada"].includes(o.status || "")
    ).length;
    const withWallet = orders.filter((o) => getWalletUsed(o) > 0).length;
    return { total, canceled, delivered, pending, withWallet };
  }, [orders]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button style={styles.backBtn} onClick={() => navigate(CATALOG_ROUTE)} title="Voltar ao catálogo">
              ← Voltar ao catálogo
            </button>
            <div>
              <div style={styles.hTitle}>Administração de pedidos</div>
              <div style={styles.hSub}>Visualize, cancele e consulte histórico</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              style={styles.ghostBtn}
              onClick={() => {
                setCancelHistOpen(true);
                loadCancellationHistory();
              }}
              title="Ver histórico de cancelamentos"
            >
              Histórico de cancelamentos
            </button>
            <span style={styles.headerChip}>Admin</span>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.kpis}>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Total</div>
            <div style={styles.kpiValue}>{summary.total}</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Pendentes</div>
            <div style={styles.kpiValue}>{summary.pending}</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Entregues</div>
            <div style={styles.kpiValue}>{summary.delivered}</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Cancelados</div>
            <div style={styles.kpiValue}>{summary.canceled}</div>
          </div>
          <div style={styles.kpiCard}>
            <div style={styles.kpiLabel}>Com saldo</div>
            <div style={styles.kpiValue}>{summary.withWallet}</div>
          </div>

          <button style={styles.refreshBtn} onClick={loadOrders} title="Atualizar">
            Atualizar
          </button>
        </section>

        <section style={styles.filters}>
          <div style={styles.filtersGrid}>
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
              <select style={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
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
              <button style={styles.primaryBtn} onClick={loadOrders}>
                Filtrar
              </button>
            </div>
          </div>

          <div style={styles.helpRow}>
            <span style={styles.helpText}>Passe o mouse sobre o badge de pagamento para ver detalhes.</span>
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
          <div style={{ ...styles.stateBox, borderColor: "rgba(239,68,68,0.35)" }}>
            <div style={styles.errorDot} />
            <div>
              <div style={{ ...styles.stateTitle, color: "#991B1B" }}>Erro ao carregar</div>
              <div style={styles.stateText}>{err}</div>
            </div>
          </div>
        )}

        {!loading && !err && orders.length === 0 && (
          <div style={styles.emptyBox}>
            <div style={styles.emptyTitle}>Nenhum pedido encontrado</div>
            <div style={styles.emptyText}>Ajuste os filtros ou tente novamente.</div>
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
                        <th style={{ ...styles.th, textAlign: "right" }}>Ações</th>
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
                              <div style={{ fontWeight: 950 }}>{o.employee_name || "Nome não encontrado"}</div>
                              <div style={styles.tdMuted}>{formatCPF(o.employee_cpf)}</div>
                            </td>

                            <td style={styles.td}>
                              <Badge kind={meta.kind} tooltip={meta.tooltip} />
                              <div style={styles.payMini}>
                                {meta.wallet > 0 && <span style={styles.payLine}>Saldo: {brlFromCents(meta.wallet)}</span>}
                                {meta.pickup > 0 && <span style={styles.payLine}>Retirada: {brlFromCents(meta.pickup)}</span>}
                              </div>
                            </td>

                            {/* ✅ total consistente */}
                            <td style={styles.td}>{brlFromCents(toCentsFromOrder(o))}</td>

                            <td style={styles.td}>
                              <span style={statusPill(o.status)}>{STATUS_LABEL[o.status || ""] || (o.status || "—")}</span>
                            </td>

                            <td style={styles.td}>{new Date(o.created_at).toLocaleString("pt-BR")}</td>

                            <td style={{ ...styles.td, textAlign: "right" }}>
                              <button
                                style={{ ...styles.smallBtn, ...(isCanceled ? styles.disabledBtn : {}) }}
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
                        <div>
                          <div style={styles.mobileTitle}>{o.order_number || "—"}</div>
                          <div style={styles.mobileSub}>
                            <b>{o.employee_name || "Nome não encontrado"}</b> • {formatCPF(o.employee_cpf)}
                          </div>
                          <div style={styles.mobileSub}>{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                          <span style={statusPill(o.status)}>{STATUS_LABEL[o.status || ""] || (o.status || "—")}</span>
                          <Badge kind={meta.kind} tooltip={meta.tooltip} />
                        </div>
                      </div>

                      <div style={styles.mobileBottom}>
                        <div>
                          <div style={styles.mobileTotal}>{brlFromCents(toCentsFromOrder(o))}</div>
                          <div style={styles.payMini}>
                            {meta.wallet > 0 && <span style={styles.payLine}>Saldo: {brlFromCents(meta.wallet)}</span>}
                            {meta.pickup > 0 && <span style={styles.payLine}>Retirada: {brlFromCents(meta.pickup)}</span>}
                          </div>
                        </div>

                        <button
                          style={{ ...styles.primaryBtn, padding: "10px 12px", ...(isCanceled ? styles.disabledBtn : {}) }}
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
          <span style={styles.footerText}>Gostinho Mineiro • Catálogo Funcionários</span>
          <span style={styles.footerTextMuted}>Painel interno</span>
        </div>
      </footer>

      {/* Modal: gerenciar pedido */}
      {selected && (
        <div style={styles.overlay} role="dialog" aria-modal="true">
          <div style={styles.modal}>
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Pedido {selected.order_number || "—"}</div>
                <div style={styles.modalSub}>
                  {selected.employee_name || "Nome não encontrado"} • {formatCPF(selected.employee_cpf)} •{" "}
                  {new Date(selected.created_at).toLocaleString("pt-BR")}
                </div>
              </div>

              <button style={styles.iconBtn} onClick={() => setSelected(null)} aria-label="Fechar" title="Fechar">
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Resumo */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Resumo</div>

                {(() => {
                  const meta = getPaymentMeta(selected);
                  return (
                    <div style={styles.summaryGrid}>
                      <div style={styles.summaryItem}>
                        <div style={styles.summaryLabel}>Status</div>
                        <span style={statusPill(selected.status)}>
                          {STATUS_LABEL[selected.status || ""] || (selected.status || "—")}
                        </span>
                      </div>

                      <div style={styles.summaryItem}>
                        <div style={styles.summaryLabel}>Total</div>
                        <div style={styles.summaryValue}>{brlFromCents(toCentsFromOrder(selected))}</div>
                      </div>

                      <div style={styles.summaryItem}>
                        <div style={styles.summaryLabel}>Pagamento</div>
                        <Badge kind={meta.kind} tooltip={meta.tooltip} />
                      </div>

                      <div style={styles.summaryItem}>
                        <div style={styles.summaryLabel}>Saldo</div>
                        <div style={styles.summaryValue}>{brlFromCents(meta.wallet)}</div>
                      </div>

                      <div style={styles.summaryItem}>
                        <div style={styles.summaryLabel}>Retirada</div>
                        <div style={styles.summaryValue}>{brlFromCents(meta.pickup)}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Cancelamento */}
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Cancelar pedido</div>
                <div style={styles.sectionHint}>
                  O cancelamento registra histórico. Se o pedido tiver usado saldo, a função de cancelamento deve devolver o valor.
                </div>

                {selected.status === "cancelado" ? (
                  <div style={styles.infoBox}>
                    <div style={{ fontWeight: 900 }}>Esse pedido já está cancelado.</div>
                    {selected.cancel_reason && <div style={{ marginTop: 6, opacity: 0.9 }}>Motivo: {selected.cancel_reason}</div>}
                    {selected.cancelled_at && (
                      <div style={{ marginTop: 6, opacity: 0.75 }}>
                        Cancelado em: {new Date(selected.cancelled_at).toLocaleString("pt-BR")}
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

                    <div style={styles.actions}>
                      <button style={styles.secondaryBtn} onClick={() => setSelected(null)} disabled={canceling}>
                        Voltar
                      </button>

                      <button
                        style={{ ...styles.dangerBtn, ...(canceling ? styles.disabledBtn : {}) }}
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
                <div style={styles.sectionTitle}>Histórico de movimentações</div>

                {historyLoading ? (
                  <div style={styles.historyLoading}>
                    <div style={styles.spinnerSmall} />
                    Carregando…
                  </div>
                ) : history.length === 0 ? (
                  <div style={styles.emptyInline}>Nenhum registro encontrado.</div>
                ) : (
                  <div style={styles.historyList}>
                    {history.map((h) => (
                      <div key={h.id} style={styles.historyItem}>
                        <div style={styles.historyTop}>
                          <div style={styles.historyAction}>{h.action}</div>
                          <div style={styles.historyTime}>{new Date(h.created_at).toLocaleString("pt-BR")}</div>
                        </div>
                        <div style={styles.historyMeta}>Por: {h.actor_cpf ? formatCPF(h.actor_cpf) : "—"}</div>
                        {h.reason && <div style={styles.historyReason}>{h.reason}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  style={styles.secondaryBtn}
                  onClick={async () => {
                    await loadOrders();
                    await loadHistory(selected.id);
                  }}
                >
                  Atualizar
                </button>
                <button style={styles.primaryBtn} onClick={() => setSelected(null)}>
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
          <div style={{ ...styles.modal, width: "min(1100px, 100%)" }}>
            <div style={styles.modalTop}>
              <div>
                <div style={styles.modalTitle}>Histórico de cancelamentos</div>
                <div style={styles.modalSub}>Quem cancelou, quando e o motivo (últimos 200)</div>
              </div>

              <button style={styles.iconBtn} onClick={() => setCancelHistOpen(false)} aria-label="Fechar" title="Fechar">
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
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
                <div style={{ ...styles.stateBox, borderColor: "rgba(239,68,68,0.35)" }}>
                  <div style={styles.errorDot} />
                  <div>
                    <div style={{ ...styles.stateTitle, color: "#991B1B" }}>Erro</div>
                    <div style={styles.stateText}>{cancelLogsErr}</div>
                  </div>
                </div>
              )}

              {!cancelLogsLoading && !cancelLogsErr && cancelLogs.length === 0 && (
                <div style={styles.emptyBox}>
                  <div style={styles.emptyTitle}>Nenhum cancelamento encontrado</div>
                  <div style={styles.emptyText}>Quando um pedido for cancelado, ele aparecerá aqui.</div>
                </div>
              )}

              {!cancelLogsLoading && !cancelLogsErr && cancelLogs.length > 0 && (
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
                          const total = brlFromCents(toCentsFromOrder(r as any));

                          return (
                            <tr key={`${r.order_id}-${r.cancelled_at || ""}`} style={styles.tr}>
                              <td style={styles.tdStrong}>
                                {r.order_number || "—"}
                                <div style={styles.tdMuted}>{r.order_id}</div>
                              </td>

                              <td style={styles.td}>
                                <div style={{ fontWeight: 950 }}>{r.employee_name || "—"}</div>
                                <div style={styles.tdMuted}>{formatCPF(r.employee_cpf)}</div>
                              </td>

                              <td style={styles.td}>
                                <Badge kind={meta.kind} tooltip={meta.tooltip} />
                                <div style={styles.payMini}>
                                  {meta.wallet > 0 && <span style={styles.payLine}>Saldo: {brlFromCents(meta.wallet)}</span>}
                                  {meta.pickup > 0 && <span style={styles.payLine}>Retirada: {brlFromCents(meta.pickup)}</span>}
                                </div>
                              </td>

                              <td style={styles.td}>{total}</td>
                              <td style={styles.td}>{r.cancelled_at ? new Date(r.cancelled_at).toLocaleString("pt-BR") : "—"}</td>

                              <td style={styles.td}>
                                <div style={{ fontWeight: 900 }}>{r.actor_name || "—"}</div>
                                <div style={styles.tdMuted}>{formatCPF(r.actor_cpf)}</div>
                              </td>

                              <td style={styles.td}>
                                <div style={{ maxWidth: 420, whiteSpace: "pre-wrap" }}>{r.reason || "—"}</div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={styles.secondaryBtn} onClick={loadCancellationHistory}>
                  Atualizar lista
                </button>
                <button style={styles.primaryBtn} onClick={() => setCancelHistOpen(false)}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TooltipStyles />
    </div>
  );
}

function TooltipStyles() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("gm-adminorders-tooltip-style")) return;

    const style = document.createElement("style");
    style.id = "gm-adminorders-tooltip-style";
    style.innerHTML = `
      @keyframes gmSpin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      .gm-tip{ position: relative; }
      .gm-tip[data-tip]:hover::after{
        content: attr(data-tip);
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(100% + 10px);
        background: rgba(17,24,39,0.96);
        color: #fff;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 800;
        white-space: pre-line;
        box-shadow: 0 18px 40px rgba(0,0,0,0.25);
        border: 1px solid rgba(255,255,255,0.12);
        z-index: 9999;
        pointer-events: none;
        min-width: 190px;
        text-align: left;
      }
      .gm-tip[data-tip]:hover::before{
        content: "";
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(100% + 4px);
        border-width: 6px;
        border-style: solid;
        border-color: rgba(17,24,39,0.96) transparent transparent transparent;
        z-index: 9999;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }, []);

  return null;
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 500px at 20% -10%, rgba(59,130,246,0.12), transparent 60%), radial-gradient(900px 400px at 90% 10%, rgba(16,185,129,0.12), transparent 55%), #f7f7fb",
    color: "#111827",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backdropFilter: "blur(10px)",
    background: "rgba(255,255,255,0.78)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  headerInner: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "16px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  backBtn: {
    height: 40,
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "white",
    fontWeight: 950,
    cursor: "pointer",
  },
  ghostBtn: {
    height: 40,
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.92)",
    fontWeight: 950,
    cursor: "pointer",
  },
  headerChip: {
    fontSize: 12,
    fontWeight: 900,
    padding: "8px 10px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.06)",
  },
  hTitle: { fontSize: 18, fontWeight: 950, letterSpacing: -0.2 },
  hSub: { fontSize: 13, opacity: 0.75, marginTop: 2 },

  main: { width: "100%", maxWidth: 1200, margin: "0 auto", padding: "18px 20px 30px", flex: 1 },

  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(140px, 1fr)) 140px",
    gap: 12,
    alignItems: "stretch",
    marginBottom: 14,
  },
  kpiCard: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 16,
    padding: "12px 14px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },
  kpiLabel: { fontSize: 12, fontWeight: 850, opacity: 0.65 },
  kpiValue: { fontSize: 20, fontWeight: 950, marginTop: 2 },
  refreshBtn: {
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.92)",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },

  filters: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
    marginBottom: 14,
  },
  filtersGrid: { display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 0.6fr", gap: 12 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 900, opacity: 0.7 },
  input: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: "0 12px",
    outline: "none",
    background: "white",
    fontSize: 14,
  },
  select: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: "0 10px",
    outline: "none",
    background: "white",
    fontSize: 14,
  },
  helpRow: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.10)" },
  helpText: { fontSize: 12, fontWeight: 850, opacity: 0.7 },

  primaryBtn: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.06)",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 14px",
  },
  secondaryBtn: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 14px",
  },
  dangerBtn: {
    height: 44,
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "#EF4444",
    color: "white",
    fontWeight: 950,
    cursor: "pointer",
    padding: "0 14px",
  },
  disabledBtn: { opacity: 0.6, cursor: "not-allowed" },

  tableCard: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    overflow: "visible", // ✅ não corta tooltip
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },
  tableHeader: {
    padding: "14px 14px 10px",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  tableTitle: { fontSize: 14, fontWeight: 950 },
  tableSub: { fontSize: 12, opacity: 0.7 },

  tableScroll: {
    overflowX: "auto",
    overflowY: "visible", // ✅ não corta tooltip
  },

  table: { width: "100%", borderCollapse: "separate", borderSpacing: 0 },
  th: {
    textAlign: "left",
    padding: "12px 14px",
    fontSize: 12,
    fontWeight: 950,
    opacity: 0.75,
    background: "rgba(0,0,0,0.03)",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  tr: { borderBottom: "1px solid rgba(0,0,0,0.06)" },
  td: { padding: "12px 14px", fontSize: 13, borderBottom: "1px solid rgba(0,0,0,0.06)", verticalAlign: "top" },
  tdStrong: { padding: "12px 14px", fontSize: 13, borderBottom: "1px solid rgba(0,0,0,0.06)", fontWeight: 950 },
  tdMuted: { fontSize: 11, opacity: 0.55, marginTop: 2 },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "7px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 950,
    border: "1px solid rgba(0,0,0,0.08)",
    userSelect: "none",
    whiteSpace: "nowrap",
  },

  payMini: { display: "grid", gap: 4, marginTop: 8 },
  payLine: { fontSize: 12, fontWeight: 850, opacity: 0.75 },

  smallBtn: {
    padding: "9px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  stateBox: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
    marginBottom: 14,
  },
  stateTitle: { fontWeight: 950, fontSize: 14 },
  stateText: { opacity: 0.75, fontSize: 13 },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "3px solid rgba(0,0,0,0.12)",
    borderTopColor: "rgba(0,0,0,0.65)",
    animation: "gmSpin 0.8s linear infinite",
  },
  spinnerSmall: {
    width: 14,
    height: 14,
    borderRadius: 999,
    border: "3px solid rgba(0,0,0,0.12)",
    borderTopColor: "rgba(0,0,0,0.65)",
    animation: "gmSpin 0.8s linear infinite",
  },
  errorDot: { width: 12, height: 12, borderRadius: 999, background: "#EF4444" },

  emptyBox: {
    padding: 18,
    borderRadius: 18,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },
  emptyTitle: { fontSize: 15, fontWeight: 950, marginBottom: 6 },
  emptyText: { fontSize: 13, opacity: 0.75 },
  emptyInline: { fontSize: 13, opacity: 0.75 },

  mobileList: { display: "grid", gap: 12 },
  mobileCard: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.06)",
    borderRadius: 18,
    padding: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.04)",
  },
  mobileTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 },
  mobileTitle: { fontSize: 14, fontWeight: 950 },
  mobileSub: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  mobileBottom: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  mobileTotal: { fontSize: 16, fontWeight: 950 },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(920px, 100%)",
    background: "white",
    borderRadius: 22,
    border: "1px solid rgba(0,0,0,0.10)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  modalTop: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    background: "linear-gradient(180deg, rgba(0,0,0,0.02), transparent)",
  },
  modalTitle: { fontSize: 16, fontWeight: 950 },
  modalSub: { fontSize: 12, opacity: 0.75, marginTop: 2 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "white",
    fontWeight: 950,
    cursor: "pointer",
  },
  modalBody: { padding: 16, display: "grid", gap: 14 },

  section: { border: "1px solid rgba(0,0,0,0.06)", borderRadius: 18, padding: 14, background: "rgba(0,0,0,0.015)" },
  sectionTitle: { fontSize: 13, fontWeight: 950, marginBottom: 6 },
  sectionHint: { fontSize: 12, opacity: 0.75, marginBottom: 10 },

  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(5, minmax(160px, 1fr))", gap: 12 },
  summaryItem: { display: "flex", flexDirection: "column", gap: 6 },
  summaryLabel: { fontSize: 12, fontWeight: 900, opacity: 0.7 },
  summaryValue: { fontSize: 14, fontWeight: 950 },

  textarea: {
    width: "100%",
    minHeight: 90,
    resize: "vertical",
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
    outline: "none",
    fontSize: 14,
    background: "white",
  },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10, flexWrap: "wrap" },

  infoBox: { borderRadius: 16, padding: 12, border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.08)" },

  historyLoading: { display: "flex", gap: 10, alignItems: "center", fontSize: 13, opacity: 0.8 },
  historyList: { display: "grid", gap: 10 },
  historyItem: { borderRadius: 16, padding: 12, background: "white", border: "1px solid rgba(0,0,0,0.06)" },
  historyTop: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  historyAction: { fontWeight: 950, fontSize: 13 },
  historyTime: { fontSize: 12, opacity: 0.7 },
  historyMeta: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  historyReason: { fontSize: 13, marginTop: 6, opacity: 0.9 },

  footer: { borderTop: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.70)", backdropFilter: "blur(10px)" },
  footerInner: { maxWidth: 1200, margin: "0 auto", padding: "14px 20px", display: "flex", justifyContent: "space-between", gap: 12 },
  footerText: { fontSize: 12, fontWeight: 850, opacity: 0.8 },
  footerTextMuted: { fontSize: 12, opacity: 0.6 },
};
