import {
  FileSpreadsheet,
  GitBranch,
  Layers,
  LayoutGrid,
  Play,
  Printer,
  SlidersHorizontal,
  UploadCloud,
  Download,
  FileJson,
} from 'lucide-react';
import {
  downloadMasterTemplateExcel,
  exportBatchResultsExcel,
} from '../../io/exporters/excelExporter.ts';
import { exportWorkspaceBundleJson } from '../../io/exporters/jsonExporter.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';

export function TopBar() {
  const { state, setView, runAll, toggleArchModal } = useWorkspace();
  const enabledCount = state.jobs.filter((j) => j.enabled).length;
  const resultCount = state.batchSummary?.totalJobs ?? 0;

  return (
    <header className="topbar no-print">
      <div className="brand-group">
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
        <div className="toolbar-cluster" role="group" aria-label="Berkas dan Ekspor">
          <button
            type="button"
            id="btn-download-master-template"
            className="btn btn-tool"
            onClick={downloadMasterTemplateExcel}
            title="Unduh 1 workbook Excel berisi contoh 16 sheet modul siap edit & upload"
          >
            <FileSpreadsheet size={13} /> Template .xlsx
          </button>

          {state.batchSummary && (
            <button
              type="button"
              id="btn-export-all-excel"
              className="btn btn-tool"
              onClick={() => exportBatchResultsExcel(state.jobs, state.batchSummary!)}
              title="Ekspor seluruh hasil modul ke 1 workbook Excel multi-sheet"
            >
              <Download size={13} /> Ekspor .xlsx
            </button>
          )}

          <button
            type="button"
            id="btn-export-project-json"
            className="btn btn-tool"
            onClick={() => exportWorkspaceBundleJson(state.jobs, state.links)}
            title="Simpan seluruh proyek menjadi file .omniqm.json untuk dibagikan ke komputer lain"
          >
            <FileJson size={13} /> Simpan .json
          </button>
        </div>

        <div className="toolbar-divider" aria-hidden="true" />

        <div className="toolbar-cluster" role="group" aria-label="Utilitas">
          <button
            type="button"
            id="btn-print-report"
            className="btn btn-tool"
            onClick={() => window.print()}
            title="Cetak atau simpan sebagai PDF"
            aria-label="Cetak atau simpan laporan sebagai PDF"
          >
            <Printer size={13} />
          </button>

          <button
            type="button"
            id="btn-open-architecture"
            className="btn btn-tool"
            onClick={() => toggleArchModal(true)}
            title="Lihat arsitektur modular 5 lapisan dan panduan distribusi"
          >
            <Layers size={13} /> Arsitektur
          </button>
        </div>

        <button
          type="button"
          id="btn-run-all-modules"
          className="btn btn-primary tab-num"
          disabled={state.isRunning || enabledCount === 0}
          onClick={() => void runAll(true)}
        >
          <Play size={13} />
          {state.isRunning && state.progress
            ? `Memproses ${state.progress.completed}/${state.progress.total}…`
            : `Jalankan Semua (${enabledCount})`}
        </button>
      </div>
    </header>
  );
}
