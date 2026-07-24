-- EventFlow — Hybrid product image provisioning
-- Adds image_url on inventory + Storage bucket product-images

alter table public.inventory
  add column if not exists image_url text;

alter table public.inventory
  add column if not exists sale_price numeric(12, 2) not null default 0;

alter table public.inventory
  add column if not exists pack_volume numeric(14, 3);

alter table public.inventory
  add column if not exists open_pack_remaining numeric(14, 3);

alter table public.inventory
  add column if not exists pos_visible boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/*']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
