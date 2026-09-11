insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists documents_storage_public_read on storage.objects;
create policy documents_storage_public_read
on storage.objects for select
using (bucket_id = 'documents');

drop policy if exists documents_storage_admin_insert on storage.objects;
create policy documents_storage_admin_insert
on storage.objects for insert
with check (bucket_id = 'documents' and public.is_admin());

drop policy if exists documents_storage_admin_update on storage.objects;
create policy documents_storage_admin_update
on storage.objects for update
using (bucket_id = 'documents' and public.is_admin())
with check (bucket_id = 'documents' and public.is_admin());

drop policy if exists documents_storage_admin_delete on storage.objects;
create policy documents_storage_admin_delete
on storage.objects for delete
using (bucket_id = 'documents' and public.is_admin());