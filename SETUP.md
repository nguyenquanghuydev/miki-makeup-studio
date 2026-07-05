# Miki Makeup Studio — Hybrid: Cloudflare (frontend) + VPS Docker (backend)

Cả hai đều **tự động deploy khi push git**.

```
                 ┌─────────────────────────────┐
   Khách  ─────▶ │ Cloudflare Pages (frontend)  │   auto-deploy khi push (Git tích hợp)
                 │ frontend/ : index, admin, db │
                 └───────────────┬─────────────┘
                                 │ gọi API (HTTPS, CORS)
                                 ▼
                 ┌─────────────────────────────┐
                 │ Cloudflare Tunnel  → VPS     │
                 │ Docker: api (Node) + db (PG) │   auto-pull git bằng cron
                 └─────────────────────────────┘
```

- Repo: https://github.com/nguyenquanghuydev/miki-makeup-studio
- `frontend/` → Cloudflare Pages. `server/` + `docker-compose.yml` → VPS.

---

## PHẦN A — Backend trên VPS (Docker)

### A1. Lấy mã nguồn + cấu hình
```bash
git clone https://github.com/nguyenquanghuydev/miki-makeup-studio.git
cd miki-makeup-studio
cp .env.example .env
nano .env      # điền POSTGRES_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
```

### A2. Đưa API ra internet bằng Cloudflare Tunnel (HTTPS, không mở port)
1. Cloudflare **Zero Trust → Networks → Tunnels → Create a tunnel** → chọn **Cloudflared** (Docker).
2. Copy **token**, dán vào `.env`:
   ```
   TUNNEL_TOKEN=eyJ...
   COMPOSE_PROFILES=tunnel      # bỏ dấu # để bật cloudflared
   ```
3. Trong tunnel, thêm **Public hostname**:
   - Subdomain: `api` · Domain: `mikimakeup.shop`  → `api.mikimakeup.shop`
   - Service: **HTTP** · URL: `api:3000`
   (Cloudflared chạy chung mạng Docker nên gọi được `api:3000`.)

### A3. Khởi động
```bash
docker compose up -d --build
```
Lần đầu API tự tạo bảng + tài khoản admin. Kiểm tra:
```bash
curl https://api.mikimakeup.shop/api/health     # {"ok":true}
```

### A4. Tự động pull git (auto-deploy backend qua GitHub Actions) — ĐÃ CẤU HÌNH

Mỗi khi push `main` có đổi **backend** (`server/`, `docker-compose.yml`, `deploy/`),
GitHub Actions (`.github/workflows/deploy.yml`) sẽ SSH vào VPS và chạy `deploy/auto-deploy.sh`
(git pull + `docker compose up -d --build`). Frontend do Cloudflare Pages tự deploy riêng.

**Bảo mật (đã thiết lập):**
- Dùng **deploy key riêng** (không phải key cá nhân), lưu trong GitHub Secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`.
- Key CI bị **khoá bằng forced-command** trong `~/.ssh/authorized_keys`:
  ```
  command="/opt/miki-makeup-studio/deploy/auto-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... miki-ci-deploy
  ```
  → key này **chỉ chạy được đúng script deploy**, không thể chạy lệnh khác trên VPS (kể cả nếu lộ).

**Bấm deploy tay:** GitHub → Actions → *Deploy backend to VPS* → *Run workflow*.

**(Tuỳ chọn) Cron dự phòng** nếu không muốn phụ thuộc Actions:
```
*/2 * * * * /opt/miki-makeup-studio/deploy/auto-deploy.sh >> /var/log/miki-deploy.log 2>&1
```

---

## PHẦN B — Frontend trên Cloudflare Pages (auto-deploy sẵn)

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Chọn repo `miki-makeup-studio`, branch **main**.
3. Cấu hình build:
   - Framework preset: **None**
   - Build command: **(để trống)**
   - **Build output directory: `frontend`**
4. **Save and Deploy**. Từ giờ **mỗi lần push git, Cloudflare tự build + deploy** frontend.
5. (Tuỳ chọn) Custom domains → thêm `mikimakeup.shop` cho trang Pages.

### B1. Trỏ frontend tới API
Sửa **`frontend/db-client.js`** dòng `MIKI_API_BASE` thành URL API thật:
```js
window.MIKI_API_BASE = "https://api.mikimakeup.shop";
```
Commit + push → Cloudflare tự deploy lại.

---

## Kiểm tra hoạt động
- Web khách: `https://<ten>.pages.dev/` (hoặc `mikimakeup.shop`)
- Admin: `.../admin.html` → đăng nhập bằng `ADMIN_EMAIL`/`ADMIN_PASSWORD`
- Sửa nội dung/ảnh trong admin → lưu → khách ở thiết bị khác thấy ngay (đồng bộ qua API + DB).
- Khách gửi đơn đặt lịch → hiện trong mục **Đơn đặt lịch** của admin.

## Vận hành nhanh
| Việc | Lệnh (trên VPS) |
|---|---|
| Log API | `docker compose logs -f api` |
| Log auto-deploy | `tail -f /var/log/miki-deploy.log` |
| Deploy tay | `git pull && docker compose up -d --build` |
| Backup DB | `docker compose exec db pg_dump -U miki miki > backup.sql` |
| Backup ảnh | volume `uploads` (vd `docker run --rm -v mikimakeup_uploads:/d -v $PWD:/b alpine tar czf /b/uploads.tgz -C /d .`) |
| Dừng | `docker compose down` (thêm `-v` để xoá cả DB & ảnh ⚠️) |

**Bảo mật:** `.env` (mật khẩu, JWT, tunnel token) đã được `.gitignore` — không bao giờ lên git.
API chỉ mở trên `127.0.0.1` của VPS; ra ngoài đi qua Cloudflare Tunnel (có SSL, không hở port).
