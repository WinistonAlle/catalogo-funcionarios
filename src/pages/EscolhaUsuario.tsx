import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Bg } from "../components/ui/app-surface";

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 80px;
  width: 100%;
  min-height: 100vh;

  @media (max-width: 640px) {
    gap: 40px;
    padding: 40px 16px;
    justify-content: flex-start;
  }
`;

const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 60px;
  justify-content: center;
  align-items: center;

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 24px;
    width: 100%;
  }
`;

const Box = styled.div`
  width: 340px;
  height: 340px;
  background: #ffffff;
  border-radius: 36px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
  cursor: pointer;
  border: 2px solid transparent;

  &:hover {
    transform: translateY(-10px) scale(1.02);
    border-color: #b82626;
    background: #f9f9f9;
  }

  @media (max-width: 640px) {
    width: 100%;
    max-width: 360px;
    height: auto;
    min-height: 220px;
    padding: 24px 16px;
    border-radius: 24px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);

    &:hover {
      transform: translateY(-4px) scale(1.01);
    }
  }
`;

const Title = styled.h2`
  color: #b82626;
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 8px;

  @media (max-width: 640px) {
    font-size: 1.5rem;
    text-align: center;
  }
`;

const Subtitle = styled.p`
  color: #555;
  font-size: 1.05rem;
  text-align: center;
  width: 80%;

  @media (max-width: 640px) {
    font-size: 0.95rem;
    width: 100%;
  }
`;

const EscolhaUsuario: React.FC = () => {
  const navigate = useNavigate();

  const handleFuncionario = () => navigate("/login"); // ROTA CORRETA
  const handleCliente = () =>
    (window.location.href = "https://catalogointerativogm.vercel.app");

  return (
    <Bg>
      <Wrapper>
        <Container>
          <Box onClick={handleFuncionario}>
            <Title>Sou Funcionário</Title>
            <Subtitle>Acesso exclusivo com CPF</Subtitle>
          </Box>

          <Box onClick={handleCliente}>
            <Title>Sou Cliente</Title>
            <Subtitle>Catálogo de produtos</Subtitle>
          </Box>
        </Container>
      </Wrapper>
    </Bg>
  );
};

export default EscolhaUsuario;
