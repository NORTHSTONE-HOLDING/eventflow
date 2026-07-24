-- EventFlow — product-images Storage bucket policies
-- Path schema: product-images/{user_id}/{product_id}.jpg

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
on storage.objects for select
using (bucket_id = 'product-images');

drop policy if exists "product_images_auth_upload" on storage.objects;
create policy "product_images_auth_upload"
on storage.objects for insert
with check (
  bucket_id = 'product-images'
  and (auth.role() = 'authenticated' or auth.role() = 'anon')
);

drop policy if exists "product_images_auth_update" on storage.objects;
create policy "product_images_auth_update"
on storage.objects for update
using (
  bucket_id = 'product-images'
  and (auth.role() = 'authenticated' or auth.role() = 'anon')
);

drop policy if exists "product_images_auth_delete" on storage.objects;
create policy "product_images_auth_delete"
on storage.objects for delete
using (
  bucket_id = 'product-images'
  and (auth.role() = 'authenticated' or auth.role() = 'anon')
);
