import { useMemo, useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bg } from "@/components/ui/app-surface";
import {
  listarPedidosIntegracao,
  reenfileirarPedido,
  type PedidoIntegracao,
} from "@/lib/adminOperations";

/**
 * Painel de integração CIGAM.
 *
 * Antes disso, pedido que não chegava ao ERP só aparecia para quem fosse olhar
 * no banco, e o conserto era um UPDATE na mão. A tela separa o que é acionável
 * (preso na fila, órfão, erro do CIGAM) do que é histórico (anterior a
 * 11/08/2026, quando a integração subiu, e descartado de propósito) e faz o
 * reenfileiramento pelo webhook autenticado.
 */

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
  gap: 20px;
`;

const BackButton = styled.button`
  align-self: flex-start;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(184, 38, 38, 0.15);
  background: rgba(255, 255, 255, 0.86);
  color: #8f1717;
  font-weight: 700;
  cursor: pointer;
`;

const Hero = styled.div`
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  padding: 24px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
`;

const Titulo = styled.h1`
  margin: 0 0 6px;
  font-size: 1.5rem;
  color: #2b2b2b;
`;

const Sub = styled.p`
  margin: 0;
  color: #6f6f6f;
  font-size: 0.92rem;
`;

const Resumo = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
`;

const Chip = styled.span<{ $tom: "ruim" | "alerta" | "neutro" }>`
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 700;
  background: ${(p) =>
    p.$tom === "ruim" ? "#fde8e8" : p.$tom === "alerta" ? "#fff4e0" : "#eef1f4"};
  color: ${(p) => (p.$tom === "ruim" ? "#a11" : p.$tom === "alerta" ? "#8a5a00" : "#555")};
`;

const Painel = styled.div`
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  padding: 8px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
  overflow-x: auto;
`;

const Tabela = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  min-width: 760px;

  th,
  td {
    text-align: left;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    vertical-align: top;
  }

  th {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8a8a8a;
  }
`;

const Erro = styled.div`
  color: #a11;
  font-size: 0.8rem;
  margin-top: 4px;
  max-width: 420px;
  word-break: break-word;
`;

const Acao = styled.button`
  padding: 7px 12px;
  border-radius: 10px;
  border: 0;
  background: linear-gradient(135deg, #b82626, #7d1717);
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Vazio = styled.div`
  padding: 40px 20px;
  text-align: center;
  color: #6f6f6f;
`;

const Filtros = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const FiltroBtn = styled.button<{ $ativo: boolean }>`
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid ${(p) => (p.$ativo ? "#b82626" : "rgba(0,0,0,0.12)")};
  background: ${(p) => (p.$ativo ? "#b82626" : "#fff")};
  color: ${(p) => (p.$ativo ? "#fff" : "#555")};
  font-weight: 700;
  font-size: 0.84rem;
  cursor: pointer;
`;

function moeda(cents: number | null) {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function rotulo(p: PedidoIntegracao): { texto: string; tom: "ruim" | "alerta" | "neutro" } {
  if (p.preso) return { texto: "Preso na fila", tom: "ruim" };
  if (p.orfao) return { texto: "Órfão (some da fila)", tom: "ruim" };
  if (p.legado) return { texto: "Anterior ao CIGAM", tom: "neutro" };
  if (p.descartado) return { texto: "Descartado", tom: "neutro" };
  if (p.erp_status === "ERROR") return { texto: "Erro no CIGAM", tom: "ruim" };
  if (p.erp_status === "PENDING") return { texto: "Na fila", tom: "alerta" };
  return { texto: p.erp_status || "—", tom: "neutro" };
}

type Filtro = "atencao" | "todos";

const IntegracaoCigam = () => {
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState<Filtro>("atencao");
  const [processando, setProcessando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["integracao-cigam"],
    queryFn: () => listarPedidosIntegracao(200),
    refetchInterval: 60000,
  });

  const linhas = data?.rows ?? [];

  // "Atenção" é o que exige alguém: fila travada e órfãos. Erro do CIGAM entra;
  // pedido anterior à integração e descartado ficam de fora, senão a tela nasce
  // com 334 linhas de coisa que nunca teve caminho para o ERP e ninguém olha.
  const precisaAtencao = useMemo(
    () => linhas.filter((p) => p.preso || p.orfao || (p.erp_status === "ERROR" && !p.legado)),
    [linhas]
  );

  const visiveis = filtro === "atencao" ? precisaAtencao : linhas;

  const contagem = useMemo(
    () => ({
      presos: linhas.filter((p) => p.preso).length,
      orfaos: linhas.filter((p) => p.orfao).length,
      errosReais: linhas.filter((p) => p.erp_status === "ERROR" && !p.legado).length,
      legado: linhas.filter((p) => p.legado).length,
      naFila: linhas.filter((p) => p.erp_status === "PENDING" && !p.preso).length,
    }),
    [linhas]
  );

  async function reenviar(p: PedidoIntegracao) {
    setAviso("");
    setProcessando(p.id);
    try {
      await reenfileirarPedido(p.id, false);
      setAviso(`Pedido ${p.order_number} devolvido para a fila. O auto-sync pega em até 2 minutos.`);
      await refetch();
    } catch (err: any) {
      const msg = String(err?.message || err);
      // O servidor recusa quando já existe número do CIGAM: reenviar criaria
      // nota fiscal duplicada. A confirmação exige exclusão prévia no ERP.
      if (/já foi criado no CIGAM/i.test(msg)) {
        const ok = window.confirm(
          `${msg}\n\nVocê JÁ excluiu este pedido no CIGAM? Confirmar sem ter excluído cria um pedido duplicado.`
        );
        if (ok) {
          try {
            await reenfileirarPedido(p.id, true);
            setAviso(`Pedido ${p.order_number} devolvido para a fila (forçado).`);
            await refetch();
          } catch (e2: any) {
            setAviso(String(e2?.message || e2));
          }
        }
      } else {
        setAviso(msg);
      }
    } finally {
      setProcessando(null);
    }
  }

  return (
    <Bg>
      <Wrapper>
        <Shell>
          <BackButton onClick={() => navigate("/admin")}>← Voltar</BackButton>

          <Hero>
            <Titulo>Integração CIGAM</Titulo>
            <Sub>
              Pedidos que não chegaram ao ERP. O disparo automático varre a fila a cada 2
              minutos — o que aparece aqui como "preso" ou "órfão" não sai sozinho.
            </Sub>

            <Resumo>
              <Chip $tom={contagem.presos ? "ruim" : "neutro"}>
                {contagem.presos} preso(s) na fila
              </Chip>
              <Chip $tom={contagem.orfaos ? "ruim" : "neutro"}>{contagem.orfaos} órfão(s)</Chip>
              <Chip $tom={contagem.errosReais ? "ruim" : "neutro"}>
                {contagem.errosReais} erro(s) do CIGAM
              </Chip>
              <Chip $tom="alerta">{contagem.naFila} na fila (normal)</Chip>
              <Chip $tom="neutro">{contagem.legado} anterior(es) ao CIGAM</Chip>
            </Resumo>

            <Resumo>
              <Filtros>
                <FiltroBtn $ativo={filtro === "atencao"} onClick={() => setFiltro("atencao")}>
                  Precisa de atenção ({precisaAtencao.length})
                </FiltroBtn>
                <FiltroBtn $ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
                  Todos ({linhas.length})
                </FiltroBtn>
              </Filtros>
            </Resumo>

            {aviso && <Erro style={{ marginTop: 12, color: "#333" }}>{aviso}</Erro>}
          </Hero>

          <Painel>
            {isLoading ? (
              <Vazio>Carregando…</Vazio>
            ) : error ? (
              <Vazio>Não foi possível carregar: {String((error as any)?.message || error)}</Vazio>
            ) : visiveis.length === 0 ? (
              <Vazio>
                {filtro === "atencao"
                  ? "Nada preso, nada órfão, nenhum erro do CIGAM. A fila está rodando sozinha."
                  : "Nenhum pedido para mostrar."}
              </Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Funcionário</th>
                    <th>Situação</th>
                    <th>CIGAM</th>
                    <th>Valor</th>
                    <th>Quando</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => {
                    const r = rotulo(p);
                    return (
                      <tr key={p.id}>
                        <td>{p.erp_external_id || p.order_number}</td>
                        <td>{p.funcionario || "—"}</td>
                        <td>
                          <Chip $tom={r.tom}>{r.texto}</Chip>
                          {p.erp_error && !p.legado && <Erro>{p.erp_error}</Erro>}
                        </td>
                        <td>{p.erp_external_id || "—"}</td>
                        <td>{moeda(p.total_cents)}</td>
                        <td>{quando(p.created_at)}</td>
                        <td>
                          <Acao
                            onClick={() => reenviar(p)}
                            disabled={processando === p.id || p.erp_status === "PENDING"}
                            title={
                              p.erp_status === "PENDING"
                                ? "Já está na fila — o auto-sync pega sozinho"
                                : "Devolve o pedido para a fila do processador"
                            }
                          >
                            {processando === p.id ? "Enviando…" : "Reenfileirar"}
                          </Acao>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabela>
            )}
          </Painel>
        </Shell>
      </Wrapper>
    </Bg>
  );
};

export default IntegracaoCigam;
