# Docmost Plus

Fork [Docmost](https://github.com/docmost/docmost) (AGPL-3.0) yang mengaktifkan fitur kelas Enterprise
tanpa lisensi. Semua tambahan berada di `plus/` (server) dan ditandai `// plus:` di kode inti, sehingga
`git pull upstream` tetap bisa di-merge.

## Fitur yang ditambahkan

| Fitur | Endpoint / UI | Catatan |
|---|---|---|
| MFA TOTP | `/settings/account/mfa-settings`, `/api/plus/mfa/*` | TOTP murni `node:crypto`, secret AES-256-GCM, backup code di-hash SHA-256, alur `mfaToken` 5 menit |
| API keys | `/settings/account/api-keys`, `/api/plus/api-keys` | Bearer token, `lastUsedAt`, masa berlaku, cabut seketika |
| SSO OIDC | `/settings/sso`, `/api/plus/sso/*` | discovery + verifikasi `id_token` via JWKS, `state` JWT 10 menit, client secret terenkripsi |
| Mermaid | slash menu "Mermaid" | `packages/editor-ext` |
| Pencarian lampiran | `GET /api/plus/search/attachments?q=` | `tsv` + `ts_headline`, di-scope izin halaman |
| AI & MCP | `/ai`, `/api/plus/ai/chat`, `/api/plus/mcp` | OpenRouter; MCP: `search_pages`, `get_page`, `list_spaces` |
| Bases & Kanban | `/base/:pageId`, `/api/plus/base/:pageId/*` | properti, baris, view tabel/kanban, sort, cursor |

## E2E

```bash
BASE_URL=https://docs2.mtrinanda.id QA_EMAIL=... QA_PASSWORD=... [QA_TOTP_SECRET=...] \
  node scripts/e2e/plus-e2e.mjs
```

Skrip menulis data uji (API key, halaman, basis) — jalankan di staging atau akun QA, bukan akun produksi.
Exit code ≠ 0 berarti ada yang gagal.

## Catatan operasional

- `APP_URL` **wajib** sama dengan host kanonik; kalau tidak, `redirect_uri` SSO dan link undangan salah host.
- `OPENROUTER_MODEL` harus model yang diizinkan akun OpenRouter-mu (`deepseek/deepseek-chat` terverifikasi).
- Pindah DB: `pg_dump` dari instance lama, lalu restore dengan `sed -E "/^ALTER .* OWNER TO /d"` karena role
  lama tidak ada di cluster baru.
- Fork ini tidak mengubah skema inti; tabel tambahan: `user_mfa`, `user_mfa_backup_codes`, `api_keys`,
  `auth_providers`, `ai_chats`, `ai_chat_messages`, `base_properties`, `base_rows`, `base_views`.

## Lisensi

Ikut AGPL-3.0 seperti upstream. Perubahan pada fork ini juga AGPL-3.0.
