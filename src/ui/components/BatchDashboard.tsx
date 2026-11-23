import { Fragment, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  Play,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Bookmark,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
} from 'lucide-react';
import { MODULE_MAP } from '../../core/registry/moduleRegistry.ts';
import type { ModuleExecutionResult } from '../../core/types/module.types.ts';
import type { ModuleJob } from '../../core/types/workspace.types.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { MAX_SCENARIO_SNAPSHOTS } from '../../store/workspaceHistory.ts';
import { ResultView } from './ResultView.tsx';

function parseKpiNumber(val: string | number | undefined): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.replace(/[^0-9.-]+/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findMatchingSnapshotResult(
  job: ModuleJob,
  resultsByJobId: Record<string, ModuleExecutionResult>,
): ModuleExecutionResult | undefined {
  return (
    resultsByJobId[job.id] ??
    Object.values(resultsByJobId).find(
      (r) => r.moduleId === job.moduleId && job.title.startsWith(r.jobTitle),
    )
  );
}

export function BatchDashboard() {
  const {
    state,
    selectJob,
    duplicateJob,
    saveScenarioSnapshot,
    removeScenarioSnapshot,
    clearScenarioSnapshot,
    setView,
    runAll,
  } = useWorkspace();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'warning' | 'error'>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [scenarioLabel, setScenarioLabel] = useState('');

  const summary = state.batchSummary;

  const toggleExpand = (jobId: string) => {
    setExpandedIds((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  const setAllExpanded = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const j of state.jobs) next[j.id] = open;
    setExpandedIds(next);
  };

  if (!summary) {
    const runningText =
      state.isRunning && state.progress
        ? `Sedang mengeksekusi ${state.progress.completed} dari ${state.progress.total} modul secara paralel di Web Worker Pool…`
        : 'Belum ada hasil eksekusi batch pada sesi ini. Pilih contoh dataset, unggah berkas, atau jalankan antrean aktif secara paralel.';

    return (
      <>
        <header className="view-header">
          <div>
            <div className="view-eyebrow">RINGKASAN EKSEKUTIF · WEB WORKER POOL</div>
            <h1 className="view-heading">Semua Modul Dijalankan Sekaligus</h1>
            <p className="view-lead">{runningText}</p>
          </div>
          <div className="view-header-actions no-print">
            <button type="button" className="btn" onClick={() => setView('file-upload')}>
              <UploadCloud size={14} /> Upload Excel/CSV/JS
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void runAll(true)}
              disabled={state.isRunning || state.jobs.filter((j) => j.enabled).length === 0}
            >
              <Play size={14} />{' '}
              {state.isRunning ? 'Memproses Batch…' : 'Jalankan Semua Sekarang'}
            </button>
          </div>
        </header>

        <section className="surface-panel">
          <div className="sheet-section-label">
            {state.isRunning ? 'Eksekusi Worker Pool Berjalan' : 'Kesiapan Antrean'}
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Saat ini terdapat <strong className="mono-num">{state.jobs.filter((j) => j.enabled).length}</strong> modul aktif di sidebar kiri.{' '}
            {state.isRunning
              ? 'Hasil ringkasan KPI, grafik SVG, tabel keluaran, dan langkah perhitungan akan tampil otomatis setelah seluruh worker selesai.'
              : 'Tekan Jalankan Semua Sekarang untuk menghitung seluruh model optimasi, peramalan, inventori, antrean, dan penjadwalan secara bersamaan.'}
          </p>
        </section>
      </>
    );
  }

  const executedJobs = state.jobs.filter((j) => Boolean(summary.resultsByJobId[j.id]));
  const filteredJobs = executedJobs.filter((j) => {
    const res = summary.resultsByJobId[j.id];
    const meta = MODULE_MAP[j.moduleId];
    if (statusFilter !== 'all' && res.status !== statusFilter) return false;
    if (search.trim() !== '') {
      const q = search.toLowerCase();
      return (
        j.title.toLowerCase().includes(q) ||
        meta.name.toLowerCase().includes(q) ||
        meta.indonesianName.toLowerCase().includes(q) ||
        meta.code.toLowerCase().includes(q) ||
        res.summaryText.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const snapshots = state.scenarioSnapshots;
  const primaryBaseline = snapshots[0] ?? null;

  const handleSaveScenario = () => {
    saveScenarioSnapshot(scenarioLabel);
    setScenarioLabel('');
  };

  return (
    <>
      <header className="view-header">
        <div>
          <div className="view-eyebrow">
            <span>RINGKASAN EKSEKUTIF · PARALEL BATCH</span>
            <span aria-hidden="true">·</span>
            <span className="mono-num">
              {summary.totalDurationMs} ms · {new Date(summary.finishedAt).toLocaleTimeString('id-ID')}
            </span>
          </div>
          <h1 className="view-heading">Semua Modul Dijalankan Sekaligus</h1>
          <p className="view-lead">
            Evaluasi simultan {summary.totalJobs} model riset operasi dan perencanaan produksi melalui Web Worker Pool terisolasi. Klik <strong>Detail</strong> pada baris untuk membuka grafik, tabel keluaran, dan audit rumus di tempat.
          </p>
        </div>

        <div className="view-header-actions no-print">
          <div className="scenario-input-group">
            <input
              type="text"
              id="input-scenario-label"
              className="form-control"
              style={{ width: 155, height: 30, fontSize: 'var(--text-xs)' }}
              placeholder="Nama skenario (opsional)"
              value={scenarioLabel}
              onChange={(e) => setScenarioLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveScenario();
              }}
            />
            <button
              type="button"
              id="btn-save-whatif-baseline"
              className="btn btn-sm"
              onClick={handleSaveScenario}
              title={`Simpan hasil saat ini sebagai skenario What-If (maks. ${MAX_SCENARIO_SNAPSHOTS} skenario)`}
            >
              <Bookmark size={13} /> Simpan Skenario ({snapshots.length}/{MAX_SCENARIO_SNAPSHOTS})
            </button>
          </div>
          {snapshots.length > 0 && (
            <button
              type="button"
              id="btn-clear-whatif-baseline"
              className="btn btn-sm btn-ghost"
              onClick={clearScenarioSnapshot}
              title="Hapus seluruh skenario tersimpan"
            >
              <Trash2 size={13} /> Hapus Semua
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => setView('file-upload')}>
            <UploadCloud size={13} /> Upload File Baru
          </button>
        </div>
      </header>

      <section className="kpi-grid" aria-label="Metrik Ringkasan Eksekusi">
        <div className="kpi-box emphasis-primary">
          <div className="kpi-label">Total Modul Dieksekusi</div>
          <div className="kpi-val">{summary.totalJobs}</div>
        </div>
        <div className="kpi-box emphasis-success">
          <div className="kpi-label">Sukses Optimal</div>
          <div className="kpi-val">{summary.successCount}</div>
        </div>
        <div className={`kpi-box ${summary.warningCount > 0 ? 'emphasis-warning' : ''}`}>
          <div className="kpi-label">Peringatan / Catatan</div>
          <div className="kpi-val">{summary.warningCount}</div>
        </div>
        <div className="kpi-box">
          <div className="kpi-label">Total Waktu Batch</div>
          <div className="kpi-val">
            {summary.totalDurationMs}
            <span className="kpi-unit">ms</span>
          </div>
        </div>
      </section>

      {snapshots.length > 0 && primaryBaseline && (
        <section className="whatif-banner" aria-label="Perbandingan Multi-Skenario What-If">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--primary)' }}>
                Matriks Perbandingan Multi-Skenario What-If ({snapshots.length} Skenario Tersimpan vs Aktual)
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Kolom Delta dihitung antara skenario <strong>Aktual</strong> terhadap <strong>{primaryBaseline.label}</strong>. Simpan hingga {MAX_SCENARIO_SNAPSHOTS} skenario (mis. Pesimis, Baseline, Optimis) untuk membandingkan sensitivitas berdampingan.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {snapshots.map((snap, idx) => (
                <span key={snap.id} className="scenario-chip">
                  <span className="mono-num">#{idx + 1}</span> {snap.label}
                  <button
                    type="button"
                    className="scenario-chip-remove"
                    onClick={() => removeScenarioSnapshot(snap.id)}
                    aria-label={`Hapus skenario ${snap.label}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Modul &amp; Pekerjaan</th>
                  <th>KPI Utama</th>
                  {snapshots.map((snap, idx) => (
                    <th key={snap.id}>
                      #{idx + 1} {snap.label}
                    </th>
                  ))}
                  <th>Skenario Aktual</th>
                  <th>Delta vs #1</th>
                </tr>
              </thead>
              <tbody>
                {executedJobs.map((job) => {
                  const curRes = summary.resultsByJobId[job.id];
                  const baseRes = findMatchingSnapshotResult(job, primaryBaseline.summary.resultsByJobId);
                  if (!baseRes) return null;

                  const baseKpi = baseRes.kpis[0];
                  const curKpi = curRes.kpis[0];
                  const nBase = parseKpiNumber(baseKpi?.value);
                  const nCur = parseKpiNumber(curKpi?.value);
                  const delta = nBase !== null && nCur !== null ? nCur - nBase : null;
                  const pct =
                    delta !== null && nBase !== null && Math.abs(nBase) > 1e-9
                      ? (delta / Math.abs(nBase)) * 100
                      : null;

                  return (
                    <tr key={`cmp-${job.id}`}>
                      <td>
                        <span className="badge badge-primary">{MODULE_MAP[job.moduleId].code}</span>{' '}
                        <strong>{job.title}</strong>
                      </td>
                      <td style={{ fontSize: 'var(--text-xs)' }}>{curKpi?.label ?? '-'}</td>
                      {snapshots.map((snap) => {
                        const sRes = findMatchingSnapshotResult(job, snap.summary.resultsByJobId);
                        const sKpi = sRes?.kpis[0];
                        return (
                          <td key={`${job.id}-${snap.id}`} className="mono-num">
                            {sKpi ? `${sKpi.value}${sKpi.unit ? ` ${sKpi.unit}` : ''}` : '-'}
                          </td>
                        );
                      })}
                      <td className="mono-num">
                        <strong>
                          {curKpi ? `${curKpi.value}${curKpi.unit ? ` ${curKpi.unit}` : ''}` : '-'}
                        </strong>
                      </td>
                      <td className="mono-num">
                        {delta === null ? (
                          'Berubah kualitatif'
                        ) : Math.abs(delta) < 1e-6 ? (
                          <span style={{ color: 'var(--text-muted)' }}>0 (Sama)</span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 700,
                              color: delta > 0 ? 'var(--primary)' : 'var(--warning)',
                            }}
                          >
                            {delta > 0 ? '+' : ''}
                            {Number(delta.toFixed(2))}
                            {pct !== null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="surface-panel" aria-label="Matriks Hasil Batch">
        <div className="table-toolbar no-print">
          <div className="table-filter-group">
            <input
              type="search"
              id="input-filter-batch"
              className="form-control"
              style={{ maxWidth: 320 }}
              placeholder="Cari modul, judul pekerjaan, atau ringkasan hasil…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              id="select-filter-status"
              className="form-control"
              style={{ maxWidth: 195 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">Semua Status ({executedJobs.length})</option>
              <option value="success">Sukses ({summary.successCount})</option>
              <option value="warning">Peringatan ({summary.warningCount})</option>
              <option value="error">Error ({summary.errorCount})</option>
            </select>
            <span className="table-count-label">
              Menampilkan {filteredJobs.length} dari {executedJobs.length} modul
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => setAllExpanded(true)}>
              <ChevronsUpDown size={13} /> Buka Semua Detail
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setAllExpanded(false)}>
              <ChevronsDownUp size={13} /> Tutup Semua Detail
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Modul</th>
                <th>Pekerjaan / Dataset</th>
                <th>Status</th>
                <th>KPI Utama</th>
                <th>Ringkasan Solusi</th>
                <th>Durasi</th>
                <th className="no-print">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const res = summary.resultsByJobId[job.id];
                const meta = MODULE_MAP[job.moduleId];
                const mainKpi = res.kpis[0];
                const isOpen = expandedIds[job.id] ?? false;

                return (
                  <Fragment key={job.id}>
                    <tr className={isOpen ? 'row-expanded' : undefined}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span className="badge badge-primary mono-num">{meta.code}</span>
                          <span style={{ fontWeight: 600 }}>{meta.indonesianName}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{job.title}</strong>
                        {job.sourceFile && (
                          <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                            {job.sourceFile} {job.sourceSheet ? `(${job.sourceSheet})` : ''}
                          </div>
                        )}
                      </td>
                      <td>
                        {res.status === 'success' ? (
                          <span className="badge badge-success">
                            <CheckCircle2 size={11} /> Sukses
                          </span>
                        ) : res.status === 'warning' ? (
                          <span className="badge badge-warning">
                            <AlertTriangle size={11} /> Info
                          </span>
                        ) : (
                          <span className="badge badge-error">
                            <XCircle size={11} /> Error
                          </span>
                        )}
                      </td>
                      <td className="mono-num">
                        {mainKpi ? (
                          <div>
                            <strong>{mainKpi.value}</strong>
                            {mainKpi.unit && (
                              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginLeft: 4 }}>
                                {mainKpi.unit}
                              </span>
                            )}
                            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                              {mainKpi.label}
                            </div>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ maxWidth: 320, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {res.summaryText}
                      </td>
                      <td className="mono-num td-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {res.executionMs} ms
                      </td>
                      <td className="no-print">
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-row-expand"
                            onClick={() => toggleExpand(job.id)}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {isOpen ? 'Tutup' : 'Detail'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => selectJob(job.id, true)}
                            title="Edit input modul ini"
                            aria-label={`Edit input ${job.title}`}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => duplicateJob(job.id)}
                            title="Duplikat untuk simulasi skenario What-If"
                            aria-label={`Duplikat ${job.title}`}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="batch-detail-row">
                        <td colSpan={7}>
                          <div className="batch-detail-drawer">
                            <ResultView job={job} result={res} compactHeader />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
