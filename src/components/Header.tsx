import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, Bell, ClipboardList, PenSquare, Users } from "lucide-react";

// Mesmo helper do BottomNav
function safeGetEmployee() {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return {};
    if (raw.trim().startsWith("{") || raw.trim().startsWith("[")) {
      return JSON.parse(raw);
    }
    return {};
  } catch {
    return {};
  }
}

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const employee = useMemo(() => safeGetEmployee(), []);
  const isAdmin =
    (employee as any)?.is_admin ||
    (employee as any)?.role === "admin" ||
    (employee as any)?.tipo === "ADMIN";

  const isRH =
    (employee as any)?.is_rh ||
    (employee as any)?.role === "rh" ||
    (employee as any)?.setor === "RH";

  const handleNavigate = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40">
      {/* Barra principal */}
      <div className="flex h-16 items-center justify-between border-b border-red-700/40 bg-red-600/90 px-4 shadow-lg backdrop-blur-md md:px-8">
        {/* Logo / título (clique -> início) */}
        <button
          onClick={() => handleNavigate("/")}
          className="flex items-center gap-2 text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
            <Home className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-wide text-white">
              Catálogo Interno
            </span>
            <span className="text-xs text-red-100/80">
              Gostinho Mineiro · Funcionários
            </span>
          </div>
        </button>

        {/* Menu desktop */}
        <nav className="hidden items-center gap-1 md:flex">
          <button
            onClick={() => handleNavigate("/")}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-red-50 transition hover:bg-red-700/70"
          >
            <Home className="h-4 w-4" />
            Início
          </button>

          <button
            onClick={() => handleNavigate("/alertas")}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-red-50 transition hover:bg-red-700/70"
          >
            <Bell className="h-4 w-4" />
            Alertas
          </button>

          <button
            onClick={() => handleNavigate("/pedidos")}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-red-50 transition hover:bg-red-700/70"
          >
            <ClipboardList className="h-4 w-4" />
            Pedidos
          </button>

          {isAdmin && (
            <button
              onClick={() => handleNavigate("/admin")}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-red-50 transition hover:bg-red-700/70"
            >
              <PenSquare className="h-4 w-4" />
              Editar
            </button>
          )}

          {isRH && (
            <button
              onClick={() => handleNavigate("/rh")}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-red-50 transition hover:bg-red-700/70"
            >
              <Users className="h-4 w-4" />
              RH
            </button>
          )}
        </nav>

        {/* Botão hambúrguer - mobile */}
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-red-300/40 bg-red-500/70 md:hidden"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-label="Abrir menu"
        >
          {/* animação dos 3 traços virando X */}
          <span className="relative block h-4 w-5">
            <span
              className={`absolute left-0 h-0.5 w-full rounded-full bg-white transition-all duration-300 ${
                menuOpen ? "top-1/2 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-full rounded-full bg-white transition-all duration-300 ${
                menuOpen ? "opacity-0" : "top-1/2 -translate-y-1/2"
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-full rounded-full bg-white transition-all duration-300 ${
                menuOpen ? "bottom-1/2 -rotate-45" : "bottom-0"
              }`}
            />
          </span>
        </button>
      </div>

      {/* Menu mobile dropdown */}
      <div
        className={`md:hidden transform border-b border-red-800/60 bg-red-700/95 px-4 pb-3 pt-2 text-red-50 shadow-lg transition-all duration-200 ${
          menuOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1">
          <button
            onClick={() => handleNavigate("/")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-red-600/80"
          >
            <Home className="h-4 w-4" />
            Início
          </button>

          <button
            onClick={() => handleNavigate("/alertas")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-red-600/80"
          >
            <Bell className="h-4 w-4" />
            Alertas
          </button>

          <button
            onClick={() => handleNavigate("/pedidos")}
            className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-red-600/80"
          >
            <ClipboardList className="h-4 w-4" />
            Pedidos
          </button>

          {isAdmin && (
            <button
              onClick={() => handleNavigate("/admin")}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-red-600/80"
            >
              <PenSquare className="h-4 w-4" />
              Editar (Admin)
            </button>
          )}

          {isRH && (
            <button
              onClick={() => handleNavigate("/rh")}
              className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium hover:bg-red-600/80"
            >
              <Users className="h-4 w-4" />
              RH
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
