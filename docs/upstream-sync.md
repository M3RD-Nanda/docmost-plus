# Sinkronisasi upstream

Fork ini mengikuti **tag rilis** Docmost, bukan commit harian.

## Ritual tiap rilis upstream

```bash
git fetch upstream --tags
git checkout plus/main
git rebase v0.98.0        # atau tag terbaru
pnpm install --frozen-lockfile
pnpm build && pnpm test
git push --force-with-lease origin plus/main
```

Konflik yang wajar muncul (semua 1–3 baris, cari penanda `// plus:`):

| File | Perubahan kita |
|---|---|
| `apps/server/src/core/auth/auth.controller.ts` | redirect require MFA ke `plus/mfa` |
| `apps/server/src/core/auth/strategies/jwt.strategy.ts` | redirect require API key ke `plus/apikey` |
| `apps/server/src/core/attachment/processors/attachment.processor.ts` | redirect require indexer ke `plus/attachment-index` |
| `apps/server/src/app.module.ts` | daftarkan `PlusModule` |
| `apps/client/src/App.tsx` | route/panel fitur plus |
| `apps/client/src/features/editor/extensions/extensions.ts` | node Mermaid |
| `apps/client/src/features/editor/readonly-page-editor.tsx` | filter Mermaid |

Aturan: perubahan inti **tidak boleh** bertambah tanpa memperbarui tabel ini.
Fitur baru wajib berbentuk modul baru atau sidecar.

## Migrasi database

- Migrasi kita selalu file baru, nama bertanggal lebih baru dari upstream.
- Jangan menyunting migrasi upstream — itu akan bentrok saat rebase.

## Lisensi

- `apps/client/src/ee/**` dan `packages/ee/**` = Enterprise Edition license. Jangan disentuh;
  `scripts/guard-ee.mjs` memblokirnya.
- Core AGPL-3.0: build yang diakses lewat jaringan wajib menawarkan source (footer "Source").
