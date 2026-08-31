// src/App.tsx
import { lazy, Suspense } from "react";
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
import Maintenance from "./pages/Maintenance";
import Avisos from "./pages/Avisos";
import Checkout from "./pages/Checkout";
import MyOrdersPage from "./pages/MyOrdersPage";
import NotFound from "./pages/NotFound";

// ✅ Favoritos
import FavoritesPage from "./pages/Favorites";

// ✅ Destaques também é tela de gestão — entra no grupo de baixo.

/**
 * ADMIN / RH / RELATÓRIOS SÃO CARREGADOS SOB DEMANDA (31/08/2026).
 *
 * Antes tudo isto era `import` estático, então o bundle era um arquivo só de
 * 2,7 MB: o funcionário que abre o catálogo no celular pra pedir pão de queijo
 * baixava junto a tela de pedidos do admin (4.000 linhas), os relatórios, o
 * painel do CIGAM e o html2canvas (190 KB, usado só pra exportar relatório).
 * Ele nunca abre nenhuma dessas telas — não tem permissão.
 *
 * O corte é por QUEM USA, não por tamanho: o fluxo do funcionário (escolha,
 * login, catálogo, checkout, meus pedidos, favoritos, avisos) continua com
 * import estático, porque é o caminho quente e uma ida à rede no meio dele
 * seria trocar um problema por outro. Tudo que exige papel de admin ou RH vira
 * `lazy` — quem abre essas telas está no desktop da loja, não no 3G.
 *
 * O `Suspense` que segura a espera está em volta do `<Routes>`, com o mesmo
 * fundo das telas pra não piscar branco entre uma rota e outra.
 */
const Admin = lazy(() => import("./pages/Admin"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const RhHome = lazy(() => import("./pages/rh/RhHome"));
const EmployeesPage = lazy(() => import("./pages/rh/EmployeesPage"));
const RHSpendingReport = lazy(() => import("./pages/rh/RHSpendingReport"));
const RelatorioAbatimentos = lazy(() => import("./pages/RelatorioAbatimentos"));
const LiberarPedidos = lazy(() => import("./pages/rh/LiberarPedidos"));
const ReportsDashboard = lazy(() => import("./pages/ReportsDashboard"));
const OperationsHistory = lazy(() => import("./pages/OperationsHistory"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const IntegracaoCigam = lazy(() => import("./pages/IntegracaoCigam"));
const Destaques = lazy(() => import("./pages/Destaques"));

import { isSuperAdminSession } from "./lib/superAdmin";

const queryClient = new QueryClient();
const MAINTENANCE_MODE = false;
type EmployeeRole = "admin" | "rh" | string;

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

  // Superadmin atravessa qualquer rota — inclusive as /rh, que o papel admin
  // não alcança porque role guarda um valor só. Ver src/lib/superAdmin.ts.
  if (isSuperAdminSession()) return children;

  if (!allow.includes(sess.role)) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

function CatalogGate({ children }: { children: JSX.Element }) {
  const sess = getEmployeeSession();
  if (!sess) return <Navigate to="/login" replace />;

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
          {MAINTENANCE_MODE ? (
            <Maintenance />
          ) : (
          <BrowserRouter>
            {/* Segura a espera das telas carregadas sob demanda. O fundo é o
                mesmo `#F6F7FB` das telas de gestão de propósito: sem isso a
                troca de rota pisca branco no meio do caminho. */}
            <Suspense
              fallback={
                <div
                  style={{
                    minHeight: "100vh",
                    background: "#F6F7FB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#111827",
                    fontWeight: 900,
                  }}
                >
                  Carregando…
                </div>
              }
            >
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

              {/* Admin */}
              <Route
                path="/admin"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <AdminHome />
                  </RequireRole>
                }
              />

              <Route
                path="/admin/produtos"
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

              {/* Painel de integração CIGAM: pedidos que não chegaram ao ERP */}
              <Route
                path="/admin/integracao"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <IntegracaoCigam />
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

              {/*
                Relatório de abatimentos — o papel que o faturamento entregava
                ao RH toda sexta. Admin entra na MESMA tela (há botão nos dois
                menus): é um só relatório, e duas versões dele seria a chance de
                o RH e o faturamento abaterem valores diferentes.
              */}
              <Route
                path="/rh/relatorio-abatimentos"
                element={
                  <RequireRole allow={["rh", "admin"]} redirectTo="/catalogo">
                    <RelatorioAbatimentos />
                  </RequireRole>
                }
              />

              {/*
                Liberar pedido para hoje — a exceção que o RH abre pro pedido
                feito depois do corte das 13:40 sair no mesmo dia. Admin entra
                na mesma tela: quem libera pode ser o RH direto ou o
                faturamento a pedido dele, e as duas mãos precisam enxergar a
                mesma fila.
              */}
              <Route
                path="/rh/liberar-pedidos"
                element={
                  <RequireRole allow={["rh", "admin"]} redirectTo="/catalogo">
                    <LiberarPedidos />
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

              {/* Histórico operacional é só do admin — o RH não entra nem pela URL. */}
              <Route
                path="/operacoes"
                element={
                  <RequireRole allow={["admin"]} redirectTo="/catalogo">
                    <OperationsHistory />
                  </RequireRole>
                }
              />

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
          )}
        </CartProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
