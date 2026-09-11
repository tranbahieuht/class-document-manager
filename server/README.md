# RBAC API

API này dùng cookie session HttpOnly và password hash bằng Node `scrypt`.

Thiết lập trước khi chạy:

```powershell
$env:SUPER_ADMIN_EMAIL="owner@example.com"
$env:SUPER_ADMIN_PASSWORD="một-mật-khẩu-dài-tối-thiểu-12-ký-tự"
$env:SUPER_ADMIN_NAME="Hiếu"
npm run api
```

Không đưa các biến này vào frontend. Lần chạy đầu sẽ tạo `server/data/app.json`; file này chứa hash mật khẩu và session server-side, không chứa plaintext password.
