// src/pages/rh/RhHome.tsx
import { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bg } from "../../components/ui/app-surface";
import {
  getAdminOperationsStatus,
  resetAllEmployeeBalances,
  triggerEmployeeSyncNow,
} from "@/lib/adminOperations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import OperationsSummaryPanel from "@/components/operations/OperationsSummaryPanel";

const Wrapper = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
  padding: 24px 16px;
`;

const Shell = styled.div`
  width: 100%;
  max-width: 860px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const BackButton = styled.button`
  position: absolute;
  top: 18px;
  left: 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid rgba(184, 38, 38, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: rgba(143, 23, 23, 0.88);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  z-index: 2;

  &:hover {
    transform: translateY(-1px);
    background: rgba(255, 247, 245, 0.9);
    box-shadow: 0 10px 22px rgba(143, 23, 23, 0.08);
  }

  @media (max-width: 640px) {
    top: 14px;
    left: 14px;
  }
`;

const Container = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled.button`
  position: relative;
  overflow: hidden;
  width: 100%;
  min-height: 150px;
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid #e6e6e6;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 8px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  cursor: pointer;
  padding: 20px;
  text-align: left;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    border-color: #c9c9c9;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  }

  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
`;

const SyncBox = styled(Box)``;

const ReportBox = styled(Box)``;

const ResetBox = styled(Box)`
  border-color: rgba(184, 38, 38, 0.35);

  &:hover:not(:disabled) {
    border-color: #b82626;
    background: #fffafa;
  }

  h2 {
    color: #b82626;
  }
`;

const CatalogBox = styled(Box)``;


const Title = styled.h2`
  color: #1a1a1a;
  font-size: 1.05rem;
  font-weight: 800;
  margin: 0;
  text-align: left;
`;

const Subtitle = styled.p`
  color: #666;
  font-size: 0.88rem;
  text-align: left;
  width: 100%;
  margin: 0;
  line-height: 1.45;
`;

function getSaoPauloDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value || 0),
    month: Number(parts.find((part) => part.type === "month")?.value || 0),
    day: Number(parts.find((part) => part.type === "day")?.value || 0),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateLabel(year: number, month: number, day: number) {
  return `${pad(day)}/${pad(month)}/${year}`;
}

function getBalanceResetWindow(date = new Date()) {
  const { year, month, day } = getSaoPauloDateParts(date);
  const allowed = day >= 27 || day <= 2;

  if (day >= 27) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return {
      allowed,
      start: formatDateLabel(year, month, 27),
      end: formatDateLabel(nextYear, nextMonth, 2),
    };
  }

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;

  if (day <= 2) {
    return {
      allowed,
      start: formatDateLabel(previousYear, previousMonth, 27),
      end: formatDateLabel(year, month, 2),
    };
  }

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return {
    allowed,
    start: formatDateLabel(year, month, 27),
    end: formatDateLabel(nextYear, nextMonth, 2),
  };
}

const RhHome: React.FC = () => {
  const navigate = useNavigate();
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resettingBalances, setResettingBalances] = useState(false);
  const statusQuery = useQuery({
    queryKey: ["admin-operations-status"],
    queryFn: getAdminOperationsStatus,
    staleTime: 20_000,
    retry: 1,
  });

  const resetWindow = getBalanceResetWindow();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/catalogo");
  };

  const handleSyncEmployeesNow = async () => {
    setSyncingEmployees(true);

    try {
      await triggerEmployeeSyncNow();
      toast.success("Sincronização de funcionários concluída.");
      await statusQuery.refetch();
    } catch (err: any) {
      console.error("Erro ao sincronizar funcionários:", err);
      toast.error(err?.message || "Erro ao sincronizar funcionários.");
    } finally {
      setSyncingEmployees(false);
    }
  };

  const handleOpenResetDialog = () => {
    if (statusQuery.data?.restoredCurrentCycle) {
      toast.error(`O saldo deste ciclo (${statusQuery.data.currentCycleKey}) já foi restaurado.`);
      return;
    }

    setResetDialogOpen(true);
  };

  const handleResetBalances = async () => {
    if (!resetWindow.allowed) {
      toast.error(`Você só pode resetar o saldo de ${resetWindow.start} até ${resetWindow.end}.`);
      return;
    }

    setResettingBalances(true);

    try {
      const payload = await resetAllEmployeeBalances();
      toast.success(
        payload.updatedCount && payload.updatedCount > 0
          ? `Saldo restaurado com sucesso para ${payload.updatedCount} funcionário(s).`
          : "Saldo restaurado com sucesso. Nenhum funcionário tinha saldo consumido neste ciclo."
      );
      setResetDialogOpen(false);
      await statusQuery.refetch();
    } catch (err: any) {
      console.error("Erro ao restaurar saldo dos funcionários:", err);
      toast.error(err?.message || "Erro ao restaurar saldo dos funcionários.");
    } finally {
      setResettingBalances(false);
    }
  };

  return (
    <Bg>
      <Wrapper>
        <BackButton type="button" onClick={handleGoBack}>
          <span aria-hidden="true">←</span>
          <span>Voltar</span>
        </BackButton>

        <Shell>
          <OperationsSummaryPanel
            loading={statusQuery.isLoading}
            status={statusQuery.data}
          />

          <Container>
            <SyncBox onClick={handleSyncEmployeesNow} disabled={syncingEmployees}>
              <Title>{syncingEmployees ? "Sincronizando..." : "Sincronizar Funcionários"}</Title>
              <Subtitle>
                Atualiza os dados do Sheets imediatamente, sem esperar 1 hora.{" "}
                {statusQuery.data?.latestSync?.created_at
                  ? `Última sync: ${new Date(statusQuery.data.latestSync.created_at).toLocaleString("pt-BR")}.`
                  : "Sem histórico recente."}
              </Subtitle>
            </SyncBox>

            <ResetBox onClick={handleOpenResetDialog} disabled={resettingBalances || statusQuery.data?.resetInProgress}>
              <Title>{resettingBalances ? "Restaurando..." : "Restaurar Saldo"}</Title>
              <Subtitle>
                Restaura o saldo de todos os funcionários para o valor inicial da planilha no ciclo atual.
                Permitido somente de{" "}
                {resetWindow.start} até {resetWindow.end}.{" "}
                {statusQuery.data?.restoredCurrentCycle
                  ? `Ciclo ${statusQuery.data.currentCycleKey} já restaurado.`
                  : "Proteção ativa contra repetição no mesmo ciclo."}
              </Subtitle>
            </ResetBox>


            <ReportBox onClick={() => navigate("/rh/relatorio-gastos")}>
              <Title>Relatório de Gastos</Title>
              <Subtitle>Quanto cada funcionário gastou do saldo</Subtitle>
            </ReportBox>


            <CatalogBox onClick={() => navigate("/catalogo")}>
              <Title>Acessar Catálogo</Title>
              <Subtitle>Voltar para o catálogo de produtos dos funcionários</Subtitle>
            </CatalogBox>
          </Container>
        </Shell>
      </Wrapper>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent className="max-w-2xl border-red-200 bg-red-50">
          <AlertDialogHeader className="space-y-4 text-left">
            <AlertDialogTitle className="text-2xl font-extrabold text-red-800">
              {resetWindow.allowed
                ? "Você tem certeza que deseja continuar?"
                : "Restauração de saldo indisponível agora"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-7 text-red-700">
              {resetWindow.allowed
                ? "Você clicou em restaurar o saldo de todos os usuários. Essa ação faz todos os funcionários voltarem ao valor inicial definido na planilha para o ciclo atual e deve ser usada com muito cuidado."
                : `Você só pode resetar o saldo de ${resetWindow.start} até ${resetWindow.end}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="rounded-xl border border-red-200 bg-white/80 p-4 text-sm leading-6 text-red-900">
            {resetWindow.allowed
              ? "Tecnicamente, o sistema zera o gasto acumulado do ciclo atual para que o saldo disponível volte ao valor inicial vindo da planilha."
              : "Fora da janela permitida, o sistema bloqueia a ação no frontend e também no backend."}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingBalances}>
              {resetWindow.allowed ? "Cancelar" : "Fechar"}
            </AlertDialogCancel>
            {resetWindow.allowed && (
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault();
                  void handleResetBalances();
                }}
                className="bg-red-700 hover:bg-red-800"
                disabled={resettingBalances || statusQuery.data?.restoredCurrentCycle}
              >
                {resettingBalances ? "Restaurando..." : "Sim, restaurar saldo"}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Bg>
  );
};

export default RhHome;
