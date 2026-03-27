// src/pages/rh/RHSpendingReport.tsx
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ReportRow = {
  employee_id: string;
  employee_name: string;
  employee_cpf: string | null;
  month_key: string | null;
  orders_count: number | null;
  total_spent: number | null;
  payroll_discount: number | null;
  spent_pay_on_pickup: number | null;
};

type SortKey =
  | "employee_name"
  | "orders_count"
  | "total_spent"
  | "payroll_discount"
  | "spent_pay_on_pickup";

type OrderItem = {
  id: string | number | null;
  product_name: string | null;
  quantity: number | null;
  subtotal: number | null;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  employee_cpf: string | null;
  employee_name: string | null;
  total_items: number | null;
  total_value: number | null;
  status: string | null;
  created_at: string;
  wallet_used_cents: number | null;
  spent_from_balance_cents: number | null;
  pay_on_pickup_cents: number | null;
  order_items?: OrderItem[];
};

type EmployeeOrdersMap = Record<string, OrderRow[]>;

const CANCELED_STATUS = "cancelado";

/* ---------------- helpers ---------------- */

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

const formatShortDate = (value: string) => {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const centsToBRL = (v: unknown) => n(v) / 100;

const toISODate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDaysToISODate = (value: string, days: number) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toISODate(date);
};

const getMonthDateRange = (key: string) => {
  const match = key.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return null;
  }

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return {
    start: toISODate(start),
    end: toISODate(end),
  };
};

const getOrderWalletSpent = (order: Pick<OrderRow, "wallet_used_cents" | "spent_from_balance_cents">) =>
  Math.max(n(order.wallet_used_cents), n(order.spent_from_balance_cents));

const getOrderPickupSpent = (order: Pick<OrderRow, "total_value" | "wallet_used_cents" | "spent_from_balance_cents" | "pay_on_pickup_cents">) => {
  const explicitPickup = n(order.pay_on_pickup_cents);
  if (explicitPickup > 0) return explicitPickup;

  const totalInCents = Math.round(n(order.total_value) * 100);
  const walletInCents = getOrderWalletSpent(order as OrderRow);
  return Math.max(0, totalInCents - walletInCents);
};

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toRHCSV(rows: ReportRow[]) {
  const header = ["Nome", "CPF", "Desconto (Saldo)"].join(";");

  const escape = (s: unknown) => {
    const str = String(s ?? "");
    if (/[;"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const ordered = [...rows].sort((a, b) =>
    (a.employee_name ?? "").localeCompare(b.employee_name ?? "", "pt-BR", {
      sensitivity: "base",
    })
  );

  const lines = ordered.map((r) => {
    const nome = r.employee_name ?? "";
    const cpf = r.employee_cpf ?? "";
    const desconto = formatBRL(n(r.payroll_discount));
    return [escape(nome), escape(cpf), escape(desconto)].join(";");
  });

  const BOM = "\uFEFF";
  return BOM + [header, ...lines].join("\n");
}

function buildRowsFromOrders(orders: OrderRow[], monthKey: string): {
  rows: ReportRow[];
  ordersByEmployee: EmployeeOrdersMap;
} {
  const groups = new Map<string, ReportRow>();
  const ordersByEmployee: EmployeeOrdersMap = {};

  for (const order of orders) {
    const status = String(order.status ?? "").toLowerCase();
    if (status === CANCELED_STATUS) continue;

    const employeeName = order.employee_name?.trim() || "Funcionário sem nome";
    const employeeCpf = order.employee_cpf?.trim() || null;
    const employeeId = employeeCpf || order.id;

    if (!groups.has(employeeId)) {
      groups.set(employeeId, {
        employee_id: employeeId,
        employee_name: employeeName,
        employee_cpf: employeeCpf,
        month_key: monthKey || null,
        orders_count: 0,
        total_spent: 0,
        payroll_discount: 0,
        spent_pay_on_pickup: 0,
      });
    }

    const row = groups.get(employeeId)!;
    row.orders_count = n(row.orders_count) + 1;
    row.total_spent = n(row.total_spent) + n(order.total_value);
    row.payroll_discount = n(row.payroll_discount) + centsToBRL(getOrderWalletSpent(order));
    row.spent_pay_on_pickup = n(row.spent_pay_on_pickup) + centsToBRL(getOrderPickupSpent(order));

    if (!ordersByEmployee[employeeId]) {
      ordersByEmployee[employeeId] = [];
    }
    ordersByEmployee[employeeId].push(order);
  }

  return {
    rows: Array.from(groups.values()),
    ordersByEmployee,
  };
}

/* ---------------- styles ---------------- */

const Page = styled.div`
  background: #ffffff;
  min-height: 100vh;
  padding: 24px;
`;

const Container = styled.div`
  max-width: 1280px;
  margin: 0 auto;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
`;

const LeftHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.6rem;
  font-weight: 800;
  color: #111;
`;

const Subtitle = styled.p`
  margin: 0;
  color: #666;
  font-size: 0.95rem;
`;

const Actions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const Button = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid
    ${({ $primary, $danger }) =>
      $danger
        ? "rgba(140,0,0,0.18)"
        : $primary
          ? "rgba(184,38,38,0.35)"
          : "#ddd"};
  background: ${({ $primary, $danger }) =>
    $danger ? "#fff5f5" : $primary ? "rgba(184,38,38,0.10)" : "#fff"};
  color: ${({ $primary, $danger }) => ($danger ? "#8c0000" : $primary ? "#b82626" : "#222")};
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ $primary, $danger }) =>
      $danger ? "#ffe8e8" : $primary ? "rgba(184,38,38,0.14)" : "#f6f6f6"};
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const Card = styled.div`
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #e5e5e5;
  border-radius: 14px;
  background: #fff;
`;

const Filters = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: flex-end;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 180px;

  @media (max-width: 640px) {
    min-width: 100%;
  }
`;

const Label = styled.label`
  font-size: 0.8rem;
  font-weight: 800;
  color: #444;
`;

const Input = styled.input`
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  font-size: 0.92rem;
  outline: none;

  &:focus {
    border-color: rgba(184, 38, 38, 0.55);
    box-shadow: 0 0 0 4px rgba(184, 38, 38, 0.12);
  }
`;

const Hint = styled.div`
  margin-top: 10px;
  color: #666;
  font-size: 0.82rem;
`;

const Summary = styled.div`
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;

  @media (max-width: 980px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryItem = styled.div`
  border: 1px solid #e9e9e9;
  border-radius: 12px;
  padding: 12px;
  background: #fff;
`;

const SummaryLabel = styled.div`
  font-size: 0.75rem;
  color: #666;
  font-weight: 800;
`;

const SummaryValue = styled.div`
  margin-top: 6px;
  font-size: 1rem;
  font-weight: 900;
  color: #111;
`;

const ErrorBox = styled.div`
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 0, 0, 0.22);
  background: rgba(255, 0, 0, 0.07);
  color: rgba(140, 0, 0, 0.92);
  font-weight: 800;
  white-space: pre-wrap;
`;

const TableWrap = styled.div`
  margin-top: 18px;
  border: 1px solid #e5e5e5;
  border-radius: 14px;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 980px;
`;

const Th = styled.th<{ align?: "left" | "right" }>`
  text-align: ${({ align }) => align ?? "left"};
  padding: 12px;
  background: #f5f5f5;
  font-size: 0.8rem;
  font-weight: 900;
  border-bottom: 1px solid #ddd;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
`;

const Td = styled.td<{ align?: "left" | "right"; strong?: boolean }>`
  text-align: ${({ align }) => align ?? "left"};
  padding: 12px;
  border-bottom: 1px solid #eee;
  font-weight: ${({ strong }) => (strong ? 900 : 650)};
  color: #222;
  vertical-align: top;
`;

const Empty = styled.div`
  padding: 20px;
  text-align: center;
  color: #666;
  font-weight: 700;
`;

const DetailButton = styled.button`
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid rgba(184, 38, 38, 0.18);
  background: rgba(184, 38, 38, 0.08);
  color: #b82626;
  font-weight: 800;
  cursor: pointer;

  &:hover {
    background: rgba(184, 38, 38, 0.12);
  }
`;

const DialogBody = styled.div`
  max-height: 70vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const OrderCard = styled.div`
  border: 1px solid #ececec;
  border-radius: 14px;
  padding: 14px;
  background: #fff;
`;

const OrderTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const OrderTitle = styled.div`
  font-size: 0.96rem;
  font-weight: 900;
  color: #111;
`;

const OrderMeta = styled.div`
  margin-top: 4px;
  color: #666;
  font-size: 0.82rem;
`;

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 900;
  text-transform: capitalize;
  border: 1px solid
    ${({ $status }) => ($status === CANCELED_STATUS ? "rgba(140,0,0,0.15)" : "rgba(184,38,38,0.15)")};
  background: ${({ $status }) => ($status === CANCELED_STATUS ? "#fff1f1" : "#fff7f7")};
  color: ${({ $status }) => ($status === CANCELED_STATUS ? "#8c0000" : "#b82626")};
`;

const OrderBreakdown = styled.div`
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const OrderMetric = styled.div`
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 10px;
  background: #fafafa;
`;

const OrderMetricLabel = styled.div`
  color: #666;
  font-size: 0.74rem;
  font-weight: 800;
`;

const OrderMetricValue = styled.div`
  margin-top: 6px;
  color: #111;
  font-size: 0.95rem;
  font-weight: 900;
`;

const ItemsList = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const ItemRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #efefef;
`;

const ItemName = styled.div`
  font-size: 0.9rem;
  font-weight: 800;
  color: #222;
`;

const ItemMeta = styled.div`
  margin-top: 2px;
  color: #666;
  font-size: 0.8rem;
`;

/* ---------------- component ---------------- */

export default function RHSpendingReport() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [ordersByEmployee, setOrdersByEmployee] = useState<EmployeeOrdersMap>({});
  const [monthKey, setMonthKey] = useState("");
  const [monthKeyInput, setMonthKeyInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("payroll_discount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line
  }, []);

  async function loadCurrentCycle() {
    const { data, error } = await supabase.rpc("current_pay_cycle_key");
    if (error) throw error;

    const key =
      typeof data === "string"
        ? data
        : data?.key ?? data?.month_key ?? data?.current_pay_cycle_key ?? "";

    if (!key) throw new Error("RPC current_pay_cycle_key não retornou um month_key válido.");
    return key as string;
  }

  async function fetchOrders(start: string, end: string) {
    const startIso = `${start}T00:00:00`;
    const endIso = `${addDaysToISODate(end, 1)}T00:00:00`;

    const { data, error } = await supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        employee_cpf,
        employee_name,
        total_items,
        total_value,
        status,
        created_at,
        wallet_used_cents,
        spent_from_balance_cents,
        pay_on_pickup_cents,
        order_items (
          id,
          product_name,
          quantity,
          subtotal
        )
      `
      )
      .gte("created_at", startIso)
      .lt("created_at", endIso)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as OrderRow[];
  }

  async function loadInitial() {
    setLoading(true);
    setError("");
    try {
      const key = await loadCurrentCycle();
      const range = getMonthDateRange(key);
      if (!range) throw new Error("Não foi possível converter o ciclo atual em intervalo de datas.");

      setMonthKey(key);
      setMonthKeyInput(key);
      setStartDate(range.start);
      setEndDate(range.end);

      const orders = await fetchOrders(range.start, range.end);
      const built = buildRowsFromOrders(orders, key);
      setRows(built.rows);
      setOrdersByEmployee(built.ordersByEmployee);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar relatório.");
      setRows([]);
      setOrdersByEmployee({});
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    if (!startDate || !endDate) {
      setError("Informe a data inicial e a data final.");
      return;
    }

    if (startDate > endDate) {
      setError("A data inicial não pode ser maior que a data final.");
      return;
    }

    setRefreshing(true);
    setError("");
    setSelectedEmployeeId(null);

    try {
      const key = monthKeyInput.trim() || `${startDate.slice(0, 7)}`;
      setMonthKey(key);

      const orders = await fetchOrders(startDate, endDate);
      const built = buildRowsFromOrders(orders, key);
      setRows(built.rows);
      setOrdersByEmployee(built.ordersByEmployee);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao atualizar relatório.");
      setRows([]);
      setOrdersByEmployee({});
    } finally {
      setRefreshing(false);
    }
  }

  function applyMonthPreset() {
    const range = getMonthDateRange(monthKeyInput);
    if (!range) {
      setError("Use o formato de ciclo AAAA-MM para preencher as datas automaticamente.");
      return;
    }

    setError("");
    setStartDate(range.start);
    setEndDate(range.end);
  }

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const name = (r.employee_name ?? "").toLowerCase();
      const cpf = (r.employee_cpf ?? "").toLowerCase();
      return name.includes(s) || cpf.includes(s);
    });
  }, [rows, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;

      if (sortKey === "employee_name") {
        const av = (a.employee_name ?? "").toLowerCase();
        const bv = (b.employee_name ?? "").toLowerCase();
        return av.localeCompare(bv) * dir;
      }

      return (n((a as Record<string, unknown>)[sortKey]) - n((b as Record<string, unknown>)[sortKey])) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return {
      total: sorted.reduce((a, r) => a + n(r.total_spent), 0),
      desconto: sorted.reduce((a, r) => a + n(r.payroll_discount), 0),
      retirada: sorted.reduce((a, r) => a + n(r.spent_pay_on_pickup), 0),
      pedidos: sorted.reduce((a, r) => a + n(r.orders_count), 0),
      funcionarios: sorted.length,
    };
  }, [sorted]);

  const selectedEmployee = useMemo(
    () => sorted.find((row) => row.employee_id === selectedEmployeeId) ?? null,
    [selectedEmployeeId, sorted]
  );

  const selectedOrders = useMemo(
    () => (selectedEmployeeId ? ordersByEmployee[selectedEmployeeId] ?? [] : []),
    [ordersByEmployee, selectedEmployeeId]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "employee_name" ? "asc" : "desc");
    }
  }

  function exportCSV() {
    const csv = toRHCSV(sorted);
    const filename = `rh_desconto_folha_${(monthKey || "periodo").replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
    downloadTextFile(filename, csv);
  }

  const canExport = !loading && sorted.length > 0;

  return (
    <Page>
      <Container>
        <Header>
          <LeftHeader>
            <Title>Relatório de Gastos</Title>
            <Subtitle>Consolidação por funcionário com filtro de período e detalhamento por pedido.</Subtitle>
          </LeftHeader>

          <Actions>
            <Button onClick={() => navigate("/rh")}>Voltar</Button>

            <Button onClick={reload} disabled={loading || refreshing || !startDate || !endDate}>
              {refreshing ? "Atualizando..." : "Carregar"}
            </Button>

            <Button $primary onClick={exportCSV} disabled={!canExport}>
              Exportar CSV
            </Button>
          </Actions>
        </Header>

        <Card>
          <Filters>
            <Field>
              <Label>Ciclo</Label>
              <Input
                value={monthKeyInput}
                onChange={(e) => setMonthKeyInput(e.target.value)}
                placeholder="ex: 2026-03"
              />
            </Field>

            <Field>
              <Label>Data inicial</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>

            <Field>
              <Label>Data final</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>

            <Field style={{ flex: 1 }}>
              <Label>Buscar funcionário</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou CPF"
              />
            </Field>

            <Button type="button" onClick={applyMonthPreset} disabled={!monthKeyInput.trim()}>
              Usar ciclo nas datas
            </Button>

            <Button
              type="button"
              $danger
              onClick={() => {
                const range = getMonthDateRange(monthKeyInput || monthKey);
                setSearch("");
                setSelectedEmployeeId(null);
                if (range) {
                  setStartDate(range.start);
                  setEndDate(range.end);
                }
              }}
            >
              Limpar busca
            </Button>
          </Filters>

          <Hint>
            O filtro de datas considera a data do pedido. Pedidos cancelados não entram no consolidado.
          </Hint>

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          <Summary>
            <SummaryItem>
              <SummaryLabel>Período</SummaryLabel>
              <SummaryValue>
                {startDate && endDate ? `${formatShortDate(startDate)} até ${formatShortDate(endDate)}` : "—"}
              </SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Funcionários</SummaryLabel>
              <SummaryValue>{totals.funcionarios}</SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Total a descontar (saldo)</SummaryLabel>
              <SummaryValue>{formatBRL(totals.desconto)}</SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Pago na retirada</SummaryLabel>
              <SummaryValue>{formatBRL(totals.retirada)}</SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Pedidos</SummaryLabel>
              <SummaryValue>{totals.pedidos}</SummaryValue>
            </SummaryItem>
          </Summary>

          <TableWrap>
            {loading ? (
              <Empty>Carregando...</Empty>
            ) : sorted.length === 0 ? (
              <Empty>Nenhum dado encontrado para o período informado.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th onClick={() => toggleSort("employee_name")}>
                      Funcionário {sortKey === "employee_name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </Th>
                    <Th style={{ cursor: "default" }}>CPF</Th>
                    <Th align="right" onClick={() => toggleSort("orders_count")}>
                      Pedidos {sortKey === "orders_count" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </Th>
                    <Th align="right" onClick={() => toggleSort("total_spent")}>
                      Total (pedido) {sortKey === "total_spent" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </Th>
                    <Th align="right" onClick={() => toggleSort("payroll_discount")}>
                      Desconto (saldo) {sortKey === "payroll_discount" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </Th>
                    <Th align="right" onClick={() => toggleSort("spent_pay_on_pickup")}>
                      Retirada {sortKey === "spent_pay_on_pickup" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </Th>
                    <Th style={{ cursor: "default" }}>Detalhes</Th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.employee_id}>
                      <Td strong>{r.employee_name}</Td>
                      <Td>{r.employee_cpf ?? "—"}</Td>
                      <Td align="right">{n(r.orders_count)}</Td>
                      <Td align="right" strong>
                        {formatBRL(n(r.total_spent))}
                      </Td>
                      <Td align="right">{formatBRL(n(r.payroll_discount))}</Td>
                      <Td align="right">{formatBRL(n(r.spent_pay_on_pickup))}</Td>
                      <Td>
                        <DetailButton type="button" onClick={() => setSelectedEmployeeId(r.employee_id)}>
                          Ver pedidos
                        </DetailButton>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableWrap>
        </Card>
      </Container>

      <Dialog open={Boolean(selectedEmployeeId)} onOpenChange={(open) => !open && setSelectedEmployeeId(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedEmployee?.employee_name ?? "Pedidos do funcionário"}</DialogTitle>
            <DialogDescription>
              {selectedEmployee?.employee_cpf ? `CPF ${selectedEmployee.employee_cpf} • ` : ""}
              {selectedOrders.length} pedido(s) no período selecionado.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            {selectedOrders.length === 0 ? (
              <Empty>Nenhum pedido encontrado.</Empty>
            ) : (
              selectedOrders.map((order) => {
                const status = String(order.status ?? "").toLowerCase();
                const wallet = centsToBRL(getOrderWalletSpent(order));
                const pickup = centsToBRL(getOrderPickupSpent(order));

                return (
                  <OrderCard key={order.id}>
                    <OrderTop>
                      <div>
                        <OrderTitle>{order.order_number || "Pedido sem número"}</OrderTitle>
                        <OrderMeta>{formatDateTime(order.created_at)}</OrderMeta>
                      </div>

                      <StatusBadge $status={status || "sem_status"}>{status || "sem status"}</StatusBadge>
                    </OrderTop>

                    <OrderBreakdown>
                      <OrderMetric>
                        <OrderMetricLabel>Total do pedido</OrderMetricLabel>
                        <OrderMetricValue>{formatBRL(n(order.total_value))}</OrderMetricValue>
                      </OrderMetric>

                      <OrderMetric>
                        <OrderMetricLabel>Itens</OrderMetricLabel>
                        <OrderMetricValue>{n(order.total_items)}</OrderMetricValue>
                      </OrderMetric>

                      <OrderMetric>
                        <OrderMetricLabel>Descontado no saldo</OrderMetricLabel>
                        <OrderMetricValue>{formatBRL(wallet)}</OrderMetricValue>
                      </OrderMetric>

                      <OrderMetric>
                        <OrderMetricLabel>Pago na retirada</OrderMetricLabel>
                        <OrderMetricValue>{formatBRL(pickup)}</OrderMetricValue>
                      </OrderMetric>
                    </OrderBreakdown>

                    <ItemsList>
                      {(order.order_items ?? []).length === 0 ? (
                        <ItemRow>
                          <div>
                            <ItemName>Sem itens vinculados</ItemName>
                            <ItemMeta>Esse pedido não retornou itens no relacionamento.</ItemMeta>
                          </div>
                        </ItemRow>
                      ) : (
                        (order.order_items ?? []).map((item) => (
                          <ItemRow key={`${order.id}-${item.id ?? item.product_name ?? "item"}`}>
                            <div>
                              <ItemName>{item.product_name || "Item sem nome"}</ItemName>
                              <ItemMeta>Quantidade: {n(item.quantity)}</ItemMeta>
                            </div>

                            <ItemName>{formatBRL(n(item.subtotal))}</ItemName>
                          </ItemRow>
                        ))
                      )}
                    </ItemsList>
                  </OrderCard>
                );
              })
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
