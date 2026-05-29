import type { Product } from "@/types/products";

type PriceableProduct = Partial<
  Pick<Product, "employee_price" | "price" | "weight">
> & {
  employee_price?: unknown;
  price?: unknown;
  weight?: unknown;
};

function finiteNumber(value: unknown): number {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function getPositivePrice(primary: unknown, fallback?: unknown): number {
  const primaryPrice = finiteNumber(primary);
  if (primaryPrice > 0) return primaryPrice;

  const fallbackPrice = finiteNumber(fallback);
  return fallbackPrice > 0 ? fallbackPrice : 0;
}

export function getKgPrice(product: PriceableProduct | null | undefined): number {
  if (!product) return 0;

  return getPositivePrice(product.employee_price, product.price);
}

export function getProductWeight(product: PriceableProduct | null | undefined): number {
  if (!product) return 1;

  const weight = finiteNumber(product.weight);
  return weight > 0 ? weight : 1;
}

export function getUnitPrice(product: PriceableProduct | null | undefined): number {
  const unitPrice = getKgPrice(product) * getProductWeight(product);
  return Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
}

export function getLineSubtotal(
  product: PriceableProduct | null | undefined,
  quantity: unknown
): number {
  const safeQuantity = finiteNumber(quantity);
  if (safeQuantity <= 0) return 0;

  const subtotal = getUnitPrice(product) * safeQuantity;
  return Number.isFinite(subtotal) ? subtotal : 0;
}
