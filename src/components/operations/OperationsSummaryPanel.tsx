import { Button } from "@/components/ui/button";
import {
  type AdminOperationLog,
  type AdminOperationsStatusResponse,
  formatOperationStatus,
} from "@/lib/adminOperations";

function formatTimestamp(value?: string | null) {
  if (!value) return "Sem histórico";
  return new Date(value).toLocaleString("pt-BR");
}

function getStatusTone(log: AdminOperationLog | null | undefined) {
  if (!log) return "border-slate-200 bg-slate-50 text-slate-700";
  if (log.status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (log.status === "failed") return "border-red-200 bg-red-50 text-red-800";
  if (log.status === "blocked") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

type Props = {
  loading?: boolean;
  status: AdminOperationsStatusResponse | null | undefined;
  onHistoryClick: () => void;
};

export default function OperationsSummaryPanel(props: Props) {
  const { loading, status, onHistoryClick } = props;

  if (loading) {
    return (
      <div className="rounded-3xl border border-white/30 bg-white/85 p-5 shadow-lg">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-48 rounded bg-muted" />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-20 rounded-xl bg-muted" />
            <div className="h-20 rounded-xl bg-muted" />
            <div className="h-20 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const syncTone = getStatusTone(status?.latestSync);
  const restoreTone = getStatusTone(status?.latestRestore);

  return (
    <div className="rounded-3xl border border-white/40 bg-white/90 p-5 shadow-xl backdrop-blur">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.24em] text-red-700/70">
            Operação
          </div>
          <h2 className="text-xl font-extrabold text-zinc-900">Status operacional</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
            {status?.currentCycleKey ? `Ciclo ${status.currentCycleKey}` : "Ciclo indisponível"}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            Janela reset: {status?.resetWindow?.start ?? "—"} a {status?.resetWindow?.end ?? "—"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className={`rounded-2xl border p-4 ${syncTone}`}>
          <div className="text-xs font-semibold uppercase tracking-wide">Integração Sheets</div>
          <div className="mt-2 text-base font-bold">
            {status?.syncInProgress ? "Sincronizando agora" : formatOperationStatus(status?.latestSync?.status)}
          </div>
          <div className="mt-1 text-sm opacity-80">
            Última sync: {formatTimestamp(status?.latestSync?.created_at)}
          </div>
          <div className="mt-1 text-xs opacity-75">
            {status?.latestSync?.actor_name
              ? `Por ${status.latestSync.actor_name}`
              : status?.storageReady
                ? "Sem auditoria anterior"
                : "Rode o script SQL da auditoria"}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 ${restoreTone}`}>
          <div className="text-xs font-semibold uppercase tracking-wide">Restauração de saldo</div>
          <div className="mt-2 text-base font-bold">
            {status?.resetInProgress
              ? "Restauração em andamento"
              : status?.restoredCurrentCycle
                ? "Já restaurado neste ciclo"
                : "Disponível para ação"}
          </div>
          <div className="mt-1 text-sm opacity-80">
            Última restauração: {formatTimestamp(status?.latestRestore?.created_at)}
          </div>
          <div className="mt-1 text-xs opacity-75">
            {status?.latestRestore?.message || "Ainda não houve restauração registrada."}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wide">Auditoria e feedback</div>
          <div className="mt-2 text-base font-bold">
            {status?.storageReady ? "Auditoria ativa" : "Auditoria pendente de SQL"}
          </div>
          <div className="mt-1 text-sm opacity-80">
            {status?.storageReady
              ? `${status.recent?.length ?? 0} eventos recentes disponíveis.`
              : "Crie a tabela admin_operation_logs para histórico persistente."}
          </div>
          <Button className="mt-3" variant="outline" onClick={onHistoryClick}>
            Ver histórico operacional
          </Button>
        </div>
      </div>
    </div>
  );
}

