# Miki Makeup Studio — Hướng dẫn kết nối Supabase (đồng bộ đa thiết bị)

Làm theo các bước dưới (~5 phút). Sau khi xong, mọi thay đổi trong trang admin sẽ hiển thị
cho **mọi khách trên mọi thiết bị**, và ảnh được lưu trên cloud.

---

## Bước 1 — Tạo project Supabase

1. Vào https://supabase.com → **Sign in** → **New project**.
2. Đặt tên (vd `miki-studio`), chọn region gần Việt Nam (Singapore), đặt **Database Password** (lưu lại).
3. Đợi project khởi tạo xong (~1 phút).

## Bước 2 — Tạo bảng + phân quyền (RLS)

Vào **SQL Editor** → **New query** → dán toàn bộ đoạn SQL sau → **Run**:

```sql
-- Bảng nội dung (mỗi loại 1 dòng: pricing/courses/faq/testimonials/settings/images)
create table if not exists site_content (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz default now()
);

-- Bảng đơn đặt lịch
create table if not exists bookings (
  id         bigint generated always as identity primary key,
  name       text,
  phone      text,
  svc        text,
  date       text,
  status     text default 'Chờ xác nhận',
  created_at timestamptz default now()
);

-- Bật Row Level Security
alter table site_content enable row level security;
alter table bookings     enable row level security;

-- site_content: ai cũng ĐỌC được; chỉ tài khoản đăng nhập mới GHI
create policy "content_read_all"  on site_content for select using (true);
create policy "content_write_auth" on site_content for insert with check (auth.uid() is not null);
create policy "content_update_auth" on site_content for update using (auth.uid() is not null);

-- bookings: khách được GỬI đơn (insert); chỉ admin đăng nhập mới XEM/SỬA/XOÁ
create policy "booking_insert_all"  on bookings for insert with check (true);
create policy "booking_read_auth"   on bookings for select using (auth.uid() is not null);
create policy "booking_update_auth" on bookings for update using (auth.uid() is not null);
create policy "booking_delete_auth" on bookings for delete using (auth.uid() is not null);
```

## Bước 3 — Tạo bucket lưu ảnh

1. Vào **Storage** → **New bucket** → tên đúng là `site-images` → bật **Public bucket** → **Create**.
2. Vào **SQL Editor**, chạy tiếp đoạn này để cho phép admin upload/xoá ảnh (khách chỉ xem):

```sql
create policy "img_read_all"    on storage.objects for select using (bucket_id = 'site-images');
create policy "img_write_auth"  on storage.objects for insert with check (bucket_id = 'site-images' and auth.uid() is not null);
create policy "img_update_auth" on storage.objects for update using (bucket_id = 'site-images' and auth.uid() is not null);
create policy "img_delete_auth" on storage.objects for delete using (bucket_id = 'site-images' and auth.uid() is not null);
```

## Bước 4 — Tạo tài khoản admin

1. Vào **Authentication** → **Users** → **Add user** → **Create new user**.
2. Nhập **email** + **mật khẩu** cho bạn. Bật **Auto Confirm User** (để đăng nhập ngay).
3. Đây chính là email/mật khẩu bạn dùng để đăng nhập trang `admin.html`.

## Bước 5 — Dán khóa vào `supabase-config.js`

1. Vào **Project Settings** → **API**.
2. Copy **Project URL** và **anon public** key.
3. Mở file `supabase-config.js`, thay 2 dòng:

```js
window.MIKI_SUPABASE_URL = "https://xxxx.supabase.co";   // Project URL
window.MIKI_SUPABASE_ANON_KEY = "eyJhbGci...";           // anon public key
```

> ⚠️ Chỉ dùng khóa **anon public**. Tuyệt đối KHÔNG dán khóa **service_role** vào file này
> (nó là file công khai trên web).

---

## Xong!

- Mở `admin.html` → đăng nhập bằng email/mật khẩu ở Bước 4 → chỉnh nội dung, upload ảnh.
- Mở `index.html` trên bất kỳ thiết bị nào → thấy nội dung mới nhất. Khi đang mở, admin lưu gì
  thì web tự cập nhật (realtime).
- Khách gửi đơn đặt lịch trên web → xuất hiện trong mục **Đơn đặt lịch** của admin.

### Ghi chú
- **Chưa cấu hình?** Nếu để nguyên placeholder trong `supabase-config.js`, cả hai trang vẫn chạy
  bình thường bằng dữ liệu cục bộ (localStorage) — tiện để xem thử trước khi kết nối.
- **Deploy lên internet:** upload cả thư mục lên Netlify / Vercel / GitHub Pages (kéo-thả là được,
  không cần build). Nhớ đưa domain vào Supabase → **Authentication → URL Configuration** nếu cần.
- **Đổi mật khẩu admin:** làm trong Supabase → Authentication → Users (không đổi trong trang admin nữa).
