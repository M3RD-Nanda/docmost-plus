#!/usr/bin/env node
/**
 * E2E Docmost Plus — jalankan terhadap instance mana pun:
 *
 *   BASE_URL=https://docs2.mtrinanda.id \
 *   QA_EMAIL=qa@contoh.id QA_PASSWORD=... [QA_TOTP_SECRET=...] \
 *   node scripts/e2e/plus-e2e.mjs
 *
 * Tanpa dependensi. Exit code != 0 bila ada yang gagal.
 * Catatan: skrip ini MENULIS data (API key, basis, halaman) — pakai akun QA,
 * bukan akun produksi.
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;
const TOTP_SECRET = process.env.QA_TOTP_SECRET || "";
const UA = "docmost-plus-e2e/1.0";

if (!EMAIL || !PASSWORD) {
  console.error("QA_EMAIL dan QA_PASSWORD wajib diisi");
  process.exit(2);
}

let cookie = "";
const results = [];

async function call(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const h = { "User-Agent": UA, ...headers };
  if (cookie) h.cookie = cookie;
  let payload;
  if (raw) payload = body;
  else if (body !== undefined) {
    h["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, unwrapped: data && data.data !== undefined ? data.data : data };
}

function check(name, cond, detail = "") {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${detail ? `  [${detail}]` : ""}`);
}

function totp(secret) {
  const crypto = require("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.replace(/[\s=]/g, "").toUpperCase();
  let bits = 0,
    value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = crypto.createHmac("sha1", Buffer.from(out)).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1e6).padStart(6, "0");
}

(async () => {
  // 1. health
  const health = await call("/api/health");
  check("health database+redis up", health.status === 200 && health.data?.info?.database?.status === "up");

  // 2. login (+ MFA bila aktif)
  let login = await call("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PASSWORD } });
  if (login.unwrapped?.userHasMfa) {
    check("login meminta MFA", true);
    if (!TOTP_SECRET) {
      check("QA_TOTP_SECRET tersedia", false, "MFA aktif tapi secret tidak diberikan");
    } else {
      const verify = await call("/api/plus/mfa/verify", {
        method: "POST",
        body: { mfaToken: login.unwrapped.mfaToken, code: totp(TOTP_SECRET) },
      });
      check("verify MFA → sesi", verify.status === 200);
    }
  } else {
    check("login sukses", login.status === 200);
  }

  // 3. status MFA
  const mfaStatus = await call("/api/plus/mfa/status");
  check("GET /plus/mfa/status", mfaStatus.status === 200 && typeof mfaStatus.unwrapped?.enabled === "boolean");

  // 4. API key: buat → pakai → cabut
  const created = await call("/api/plus/api-keys", { method: "POST", body: { name: "e2e", expiresInDays: 1 } });
  const keyToken = created.unwrapped?.token;
  check("buat API key", !!keyToken);
  if (keyToken) {
    const viaKey = await fetch(BASE + "/api/pages", { headers: { Authorization: "Bearer " + keyToken, "User-Agent": UA } });
    check("API key diterima /api/pages", viaKey.status === 200);
    const revoked = await call(`/api/plus/api-keys/${created.unwrapped.id}`, { method: "DELETE" });
    check("cabut API key", revoked.status === 200 || revoked.status === 204);
    const afterRevoke = await fetch(BASE + "/api/pages", { headers: { Authorization: "Bearer " + keyToken, "User-Agent": UA } });
    check("API key yang dicabut ditolak", afterRevoke.status === 401);
  }

  // 5. Bases: halaman → property → baris → sort → hapus
  const spaces = await call("/api/spaces", { method: "POST", body: {} });
  const spaceId = spaces.unwrapped?.items?.[0]?.id;
  const page = await call("/api/pages/create", { method: "POST", body: { title: "E2E Basis", spaceId } });
  const pageId = page.unwrapped?.id;
  check("buat halaman", !!pageId);
  if (pageId) {
    check("promote ke basis", (await call(`/api/plus/bases/${pageId}`, { method: "POST", body: { isBase: true } })).status < 300);
    await call(`/api/plus/base/${pageId}/properties`, { method: "POST", body: { id: "e2eNum", name: "Nilai", type: "number" } });
    const r1 = await call(`/api/plus/base/${pageId}/rows`, { method: "POST", body: { cells: { e2eNum: 5 } } });
    const r2 = await call(`/api/plus/base/${pageId}/rows`, { method: "POST", body: { cells: { e2eNum: 9 } } });
    const sorted = await call(`/api/plus/base/${pageId}/rows?sort=e2eNum&dir=desc&type=number`);
    const values = (sorted.unwrapped?.items ?? []).map((r) => r.cells?.e2eNum ?? r.cells?.e2e_num);
    check("sort numerik desc", JSON.stringify(values) === "[9,5]", JSON.stringify(values));
    const patched = await call(`/api/plus/base/${pageId}/rows/${r1.unwrapped?.id}`, { method: "PATCH", body: { cells: { e2eNum: 7 } } });
    check("update sel", patched.status < 300);
    const deleted = await call(`/api/plus/base/${pageId}/rows/${r2.unwrapped?.id}`, { method: "DELETE" });
    check("hapus baris", deleted.status < 300);
    const rowsLeft = await call(`/api/plus/base/${pageId}/rows`);
    check("sisa baris = 1", (rowsLeft.unwrapped?.items ?? []).length === 1);
  }

  // 6. pencarian lampiran (harus 200 walau kosong)
  const att = await call("/api/plus/search/attachments?q=e2e");
  check("GET /plus/search/attachments", att.status === 200 && Array.isArray(att.unwrapped?.items));

  // 7. MCP: initialize + tools/list
  const mcpInit = await call("/api/plus/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "initialize" } });
  check("MCP initialize", mcpInit.unwrapped?.result?.serverInfo?.name === "docmost-plus");
  const mcpTools = await call("/api/plus/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 2, method: "tools/list" } });
  const toolNames = (mcpTools.unwrapped?.result?.tools ?? []).map((t) => t.name).sort();
  check("MCP tools/list", JSON.stringify(toolNames) === JSON.stringify(["get_page", "list_spaces", "search_pages"]), toolNames.join(","));

  // 8. AI (bila key dikonfigurasi, harus menjawab atau jujur "belum ada di wiki")
  const ai = await call("/api/plus/ai/chat", { method: "POST", body: { message: "e2e pemeriksaan" } });
  const aiAnswer = ai.unwrapped?.answer ?? "";
  check("AI chat menjawab (bukan error 5xx)", ai.status < 500, `HTTP ${ai.status}`);
  check("AI tidak mengarang saat konteks kosong", aiAnswer.length > 0);

  // 9. SSO admin: buat & hapus provider uji
  const sso = await call("/api/plus/sso/admin/providers", {
    method: "POST",
    body: { name: "E2E", issuer: "https://accounts.google.com", clientId: "e2e-client", clientSecret: "e2e-secret" },
  });
  check("buat provider SSO", sso.status < 300 && !!sso.unwrapped?.id);
  if (sso.unwrapped?.id) {
    const del = await call(`/api/plus/sso/admin/providers/${sso.unwrapped.id}`, { method: "DELETE", body: {} });
    check("hapus provider SSO", del.status < 300);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} lulus`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error("E2E error:", err);
  process.exit(3);
});
