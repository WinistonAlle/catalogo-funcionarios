// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { CartProvider } from "@/contexts/CartContext";

// Páginas base
import EscolhaUsuario from "./pages/EscolhaUsuario";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Avisos from "./pages/Avisos";
import Checkout from "./pages/Checkout";
import MyOrdersPage from "./pages/MyOrdersPage";
import NotFound from "./pages/NotFound";

// ✅ Favoritos
import FavoritesPage from "./pages/Favorites";

// ✅ Destaques (Admin)
import Destaques from "./pages/Destaques";

// Admin / RH / Relatórios / Separação
import Admin from "./pages/Admin";
import RhHome from "./pages/rh/RhHome";
import EmployeesPage from "./pages/rh/EmployeesPage";
import RHSpendingReport from "./pages/rh/RHSpendingReport";
import ReportsDashboard from "./pages/ReportsDashboard";
import SeparationBoard from "./pages/SeparationBoard";

// ✅ NOVO: AdminOrders
import AdminOrders from "./pages/AdminOrders"; 
// Se o seu arquivo estiver em: src/pages/admin/AdminOrders.tsx, use:
// import AdminOrders from "./pages/admin/AdminOrders";

const queryClient = new QueryClient();

type EmployeeRole = "admin" | "rh" | "separacao" | string;

type EmployeeSession = {
  id: string;
  full_name: string;
  cpf: string;
  role: EmployeeRole;
};

function getEmployeeSession(): EmployeeSession | null {
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

/* --------------------------------------------------------
   ROUTE GUARDS
-------------------------------------------------------- */

function RequireAuth({ children }: { children: JSX.Element }) {
  const sess = getEmployeeSession();
  if (!sess) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({
  allow,
  redirectTo = "/catalogo",
  children,
}: {
  allow: EmployeeRole[];
  redirectTo?: string;
  children: JSX.Element;
}) {
  const sess = getEmployeeSession();
  if (!sess) return <Navigate to="/login" replace />;

  if (!allow.includes(sess.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

/**
 * Catálogo: se for perfil separação, manda direto pro painel
 */
function CatalogGate({ children }: { children: JSX.Element }) {
  const sess = getEmployeeSession();
  if (!sess) return <Navigate to="/login" replace />;

  if (sess.role === "separacao") {
    return <Navigate to="/painel-separacao" replace />;
  }

  return children;
}

/* --------------------------------------------------------
   APP
-------------------------------------------------------- */

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <CartProvider>
          <BrowserRouter>
            <Routes>
              {/* Home (escolha / entrada) */}
              <Route path="/" element={<EscolhaUsuario />} />

              {/* Login */}
              <Route path="/login" element={<Login />} />

              {/* Catálogo */}
              <Route
                path="/catalogo"
                element={
                  <RequireAuth>
                    <CatalogGate>
                      <Index />
                    </CatalogGate>
                  </RequireAuth>
                }
              />

              {/* Favoritos */}
              <Route
                path="/favoritos"
                element={
                  <RequireAuth>
                    <FavoritesPage />
                  </RequireAuth>
                }
              />

              {/* Avisos */}
              <Route
                path="/avisos"
                element={
                  <RequireAuth>
                    <Avisos />
                  </RequireAuth>
                }
              />

              {/* ✅ Destaques (Admin) */}
              <Route
                path="/destaques"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <Destaques />
                  </RequireRole>
                }
              />

              {/* Meus pedidos */}
              <Route
                path="/meus-pedidos"
                element={
                  <RequireAuth>
                    <MyOrdersPage />
                  </RequireAuth>
                }
              />

              {/* Checkout */}
              <Route
                path="/checkout"
                element={
                  <RequireAuth>
                    <Checkout />
                  </RequireAuth>
                }
              />

              {/* Painel de separação (TV) */}
              <Route
                path="/painel-separacao"
                element={
                  <RequireRole allow={["separacao"]} redirectTo="/catalogo">
                    <SeparationBoard />
                  </RequireRole>
                }
              />

              {/* Admin */}
              <Route
                path="/admin"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <Admin />
                  </RequireRole>
                }
              />

              {/* ✅ NOVO: Admin - Pedidos (cancelar/editar + histórico) */}
              <Route
                path="/admin/pedidos"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <AdminOrders />
                  </RequireRole>
                }
              />

              {/* RH */}
              <Route
                path="/rh"
                element={
                  <RequireRole allow={["rh"]} redirectTo="/catalogo">
                    <RhHome />
                  </RequireRole>
                }
              />

              <Route
                path="/rh/funcionarios"
                element={
                  <RequireRole allow={["rh"]} redirectTo="/catalogo">
                    <EmployeesPage />
                  </RequireRole>
                }
              />

              {/* ✅ Relatório de gastos do RH */}
              <Route
                path="/rh/relatorio-gastos"
                element={
                  <RequireRole allow={["rh"]} redirectTo="/catalogo">
                    <RHSpendingReport />
                  </RequireRole>
                }
              />

              {/* Relatórios (Admin + RH) */}
              <Route
                path="/relatorios"
                element={
                  <RequireRole allow={["admin", "rh"]} redirectTo="/catalogo">
                    <ReportsDashboard />
                  </RequireRole>
                }
              />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
