# Tạo SUPER ADMIN đầu tiên

Tài liệu này không chứa email, UUID hoặc password cụ thể. Password chỉ được nhập trong Supabase Auth và không được lưu trong database/migration.

## 1. Tạo user trong Supabase Auth

1. Mở Supabase Dashboard của project.
2. Vào **Authentication > Providers > Email** và tắt **Allow new users to sign up**.
3. Vào **Authentication > Users**.
4. Chọn **Add user**.
5. Nhập email thật của chủ sở hữu hệ thống.
6. Nhập password mạnh trong Dashboard.
7. Xác nhận user đã được tạo.
8. Sao chép đúng `User UID` của user vừa tạo.

Không dùng UUID tự sinh, UUID ví dụ hoặc email mẫu.

## 2. Tạo profile super admin

Mở **SQL Editor**. Dùng câu SQL dưới đây sau khi thay `USER_UID_THAT` bằng UUID thật vừa sao chép. Email được lấy trực tiếp từ `auth.users`, không nhập lại email giả và không lưu password.

```sql
insert into public.profiles (id, email, full_name, role, is_active)
select
  id,
  email,
  'tranbahieu042008@gmail.com',
  'super_admin'::public.user_role,
  true
from auth.users
where id = '7e09b980-00c7-4210-a5a4-1232dd8c74b7'::uuid
returning id, email, full_name, role, is_active;
```

Nếu câu lệnh không trả về dòng nào, UUID không tồn tại trong `auth.users`. Không tự thay bằng UUID khác; hãy kiểm tra lại User UID trong Authentication.

Tên trong `full_name` phải được thay bằng tên thật của chủ sở hữu.

## 3. Kiểm tra profile

```sql
select
  p.id,
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  (p.id in (select id from auth.users)) as auth_user_exists
from public.profiles p
where p.role = 'super_admin';
```

Kết quả mong muốn:

- Chỉ có một dòng `super_admin`.
- `id` trùng với User UID trong Authentication.
- `email` trùng email Auth thật.
- `auth_user_exists` là `true`.
- `is_active` là `true`.

Database có unique index `one_super_admin_idx`, vì vậy không thể tồn tại dòng super admin thứ hai. Trigger `profiles_protect_role` cũng chặn client/API tạo hoặc đổi role thành `super_admin`.

## 4. Kiểm tra RLS

Đăng nhập website bằng user vừa tạo. User đó phải truy cập được `/admin` và `/admin/users`.

Không tạo user super admin bằng frontend, public signup hoặc cách gửi `role` từ client.