// src/pages/rh/RhHome.tsx
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Bg } from "../../components/ui/app-surface";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100vh;
  padding: 24px 16px;
`;

const Container = styled.div`
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-wrap: wrap;
  gap: 40px;
  justify-content: center;
  align-items: center;

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 20px;
  }
`;

const Box = styled.div<{ disabled?: boolean }>`
  width: 380px;
  height: 300px;
  background: #ffffff;
  border-radius: 32px;
  box-shadow: 0 14px 45px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 14px;
  transition: all 0.25s ease;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  border: 2px solid transparent;
  padding: 26px;
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};

  &:hover {
    transform: ${({ disabled }) => (disabled ? "none" : "translateY(-10px) scale(1.02)")};
    border-color: ${({ disabled }) => (disabled ? "transparent" : "#b82626")};
    background: ${({ disabled }) => (disabled ? "#fff" : "#faf7f7")};
  }

  @media (max-width: 640px) {
    width: 100%;
    height: 260px;
  }
`;

const Title = styled.h2`
  color: #b82626;
  font-size: 1.8rem;
  font-weight: 800;
  margin: 0;
  text-align: center;
`;

const Subtitle = styled.p`
  color: #555;
  font-size: 1.1rem;
  text-align: center;
  width: 85%;
  margin: 0;
  line-height: 1.4;
`;

const Status = styled.span`
  font-size: 0.9rem;
  color: #777;
  margin-top: 6px;
  text-align: center;
`;

const RhHome: React.FC = () => {
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSyncEmployees() {
    if (syncing) return;

    try {
      setSyncing(true);
      setStatus("Sincronizando funcionários...");

      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      if (!token) {
        setStatus("Você precisa estar logado para sincronizar.");
        return;
      }

      const res = await fetch("/api/sync-employees", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json?.error || "Erro ao sincronizar";
        setStatus(msg);
        console.error("sync-employees error:", json);
        return;
      }

      setStatus("Funcionários sincronizados com sucesso!");
      console.log("sync result:", json);
    } catch (err) {
      console.error(err);
      setStatus("Erro ao sincronizar funcionários");
    } finally {
      setSyncing(false);
      setTimeout(() => setStatus(null), 5000);
    }
  }

  return (
    <Bg>
      <Wrapper>
        <Container>
          <Box onClick={() => navigate("/catalogo")}>
            <Title>Catálogo</Title>
            <Subtitle>Ver produtos e preços exclusivos</Subtitle>
          </Box>

          <Box onClick={() => navigate("/rh/funcionarios")}>
            <Title>Funcionários</Title>
            <Subtitle>Admitir, editar e desligar colaboradores</Subtitle>
          </Box>

          <Box onClick={() => navigate("/rh/relatorio-gastos")}>
            <Title>Relatório de Gastos</Title>
            <Subtitle>Quanto cada funcionário gastou do saldo</Subtitle>
          </Box>

          <Box onClick={handleSyncEmployees} disabled={syncing}>
            <Title>{syncing ? "Sincronizando..." : "Sincronizar Funcionários"}</Title>
            <Subtitle>Atualiza os dados executando a sincronização automática</Subtitle>
            {status && <Status>{status}</Status>}
          </Box>
        </Container>
      </Wrapper>
    </Bg>
  );
};

export default RhHome;
