// src/components/admin/ProductFormSimple.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ProductFormValues = {
  name: string;
  description?: string;
  price?: number;
  category_id: number;
  sort_order?: number;
};

type Props = {
  defaultValues?: Partial<ProductFormValues>;
  categories: { id: number; name: string }[];
  submitLabel?: string;
  onSubmit: (values: ProductFormValues, file?: File) => void | Promise<void>;
};

export default function ProductFormSimple({ defaultValues, categories, submitLabel = "Salvar", onSubmit }: Props) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [price, setPrice] = useState<number | undefined>(defaultValues?.price);
  const [categoryId, setCategoryId] = useState<number>(defaultValues?.category_id ?? (categories[0]?.id ?? 1));
  const [sortOrder, setSortOrder] = useState<number | undefined>(defaultValues?.sort_order);
  const [file, setFile] = useState<File | undefined>();

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(
          {
            name,
            description,
            price: price ?? undefined,
            category_id: Number(categoryId),
            sort_order: sortOrder ?? undefined,
          },
          file
        );
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Imagem</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(ev) => setFile(ev.target.files?.[0])}
          />
        </div>
        <div>
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pão de Queijo 1kg" />
        </div>

        <div>
          <Label>Preço (R$)</Label>
          <Input
            type="number"
            step="0.01"
            value={price ?? ""}
            onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : undefined)}
            placeholder="Ex.: 34,90"
          />
        </div>

        <div>
          <Label>Categoria</Label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>Descrição</Label>
        <Textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detalhes do produto..."
        />
      </div>

      <div>
        <Label>Ordem (opcional)</Label>
        <Input
          type="number"
          value={sortOrder ?? ""}
          onChange={(e) => setSortOrder(e.target.value ? Number(e.target.value) : undefined)}
          placeholder="Ex.: 10"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
