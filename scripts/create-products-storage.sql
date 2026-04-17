-- Rode este SQL no SQL Editor do Supabase.
-- Cria/ajusta o bucket publico usado no upload de imagens de produtos
-- e garante policies basicas para usuarios autenticados.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'products',
  'products',
  true,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Products images are public to read'
  ) then
    create policy "Products images are public to read"
      on storage.objects
      for select
      to public
      using (bucket_id = 'products');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload product images'
  ) then
    create policy "Authenticated users can upload product images"
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'products');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update product images'
  ) then
    create policy "Authenticated users can update product images"
      on storage.objects
      for update
      to authenticated
      using (bucket_id = 'products')
      with check (bucket_id = 'products');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete product images'
  ) then
    create policy "Authenticated users can delete product images"
      on storage.objects
      for delete
      to authenticated
      using (bucket_id = 'products');
  end if;
end $$;
