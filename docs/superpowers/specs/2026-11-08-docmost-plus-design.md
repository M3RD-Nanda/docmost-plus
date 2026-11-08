# Docmost Plus — Design Doc

Tanggal: 2026-11-08 · Fork dari `docmost/docmost` @ tag rilis (`v0.97.0`) · Pemeliharaan: **jangka panjang, ikut rilis upstream**

## 1. Tujuan

Menambahkan 7 kemampuan yang di Docmost berada di tier berbayar, sebagai implementasi **mandiri** di atas core AGPL-3.0, tanpa menyentuh kode Enterprise sama sekali.

| # | Fitur | Nilai bagi IKH/Mitramedika |
|---|---|---|
| F1 | MFA (TOTP + recovery code) | Wajib untuk akun pengelola SPMI/keuangan |
| F2 | API keys | Integrasi skrip/backup/laporan tanpa sesi login |
| F3 | SSO OIDC | Login pakai akun institusi, tanpa kelola password lokal |
| F4 | Diagram (Mermaid, Excalidraw, Drawio) | Diagram alur SPMI langsung di halaman |
| F5 | Pencarian lampiran PDF/DOCX | SOP/borang yang diunggah bisa dicari isinya |
| F6 | AI & MCP | Tanya-jawab isi wiki + akses agen |
| F7 | Kanban & Bases (mini-database) | Daftar temuan audit, rekap borang, tracker tindakan |

## 2. Non-tujuan

- Menyalin, memindahkan, atau mengaktifkan kode di `apps/server/src/ee/`, `apps/client/src/ee/`, atau `packages/ee/` (semuanya berlisensi Docmost Enterprise Edition).
- Menjual/menyewakan hasil fork sebagai layanan (AGPL §13 + lisensi EE).
- Menyalip upstream pada fitur yang sama; kita menambah, bukan mengganti.
- SAML 2.0 dan LDAP (hanya OIDC di iterasi ini).

## 3. Batas lisensi (dipatuhi, bukan didiskusikan)

- Core: **AGPL-3.0** (`LICENSE` root). Modifikasi wajib menawarkan source ke pengguna yang mengakses lewat jaringan → string "Source" di footer + repo internal.
- `apps/client/src/ee/LICENSE` menyatakan: *"Files in this directory are subject to the Docmost Enterprise Edition license… may only be used in production … with a valid Docmost Enterprise Edition subscription."* → direktori itu **beku, tidak dibaca sebagai bahan**, dan build kita mengabaikannya.
- Kode yang kita tulis 100% baru. Nama tabel/kolom di bawah berasal dari file migrasi publik (AGPL), bukan dari kode EE.

## 4. Arsitektur: fork tipis + layanan pendamping

```
                 ┌──────────────────────────────────────────┐
  browser ──────▶│ docmost-plus (image sendiri)             │
                 │  core: auth, page, search, attachment    │
                 │  +plus: mfa, apikey, oidc, diagram,      │
                 │         search-indexer, ai, bases        │
                 └───────┬───────────────┬──────────────────┘
                         │ Postgres      │ Redis (BullMQ)
                         ▼               ▼
                 ┌───────────────┐  ┌────────────────────────┐
                 │ pg-shared/own │  │ sidecar: ai-mcp (Node) │
                 └───────────────┘  │  • LLM proxy           │
                                    │  • MCP server (HTTP)   │
                                    └────────────────────────┘
```

Aturan supaya merge upstream tetap murah — **prioritas 1: file baru, prioritas 2: tambal titik sambung**:

| Boleh diubah (titik sambung, jumlah kecil) | Dilarang diubah struktur |
|---|---|
| `apps/server/src/app.module.ts` (1 baris import modul) | menulis ulang `core/auth/auth.service.ts` |
| `core/auth/auth.controller.ts`, `core/auth/strategies/jwt.strategy.ts`, `core/attachment/processors/attachment.processor.ts` (redirect 3 `require` EE → `plus/`) | menyentuh `src/ee/**` |
| `apps/client/src/App.tsx` (1 route/panel) | mengubah komponen editor yang ada |
| `apps/client/src/features/editor/extensions/extensions.ts` + `readonly-page-editor.tsx` (node Mermaid) | mengubah skema tabel inti |

✔ **Koreksi rev. 2:** core ternyata memanggil modul EE lewat `require()` dalam `try/catch` — jadi slot integrasinya sudah resmi dan kontraknya tertulis di kode AGPL:

| Slot | Kontrak yang harus dipenuhi | Fitur |
|---|---|---|
| `core/auth/auth.controller.ts:68` | `MfaService.checkMfaRequirements(loginInput, workspace, res)` → `{userHasMfa, requiresMfaSetup, isMfaEnforced, authToken}` | F1 |
| `core/auth/strategies/jwt.strategy.ts:104` | `ApiKeyService.validateApiKey(payload: JwtApiKeyPayload)` | F2 |
| `core/attachment/processors/attachment.processor.ts:43` | `AttachmentEeService.indexAttachment(id)` / `indexAttachments(workspaceId)` | F5 |

Perubahan core untuk ketiganya = mengganti string path require: **3 baris**. Tidak ada logika core ditulis ulang.

Semua kode fitur baru hidup di: `apps/server/src/plus/<fitur>/` dan `apps/client/src/features/plus/<fitur>/`.

## 5. Peta modul per fitur

### F1 — MFA TOTP
- Tabel sudah ada (migrasi publik `20250715T070817-mfa.ts`): `user_mfa(id, user_id, method, secret, is_enabled, backup_codes text[], workspace_id)` + `workspaces.enforce_mfa`.
- Baru: `plus/mfa/` → `mfa.service.ts` (otplib: `generateSecret`, `verifySync`, window 1), `mfa.controller.ts`:
  `POST /plus/mfa/setup` (balikan otpauth URL + QR), `POST /plus/mfa/enable` (verifikasi kode), `POST /plus/mfa/disable`, `POST /plus/mfa/verify` (langkah kedua login), `POST /plus/mfa/backup-codes/regenerate`.
- ✔ Sambung: **bukan** di `auth.service.ts`. Core sudah memanggil `require('./../../ee/mfa/services/mfa.service')` di `auth.controller.ts:68`; kita ganti path itu ke `plus/mfa` dan sediakan `MfaService.checkMfaRequirements()`. Bila user ber-MFA atau workspace `enforce_mfa` → core membalas `{userHasMfa, requiresMfaSetup, isMfaEnforced}`; cookie hanya dipasang setelah verifikasi.
- UI: `features/plus/mfa/` — SetupWizard (QR + 6 kotak kode + simpan recovery), langkah verifikasi di halaman login.
- Batas: rate limit 5 percobaan/5 menit per user (Redis), secret dienkripsi at-rest dengan `APP_SECRET` (AES-256-GCM).

### F2 — API keys
- Tabel sudah ada: `api_keys(id, name, creator_id, workspace_id, expires_at, last_used_at, deleted_at)`; hash disimpan di `id`-turunan? → tambah kolom baru `key_hash varchar unique` + `key_prefix varchar` lewat migrasi **kita** (`20261110T000001-plus-api-key-hash.ts`), jangan ubah migrasi upstream.
- Baru: `plus/apikey/` → service (generate `dkp_<32 base62>`, simpan SHA-256, tampilkan plaintext sekali), `ApiKeyGuard` (header `Authorization: Bearer dkp_…` atau `X-API-Key`), `@Workspace()` + `@User()` diisi dari key.
- ✔ Sambung: `jwt.strategy.ts:104` sudah memanggil `require('./../../../ee/api-key/api-key.service')` → cukup redirect ke `plus/apikey` yang mengekspor `ApiKeyService.validateApiKey(payload)`. Tidak perlu guard baru di `JwtAuthGuard`.
- UI: halaman Settings → API keys (list, create, revoke, last used). Plaintext key ditampilkan sekali; hash SHA-256 di DB.

### F3 — SSO OIDC
- Tabel sudah ada: `auth_providers(type, oidc_issuer, oidc_client_id, oidc_client_secret, allow_signup, is_enabled, workspace_id)`, `auth_accounts(user_id, provider_id, provider_user_id, …)`.
- Baru: `plus/oidc/` → `GET /plus/sso/providers` (publik, untuk tombol login), `GET /plus/sso/:id/authorize` (state+PKCE, simpan state di Redis), `GET /plus/sso/:id/callback` (tukar code → id_token → klaim `sub/email/name`), provisioning: auto-create user bila `allow_signup`, selain itu tolak dengan pesan jelas.
- Library: `openid-client` v6 (satu dependensi, bukan framework).
- UI: tombol "Masuk dengan SSO" di halaman login + halaman admin untuk CRUD provider (issuer, client id/secret, allow signup, test connection).

### F4 — Diagram ✔ **dua dari tiga sudah ada di core publik**
- **Drawio** (`extensions.ts:99`, dep `react-drawio`) dan **Excalidraw** (`extensions.ts:100`, dep `@excalidraw/excalidraw`) sudah terpasang dan aktif — bukan fitur EE, tidak perlu dikerjakan.
- Yang baru hanya **Mermaid**: node Tiptap `plus/diagram/mermaid-node.ts` (textarea + render `mermaid`), entri di `slash-menu`, dan 1 baris di `readonly-page-editor.tsx` (filter `mainExtensions`). Estimasi 1 hari.
- Batas: mermaid dirender client-side; render server (PDF/print) menyusul bila dibutuhkan.

### F5 — Pencarian lampiran PDF/DOCX
- ✔ Koreksi saat implementasi: `core/search/search.service.ts` **tidak** membaca `attachments.text_content` (kolom itu di sana milik tabel `pages`), jadi pencarian lampiran butuh endpoint sendiri. Queue `ATTACHMENT_QUEUE` + job `ATTACHMENT_INDEX_CONTENT` + kolom `tsv` tetap sudah ada.
- ✔ Selesai: `plus/attachment-index/attachment-index.service.ts` (ekstraktor: pdf-parse, mammoth, teks polos) + `attachment-search.service.ts` (`GET /plus/search/attachments?q=`, ts_headline + filter `PagePermissionRepo`). Terverifikasi di staging: unggah .txt/.docx → `tsv` terisi → 4/4 kueri mengembalikan berkas dengan cuplikan bertanda.
- Query: `plus/search/attachment-search.controller.ts` → `GET /plus/search/attachments?q=` memakai `tsv @@ plainto_tsquery`, ranking `ts_rank`, filter `workspace_id` + permission halaman induk.
- Backfill: CLI `pnpm plus:index-attachments` untuk 0 lampiran lama.
- Batas: OCR scan tidak termasuk (butuh tesseract; tambah belakangan bila perlu).

### F6 — AI & MCP
- Tabel sudah ada: `ai_chats`, `ai_chat_messages(role, content, tool_calls jsonb, …)`.
- Baru: sidecar `sidecar/ai-mcp/` (Node/Fastify, container terpisah):
  - `POST /chat` — RAG: embed pertanyaan → cari halaman relevan (pg tsvector dulu, embedding bila ada) → panggil LLM OpenAI-compatible (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`).
  - `GET /mcp` + `POST /mcp` — MCP server (JSON-RPC 2.0, Streamable HTTP) dengan tool: `search_pages`, `get_page`, `list_spaces`, `create_page` (butuh scope khusus).
- Docmost menyimpan riwayat chat lewat `plus/ai/` (controller → tulis ke `ai_chats`/`ai_chat_messages`, stream SSE dari sidecar).
- UI: panel chat kanan (fitur kecil, 1 halaman).
- Batas: hanya provider OpenAI-compatible; tanpa embedding server → fallback tsvector. Tidak ada training/fine-tune.

### F7 — Kanban & Bases
- ✔ Skema **sudah lengkap**: `pages.is_base`, `base_properties` (termasuk `pending_type`), `base_rows`, **`base_views(id, name, type, position, config)`**, plus `packages/base-formula` (mesin formula publik). Tidak perlu tabel baru — batalkan rencana `plus_base_views`.
- Baru: `plus/base/` — service + controller:
  - CRUD property (tipe: text, number, select, multi-select, date, checkbox, formula), CRUD row, `POST /plus/base/:pageId/query` (filter/sort/group server-side, cursor pagination).
  - View: `table`, `kanban` (group by select), `list` — definisi disimpan di `base_views.config`.
  - Formula: evaluasi lewat `packages/base-formula`, tidak menulis parser.
- UI: `features/plus/base/` — tabel virtual memakai `@tanstack/react-virtual` (sudah ada di lockfile); drag-drop kanban memakai **HTML5 native drag events** (`@dnd-kit` belum ada → jangan tambah dependensi).
- Batas: relation & rollup ditunda ke iterasi 2; dulu tipe skalar + formula.

## 6. Urutan irisan (slice) — tiap slice harus hijau sebelum lanjut

| Slice | Isi | Gate |
|---|---|---|
| **P0** | Bootstrap fork: `main` rebase ke tag, branch `plus/main`, CI build image sendiri, README fork, `docs/upstream-sync.md` | `pnpm build` + image jalan di lokal, halaman kosong tidak berubah |
| **P1** | F1 MFA + F2 API keys (semua di modul auth, risiko terkecil) | unit test otplib + e2e login MFA; API key bisa akses `/api/pages` |
| **P2** | F4 Mermaid (1 hari) + F5 ekstraktor lampiran (1–2 hari) | mermaid render + persist setelah reload; 20 PDF/DOCX terindeks & bisa dicari |
| **P3** | F3 SSO OIDC | login lewat Authentik/Keycloak lokal; tes provisioning user baru |
| **P4** | F6 AI & MCP | jawaban menyitir halaman nyata; MCP `tools/list` + `search_pages` lulus curl |
| **P5** | F7 Bases (iterasi 1) | 3 view jalan, 500 baris tanpa lag, formula benar |

## 7. Strategi sinkron upstream (karena dipelihara bertahun-tahun)

- Fork memakai **`upstream/main` read-only**; branch kerja `plus/main`. Tidak pernah commit langsung ke `main`.
- Rilis upstream diikuti per **tag** (`v0.98.0`, dst.), bukan tiap commit: `git fetch upstream --tags && git rebase v0.98.0` di `plus/main`.
- Semua perubahan pada file inti dicatat di `docs/upstream-sync.md` (file → alasan → baris). Target: **≤ 7 file inti tersentuh** (3 `require` redirect, `app.module.ts`, `App.tsx`, `extensions.ts`, `readonly-page-editor.tsx`). Fitur berikutnya wajib sidecar/file baru.
- `scripts/guard-ee.mjs` (pre-commit + CI): memblokir **file** yang berubah di `apps/client/src/ee/**` dan `packages/ee/**` (allowlist per-file, bukan blokir path — `apps/server/src/ee/` kosong karena submodule).
- Migrasi kita selalu **file baru** dengan prefix tanggal > upstream, tidak pernah menyunting migrasi lama.
- Build: `Dockerfile.plus` (turunan `Dockerfile`), tag image `ghcr.io/<org>/docmost-plus:<versi-upstream>-plus.<n>`.

## 8. Testing & kualitas

- Unit: Vitest (sudah dipakai repo) untuk service murni (TOTP, hash API key, formula, query builder).
- Integrasi: Postgres nyata via `docker compose -f docker-compose.test.yml`; uji migrasi `up/down`.
- E2E: Playwright — login MFA, SSO mock (mock OIDC provider), buat base + 100 baris, upload PDF lalu cari isinya.
- Gate per slice: `pnpm lint`, `pnpm test`, `pnpm build`, image boot + smoke `/api/health`.

## 9. Rollout

1. Image `plus` diuji di `docs2.mtrinanda.id` (container terpisah, DB sendiri).
2. Migrasi DB: `pnpm migration:up` (kysely) — hanya menambah.
3. Bila stabil ≥1 minggu: pindahkan `docs.mtrinanda.id` ke image `plus`, DB di-`pg_dump` dulu (script `/root/scripts/docmost-backup.sh` sudah ada).
4. Rollback: deploy image upstream `0.97.0` + restore dump; semua tabel `plus_*` diabaikan bila tak dipakai.

## 10. Risiko

| Risiko | Mitigasi |
|---|---|
| Merge upstream makin mahal | 7 titik sambung, semua 1–3 baris, ditandai `// plus:`; guard CI; rebase per tag |
| Basis/Kanban tumbuh tak terkendali | Iterasi 1 dibatasi tipe skalar + 3 view; relation/rollup ditunda |
| Kualitas AI halusinasi | Jawaban wajib menyertakan sitasi page id; bila tidak ada halaman relevan → "belum ada di wiki" |
| Fork jadi yatim | Tiap slice punya tes + dokumentasi; tidak ada fitur tanpa gate |
| Lisensi | Kode EE tidak disentuh; footer "Source" untuk AGPL |
