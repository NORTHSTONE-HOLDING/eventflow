-- EventFlow V1 — Inventory / Stock / Auditing schema
-- Run in Supabase SQL editor when VITE_SUPABASE_URL is configured.

create extension if not exists "pgcrypto";

create table if not exists public.inventory (
  id text primary key,
  user_id text not null default 'local',
  name text not null,
  barcode text,
  category text not null default 'raw',
  subcategory text not null default 'ostatni',
  supplier text not null default '',
  purchase_price numeric(12, 2) not null default 0,
  average_price numeric(12, 2) not null default 0,
  vat_rate numeric(5, 2) not null default 12,
  unit text not null default 'ks',
  current_quantity numeric(14, 3) not null default 0,
  minimum_quantity numeric(14, 3) not null default 0,
  shelf_life text,
  warehouse_section text not null default 'Hlavní sklad',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_user_id_idx on public.inventory (user_id);
create index if not exists inventory_name_idx on public.inventory (lower(name));
create index if not exists inventory_barcode_idx on public.inventory (barcode);

create table if not exists public.inventory_logs (
  id text primary key,
  item_id text not null references public.inventory (id) on delete cascade,
  type text not null,
  quantity_changed numeric(14, 3) not null,
  user_id text not null default 'local',
  timestamp timestamptz not null default now(),
  note text,
  unit_price numeric(12, 2)
);

create index if not exists inventory_logs_item_id_idx on public.inventory_logs (item_id);
create index if not exists inventory_logs_timestamp_idx on public.inventory_logs (timestamp desc);

alter table public.inventory enable row level security;
alter table public.inventory_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'inventory' and policyname = 'inventory_all'
  ) then
    create policy inventory_all on public.inventory for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'inventory_logs' and policyname = 'inventory_logs_all'
  ) then
    create policy inventory_logs_all on public.inventory_logs for all using (true) with check (true);
  end if;
end $$;
