import { useState } from "react";
import styled from "styled-components";
import { Bg, Card } from "../components/ui/app-surface";
import logo from "../images/logop.jpg";
import { checkCpfLogin } from "@/services/auth";
import { supabase } from "@/lib/supabase";

/* ================= BOTÃO VOLTAR ================= */

const BackButton = styled.button`
  position: fixed;
  top: 16px;
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

const Input = styled.input`
  height: 46px;
  border-radius: 12px;
  border: 1px solid #e3e3e3;
  padding: 0 14px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:focus-visible {
    border-color: #b82626;
    box-shadow: 0 0 0 3px rgba(184, 38, 38, 0.15);
  }
`;

const Button = styled.button`
  height: 46px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #b82626, #7d1717);
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.15s ease, transform 0.05s ease-in-out,
    filter 0.15s ease;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    filter: grayscale(0.1);
  }

  &:active {
    transform: translateY(1px);
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
  if (!str || str.length !== 11 || /^(\d)\1+$/.test(str))
    return false;

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

  return (
    d1 === Number(str[9]) && d2 === Number(str[10])
  );
}

/* ================= COMPONENT ================= */

const Login: React.FC = () => {
  const [cpf, setCpf] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
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

      const { error: linkErr } =
        await supabase.rpc("link_employee_to_user", {
          p_cpf: cleanCpf,
        });

      if (linkErr) throw linkErr;

      if (session.role === "rh") {
        window.location.href = "/rh";
      } else {
        window.location.href = "/catalogo";
      }
    } catch (error: any) {
      setErr(
        error?.message ||
          "Erro inesperado. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Bg>
      {/* BOTÃO VOLTAR PARA RAIZ */}
      <BackButton
        aria-label="Voltar para escolha de usuário"
        onClick={() =>
          (window.location.href =
            "http://localhost:8080")
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

      <Card>
        <LogoWrapper>
          <LogoImg
            src={logo}
            alt="Logo da empresa"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/fallback_logo.png";
            }}
          />
        </LogoWrapper>

        <Title>Entrar</Title>
        <Subtitle>
          Acesse o catálogo de funcionários
        </Subtitle>

        <Form onSubmit={handleSubmit} noValidate>
          <Field>
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              name="cpf"
              inputMode="numeric"
              autoComplete="username"
              placeholder="000.000.000-00"
              value={maskCPF(cpf)}
              onChange={(e) => setCpf(e.target.value)}
              aria-invalid={!!err}
              aria-describedby={
                err ? "cpf-error" : undefined
              }
            />
            <Helper>
              Usaremos seu CPF para verificar seu acesso.
            </Helper>
            {err && (
              <ErrorMsg id="cpf-error">
                {err}
              </ErrorMsg>
            )}
          </Field>

          <Button type="submit" disabled={loading}>
            {loading ? "Verificando..." : "Entrar"}
          </Button>
        </Form>
      </Card>
    </Bg>
  );
};

export default Login;
