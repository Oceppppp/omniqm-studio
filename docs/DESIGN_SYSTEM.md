# OmniQM Studio — Product Design Principles & UI System

Dokumen ini menetapkan standar desain antarmuka **Precision Analytical Workbench** pada **OmniQM Studio** agar konsisten, tahan uji, dan terasa seperti perangkat lunak rekayasa analitik profesional—bukan template AI generik.

---

## 1. Lima Prinsip Desain Produk

1. **Hierarki Informasi Jelas (Single `<h1>` & Numbered Sheets)**
   - Bar navigasi atas (`.topbar`) berfungsi murni sebagai *instrument command bar* (identitas produk, 4 mode tampilan, kluster ekspor/utilitas, dan **hanya satu tombol aksi utama** `Jalankan Semua`).
   - Setiap tampilan aktif memulai alur baca dengan komponen `.view-header` tunggal (`eyebrow` metadata → satu `<h1>` `.view-heading` → deskripsi ringkas `.view-lead` → aksi kontekstual di kanan).
   - Lembar kerja diberi nomor urut yang jelas (`1. Lembar Input`, `2. Keluaran Analitik Real-Time`) sehingga pengguna langsung tahu area input versus area hasil.

2. **Tiga Bidang Permukaan & Ruang Putih Terukur**
   - Pemisahan struktur dibangun lewat **nilai kontras bidang** dan **garis rambut 1px** (`--border-hairline`), bukan tumpukan bayangan tebal atau *card-inside-card*:
     - **Canvas Aplikasi (`--bg-app`)**: `hsl(218, 22%, 97%)` — latar kalem tidak menyilaukan mata.
     - **Instrument Chrome (`--bg-chrome`)**: `hsl(218, 20%, 94.5%)` — sidebar kiri selebar `292px` untuk antrean & katalog 16 modul.
     - **Analytical Paper (`--bg-surface`)**: `#ffffff` — panel tabel, matriks input, dan grafik SVG dengan batas maksimal kontainer `1380px` serta ritme spasi kelipatan `8px`.

3. **Tipografi Konsisten & Tabular Figures**
   - **Prosa UI & Label**: `Plus Jakarta Sans` dengan fitur OpenType (`cv02`, `cv03`, `cv04`, `cv11`) pada skala ketat `11px` hingga `22px`.
   - **Angka, Rumus, & Kode Modul**: `JetBrains Mono` disertai `font-variant-numeric: tabular-nums` (`.mono-num`, `.tab-num`) pada setiap metrik KPI, sel angka tabel, durasi eksekusi (`ms`), sumbu grafik SVG, dan lencana kode modul (`LP`, `TR`, `PM`, `MR`) agar kolom angka selalu sejajar vertikal.

4. **Warna Fungsional — Zero Decorative Clutter**
   - **Primary (`--primary` / `#113F67`)**: Prussian Sapphire tunggal hanya untuk tombol aksi utama, indikator tab/baris aktif, dan focus ring.
   - **Semantik Status**: Emerald (`--success`), Amber (`--warning`), dan Crimson (`--error`) hanya muncul bila ada makna analitik nyata (status solusi, titik *Out-of-Control*, jalur kritis PERT/CPM, delta What-If).
   - **Hairline KPI Grid (`.kpi-grid`)**: Menggunakan sel putih bersekat garis 1px dengan aksen garis atas `2.5px` selektif pada metrik prioritas—menghilangkan kotak gradien/pastel penuh warna.

5. **Kepadatan Informasi Tanpa Duplikasi**
   - **Batch Dashboard**: Satu *Master Batch Matrix* otoritatif dengan ekspansi *inline drawer* (`tr.batch-detail-row`) langsung di bawah baris terpilih—menghapus daftar kartu kedua yang menduplikasi 16 baris yang sama.
   - **Sidebar Katalog**: Label modul ringkas bebas pemotongan kata aneh (`SHORT_MODULE_LABELS`), filter pencarian cepat (`#input-filter-catalog`), dan indikator titik status (`.status-dot`).
   - **Grafik SVG Terkalibrasi**: Seluruh visualisasi (`SvgLineChart`, `SvgBarChart`, `SvgLpPlot`, `SvgGanttChart`, `SvgNetworkChart`, `SvgPipelineDag`) memiliki *tick* numerik, grid referensi halus, *ID clip/marker* unik anti-bentrok, dan gaya garis cetak profesional.

---

## 2. Daftar Larangan Anti-Slop (Enforced Rules)

- Tidak ada teks judul bergradien, animasi *pulse* pada lencana, atau kartu berkilau (*glowing borders*).
- Tidak ada pola *mesh/grid* dekoratif di latar belakang maupun ikon dekoratif berlebihan di setiap kotak.
- Tidak ada pengulangan konten (*table + redundant card list* untuk data identik).
- Semua CSS menggunakan arsitektur **Vanilla CSS berlapis** di [`src/styles/`](file:///home/antigravity/pom-qm-studio/src/styles/tokens.css) (`tokens.css` → `base.css` → `layout.css` → `components.css`).
