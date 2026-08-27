import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  gerarRelatorioAbatimentos,
  ROTULO_MOTIVO,
  type RelatorioAbatimentos as Relatorio,
  type LinhaRelatorioAbatimento,
} from "@/lib/adminOperations";

/**
 * Relatório de abatimentos — a tela que substitui o papel que o faturamento
 * entregava ao RH toda sexta (27/08/2026).
 *
 * A semana vai de SÁBADO A SEXTA: o relatório sempre foi entregue na sexta
 * cobrindo a semana que fechava naquele dia. As datas são editáveis.
 *
 * A tela tem DUAS listas, e a segunda é o motivo de ela existir em vez de um
 * SELECT qualquer:
 *
 *   ABATER    — passou em tudo: efetivado no CIGAM, impresso, valor batendo.
 *   CONFERIR  — teve saldo debitado mas falhou em algum ponto. NÃO entra no
 *               total. Se esta lista fosse simplesmente omitida, o RH abateria
 *               a menos — o funcionário levou a mercadoria e não teve desconto.
 *
 * Imprimir usa o próprio navegador (`window.print()`): o `@media print` abaixo
 * esconde os controles e deixa só o papel. É de propósito que não há geração de
 * PDF no servidor — o RH precisa ver na tela antes de imprimir, e um PDF a mais
 * seria um lugar a mais para o layout divergir.
 */
export default function RelatorioAbatimentos() {
  const navigate = useNavigate();
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const resposta = await gerarRelatorioAbatimentos({
        inicio: inicio || undefined,
        fim: fim || undefined,
      });
      setRelatorio(resposta.relatorio);
      // Reflete o intervalo que o servidor de fato usou (na primeira vez, o
      // padrão de sábado a sexta), senão os campos ficam vazios sobre um
      // relatório que já tem período.
      setInicio(resposta.relatorio.inicio);
      setFim(resposta.relatorio.fim);

      if (resposta.relatorio.cigamIndisponivel) {
        toast.warning(
          "O CIGAM não respondeu em pelo menos um pedido. Os afetados estão em 'Conferir antes de abater'."
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 print:bg-white print:p-0">
      <style>{ESTILO_IMPRESSAO}</style>

      <div className="mx-auto max-w-5xl">
        {/* ---------------- controles (somem na impressão) ---------------- */}
        <div className="no-print mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          >
            ← Voltar
          </button>

          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">De (sábado)</span>
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="rounded border px-2 py-1.5"
            />
          </label>

          <label className="flex flex-col text-sm">
            <span className="mb-1 text-gray-600">Até (sexta)</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="rounded border px-2 py-1.5"
            />
          </label>

          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {gerando ? "Conferindo com o CIGAM…" : relatorio ? "Gerar de novo" : "Gerar relatório"}
          </button>

          {relatorio && (
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border border-gray-400 px-4 py-2 font-semibold hover:bg-gray-100"
            >
              Imprimir
            </button>
          )}

          {!relatorio && !gerando && (
            <p className="w-full text-sm text-gray-500">
              Sem datas, usa a semana corrente (sábado a sexta). Cada pedido é conferido um a um no
              CIGAM, então a geração leva alguns segundos.
            </p>
          )}
        </div>

        {gerando && (
          <p className="no-print rounded-lg border bg-white p-6 text-center text-gray-600">
            Perguntando ao CIGAM sobre cada pedido…
          </p>
        )}

        {relatorio && <Papel relatorio={relatorio} />}
      </div>
    </div>
  );
}

function Papel({ relatorio }: { relatorio: Relatorio }) {
  const {
    inicio,
    fim,
    geradoEm,
    abater,
    conferir,
    totais,
    porFuncionario,
    cigamIndisponivel,
  } = relatorio;

  return (
    <div className="rounded-lg border bg-white p-6 print:rounded-none print:border-0 print:p-0">
      <header className="mb-5 border-b pb-4">
        <h1 className="text-xl font-bold">Relatório de Abatimentos — Desconto em Folha</h1>
        <p className="text-sm text-gray-600">
          Período: <strong>{formatarData(inicio)}</strong> a <strong>{formatarData(fim)}</strong>{" "}
          (sábado a sexta) · Gerado em {new Date(geradoEm).toLocaleString("pt-BR")}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Cada pedido abaixo foi conferido no CIGAM: existe, é do cliente de pedido de funcionário,
          está efetivado e o valor bate.
        </p>
      </header>

      {cigamIndisponivel && (
        <p className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠️ O CIGAM não respondeu em pelo menos um pedido. Os afetados estão na segunda lista — não
          trate a ausência deles como "não existe no ERP".
        </p>
      )}

      {/* ---------------- o número que a folha usa ---------------- */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap gap-6 rounded border bg-gray-50 px-4 py-3 print:bg-white">
          <Numero rotulo="Total a abater" valor={formatarReais(totais.abaterCents)} destaque />
          <Numero rotulo="Pedidos" valor={String(totais.pedidosAbater)} />
          <Numero rotulo="Funcionários" valor={String(totais.funcionarios)} />
          {totais.pedidosConferir > 0 && (
            <Numero
              rotulo="Pendentes (não somados)"
              valor={`${totais.pedidosConferir} · ${formatarReais(totais.conferirCents)}`}
            />
          )}
        </div>

        <h2 className="mb-2 font-semibold">Por funcionário</h2>
        {porFuncionario.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum pedido a abater neste período.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-gray-100 text-left print:bg-white">
                <th className="px-2 py-1.5">Funcionário</th>
                <th className="px-2 py-1.5">CPF</th>
                <th className="px-2 py-1.5 text-right">Pedidos</th>
                <th className="px-2 py-1.5 text-right">Valor a abater</th>
              </tr>
            </thead>
            <tbody>
              {porFuncionario.map((f) => (
                <tr key={f.employeeCpf || f.employeeName} className="border-b">
                  <td className="px-2 py-1.5">{f.employeeName}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{formatarCpf(f.employeeCpf)}</td>
                  <td className="px-2 py-1.5 text-right">{f.pedidos}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">
                    {formatarReais(f.totalCents)}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold print:bg-white">
                <td className="px-2 py-2" colSpan={3}>
                  Total
                </td>
                <td className="px-2 py-2 text-right">{formatarReais(totais.abaterCents)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* ---------------- o detalhe, pedido a pedido ---------------- */}
      {abater.length > 0 && (
        <section className="mb-6 break-inside-avoid">
          <h2 className="mb-2 font-semibold">Detalhe dos pedidos</h2>
          <TabelaPedidos linhas={abater} mostrarMotivos={false} />
        </section>
      )}

      {/* ---------------- o que NÃO entra, e por quê ---------------- */}
      {conferir.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="mb-1 font-semibold text-amber-900">
            Conferir antes de abater ({conferir.length})
          </h2>
          <p className="mb-2 text-xs text-gray-600">
            Estes pedidos tiveram o saldo do funcionário debitado, mas não passaram em alguma
            conferência. <strong>Não estão somados acima.</strong> Se a mercadoria foi entregue, o
            desconto precisa ser feito mesmo assim — decida caso a caso.
          </p>
          <TabelaPedidos linhas={conferir} mostrarMotivos />
        </section>
      )}

      <footer className="mt-8 hidden border-t pt-4 text-xs text-gray-500 print:block">
        Conferido automaticamente contra o CIGAM em {new Date(geradoEm).toLocaleString("pt-BR")}.
        Assinatura do RH: ______________________________
      </footer>
    </div>
  );
}

function TabelaPedidos({
  linhas,
  mostrarMotivos,
}: {
  linhas: LinhaRelatorioAbatimento[];
  mostrarMotivos: boolean;
}) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b bg-gray-100 text-left print:bg-white">
          <th className="px-2 py-1.5">Data</th>
          <th className="px-2 py-1.5">Pedido</th>
          <th className="px-2 py-1.5">Funcionário</th>
          <th className="px-2 py-1.5">Recibo CIGAM</th>
          <th className="px-2 py-1.5 text-right">Valor</th>
          {mostrarMotivos && <th className="px-2 py-1.5">Pendência</th>}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.orderNumber} className="border-b align-top">
            <td className="whitespace-nowrap px-2 py-1.5">
              {new Date(l.criadoEm).toLocaleDateString("pt-BR")}
            </td>
            <td className="px-2 py-1.5 font-mono text-xs">{l.orderNumber}</td>
            <td className="px-2 py-1.5">{l.employeeName}</td>
            <td className="px-2 py-1.5 font-mono text-xs">{l.recibo ?? "—"}</td>
            <td className="whitespace-nowrap px-2 py-1.5 text-right">
              {formatarReais(l.valorCents)}
            </td>
            {mostrarMotivos && (
              <td className="px-2 py-1.5 text-xs">
                <span className="font-medium">
                  {l.motivos.map((m) => ROTULO_MOTIVO[m] ?? m).join(" · ")}
                </span>
                {l.detalhe && <div className="text-gray-500">{l.detalhe}</div>}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{rotulo}</p>
      <p className={destaque ? "text-2xl font-bold" : "text-lg font-semibold"}>{valor}</p>
    </div>
  );
}

function formatarReais(cents: number): string {
  return (Number(cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(iso: string): string {
  // Meio-dia evita o clássico "um dia a menos" ao converter YYYY-MM-DD.
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatarCpf(cpf: string): string {
  const d = String(cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const ESTILO_IMPRESSAO = `
@media print {
  .no-print { display: none !important; }
  @page { margin: 12mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { font-size: 11px; }
  /* Cabeçalho da tabela repete em cada folha — relatório de folha costuma
     passar de uma página, e coluna sem título na página 2 é ilegível. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}
`;
