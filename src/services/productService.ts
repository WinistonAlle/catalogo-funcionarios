// src/services/productService.ts
import { supabase } from "@/lib/supabase";

export type Product = {
  id: string;
  old_id: number | null;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string | null;
  employee_price: number;
  active: boolean;
  category_id: number | null;
  category_name?: string | null; // vem da tabela categories
};

export async function listProducts(opts?: {
  search?: string;
  onlyActive?: boolean;
}) {
  const { search = "", onlyActive = true } = opts ?? {};

  let query = supabase
    .from("products")
    .select(
      `
      id,
      old_id,
      name,
      description,
      sku,
      unit,
      employee_price,
      active,
      category_id,
      categories (name)
    `
    )
    .order("name", { ascending: true });

  if (onlyActive) {
    query = query.eq("active", true);
  }

  if (search.trim()) {
    const term = search.trim();
    // busca por nome OU sku
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    console.error("[listProducts] erro ao buscar produtos:", error);
    throw error;
  }

  return (data ?? []).map((row: any): Product => ({
    id: row.id,
    old_id: row.old_id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    unit: row.unit,
    employee_price: Number(row.employee_price ?? 0),
    active: row.active,
    category_id: row.category_id,
    category_name: row.categories?.name ?? null,
  }));
}
