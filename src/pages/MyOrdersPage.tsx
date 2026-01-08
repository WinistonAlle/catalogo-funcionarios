import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useCart } from "@/contexts/CartContext";
import type { Product } from "@/types/products";

// ✅ LOGO (mesmo padrão do Index/Avisos/Favoritos)
import logoGostinho from "@/images/logoc.png";

import {
  Loader2,
  Home,
  Bell,
  ClipboardList,
  PenSquare,
  Users,
  LogOut,
  ChevronDown,
  ChevronUp,
  BarChart2,
  Heart,
  Facebook,
  Instagram,
  Youtube,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CartToggle from "@/components/CartToggle";
import Cart from "@/components/Cart";

/* --------------------------------------------------------
   HELPER: SESSION
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
   TYPES
-------------------------------------------------------- */
type OrderItem = {
  id: string | number;
  product_name: string;
  quantity: number;
  subtotal: number;
};

type Order = {
  id: string;
  order_number: string;
  employee_cpf?: string;
  total_items: number;
  total_value: number;
  status: string;
  created_at: string;
  order_items?: OrderItem[];
};

/* --------------------------------------------------------
   BOTTOM NAV (MOBILE)
-------------------------------------------------------- */
const BottomNav: React.FC = () => {
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
                  flex items-center justify-center rounded-full p-2 transition-all
                  ${active ? "bg-red-50 scale-110 shadow-sm" : "bg-transparent"}
                `}
              >
                <Icon className="h-5 w-5" />
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
   HELPERS VISUAIS
-------------------------------------------------------- */
function getStatusClasses(status: string) {
  const s = status?.toLowerCase?.() ?? "";

  if (s.includes("pend")) return "bg-amber-100 text-amber-800 border-amber-200";
  if (s.includes("final") || s.includes("concl"))
    return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s.includes("cancel")) return "bg-red-100 text-red-800 border-red-200";

  return "bg-gray-100 text-gray-700 border-gray-200";
}

const formatCurrency = (value: number) =>
  (value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/* --------------------------------------------------------
   MAPEAR PRODUTO DO SUPABASE -> Product DO CATÁLOGO
-------------------------------------------------------- */
function mapSupabaseProduct(row: any): Product {
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
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const MyOrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { clearCart, addToCart } = useCart();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refazendoId, setRefazendoId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const employee: any = safeGetEmployee();

  const employeeCpf: string | null = employee?.cpf ?? null;
  const employeeName: string =
    employee?.full_name ??
    employee?.name ??
    employee?.apelido ??
    "Funcionário";

  const isAdmin =
    employee?.is_admin ||
    employee?.role === "admin" ||
    employee?.tipo === "ADMIN";

  const isRH =
    employee?.is_rh || employee?.role === "rh" || employee?.setor === "RH";

  // Garante login
  useEffect(() => {
    const sess = localStorage.getItem("employee_session");
    if (!sess) navigate("/login", { replace: true });
  }, [navigate]);

  // Carrega pedidos do funcionário (com itens) usando CPF
  useEffect(() => {
    if (!employeeCpf) {
      setLoading(false);
      return;
    }

    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          order_number,
          employee_cpf,
          total_items,
          total_value,
          status,
          created_at,
          order_items (
            id,
            product_name,
            quantity,
            subtotal
          )
        `
        )
        .eq("employee_cpf", employeeCpf)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
      }

      setOrders((data as any) ?? []);
      setLoading(false);
    })();
  }, [employeeCpf]);

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

  // -------------------------------
  // 📌 FUNÇÃO: REFAZER PEDIDO
  // -------------------------------
  async function handleRefazerPedido(orderId: string) {
    try {
      setRefazendoId(orderId);

      const { data, error } = await supabase
        .from("order_items")
        .select(
          `
          product_id,
          quantity,
          products:product_id (*)
        `
        )
        .eq("order_id", orderId);

      if (error) {
        console.error(error);
        alert("Erro ao carregar itens do pedido.");
        return;
      }

      const rows = (data ?? []) as any[];
      const items = rows.filter((row) => row.products);

      if (!items.length) {
        alert("Nenhum item deste pedido está disponível para refazer.");
        return;
      }

      clearCart();

      items.forEach((row) => {
        const productRow = row.products;
        const quantity = Number(row.quantity ?? 0);

        if (!productRow || !Number.isFinite(quantity) || quantity <= 0) return;

        const product = mapSupabaseProduct(productRow);
        addToCart(product, quantity);
      });

      if (items.length < rows.length) {
        alert(
          "Alguns itens não estão mais disponíveis e não foram adicionados ao carrinho."
        );
      } else {
        alert("Pedido recarregado no carrinho. Confira e finalize.");
      }

      navigate("/checkout");
    } finally {
      setRefazendoId(null);
    }
  }

  if (!employeeCpf) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Não foi possível identificar o funcionário logado.</p>
      </div>
    );
  }

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
          {/* ✅ LOGO NO LUGAR DO TEXTO */}
          <button
            onClick={() => goTo("/catalogo")}
            className="text-left flex items-center"
            aria-label="Ir para o catálogo"
          >
            <img
              src={logoGostinho}
              alt="Gostinho Mineiro"
              className="
                h-8 sm:h-9 md:h-10
                w-auto
                object-contain
                select-none
              "
            />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex flex-col text-right leading-tight">
              <span className="text-base font-semibold">
                {employeeName}{" "}
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

      {/* DRAWER / OVERLAY */}
      <div
        className={`
          fixed inset-0 z-50 transition-opacity duration-200
          backdrop-blur-sm
          ${
            menuOpen ? "bg-black/30 opacity-100" : "pointer-events-none opacity-0"
          }
        `}
        onClick={() => setMenuOpen(false)}
      />

      <aside
        className={`
          fixed right-0 top-0 bottom-0 z-50 w-72 max-w-[80%]
          bg-white text-gray-900 shadow-xl border-l border-gray-200
          transform transition-transform duration-200
          ${menuOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 uppercase tracking-wide">
              Menu
            </span>
            <span className="text-sm font-semibold truncate max-w-[150px]">
              {employeeName}
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

        {/* ✅ ORDEM PADRONIZADA IGUAL AO INDEX */}
        <nav className="px-2 py-3 flex flex-col gap-1 text-sm">
          {/* 1) Catálogo */}
          <button
            onClick={() => goTo("/catalogo")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Home className="h-4 w-4 text-red-600" />
            </span>
            <span>Catálogo</span>
          </button>

          {/* 2) Alertas */}
          <button
            onClick={() => goTo("/avisos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Bell className="h-4 w-4 text-red-600" />
            </span>
            <span>Alertas</span>
          </button>

          {/* 3) Favoritos */}
          <button
            onClick={() => goTo("/favoritos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <Heart className="h-4 w-4 text-red-600" />
            </span>
            <span>Favoritos</span>
          </button>

          {/* 4) Pedidos (ativo) */}
          <button
            onClick={() => goTo("/meus-pedidos")}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 text-red-700 font-medium"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600">
              <ClipboardList className="h-4 w-4 text-white" />
            </span>
            <span>Pedidos</span>
          </button>

          {/* 5) Relatórios (Admin/RH) */}
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

          {/* 6) RH (RH) */}
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

          {/* 7) Destaques (Admin) */}
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

          {/* 9) Editar (Admin) */}
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
        {/* Cabeçalho da página */}
        <div className="mt-16 md:mt-20 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meus pedidos</h1>
            <p className="text-sm text-gray-600 mt-1">
              Veja o histórico de pedidos feitos com seu usuário, confira os
              itens e refaça com apenas um clique.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goTo("/catalogo")}
            >
              Voltar para o catálogo
            </Button>
          </div>
        </div>

        {/* Estados de carregamento */}
        {loading && (
          <div className="flex items-center gap-2 text-gray-600">
            <Loader2 className="animate-spin w-4 h-4" />
            <span>Carregando pedidos...</span>
          </div>
        )}

        {!loading && !orders.length && (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 bg-white p-6 textcenter">
            <p className="font-medium text-gray-800 mb-1">
              Você ainda não realizou nenhum pedido.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Assim que você finalizar um pedido pelo catálogo interno, ele
              aparecerá aqui.
            </p>
            <Button onClick={() => goTo("/catalogo")}>Ir para o catálogo</Button>
          </div>
        )}

        {/* LISTA DE PEDIDOS */}
        {!loading && !!orders.length && (
          <div className="space-y-3">
            {orders.map((order) => {
              const isOpen = openOrderId === order.id;

              const orderNumber = order.order_number ?? `#${order.id}`;
              const totalItems = order.total_items ?? 0;
              const totalValueRaw = order.total_value ?? 0;

              return (
                <div
                  key={order.id}
                  className="border border-gray-200 bg-white rounded-xl p-3 md:p-4 flex flex-col gap-3 shadow-sm"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          Pedido
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {orderNumber}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(order.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>

                    <span
                      className={
                        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-medium " +
                        getStatusClasses(order.status)
                      }
                    >
                      {order.status}
                    </span>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">{totalItems}</span> itens ·{" "}
                      <span className="font-medium">
                        {formatCurrency(totalValueRaw)}
                      </span>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setOpenOrderId((prev) =>
                            prev === order.id ? null : order.id
                          )
                        }
                      >
                        <span className="mr-1">
                          {isOpen ? "Esconder detalhes" : "Detalhes"}
                        </span>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>

                      <Button
                        size="sm"
                        className="bg-red-600 hover:bg-red-700"
                        onClick={() => handleRefazerPedido(order.id)}
                        disabled={refazendoId === order.id}
                      >
                        {refazendoId === order.id && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Refazer pedido
                      </Button>
                    </div>
                  </div>

                  {/* Detalhes dos itens */}
                  {isOpen &&
                    order.order_items &&
                    order.order_items.length > 0 && (
                      <div className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-700">
                        <ul className="space-y-1">
                          {order.order_items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center justify-between"
                            >
                              <div className="flex-1 pr-2">
                                <span className="font-medium">
                                  {item.product_name}
                                </span>
                                <span className="ml-1 text-gray-500">
                                  x{item.quantity}
                                </span>
                              </div>
                              <span className="font-semibold">
                                {formatCurrency(item.subtotal)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />

      <Footer />

      <CartToggle />
      <Cart />
    </div>
  );
};

// --- NOVO COMPONENTE FOOTER ---
const socialLinks = [
  {
    name: "Instagram",
    url: "https://www.instagram.com/gostinhomineiro.oficial/",
    icon: Instagram,
  },
  {
    name: "Facebook",
    url: "https://www.facebook.com/gostinhomineirobsb/?locale=pt_BR",
    icon: Facebook,
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@gostinhomineiropaodequeijo7377",
    icon: Youtube,
  },
];

const developerText =
  "© 2025 Catálogo Interativo para funcionários desenvolvido por Winiston Alle & Mateus Borges";

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-100 pt-4 pb-24 md:pb-2 border-t border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center">
          <div className="flex space-x-4 mb-4 mt-4">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  flex items-center justify-center
                  h-10 w-10 rounded-full
                  bg-gray-700 text-white
                  hover:bg-gray-900 transition-colors
                "
                aria-label={`Link para ${link.name}`}
              >
                <link.icon className="h-5 w-5" />
              </a>
            ))}
          </div>
        </div>
        <div className="text-center pt-2">
          <p className="text-xs text-gray-600">{developerText}</p>
        </div>
      </div>
    </footer>
  );
};

export default MyOrdersPage;
