import React, { useEffect } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { Bg } from "../components/ui/app-surface";

const Screen = styled(Bg)`
  /* Tela 100% fixa e sem overflow */
  height: 100dvh;
  width: 100%;
  overflow: hidden;

  /* Ajuda muito no iOS pra parar bounce */
  overscroll-behavior: none;
  touch-action: none;

  /* Safe area (notch) */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
`;

const Wrapper = styled.div`
  /* ocupa a tela toda sem “crescer” */
  height: 100%;
  width: 100%;
  box-sizing: border-box;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 80px;

  /* Evita scroll por padding */
  padding: 24px 16px;

  @media (max-width: 640px) {
    gap: 24px;
    padding: 24px 16px;
    justify-content: center; /* importante: não empurra pra cima */
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
    gap: 18px;
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
  user-select: none;

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
  margin: 0 0 8px;

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
  margin: 0;

  @media (max-width: 640px) {
    font-size: 0.95rem;
    width: 100%;
  }
`;

const EscolhaUsuario: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Trava scroll/bounce só nessa página
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
      bodyInset: (document.body.style as any).inset,
      bodyWidth: document.body.style.width,
      htmlBg: document.documentElement.style.background,
      bodyBg: document.body.style.background,
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    (document.body.style as any).inset = "0";
    document.body.style.width = "100%";

    // Evita “faixa branca” do html/body em mobile/pwa
    document.documentElement.style.background = "#a41616";
    document.body.style.background = "#a41616";

    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.position = prev.bodyPosition;
      (document.body.style as any).inset = prev.bodyInset;
      document.body.style.width = prev.bodyWidth;
      document.documentElement.style.background = prev.htmlBg;
      document.body.style.background = prev.bodyBg;
    };
  }, []);

  const handleFuncionario = () => navigate("/login");
  const handleCliente = () => {
    window.location.href = "https://catalogointerativogm.vercel.app";
  };

  return (
    <Screen>
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
    </Screen>
  );
};

export default EscolhaUsuario;
