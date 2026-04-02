import { useMemo, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bg } from "@/components/ui/app-surface";
import {
  formatOperationAction,
  formatOperationStatus,
  getAdminOperationsStatus,
  listAdminOperationHistory,
  type AdminOperationAction,
} from "@/lib/adminOperations";

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  padding: 24px 16px 48px;
`;

const Shell = styled.div`
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const BackButton = styled.button`
  position: sticky;
  top: 18px;
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(184, 38, 38, 0.15);
  background: rgba(255, 255, 255, 0.86);
  color: #8f1717;
  font-weight: 700;
  cursor: pointer;
  z-index: 2;
`;

const Hero = styled.div`
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.92);
  padding: 28px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.14);
`;

const HeroTitle = styled.h1`
  margin: 0;
  color: #8f1717;
  font-size: 2rem;
  font-weight: 900;
`;

const HeroSubtitle = styled.p`
  margin: 10px 0 0;
  color: #5f5f5f;
  line-height: 1.55;
`;

const SummaryGrid = styled.div`
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryCard = styled.div`
  border-radius: 24px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.11);
`;

const SummaryLabel = styled.div`
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 800;
  color: rgba(143, 23, 23, 0.72);
`;

const SummaryValue = styled.div`
  margin-top: 10px;
  font-size: 1.15rem;
  font-weight: 900;
  color: #1f1f1f;
`;

const SummaryMeta = styled.div`
  margin-top: 8px;
  color: #666;
  font-size: 0.92rem;
  line-height: 1.45;
`;

const Toolbar = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
`;

const Select = styled.select`
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: white;
  padding: 10px 12px;
  font-size: 0.95rem;
`;

const HistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const HistoryCard = styled.div`
  border-radius: 24px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.11);
`;

const HistoryTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const Badge = styled.span<{ tone?: "default" | "success" | "danger" | "warning" | "info" }>`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 0.75rem;
  font-weight: 800;
  border: 1px solid
    ${({ tone }) =>
      tone === "success"
        ? "rgba(22, 163, 74, 0.22)"
        : tone === "danger"
          ? "rgba(220, 38, 38, 0.22)"
          : tone === "warning"
            ? "rgba(217, 119, 6, 0.22)"
            : tone === "info"
              ? "rgba(37, 99, 235, 0.22)"
              : "rgba(15, 23, 42, 0.12)"};
  background:
    ${({ tone }) =>
      tone === "success"
        ? "rgba(220, 252, 231, 0.9)"
        : tone === "danger"
          ? "rgba(254, 226, 226, 0.9)"
          : tone === "warning"
            ? "rgba(254, 243, 199, 0.9)"
            : tone === "info"
              ? "rgba(219, 234, 254, 0.9)"
              : "rgba(248, 250, 252, 0.92)"};
  color:
    ${({ tone }) =>
      tone === "success"
        ? "#166534"
        : tone === "danger"
          ? "#991b1b"
          : tone === "warning"
            ? "#92400e"
            : tone === "info"
              ? "#1d4ed8"
              : "#334155"};
`;

function statusTone(status?: string | null) {
  if (status === "success") return "success";
  if (status === "failed") return "danger";
  if (status === "blocked") return "warning";
  if (status === "running") return "info";
  return "default";
}

export default function OperationsHistory() {
  const navigate = useNavigate();
  const [actionFilter, setActionFilter] = useState<AdminOperationAction | "all">("all");

  const statusQuery = useQuery({
    queryKey: ["admin-operations-status"],
    queryFn: getAdminOperationsStatus,
    staleTime: 20_000,
    retry: 1,
  });

  const historyQuery = useQuery({
    queryKey: ["admin-operations-history", actionFilter],
    queryFn: () => listAdminOperationHistory({ action: actionFilter, limit: 50 }),
    staleTime: 20_000,
    retry: 1,
  });

  const rows = useMemo(() => historyQuery.data?.rows ?? [], [historyQuery.data?.rows]);
  const counters = useMemo(() => {
    return {
      total: rows.length,
      success: rows.filter((row) => row.status === "success").length,
      failed: rows.filter((row) => row.status === "failed").length,
      blocked: rows.filter((row) => row.status === "blocked").length,
    };
  }, [rows]);

  return (
    <Bg>
      <Wrapper>
        <Shell>
          <BackButton type="button" onClick={() => navigate(-1)}>
            ← Voltar
          </BackButton>

          <Hero>
            <HeroTitle>Histórico Operacional</HeroTitle>
            <HeroSubtitle>
              Acompanhe sincronizações, restaurações de saldo e bloqueios de operação com registro
              de usuário, horário e ciclo impactado.
            </HeroSubtitle>
          </Hero>

          <SummaryGrid>
            <SummaryCard>
              <SummaryLabel>Integração Sheets</SummaryLabel>
              <SummaryValue>
                {statusQuery.data?.syncInProgress
                  ? "Sincronizando agora"
                  : formatOperationStatus(statusQuery.data?.latestSync?.status)}
              </SummaryValue>
              <SummaryMeta>
                Última sync:{" "}
                {statusQuery.data?.latestSync?.created_at
                  ? new Date(statusQuery.data.latestSync.created_at).toLocaleString("pt-BR")
                  : "Sem histórico"}
              </SummaryMeta>
            </SummaryCard>

            <SummaryCard>
              <SummaryLabel>Restauração de Saldo</SummaryLabel>
              <SummaryValue>
                {statusQuery.data?.restoredCurrentCycle
                  ? "Já restaurado no ciclo"
                  : statusQuery.data?.resetInProgress
                    ? "Em andamento"
                    : "Disponível"}
              </SummaryValue>
              <SummaryMeta>
                Ciclo atual: {statusQuery.data?.currentCycleKey ?? "Indisponível"}
              </SummaryMeta>
            </SummaryCard>

            <SummaryCard>
              <SummaryLabel>Auditoria</SummaryLabel>
              <SummaryValue>{statusQuery.data?.storageReady ? "Ativa" : "Pendente"}</SummaryValue>
              <SummaryMeta>
                {statusQuery.data?.storageReady
                  ? `${counters.total} registro(s) carregados.`
                  : "Rode o script SQL para persistir o histórico."}
              </SummaryMeta>
            </SummaryCard>
          </SummaryGrid>

          <Toolbar>
            <Select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as any)}>
              <option value="all">Todas as ações</option>
              <option value="sync_employees">Sincronização de funcionários</option>
              <option value="restore_employee_balances">Restauração de saldo</option>
            </Select>
            <Badge tone="success">Sucesso: {counters.success}</Badge>
            <Badge tone="danger">Falhas: {counters.failed}</Badge>
            <Badge tone="warning">Bloqueios: {counters.blocked}</Badge>
          </Toolbar>

          {historyQuery.isLoading ? (
            <HistoryCard>Carregando histórico...</HistoryCard>
          ) : rows.length === 0 ? (
            <HistoryCard>Nenhum registro encontrado para o filtro selecionado.</HistoryCard>
          ) : (
            <HistoryList>
              {rows.map((row) => (
                <HistoryCard key={row.id}>
                  <HistoryTop>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: "1.05rem", color: "#1f1f1f" }}>
                        {formatOperationAction(row.action)}
                      </div>
                      <div style={{ marginTop: 6, color: "#666", fontSize: "0.94rem" }}>
                        {new Date(row.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <Badge tone={statusTone(row.status)}>{formatOperationStatus(row.status)}</Badge>
                  </HistoryTop>

                  <div style={{ marginTop: 12, color: "#4b5563", fontSize: "0.95rem", lineHeight: 1.6 }}>
                    <div>Usuário: {row.actor_name || "—"}</div>
                    <div>CPF: {row.actor_cpf || "—"}</div>
                    <div>Ciclo: {row.target_month_key || "—"}</div>
                    <div>Mensagem: {row.message || "—"}</div>
                  </div>
                </HistoryCard>
              ))}
            </HistoryList>
          )}
        </Shell>
      </Wrapper>
    </Bg>
  );
}
