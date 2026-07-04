# Miki Makeup Studio — Self-host (Docker + PostgreSQL + Node API + Nginx)

Toàn bộ hệ thống chạy bằng **Docker Compose**: web tĩnh + API + PostgreSQL, đồng bộ đa thiết bị,
lưu ảnh trên đĩa (volume). Không phụ thuộc dịch vụ ngoài.

## Kiến trúc

```
Trình duyệt ──▶ Nginx (web:80) ──▶ file tĩnh (index.html, admin.html, db-client.js)
                       │
                       ├── /api/*   ─▶ Node API (Express)  ─▶ PostgreSQL
                       └── /uploads/* ─▶ Node API (ảnh trên volume)
```

- `db-client.js` thay thế Supabase — cùng interface nên `index.html` / `admin.html` gần như giữ nguyên.
- Đọc nội dung: công khai. Ghi nội dung / xem đơn / upload ảnh: cần đăng nhập (JWT).
- Khách gửi đơn đặt lịch: công khai (không cần đăng nhập).

---

## Chạy trên VPS (yêu cầu: Docker + Docker Compose)

### 1. Lấy mã nguồn về VPS
```bash
git clone https://github.com/nguyenquanghuydev/miki-makeup-studio.git
cd miki-makeup-studio
```

### 2. Tạo file cấu hình bí mật `.env`
```bash
cp .env.example .env
nano .env        # điền giá trị THẬT
```
Cần đổi:
| Biến | Ý nghĩa |
|---|---|
| `POSTGRES_PASSWORD` | Mật khẩu database (đặt mạnh) |
| `JWT_SECRET` | Chuỗi ngẫu nhiên dài — tạo bằng `openssl rand -hex 32` |
| `ADMIN_EMAIL` | Email đăng nhập trang admin |
| `ADMIN_PASSWORD` | Mật khẩu admin khởi tạo lần đầu |
| `WEB_PORT` | Cổng web (mặc định 8080) |

> `.env` đã được `.gitignore` — không bao giờ bị đẩy lên git.

### 3. Khởi động
```bash
docker compose up -d --build
```
Lần đầu API sẽ tự: tạo bảng (`site_content`, `bookings`, `users`) và tạo tài khoản admin từ `.env`.

### 4. Truy cập
- Web khách: `http://<IP-VPS>:8080/`
- Trang admin: `http://<IP-VPS>:8080/admin.html` → đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Gắn tên miền + HTTPS (khuyến nghị)

Đặt một reverse proxy có SSL trước cổng web. Cách nhanh nhất là **Caddy** (tự cấp SSL Let's Encrypt):

`Caddyfile`:
```
mikimakeup.shop, www.mikimakeup.shop {
    reverse_proxy localhost:8080
}
```
Rồi trỏ DNS bản ghi **A** của `mikimakeup.shop` về IP VPS (và `www` CNAME về `mikimakeup.shop`).
(Hoặc dùng Nginx Proxy Manager / Traefik nếu bạn quen.)

Nếu API chạy khác tên miền với web, sửa `db-client.js`:
```js
window.MIKI_API_BASE = "https://api.mikimakeup.shop";
```

---

## Vận hành

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose logs -f api` |
| Dừng | `docker compose down` |
| Dừng + xoá dữ liệu | `docker compose down -v`  ⚠️ mất DB & ảnh |
| Cập nhật code | `git pull && docker compose up -d --build` |
| Sao lưu DB | `docker compose exec db pg_dump -U miki miki > backup.sql` |
| Phục hồi DB | `cat backup.sql \| docker compose exec -T db psql -U miki miki` |
| Sao lưu ảnh | ảnh nằm trong volume `uploads` (vd: `docker run --rm -v mikimakeup_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .`) |

**Đổi mật khẩu admin:** đăng nhập admin → **Cài đặt → Đổi mật khẩu admin** (lưu vào DB, không cần sửa `.env`).

## Dữ liệu được lưu ở đâu
- Nội dung (bảng giá, khóa học, FAQ, đánh giá, cài đặt, ảnh): bảng `site_content`.
- Đơn đặt lịch: bảng `bookings`.
- Tài khoản admin: bảng `users` (mật khẩu băm bcrypt).
- Ảnh upload: volume Docker `uploads`, phục vụ ở `/uploads/...`.
