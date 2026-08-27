import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getActorCpf, getActorNome } from "@/lib/actor";
import {
  desfazerLiberacao,
  liberadoEAindaNaoImpresso,
  liberarPedidoParaHoje,
  listarPedidosPendentesDeImpressao,
  precisaDeLiberacao,
  type PedidoParaLiberar,
} from "@/lib/liberacaoDePedido";

/**
 * LIBERAR PEDIDO PARA HOJE — a tela do RH (27/08/2026).
 *
 * Pedido feito depois do corte das 13:40 só é separado no próximo dia útil.
 * Quando o RH abre exceção pra alguém levar no mesmo dia, isso acontecia por
 * voz: o faturamento era avisado por fora e tinha que caçar o pedido no meio
 * dos outros. Aqui a exceção vira registro — quem liberou, quando, e o pedido
 * entra na próxima impressão da portaria sozinho.
 *
 * DUAS LISTAS, e a segunda é o ponto:
 *
 *   PRECISA DE LIBERAÇÃO — pedidos de hoje feitos depois do corte, ainda sem
 *                          autorização. É o que o RH decide.
 *   JÁ LIBERADOS         — o que já foi autorizado e ainda não virou papel.
 *                          Sem esta lista, ninguém consegue responder "o
 *                          pedido da fulana já desceu?" sem ligar pra portaria.
 */
export default function LiberarPedidos() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PedidoParaLiberar[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [agindoEm, setAgindoEm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPedidos(await listarPedidosPendentesDeImpressao());
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os pedidos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const paraLiberar = useMemo(
    () => pedidos.filter((p) => precisaDeLiberacao(p)),
    [pedidos]
  );
  const jaLiberados = useMemo(
    () => pedidos.filter((p) => liberadoEAindaNaoImpresso(p)),
    [pedidos]
  );

  async function liberar(pedido: PedidoParaLiberar) {
    const cpf = await getActorCpf();
    if (!cpf) {
      toast.error("Não encontrei seu CPF de login. Faça login novamente.");
      return;
    }

    const nome = await getActorNome(cpf);
    const confirmado = window.confirm(
      `Liberar o pedido de ${pedido.employee_name ?? "funcionário"} para separação HOJE?\n\n` +
        "Ele foi feito depois do corte das 13:40, então sairia só no próximo dia útil.\n\n" +
        "Liberando, ele entra na próxima impressão da portaria e é lançado no CIGAM em até 2 minutos."
    );
    if (!confirmado) return;

    setAgindoEm(pedido.id);
    try {
      const r = await liberarPedidoParaHoje({
        orderId: pedido.id,
        actorCpf: cpf,
        autorizadoPor: nome,
      });
      if (r.ok) toast.success(r.message);
      else toast.warning(r.message);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao liberar o pedido.");
    } finally {
      setAgindoEm(null);
    }
  }

  async function desfazer(pedido: PedidoParaLiberar) {
    const cpf = await getActorCpf();
    if (!cpf) {
      toast.error("Não encontrei seu CPF de login. Faça login novamente.");
      return;
    }

    const confirmado = window.confirm(
      `Desfazer a liberação do pedido de ${pedido.employee_name ?? "funcionário"}?\n\n` +
        "Ele volta a esperar o próximo dia útil. Só dá pra desfazer enquanto a folha não foi impressa."
    );
    if (!confirmado) return;

    setAgindoEm(pedido.id);
    try {
      const r = await desfazerLiberacao({ orderId: pedido.id, actorCpf: cpf });
      if (r.ok) toast.success(r.message);
      else toast.warning(r.message);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao desfazer a liberação.");
    } finally {
      setAgindoEm(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Liberar pedido para hoje</h1>
          <p className="mt-1 text-sm text-gray-600">
            Pedido feito depois das 13:40 é separado só no próximo dia útil. Liberando aqui,
            ele entra na próxima impressão da portaria e vai pro CIGAM em até 2 minutos.
          </p>
        </div>
        <button
          onClick={() => navigate("/rh")}
          className="shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voltar
        </button>
      </div>

      <button
        onClick={() => void carregar()}
        disabled={carregando}
        className="mb-4 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {carregando ? "Atualizando…" : "Atualizar"}
      </button>

      {erro && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </div>
      )}

      <Secao
        titulo="Precisam de liberação"
        vazio="Nenhum pedido fora do corte esperando decisão."
        pedidos={paraLiberar}
        carregando={carregando}
        renderAcao={(p) => (
          <button
            onClick={() => void liberar(p)}
            disabled={agindoEm === p.id}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {agindoEm === p.id ? "Liberando…" : "Liberar para hoje"}
          </button>
        )}
      />

      <Secao
        titulo="Já liberados, aguardando impressão"
        vazio="Nada liberado no momento."
        pedidos={jaLiberados}
        carregando={carregando}
        renderDetalhe={(p) => (
          <div className="text-xs text-emerald-700">
            Liberado{" "}
            {p.released_for_today_at
              ? new Date(p.released_for_today_at).toLocaleString("pt-BR")
              : ""}
            {p.released_authorized_by ? ` — autorizado por ${p.released_authorized_by}` : ""}
          </div>
        )}
        renderAcao={(p) => (
          <button
            onClick={() => void desfazer(p)}
            disabled={agindoEm === p.id}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {agindoEm === p.id ? "Desfazendo…" : "Desfazer"}
          </button>
        )}
      />
    </div>
  );
}

function Secao({
  titulo,
  vazio,
  pedidos,
  carregando,
  renderAcao,
  renderDetalhe,
}: {
  titulo: string;
  vazio: string;
  pedidos: PedidoParaLiberar[];
  carregando: boolean;
  renderAcao: (p: PedidoParaLiberar) => React.ReactNode;
  renderDetalhe?: (p: PedidoParaLiberar) => React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
        {titulo} {pedidos.length > 0 && <span className="text-gray-900">({pedidos.length})</span>}
      </h2>

      {carregando && pedidos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
          Carregando…
        </div>
      ) : pedidos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
          {vazio}
        </div>
      ) : (
        <ul className="space-y-2">
          {pedidos.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">
                  {p.employee_name ?? "Funcionário"}
                </div>
                <div className="text-xs text-gray-500">
                  {/* O número que o pessoal usa é o do CIGAM; o GM- só aparece
                      enquanto o pedido não sincronizou. */}
                  Pedido {p.erp_external_id || p.order_number || "—"} ·{" "}
                  {new Date(p.created_at).toLocaleString("pt-BR")} ·{" "}
                  {((p.wallet_used_cents ?? p.total_cents ?? 0) / 100).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
                {renderDetalhe?.(p)}
              </div>
              <div className="shrink-0">{renderAcao(p)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
