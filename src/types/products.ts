// src/types/products.ts

export type Category =
  | "Salgados P/ Fritar"
  | "Salgados Assados"
  | "Pães e Massas Doces"
  | "Pão de Queijo"
  | "Biscoito de Queijo"
  | "Salgados Grandes"
  | "Kits e Combos"
  | "Alho em creme"
  | "Outros";

export interface ProductExtraInfo {
  usageTips?: string;
  ingredients?: string;
  funFact?: string;
}

export interface Product {
  // ID interno do Supabase (UUID)
  id: string;

  // ID numérico legado (old_id) que você quer usar como SKU / código do produto
  old_id?: number | null;

  name: string;

  // 🔴 Preço antigo (varejo) – pode ficar aqui por compatibilidade,
  // mas no Catálogo de Funcionários não vamos mais usar.
  price: number;

  // 💰 Preço exclusivo para funcionários (vem do Supabase)
  employee_price: number;

  // 🖼️ Lista de imagens (para o carousel)
  images: string[];

  // 🖼️ Imagem única vinda do Supabase Storage
  image_path?: string | null; // 👈 ADICIONADO AQUI

  category: Category;
  description?: string;
  packageInfo: string; // Informação sobre a embalagem (ex: "Pacote de 1kg")
  weight: number; // Peso em kg
  isPackage: boolean; // Se conta como pacote para pedido mínimo
  isLaunch?: boolean;
  featured?: boolean; // Se deve aparecer em destaque
  extraInfo?: ProductExtraInfo; // Info adicional para a view expandida
  inStock?: boolean; // Se está em estoque (opcional, default true)
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Kit {
  id: string;
  name: string;
  description: string;
  image: string;
  items: KitItem[];
}

export interface KitItem {
  productId: string;
  quantity: number;
}

export interface ShippingRate {
  cost: number;
}
