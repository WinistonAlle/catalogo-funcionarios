import React, { createContext, useContext, useState, useEffect } from "react";
import { Product, CartItem } from "../types/products";
import { FREE_SHIPPING_THRESHOLD } from "../data/shipping";
import { MIN_PACKAGES, MIN_WEIGHT_KG } from "@/data/products";

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  decreaseQuantity: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  cartTotal: number;
  itemsCount: number;
  freeShippingRemaining: number;
  totalWeight: number;
  packageCount: number;
  meetsMinimumOrder: boolean;
  addMultipleToCart: (products: { product: Product; quantity: number }[]) => void;
  animateCartIcon: number;
  showFreeShippingAnimation: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

// 🔐 Gera uma "assinatura" do usuário atual pra separar os carrinhos
// Tenta pegar cpf; se não achar, usa o JSON cru como assinatura
function getEmployeeSignature(): string {
  try {
    const raw = localStorage.getItem("employee_session");
    if (!raw) return "anon";

    try {
      const parsed = JSON.parse(raw);

      const cpf = parsed?.cpf || parsed?.employee?.cpf || parsed?.user?.cpf;

      if (cpf && typeof cpf === "string" && cpf.trim().length > 0) {
        return cpf.trim();
      }
    } catch {
      // se não der pra fazer parse, usa o raw mesmo
    }

    // fallback: usa o JSON bruto como assinatura
    return raw;
  } catch {
    return "anon";
  }
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [animateCartIcon, setAnimateCartIcon] = useState(0);

  // ✅ Pop-up/animação de frete grátis REMOVIDOS
  const showFreeShippingAnimation = false;

  // 🧾 Assinatura do usuário atual (se mudar, a gente troca de carrinho)
  const [employeeSignature, setEmployeeSignature] = useState<string>(() => {
    if (typeof window === "undefined") return "anon";
    return getEmployeeSignature();
  });

  // Chave final usada no localStorage
  const cartStorageKey = `cart_${employeeSignature}`;

  // 👀 Observa mudanças no employee_session (mesma aba, sem reload)
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastSignature = getEmployeeSignature();
    setEmployeeSignature(lastSignature);

    const interval = setInterval(() => {
      const current = getEmployeeSignature();
      if (current !== lastSignature) {
        console.log("[CartContext] employee_session mudou, trocando carrinho...");
        lastSignature = current;
        setEmployeeSignature(current);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // 📥 Carrega o carrinho sempre que o "dono" (assinatura) mudar
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const storedCart = localStorage.getItem(cartStorageKey);
      if (storedCart) {
        setCartItems(JSON.parse(storedCart));
      } else {
        setCartItems([]);
      }

      console.log("[CartContext] Carrinho carregado para", cartStorageKey);
    } catch (e) {
      console.error("Error parsing stored cart for key", cartStorageKey, e);
      setCartItems([]);
    }
  }, [cartStorageKey]);

  // 💰 Total do carrinho
  const cartTotal = cartItems.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0
  );

  // Quanto falta pro frete grátis (se você exibe isso em algum lugar)
  const freeShippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - cartTotal);

  // 💾 Salva o carrinho SEMPRE vinculado ao usuário atual
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(cartItems));
    } catch (e) {
      console.error("Error saving cart for key", cartStorageKey, e);
    }
  }, [cartItems, cartStorageKey]);

  const addToCart = (product: Product, quantity: number = 1) => {
    console.log(
      "CartContext - addToCart called with product:",
      product.name,
      "quantity:",
      quantity
    );
    setCartItems((prevItems) => {
      const existingItem = prevItems.find(
        (item) => item.product.id === product.id
      );

      if (existingItem) {
        return prevItems.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      } else {
        return [...prevItems, { product, quantity }];
      }
    });

    setAnimateCartIcon((prev) => prev + 1);
  };

  const addMultipleToCart = (
    products: { product: Product; quantity: number }[]
  ) => {
    console.log(
      "CartContext - addMultipleToCart called with products:",
      products.map((p) => p.product.name)
    );
    setCartItems((prevItems) => {
      const newItems = [...prevItems];

      products.forEach(({ product, quantity }) => {
        const existingItemIndex = newItems.findIndex(
          (item) => item.product.id === product.id
        );

        if (existingItemIndex >= 0) {
          newItems[existingItemIndex].quantity += quantity;
        } else {
          newItems.push({ product, quantity });
        }
      });

      return newItems;
    });

    setAnimateCartIcon((prev) => prev + 1);
    setIsCartOpen(true);
  };

  const decreaseQuantity = (productId: string) => {
    console.log("CartContext - decreaseQuantity called for productId:", productId);
    setCartItems((prevItems) => {
      return prevItems
        .map((item) => {
          if (item.product.id === productId) {
            const newQuantity = Math.max(0, item.quantity - 1);
            return newQuantity === 0 ? null : { ...item, quantity: newQuantity };
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    console.log("CartContext - removeFromCart called for productId:", productId);
    setCartItems((prevItems) =>
      prevItems.filter((item) => item.product.id !== productId)
    );
  };

  const updateQuantity = (productId: string, quantity: number) => {
    console.log("CartContext - updateQuantity called:", productId, quantity);

    if (quantity <= 0) {
      console.log("CartContext - removing item because quantity <= 0");
      removeFromCart(productId);
      return;
    }

    setCartItems((prevItems) => {
      console.log("CartContext - current cart items:", prevItems);
      const existingItemIndex = prevItems.findIndex(
        (item) => item.product.id === productId
      );

      if (existingItemIndex === -1) {
        console.log("CartContext - item not found in cart, can't update");
        return prevItems;
      }

      const newItems = prevItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      );
      console.log("CartContext - updated cart items:", newItems);
      return newItems;
    });
  };

  const clearCart = () => {
    console.log("CartContext - clearCart called");
    setCartItems([]);
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem(cartStorageKey);
      }
    } catch (e) {
      console.error("Error clearing cart for key", cartStorageKey, e);
    }
  };

  const toggleCart = () => setIsCartOpen((prev) => !prev);
  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);

  const itemsCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  const totalWeight = cartItems.reduce(
    (total, item) => total + item.product.weight * item.quantity,
    0
  );

  const packageCount = cartItems.reduce(
    (count, item) => (item.product.isPackage ? count + item.quantity : count),
    0
  );

  const meetsMinimumOrder =
    packageCount >= MIN_PACKAGES || totalWeight >= MIN_WEIGHT_KG;

  const value: CartContextType = {
    cartItems,
    addToCart,
    decreaseQuantity,
    removeFromCart,
    updateQuantity,
    clearCart,
    isCartOpen,
    toggleCart,
    openCart,
    closeCart,
    cartTotal,
    itemsCount,
    freeShippingRemaining,
    totalWeight,
    packageCount,
    meetsMinimumOrder,
    addMultipleToCart,
    animateCartIcon,
    showFreeShippingAnimation,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
