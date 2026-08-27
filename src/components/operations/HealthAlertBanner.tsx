import { useEffect, useState } from "react";
import { AlertTriangle, HeartPulse, ShieldQuestion } from "lucide-react";
import { listAdminOperationHistory, type AdminOperationLog } from "@/lib/adminOperations";

/**
 * A faixa que traz o vigia para fora do log do servidor (27/08/2026).
 *
 * `runHealthCheck` roda de hora em hora no webhook e, desde hoje, grava cada
 * passada em `admin_operation_logs` (action `health_check`). Esta faixa lê a
 * ÚLTIMA passada e a mostra no topo do /admin.
 *
 * Por que isso importa: até aqui o vigia gritava em `console.error`, ou seja,
 * em `pm2 logs webhook` — que exige acesso SSH e alguém lembrar de olhar. Era o
 * mesmo defeito que ele foi criado para cobrir: a recarga mensal passou quatro
 * meses morta empilhando erro num log que ninguém abria.
 *
 * Os três estados que a faixa distingue — e o terceiro é o que dá o valor:
 *
 *   🚨 vermelho  — a última passada achou problema. Lista o que achou.
 *   💚 verde     — a última passada disse "tudo de pé" (discreto, some do caminho).
 *   ⚠️ âmbar     — NÃO HÁ passada recente. É o estado mais importante: um vigia
 *                  parado e um sistema saudável são indistinguíveis pelo
 *                  silêncio, e foi exatamente essa confusão que custou os
 *                  quatro meses. Por isso o "sucesso" também é gravado: sem a
 *                  linha verde de hora em hora, não dá pra saber se o silêncio
 *                  é boa notícia.
 */

// O vigia roda de 60 em 60 min. 3h sem nenhuma linha é o vigia parado, não folga.
const HORAS_ATE_CONSIDERAR_VIGIA_PARADO = 3;

export function HealthAlertBanner() {
  const [ultima, setUltima] = useState<AdminOperationLog | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [falhouAoLer, setFalhouAoLer] = useState(false);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        const resposta = await listAdminOperationHistory({ action: "health_check", limit: 1 });
        if (!ativo) return;
        setUltima(resposta?.rows?.[0] ?? null);
        setFalhouAoLer(false);
      } catch {
        if (!ativo) return;
        // Não some com a faixa por falha de rede: quem lê precisa saber que a
        // informação não chegou, e não presumir que está tudo bem.
        setFalhouAoLer(true);
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    void carregar();
    // Acompanha o ritmo do vigia sem pesar: uma releitura a cada 5 min.
    const timer = setInterval(() => void carregar(), 5 * 60 * 1000);

    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, []);

  if (carregando) return null;

  if (falhouAoLer) {
    return (
      <Faixa tom="ambar" icone={<ShieldQuestion className="h-5 w-5 shrink-0" />}>
        <p className="font-semibold">Não foi possível ler a checagem de saúde.</p>
        <p className="text-sm">
          A faixa não está dizendo que está tudo bem — está dizendo que não conseguiu perguntar.
        </p>
      </Faixa>
    );
  }

  const horasDesde = ultima
    ? (Date.now() - new Date(ultima.created_at).getTime()) / 3_600_000
    : Number.POSITIVE_INFINITY;

  if (!ultima || horasDesde > HORAS_ATE_CONSIDERAR_VIGIA_PARADO) {
    return (
      <Faixa tom="ambar" icone={<ShieldQuestion className="h-5 w-5 shrink-0" />}>
        <p className="font-semibold">O vigia não dá sinal há mais de {Math.floor(horasDesde)}h.</p>
        <p className="text-sm">
          Ele deveria registrar uma passada por hora. Sem isso, silêncio não é boa notícia — pode ser
          o webhook parado. Confira <code className="text-xs">pm2 logs webhook</code>.
        </p>
      </Faixa>
    );
  }

  if (ultima.status === "success") {
    return (
      <Faixa tom="verde" icone={<HeartPulse className="h-5 w-5 shrink-0" />}>
        <p className="text-sm">
          Checagem de saúde: tudo de pé.{" "}
          <span className="opacity-70">(última passada {formatarQuando(ultima.created_at)})</span>
        </p>
      </Faixa>
    );
  }

  const alertas: string[] = Array.isArray(ultima.metadata?.alertas) ? ultima.metadata!.alertas : [];

  return (
    <Faixa tom="vermelho" icone={<AlertTriangle className="h-5 w-5 shrink-0" />}>
      <p className="font-semibold">
        A checagem de saúde encontrou {alertas.length || "alguns"} problema(s){" "}
        <span className="font-normal opacity-80">({formatarQuando(ultima.created_at)})</span>
      </p>
      {alertas.length > 0 && (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {alertas.map((alerta, i) => (
            <li key={i}>{alerta}</li>
          ))}
        </ul>
      )}
    </Faixa>
  );
}

const TONS = {
  vermelho: "border-red-300 bg-red-50 text-red-900",
  ambar: "border-amber-300 bg-amber-50 text-amber-900",
  verde: "border-green-200 bg-green-50 text-green-800",
} as const;

function Faixa({
  tom,
  icone,
  children,
}: {
  tom: keyof typeof TONS;
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-4 flex gap-3 rounded-lg border px-4 py-3 ${TONS[tom]}`} role="status">
      <span className="mt-0.5">{icone}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function formatarQuando(iso: string): string {
  const quando = new Date(iso);
  const minutos = Math.floor((Date.now() - quando.getTime()) / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  return quando.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
