-- EventFlow V1 — recipe BOM + document sequences
-- Apply after 001_inventory.sql

create table if not exists public.recipe_ingredients (
  id text primary key,
  catering_id text not null,
  catering_name text not null default '',
  inventory_item_id text references public.inventory (id) on delete set null,
  ingredient_name text not null,
  qty_per_portion numeric(14, 6) not null default 0,
  unit text not null default 'ks',
  user_id text not null default 'local',
  updated_at timestamptz not null default now()
);

create index if not exists recipe_ingredients_catering_idx
  on public.recipe_ingredients (catering_id);
create index if not exists recipe_ingredients_inventory_idx
  on public.recipe_ingredients (inventory_item_id);

create table if not exists public.document_sequences (
  id text primary key default 'default',
  year integer not null,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.document_sequences (id, year, last_sequence)
values ('default', extract(year from now())::integer, 0)
on conflict (id) do nothing;

alter table public.recipe_ingredients enable row level security;
alter table public.document_sequences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'recipe_ingredients' and policyname = 'recipe_ingredients_all'
  ) then
    create policy recipe_ingredients_all on public.recipe_ingredients
      for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where tablename = 'document_sequences' and policyname = 'document_sequences_all'
  ) then
    create policy document_sequences_all on public.document_sequences
      for all using (true) with check (true);
  end if;
end $$;
