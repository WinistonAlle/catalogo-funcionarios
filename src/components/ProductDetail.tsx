import React, { useState, useEffect } from "react";
import { Product } from "@/types/products";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProductImageCarousel from "./ProductImageCarousel";
import { Package, Scale, Plus, Minus, Check, XCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useCart } from "@/contexts/CartContext";
import { toast } from "./ui/sonner";

interface ProductDetailProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
}

const ProductDetail: React.FC<ProductDetailProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const { addToCart, decreaseQuantity, updateQuantity, cartItems } = useCart();

  // ---- campos flexíveis vindos do Supabase ----
  const images: string[] = Array.isArray((product as any).images)
    ? ((product as any).images as string[])
    : [];

  const packageInfo: string =
    (product as any).packageInfo ??
    (product as any).package_info ??
    "";

  const rawWeight =
    typeof (product as any).weight === "number"
      ? (product as any).weight
      : Number((product as any).weight ?? 0) || null;

  const isPackage =
    (product as any).isPackage ?? (product as any).is_package ?? false;

  const isInStock =
    (product as any).inStock ??
    (product as any).in_stock ??
    true;

  const employeePrice =
    (product as any).employee_price ??
    (product as any).price ??
    0;

  const extraInfo = (product as any).extraInfo ?? {};

  // Item atual no carrinho
  const currentItem = cartItems.find((item) => item.product.id === product.id);
  const quantity = currentItem ? currentItem.quantity : 0;

  // Estado do input de quantidade
  const [inputValue, setInputValue] = useState<string>(quantity.toString());
  const [manualEdit, setManualEdit] = useState(false);

  // Sincroniza quando o carrinho muda
  useEffect(() => {
    setInputValue(quantity.toString());
    if (!manualEdit || parseInt(inputValue) === quantity) {
      setManualEdit(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value)) {
      setInputValue(value);
      setManualEdit(true);
    }
  };

  const handleApplyQuantity = () => {
    const newQuantity = parseInt(inputValue) || 0;

    if (newQuantity > 0) {
      const itemExists = cartItems.find(
        (item) => item.product.id === product.id
      );

      if (itemExists) {
        updateQuantity(product.id, newQuantity);
      } else {
        addToCart(product, newQuantity);
      }

      setManualEdit(false);
    } else {
      setInputValue(quantity.toString());
      toast("Quantidade inválida", {
        description: "Por favor, insira um número maior que zero.",
      });
    }
  };

  const handleAddToCart = () => {
    if (!isInStock) {
      toast("Produto indisponível", {
        description: "Este produto está temporariamente fora de estoque.",
      });
      return;
    }
    addToCart(product);
  };

  const handleDecreaseQuantity = () => {
    decreaseQuantity(product.id);
  };

  const showApplyButton =
    manualEdit && parseInt(inputValue || "0") !== quantity;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          {packageInfo && (
            <DialogDescription className="text-sm text-gray-500">
              {packageInfo}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ---------------- IMAGEM AJUSTADA ---------------- */}
        <div className="mt-2 relative w-full rounded-lg overflow-hidden bg-gray-100">
          {images && images.length > 0 ? (
            <ProductImageCarousel
              images={images}
              productName={product.name}
              className="aspect-video rounded-lg overflow-hidden"
            />
          ) : product.image_path ? (
            <img
              src={product.image_path}
              alt={product.name}
              className="w-full aspect-video object-cover rounded-lg"
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center text-gray-400 text-sm">
              Sem imagem
            </div>
          )}

          {!isInStock && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="bg-red-600 text-white font-bold px-3 py-2 rounded-md text-sm">
                SEM ESTOQUE
              </div>
            </div>
          )}
        </div>
        {/* -------------------------------------------------- */}

        <div className="mt-4 space-y-4">
          {product.description && (
            <div>
              <p className="text-sm text-gray-600">{product.description}</p>
            </div>
          )}

          {extraInfo?.usageTips && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">
                Dicas de uso:
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {extraInfo.usageTips}
              </p>
            </div>
          )}

          {extraInfo?.ingredients && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">
                Ingredientes:
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {extraInfo.ingredients}
              </p>
            </div>
          )}

          {extraInfo?.funFact && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">
                Você sabia?
              </h3>
              <p className="text-sm text-gray-600 mt-1">{extraInfo.funFact}</p>
            </div>
          )}

          {!product.description &&
            !extraInfo?.usageTips &&
            !extraInfo?.ingredients &&
            !extraInfo?.funFact && (
              <div>
                <p className="text-sm text-gray-500">
                  Informações adicionais sobre este produto estarão disponíveis
                  em breve.
                </p>
              </div>
            )}

          {/* Peso e pacote */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {rawWeight && (
              <span className="flex items-center">
                <Scale className="h-3 w-3 mr-1" />
                {rawWeight.toFixed(2)}kg
              </span>
            )}
            {isPackage && (
              <span className="flex items-center">
                <Package className="h-3 w-3 mr-1" />
                Pacote
              </span>
            )}
          </div>

          {!isInStock && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center text-red-600">
              <XCircle className="h-5 w-5 mr-2 flex-shrink-0" />
              <span>Produto indisponível no momento.</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-xl font-bold text-red-600">
              {Number(employeePrice || 0).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </span>

            {isInStock ? (
              <div className="flex items-center">
                <Button
                  onClick={handleDecreaseQuantity}
                  variant="outline"
                  size="icon"
                  className={`rounded-full h-8 w-8 ${
                    quantity === 0 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  disabled={quantity === 0}
                >
                  <Minus className="h-4 w-4" />
                </Button>

                <div className="flex items-center">
                  <Input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    className="mx-2 h-8 w-12 px-2 text-center"
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />

                  {showApplyButton && (
                    <Button
                      onClick={handleApplyQuantity}
                      variant="outline"
                      size="sm"
                      className="ml-1 h-8 px-2"
                    >
                      <Check className="h-3 w-3 mr-1" /> Aplicar
                    </Button>
                  )}
                </div>

                <Button
                  onClick={handleAddToCart}
                  variant="outline"
                  size="icon"
                  className="rounded-full h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 border-red-500"
                disabled
              >
                <XCircle className="h-4 w-4 mr-1" /> Indisponível
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetail;
