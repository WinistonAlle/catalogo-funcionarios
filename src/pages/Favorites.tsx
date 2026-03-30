import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Product } from "../types/products";

import ProductCard from "../components/ProductCard";
import CartToggle from "../components/CartToggle";
import Cart from "../components/Cart";

// ✅ LOGO (mesmo padrão do Index/Avisos)
import logoGostinho from "@/images/logoc.png";

import {
  Home,
  Bell,
  ClipboardList,
  PenSquare,
  Users,
  LogOut,
  Loader2,
  BarChart2,
  Heart,
  Star, // ✅ DESTAQUES
} from "lucide-react";

/* --------------------------------------------------------
   SESSION HELPER (igual ao resto)
-------------------------------------------------------- */
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

/* --------------------------------------------------------
   helper: pega employee_id do user logado (via RPC)
-------------------------------------------------------- */
let cachedEmployeeId: string | null = null;

async function getMyEmployeeId(): Promise<string> {
  if (cachedEmployeeId) return cachedEmployeeId;

  const { data, error } = await supabase.rpc("current_employee_id");
  if (error) throw error;

  if (!data) throw new Error("Funcionário não vinculado ao usuário logado.");

  cachedEmployeeId = data as string;
  return cachedEmployeeId;
}

/* --------------------------------------------------------
   BOTTOM NAV (mobile) - padrão do app
-------------------------------------------------------- */
interface BottomNavProps {
  noticeCount?: number;
}

const BottomNav: React.FC<BottomNavProps> = ({ noticeCount = 0 }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const HOME_PATH = "/catalogo";

  const tabs = [
    { label: "Início", path: HOME_PATH, icon: Home },
    { label: "Avisos", path: "/avisos", icon: Bell },
    { label: "Favoritos", path: "/favoritos", icon: Heart },
    { label: "Pedidos", path: "/meus-pedidos", icon: ClipboardList },
  ];

  const isActive = (path: string) => {
    if (path === HOME_PATH) {
      return (
        location.pathname === HOME_PATH ||
        location.pathname === "/" ||
        location.pathname === "/index"
      );
    }
    return location.pathname === path;
  };

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0 z-40 md:hidden
        bg-white/95 backdrop-blur-md
        border-t border-gray-200
        shadow-[0_-4px_12px_rgba(0,0,0,0.06)]
      "
    >
      <div className="flex justify-around py-2">
        {tabs.map(({ label, path, icon: Icon }) => {
          const active = isActive(path);
          const isHome = label === "Início";
          const isAvisos = label === "Avisos";

          return (
            <button
              key={path}
              onClick={() => {
                if (isHome) {
                  window.location.href = HOME_PATH;
                } else {
                  navigate(path);
                }
              }}
              className={`
                relative flex flex-col items-center gap-0.5
                text-[11px] transition-all active:scale-95
                ${active ? "text-red-600 font-semibold" : "text-gray-500"}
              `}
            >
              <div
                className={`
                  relative flex items-center justify-center rounded-full p-2 transition-all
                  ${active ? "bg-red-50 scale-110 shadow-sm" : "bg-transparent"}
                `}
              >
                <Icon className="h-5 w-5" />

                {isAvisos && noticeCount > 0 && (
                  <span
                    className="
                      absolute -top-1.5 -right-1.5
                      min-w-[16px] h-4 px-1
                      rounded-full bg-red-500
                      text-[10px] font-bold text-white
                      flex items-center justify-center
                      border-2 border-white
                    "
                  >
                    {noticeCount > 9 ? "9+" : noticeCount}
                  </span>
                )}
              </div>

              <span>{label}</span>

              {active && (
                <span className="mt-0.5 h-1 w-6 rounded-full bg-red-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const FavoritesPage: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const employee: any = safeGetEmployee();
  const displayName = employee?.full_name ?? employee?.name ?? "Funcionário";

  const isAdmin =
    employee?.is_admin ||
    employee?.role === "admin" ||
    employee?.tipo === "ADMIN";

  const isRH =
    employee?.is_rh || employee?.role === "rh" || employee?.setor === "RH";

  // ✅ login guard
  useEffect(() => {
    const sess = localStorage.getItem("employee_session");
    if (!sess) navigate("/login", { replace: true });
  }, [navigate]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);

  const fetchFavorites = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);

      const employeeId = await getMyEmployeeId();

      const { data, error } = await supabase
        .from("favorites")
        .select("created_at, product:products(*)")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as any[];

      const mapped: Product[] = rows
        .map((r: any) => r.product)
        .filter(Boolean)
        .map((row: any) => {
          const employeePrice = Number(row.employee_price ?? row.price ?? 0);
          return {
            id: row.id,
            old_id: row.old_id ?? null,
            name: row.name,
            price: employeePrice,
            employee_price: employeePrice,
            images: row.images ?? (row.image ? [row.image] : []),
            image_path: row.image_path ?? null,
            category: row.category ?? row.category_name ?? "Outros",
            description: row.description ?? "",
            packageInfo: row.packageInfo ?? row.package_info ?? "",
            weight: Number(row.weight ?? 0),
            isPackage: row.isPackage ?? row.is_package ?? false,
            featured: row.featured ?? row.isFeatured ?? false,
            inStock: row.inStock ?? row.in_stock ?? true,
            isLaunch: row.isLaunch ?? row.is_launch ?? false,
            extraInfo: row.extraInfo ?? undefined,
          };
        });

      setProducts(mapped);
    } catch (err: any) {
      setLoadError(err?.message ?? "Erro ao carregar favoritos.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  useEffect(() => {
    const onFocus = () => fetchFavorites();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchFavorites();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchFavorites]);

  const noticeCount = 0;

  const goTo = (path: string) => {
    if (path === "/catalogo") {
      window.location.href = "/catalogo";
    } else {
      navigate(path);
    }
    setMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("employee_session");
    setMenuOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-20 md:pb-0">
      {/* Faixa vermelha por trás do header */}
      <div
        className="w-full h-24"
        style={{
          background:
            "linear-gradient(to bottom, #e53935, #e53935aa, transparent)",
        }}
      />

      {/* HEADER */}
      <header
        className="
          fixed top-0 left-0 right-0 z-40
          bg-red-600/90 backdrop-blur-md
          border-b border-red-800/40
          text-white py-5
        "
      >
        <div className="container mx-auto px-4 flex items-center justify-between gap-4">
          <button
            onClick={() => goTo("/catalogo")}
            className="text-left flex items-center"
            aria-label="Ir para o catálogo"
          >
            <img
              src={logoGostinho}
              alt="Gostinho Mineiro"
              className="h-8 sm:h-9 md:h-10 w-auto object-contain select-none"
            />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex flex-col text-right leading-tight">
              <span className="text-base font-semibold">
                {displayName}{" "}
                {isAdmin && (
                  <span className="text-[11px] opacity-80 ml-1">(Admin)</span>
                )}
                {isRH && (
                  <span className="text-[11px] opacity-80 ml-1">(RH)</span>
                )}
              </span>
            </div>

            <button
              type="button"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-red-300/50 bg-red-500/80"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Abrir menu"
            >
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
        </div>
      </header>

      {/* OVERLAY */}
      <div
        className={`
          fixed inset-0 z-50 transition-opacity duration-200
          backdrop-blur-sm
          ${menuOpen ? "bg-black/30 opacity-100" : "pointer-events-none opacity-0"}
        `}
        onClick={() => setMenuOpen(false)}
      />

      {/* DRAWER */}
      <aside
        className={`
          fixed right-0 top-0 bottom-0 z-50
          w-72 max-w-[80%] bg-white shadow-xl border-l border-gray-200
          transform transition-transform duration-200
          ${menuOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Menu do catálogo
            </span>
            <span className="text-sm font-semibold truncate max-w-[150px]">
              {displayName}
            </span>
          </div>

          <button
            onClick={() => setMenuOpen(false)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            aria-label="Fechar menu"
          >
            <span className="relative block h-4 w-4">
              <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 rotate-45 rounded-full bg-gray-800" />
              <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 -rotate-45 rounded-full bg-gray-800" />
            </span>
          </button>
        </div>

        <nav className="px-2 py-3 flex flex-col gap-1 text-sm">
          <button
            onClick={() => goTo("/catalogo")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Home className="h-4 w-4 text-red-600" />
            </span>
            <span>Catálogo</span>
          </button>

          <button
            onClick={() => goTo("/avisos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Bell className="h-4 w-4 text-red-600" />
            </span>
            <span>Alertas</span>
          </button>

          <button
            onClick={() => goTo("/favoritos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 text-gray-900 font-semibold"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Heart className="h-4 w-4 text-red-600" />
            </span>
            <span>Favoritos</span>
          </button>

          <button
            onClick={() => goTo("/meus-pedidos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <ClipboardList className="h-4 w-4 text-red-600" />
            </span>
            <span>Pedidos</span>
          </button>

          {(isAdmin || isRH) && (
            <button
              onClick={() => goTo("/relatorios")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <BarChart2 className="h-4 w-4 text-red-600" />
              </span>
              <span>Relatórios</span>
            </button>
          )}

          {isRH && (
            <button
              onClick={() => goTo("/rh")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <Users className="h-4 w-4 text-red-600" />
              </span>
              <span>RH</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => goTo("/destaques")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <Star className="h-4 w-4 text-red-600" />
              </span>
              <span>Destaques</span>
            </button>
          )}

          {/* ✅ 8) Pedidos (Admin) - NOVO */}
          {isAdmin && (
            <button
              onClick={() => goTo("/admin/pedidos")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <ClipboardList className="h-4 w-4 text-red-600" />
              </span>
              <span>Pedidos (Admin)</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => goTo("/admin")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <PenSquare className="h-4 w-4 text-red-600" />
              </span>
              <span>Editar</span>
            </button>
          )}
        </nav>

        <div className="mt-auto px-3 pb-4 pt-2 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-red-700 transition"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 container mx-auto px-4 py-6 mt-4">
        <div className="mt-16 md:mt-20 mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Heart className="h-6 w-6 text-red-600" />
              Favoritos
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              {products.length
                ? `${products.length} produto(s) favoritado(s)`
                : "Você ainda não favoritou nenhum produto."}
            </p>
          </div>

          <button
            onClick={() => goTo("/catalogo")}
            className="hidden md:inline-flex items-center justify-center rounded-full border bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Ir para o catálogo
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando favoritos...
          </div>
        ) : loadError ? (
          <div className="py-10 text-center text-red-600">{loadError}</div>
        ) : !products.length ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
            <p className="font-medium text-gray-800 mb-1">
              Nenhum favorito ainda.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Toque no ❤️ no canto do produto para salvar aqui.
            </p>
            <button
              onClick={() => goTo("/catalogo")}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
            >
              Ver catálogo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <ProductCard key={String(p.id)} product={p} />
            ))}
          </div>
        )}
      </main>

      <BottomNav noticeCount={noticeCount} />

      <footer className="mt-4 border-t border-red-100/70 bg-white/70 backdrop-blur-md">
        <div className="container mx-auto px-4 py-4 text-center text-xs text-gray-700">
          <p className="font-medium">
            © 2025 Catálogo Interativo para funcionários
          </p>
          <p className="text-gray-500">
            desenvolvido por <b>Winiston Alle</b> & <b>Mateus Borges</b>
          </p>
        </div>
      </footer>

      <CartToggle />
      <Cart />
    </div>
  );
};

export default FavoritesPage;
