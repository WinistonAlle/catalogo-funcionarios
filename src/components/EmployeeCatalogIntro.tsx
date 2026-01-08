// src/components/EmployeeCatalogIntro.tsx
import { ShieldCheck, Truck, ShoppingBag } from "lucide-react";

export default function EmployeeCatalogIntro() {
  return (
    <section className="w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl border bg-card/80 backdrop-blur shadow-sm px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-2">
                Catálogo interno para funcionários
              </p>

              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                Produtos Gostinho Mineiro
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                Consulte os produtos disponíveis, valores especiais e detalhes
                de forma rápida e organizada. Este catálogo é de uso exclusivo
                para colaboradores da empresa.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3 py-3">
              <div className="mt-0.5">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Uso interno e seguro
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Acesso restrito a funcionários, com dados de produtos sempre
                  atualizados.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3 py-3">
              <div className="mt-0.5">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Visualização prática
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Busque por nome ou código, filtre por categoria e veja os
                  detalhes completos de cada item.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3 py-3">
              <div className="mt-0.5">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">
                  Organizado para o dia a dia
                </p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Pensado para facilitar o fechamento de pedidos internos e o
                  fluxo de trabalho da equipe.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
