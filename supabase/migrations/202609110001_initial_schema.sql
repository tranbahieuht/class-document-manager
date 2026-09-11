create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('super_admin', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.user_role not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(), name text not null, code text not null unique,
  description text not null default '', icon text not null default 'book', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.subjects(id) on delete restrict,
  title text not null, topic text not null default '', description text not null default '', file_url text,
  file_path text, file_name text not null, file_type text not null, file_size bigint not null default 0 check (file_size >= 0),
  study_date date, uploaded_at timestamptz not null default now(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), uploaded_by uuid references public.profiles(id) on delete set null
);
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid, description text not null, created_at timestamptz not null default now()
);
create index if not exists documents_subject_id_idx on public.documents(subject_id);
create index if not exists documents_study_date_idx on public.documents(study_date);
create index if not exists documents_created_at_idx on public.documents(created_at desc);
create index if not exists documents_title_idx on public.documents using gin(to_tsvector('simple', title));
create index if not exists profiles_role_idx on public.profiles(role);
create unique index if not exists one_super_admin_idx
  on public.profiles ((role))
  where role = 'super_admin';

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active and role in ('admin', 'super_admin'));
$$;
create or replace function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active and role = 'super_admin');
$$;
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.role = 'super_admin' and auth.role() is not null then
    raise exception 'Only the initial SQL setup may create a super_admin profile';
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role and auth.role() is not null then
    raise exception 'Profile roles cannot be changed through the client or API';
  end if;
  return new;
end;
$$;
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role before insert or update on public.profiles for each row execute function public.protect_profile_role();
drop trigger if exists subjects_touch_updated_at on public.subjects;
create trigger subjects_touch_updated_at before update on public.subjects for each row execute function public.touch_updated_at();
drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at before update on public.documents for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.documents enable row level security;
alter table public.activity_logs enable row level security;
drop policy if exists profiles_self_or_super on public.profiles;
create policy profiles_self_or_super on public.profiles for select using (id = auth.uid() or public.is_super_admin());
drop policy if exists profiles_no_client_insert on public.profiles;
create policy profiles_no_client_insert on public.profiles for insert with check (false);
drop policy if exists profiles_super_update on public.profiles;
create policy profiles_super_update on public.profiles for update using (public.is_super_admin()) with check (role = 'admin' or (id = auth.uid() and role = 'super_admin'));
drop policy if exists profiles_super_delete on public.profiles;
create policy profiles_super_delete on public.profiles for delete using (public.is_super_admin() and role = 'admin');
drop policy if exists subjects_public_read on public.subjects;
create policy subjects_public_read on public.subjects for select using (is_active or public.is_admin());
create policy subjects_admin_write on public.subjects for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists documents_public_read on public.documents;
create policy documents_public_read on public.documents for select using (exists(select 1 from public.subjects s where s.id = subject_id and s.is_active) or public.is_admin());
create policy documents_admin_write on public.documents for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists activity_super_read on public.activity_logs;
create policy activity_super_read on public.activity_logs for select using (public.is_super_admin());
create policy activity_admin_insert on public.activity_logs for insert with check (auth.uid() = user_id and public.is_admin());

create or replace function public.audit_content_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_logs (user_id, action, entity_type, entity_id, description)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(new.id, old.id), tg_op || ' ' || tg_table_name);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists subjects_audit on public.subjects;
create trigger subjects_audit after insert or update or delete on public.subjects for each row execute function public.audit_content_change();
drop trigger if exists documents_audit on public.documents;
create trigger documents_audit after insert or update or delete on public.documents for each row execute function public.audit_content_change();
