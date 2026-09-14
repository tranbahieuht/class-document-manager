create table if not exists public.timetable (
  id uuid primary key default gen_random_uuid(),
  file_path text not null,
  file_url text not null,
  file_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  singleton boolean not null default true unique check (singleton)
);

create or replace function public.touch_timetable_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists timetable_touch_updated_at on public.timetable;
create trigger timetable_touch_updated_at
before update on public.timetable
for each row execute function public.touch_timetable_updated_at();

alter table public.timetable enable row level security;
drop policy if exists timetable_public_read on public.timetable;
create policy timetable_public_read
on public.timetable for select
using (true);
drop policy if exists timetable_admin_write on public.timetable;
create policy timetable_admin_write
on public.timetable for all
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('timetable', 'timetable', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists timetable_storage_public_read on storage.objects;
create policy timetable_storage_public_read
on storage.objects for select
using (bucket_id = 'timetable');
drop policy if exists timetable_storage_admin_insert on storage.objects;
create policy timetable_storage_admin_insert
on storage.objects for insert
with check (bucket_id = 'timetable' and public.is_admin());
drop policy if exists timetable_storage_admin_update on storage.objects;
create policy timetable_storage_admin_update
on storage.objects for update
using (bucket_id = 'timetable' and public.is_admin())
with check (bucket_id = 'timetable' and public.is_admin());
drop policy if exists timetable_storage_admin_delete on storage.objects;
create policy timetable_storage_admin_delete
on storage.objects for delete
using (bucket_id = 'timetable' and public.is_admin());
