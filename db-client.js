/* ============================================================
   db-client.js — Lớp kết nối tới API self-host (thay cho Supabase)
   ------------------------------------------------------------
   Tạo window.SB với cùng "hình dạng" API mà index.html / admin.html
   đang dùng, nhưng bên dưới gọi REST tới backend Node.js của bạn.

   MIKI_API_BASE:
     - Để trống ""  → gọi cùng origin (khi Nginx proxy /api, /uploads).
       Đây là mặc định cho bản Docker Compose. Không cần sửa gì.
     - Nếu API chạy ở tên miền khác, điền vào, vd:
       window.MIKI_API_BASE = "https://api.mikimakeup.shop";
   ============================================================ */
(function () {
  window.MIKI_API_BASE = window.MIKI_API_BASE || "";
  var BASE = window.MIKI_API_BASE;
  var TOKEN_KEY = "miki-api-token";
  var uploadUrls = {}; // path -> url trả về từ server

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function authHeaders(json) {
    var h = {};
    if (json) h["Content-Type"] = "application/json";
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }
  async function req(method, path, body, isForm) {
    try {
      var opt = { method: method, headers: isForm ? authHeaders(false) : authHeaders(!!body) };
      if (body != null) opt.body = isForm ? body : JSON.stringify(body);
      var r = await fetch(BASE + path, opt);
      var data = null;
      try { data = await r.json(); } catch (e) {}
      if (!r.ok) return { data: null, error: { message: (data && data.error) || ("HTTP " + r.status), status: r.status } };
      return { data: data, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message || "network error" } };
    }
  }

  /* ---- Query builder mô phỏng supabase-js (thenable) ---- */
  function Query(table) {
    this.table = table; this._op = "select"; this._payload = null;
    this._eq = null; this._returning = false; this._conflict = null;
  }
  Query.prototype.select = function () {
    if (this._op === "insert" || this._op === "upsert") { this._returning = true; return this; }
    this._op = "select"; return this;
  };
  Query.prototype.order = function () { return this; };
  Query.prototype.insert = function (obj) { this._op = "insert"; this._payload = obj; return this; };
  Query.prototype.upsert = function (obj, opts) { this._op = "upsert"; this._payload = obj; this._conflict = opts && opts.onConflict; return this; };
  Query.prototype.update = function (obj) { this._op = "update"; this._payload = obj; return this; };
  Query.prototype.delete = function () { this._op = "delete"; return this; };
  Query.prototype.eq = function (col, val) { this._eq = { col: col, val: val }; return this; };
  Query.prototype.then = function (resolve, reject) { return this._exec().then(resolve, reject); };
  Query.prototype._exec = async function () {
    var t = this.table, op = this._op;
    if (op === "select") {
      if (t === "site_content") return req("GET", "/api/content");
      if (t === "bookings") return req("GET", "/api/bookings");
      return { data: [], error: null };
    }
    if (op === "insert") {
      if (t === "bookings") {
        var r = await req("POST", "/api/bookings", this._payload);
        if (this._returning) return { data: r.data ? [r.data] : null, error: r.error };
        return { data: null, error: r.error };
      }
    }
    if (op === "upsert") {
      if (t === "site_content") {
        var key = this._payload.key;
        return req("PUT", "/api/content/" + encodeURIComponent(key), { data: this._payload.data });
      }
    }
    if (op === "update") {
      if (t === "bookings" && this._eq) return req("PATCH", "/api/bookings/" + encodeURIComponent(this._eq.val), this._payload);
    }
    if (op === "delete") {
      if (t === "bookings" && this._eq) return req("DELETE", "/api/bookings/" + encodeURIComponent(this._eq.val));
    }
    return { data: null, error: { message: "unsupported op " + op + " on " + t } };
  };

  /* ---- Đối tượng SB tương thích ---- */
  window.SB = {
    from: function (table) { return new Query(table); },

    auth: {
      signInWithPassword: async function (creds) {
        var res = await req("POST", "/api/login", { email: creds.email, password: creds.password });
        if (res.error) return { data: null, error: res.error };
        if (res.data && res.data.token) { try { localStorage.setItem(TOKEN_KEY, res.data.token); } catch (e) {} }
        return { data: res.data, error: null };
      },
      getSession: async function () {
        if (!token()) return { data: { session: null } };
        var res = await req("GET", "/api/me");
        if (res.error) { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} return { data: { session: null } }; }
        return { data: { session: { user: res.data } } };
      },
      signOut: async function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} return { error: null }; },
      updateUser: async function (attrs) {
        var res = await req("POST", "/api/change-password", { password: attrs.password });
        return { data: res.data, error: res.error };
      }
    },

    storage: {
      from: function () {
        return {
          upload: async function (path, file) {
            var fd = new FormData();
            fd.append("path", path);
            fd.append("file", file);
            var res = await req("POST", "/api/upload", fd, true);
            if (res.error) return { data: null, error: res.error };
            if (res.data && res.data.url) uploadUrls[path] = res.data.url;
            return { data: res.data, error: null };
          },
          getPublicUrl: function (path) {
            return { data: { publicUrl: uploadUrls[path] || (BASE + "/uploads/" + path) } };
          }
        };
      }
    },

    /* Realtime giả lập bằng polling định kỳ (đồng bộ đa thiết bị). */
    channel: function () {
      var handlers = [];
      var api = {
        on: function (evt, filter, cb) { handlers.push(cb); return api; },
        subscribe: function () {
          setInterval(function () { handlers.forEach(function (cb) { try { cb(); } catch (e) {} }); }, 20000);
          return api;
        }
      };
      return api;
    }
  };
})();
