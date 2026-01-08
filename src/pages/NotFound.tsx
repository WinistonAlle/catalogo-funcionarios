// src/pages/NotFound.tsx
import styled from "styled-components";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bg } from "@/components/ui/app-surface";
import { Button } from "@/components/ui/button";

const Wrapper = styled.div`
  min-height: 100vh;
  width: 100%;
  display: grid;
  place-items: center;
  padding: 24px;
`;

const Card = styled.div`
  width: 100%;
  max-width: 520px;
  border-radius: 24px;
  padding: 32px;
  background: #ffffff; /* Fundo branco fixo */
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  text-align: center;
  border: 1px solid rgba(0, 0, 0, 0.05);
`;

const Emoji = styled.div`
  font-size: 56px;
  line-height: 1;
  margin-bottom: 12px;
`;

const Title = styled.h1`
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  color: #111;
`;

const Subtitle = styled.p`
  margin: 8px 0 20px;
  color: #555;
  font-size: 16px;
`;

const Muted = styled.p`
  margin-top: 12px;
  font-size: 12px;
  color: #999;
  code {
    color: inherit;
  }
`;

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("❌ 404:", location.pathname);
  }, [location.pathname]);

  return (
    <Bg>
      <Wrapper>
        <Card>
          <Emoji>🧭</Emoji>
          <Title>404</Title>
          <Subtitle>Oops! A página que você procura não foi encontrada.</Subtitle>

          <div className="flex gap-2 justify-center">
            <Button
              size="lg"
              className="rounded-full"
              onClick={() => navigate("/")}
            >
              Voltar para o início
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full"
              onClick={() => navigate("/login")}
            >
              Ir para o login
            </Button>
          </div>

          <Muted>
            Rota inválida: <code>{location.pathname}</code>
          </Muted>
        </Card>
      </Wrapper>
    </Bg>
  );
}
