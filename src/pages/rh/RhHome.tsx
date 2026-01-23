// src/pages/rh/RhHome.tsx
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Bg } from "../../components/ui/app-surface";

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
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 40px;
  justify-items: center;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 20px;
  }
`;

const Box = styled.div`
  width: 100%;
  max-width: 380px;
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
  cursor: pointer;
  border: 2px solid transparent;
  padding: 26px;

  &:hover {
    transform: translateY(-10px) scale(1.02);
    border-color: #b82626;
    background: #faf7f7;
  }

  @media (max-width: 640px) {
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

const RhHome: React.FC = () => {
  const navigate = useNavigate();

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
        </Container>
      </Wrapper>
    </Bg>
  );
};

export default RhHome;