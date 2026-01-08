// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate } from "react-router-dom";

type EmployeeSession = {
  id: string;
  full_name: string;
  cpf: string;
  role: string;
};

function safeGetEmployee(): EmployeeSession | null {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    if (!parsed.cpf || !parsed.role) return null;

    return parsed as EmployeeSession;
  } catch {
    return null;
  }
}

interface ProtectedRouteProps {
  children: JSX.Element;
  /**
   * Quais roles podem acessar essa rota.
   * Se não passar nada, qualquer usuário logado entra.
   */
  allowedRoles?: string[];
}

/**
 * Envolve páginas que precisam de login.
 * - Se não tiver sessão -> manda pro /login
 * - Se tiver sessão mas não tiver role permitida -> manda pro /catalogo
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const employee = safeGetEmployee();

  // não está logado
  if (!employee) {
    return <Navigate to="/login" replace />;
  }

  // logado, mas não tem permissão pra essa rota
  if (allowedRoles && !allowedRoles.includes(employee.role)) {
    // se quiser, pode mandar pra "/" ou outra rota padrão
    return <Navigate to="/catalogo" replace />;
  }

  // autorizado
  return children;
};

export default ProtectedRoute;
