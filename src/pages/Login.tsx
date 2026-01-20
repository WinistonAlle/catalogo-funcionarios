import React, { useEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { Bg, Card } from "../components/ui/app-surface";
import logo from "../images/logop.jpg";
import { checkCpfLogin } from "@/services/auth";
import { supabase } from "@/lib/supabase";

/* ================= PAGE LOCK (sem scroll/bounce) ================= */

const Screen = styled(Bg)`
  height: 100dvh;
  width: 100%;
  overflow: hidden;

  /* trava bounce no iOS e afins */
  overscroll-behavior: none;
  touch-action: none;

  /* safe-area (notch) */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);

  display: flex;
  align-items: center;
  justify-content: center;
`;

/* ================= LOADING (Uiverse 3 dots) ================= */

const LoadingOverlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9999;

  background: rgba(164, 22, 22, 0.82);
  backdrop-filter: blur(8px);

  display: flex;
  align-items: center;
  justify-content: center;

  /* evita qualquer toque/click por trás */
  pointer-events: all;
`;

const Frame = styled.div`
  position: relative;
  width: 220px;
  height: 220px;
`;

const Center = styled.div`
  position: absolute;
  width: 220px;
  height: 220px;
`;

/* animações (mesma lógica do Uiverse) */
const jump1 = keyframes`
  0%, 70% {
    box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2);
    transform: scale(0);
  }
  100% {
    box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3);
    transform: scale(1);
  }
`;

const jump2 = keyframes`
  0%, 40% {
    box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2);
    transform: scale(0);
  }
  100% {
    box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3);
    transform: scale(1);
  }
`;

const jump3 = keyframes`
  0%, 10% {
    box-shadow: 2px 2px 3px 2px rgba(0,0,0,0.2);
    transform: scale(0);
  }
  100% {
    box-shadow: 10px 10px 15px 0 rgba(0,0,0,0.3);
    transform: scale(1);
  }
`;

const Dot1 = styled.div`
  position: absolute;
  z-index: 3;
  width: 30px;
  height: 30px;
  top: 95px;
  left: 95px;
  background: #fff;
  border-radius: 50%;
  animation: ${jump1} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
`;

const Dot2 = styled.div`
  position: absolute;
  z-index: 2;
  width: 60px;
  height: 60px;
  top: 80px;
  left: 80px;
  background: #f0be00;
  border-radius: 50%;
  animation: ${jump2} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
`;

const Dot3 = styled.div`
  position: absolute;
  z-index: 1;
  width: 90px;
  height: 90px;
  top: 65px;
  left: 65px;
  background: #d33100;
  border-radius: 50%;
  animation: ${jump3} 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
`;

const LoadingText = styled.div`
  position: absolute;
  width: 100%;
  left: 0;
  bottom: -46px;
  text-align: center;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
`;

/* ================= BOTÃO VOLTAR ================= */

const BackButton = styled.button`
  position: fixed;
  top: calc(16px + env(safe-area-inset-top));
  left: 16px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.18);
  color: #111;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transition: background 0.2s ease, transform 0.1s ease,
    box-shadow 0.2s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background: rgba(0, 0, 0, 0.28);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }

  &:active {
    transform: scale(0.95);
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

/* ================= LAYOUT ================= */

const StyledCard = styled(Card)`
  width: min(420px, calc(100% - 32px));
  box-sizing: border-box;
`;

const LogoWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  margin-bottom: 20px;
`;

const LogoImg = styled.img`
  width: 160px;
  height: auto;
  user-select: none;
`;

const Title = styled.h1`
  margin: 0 0 4px;
  font-size: 1.6rem;
  font-weight: 700;
  color: #2b2b2b;
  text-align: center;
`;

const Subtitle = styled.p`
  margin: 0 0 20px;
  color: #707070;
  font-size: 0.95rem;
  text-align: center;
`;

const Form = styled.form`
  display: grid;
  gap: 14px;
`;

const Field = styled.div`
  display: grid;
  gap: 8px;
`;

const Label = styled.label`
  font-size: 0.9rem;
  color: #444;
`;

/* ================= INPUT (Uiverse aplicado) ================= */

const NeumorphicInput = styled.input`
  width: 100%;
  max-width: 100%;
  border: none;
  outline: none;
  background: none;
  font-size: 18px;
  color: #555;
  padding: 15px 5px 10px 20px;
  box-shadow: inset 8px 8px 8px #cbced1, inset -8px -8px 8px #ffffff;
  border-radius: 25px;
  transition: box-shadow 0.15s ease;

  &::placeholder {
    color: #555;
    transition: all 0.3s ease;
  }

  &:focus::placeholder {
    color: #999;
  }

  &:focus-visible {
    box-shadow: inset 8px 8px 8px #cbced1, inset -8px -8px 8px #ffffff,
      0 0 0 3px rgba(184, 38, 38, 0.18);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

/* ================= BOTÃO ENTRAR (Uiverse aplicado mantendo cor) ================= */

const Button = styled.button`
  height: 46px;
  padding: 0.7em 1.7em;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 12px;
  cursor: pointer;

  /* mantém sua cor */
  background: linear-gradient(135deg, #b82626, #7d1717);
  color: #fff;

  border: 1px solid rgba(255, 255, 255, 0.08);

  /* base Uiverse (neumorphism) adaptado pro vermelho */
  box-shadow: 6px 6px 12px rgba(0, 0, 0, 0.35),
    -6px -6px 12px rgba(255, 255, 255, 0.08);

  transition: all 0.25s ease;

  &:active {
    box-shadow: inset 4px 4px 12px rgba(0, 0, 0, 0.45),
      inset -4px -4px 12px rgba(255, 255, 255, 0.08);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }
`;

const Helper = styled.p`
  margin: 2px 0 0;
  font-size: 0.85rem;
  color: #6f6f6f;
`;

const ErrorMsg = styled.p`
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: #b30000;
`;

/* ================= UTIL ================= */

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const maskCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

function isValidCPF(input: string) {
  const str = onlyDigits(input);
  if (!str || str.length !== 11 || /^(\d)\1+$/.test(str)) return false;

  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base[i]) * (factor - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calc(str.slice(0, 9), 10);
  const d2 = calc(str.slice(0, 10), 11);

  return d1 === Number(str[9]) && d2 === Number(str[10]);
}

/* ================= COMPONENT ================= */

const Login: React.FC = () => {
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    // trava scroll/bounce só nessa página + evita faixa branca do html/body
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");

    if (!isValidCPF(cpf)) {
      setErr("CPF inválido. Confira e tente novamente.");
      return;
    }

    setLoading(true);
    try {
      const cleanCpf = onlyDigits(cpf);

      const session = await checkCpfLogin(cpf);

      const { error: linkErr } = await supabase.rpc("link_employee_to_user", {
        p_cpf: cleanCpf,
      });

      if (linkErr) throw linkErr;

      if (session.role === "rh") {
        window.location.href = "/rh";
      } else {
        window.location.href = "/catalogo";
      }
    } catch (error: any) {
      setErr(error?.message || "Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {/* LOADING OVERLAY */}
      {loading && (
        <LoadingOverlay aria-label="Carregando login">
          <Frame>
            <Center>
              <Dot3 />
              <Dot2 />
              <Dot1 />
            </Center>
            <LoadingText>Verificando seu acesso...</LoadingText>
          </Frame>
        </LoadingOverlay>
      )}

      {/* BOTÃO VOLTAR PARA RAIZ */}
      <BackButton
        aria-label="Voltar para escolha de usuário"
        onClick={() =>
          (window.location.href = "http://funcionarios.gostinhomineiro.com")
        }
      >
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </BackButton>

      <StyledCard>
        <LogoWrapper>
          <LogoImg
            src={logo}
            alt="Logo da empresa"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/fallback_logo.png";
            }}
          />
        </LogoWrapper>

        <Title>Entrar</Title>
        <Subtitle>Acesse o catálogo de funcionários</Subtitle>

        <Form onSubmit={handleSubmit} noValidate>
          <Field>
            <Label htmlFor="cpf">CPF</Label>
            <NeumorphicInput
              id="cpf"
              name="cpf"
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={maskCPF(cpf)}
              onChange={(e) => setCpf(e.target.value)}
              aria-invalid={!!err}
              aria-describedby={err ? "cpf-error" : undefined}
              disabled={loading}
            />
            <Helper>Usaremos seu CPF para verificar seu acesso.</Helper>
            {err && <ErrorMsg id="cpf-error">{err}</ErrorMsg>}
          </Field>

          <Button type="submit" disabled={loading}>
            Entrar
          </Button>
        </Form>
      </StyledCard>
    </Screen>
  );
};

export default Login;
