-- EventFlow V1 — Staff shifts, advances, monthly payroll locks
-- Container: staff_shifts (+ staff_advances, staff_payroll)

create table if not exists public.staff_shifts (
  id text primary key,
  user_id text not null default 'local',
  staff_id text not null,
  staff_name text not null,
  role text not null default 'Personál',
  date date not null,
  shift_start text not null,
  shift_end text not null,
  hours numeric(10, 2) not null default 0,
  hourly_wage numeric(12, 2) not null default 0,
  labor_cost numeric(12, 2) not null default 0,
  source text not null default 'pos',
  project_id text,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_shifts_date_idx on public.staff_shifts (date desc);
create index if not exists staff_shifts_staff_id_idx on public.staff_shifts (staff_id);
create index if not exists staff_shifts_user_id_idx on public.staff_shifts (user_id);

create table if not exists public.staff_advances (
  id text primary key,
  user_id text not null default 'local',
  staff_id text not null,
  staff_name text not null,
  amount numeric(12, 2) not null default 0,
  month_key text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists staff_advances_month_idx on public.staff_advances (month_key);
create index if not exists staff_advances_staff_idx on public.staff_advances (staff_id);

create table if not exists public.staff_payroll (
  id text primary key,
  user_id text not null default 'local',
  staff_id text not null,
  staff_name text not null,
  role text not null default 'Personál',
  month_key text not null,
  hours numeric(10, 2) not null default 0,
  gross_wage numeric(12, 2) not null default 0,
  advances numeric(12, 2) not null default 0,
  payout numeric(12, 2) not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (staff_id, month_key)
);

create index if not exists staff_payroll_month_idx on public.staff_payroll (month_key);

alter table public.staff_shifts enable row level security;
alter table public.staff_advances enable row level security;
alter table public.staff_payroll enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'staff_shifts' and policyname = 'staff_shifts_all'
  ) then
    create policy staff_shifts_all on public.staff_shifts for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'staff_advances' and policyname = 'staff_advances_all'
  ) then
    create policy staff_advances_all on public.staff_advances for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where tablename = 'staff_payroll' and policyname = 'staff_payroll_all'
  ) then
    create policy staff_payroll_all on public.staff_payroll for all using (true) with check (true);
  end if;
end $$;
