alter table public.products
  add column if not exists is_hidden boolean not null default false;

comment on column public.products.is_hidden is
  'Quando true, o produto fica oculto no catalogo sem ser excluido.';
