// src/pages/Admin.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/types/products";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const FALLBACK_IMG = "/placeholder.png";

// ✅ bucket criado no Supabase Storage via SQL
const STORAGE_BUCKET = "products";

const CATEGORY_LABELS: Record<string, string> = {
  "1": "Pão de Queijo",
  "2": "Salgados Assados",
  "3": "Salgados P/ Fritar",
  "4": "Pães e Massas Doces",
  "5": "Biscoito de Queijo",
  "6": "Salgados Grandes",
  "7": "Alho em creme",
  "8": "Outros",
};

type Editable = Product & {
  images?: string[];

  // ✅ mantém o texto enquanto digita (pra aceitar 3,5 / 3.5)
  weight_input?: string;
  employee_price_input?: string;
};

function parseBRNumber(v: any, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;

  const s = String(v).trim();
  if (!s) return fallback;

  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function safeNumberOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseBRNumber(v, NaN);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(v: any, fallback = 0): number {
  return parseBRNumber(v, fallback);
}

function normalizeImages(row: any): string[] {
  if (Array.isArray(row?.images)) return row.images.filter(Boolean);
  if (typeof row?.images === "string" && row.images.trim())
    return row.images
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

  if (row?.image && typeof row.image === "string") return [row.image];
  if (row?.image_path && typeof row.image_path === "string") return [row.image_path];
  return [];
}

function mapRowToProduct(row: any): Product {
  const employeePrice = safeNumber(row.employee_price ?? row.price, 0);

  const categoryId =
    row.category_id ?? row.category ?? row.category_name ?? row.categoryId ?? null;

  const oldId = safeNumberOrNull(row.old_id);

  const images = normalizeImages(row);

  return {
    id: row.id,
    old_id: oldId,
    name: row.name ?? "",
    price: employeePrice,
    employee_price: employeePrice,
    images,
    image_path: row.image_path ?? (images[0] ?? null),

    category: categoryId != null ? String(categoryId) : ("8" as any),

    description: row.description ?? "",
    packageInfo: row.packageInfo ?? row.package_info ?? "",
    weight: safeNumber(row.weight, 0),

    isPackage: row.isPackage ?? row.is_package ?? false,
    featured: row.featured ?? row.isFeatured ?? false,

    // mantém no UI (mesmo que seu banco não tenha coluna)
    inStock: row.inStock ?? row.in_stock ?? true,

    isLaunch: row.isLaunch ?? row.is_launch ?? false,
    extraInfo: row.extraInfo ?? row.extra_info ?? null,
  } as Product;
}

/**
 * ✅ Payload SOMENTE da tabela products
 * - NÃO inclui images (sua tabela não tem)
 * - NÃO inclui weight (vai pra tabela weight)
 * - NÃO inclui in_stock (seu banco não tem)
 * - NÃO inclui extra_info (se não existir)
 */
function mapEditingToDbPayload(editing: Editable) {
  const employeePrice = parseBRNumber(
    editing.employee_price_input ?? (editing as any).employee_price,
    0
  );

  const firstImage =
    editing.images && editing.images.length > 0 ? editing.images[0].trim() : null;

  const payload: any = {
    id: editing.id,
    old_id: safeNumberOrNull((editing as any).old_id),

    name: editing.name?.trim() ?? "",
    employee_price: employeePrice,
    unit: "un",

    category_id: editing.category ? Number(editing.category) : null,

    // ✅ coluna certa
    image_path: (editing as any).image_path ?? firstImage,

    description: (editing as any).description ?? "",
    package_info: (editing as any).packageInfo ?? "",
    is_package: !!(editing as any).isPackage,
    featured: !!(editing as any).featured,
    is_launch: !!(editing as any).isLaunch,
  };

  return payload;
}

function mapPayloadBackToProduct(editing: Editable, payload: any): Product {
  const employeePrice = safeNumber(payload.employee_price, 0);
  const images = (editing.images ?? []).filter(Boolean);

  // peso final convertido (pra exibir corretamente)
  const weightFinal = parseBRNumber(
    editing.weight_input ?? (editing as any).weight,
    0
  );

  return {
    id: editing.id,
    old_id: payload.old_id ?? null,
    name: (payload.name ?? editing.name ?? "").trim(),
    price: employeePrice,
    employee_price: employeePrice,
    images,
    image_path: payload.image_path ?? null,
    category: (editing.category ?? "8") as any,
    description: editing.description ?? "",
    packageInfo: editing.packageInfo ?? "",
    weight: weightFinal,
    isPackage: !!editing.isPackage,
    featured: !!editing.featured,

    // permanece no estado (mesmo sem coluna no banco)
    inStock: editing.inStock !== false,

    isLaunch: !!editing.isLaunch,
    extraInfo: editing.extraInfo ?? null,
  } as Product;
}

export default function Admin() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Busca / filtro
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");

  // Form (add/edit)
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<Editable | null>(null);

  // Exclusão
  const [toDelete, setToDelete] = useState<Product | null>(null);

  // Upload de imagem
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Scroll to Top
  const [showScroll, setShowScroll] = useState(false);

  const checkScrollTop = () => {
    if (!showScroll && window.pageYOffset > 400) setShowScroll(true);
    else if (showScroll && window.pageYOffset <= 400) setShowScroll(false);
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    window.addEventListener("scroll", checkScrollTop);
    return () => window.removeEventListener("scroll", checkScrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showScroll]);

  // --------- Carregar produtos do Supabase ----------
  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        // 1) Produtos
        const { data: productsData, error: pErr } = await supabase
          .from("products")
          .select("*")
          .order("name", { ascending: true });

        if (pErr) throw pErr;

        const mapped = (productsData ?? []).map(mapRowToProduct) as Product[];

        // 2) Pesos (tabela weight) -> merge por product_id
        const ids = mapped.map((p) => p.id).filter(Boolean);
        if (ids.length) {
          const { data: wData, error: wErr } = await supabase
            .from("weight")
            .select("product_id, weight")
            .in("product_id", ids);

          if (wErr) {
            console.warn("Aviso: erro ao carregar pesos da tabela weight:", wErr);
          } else {
            const byId = new Map<string, number>();
            (wData ?? []).forEach((r: any) => {
              if (r?.product_id) byId.set(String(r.product_id), safeNumber(r.weight, 0));
            });

            for (const p of mapped) {
              const w = byId.get(String(p.id));
              if (w !== undefined) (p as any).weight = w;
            }
          }
        }

        setItems(mapped);
      } catch (err) {
        console.error("Erro ao carregar produtos:", err);
        alert("Erro ao carregar produtos do banco.");
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // --------- Categorias dinâmicas ----------
  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => {
      if (p.category != null) set.add(String(p.category));
    });
    return Array.from(set).sort();
  }, [items]);

  // --------- Ordenação / filtro ----------
  const ordenados = useMemo(() => {
    return [...items].sort((a, b) => {
      const catA = String(a.category ?? "");
      const catB = String(b.category ?? "");
      if (catA !== catB) return catA.localeCompare(catB);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [items]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return ordenados.filter((p) => {
      const catId = String(p.category ?? "");
      const catLabel = CATEGORY_LABELS[catId] ?? catId;
      const byCat = categoria === "todas" || catId === categoria;

      if (!termo) return byCat;

      const haystack = [p.name, catId, catLabel, p.description, p.id, p.old_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return byCat && haystack.includes(termo);
    });
  }, [ordenados, busca, categoria]);

  // --------- Form: Add / Edit ----------
  const startAdd = () => {
    setEditing({
      // ✅ AGORA É UUID DE VERDADE (evita erro "invalid input syntax for type uuid")
      id: generateId(),
      old_id: null,
      name: "",
      price: 0,
      employee_price: 0,
      employee_price_input: "",
      images: [],
      image_path: null,
      category: "8" as any,
      description: "",
      packageInfo: "",
      weight: 0,
      weight_input: "",
      isPackage: false,
      isLaunch: false,
      featured: false,
      inStock: true,
      extraInfo: null,
    });
    setOpenForm(true);
  };

  const startEdit = (p: Product) => {
    const weightNum = safeNumber((p as any).weight, 0);
    const priceNum = safeNumber((p as any).employee_price, 0);

    setEditing({
      ...(p as Editable),
      old_id: safeNumberOrNull((p as any).old_id),
      images: (p.images ?? []).filter(Boolean),
      image_path: (p as any).image_path ?? (p.images?.[0] ?? null),

      weight: weightNum,
      weight_input: String(weightNum).replace(".", ","),

      employee_price: priceNum,
      employee_price_input: String(priceNum).replace(".", ","),
    });
    setOpenForm(true);
  };

  const closeForm = () => {
    setOpenForm(false);
    setEditing(null);
    setUploadError(null);
  };

  // --------- Upload de imagem p/ Supabase ----------
  async function uploadProductImage(file: File): Promise<string> {
    setUploadingImage(true);
    setUploadError(null);

    try {
      const productId = editing?.id ?? "unknown";
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `${productId}/${fileName}`;

      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).upload(
        filePath,
        file,
        {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "image/jpeg",
        }
      );

      if (error) throw error;

      const { data: publicData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(data.path);

      const url = publicData?.publicUrl;
      if (!url) throw new Error("Não foi possível obter a URL pública.");

      return url;
    } catch (err: any) {
      console.error("Erro ao enviar imagem:", err);
      setUploadError(err?.message || "Erro ao enviar imagem. Tente novamente.");
      throw err;
    } finally {
      setUploadingImage(false);
    }
  }

  // --------- Handlers de arquivo / drag & drop ----------
  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editing) return;

    uploadProductImage(file)
      .then((url) => {
        setEditing((prev) =>
          prev
            ? {
                ...prev,
                images: [url, ...(prev.images ?? [])],
                image_path: prev.image_path ?? url,
              }
            : prev
        );
      })
      .catch(() => {});
  }

  function handleImageDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!editing) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    uploadProductImage(file)
      .then((url) => {
        setEditing((prev) =>
          prev
            ? {
                ...prev,
                images: [url, ...(prev.images ?? [])],
                image_path: prev.image_path ?? url,
              }
            : prev
        );
      })
      .catch(() => {});
  }

  function handleImageDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  // --------- Salvar (INSERT/UPDATE) ----------
  const onSubmitForm = async () => {
    if (!editing) return;

    if (!editing.name?.trim()) {
      alert("Informe o nome.");
      return;
    }

    setSaving(true);
    try {
      const existsInState = items.some((p) => p.id === editing.id);

      // payload apenas do products (sem in_stock)
      const payload = mapEditingToDbPayload(editing);

      if (existsInState) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
      }

      // ✅ peso -> tabela weight
      const weightValue = parseBRNumber(
        editing.weight_input ?? (editing as any).weight,
        0
      );

      const { error: wErr } = await supabase
        .from("weight")
        .upsert(
          { product_id: editing.id, weight: weightValue },
          { onConflict: "product_id" }
        );

      if (wErr) throw wErr;

      // ✅ atualiza estado local
      const saved = mapPayloadBackToProduct(editing, payload);

      setItems((prev) => {
        const idx = prev.findIndex((p) => p.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        const next = [saved, ...prev];
        next.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
        return next;
      });

      closeForm();
    } catch (err: any) {
      console.error("Erro ao salvar produto:", err);
      alert(
        "Erro ao salvar produto no banco.\n\n" +
          (err?.message || err?.hint || "Erro desconhecido.")
      );
    } finally {
      setSaving(false);
    }
  };

  // --------- Excluir ----------
  const confirmDelete = (p: Product) => setToDelete(p);

  const doDelete = async () => {
    if (!toDelete) return;

    try {
      await supabase.from("weight").delete().eq("product_id", toDelete.id);

      const { error } = await supabase.from("products").delete().eq("id", toDelete.id);
      if (error) throw error;

      setItems((prev) => prev.filter((p) => p.id !== toDelete.id));
      setToDelete(null);
    } catch (err) {
      console.error("Erro ao excluir produto:", err);
      alert("Erro ao excluir produto no banco.");
    }
  };

  // --------- Render ----------
  return (
    <div className="p-6 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              window.location.href = "/catalogo";
            }}
          >
            ← Voltar ao Catálogo
          </Button>
          <h1 className="text-xl font-semibold">Painel de Produtos (Admin)</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, categoria, ID ou old_id..."
            className="w-72"
          />

          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {categoryOptions.map((id) => (
                <SelectItem key={id} value={id}>
                  {CATEGORY_LABELS[id] ?? id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-px h-6 bg-border mx-1" />

          <Button onClick={startAdd}>Novo produto</Button>
        </div>
      </header>

      {loading ? (
        <div className="text-sm text-muted-foreground">Carregando produtos...</div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {filtrados.length} produto(s)
            {busca ? ` • filtro: “${busca}”` : ""}
            {categoria !== "todas" ? ` • ${CATEGORY_LABELS[categoria] ?? categoria}` : ""}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((p) => {
              const catId = String(p.category ?? "");
              const catLabel = CATEGORY_LABELS[catId] || catId || "Sem categoria";

              const thumb =
                (p.images?.length ? p.images[0] : null) ||
                (p as any).image_path ||
                FALLBACK_IMG;

              const w = safeNumber((p as any).weight, 0);

              return (
                <Card key={p.id} className="overflow-hidden">
                  <CardHeader className="p-0">
                    <img
                      src={thumb}
                      alt={p.name}
                      className="h-40 w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                      }}
                    />
                  </CardHeader>
                  <CardContent className="p-4 space-y-2">
                    <CardTitle className="text-base leading-snug line-clamp-2">
                      {p.name}
                    </CardTitle>

                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <Badge variant="secondary">{catLabel || "Sem categoria"}</Badge>
                      {p.isPackage && <Badge>Pacote</Badge>}
                      {p.featured && <Badge>⭐ Destaque</Badge>}
                      {p.inStock === false && (
                        <Badge variant="destructive">Sem estoque</Badge>
                      )}
                      {p.isLaunch && <Badge variant="outline">Lançamento</Badge>}
                    </div>

                    <div className="text-lg font-semibold">
                      R$ {safeNumber(p.employee_price, 0).toFixed(2)}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      ID: {p.old_id !== null ? p.old_id : p.id} •{" "}
                      {p.packageInfo || "—"} • {w ? `${w}kg` : ""}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => startEdit(p)}>
                        Editar
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => confirmDelete(p)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Dialog do formulário */}
      <Dialog open={openForm} onOpenChange={(o) => (o ? setOpenForm(true) : closeForm())}>
        <DialogContent className="sm:max-w-[780px]">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Resumo + preview */}
              <div className="sm:col-span-2 flex items-center gap-4 border rounded-lg p-3">
                <img
                  src={(editing.images && editing.images[0]) || editing.image_path || FALLBACK_IMG}
                  alt={editing.name}
                  className="h-16 w-16 rounded-md object-cover border"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                  }}
                />
                <div className="flex-1">
                  <div className="font-semibold line-clamp-1">
                    {editing.name || "Produto sem nome"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ID: {editing.old_id !== null ? editing.old_id : editing.id} • R${" "}
                    {parseBRNumber(
                      editing.employee_price_input ?? (editing as any).employee_price,
                      0
                    ).toFixed(2)}
                  </div>
                </div>
              </div>

              <Field label="ID (old_id)">
                <Input
                  value={editing.old_id !== null ? String(editing.old_id) : ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? null : safeNumberOrNull(raw);
                    setEditing({ ...editing, old_id: n });
                  }}
                  placeholder="ID numérico do produto"
                />
              </Field>

              <Field label="Nome">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Nome do produto"
                />
              </Field>

              <Field label="Categoria">
                <Select
                  value={String(editing.category ?? "8")}
                  onValueChange={(v) => setEditing({ ...editing, category: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Preço funcionário (R$)">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editing.employee_price_input ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      employee_price_input: e.target.value,
                    })
                  }
                  placeholder="Ex.: 48,50"
                />
              </Field>

              <Field label="Descrição" full>
                <Textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                />
              </Field>

              <Field label="Package info">
                <Input
                  value={editing.packageInfo ?? ""}
                  onChange={(e) => setEditing({ ...editing, packageInfo: e.target.value })}
                  placeholder="Ex.: Pacote 1kg, Pote 200g..."
                />
              </Field>

              <Field label="Peso (kg)">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={editing.weight_input ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      weight_input: e.target.value,
                    })
                  }
                  placeholder="Ex.: 3,5 ou 3.5"
                />
              </Field>

              {/* Dropzone + preview + edição manual */}
              <Field label="Imagens do produto" full>
                <div className="space-y-2">
                  <div
                    onDrop={handleImageDrop}
                    onDragOver={handleImageDragOver}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center cursor-pointer hover:bg-muted/40"
                    onClick={() => {
                      const input = document.getElementById(
                        "product-image-input"
                      ) as HTMLInputElement | null;
                      input?.click();
                    }}
                  >
                    <input
                      id="product-image-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />

                    <span className="text-sm font-medium">
                      Arraste uma imagem aqui ou clique para selecionar
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Formatos comuns (JPG, PNG). A primeira será usada como principal.
                    </span>

                    {uploadingImage && (
                      <span className="text-xs text-blue-500">Enviando imagem...</span>
                    )}
                    {uploadError && (
                      <span className="text-xs text-red-500">{uploadError}</span>
                    )}
                  </div>

                  {editing.images && editing.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {editing.images.map((img, index) => (
                        <div
                          key={img + index}
                          className="relative w-16 h-16 rounded-md overflow-hidden border"
                        >
                          <img
                            src={img}
                            alt={`Imagem ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                            }}
                          />
                          {index === 0 && (
                            <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white text-center">
                              Principal
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Input
                    value={editing.images?.join(", ") ?? ""}
                    onChange={(e) => {
                      const imgs = e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);

                      setEditing({
                        ...editing,
                        images: imgs,
                        image_path: editing.image_path ?? imgs[0] ?? null,
                      });
                    }}
                    placeholder={`https://.../storage/v1/object/public/${STORAGE_BUCKET}/<uuid>/arquivo.jpg, https://...`}
                  />
                </div>
              </Field>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2 sm:col-span-2">
                <Flag
                  label="Pacote"
                  checked={!!editing.isPackage}
                  onCheckedChange={(v) => setEditing({ ...editing, isPackage: v })}
                />
                <Flag
                  label="Destaque"
                  checked={!!editing.featured}
                  onCheckedChange={(v) => setEditing({ ...editing, featured: v })}
                />
                <Flag
                  label="Em estoque"
                  checked={editing.inStock !== false}
                  onCheckedChange={(v) => setEditing({ ...editing, inStock: v })}
                />
                <Flag
                  label="Lançamento"
                  checked={!!editing.isLaunch}
                  onCheckedChange={(v) => setEditing({ ...editing, isLaunch: v })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={closeForm} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={onSubmitForm} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="text-sm text-muted-foreground">
            {toDelete?.name} (ID: {toDelete?.old_id ?? toDelete?.id})
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doDelete}
            >
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showScroll && (
        <Button
          onClick={scrollTop}
          className="fixed bottom-4 right-4 p-3 rounded-full shadow-lg z-50"
          aria-label="Voltar ao Topo"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 10l7-7m0 0l7 7m-7-7v18"
            />
          </svg>
        </Button>
      )}
    </div>
  );
}

// ------------- Componentes auxiliares -------------

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2 space-y-1" : "space-y-1"}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Flag({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

// ✅ CORREÇÃO PRINCIPAL: gerar UUID válido (compatível com coluna uuid do Postgres)
function generateId() {
  return crypto.randomUUID();
}
