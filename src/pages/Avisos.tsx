// src/pages/Avisos.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Home,
  Bell,
  ClipboardList,
  Megaphone,
  Loader2,
  Plus,
  PenSquare,
  Users,
  LogOut,
  Trash2,
  Pencil,
  Image as ImageIcon,
  BarChart2,
  Heart,
  Facebook,
  Instagram,
  Youtube,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ✅ LOGO (mesmo do Index)
import logoGostinho from "@/images/logoc.png";

// Mesmo helper do Index
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

type Notice = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  created_by_employee_id: string | null;
  image_url?: string | null;
};

/* --------------------------------------------------------
   LOADER UIVERSE (JkHuger) - FULLSCREEN OVERLAY
-------------------------------------------------------- */
const PageLoader: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/25 backdrop-blur-sm">
      <div className="uiverse-frame" aria-label="Carregando" role="status">
        <div className="uiverse-center">
          <div className="uiverse-dot-1" />
          <div className="uiverse-dot-2" />
          <div className="uiverse-dot-3" />
        </div>
      </div>

      {/* CSS scoped (não vaza pro resto da página) */}
      <style>{`
        .uiverse-frame {
          position: relative;
          width: 400px;
          height: 400px;
        }

        .uiverse-center {
          position: absolute;
          width: 220px;
          height: 220px;
          top: 90px;
          left: 90px;
        }

        .uiverse-dot-1 {
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
          -webkit-animation: uiverse-jump-jump-1 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: uiverse-jump-jump-1 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        .uiverse-dot-2 {
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
          -webkit-animation: uiverse-jump-jump-2 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: uiverse-jump-jump-2 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        .uiverse-dot-3 {
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
          -webkit-animation: uiverse-jump-jump-3 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
          animation: uiverse-jump-jump-3 2s cubic-bezier(0.21, 0.98, 0.6, 0.99) infinite alternate;
        }

        @keyframes uiverse-jump-jump-1 {
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

        @keyframes uiverse-jump-jump-2 {
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

        @keyframes uiverse-jump-jump-3 {
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
   BOTTOM NAV (MESMO DO CATÁLOGO)
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

  const isActive = (path: string) =>
    location.pathname === path ||
    (path === HOME_PATH &&
      ["/", "/index", "/catalogo"].includes(location.pathname));

  return (
    <nav
      className="
      fixed bottom-0 left-0 right-0 z-40 md:hidden
      bg-white/95 backdrop-blur-md
      border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]
    "
    >
      <div className="flex justify-around py-2">
        {tabs.map(({ label, path, icon: Icon }) => {
          const active = isActive(path);
          const isAvisos = label === "Avisos";

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`
                flex flex-col items-center text-[11px]
                ${active ? "text-red-600 font-semibold" : "text-gray-500"}
              `}
            >
              <div
                className={`
                  relative p-2 rounded-full transition
                  ${active ? "bg-red-50 scale-110 shadow-sm" : ""}
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
              {label}
              {active && (
                <span className="h-1 w-6 bg-red-500 rounded-full mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

const Avisos: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const employee: any = safeGetEmployee();

  const isAdmin =
    employee?.is_admin ||
    employee?.role === "admin" ||
    employee?.tipo === "ADMIN";

  const isRH =
    employee?.is_rh || employee?.role === "rh" || employee?.setor === "RH";

  const canManage = isAdmin || isRH;

  const displayName = employee?.full_name ?? employee?.name ?? "Funcionário";

  // Modal (novo / editar)
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Upload de imagem
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const sess = localStorage.getItem("employee_session");
    if (!sess) navigate("/login", { replace: true });
  }, [navigate]);

  async function loadNotices() {
    try {
      setLoadError(null);
      setLoading(true);

      const { data, error } = await supabase
        .from("notices")
        .select("id, title, body, created_at, created_by_employee_id, image_url")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (error) {
        setLoadError(error.message);
        setNotices([]);
        return;
      }

      setNotices((data as Notice[]) ?? []);
    } catch (err: any) {
      setLoadError(String(err?.message ?? err));
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotices();
  }, []);

  function resetModalState() {
    setEditingNotice(null);
    setNewTitle("");
    setNewBody("");
    setSelectedImageFile(null);
    setImagePreview(null);
  }

  function openNewModal() {
    resetModalState();
    setIsNewOpen(true);
  }

  function openEditModal(notice: Notice) {
    setEditingNotice(notice);
    setNewTitle(notice.title);
    setNewBody(notice.body);
    setSelectedImageFile(null);
    setImagePreview(notice.image_url || null);
    setIsNewOpen(true);
  }

  function handleImageChange(file: File | null) {
    if (!file) {
      setSelectedImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert("Por favor, selecione um arquivo de imagem.");
      return;
    }
    setSelectedImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    if (file) handleImageChange(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageChange(file);
  }

  async function uploadImageIfNeeded(): Promise<string | null> {
    if (!selectedImageFile) {
      // sem imagem nova -> mantém a antiga (se existir)
      return editingNotice?.image_url ?? null;
    }

    const fileExt = selectedImageFile.name.split(".").pop();
    const baseId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fileName = `${baseId}.${fileExt}`;
    const filePath = `avisos/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("notice-images")
      .upload(filePath, selectedImageFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      alert("Erro ao enviar imagem: " + uploadError.message);
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from("notice-images")
      .getPublicUrl(uploadData.path);

    return publicUrlData.publicUrl;
  }

  async function handleSaveNotice() {
    if (!newTitle.trim()) return;

    try {
      setSaving(true);

      const imageUrlToSave = await uploadImageIfNeeded();
      if (selectedImageFile && !imageUrlToSave) return;

      if (editingNotice) {
        const { error } = await supabase
          .from("notices")
          .update({
            title: newTitle.trim(),
            body: newBody.trim() || "",
            image_url: imageUrlToSave,
          })
          .eq("id", editingNotice.id);

        if (error) {
          alert("Erro ao atualizar aviso: " + error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("notices").insert({
          title: newTitle.trim(),
          body: newBody.trim() || "",
          is_published: true,
          image_url: imageUrlToSave,
          created_by_employee_id: employee?.id ?? null,
        });
        if (error) {
          alert("Erro ao criar aviso: " + error.message);
          return;
        }
      }

      resetModalState();
      setIsNewOpen(false);
      loadNotices();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNotice(notice: Notice) {
    if (!window.confirm(`Excluir o aviso "${notice.title}"?`)) return;

    try {
      setDeletingId(notice.id);

      const { error } = await supabase
        .from("notices")
        .delete()
        .eq("id", notice.id);

      if (error) {
        alert("Erro ao excluir aviso: " + error.message);
        return;
      }

      setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    } finally {
      setDeletingId(null);
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR");
  }

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

  const showLoader = loading || saving || !!deletingId;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative pb-4">
      {/* ✅ LOADER FULLSCREEN (Uiverse) */}
      <PageLoader show={showLoader} />

      {/* Mesma faixa atrás do header */}
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
              <span className="text-xs text-red-100">
                Central de avisos internos
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
          fixed inset-0 z-40 backdrop-blur-sm transition-opacity
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
      <main className="flex-1 container mx-auto px-4 py-6 mt-4 pb-28">
        <section className="mt-6 md:mt-10">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
                <Megaphone className="h-6 w-6 text-red-600" />
                Avisos da empresa
              </h2>
              <p className="text-xs md:text-sm text-gray-500">
                Comunicados oficiais para todos os colaboradores
              </p>
            </div>

            {canManage && (
              <Button
                onClick={openNewModal}
                className="hidden md:flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white"
              >
                <Plus className="h-4 w-4" /> Novo aviso
              </Button>
            )}
          </div>

          {canManage && (
            <Button
              size="sm"
              onClick={openNewModal}
              className="md:hidden w-full mb-4 bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Novo aviso
            </Button>
          )}

          {/* AVISOS */}
          {loadError ? (
            <div className="py-10 text-center text-red-600">{loadError}</div>
          ) : notices.length === 0 && !loading ? (
            <div className="py-10 text-center text-gray-500">
              Nenhum aviso cadastrado.
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-4">
              {notices.map((notice) => (
                <article
                  key={notice.id}
                  className="bg-white/70 backdrop-blur-md border border-red-50 rounded-2xl p-4 md:p-5 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 bg-red-100 rounded-full flex items-center justify-center">
                        <Bell className="h-4 w-4 text-red-600" />
                      </div>
                      <div>
                        <h3 className="text-sm md:text-base font-semibold">
                          {notice.title}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {formatDate(notice.created_at)}
                        </span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 hover:text-gray-800"
                          onClick={() => openEditModal(notice)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteNotice(notice)}
                          disabled={deletingId === notice.id}
                        >
                          {deletingId === notice.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {notice.body?.trim() ? (
                    <p className="text-sm text-gray-700 whitespace-pre-line">
                      {notice.body}
                    </p>
                  ) : null}

                  {notice.image_url && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                      <img
                        src={notice.image_url}
                        alt=""
                        className="h-56 w-full object-cover"
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <Footer />

      {/* BOTTOM NAV COM CONTADOR DE AVISOS */}
      <BottomNav noticeCount={notices.length} />

      {/* MODAL NOVO / EDITAR */}
      <Dialog
        open={isNewOpen}
        onOpenChange={(open) => {
          setIsNewOpen(open);
          if (!open) resetModalState();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingNotice ? "Editar aviso" : "Novo aviso"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Título do aviso"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Textarea
              rows={5}
              placeholder="Digite o conteúdo... (opcional)"
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
            />

            <div
              className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-600 cursor-pointer"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                <span>
                  Arraste uma imagem aqui ou{" "}
                  <span className="font-semibold">clique para escolher</span>
                </span>
              </div>
              <span className="text-[10px] text-gray-500">
                Formatos aceitos: JPG, PNG, até ~5MB.
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFileInputChange}
              />

              {imagePreview && (
                <div className="mt-2 overflow-hidden rounded-md border border-gray-200 bg-white">
                  <img
                    src={imagePreview}
                    alt="Pré-visualização"
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsNewOpen(false);
                resetModalState();
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleSaveNotice}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : editingNotice ? (
                "Salvar alterações"
              ) : (
                "Salvar aviso"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --- FOOTER ---
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

export default Avisos;
