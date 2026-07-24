-- =============================================================================
-- EventFlow V1 — Supabase Storage bucket: cctv-recordings
-- =============================================================================
-- Path structure (immutable contract):
--   cctv-recordings/{camera_id}/{YYYY-MM-DD}/{hour}.mp4
--   example: cctv-recordings/cam_01/2026-07-24/14.mp4
--
-- Lifecycle rule (capacity guard):
--   Every 24 hours, purge any object whose age > 60 days (~2 months).
--   Prefer Dashboard → Storage → cctv-recordings → Lifecycle, OR the cron
--   function below for projects without native lifecycle UI.
-- =============================================================================

-- 1) Create private bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cctv-recordings',
  'cctv-recordings',
  false,
  524288000, -- 500 MB per chunk
  array['video/mp4', 'video/webm', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) RLS policies — authenticated staff can read/write their org paths
-- Adjust `auth.role()` / JWT claims to match your EventFlow auth model.

drop policy if exists "cctv_recordings_select" on storage.objects;
create policy "cctv_recordings_select"
on storage.objects for select
to authenticated
using (bucket_id = 'cctv-recordings');

drop policy if exists "cctv_recordings_insert" on storage.objects;
create policy "cctv_recordings_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cctv-recordings'
  and (storage.foldername(name))[1] like 'cam_%'
);

drop policy if exists "cctv_recordings_update" on storage.objects;
create policy "cctv_recordings_update"
on storage.objects for update
to authenticated
using (bucket_id = 'cctv-recordings')
with check (bucket_id = 'cctv-recordings');

drop policy if exists "cctv_recordings_delete" on storage.objects;
create policy "cctv_recordings_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'cctv-recordings');

-- Service role / edge workers need full access for lifecycle purge
drop policy if exists "cctv_recordings_service_all" on storage.objects;
create policy "cctv_recordings_service_all"
on storage.objects for all
to service_role
using (bucket_id = 'cctv-recordings')
with check (bucket_id = 'cctv-recordings');

-- =============================================================================
-- 3) Lifecycle cleanup every 24 hours (age > 60 days)
-- =============================================================================
-- Option A (recommended): Supabase Dashboard → Storage → Lifecycle policy:
--   Rule name: cctv-60-day-purge
--   Prefix: (empty / entire bucket)
--   Delete after: 60 days
--   Run cadence: every 24 hours (platform managed)
--
-- Option B: pg_cron + SQL helper (enable extensions: pg_cron, pg_net / or use
-- an Edge Function with service role). Example marker function:

create or replace function public.cctv_purge_recordings_older_than_60_days()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer := 0;
begin
  -- Delete storage.objects metadata older than 60 days in cctv-recordings.
  -- Physical bytes are removed by Storage GC after object row deletion.
  with doomed as (
    select id
    from storage.objects
    where bucket_id = 'cctv-recordings'
      and created_at < (now() - interval '60 days')
  ),
  del as (
    delete from storage.objects o
    using doomed d
    where o.id = d.id
    returning o.id
  )
  select count(*)::integer into deleted_count from del;

  return deleted_count;
end;
$$;

-- Schedule daily (requires pg_cron). Uncomment in production:
-- select cron.schedule(
--   'cctv-recordings-60d-purge',
--   '0 3 * * *', -- every day at 03:00 UTC
--   $$ select public.cctv_purge_recordings_older_than_60_days(); $$
-- );

comment on function public.cctv_purge_recordings_older_than_60_days() is
  'EventFlow CCTV: purge cctv-recordings objects older than 60 days (run every 24h).';
