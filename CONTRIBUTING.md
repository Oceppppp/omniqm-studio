# Panduan Kontribusi — OmniQM Studio

Terima kasih telah tertarik untuk berkontribusi pada **OmniQM Studio**!

## Menyiapkan Lingkungan Pengembangan

Prasyarat: **Node.js 22+** (lihat [`.nvmrc`](.nvmrc)).

```bash
npm ci
npm run dev
```

## Alur Kontribusi

1. **Fork** repositori ini atau buat branch fitur baru dari `main`:
   ```bash
   git checkout -b feat/nama-fitur-anda
   ```
2. Lakukan perubahan pada kode sumber (`src/`), dokumentasi (`docs/`), atau pengujian (`tests/`).
3. Pastikan seluruh pemeriksaan kualitas lolos tanpa error atau warning:
   ```bash
   npm run lint        # Oxlint static analysis
   npx tsc --noEmit    # TypeScript strict typecheck
   npm test            # Vitest unit & mathematical verification suite
   npm run build       # Production TypeScript + Vite build
   ```
4. Buat **Pull Request** ke branch `main` dengan deskripsi ringkas mengenai perubahan dan referensi rumus/modul yang terkait.

## Standar Kode & Matematika

- Seluruh solver berada di `src/engines/` sebagai fungsi murni TypeScript (bebas DOM/React) agar dapat berjalan paralel di Web Worker maupun Vitest.
- Setiap perubahan formula matematis wajib dilengkapi kasus uji referensi buku teks di `tests/engines/`.
- Perubahan antarmuka (UI) mengikuti prinsip *Precision Analytical Workbench* di [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md).
