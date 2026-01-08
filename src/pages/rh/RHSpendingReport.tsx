// src/pages/rh/RHSpendingReport.tsx
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

type ReportRow = {
  employee_id: string;
  employee_name: string;
  employee_cpf: string | null;
  month_key: string | null;
  orders_count: number | null;

  total_spent: number | null; // informativo (total do pedido)
  payroll_discount: number | null; // ✅ DESCONTO EM FOLHA (saldo)
  spent_pay_on_pickup: number | null; // informativo (pago na retirada)
};

type SortKey =
  | "employee_name"
  | "orders_count"
  | "total_spent"
  | "payroll_discount"
  | "spent_pay_on_pickup";

/* ---------------- helpers ---------------- */

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

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

// ✅ CSV “bonito” pro RH: só Nome, CPF e Desconto (saldo)
function toRHCSV(rows: ReportRow[]) {
  const header = ["Nome", "CPF", "Desconto (Saldo)"].join(";");

  const escape = (s: any) => {
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

  // BOM ajuda Excel a reconhecer UTF-8 (acentos)
  const BOM = "\uFEFF";
  return BOM + [header, ...lines].join("\n");
}

/* ---------------- styles ---------------- */

const Page = styled.div`
  background: #ffffff;
  min-height: 100vh;
  padding: 24px;
`;

const Container = styled.div`
  max-width: 1200px;
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

const Actions = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
`;

const Button = styled.button<{ $primary?: boolean }>`
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid ${({ $primary }) => ($primary ? "rgba(184,38,38,0.35)" : "#ddd")};
  background: ${({ $primary }) => ($primary ? "rgba(184,38,38,0.10)" : "#fff")};
  color: ${({ $primary }) => ($primary ? "#b82626" : "#222")};
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${({ $primary }) => ($primary ? "rgba(184,38,38,0.14)" : "#f6f6f6")};
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
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;

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

const Summary = styled.div`
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 800px) {
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
  overflow: hidden;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
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
`;

const Td = styled.td<{ align?: "left" | "right"; strong?: boolean }>`
  text-align: ${({ align }) => align ?? "left"};
  padding: 12px;
  border-bottom: 1px solid #eee;
  font-weight: ${({ strong }) => (strong ? 900 : 650)};
  color: #222;
`;

const Empty = styled.div`
  padding: 20px;
  text-align: center;
  color: #666;
  font-weight: 700;
`;

/* ---------------- component ---------------- */

export default function RHSpendingReport() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [monthKey, setMonthKey] = useState("");
  const [monthKeyInput, setMonthKeyInput] = useState("");
  const [search, setSearch] = useState("");

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

  async function fetchReport(key: string) {
    const { data, error } = await supabase
      .from("rh_spending_report")
      .select(
        "employee_id, employee_name, employee_cpf, month_key, orders_count, total_spent, payroll_discount, spent_pay_on_pickup"
      )
      .eq("month_key", key);

    if (error) throw error;
    return (data ?? []) as ReportRow[];
  }

  async function loadInitial() {
    setLoading(true);
    setError("");
    try {
      const key = await loadCurrentCycle();
      setMonthKey(key);
      setMonthKeyInput(key);

      const data = await fetchReport(key);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar relatório.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    if (!monthKeyInput.trim()) return;
    setRefreshing(true);
    setError("");
    try {
      const key = monthKeyInput.trim();
      setMonthKey(key);

      const data = await fetchReport(key);
      setRows(data);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao atualizar relatório.");
      setRows([]);
    } finally {
      setRefreshing(false);
    }
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

      return (n((a as any)[sortKey]) - n((b as any)[sortKey])) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totals = useMemo(() => {
    return {
      total: sorted.reduce((a, r) => a + n(r.total_spent), 0),
      desconto: sorted.reduce((a, r) => a + n(r.payroll_discount), 0),
      retirada: sorted.reduce((a, r) => a + n(r.spent_pay_on_pickup), 0),
      pedidos: sorted.reduce((a, r) => a + n(r.orders_count), 0),
    };
  }, [sorted]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "employee_name" ? "asc" : "desc");
    }
  }

  function exportCSV() {
    // ✅ CSV do RH: Nome, CPF, Desconto (saldo)
    const csv = toRHCSV(sorted);
    const filename = `rh_desconto_folha_${(monthKey || "ciclo").replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;
    downloadTextFile(filename, csv);
  }

  const canExport = !loading && sorted.length > 0;

  return (
    <Page>
      <Container>
        <Header>
          <LeftHeader>
            <Title>Relatório de Gastos</Title>
          </LeftHeader>

          <Actions>
            <Button onClick={() => navigate("/rh")}>Voltar</Button>

            <Button onClick={reload} disabled={loading || refreshing || !monthKeyInput.trim()}>
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
                placeholder="ex: 2025-12"
              />
            </Field>

            <Field style={{ flex: 1 }}>
              <Label>Buscar funcionário</Label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou CPF"
              />
            </Field>
          </Filters>

          {error ? <ErrorBox>{error}</ErrorBox> : null}

          <Summary>
            <SummaryItem>
              <SummaryLabel>Ciclo</SummaryLabel>
              <SummaryValue>{monthKey || "—"}</SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Total a descontar (saldo)</SummaryLabel>
              <SummaryValue>{formatBRL(totals.desconto)}</SummaryValue>
            </SummaryItem>

            <SummaryItem>
              <SummaryLabel>Pago na retirada (excedente)</SummaryLabel>
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
              <Empty>Nenhum dado encontrado</Empty>
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
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </TableWrap>
        </Card>
      </Container>
    </Page>
  );
}
