// src/components/admin/ProductsAdminSimple.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ProductFormSimple, { ProductFormValues } from "./ProductFormSimple";
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct, uploadProductImage, useCategories } from "../../hooks/useProducts";


type Props = { onDone?: () => void };

export default function ProductsAdminSimple({ onDone }: Props) {
  const { data: products, isLoading, error } = useProducts();
  const { data: categories } = useCategories();
  const createMut = useCreateProduct();
  const updateMut = useUpdateProduct();
  const deleteMut = useDeleteProduct();

  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleCreate(values: ProductFormValues, file?: File) {
    let image_url: string | undefined;
    if (file) image_url = await uploadProductImage(file);

    await createMut.mutateAsync({
      name: values.name,
      description: values.description ?? null,
      price_public: values.price ?? null,
      category_id: values.category_id,
      active: true,
      sort_order: values.sort_order ?? null,
      image_url,
    } as any);
  }

  async function handleUpdate(values: ProductFormValues, file?: File) {
    if (!editingId) return;
    let image_url: string | undefined = products?.find(p => p.id === editingId)?.image_url ?? undefined;
    if (file) image_url = await uploadProductImage(file);

    await updateMut.mutateAsync({
      id: editingId,
      name: values.name,
      description: values.description ?? null,
      price_public: values.price ?? null,
      category_id: values.category_id,
      sort_order: values.sort_order ?? null,
      active: true,
      image_url,
    } as any);

    setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Produtos</h3>

        {/* Criar novo */}
        <Dialog>
          <DialogTrigger asChild>
            <Button>Novo produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Novo produto</DialogTitle>
            </DialogHeader>
            <ProductFormSimple
              categories={categories ?? []}
              onSubmit={handleCreate}
              submitLabel="Criar"
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && <p>Carregando…</p>}
      {error && <p className="text-sm text-red-500">{(error as any)?.message}</p>}

      <div className="grid gap-3">
        {products?.map((p) => (
          <Card key={p.id} className="p-3 flex items-center gap-3">
            <img
              src={p.image_url ?? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="}
              alt={p.name}
              className="h-14 w-14 rounded-md object-cover bg-muted"
            />
            <div className="flex-1">
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                Cat: {p.category_id} • {p.active ? "Ativo" : "Inativo"}
              </div>
              {p.price_public != null && (
                <div className="text-sm">Preço: R$ {p.price_public.toFixed(2)}</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Editar */}
              <Dialog open={editingId === p.id} onOpenChange={(o) => setEditingId(o ? p.id : null)}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">Editar</Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Editar produto</DialogTitle>
                  </DialogHeader>
                  <ProductFormSimple
                    categories={categories ?? []}
                    defaultValues={{
                      name: p.name,
                      description: p.description ?? "",
                      price: p.price_public ?? undefined,
                      category_id: p.category_id,
                      sort_order: p.sort_order ?? undefined,
                    }}
                    onSubmit={handleUpdate}
                    submitLabel="Salvar"
                  />
                </DialogContent>
              </Dialog>

              {/* Excluir */}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMut.mutate(p.id)}
              >
                Excluir
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        {onDone && (
          <Button variant="outline" onClick={onDone}>Fechar</Button>
        )}
      </div>
    </div>
  );
}

