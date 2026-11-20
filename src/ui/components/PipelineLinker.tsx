import { useState } from 'react';
import { ArrowRight, Plus, Trash2, Play, Sparkles } from 'lucide-react';
import { buildPipelineExecutionStages } from '../../core/pipeline/pipelineResolver.ts';
import { MODULE_MAP } from '../../core/registry/moduleRegistry.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { SvgPipelineDag } from './charts/SvgPipelineDag.tsx';

export function PipelineLinker() {
  const {
    state,
    addLink,
    removeLink,
    runAll,
    selectJob,
    loadPpicPipelinePreset,
  } = useWorkspace();

  const sourceCandidates = state.jobs.filter(
    (j) => MODULE_MAP[j.moduleId].exportableOutputs.length > 0,
  );
  const targetCandidates = state.jobs.filter(
    (j) => MODULE_MAP[j.moduleId].injectableTargets.length > 0,
  );

  const [sourceJobId, setSourceJobId] = useState(sourceCandidates[0]?.id ?? '');
  const [sourceOutputKey, setSourceOutputKey] = useState('');
  const [targetJobId, setTargetJobId] = useState(targetCandidates[0]?.id ?? '');
  const [targetField, setTargetField] = useState('');
  const [multiplier, setMultiplier] = useState(1);

  const effectiveSourceJobId = sourceCandidates.some((j) => j.id === sourceJobId)
    ? sourceJobId
    : (sourceCandidates[0]?.id ?? '');
  const selectedSource = state.jobs.find((j) => j.id === effectiveSourceJobId);
  const exportableKeys = selectedSource
    ? MODULE_MAP[selectedSource.moduleId].exportableOutputs
    : [];
  const effectiveSourceKey = exportableKeys.some((k) => k.key === sourceOutputKey)
    ? sourceOutputKey
    : (exportableKeys[0]?.key ?? '');

  const effectiveTargetJobId = targetCandidates.some((j) => j.id === targetJobId)
    ? targetJobId
    : (targetCandidates[0]?.id ?? '');
  const selectedTarget = state.jobs.find((j) => j.id === effectiveTargetJobId);
  const injectableFields = selectedTarget
    ? MODULE_MAP[selectedTarget.moduleId].injectableTargets
    : [];
  const effectiveTargetField = injectableFields.some((f) => f.field === targetField)
    ? targetField
    : (injectableFields[0]?.field ?? '');

  const plan = buildPipelineExecutionStages(state.jobs, state.links);

  const handleAdd = () => {
    if (
      !effectiveSourceJobId ||
      !effectiveTargetJobId ||
      effectiveSourceJobId === effectiveTargetJobId ||
      !effectiveSourceKey ||
      !effectiveTargetField
    ) {
      return;
    }
    addLink({
      sourceJobId: effectiveSourceJobId,
      sourceOutputKey: effectiveSourceKey,
      targetJobId: effectiveTargetJobId,
      targetField: effectiveTargetField,
      multiplier,
    });
  };

  return (
    <>
      <header className="view-header">
        <div>
          <div className="view-eyebrow">SINKRONISASI ANTAR-MODUL · TOPOLOGICAL DAG</div>
          <h1 className="view-heading">Pipeline Integrasi Antar-Modul (DAG)</h1>
          <p className="view-lead">
            Hubungkan keluaran suatu modul (misalnya Ramalan Permintaan dari Forecasting) langsung sebagai parameter masukan modul berikutnya (Aggregate Planning, MRP, Inventory EOQ, atau Break-Even).
          </p>
        </div>
        <div className="view-header-actions no-print">
          <button
            type="button"
            id="btn-load-ppic-preset"
            className="btn btn-sm"
            onClick={() => loadPpicPipelinePreset(true)}
          >
            <Sparkles size={13} /> Muat Preset Rantai PPIC (5 Tahap)
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void runAll(true)}
            disabled={state.jobs.filter((j) => j.enabled).length === 0}
          >
            <Play size={13} /> Jalankan Pipeline Sekaligus
          </button>
        </div>
      </header>

      <section className="surface-panel" aria-label="Konfigurasi Koneksi Pipeline">
        <div className="sheet-section-label">1. Konfigurasi Sambungan Parameter Antar-Modul</div>

        <div className="pipeline-builder-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="pipe-src-job">
              Modul Sumber (Output)
            </label>
            <select
              id="pipe-src-job"
              className="form-control"
              value={effectiveSourceJobId}
              onChange={(e) => {
                setSourceJobId(e.target.value);
                const job = state.jobs.find((j) => j.id === e.target.value);
                if (job) {
                  setSourceOutputKey(
                    MODULE_MAP[job.moduleId].exportableOutputs[0]?.key ?? '',
                  );
                }
              }}
            >
              {sourceCandidates.map((j) => (
                <option key={j.id} value={j.id}>
                  [{MODULE_MAP[j.moduleId].code}] {j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pipe-src-key">
              Metrik Output
            </label>
            <select
              id="pipe-src-key"
              className="form-control"
              value={effectiveSourceKey}
              onChange={(e) => setSourceOutputKey(e.target.value)}
            >
              {exportableKeys.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pipe-tgt-job">
              Modul Tujuan (Input)
            </label>
            <select
              id="pipe-tgt-job"
              className="form-control"
              value={effectiveTargetJobId}
              onChange={(e) => {
                setTargetJobId(e.target.value);
                const job = state.jobs.find((j) => j.id === e.target.value);
                if (job) {
                  setTargetField(
                    MODULE_MAP[job.moduleId].injectableTargets[0]?.field ?? '',
                  );
                }
              }}
            >
              {targetCandidates.map((j) => (
                <option key={j.id} value={j.id}>
                  [{MODULE_MAP[j.moduleId].code}] {j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pipe-tgt-field">
              Parameter Target
            </label>
            <select
              id="pipe-tgt-field"
              className="form-control"
              value={effectiveTargetField}
              onChange={(e) => setTargetField(e.target.value)}
            >
              {injectableFields.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="pipe-mult">
              Faktor Pengali
            </label>
            <input
              id="pipe-mult"
              type="number"
              step="0.001"
              className="form-control mono-num"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value) || 1)}
            />
          </div>

          <div>
            <button
              type="button"
              id="btn-add-pipeline-link"
              className="btn btn-primary"
              onClick={handleAdd}
              disabled={
                !effectiveSourceJobId ||
                !effectiveTargetJobId ||
                effectiveSourceJobId === effectiveTargetJobId
              }
            >
              <Plus size={14} /> Tambah Koneksi
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sumber Modul</th>
                <th>Output</th>
                <th />
                <th>Target Modul</th>
                <th>Parameter Diisi</th>
                <th>Pengali</th>
                <th>Hapus</th>
              </tr>
            </thead>
            <tbody>
              {state.links.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Belum ada koneksi pipeline. Semua modul berjalan paralel dalam Stage 1.
                  </td>
                </tr>
              ) : (
                state.links.map((l) => {
                  const sJob = state.jobs.find((j) => j.id === l.sourceJobId);
                  const tJob = state.jobs.find((j) => j.id === l.targetJobId);
                  return (
                    <tr key={l.id}>
                      <td>{sJob?.title ?? l.sourceJobId}</td>
                      <td className="mono-num">{l.sourceOutputKey}</td>
                      <td>
                        <ArrowRight size={14} />
                      </td>
                      <td>{tJob?.title ?? l.targetJobId}</td>
                      <td className="mono-num">{l.targetField}</td>
                      <td className="mono-num">× {l.multiplier}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => removeLink(l.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-panel" aria-label="Diagram Topologi DAG">
        <div className="panel-header">
          <div>
            <div className="sheet-section-label" style={{ marginBottom: '0.2rem' }}>
              2. Penjadwalan &amp; Visualisasi Topologi
            </div>
            <h2 className="panel-title">Diagram Alur &amp; Rencana Tahapan Eksekusi (DAG Scheduler)</h2>
            <p className="panel-subtitle">
              Klik node modul pada diagram untuk membuka editor input. Modul dalam tahap yang sama dijalankan bersamaan via Web Worker Pool.
            </p>
          </div>
        </div>

        {plan.hasCycle && (
          <div className="alert-strip alert-warning" style={{ marginBottom: '0.85rem' }}>
            Terdeteksi siklus ketergantungan pada link pipeline. Periksa kembali agar DAG bebas siklus.
          </div>
        )}

        <div style={{ marginBottom: '1rem' }}>
          <SvgPipelineDag
            stages={plan.stages}
            links={state.links}
            resultsByJobId={state.batchSummary?.resultsByJobId}
            onSelectJob={(id) => selectJob(id, true)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {plan.stages.map((stageJobs, idx) => (
            <div key={idx} className="stage-row-card">
              <div className="stage-row-title">
                <span>Stage {idx + 1} — Eksekusi Paralel</span>
                <span className="mono-num" style={{ color: 'var(--text-muted)' }}>
                  {stageJobs.length} Modul
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {stageJobs.map((j) => (
                  <span key={j.id} className="badge badge-primary">
                    <span className="mono-num">{MODULE_MAP[j.moduleId].code}</span>
                    <span>·</span>
                    <span>{j.title}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
