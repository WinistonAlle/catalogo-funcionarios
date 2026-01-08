import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------- Tipos ----------
export type Product = {
  id: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  active: boolean;
  sort_order?: number | null;
  category_id: number;
  price_public?: number | null;
  price_employee?: number | null;
};

export type Category = {
  id: number;
  name: string;
  sort_order?: number;
  active?: boolean;
};

// ---------- Buscar produtos ----------
export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------- Buscar categorias ----------
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order, active")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------- Criar produto ----------
export function useCreateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<Product, "id">) => {
      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// ---------- Atualizar produto ----------
export function useUpdateProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...changes }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase
        .from("products")
        .update(changes)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// ---------- Excluir produto ----------
export function useDeleteProduct() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// ---------- Upload de imagem ----------
export async function uploadProductImage(file: File) {
  const filename = `products/${crypto.randomUUID()}-${file.name.replace(/\s+/g, "_")}`;
  const { data, error } = await supabase.storage
    .from("product-images")
    .upload(filename, file, { upsert: false });

  if (error) throw error;

  const { data: pub } = supabase.storage.from("product-images").getPublicUrl(data.path);
  return pub.publicUrl;
}

