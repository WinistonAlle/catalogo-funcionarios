import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import FeaturedProductsCarousel from "@/components/FeaturedProductsCarousel";
import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import logoGostinho from "@/images/logoc.png";

import {
  Home,
  Bell,
  ClipboardList,
  Heart,
  LogOut,
  PenSquare,
  Users,
  BarChart2,
  Star,
  Search,
  Facebook,
  Instagram,
  Youtube,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Eye,
  GripVertical,
} from "lucide-react";

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

function normalizeForSearch(text: string) {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

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

/* --------------------------------------------------------
   TYPES
-------------------------------------------------------- */
type CarouselMode = "auto" | "manual";

type ProductLite = {
  id: string;
  name: string;
  image_path?: string | null;
  images?: string[] | null;
  price?: number | null;
  employee_price?: number | null;
  unit?: string | null;
  category?: string | null;
};

type TopProduct = {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_value: number;
  image_path: string | null;
};

type FeaturedPosRow = {
  position: number;
  product_id: string;
  active: boolean;
};

/* --------------------------------------------------------
   BOTTOM NAV (mobile)
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
   FOOTER
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

const Footer: React.FC = () => (
  <footer className="bg-gray-100 pt-4 pb-24 md:pb-3 border-t border-gray-200">
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
        <p className="text-xs text-gray-600">
          © 2025 Catálogo Interativo para funcionários desenvolvido por{" "}
          <b>Winiston Alle</b> & <b>Mateus Borges</b>
        </p>
      </div>
    </div>
  </footer>
);

/* --------------------------------------------------------
   UI HELPERS
-------------------------------------------------------- */
function ImgThumb({ src }: { src?: string | null }) {
  if (!src) {
    return (
      <div className="h-14 w-14 rounded-xl bg-gray-100 border flex items-center justify-center text-gray-400 text-xs">
        —
      </div>
    );
  }
  return (
    <div className="h-14 w-14 rounded-xl bg-white border overflow-hidden">
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
      />
    </div>
  );
}

function Banner({
  tone,
  title,
  description,
  onClose,
}: {
  tone: "warn" | "success" | "info";
  title: string;
  description?: string;
  onClose?: () => void;
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-blue-200 bg-blue-50 text-blue-900";

  const Icon =
    tone === "warn" ? AlertTriangle : tone === "success" ? CheckCircle2 : Eye;

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-5 w-5 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold whitespace-pre-line">{title}</div>
          {description ? (
            <div className="text-xs opacity-90 mt-0.5 whitespace-pre-line">
              {description}
            </div>
          ) : null}
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-white/60 border hover:bg-white transition flex items-center justify-center"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------
   PAGE
-------------------------------------------------------- */
const Destaques: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const employee: any = safeGetEmployee();
  const isAdmin =
    employee?.is_admin ||
    employee?.role === "admin" ||
    employee?.tipo === "ADMIN";
  const isRH =
    employee?.is_rh || employee?.role === "rh" || employee?.setor === "RH";

  const displayName = employee?.full_name ?? employee?.name ?? "Funcionário";

  const LIMIT = 5;

  const [mode, setMode] = useState<CarouselMode>("auto");
  const [savingMode, setSavingMode] = useState(false);
  const [modeSaved, setModeSaved] = useState(false);

  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);

  const [products, setProducts] = useState<ProductLite[]>([]);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);

  const [query, setQuery] = useState("");

  const [manualSelected, setManualSelected] = useState<ProductLite[]>([]);
  const [savingManual, setSavingManual] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);
  const [manualLoadingSaved, setManualLoadingSaved] = useState(false);

  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  // drag & drop
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // preview
  const [showPreview, setShowPreview] = useState(true);

  // storage check
  const [manualStorageOk, setManualStorageOk] = useState(true);

  useEffect(() => {
    const sess = localStorage.getItem("employee_session");
    if (!sess) navigate("/login", { replace: true });
    if (!isAdmin) navigate("/catalogo", { replace: true });
  }, [isAdmin, navigate]);

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

  /* -------- LOAD MODE (carousel_settings) -------- */
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const { data } = await supabase
          .from("carousel_settings")
          .select("mode")
          .eq("id", 1)
          .maybeSingle();

        if (!mounted) return;
        const m = (data?.mode as CarouselMode) || "auto";
        setMode(m);
      } catch {
        // ok
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  /* -------- AUTOMÁTICO -------- */
  async function loadTopSelling() {
    setAutoLoading(true);
    try {
      const { data } = await supabase.rpc("get_top_selling_products", {
        limit_count: LIMIT,
      });
      setTopProducts((data as TopProduct[]) ?? []);
    } finally {
      setAutoLoading(false);
    }
  }

  /* -------- MANUAL: verifica se tabela existe/acessível -------- */
  async function checkManualStorage() {
    const { error } = await supabase
      .from("featured_products")
      .select("position")
      .limit(1);

    if (error) {
      setManualStorageOk(false);
      setValidationMsg(
        `O modo manual não consegue salvar/carregar porque a tabela "featured_products" não está acessível ou não existe.\n` +
          `Erro: ${error.message}\n` +
          `→ Crie a tabela no Supabase ou ajuste o nome da tabela no código.`
      );
      return false;
    }

    setManualStorageOk(true);
    return true;
  }

  /* -------- MANUAL: carregar lista de produtos -------- */
  async function loadProducts() {
    setProductsError(null);
    setProductsLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    setProductsLoading(false);

    if (error) {
      console.error("Erro loadProducts:", error);
      setProducts([]);
      setProductsError(error.message);
      return;
    }

    const mapped: ProductLite[] = ((data as any[]) ?? []).map((row: any) => {
      const categoryName =
        CATEGORY_NAME_BY_ID[row.category_id as number] ??
        row.category ??
        row.category_name ??
        "Outros";

      const imagesArr: string[] =
        (Array.isArray(row.images) ? row.images : null) ??
        (row.image ? [row.image] : []);

      return {
        id: String(row.id),
        name: row.name ?? "",
        image_path: row.image_path ?? null,
        images: imagesArr,
        price: Number(row.price ?? 0),
        employee_price: Number(row.employee_price ?? row.price ?? 0),
        unit: row.unit ?? row.unidade ?? null,
        category: categoryName,
      };
    });

    setProducts(mapped);
  }

  /* -------- MANUAL: carregar seleção salva (sem join) -------- */
  async function loadManualSaved() {
    setManualLoadingSaved(true);
    try {
      const { data: rows, error: err1 } = await supabase
        .from("featured_products")
        .select("position, product_id, active")
        .eq("active", true)
        .order("position", { ascending: true })
        .limit(LIMIT);

      if (err1) {
        console.error("Erro loadManualSaved (step1):", err1);
        return;
      }

      const ordered = ((rows as FeaturedPosRow[]) ?? []).filter(Boolean);
      if (!ordered.length) return;

      const ids = ordered.map((r) => r.product_id).filter(Boolean);
      if (!ids.length) return;

      const { data: prods, error: err2 } = await supabase
        .from("products")
        .select("*")
        .in("id", ids);

      if (err2) {
        console.error("Erro loadManualSaved (step2):", err2);
        return;
      }

      const mapById = new Map<string, any>();
      (prods as any[] | null | undefined)?.forEach((p) =>
        mapById.set(String(p.id), p)
      );

      const mappedOrdered: ProductLite[] = ordered
        .map((r) => {
          const row = mapById.get(String(r.product_id));
          if (!row) return null;

          const categoryName =
            CATEGORY_NAME_BY_ID[row.category_id as number] ??
            row.category ??
            row.category_name ??
            "Outros";

          const imagesArr: string[] =
            (Array.isArray(row.images) ? row.images : null) ??
            (row.image ? [row.image] : []);

          return {
            id: String(row.id),
            name: row.name ?? "",
            image_path: row.image_path ?? null,
            images: imagesArr,
            price: Number(row.price ?? 0),
            employee_price: Number(row.employee_price ?? row.price ?? 0),
            unit: row.unit ?? row.unidade ?? null,
            category: categoryName,
          } as ProductLite;
        })
        .filter(Boolean) as ProductLite[];

      if (mappedOrdered.length > 0) {
        setManualSelected(mappedOrdered);
        setManualSaved(true);
        setTimeout(() => setManualSaved(false), 1200);
      }
    } finally {
      setManualLoadingSaved(false);
    }
  }

  const filteredProducts = useMemo(() => {
    const q = normalizeForSearch(query);
    if (!q) return products.slice(0, 120);

    return products
      .filter((p) => {
        const name = normalizeForSearch(p.name);
        const id = normalizeForSearch(String(p.id));
        const cat = normalizeForSearch(p.category ?? "");
        const unit = normalizeForSearch(p.unit ?? "");
        return (
          name.includes(q) ||
          id.includes(q) ||
          cat.includes(q) ||
          unit.includes(q)
        );
      })
      .slice(0, 200);
  }, [products, query]);

  function addManual(p: ProductLite) {
    setValidationMsg(null);
    setManualSaved(false);

    setManualSelected((prev) => {
      if (prev.length >= LIMIT) return prev;
      if (prev.some((x) => x.id === p.id)) return prev;
      return [...prev, p];
    });
  }

  function removeManual(id: string) {
    setValidationMsg(null);
    setManualSaved(false);
    setManualSelected((prev) => prev.filter((p) => p.id !== id));
  }

  /* ---------------- DRAG & DROP (Selected) ---------------- */
  function reorder(list: ProductLite[], fromId: string, toId: string) {
    const fromIndex = list.findIndex((p) => p.id === fromId);
    const toIndex = list.findIndex((p) => p.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;

    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function onDragStart(id: string) {
    setDragId(id);
    setDragOverId(null);
    setManualSaved(false);
  }

  function onDragEnter(id: string) {
    if (!dragId) return;
    if (id === dragId) return;
    setDragOverId(id);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDrop() {
    if (!dragId || !dragOverId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    setManualSelected((prev) => reorder(prev, dragId, dragOverId));
    setDragId(null);
    setDragOverId(null);
  }

  function onDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  async function saveMode() {
    setSavingMode(true);
    try {
      await supabase
        .from("carousel_settings")
        .upsert({ id: 1, mode }, { onConflict: "id" });
      setModeSaved(true);
      setTimeout(() => setModeSaved(false), 2000);
    } finally {
      setSavingMode(false);
    }
  }

  /* -------- SALVAR MANUAL -------- */
  async function saveManual() {
    setValidationMsg(null);

    if (!(await checkManualStorage())) return;

    if (manualSelected.length !== LIMIT) {
      const falta = LIMIT - manualSelected.length;
      setValidationMsg(
        falta > 0
          ? `Faltam ${falta} produto(s) para completar os ${LIMIT}.`
          : `Você selecionou mais de ${LIMIT} produtos.`
      );
      return;
    }

    setSavingManual(true);
    try {
      // desativa atuais
      const { error: errDisable } = await supabase
        .from("featured_products")
        .update({ active: false })
        .neq("active", false);

      if (errDisable) throw errDisable;

      const payload = manualSelected.map((p, idx) => ({
        position: idx + 1,
        product_id: p.id,
        active: true,
      }));

      // tenta upsert por position
      const { error: errUpsert } = await supabase
        .from("featured_products")
        .upsert(payload, { onConflict: "position" });

      if (errUpsert) {
        // fallback: limpa posições 1..5 e insere
        const { error: errDelete } = await supabase
          .from("featured_products")
          .delete()
          .in("position", [1, 2, 3, 4, 5]);

        if (errDelete) throw errUpsert;

        const { error: errInsert } = await supabase
          .from("featured_products")
          .insert(payload);

        if (errInsert) throw errInsert;
      }

      setManualSaved(true);
      setTimeout(() => setManualSaved(false), 2000);

      await loadManualSaved();
    } catch (e: any) {
      console.error("Erro saveManual:", e);
      setValidationMsg(
        e?.message
          ? `Não foi possível salvar: ${e.message}`
          : "Não foi possível salvar as escolhas."
      );
    } finally {
      setSavingManual(false);
    }
  }

  useEffect(() => {
    if (mode === "auto") loadTopSelling();

    if (mode === "manual") {
      checkManualStorage();
      loadProducts();
      loadManualSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const previewItems = useMemo(() => {
    if (!manualSelected.length) return [];

    return manualSelected.map((p) => {
      const productForCard: any = {
        id: p.id,
        name: p.name,
        price: Number(p.employee_price ?? p.price ?? 0),
        employee_price: Number(p.employee_price ?? p.price ?? 0),
        images: p.images ?? [],
        image_path: p.image_path ?? null,
        category: p.category ?? "Outros",
        description: "",
        packageInfo: "",
        weight: 0,
        isPackage: false,
        featured: true,
        inStock: true,
        isLaunch: false,
      };

      return (
        <div
          key={p.id}
          className={`
            w-[300px] md:w-[340px] shrink-0
            [&_button[aria-label^='Imagem do produto']]:w-full
            [&_button[aria-label^='Imagem do produto']]:h-[170px]
            [&_button[aria-label^='Imagem do produto']]:rounded-xl
            [&_button[aria-label^='Imagem do produto']]:overflow-hidden
            md:[&_button[aria-label^='Imagem do produto']]:h-[190px]
            [&_button[aria-label^='Imagem do produto']_img]:w-full
            [&_button[aria-label^='Imagem do produto']_img]:h-full
            [&_button[aria-label^='Imagem do produto']_img]:object-contain
          `}
        >
          <ProductCard product={productForCard} hideImages={false} />
        </div>
      );
    });
  }, [manualSelected]);

  const activeTab = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-20 md:pb-0">
      {/* Faixa por trás do header */}
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
              className="h-8 sm:h-9 md:h-10 w-auto object-contain select-none"
            />
          </button>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold hidden sm:block">
              {displayName}{" "}
              <span className="text-xs opacity-80">(Admin)</span>
            </span>

            {/* ✅ HAMBURGER IGUAL AO INDEX (animado) */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-red-300/50 bg-red-500/80"
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
          fixed inset-0 z-50 backdrop-blur-sm transition-opacity
          ${menuOpen ? "bg-black/30 opacity-100" : "opacity-0 pointer-events-none"}
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

          {/* ✅ fechar igual ao Index */}
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
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
              activeTab("/catalogo")
                ? "bg-red-50 text-red-700 font-semibold"
                : "text-gray-800"
            }`}
          >
            <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <Home className="h-4 w-4 text-red-600" />
            </span>
            Catálogo
          </button>

          {/* 2) Alertas */}
          <button
            onClick={() => goTo("/avisos")}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
              activeTab("/avisos")
                ? "bg-red-50 text-red-700 font-semibold"
                : "text-gray-800"
            }`}
          >
            <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <Bell className="h-4 w-4 text-red-600" />
            </span>
            Alertas
          </button>

          {/* 3) Favoritos */}
          <button
            onClick={() => goTo("/favoritos")}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
              activeTab("/favoritos")
                ? "bg-red-50 text-red-700 font-semibold"
                : "text-gray-800"
            }`}
          >
            <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <Heart className="h-4 w-4 text-red-600" />
            </span>
            Favoritos
          </button>

          {/* 4) Pedidos */}
          <button
            onClick={() => goTo("/meus-pedidos")}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
              activeTab("/meus-pedidos")
                ? "bg-red-50 text-red-700 font-semibold"
                : "text-gray-800"
            }`}
          >
            <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <ClipboardList className="h-4 w-4 text-red-600" />
            </span>
            Pedidos
          </button>

          {/* 5) Relatórios (Admin/RH) */}
          {(isAdmin || isRH) && (
            <button
              onClick={() => goTo("/relatorios")}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
                activeTab("/relatorios")
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-gray-800"
              }`}
            >
              <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <BarChart2 className="h-4 w-4 text-red-600" />
              </span>
              Relatórios
            </button>
          )}

          {/* 6) RH (RH) */}
          {isRH && (
            <button
              onClick={() => goTo("/rh")}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
                activeTab("/rh")
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-gray-800"
              }`}
            >
              <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <Users className="h-4 w-4 text-red-600" />
              </span>
              RH
            </button>
          )}

          {/* 7) Destaques (Admin) */}
          <button
            onClick={() => goTo("/destaques")}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
              activeTab("/destaques")
                ? "bg-red-50 text-red-700 font-semibold"
                : "text-gray-800"
            }`}
          >
            <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <Star className="h-4 w-4 text-red-600" />
            </span>
            Destaques
          </button>

          {/* 8) Pedidos (Admin) ✅ NOVO */}
          {isAdmin && (
            <button
              onClick={() => goTo("/admin/pedidos")}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
                activeTab("/admin/pedidos")
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-gray-800"
              }`}
            >
              <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <ClipboardList className="h-4 w-4 text-red-600" />
              </span>
              Pedidos (Admin)
            </button>
          )}

          {/* 9) Editar (Admin) */}
          {isAdmin && (
            <button
              onClick={() => goTo("/admin")}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 ${
                activeTab("/admin")
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-gray-800"
              }`}
            >
              <span className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                <PenSquare className="h-4 w-4 text-red-600" />
              </span>
              Editar
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
      <main className="flex-1 container mx-auto px-4 py-6 mt-20 pb-28">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="h-6 w-6 text-red-600" />
            Produtos em Destaque
          </h1>
        </div>

        {/* Tabs + Salvar modo */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Button
            onClick={() => setMode("auto")}
            variant={mode === "auto" ? "default" : "outline"}
            className={mode === "auto" ? "bg-red-600 text-white" : ""}
          >
            Automático
          </Button>

          <Button
            onClick={() => setMode("manual")}
            variant={mode === "manual" ? "default" : "outline"}
            className={mode === "manual" ? "bg-red-600 text-white" : ""}
          >
            Manual
          </Button>

          <Button
            onClick={saveMode}
            disabled={savingMode}
            className="ml-auto bg-red-600 text-white"
          >
            {savingMode ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </span>
            ) : modeSaved ? (
              <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Salvo
              </span>
            ) : (
              "Salvar modo"
            )}
          </Button>
        </div>

        {/* AUTO */}
        {mode === "auto" && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-semibold text-gray-900">
                  Top {LIMIT} produtos (vendas)
                </div>
                <div className="text-xs text-gray-500">
                  Essa lista vem do RPC <code>get_top_selling_products</code>.
                </div>
              </div>

              <Button
                variant="outline"
                onClick={loadTopSelling}
                disabled={autoLoading}
              >
                {autoLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Atualizando
                  </span>
                ) : (
                  "Atualizar"
                )}
              </Button>
            </div>

            {autoLoading ? (
              <div className="text-sm text-gray-600">Carregando...</div>
            ) : topProducts.length === 0 ? (
              <Banner
                tone="info"
                title="Nenhum dado retornado"
                description="O RPC não retornou produtos. Verifique se existem pedidos e itens para calcular o ranking."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {topProducts.map((p, i) => (
                  <div
                    key={p.product_id}
                    className="bg-gray-50 rounded-xl p-3 border flex items-center gap-3"
                  >
                    <div className="h-10 w-10 bg-red-100 rounded-full flex items-center justify-center font-bold text-red-700 shrink-0">
                      {i + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 truncate">
                        {p.product_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        Qtd vendida: <b>{p.total_quantity}</b>
                      </div>
                    </div>

                    <ImgThumb src={p.image_path} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MANUAL */}
        {mode === "manual" && (
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            {!manualStorageOk ? (
              <div className="mb-3">
                <Banner
                  tone="warn"
                  title="Modo manual sem armazenamento"
                  description={
                    validationMsg ??
                    'A tabela "featured_products" não está acessível. Crie a tabela no Supabase (SQL) ou ajuste o nome.'
                  }
                  onClose={() => setValidationMsg(null)}
                />
              </div>
            ) : null}

            {productsError ? (
              <div className="mb-3">
                <Banner
                  tone="warn"
                  title="Erro ao carregar produtos"
                  description={productsError}
                  onClose={() => setProductsError(null)}
                />
              </div>
            ) : null}

            {validationMsg && manualStorageOk ? (
              <div className="mb-3">
                <Banner
                  tone="warn"
                  title="Aviso"
                  description={validationMsg}
                  onClose={() => setValidationMsg(null)}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="text-sm text-gray-700">
                Selecionados:{" "}
                <b>
                  {manualSelected.length}/{LIMIT}
                </b>
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => setShowPreview((v) => !v)}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </Button>

                <Button
                  onClick={saveManual}
                  disabled={savingManual || !manualStorageOk}
                  className="bg-red-600 text-white"
                >
                  {savingManual ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </span>
                  ) : manualSaved ? (
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      Salvo
                    </span>
                  ) : (
                    "Salvar seleção"
                  )}
                </Button>
              </div>
            </div>

            {manualLoadingSaved ? (
              <div className="mb-4 text-sm text-gray-600 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando seleção salva...
              </div>
            ) : null}

            {/* Preview */}
            {showPreview && (
              <div className="mb-5">
                {manualSelected.length ? (
                  <>
                    <div className="mb-2">
                      <Banner
                        tone="info"
                        title="Preview do carrossel"
                        description="Simulação bem próxima de como ficará no catálogo."
                      />
                    </div>

                    <FeaturedProductsCarousel
                      title="Produtos em destaque (preview)"
                      items={previewItems}
                      speedPxPerSec={35}
                      itemMinWidth={340}
                      gap={20}
                    />
                  </>
                ) : (
                  <Banner
                    tone="info"
                    title="Preview do carrossel"
                    description="Adicione produtos abaixo para ver o preview aqui."
                  />
                )}
              </div>
            )}

            {/* Selecionados */}
            <div className="mb-2 text-xs text-gray-500">
              Dica: segure e arraste os itens para ordenar (drag & drop).
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              {manualSelected.length === 0 ? (
                <div className="text-sm text-gray-600">
                  Nenhum produto selecionado ainda. Adicione abaixo.
                </div>
              ) : (
                manualSelected.map((p, i) => {
                  const isOver = dragOverId === p.id && dragId !== p.id;

                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => onDragStart(p.id)}
                      onDragEnter={() => onDragEnter(p.id)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        onDragOver(e);
                      }}
                      onDrop={() => onDrop()}
                      onDragEnd={onDragEnd}
                      className={`
                        bg-gray-50 rounded-xl p-3 border flex items-center gap-3
                        cursor-grab active:cursor-grabbing transition
                        ${
                          isOver
                            ? "ring-2 ring-red-200 border-red-200 bg-red-50/30"
                            : ""
                        }
                      `}
                      title="Arraste para reordenar"
                    >
                      <div className="h-9 w-9 rounded-full bg-white border flex items-center justify-center font-bold text-gray-700 shrink-0">
                        {i + 1}
                      </div>

                      <div className="h-9 w-9 rounded-xl bg-white border flex items-center justify-center text-gray-500 shrink-0">
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <ImgThumb src={p.image_path} />

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {p.category ? `${p.category}` : "—"}
                          {p.unit ? ` • ${p.unit}` : ""}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        onClick={() => removeManual(p.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Validação bonita */}
            <div className="mt-4">
              {manualSelected.length === LIMIT ? (
                <Banner
                  tone="success"
                  title="Perfeito! Você selecionou 5 produtos."
                  description="Agora é só clicar em “Salvar seleção”."
                />
              ) : (
                <Banner
                  tone="warn"
                  title={`Selecione exatamente ${LIMIT} produtos para salvar.`}
                  description={
                    manualSelected.length < LIMIT
                      ? `Faltam ${LIMIT - manualSelected.length} produto(s).`
                      : `Você selecionou ${manualSelected.length}. Remova ${
                          manualSelected.length - LIMIT
                        } para ficar com ${LIMIT}.`
                  }
                />
              )}
            </div>

            {/* Busca */}
            <div className="text-xs text-gray-500 mt-5 mb-2">
              Mostrando <b>{filteredProducts.length}</b> de{" "}
              <b>{products.length}</b> produtos
            </div>

            <div className="mb-3 relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar produto (nome, categoria, unidade...)"
                className="pl-9 pr-10"
              />
              {/* X sempre visível */}
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white border flex items-center justify-center hover:bg-gray-50 active:scale-95"
                aria-label="Limpar busca"
                title="Limpar busca"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {productsLoading ? (
              <div className="text-sm text-gray-600 inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando produtos...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredProducts.map((p) => {
                  const already = manualSelected.some((x) => x.id === p.id);
                  const full = manualSelected.length >= LIMIT;

                  return (
                    <div
                      key={p.id}
                      className="bg-white rounded-xl p-3 border flex items-center gap-3"
                    >
                      <ImgThumb src={p.image_path} />

                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {p.name}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {p.category ? `${p.category}` : "—"}
                          {p.unit ? ` • ${p.unit}` : ""}
                        </div>
                      </div>

                      <Button
                        disabled={full || already}
                        onClick={() => addManual(p)}
                        className="bg-red-600 text-white"
                        title={
                          already
                            ? "Já selecionado"
                            : full
                            ? `Limite de ${LIMIT} atingido`
                            : "Adicionar"
                        }
                      >
                        {already ? "Adicionado" : "Adicionar"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
};

export default Destaques;
