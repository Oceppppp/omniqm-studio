import { useState } from 'react';
import { Plus, RotateCcw, Trash2, Sparkles, GitBranch, Search } from 'lucide-react';
import { MODULE_MAP, MODULE_REGISTRY } from '../../core/registry/moduleRegistry.ts';
import type { ModuleCategory, ModuleId } from '../../core/types/module.types.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';

const CATEGORIES: ModuleCategory[] = [
  'Optimization',
  'Operations & Inventory',
  'Forecasting & Decision',
  'Project & Network',
  'Quality & Scheduling',
];

const SHORT_MODULE_LABELS: Record<ModuleId, string> = {
  'linear-programming': 'Linear Prog.',
  'integer-programming': 'Integer Prog.',
  transportation: 'Transportasi',
  assignment: 'Penugasan',
  'project-management': 'PERT / CPM',
  forecasting: 'Peramalan',
  inventory: 'EOQ / Stok',
  'waiting-lines': 'Antrean',
  'break-even': 'Break-Even',
  'decision-analysis': 'Keputusan',
  'quality-control': 'SPC / QC',
  'network-models': 'Jaringan',
  'markov-analysis': 'Markov',
  mrp: 'MRP BOM',
  'aggregate-planning': 'Agregat',
  scheduling: 'Scheduling',
};

export function ModuleCatalog() {
  const {
    state,
    selectJob,
    addModuleJob,
    updateJobMeta,
    removeJob,
    loadSampleAll16,
    loadPpicPipelinePreset,
    clearWorkspace,
  } = useWorkspace();

  const [catalogQuery, setCatalogQuery] = useState('');
  const q = catalogQuery.trim().toLowerCase();

  return (
    <aside className="sidebar-rail no-print" aria-label="Antrean dan Katalog Modul">
      <div className="sidebar-section">
        <div className="rail-heading">
          <span className="tab-num">Antrean Aktif ({state.jobs.length})</span>
          <button
            type="button"
            id="btn-clear-workspace"
            className="btn btn-sm btn-ghost"
            onClick={clearWorkspace}
            title="Kosongkan antrean"
            aria-label="Kosongkan antrean modul"
          >
            <RotateCcw size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.45rem' }}>
          <button
            type="button"
            id="btn-load-sample-16"
            className="btn btn-sm"
            style={{ flex: 1 }}
            onClick={() => loadSampleAll16(true)}
            title="Muat dan jalankan semua 16 modul contoh sekaligus"
          >
            <Sparkles size={12} /> Demo 16 Modul
          </button>
          <button
            type="button"
            id="btn-load-sample-ppic"
            className="btn btn-sm"
            style={{ flex: 1 }}
            onClick={() => loadPpicPipelinePreset(true)}
            title="Muat rantai integrasi PPIC 5 tahap (Forecast → Agregat → MRP → EOQ → Scheduling)"
          >
            <GitBranch size={12} /> Rantai PPIC
          </button>
        </div>
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.4 }}>
          Centang modul yang ingin dieksekusi sekaligus dalam satu batch paralel.
        </div>
      </div>

      <div className="sidebar-scroll">
        <div className="job-list">
          {state.jobs.length === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0.45rem 0.25rem' }}>
              Antrean kosong. Tambahkan modul di bawah atau upload file Excel/CSV/JS.
            </div>
          ) : (
            state.jobs.map((job) => {
              const meta = MODULE_MAP[job.moduleId];
              const res = state.batchSummary?.resultsByJobId[job.id];
              const isSelected = state.activeJobId === job.id;
              return (
                <div key={job.id} className={`job-item ${isSelected ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    aria-label={`Aktifkan ${job.title}`}
                    checked={job.enabled}
                    onChange={(e) => updateJobMeta(job.id, { enabled: e.target.checked })}
                  />
                  <span className="job-code">{meta.code}</span>
                  <button
                    type="button"
                    className="job-main"
                    onClick={() => selectJob(job.id, true)}
                  >
                    <div className="job-title">{job.title}</div>
                    <div className="job-meta">
                      {res && (
                        <span
                          className={`status-dot ${res.status}`}
                          aria-label={`Status ${res.status}`}
                          title={
                            res.status === 'success'
                              ? 'Sukses'
                              : res.status === 'warning'
                                ? 'Peringatan'
                                : 'Error'
                          }
                        />
                      )}
                      <span>{meta.indonesianName}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost job-remove-btn"
                    aria-label={`Hapus ${job.title}`}
                    onClick={() => removeJob(job.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '0.85rem' }}>
          <div className="rail-heading">
            <span>Katalog 16 Modul POM-QM</span>
          </div>

          <div className="sidebar-search-wrap">
            <Search size={12} className="sidebar-search-icon" aria-hidden="true" />
            <input
              type="search"
              id="input-filter-catalog"
              className="sidebar-search-input"
              placeholder="Cari modul (LP, EOQ, MRP…)"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              aria-label="Cari modul di katalog"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {CATEGORIES.map((cat) => {
              const mods = MODULE_REGISTRY.filter((m) => {
                if (m.category !== cat) return false;
                if (!q) return true;
                return (
                  m.code.toLowerCase().includes(q) ||
                  m.name.toLowerCase().includes(q) ||
                  m.indonesianName.toLowerCase().includes(q) ||
                  SHORT_MODULE_LABELS[m.id].toLowerCase().includes(q)
                );
              });
              if (mods.length === 0) return null;

              return (
                <div key={cat}>
                  <div className="catalog-category-title">{cat}</div>
                  <div className="catalog-grid">
                    {mods.map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        id={`btn-add-${mod.id}`}
                        className="catalog-btn"
                        title={`${mod.indonesianName} — ${mod.shortDesc}`}
                        onClick={() => addModuleJob(mod.id)}
                      >
                        <Plus size={11} style={{ flexShrink: 0, opacity: 0.65 }} />
                        <span className="catalog-code">{mod.code}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {SHORT_MODULE_LABELS[mod.id]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
