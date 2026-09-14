create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null default '',
  content text not null default '',
  image_path text,
  image_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  avatar_path text,
  avatar_url text,
  department text not null default '',
  position text not null default '',
  bio text not null default '',
  email text,
  contact_url text,
  show_email boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_subjects (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete restrict,
  primary key (teacher_id, subject_id)
);

create table if not exists public.class_members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  avatar_path text,
  avatar_url text,
  student_code text,
  role text not null default 'Thành viên',
  sort_order integer not null default 0,
  email text,
  phone text,
  show_email boolean not null default false,
  show_phone boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_published_at_idx on public.news(published, published_at desc);
create index if not exists teachers_sort_order_idx on public.teachers(is_active, sort_order, full_name);
create index if not exists class_members_sort_order_idx on public.class_members(is_active, sort_order, full_name);

create trigger news_touch_updated_at
before update on public.news
for each row execute function public.touch_updated_at();
create trigger teachers_touch_updated_at
before update on public.teachers
for each row execute function public.touch_updated_at();
create trigger class_members_touch_updated_at
before update on public.class_members
for each row execute function public.touch_updated_at();

alter table public.news enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.class_members enable row level security;

create policy news_public_read on public.news
for select using (published or public.is_admin());
create policy news_admin_write on public.news
for all using (public.is_admin()) with check (public.is_admin());

create policy teachers_public_read on public.teachers
for select using (is_active or public.is_admin());
create policy teachers_admin_write on public.teachers
for all using (public.is_admin()) with check (public.is_admin());

create policy teacher_subjects_public_read on public.teacher_subjects
for select using (
  exists (select 1 from public.teachers t where t.id = teacher_id and (t.is_active or public.is_admin()))
);
create policy teacher_subjects_admin_write on public.teacher_subjects
for all using (public.is_admin()) with check (public.is_admin());

create policy class_members_public_read on public.class_members
for select using (is_active or public.is_admin());
create policy class_members_admin_write on public.class_members
for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values
  ('news', 'news', true),
  ('teachers', 'teachers', true),
  ('class-members', 'class-members', true)
on conflict (id) do update set public = excluded.public;

create policy news_storage_public_read on storage.objects
for select using (bucket_id = 'news');
create policy news_storage_admin_insert on storage.objects
for insert with check (bucket_id = 'news' and public.is_admin());
create policy news_storage_admin_update on storage.objects
for update using (bucket_id = 'news' and public.is_admin())
with check (bucket_id = 'news' and public.is_admin());
create policy news_storage_admin_delete on storage.objects
for delete using (bucket_id = 'news' and public.is_admin());

create policy teachers_storage_public_read on storage.objects
for select using (bucket_id = 'teachers');
create policy teachers_storage_admin_insert on storage.objects
for insert with check (bucket_id = 'teachers' and public.is_admin());
create policy teachers_storage_admin_update on storage.objects
for update using (bucket_id = 'teachers' and public.is_admin())
with check (bucket_id = 'teachers' and public.is_admin());
create policy teachers_storage_admin_delete on storage.objects
for delete using (bucket_id = 'teachers' and public.is_admin());

create policy class_members_storage_public_read on storage.objects
for select using (bucket_id = 'class-members');
create policy class_members_storage_admin_insert on storage.objects
for insert with check (bucket_id = 'class-members' and public.is_admin());
create policy class_members_storage_admin_update on storage.objects
for update using (bucket_id = 'class-members' and public.is_admin())
with check (bucket_id = 'class-members' and public.is_admin());
create policy class_members_storage_admin_delete on storage.objects
for delete using (bucket_id = 'class-members' and public.is_admin());
