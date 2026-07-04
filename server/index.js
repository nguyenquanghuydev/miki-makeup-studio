/* ============================================================
   Miki Makeup Studio — API self-host (Express + PostgreSQL)
   Endpoint dùng bởi db-client.js:
     POST   /api/login            {email,password}   -> {token,email}
     GET    /api/me               (Bearer)           -> {email}
     POST   /api/change-password  (Bearer){password}
     GET    /api/content                             -> [{key,data}]   (công khai)
     PUT    /api/content/:key     (Bearer){data}
     GET    /api/bookings         (Bearer)           -> [rows]
     POST   /api/bookings         {name,phone,svc,date} -> row          (công khai)
     PATCH  /api/bookings/:id     (Bearer){status}
     DELETE /api/bookings/:id     (Bearer)
     POST   /api/upload           (Bearer, multipart file+path) -> {url}
     GET    /uploads/<file>       ảnh tĩnh
   ============================================================ */
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "doi-secret-nay-di";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@mikimakeup.vn").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "miki2026";
const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------- Khởi tạo schema + seed admin (có retry chờ DB) ---------- */
async function init(retries = 30) {
  try {
    await pool.query(`
      create table if not exists site_content (
        key text primary key,
        data jsonb not null,
        updated_at timestamptz default now()
      );
      create table if not exists bookings (
        id bigint generated always as identity primary key,
        name text, phone text, svc text, date text,
        status text default 'Chờ xác nhận',
        created_at timestamptz default now()
      );
      create table if not exists users (
        id serial primary key,
        email text unique not null,
        password_hash text not null
      );
    `);
    const u = await pool.query("select count(*)::int as n from users");
    if (u.rows[0].n === 0) {
      const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
      await pool.query("insert into users(email,password_hash) values($1,$2)", [ADMIN_EMAIL, hash]);
      console.log("Đã tạo admin mặc định:", ADMIN_EMAIL);
    }
    console.log("DB sẵn sàng.");
  } catch (e) {
    if (retries > 0) {
      console.log("Chờ DB... (" + retries + ")", e.code || e.message);
      await new Promise((r) => setTimeout(r, 2000));
      return init(retries - 1);
    }
    throw e;
  }
}

/* ---------- App ---------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "1h" }));

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const t = h.indexOf("Bearer ") === 0 ? h.slice(7) : "";
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: "Chưa đăng nhập hoặc phiên hết hạn" });
  }
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

/* ---- Auth ---- */
app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const pw = String(req.body.password || "");
    const r = await pool.query("select * from users where email=$1", [email]);
    if (!r.rows[0] || !bcrypt.compareSync(pw, r.rows[0].password_hash)) {
      return res.status(401).json({ error: "Email hoặc mật khẩu không đúng" });
    }
    const token = jwt.sign({ sub: r.rows[0].id, email: email }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token: token, email: email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/me", auth, (req, res) => res.json({ email: req.user.email }));

app.post("/api/change-password", auth, async (req, res) => {
  try {
    const pw = String(req.body.password || "");
    if (pw.length < 4) return res.status(400).json({ error: "Mật khẩu quá ngắn" });
    const hash = bcrypt.hashSync(pw, 10);
    await pool.query("update users set password_hash=$1 where id=$2", [hash, req.user.sub]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- Content (đọc công khai, ghi cần đăng nhập) ---- */
app.get("/api/content", async (req, res) => {
  try {
    const r = await pool.query("select key, data from site_content");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/content/:key", auth, async (req, res) => {
  try {
    const key = req.params.key;
    const data = req.body.data;
    await pool.query(
      `insert into site_content(key,data,updated_at) values($1,$2::jsonb,now())
       on conflict (key) do update set data=excluded.data, updated_at=now()`,
      [key, JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- Bookings (khách gửi được; xem/sửa/xoá cần đăng nhập) ---- */
app.get("/api/bookings", auth, async (req, res) => {
  try {
    const r = await pool.query("select * from bookings order by created_at desc");
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `insert into bookings(name,phone,svc,date,status) values($1,$2,$3,$4,$5) returning *`,
      [b.name || "Khách mới", b.phone || "", b.svc || "", b.date || "", b.status || "Chờ xác nhận"]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/bookings/:id", auth, async (req, res) => {
  try {
    await pool.query("update bookings set status=$1 where id=$2", [req.body.status, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/bookings/:id", auth, async (req, res) => {
  try {
    await pool.query("delete from bookings where id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- Upload ảnh (lưu lên đĩa, có volume Docker) ---- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.post("/api/upload", auth, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Thiếu file" });
    const raw = String(req.body.path || req.file.originalname || "img");
    let safe = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!/\.[a-zA-Z0-9]+$/.test(safe)) safe += ".jpg";
    fs.writeFileSync(path.join(UPLOAD_DIR, safe), req.file.buffer);
    res.json({ url: "/uploads/" + safe });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

init()
  .then(() => app.listen(PORT, () => console.log("API chạy ở cổng " + PORT)))
  .catch((e) => { console.error("Không khởi tạo được DB:", e); process.exit(1); });
