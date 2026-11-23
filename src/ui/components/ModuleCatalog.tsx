import { useState } from 'react';
import {
  FolderKanban,
  FolderPlus,
  GitBranch,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
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
    createProject,
    switchProject,
    renameProject,
    deleteProject,
    setSidebarOpen,
  } = useWorkspace();

  const [catalogQuery, setCatalogQuery] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPreset, setNewProjectPreset] = useState<'empty' | 'sample16' | 'ppic'>('ppic');
  const [renamingProject, setRenamingProject] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const q = catalogQuery.trim().toLowerCase();

  const handleCreateProject = () => {
    createProject(newProjectName, newProjectPreset);
    setNewProjectName('');
    setCreatingProject(false);
  };

  const handleCommitRename = () => {
    renameProject(state.activeProjectId, renameDraft);
    setRenamingProject(false);
  };

  return (
    <aside
      className={`sidebar-rail no-print ${state.sidebarOpen ? 'open' : ''}`}
      aria-label="Antrean dan Katalog Modul"
    >
      {/* Multi-Project Switcher */}
      <div className="sidebar-section project-switcher-section">
        <div className="rail-heading" style={{ marginBottom: '0.4rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <FolderKanban size={12} /> Proyek Lokal ({state.projects.length})
          </span>
          <div style={{ display: 'inline-flex', gap: '2px' }}>
            <button
              type="button"
              id="btn-new-project"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setCreatingProject((v) => !v);
                setRenamingProject(false);
              }}
              title="Buat proyek workspace baru"
              aria-label="Buat proyek baru"
            >
              <FolderPlus size={12} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setRenameDraft(state.activeProjectName);
                setRenamingProject((v) => !v);
                setCreatingProject(false);
              }}
              title="Ubah nama proyek aktif"
              aria-label="Ubah nama proyek aktif"
            >
              <Pencil size={11} />
            </button>
            {state.projects.length > 1 && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => deleteProject(state.activeProjectId)}
                title="Hapus proyek aktif"
                aria-label="Hapus proyek aktif"
              >
                <Trash2 size={11} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost mobile-drawer-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Tutup katalog"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <select
          id="select-active-project"
          className="form-control"
          style={{ height: 30, fontSize: 'var(--text-xs)' }}
          value={state.activeProjectId}
          onChange={(e) => switchProject(e.target.value)}
          aria-label="Pilih proyek aktif"
        >
          {state.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.jobCount} modul)
            </option>
          ))}
        </select>

        {renamingProject && (
          <div className="project-inline-form">
            <input
              type="text"
              className="form-control"
              style={{ height: 28, fontSize: 'var(--text-xs)' }}
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitRename();
                if (e.key === 'Escape') setRenamingProject(false);
              }}
              placeholder="Nama proyek baru"
            />
            <button type="button" className="btn btn-sm btn-primary" onClick={handleCommitRename}>
              Simpan
            </button>
          </div>
        )}

        {creatingProject && (
          <div className="project-create-box">
            <input
              type="text"
              id="input-new-project-name"
              className="form-control"
              style={{ height: 28, fontSize: 'var(--text-xs)' }}
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
              }}
              placeholder="Mis. UAS PPIC / Pabrik A"
            />
            <select
              className="form-control"
              style={{ height: 28, fontSize: 'var(--text-xs)' }}
              value={newProjectPreset}
              onChange={(e) => setNewProjectPreset(e.target.value as 'empty' | 'sample16' | 'ppic')}
            >
              <option value="ppic">Template Rantai PPIC (5 Modul)</option>
              <option value="sample16">Template Demo 16 Modul</option>
              <option value="empty">Proyek Kosong</option>
            </select>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                id="btn-confirm-new-project"
                className="btn btn-sm btn-primary"
                style={{ flex: 1 }}
                onClick={handleCreateProject}
              >
                Buat Proyek
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setCreatingProject(false)}
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <div className="rail-heading">
          <span className="tab-num">Antrean Aktif ({state.jobs.length})</span>
          <button
            type="button"
            id="btn-clear-workspace"
            className="btn btn-sm btn-ghost"
            onClick={clearWorkspace}
            title="Kosongkan antrean (bisa dibatalkan via Undo)"
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
