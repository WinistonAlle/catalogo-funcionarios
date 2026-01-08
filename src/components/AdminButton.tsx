// src/components/AdminButton.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import ProductsAdminSimple from "@/components/admin/ProductsAdminSimple";

export default function AdminButton() {
  const { isAdmin, loading } = useIsAdmin();
  const [open, setOpen] = useState(false);

  // enquanto verifica, não mostra nada (ou deixe um botão desabilitado se preferir)
  if (loading) return null;

  // se não for admin, não renderiza o botão
  if (!isAdmin) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Admin Produtos</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Administração de Produtos</SheetTitle>
        </SheetHeader>
        <div className="py-4">
          <ProductsAdminSimple onDone={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
