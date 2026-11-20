import { X } from 'lucide-react';
import { useWorkspace } from '../../store/workspaceContext.ts';

export function ArchitectureModal() {
  const { state, toggleArchModal } = useWorkspace();
  if (!state.showArchitectureModal) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-modal-title"
      onClick={() => toggleArchModal(false)}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2 id="arch-modal-title" className="panel-title">
              Arsitektur Modular &amp; Panduan Distribusi OmniQM Studio
            </h2>
            <p className="panel-subtitle">
              Dirancang dengan arsitektur berlapis terpisah (clean modular architecture) tanpa file monolitik.
            </p>
          </div>
          <button
            type="button"
            id="btn-close-arch-modal"
            className="btn btn-sm"
            onClick={() => toggleArchModal(false)}
          >
            <X size={14} /> Tutup
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', fontSize: 'var(--text-sm)' }}>
          <div>
            <div className="sheet-section-label">1. Struktur 5 Lapisan Modul Terpisah</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Lapisan / Direktori</th>
                    <th>Tanggung Jawab</th>
                    <th>Modul Utama</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono-num">src/core/</td>
                    <td>Kontrak tipe domain, utilitas matriks/statistik, registry 16 modul, &amp; perencana DAG pipeline</td>
                    <td><code>module.types.ts</code>, <code>moduleRegistry.ts</code>, <code>pipelineResolver.ts</code></td>
                  </tr>
                  <tr>
                    <td className="mono-num">src/engines/</td>
                    <td>16 mesin komputasi murni (bebas UI/DOM, teruji unit test)</td>
                    <td><code>linearProgramming.ts</code>, <code>transportation.ts</code>, <code>projectManagement.ts</code>, + 13 modul lainnya</td>
                  </tr>
                  <tr>
                    <td className="mono-num">src/workers/</td>
                    <td>Eksekusi paralel multi-modul sekaligus di Web Worker terpisah agar UI tetap responsif</td>
                    <td><code>solver.worker.ts</code>, <code>workerPool.ts</code></td>
                  </tr>
                  <tr>
                    <td className="mono-num">src/io/</td>
                    <td>Parser upload multi-file/multi-sheet (.xlsx, .csv, .json, &amp; seluruh jenis file JS nama bebas), auto-deteksi modul, &amp; exporter Excel</td>
                    <td><code>fileDetector.ts</code>, <code>jsModuleParser.ts</code>, <code>excelExporter.ts</code></td>
                  </tr>
                  <tr>
                    <td className="mono-num">src/ui/ &amp; src/styles/</td>
                    <td>Komponen antarmuka reaktif Precision Workbench, grafik SVG murni, editor tabel interaktif, &amp; token Vanilla CSS</td>
                    <td><code>BatchDashboard.tsx</code>, <code>FileDropzone.tsx</code>, <code>SvgLineChart.tsx</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="sheet-section-label">2. Cara Agar Dapat Digunakan User Lain di Komputer Masing-Masing</div>
            <ul style={{ margin: '0.2rem 0 0 1.2rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <li>
                <strong>Deploy Web Statis / PWA (Termudah):</strong> Hasil build <code>npm run build</code> menghasilkan folder <code>dist/</code> yang dapat di-hosting di Netlify, Vercel, GitHub Pages, atau Cloudflare Pages. Service Worker menyediakan akses offline (PWA) serta pembaruan cache otomatis setiap deploy baru.
              </li>
              <li>
                <strong>Jalankan Lokal di Komputer Masing-Masing:</strong> Clone atau salin folder proyek, lalu jalankan <code>npm install &amp;&amp; npm run dev</code> (atau via Docker: <code>docker build -t omniqm . &amp;&amp; docker run -p 8080:80 omniqm</code>).
              </li>
              <li>
                <strong>Berbagi Data Proyek:</strong> Gunakan tombol <em>Simpan .json</em> untuk mengekspor berkas <code>.omniqm.json</code>, Excel multi-sheet, atau skrip JavaScript agar rekan kerja dapat membuka model yang sama persis di komputer mereka.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
