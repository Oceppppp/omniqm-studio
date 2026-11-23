# OmniQM Studio — Aplikasi POM-QM & PPIC Multi-Modul Paralel

[![CI](https://github.com/Oceppppp/omniqm-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/Oceppppp/omniqm-studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**OmniQM Studio** adalah aplikasi web analitik modern (*Precision Analytical Workbench*) berbasis **React 19 + TypeScript + Vite + Web Workers** yang mengimplementasikan **16 modul utama POM-QM (Production & Operations Management / Quantitative Methods)** dalam arsitektur modular yang terverifikasi secara matematis.

Berbeda dengan POM-QM klasik yang hanya membuka satu modul per jendela dan mengharuskan input manual sel demi sel, OmniQM Studio menghadirkan:
1. **Jalankan Semua 16 Modul Sekaligus (Batch Paralel):** Mengeksekusi seluruh modul bersamaan melalui **Reusable Web Worker Pool** dalam hitungan milidetik, lengkap dengan ringkasan eksekutif, jejak rumus/langkah perhitungan, dan simulasi *What-If*.
2. **Analisis Mendalam & Interpretasi Manajerial di Setiap Modul:** Setiap hasil perhitungan dilengkapi narasi analitik berbasis angka aktual (diagnosa kendala ketat, shadow price, integrality gap, bottleneck Min-Cut, margin of safety, kapabilitas `Cp/Cpk`, hingga rekomendasi tindak lanjut) yang tampil di UI, mode cetak/PDF, serta ekspor **Excel (`.xlsx`) & CSV**.
3. **Upload Massal Excel Multi-Sheet, CSV, JSON, & Semua File JS:** Unggah 1 workbook `.xlsx` multi-sheet, banyak file `.csv`, bundel `.json`, atau file JavaScript (`.js`, `.mjs`, `.cjs`, dengan nama & struktur bebas) lengkap dengan **Interactive Column Mapping** dan **Direct Paste dari Excel (`Ctrl+V`)**.
4. **Pipeline Integrasi Antar-Modul (DAG) & Visualisasi SVG:** Tautkan output satu modul ke modul berikutnya (termasuk **Preset Rantai PPIC 5-Tahap**: Forecasting → Aggregate Planning → MRP → Inventory EOQ → Job Shop Scheduling) dengan visualisasi diagram jaringan, Gantt chart, dan plot 2D LP.
5. **Siap Deploy Otomatis (Netlify / PWA Offline):** Berjalan 100% di sisi klien tanpa server eksternal, mendukung mode offline penuh (Service Worker dengan *Full Bundle Precaching*), dan langsung ter-deploy otomatis saat `git push` ke GitHub → Netlify.

---

## Daftar 16 Modul POM-QM yang Terverifikasi

| Kode | Modul | Metode & Analisis Mendalam |
| :--- | :--- | :--- |
| `LP` | Linear Programming | Two-Phase Simplex + anti-cycling Bland, Shadow Price eksak (`<=`, `>=`, `=`), Ranging/Sensitivity Analysis, Plot Feasible Region 2D |
| `IP` | Integer Programming | Best-First Branch-and-Bound (Integer, Binary 0/1, Mixed-Integer), Integrality Gap vs Relaksasi LP |
| `TR` | Transportation | Auto-balancing Dummy, VAM + MODI dengan detektor siklus Disjoint Set Union (tahan *degeneracy*), perbandingan biaya VAM vs Optimal |
| `AS` | Assignment | Algoritma Hungarian $O(n^3)$ (MIN/MAX, matriks persegi & non-persegi, dukungan nilai negatif) |
| `PM` | Project Management (PERT/CPM) | Forward/Backward Pass, enumerasi seluruh jalur kritis paralel, variansi jalur maksimum PERT, Project Crashing multi-aktivitas, Diagram AON & Gantt |
| `FC` | Forecasting | Naive, SMA, WMA, Exp. Smoothing, Holt, Seasonal/Holt-Winters (Add/Mult), Auto-Tune $(\alpha,\beta)$, Regresi Linear ($R^2$), Tracking Signal |
| `IN` | Inventory Control | EOQ, POQ, Quantity Discount, Reorder Point/Safety Stock, Analisis Pareto ABC |
| `WL` | Waiting Lines (Queuing) | M/M/1, M/M/s (Erlang-C tahan overflow $s$ besar), M/M/1/K, M/D/1 + Sensitivitas & Optimasi Jumlah Server $s^*$ |
| `BE` | Break-Even / CVP | BEP Unit & Pendapatan, Target Laba, Margin of Safety (%), Degree of Operating Leverage (DOL), Analisis Crossover Multi-Proses |
| `DA` | Decision Analysis | Maximax/Minimin, Maximin/Minimax, Hurwicz, Laplace, Minimax Regret, EMV, EOL, dan EVPI |
| `QC` | Quality Control (SPC) | $\bar{X}$-$R$ Chart (konstanta ASTM penuh $n=2..25$), $p$-Chart, $c$-Chart, Western Electric Run Rule, kapabilitas $C_p/C_{pk}$ & estimasi PPM |
| `NM` | Network Models | Shortest Route (Bellman-Ford + deteksi siklus negatif), Minimum Spanning Tree (Kruskal), Maximal Flow (Edmonds-Karp + verifikasi Teorema Max-Flow Min-Cut) |
| `MK` | Markov Analysis | Simulasi $n$-langkah, Steady-State Ergodik + jarak konvergensi $L_1$, Matriks Fundamental $N$ & Absorpsi $B$ dari $\pi_0$ |
| `MR` | MRP | Ledakan BOM Multi-Parent (Low-Level Coding), peringatan rambatan Past-Due, perbandingan biaya Lot Sizing L4L, FOQ, POQ, EOQ & Silver-Meal |
| `AP` | Aggregate Planning | Perbandingan Chase, Level, Mixed, dan Optimal Transportation Method (Bowman LP dengan penalti shortage multi-periode) |
| `SC` | Job Shop Scheduling | Single-Machine (FCFS, SPT, WSPT berbobot, LPT, EDD, CR + Max Tardiness + Gantt Chart) & Algoritma Johnson 2-Mesin + Gantt Chart |

---

## Fitur Analitik & Workbench v1.2

- **Performa & Ketahanan:** *Live preview* editor berbasis **debounced Web Worker Pool** (anti-freeze), *lazy dynamic loading* SheetJS `xlsx` (`~423 kB` hanya diunduh saat upload/ekspor Excel), **`WorkspaceErrorBoundary`** dengan pemulihan backup `.json`, notifikasi update Service Worker non-intrusif, dan proteksi peringatan kuota `localStorage`.
- **Visualisasi Interaktif & Ekspor HD:** *Hover tooltip* + *crosshair* presisi serta tombol unduh **`.svg`** & **`.png` (2x Hi-DPI)** pada seluruh 6 komponen grafik.
- **Produktivitas Analitik:** **Undo / Redo (`Ctrl+Z` / `Ctrl+Y`, 30 langkah)**, **Command Palette (`Ctrl+K`)**, shortcut **`Ctrl+Enter`** (Jalankan Semua), **Komparasi Multi-Skenario *What-If*** (hingga 5 skenario berdampingan), **Multi-Proyek Lokal**, **Laporan PDF Lengkap** (halaman sampul + *page-break* per modul), auto-width kolom `.xlsx`, **Mobile Collapsible Drawer**, dan **Dark Workbench Theme**.

---

## Mulai Cepat (Quick Start)

### 1. Jalankan Secara Lokal (Development)
Prasyarat: **Node.js 22+** (lihat [`.nvmrc`](.nvmrc)).

```bash
npm ci
npm run dev
```

### 2. Deploy Otomatis di Vercel atau Netlify (GitHub → Vercel / Netlify)
Repositori ini dilengkapi konfigurasi produksi untuk **Vercel** ([`vercel.json`](vercel.json)) maupun **Netlify** ([`netlify.toml`](netlify.toml), [`public/_headers`](public/_headers), [`public/_redirects`](public/_redirects)) beserta Service Worker ([`public/sw.js`](public/sw.js)) berstempel SHA-256 otomatis per build:
- **Vercel:** Import repositori **`Oceppppp/omniqm-studio`** di Vercel → framework Vite terdeteksi otomatis (`npm run build`, output `dist`, SPA rewrites & anti-stale-cache headers dari `vercel.json`).
- **Netlify:** Add new site → Import **`Oceppppp/omniqm-studio`** → Netlify otomatis membaca `netlify.toml` (`NODE_VERSION=22`, publish `dist`).
- Setiap `git push` ke branch `main` otomatis membangun ulang dan memperbarui aplikasi secara langsung.

### 3. Jalankan via Docker
```bash
docker build -t omniqm-studio .
docker run -p 8080:80 omniqm-studio
```

---

## Contoh File Siap Upload (`samples/`)

Folder [`samples/`](samples/) berisi dataset siap pakai untuk dicoba pada menu **Upload File**:
- `Master_Contoh_16_Modul_OmniQM.xlsx` — workbook Excel 16 sheet lengkap untuk menguji seluruh modul sekaligus.
- `contoh_linear_programming.csv`, `contoh_pert_cpm.csv`, `contoh_forecasting.csv` — contoh upload banyak file CSV bersamaan.
- `contoh_proyek_16_modul_pipeline.omniqm.json` — bundel proyek JSON lengkap dengan tautan pipeline antar-modul.
- `contoh_upload_bebas.js` — contoh skrip JavaScript berisi beberapa modul sekaligus (`export const` + `export default` + objek LP).

---

## Pengujian, Kualitas Kode & Dokumentasi

```bash
npm run lint        # Oxlint static analysis (0 warnings, 0 errors)
npx tsc --noEmit    # TypeScript strict typecheck
npm test            # 79 unit, IO, PWA & mathematical audit tests (Vitest)
npm run build       # Kompilasi TypeScript + Bundle produksi Vite
```

- Product Requirements Document (PRD): [`docs/PRD.md`](docs/PRD.md)
- Project Planning & Roadmap: [`docs/PROJECT_PLANNING.md`](docs/PROJECT_PLANNING.md)
- Arsitektur Sistem: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Prinsip Desain UI (*Precision Analytical Workbench*): [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)
- Panduan Kontribusi: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Lisensi: [MIT License](LICENSE)
