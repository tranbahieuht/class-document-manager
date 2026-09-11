# Tích hợp Supabase

## 1. Tạo project và chạy migration
Tạo project tại Supabase Dashboard. Trong SQL Editor chạy theo đúng thứ tự:

1. `supabase/migrations/202609110001_initial_schema.sql`
2. `supabase/migrations/202609110002_storage.sql`

Migration đầu tiên chỉ tạo schema, functions, triggers và RLS. Migration thứ hai tạo bucket `documents` và Storage policies. Cả hai migration đều không tạo user, profile hoặc password.

Sau khi chạy SQL, vào **Authentication > Providers > Email** và tắt **Allow new users to sign up**. Việc này ngăn public signup; migration SQL không thể thay đổi cấu hình Auth Dashboard này.

## 2. Cấu hình frontend
Tạo `.env` từ `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Chỉ dùng `anon key` ở frontend. Không đưa `service_role key` vào Vite.

Backend invitation (đặt ở môi trường server, không commit vào repository):

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_KEY
API_PORT=8787
```

## 3. Tạo super admin đầu tiên
Làm theo file [SUPER_ADMIN_SETUP.md](SUPER_ADMIN_SETUP.md). File này hướng dẫn tạo user thật trong Authentication trước, sau đó tạo profile bằng đúng `auth.users.id`. Không có flow public nào tạo `super_admin`.

## 4. Chạy app

```powershell
npm install
npm run dev
```

## 5. Cấp admin
Super admin đăng nhập tại `/admin/login`, mở `/admin/users` và gửi invitation. Frontend gửi access token hiện tại đến `POST /api/admin/invite`. Server dùng Supabase Admin API với `SUPABASE_SERVICE_ROLE_KEY`, kiểm tra token bằng `auth.getUser()`, đọc profile người gọi và chỉ tiếp tục nếu role là `super_admin` và `is_active = true`. Server luôn tạo Auth user/profile với role `admin`; admin thường nhận `403` và không thể tự gửi role khác.

## 6. Storage và RLS
Migration `202609110002_storage.sql` tạo bucket `documents`, policy public read cho file thuộc bucket và policy ghi/xóa chỉ cho admin. Public chỉ đọc subject active và document thuộc subject active.

## 7. Kiểm tra bảo mật
Trong SQL Editor kiểm tra role bằng:

```sql
select id, email, role, is_active from public.profiles;
```

Không cho client update role. Chỉ `super_admin` được update profile; policy không cho đổi role thành `super_admin`.

Activity log cho subject/document được ghi bằng database trigger. Khi triển khai production nên chuyển endpoint invitation sang Supabase Edge Function hoặc server riêng có `SUPABASE_SERVICE_ROLE_KEY`. Không bật email redirect tùy ý: cấu hình Site URL và Redirect URLs trong Authentication > URL Configuration.
