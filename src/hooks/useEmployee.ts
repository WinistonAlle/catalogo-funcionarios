// src/hooks/useEmployee.ts
import { useEffect, useState } from "react";

export function useEmployee() {
  const [employee, setEmployee] = useState<any>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("employee_session");
      if (stored) {
        const parsed = JSON.parse(stored);
        setEmployee(parsed);
      }
    } catch (err) {
      console.error("Erro ao ler sessão do funcionário:", err);
    }
  }, []);

  return { employee };
}
