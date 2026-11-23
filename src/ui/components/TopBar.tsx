import {
  Command,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  GitBranch,
  Layers,
  LayoutGrid,
  Menu,
  Moon,
  Play,
  Printer,
  Redo2,
  SlidersHorizontal,
  Sun,
  Undo2,
  UploadCloud,
} from 'lucide-react';
import {
  downloadMasterTemplateExcel,
  exportBatchResultsExcel,
} from '../../io/exporters/excelExporter.ts';
import { exportWorkspaceBundleJson } from '../../io/exporters/jsonExporter.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';

export function TopBar() {
  const {
    state,
    canUndo,
    canRedo,
    undo,
    redo,
    setView,
    runAll,
    toggleArchModal,
    setShowCommandPalette,
    setSidebarOpen,
    toggleTheme,
    triggerFullPdfReport,
  } = useWorkspace();
  const enabledCount = state.jobs.filter((j) => j.enabled).length;
  const resultCount = state.batchSummary?.totalJobs ?? 0;

  return (
    <header className="topbar no-print">
      <div className="brand-group">
        <button
          type="button"
          id="btn-mobile-drawer"
          className="btn btn-tool mobile-menu-btn"
          onClick={() => setSidebarOpen(!state.sidebarOpen)}
          aria-label="Buka atau tutup sidebar katalog modul"
          aria-expanded={state.sidebarOpen}
        >
          <Menu size={15} />
        </button>

        <div className="brand-mark" aria-hidden="true">
          <img src="/icon.svg" alt="" width={30} height={30} style={{ display: 'block' }} />
        </div>
        <div className="brand-text-col">
          <div className="brand-title-row">
            <span className="brand-title">OmniQM Studio</span>
            <span className="brand-version-tag">POM-QM 16</span>
          </div>
          <div className="brand-subtitle">
            Workbench Riset Operasi &amp; PPIC Paralel
          </div>
        </div>
      </div>

      <nav className="topbar-nav" aria-label="Navigasi Utama">
        <button
          type="button"
          id="nav-batch-results"
          className={`nav-tab ${state.activeView === 'batch-results' ? 'active' : ''}`}
          onClick={() => setView('batch-results')}
        >
          <LayoutGrid size={13} />
          <span>Hasil</span>
          <span className="nav-count">{resultCount}</span>
        </button>
        <button
          type="button"
          id="nav-module-editor"
          className={`nav-tab ${state.activeView === 'module-editor' ? 'active' : ''}`}
          onClick={() => setView('module-editor')}
        >
          <SlidersHorizontal size={13} />
          <span>Editor</span>
        </button>
        <button
          type="button"
          id="nav-file-upload"
          className={`nav-tab ${state.activeView === 'file-upload' ? 'active' : ''}`}
          onClick={() => setView('file-upload')}
        >
          <UploadCloud size={13} />
          <span>Upload</span>
        </button>
        <button
          type="button"
          id="nav-pipeline"
          className={`nav-tab ${state.activeView === 'pipeline' ? 'active' : ''}`}
          onClick={() => setView('pipeline')}
        >
          <GitBranch size={13} />
          <span>Pipeline</span>
          <span className="nav-count">{state.links.length}</span>
        </button>
      </nav>

      <div className="topbar-actions">
        <div className="toolbar-cluster" role="group" aria-label="Riwayat dan Perintah Cepat">
          <button
            type="button"
            id="btn-undo"
            className="btn btn-tool"
            disabled={!canUndo}
            onClick={undo}
            title="Batalkan perubahan terakhir (Ctrl+Z)"
            aria-label="Undo perubahan terakhir"
          >
            <Undo2 size={13} />
          </button>
          <button
            type="button"
            id="btn-redo"
            className="btn btn-tool"
            disabled={!canRedo}
            onClick={redo}
            title="Ulangi perubahan (Ctrl+Y)"
            aria-label="Redo perubahan"
          >
            <Redo2 size={13} />
          </button>
          <button
            type="button"
            id="btn-command-palette"
            className="btn btn-tool"
            onClick={() => setShowCommandPalette(true)}
            title="Pencarian cepat modul & perintah (Ctrl+K)"
            aria-label="Buka pencarian cepat perintah"
          >
            <Command size={12} /> <span className="mono-num">K</span>
          </button>
        </div>

        <div className="toolbar-cluster" role="group" aria-label="Berkas dan Ekspor">
          <button
            type="button"
            id="btn-download-master-template"
            className="btn btn-tool"
            onClick={() => void downloadMasterTemplateExcel()}
            title="Unduh 1 workbook Excel berisi contoh 16 sheet modul siap edit & upload"
          >
            <FileSpreadsheet size={13} /> Template
          </button>

          {state.batchSummary && (
            <button
              type="button"
              id="btn-export-all-excel"
              className="btn btn-tool"
              onClick={() => void exportBatchResultsExcel(state.jobs, state.batchSummary!)}
              title="Ekspor seluruh hasil modul ke 1 workbook Excel multi-sheet (auto-width)"
            >
              <Download size={13} /> .xlsx
            </button>
          )}

          <button
            type="button"
            id="btn-export-project-json"
            className="btn btn-tool"
            onClick={() => exportWorkspaceBundleJson(state.jobs, state.links)}
            title="Simpan seluruh proyek menjadi file .omniqm.json untuk dibagikan ke komputer lain"
          >
            <FileJson size={13} /> .json
          </button>
        </div>

        <div className="toolbar-cluster" role="group" aria-label="Utilitas dan Laporan">
          <button
            type="button"
            id="btn-print-report"
            className="btn btn-tool"
            onClick={() => window.print()}
            title="Cetak tampilan saat ini"
            aria-label="Cetak tampilan saat ini"
          >
            <Printer size={13} />
          </button>

          {state.batchSummary && (
            <button
              type="button"
              id="btn-print-full-pdf"
              className="btn btn-tool"
              onClick={triggerFullPdfReport}
              title="Cetak / Simpan PDF Laporan Lengkap seluruh modul dengan halaman sampul & page-break"
            >
              <FileText size={13} /> PDF
            </button>
          )}

          <button
            type="button"
            id="btn-toggle-theme"
            className="btn btn-tool"
            onClick={toggleTheme}
            title={state.theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap (Dark Workbench)'}
            aria-label="Ganti tema terang atau gelap"
          >
            {state.theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>

          <button
            type="button"
            id="btn-open-architecture"
            className="btn btn-tool"
            onClick={() => toggleArchModal(true)}
            title="Lihat arsitektur modular 5 lapisan dan panduan distribusi"
            aria-label="Lihat arsitektur sistem"
          >
            <Layers size={13} />
          </button>
        </div>

        <button
          type="button"
          id="btn-run-all-modules"
          className="btn btn-primary tab-num"
          disabled={state.isRunning || enabledCount === 0}
          onClick={() => void runAll(true)}
          title="Jalankan seluruh modul aktif secara paralel (Ctrl+Enter)"
        >
          <Play size={13} />
          {state.isRunning && state.progress
            ? `Memproses ${state.progress.completed}/${state.progress.total}…`
            : `Jalankan (${enabledCount})`}
        </button>
      </div>
    </header>
  );
}
