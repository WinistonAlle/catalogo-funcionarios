// src/pages/Index.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Product } from "../types/products";
import SearchBar from "../components/SearchBar";
import { ORDERED_CATEGORIES } from "../data/products";
import ProductCard from "../components/ProductCard";
import CartToggle from "../components/CartToggle";
import Cart from "../components/Cart";
import { normalizeText as normalizeTextUtil } from "@/utils/stringUtils";
import FeaturedProductsCarousel from "@/components/FeaturedProductsCarousel";

// ✅ LOGO (substitui "GOSTINHO MINEIRO" no header)
import logoGostinho from "@/images/logoc.png";

import {
  Home,
  Bell,
  ClipboardList,
  PenSquare,
  Users,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  Info,
  X,
  Heart,
  Facebook,
  Instagram,
  Youtube,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const CATEGORY_NAME_BY_ID: Record<number, string> = {
  1: "Pão de Queijo",
  2: "Salgados Assados",
  3: "Salgados P/ Fritar",
  4: "Pães e Massas Doces",
  5: "Biscoito de Queijo",
  6: "Salgados Grandes",
  7: "Alho em creme",
  8: "Outros",
};

const ITEMS_PER_PAGE = 24;
const PRODUCTS_CACHE_KEY = "gm_catalog_products_v1";
const SEARCH_CACHE_KEY = "gm_catalog_search";
const CATEGORY_CACHE_KEY = "gm_catalog_category";
const LIGHT_MODE_KEY = "gm_light_mode";

/* --------------------------------------------------------
   HELPERS
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

function useDebounce<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function scrollToCatalogTop(ref: React.RefObject<HTMLElement>) {
  const el = ref.current;
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 8;
  window.scrollTo({ top, behavior: "smooth" });
}

function normalizeForSearch(text: string) {
  const base = normalizeTextUtil(text ?? "");
  return base.replace(/\s+/g, "");
}

/* ✅ MESMAS HELPERS DO CARRINHO (para saldo) */
function formatBRLFromCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* --------------------------------------------------------
   TYPES
-------------------------------------------------------- */
interface Notice {
  id: string;
  title: string;
  body: string;
  created_at?: string;
  image_url?: string | null;
}

type CarouselMode = "auto" | "manual";

type TopSellingRow = {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_value: number;
  image_path: string | null;
};

/* --------------------------------------------------------
   LOADING (Uiverse - JkHuger)
   - Overlay full screen
   - CSS isolado (prefixo gm-uiverse-)
-------------------------------------------------------- */
const UiverseLoading: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-white/65 backdrop-blur-sm">
      <div className="gm-uiverse-frame">
        <div className="gm-uiverse-center">
          <div className="gm-uiverse-dot-1" />
          <div className="gm-uiverse-dot-2" />
          <div className="gm-uiverse-dot-3" />
        </div>
      </div>

      <style>{`
        .gm-uiverse-frame {
          position: relative;
          width: 220px;
          height: 220px;
        }

        .gm-uiverse-center {
          position: absolute;
          width: 220px;
          height: 220px;
          top: 0;
          left: 0;
        }

        .gm-uiverse-dot-1 {
          position: absolute;
          z-index: 3;
          width: 30px;
          height: 30px;
          top: 95px;
          left: 95px;
          background: #fff;
          border-radius: 50%;
          -webkit-animation-fill-mode: both;
          animation-fill-mode: both;
          -webkit-animation: gm-jump-jump-1 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: gm-jump-jump-1 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        .gm-uiverse-dot-2 {
          position: absolute;
          z-index: 2;
          width: 60px;
          height: 60px;
          top: 80px;
          left: 80px;
          background: #fff;
          border-radius: 50%;
          -webkit-animation-fill-mode: both;
          animation-fill-mode: both;
          -webkit-animation: gm-jump-jump-2 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: gm-jump-jump-2 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        .gm-uiverse-dot-3 {
          position: absolute;
          z-index: 1;
          width: 90px;
          height: 90px;
          top: 65px;
          left: 65px;
          background: #fff;
          border-radius: 50%;
          -webkit-animation-fill-mode: both;
          animation-fill-mode: both;
          -webkit-animation: gm-jump-jump-3 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: gm-jump-jump-3 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        @keyframes gm-jump-jump-1 {
          0%, 70% {
            box-shadow: 2px 2px 3px 2px rgba(0, 0, 0, 0.2);
            -webkit-transform: scale(0);
            transform: scale(0);
          }
          100% {
            box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
            -webkit-transform: scale(1);
            transform: scale(1);
          }
        }

        @keyframes gm-jump-jump-2 {
          0%, 40% {
            box-shadow: 2px 2px 3px 2px rgba(0, 0, 0, 0.2);
            -webkit-transform: scale(0);
            transform: scale(0);
          }
          100% {
            box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
            -webkit-transform: scale(1);
            transform: scale(1);
          }
        }

        @keyframes gm-jump-jump-3 {
          0%, 10% {
            box-shadow: 2px 2px 3px 2px rgba(0, 0, 0, 0.2);
            -webkit-transform: scale(0);
            transform: scale(0);
          }
          100% {
            box-shadow: 10px 10px 15px 0 rgba(0, 0, 0, 0.3);
            -webkit-transform: scale(1);
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

/* --------------------------------------------------------
   BOTTOM NAV (MOBILE)
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
                if (isHome) window.location.href = HOME_PATH;
                else navigate(path);
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
   SKELETON
-------------------------------------------------------- */
const ProductGridSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border bg-white p-3 shadow-sm animate-pulse space-y-3"
        >
          <div className="w-full h-32 rounded-lg bg-gray-200" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 bg-gray-200 rounded" />
            <div className="h-3 w-1/2 bg-gray-200 rounded" />
          </div>
          <div className="flex items-center justify-between">
            <div className="h-4 w-16 bg-gray-200 rounded" />
            <div className="h-8 w-24 bg-gray-200 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
};

/* --------------------------------------------------------
   PAGINATION
-------------------------------------------------------- */
type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
};

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  onPrev,
  onNext,
  disabled,
}) => {
  const canPrev = currentPage > 1 && !disabled;
  const canNext = currentPage < totalPages && !disabled;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canPrev}
          onClick={onPrev}
          className="
            inline-flex items-center gap-2
            rounded-lg border bg-white px-4 py-2 text-sm font-semibold
            hover:bg-gray-50 disabled:opacity-50
          "
        >
          ← Anterior
        </button>

        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          className="
            inline-flex items-center gap-2
            rounded-lg border bg-white px-4 py-2 text-sm font-semibold
            hover:bg-gray-50 disabled:opacity-50
          "
        >
          Próximo →
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span className="text-gray-500">Página</span>

        <select
          value={currentPage}
          disabled={disabled || totalPages <= 1}
          onChange={(e) => onPageChange(Number(e.target.value))}
          className="
            h-9 rounded-lg border bg-white px-3 text-sm
            focus:outline-none focus:ring-2 focus:ring-red-200
            disabled:opacity-60
          "
          aria-label="Selecionar página"
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <span className="text-gray-500">de</span>
        <span className="font-semibold">{totalPages}</span>
      </div>
    </div>
  );
};

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const Index: React.FC = () => {
  const navigate = useNavigate();
  const catalogRef = useRef<HTMLDivElement | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ Loading overlay (Uiverse)
  // aparece enquanto carrega produtos/avisos/destaques e some quando tudo terminar
  const [overlayLoading, setOverlayLoading] = useState(true);
  const firstPaintDone = useRef(false);

  const [searchTerm, setSearchTerm] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(SEARCH_CACHE_KEY) ?? "";
  });

  const [selectedCategory, setSelectedCategory] = useState<string | "all">(
    () => {
      if (typeof window === "undefined") return "all";
      return (localStorage.getItem(CATEGORY_CACHE_KEY) as any) || "all";
    }
  );

  const [currentPage, setCurrentPage] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [hideHeader, setHideHeader] = useState(false);

  const searchBarContainerRef = useRef<HTMLDivElement | null>(null);
  const searchBarOffsetRef = useRef<number | null>(null);

  const [lightMode, setLightMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LIGHT_MODE_KEY) === "true";
  });
  const [lightInfoOpen, setLightInfoOpen] = useState(false);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentNoticeIndex, setCurrentNoticeIndex] = useState(0);

  // ✅ Destaques
  const [featuredMode, setFeaturedMode] = useState<CarouselMode>("auto");
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(false);

  // ✅ Avisos carregando (pra compor o overlay)
  const [noticesLoading, setNoticesLoading] = useState(true);

  const hasLoadedFromCache = useRef(false);
  const employee: any = safeGetEmployee();
  const displayName = employee?.full_name ?? employee?.name ?? "Funcionário";

  const isAdmin =
    employee?.is_admin ||
    employee?.role === "admin" ||
    employee?.tipo === "ADMIN";

  const isRH =
    employee?.is_rh || employee?.role === "rh" || employee?.setor === "RH";

  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  /* ✅ SALDO DO FUNCIONÁRIO (IGUAL AO CARRINHO) */
  const [walletLoading, setWalletLoading] = useState(true);
  const [walletAvailableCents, setWalletAvailableCents] = useState<number | null>(
    null
  );

  const handleSelectCategory = (cat: string | "all") => {
    setSelectedCategory(cat);
    if (searchTerm.trim().length) setSearchTerm("");
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    setCurrentPage(1);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        'input[placeholder*="Buscar"], input[placeholder*="buscar"], input[type="search"]'
      );
      input?.focus();
    });
  };

  useEffect(() => {
    const sess = localStorage.getItem("employee_session");
    if (!sess) navigate("/login", { replace: true });
  }, [navigate]);

  /* ✅ Carrega saldo no header (mesma lógica do carrinho) */
  useEffect(() => {
    let mounted = true;

    async function loadWallet() {
      try {
        setWalletLoading(true);

        const cpf = employee?.cpf;
        if (!cpf) {
          if (mounted) setWalletAvailableCents(null);
          return;
        }

        // 1) Limite mensal (VIEW segura)
        const { data: walletRow } = await supabase
          .from("employee_wallet_view")
          .select("employee_id, credito_mensal_cents")
          .eq("cpf", cpf)
          .maybeSingle();

        if (!walletRow) {
          if (mounted) setWalletAvailableCents(null);
          return;
        }

        // 2) Gasto do mês
        const { data: spendRow } = await supabase
          .from("employee_monthly_spend")
          .select("spent_cents")
          .eq("employee_id", walletRow.employee_id)
          .eq("month_key", getMonthKey())
          .maybeSingle();

        const spent = Number(spendRow?.spent_cents ?? 0);
        const available = Math.max(
          Number(walletRow.credito_mensal_cents ?? 0) - spent,
          0
        );

        if (mounted) setWalletAvailableCents(available);
      } finally {
        if (mounted) setWalletLoading(false);
      }
    }

    loadWallet();

    return () => {
      mounted = false;
    };
  }, [employee?.cpf]);

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_CACHE_KEY, searchTerm);
    } catch {}
  }, [searchTerm]);

  useEffect(() => {
    try {
      localStorage.setItem(CATEGORY_CACHE_KEY, selectedCategory);
    } catch {}
  }, [selectedCategory]);

  useEffect(() => {
    try {
      localStorage.setItem(LIGHT_MODE_KEY, String(lightMode));
    } catch {}
  }, [lightMode]);

  function mapRowToProduct(row: any): Product {
    const employeePrice = Number(row.employee_price ?? row.price ?? 0);

    const categoryName =
      CATEGORY_NAME_BY_ID[row.category_id as number] ??
      row.category ??
      row.category_name ??
      "Outros";

    return {
      id: row.id,
      old_id: row.old_id ?? null,
      name: row.name,
      price: employeePrice,
      employee_price: employeePrice,
      images: row.images ?? (row.image ? [row.image] : []),
      image_path: row.image_path ?? null,
      category: categoryName,
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

  /* ---------------- Produtos ---------------- */
  useEffect(() => {
    let isMounted = true;

    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setProducts(parsed);
            setLoading(false);
            hasLoadedFromCache.current = true;
          }
        }
      } catch (err) {
        console.error("Erro ao ler cache de produtos:", err);
      }
    }

    async function loadProducts() {
      try {
        if (!hasLoadedFromCache.current) setLoading(true);

        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("name", { ascending: true });

        if (error) {
          if (isMounted) setLoadError(error.message);
          return;
        }

        if (isMounted && data) {
          const mapped: Product[] = (data as any[]).map(mapRowToProduct);

          setProducts(mapped);

          try {
            localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(mapped));
          } catch (err) {
            console.error("Erro ao salvar cache de produtos:", err);
          }
        }
      } catch (err: any) {
        if (isMounted) setLoadError(String(err?.message ?? err));
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProducts();
    return () => {
      isMounted = false;
    };
     
  }, []);

  /* ---------------- Destaques: modo (auto/manual) ---------------- */
  useEffect(() => {
    let mounted = true;

    async function loadFeaturedMode() {
      try {
        const { data, error } = await supabase
          .from("carousel_settings")
          .select("mode")
          .eq("id", 1)
          .maybeSingle();

        if (!mounted) return;

        if (error) {
          setFeaturedMode("auto");
          return;
        }

        setFeaturedMode(((data?.mode as CarouselMode) || "auto") as CarouselMode);
      } catch {
        if (!mounted) return;
        setFeaturedMode("auto");
      }
    }

    loadFeaturedMode();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------------- Destaques: lista ---------------- */
  useEffect(() => {
    let mounted = true;

    async function loadFeatured() {
      setFeaturedLoading(true);

      try {
        // ✅ MANUAL (CORRIGIDO): sem JOIN, igual à tela de /destaques
        if (featuredMode === "manual") {
          const { data: rows, error: err1 } = await supabase
            .from("featured_products")
            .select("position, product_id, active")
            .eq("active", true)
            .order("position", { ascending: true })
            .limit(5);

          if (!mounted) return;

          if (!err1 && rows && rows.length > 0) {
            const ordered = (rows as any[])
              .filter((r) => r?.product_id)
              .map((r) => ({ position: r.position, product_id: r.product_id }));

            const ids = ordered.map((r) => r.product_id);

            const { data: prods, error: err2 } = await supabase
              .from("products")
              .select("*")
              .in("id", ids);

            if (!mounted) return;

            if (!err2 && prods && prods.length > 0) {
              const byId = new Map<string, any>();
              (prods as any[]).forEach((p) => byId.set(String(p.id), p));

              const mappedManual = ordered
                .map((r) => byId.get(String(r.product_id)))
                .filter(Boolean)
                .map(mapRowToProduct);

              if (mappedManual.length > 0) {
                setFeaturedProducts(mappedManual);
                setFeaturedLoading(false);
                return; // 🔴 impede cair no AUTO
              }
            }
          }
        }

        // ✅ AUTO: funciona mesmo se "products" ainda não carregou
        const { data: topData } = await supabase.rpc("get_top_selling_products", {
          limit_count: 5,
        });

        if (!mounted) return;

        const rows = (topData as TopSellingRow[]) ?? [];
        const byId = new Map((products ?? []).map((p) => [String(p.id), p]));

        const mappedAuto: Product[] = rows
          .map((r) => {
            const local = byId.get(String(r.product_id));
            if (local) return local;

            return {
              id: r.product_id as any,
              old_id: null,
              name: r.product_name,
              price: 0,
              employee_price: 0,
              images: [],
              image_path: r.image_path ?? null,
              category: "Outros",
              description: "",
              packageInfo: "",
              weight: 0,
              isPackage: false,
              featured: false,
              inStock: true,
              isLaunch: false,
              extraInfo: undefined,
            } as Product;
          })
          .slice(0, 5);

        setFeaturedProducts(mappedAuto);
      } catch (e) {
        console.error("Erro ao carregar destaques:", e);
      } finally {
        if (mounted) setFeaturedLoading(false);
      }
    }

    loadFeatured();
    return () => {
      mounted = false;
    };
  }, [featuredMode, products]);

  /* ---------------- Avisos ---------------- */
  useEffect(() => {
    let isMounted = true;

    async function loadNotices() {
      setNoticesLoading(true);
      try {
        const { data, error } = await supabase
          .from("notices")
          .select("id, title, body, created_at, is_published, image_url")
          .eq("is_published", true)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Erro carregando avisos:", error);
          return;
        }

        if (isMounted && data) {
          setNotices(
            (data as any[]).map((n: any) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              created_at: n.created_at,
              image_url: n.image_url ?? null,
            }))
          );
        }
      } catch (err) {
        console.error("Erro inesperado ao carregar avisos:", err);
      } finally {
        if (isMounted) setNoticesLoading(false);
      }
    }

    loadNotices();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (notices.length <= 1) {
      setCurrentNoticeIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setCurrentNoticeIndex((prev) => (prev + 1) % notices.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [notices]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));

    const list = Array.from(set);
    if (!list.length) return ORDERED_CATEGORIES;

    list.sort((a, b) => {
      const ia = ORDERED_CATEGORIES.indexOf(a as any);
      const ib = ORDERED_CATEGORIES.indexOf(b as any);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return list;
  }, [products]);

  const filtered = products.filter((p) => {
    const termNorm = normalizeForSearch(debouncedSearchTerm).trim();
    const globalSearchActive = !!termNorm;

    const nameNorm = normalizeForSearch(p.name);
    const idNorm = normalizeForSearch(String(p.id));
    const oldIdNorm =
      p.old_id !== undefined && p.old_id !== null
        ? normalizeForSearch(String(p.old_id))
        : "";

    const matchesSearch =
      !globalSearchActive ||
      nameNorm.includes(termNorm) ||
      idNorm.includes(termNorm) ||
      (oldIdNorm && oldIdNorm.includes(termNorm));

    const productCategoryName = p.category || "";
    const catNorm = normalizeForSearch(productCategoryName);
    const selectedCatNorm =
      selectedCategory === "all" ? "" : normalizeForSearch(selectedCategory);

    let matchesCategory = true;
    if (!globalSearchActive) {
      matchesCategory =
        selectedCategory === "all" ||
        (selectedCatNorm !== "" && catNorm === selectedCatNorm);
    }

    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = useMemo(
    () =>
      filtered.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
      ),
    [filtered, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, selectedCategory]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const goTo = (path: string) => {
    if (path === "/catalogo") window.location.href = "/catalogo";
    else navigate(path);
    setMenuOpen(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("employee_session");
    setMenuOpen(false);
    navigate("/login", { replace: true });
  };

  /* ---------------- mobile + search (FIX DO "SALTO") ---------------- */
  useEffect(() => {
    const updateIsMobile = () => setIsMobile(window.innerWidth < 768);

    const updateSearchOffset = () => {
      const el = searchBarContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      // top absoluto (document)
      searchBarOffsetRef.current = rect.top + window.scrollY;
    };

    updateIsMobile();

    // ✅ mede várias vezes no início pra pegar carregamentos (hero/destaques/imagens)
    const raf1 = requestAnimationFrame(() => updateSearchOffset());
    const raf2 = requestAnimationFrame(() =>
      requestAnimationFrame(() => updateSearchOffset())
    );
    const t1 = window.setTimeout(() => updateSearchOffset(), 150);
    const t2 = window.setTimeout(() => updateSearchOffset(), 600);

    const handleResize = () => {
      updateIsMobile();
      updateSearchOffset();
    };

    window.addEventListener("resize", handleResize);

    // ✅ Recalcula quando QUALQUER coisa muda a altura da página
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        // evita recalcular no meio do layout thrash
        requestAnimationFrame(() => updateSearchOffset());
      });
      // body pega mudanças do hero/carrossel/imagens acima do catálogo
      ro.observe(document.body);
    }

    // também quando terminar de carregar a página
    window.addEventListener("load", updateSearchOffset);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("load", updateSearchOffset);
      ro?.disconnect();
    };
  }, []);

  // ✅ também recalcula quando avisos/carrossel mudam (garante)
  useEffect(() => {
    const el = searchBarContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      searchBarOffsetRef.current = rect.top + window.scrollY;
    });
  }, [notices.length, currentNoticeIndex, featuredLoading, featuredMode]);

  useEffect(() => {
    const handleScroll = () => {
      if (!isMobile) {
        setHideHeader(false);
        return;
      }
      if (searchBarOffsetRef.current == null) {
        setHideHeader(false);
        return;
      }

      // ✅ use o MESMO "top" que você usa no sticky (top-24)
      const HEADER_HEIGHT = 96; // corresponde ao header fixo
      const threshold = Math.max(0, searchBarOffsetRef.current - HEADER_HEIGHT);

      // 🔥 Agora só some quando REALMENTE encostar
      if (window.scrollY >= threshold) setHideHeader(true);
      else setHideHeader(false);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // roda uma vez pra sincronizar
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile]);

  const hasNotices = notices.length > 0;
  const currentNotice = hasNotices ? notices[currentNoticeIndex] : null;
  const showNoticeHero = !!currentNotice;
  const hasNoticeImage = !!currentNotice?.image_url;

  const changePage = (nextPage: number) => {
    const p = Math.max(1, Math.min(totalPages, nextPage));
    setCurrentPage(p);
    requestAnimationFrame(() => scrollToCatalogTop(catalogRef));
  };

  /**
   * ✅ Padroniza SOMENTE a imagem do ProductCard DENTRO DO CARROSSEL
   * - Mobile: mais destaque pra imagem (object-cover + altura maior)
   * - Desktop: mantém o comportamento atual (object-contain)
   */
  const featuredCards = useMemo(() => {
    if (!featuredProducts.length) return [];

    return featuredProducts.map((p) => (
      <div
        key={String(p.id)}
        data-featured-card="true"
        className={`
          w-[300px] md:w-[340px]
          shrink-0

          /* Wrapper do card (mobile) — "não lavado" e mais destaque */
          [&_[data-card]]:bg-white
          [&_[data-card]]:shadow-[0_10px_24px_rgba(0,0,0,0.10)]
          [&_[data-card]]:border-gray-200/80
          md:[&_[data-card]]:shadow-none

          /* Imagem do card */
          [&_button[aria-label^='Imagem do produto']]:w-full
          [&_button[aria-label^='Imagem do produto']]:h-[190px]
          [&_button[aria-label^='Imagem do produto']]:rounded-2xl
          [&_button[aria-label^='Imagem do produto']]:overflow-hidden
          md:[&_button[aria-label^='Imagem do produto']]:h-[190px]

          /* Mobile = cover (mais impacto), Desktop = contain (como era) */
          [&_button[aria-label^='Imagem do produto']_img]:w-full
          [&_button[aria-label^='Imagem do produto']_img]:h-full
          [&_button[aria-label^='Imagem do produto']_img]:object-cover
          md:[&_button[aria-label^='Imagem do produto']_img]:object-contain
        `}
      >
        <ProductCard product={p} hideImages={lightMode} />
      </div>
    ));
  }, [featuredProducts, lightMode]);

  /* --------------------------------------------------------
     Overlay loading: aparece no 1º carregamento "de verdade"
     - se veio do cache: mostra rapidinho só pra não piscar feio
  -------------------------------------------------------- */
  useEffect(() => {
    const allDone = !loading && !featuredLoading && !noticesLoading;
    if (!firstPaintDone.current) {
      // segura pelo menos 250ms pra dar "feel" de carregamento
      if (allDone) {
        const t = window.setTimeout(() => {
          setOverlayLoading(false);
          firstPaintDone.current = true;
        }, hasLoadedFromCache.current ? 180 : 320);
        return () => clearTimeout(t);
      } else {
        setOverlayLoading(true);
      }
    } else {
      // depois do primeiro load, não força overlay de novo
      if (allDone) setOverlayLoading(false);
    }
  }, [loading, featuredLoading, noticesLoading]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-20 md:pb-0">
      {/* ✅ LOADING OVERLAY */}
      <UiverseLoading show={overlayLoading} />

      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, #e53935, #e53935aa, transparent)",
        }}
      />

      {/* HEADER */}
      <header
        className={`
          fixed top-0 left-0 right-0 z-40
          bg-red-600/90 backdrop-blur-md
          border-b border-red-800/40
          text-white
          py-5
          transition-all duration-300
          ${
            isMobile && hideHeader
              ? "opacity-0 -translate-y-3 pointer-events-none"
              : "opacity-100 translate-y-0"
          }
        `}
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
                {displayName}{" "}
                {isAdmin && (
                  <span className="text-[11px] opacity-80 ml-1">(Admin)</span>
                )}
              </span>

              {/* ✅ SALDO (IGUAL AO CARRINHO) */}
              <span className="text-[12px] opacity-90">
                Saldo:{" "}
                <b className="opacity-100">
                  {walletLoading
                    ? "—"
                    : walletAvailableCents !== null
                    ? formatBRLFromCents(walletAvailableCents)
                    : "—"}
                </b>
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

      {/* MODO LEVE */}
      <div className="pt-[88px]">
        <div className="container mx-auto px-4">
          <div className="flex justify-end py-1">
            <div className="flex items-center gap-2 rounded-full border bg-white/95 backdrop-blur-md px-3 py-2 shadow-lg">
              <Switch
                checked={lightMode}
                onCheckedChange={setLightMode}
                aria-label="Ativar modo leve"
              />
              <span className="text-sm font-medium text-gray-900">Modo leve</span>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setLightInfoOpen(true)}
                className="h-9 w-9 opacity-50 hover:opacity-80"
                aria-label="Informações sobre o modo leve"
                title="Para que serve o modo leve?"
              >
                <Info className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* OVERLAY MENU */}
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

      {/* DRAWER */}
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
              Menu do catálogo
            </span>
            <span className="text-sm font-semibold truncate max-w-[150px]">
              {displayName}
            </span>
          </div>

          <button
            onClick={() => setMenuOpen(false)}
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
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
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
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

          {/* ✅ DESTAQUES (só admin) — FIX: centraliza de verdade o SVG na bolinha */}
          {isAdmin && (
            <button
              onClick={() => goTo("/destaques")}
              className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 text-gray-800"
            >
              {/* TROCA flex -> grid + svg block (remove baseline/inline) */}
              <span className="grid h-8 w-8 place-items-center rounded-full bg-red-100">
                <Star className="h-4 w-4 text-red-600 block" />
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
      <main className="flex-1 container mx-auto px-4 py-4">
        {loadError && (
          <p className="mb-4 text-center text-red-600">Erro: {loadError}</p>
        )}

        {/* HERO */}
        <section className="mb-6 relative">
          <div
            className={`
              relative overflow-hidden rounded-3xl min-h-[280px] md:min-h-[380px]
              flex items-stretch shadow-lg md:shadow-xl shadow-black/15
              ${
                (hasNotices ? true : false) && !((hasNotices ? notices[currentNoticeIndex] : null)?.image_url)
                  ? "bg-gray-100 border border-gray-300"
                  : ""
              }
            `}
            style={
              (hasNotices ? notices[currentNoticeIndex] : null)
                ? (hasNotices ? notices[currentNoticeIndex] : null)?.image_url
                  ? {
                      backgroundImage: `url('${
                        (hasNotices ? notices[currentNoticeIndex] : null)!.image_url
                      }')`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : {}
                : {
                    backgroundImage: "url('/products/10034.jpg')",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
            }
          >
            {!((hasNotices ? notices[currentNoticeIndex] : null) != null) && (
              <div className="absolute inset-0 bg-red-900/70" />
            )}

            <div className="relative z-10 w-full px-6 py-8 md:px-10 md:py-10 flex items-start">
              {((hasNotices ? notices[currentNoticeIndex] : null) != null) ? (
                (hasNotices ? notices[currentNoticeIndex] : null)!.image_url ? (
                  <div className="relative flex flex-col justify-between h-full max-w-xl text-white drop-shadow-md">
                    <div className="mt-1">
                      <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
                        {(hasNotices ? notices[currentNoticeIndex] : null)!.title}
                      </h2>
                    </div>

                    <button
                      onClick={() => navigate("/avisos")}
                      className="mt-6 inline-flex items-center px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-sm text-sm font-semibold hover:bg-black/55 transition self-start"
                    >
                      Ver mais
                    </button>
                  </div>
                ) : (
                  <div className="max-w-xl">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500 mb-2">
                      Avisos internos Gostinho Mineiro
                    </p>
                    <div className="border-l-4 border-red-500 pl-4">
                      <h2 className="text-3xl md:text-4xl font-extrabold leading-tight text-red-700">
                        {(hasNotices ? notices[currentNoticeIndex] : null)!.title}
                      </h2>
                      <p className="mt-3 text-sm md:text-base text-gray-700">
                        {(hasNotices ? notices[currentNoticeIndex] : null)!.body}
                      </p>
                      <button
                        onClick={() => navigate("/avisos")}
                        className="mt-6 inline-flex items-center px-6 py-3 rounded-full bg-red-600 text-white font-semibold shadow-md hover:bg-red-700 transition"
                      >
                        Ver detalhes dos avisos
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="w-full flex items-center justify-center">
                  <div className="max-w-2xl text-center text-white flex flex-col items-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-100 mb-2">
                      Catálogo interno para funcionários
                    </p>

                    <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
                      Produtos Gostinho Mineiro
                    </h2>

                    <p className="text-sm md:text-base text-red-100 mt-3">
                      Consulte produtos, embalagens e valores especiais de forma
                      rápida e organizada. Uso exclusivo para colaboradores.
                    </p>

                    <button
                      onClick={() =>
                        catalogRef.current?.scrollIntoView({ behavior: "smooth" })
                      }
                      className="mt-6 inline-flex items-center justify-center px-6 py-3 rounded-full bg-white text-red-700 font-semibold shadow-md hover:bg-gray-100 transition"
                    >
                      Ver catálogo de produtos
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {((hasNotices ? notices[currentNoticeIndex] : null) != null) && notices.length > 1 && (
            <>
              <button
                onClick={() =>
                  setCurrentNoticeIndex(
                    (prev) => (prev - 1 + notices.length) % notices.length
                  )
                }
                className="flex items-center justify-center absolute left-2 md:-left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full bg-white shadow border border-red-100 hover:bg-red-50 transition"
              >
                <ChevronLeft className="h-5 w-5 text-red-600" />
              </button>
              <button
                onClick={() =>
                  setCurrentNoticeIndex((prev) => (prev + 1) % notices.length)
                }
                className="flex items-center justify-center absolute right-2 md:-right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 md:w-10 md:h-10 rounded-full bg-white shadow border border-red-100 hover:bg-red-50 transition"
              >
                <ChevronRight className="h-5 w-5 text-red-600" />
              </button>
            </>
          )}
        </section>

        {/* ✅ DESTAQUES */}
        {featuredLoading ? (
          <div
            className="
              mb-6 rounded-2xl border px-4 py-4 text-sm text-gray-600 flex items-center gap-2
              bg-white
              md:bg-white/60 md:backdrop-blur-md
            "
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
              ★
            </span>
            Carregando destaques...
          </div>
        ) : featuredCards.length ? (
          <div className="mb-7 gm-featured">
            <FeaturedProductsCarousel
              title="Produtos em destaque"
              items={featuredCards}
              speedPxPerSec={22}
              itemMinWidth={340}
              gap={20}
              className="md:mt-1"
            />
          </div>
        ) : null}

        {/* CATÁLOGO */}
        <section ref={catalogRef} className="mt-4">
          <div
            ref={searchBarContainerRef}
            className={`
              z-30 bg-gray-50/95 backdrop-blur-md pb-3 transition-all duration-300
              ${
                isMobile
                  ? hideHeader
                    ? "fixed top-0 left-0 right-0 shadow-md"
                    : "sticky top-24"
                  : "sticky top-24"
              }
            `}
          >
            <div className="relative">
              <SearchBar
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                selectedCategory={selectedCategory}
                setSelectedCategory={handleSelectCategory}
                categories={categories}
              />

              <button
                type="button"
                onClick={handleClearSearch}
                className={`
                  absolute right-4
                  top-[18px]
                  h-9 w-9 rounded-full
                  bg-white/90 backdrop-blur
                  border border-gray-200
                  shadow-sm
                  flex items-center justify-center
                  hover:bg-gray-50 active:scale-95
                  z-40
                  ${searchTerm.trim().length ? "opacity-100" : "opacity-60"}
                `}
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>

          {isMobile && hideHeader && <div className="h-[108px]" />}

          <div className="flex items-center justify-between mt-4 mb-4">
            <h2 className="text-xl font-bold">Produtos</h2>
            {!loading && (
              <p className="text-xs text-gray-500">
                Exibindo {paginated.length} de {filtered.length} produtos
              </p>
            )}
          </div>

          {loading && !products.length ? (
            <ProductGridSkeleton />
          ) : filtered.length === 0 ? (
            <p className="text-gray-500">Nenhum produto encontrado.</p>
          ) : (
            <>
              <div className="mb-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(p) => changePage(p)}
                  onPrev={() => changePage(currentPage - 1)}
                  onNext={() => changePage(currentPage + 1)}
                />
              </div>

              <div
                className={`
                  grid gap-4
                  ${
                    lightMode
                      ? "grid-cols-1 md:grid-cols-3 lg:grid-cols-4"
                      : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  }
                `}
              >
                <AnimatePresence mode="popLayout">
                  {paginated.map((p) => (
                    <motion.div
                      key={String(p.id)}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <ProductCard product={p} hideImages={lightMode} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-6">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(p) => changePage(p)}
                  onPrev={() => changePage(currentPage - 1)}
                  onNext={() => changePage(currentPage + 1)}
                />
              </div>
            </>
          )}
        </section>
      </main>

      <BottomNav noticeCount={notices.length} />
      <Footer />
      <CartToggle />
      <Cart />

      <Dialog open={lightInfoOpen} onOpenChange={setLightInfoOpen}>
        <DialogContent className="max-w-[92vw] sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Modo leve (sem imagens)</DialogTitle>
            <DialogDescription>
              Esse modo deixa o catálogo mais rápido e econômico no celular.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm text-gray-700">
            <div className="rounded-xl border bg-gray-50 p-3">
              <p className="font-semibold text-gray-900">Pra que serve?</p>
              <p className="mt-1">
                Quando ativado, o catálogo <b>oculta as imagens</b> dos produtos,
                reduzindo o peso da página.
              </p>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <p className="font-semibold text-gray-900">Vantagens</p>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Carrega mais rápido no 4G / internet lenta</li>
                <li>Economiza dados (menos consumo de internet)</li>
                <li>Ajuda a evitar travamentos em celulares mais simples</li>
                <li>Facilita procurar e pedir rápido</li>
              </ul>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <p className="font-semibold text-gray-900">Quando usar?</p>
              <p className="mt-1">
                Se as fotos estiverem demorando pra carregar, ou se você estiver
                em uma rede ruim. Você pode desligar a qualquer momento.
              </p>
            </div>
          </div>

          <div className="mt-2 flex justify-end">
            <Button
              onClick={() => setLightInfoOpen(false)}
              className="rounded-full"
            >
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* --------------------------------------------------------
   FOOTER (padrão)
-------------------------------------------------------- */
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
  "©️ 2025 Catálogo Interativo para funcionários desenvolvido por Winiston Alle & Mateus Borges";

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

export default Index;
