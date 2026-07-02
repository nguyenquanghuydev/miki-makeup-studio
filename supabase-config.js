/* ============================================================
   CẤU HÌNH SUPABASE — dùng chung cho index.html và admin.html
   ------------------------------------------------------------
   BƯỚC 1: Tạo project tại https://supabase.com (miễn phí).
   BƯỚC 2: Mở Project Settings → API, copy 2 giá trị dưới đây:
           - Project URL   → dán vào MIKI_SUPABASE_URL
           - anon public key → dán vào MIKI_SUPABASE_ANON_KEY
   (Đây là khóa "anon public" — an toàn để công khai trên web,
    vì đã được bảo vệ bằng RLS. KHÔNG dùng "service_role" key.)

   Xem SETUP.md để biết SQL tạo bảng + tạo tài khoản admin.
   Nếu để nguyên placeholder, web vẫn chạy bằng dữ liệu cục bộ.
   ============================================================ */

window.MIKI_SUPABASE_URL = "https://YOUR-PROJECT-ID.supabase.co";
window.MIKI_SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
window.MIKI_BUCKET = "site-images";

/* Khởi tạo client. Trả về null nếu chưa cấu hình → app tự chạy offline. */
window.SB = (function () {
  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") return null;
    if (!window.MIKI_SUPABASE_URL || window.MIKI_SUPABASE_URL.indexOf("YOUR-") === 0) return null;
    if (!window.MIKI_SUPABASE_ANON_KEY || window.MIKI_SUPABASE_ANON_KEY.indexOf("YOUR-") === 0) return null;
    return window.supabase.createClient(window.MIKI_SUPABASE_URL, window.MIKI_SUPABASE_ANON_KEY);
  } catch (e) {
    console.warn("Supabase chưa cấu hình, chạy chế độ cục bộ.", e);
    return null;
  }
})();
