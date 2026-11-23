import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Play, UploadCloud } from 'lucide-react';
import { MODULE_MAP } from '../../core/registry/moduleRegistry.ts';
import type {
  AggregatePlanningInput,
  AssignmentInput,
  BreakEvenInput,
  DecisionAnalysisInput,
  ForecastingInput,
  IntegerProgrammingInput,
  InventoryInput,
  LinearProgrammingInput,
  MarkovAnalysisInput,
  ModuleExecutionResult,
  ModuleInputData,
  MrpInput,
  NetworkModelsInput,
  ProjectManagementInput,
  QualityControlInput,
  SchedulingInput,
  TransportationInput,
  WaitingLinesInput,
} from '../../core/types/module.types.ts';
import { exportModuleInputCsv } from '../../io/exporters/csvExporter.ts';
import { downloadSingleModuleTemplateExcel } from '../../io/exporters/excelExporter.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { runSingleJobAsync } from '../../workers/workerPool.ts';
import { AggregatePlanningEditor } from './editors/AggregatePlanningEditor.tsx';
import { MrpEditor } from './editors/MrpEditor.tsx';
import {
  BreakEvenEditor,
  ForecastingEditor,
  InventoryEditor,
  ProjectManagementEditor,
  WaitingLinesEditor,
} from './editors/OperationsEditors.tsx';
import {
  AssignmentEditor,
  LinearProgrammingEditor,
  TransportationEditor,
} from './editors/OptimizationEditors.tsx';
import {
  DecisionAnalysisEditor,
  MarkovEditor,
  NetworkModelsEditor,
  QualityControlEditor,
  SchedulingEditor,
} from './editors/PlanningEditors.tsx';
import { ResultView } from './ResultView.tsx';

export function ModuleInputPanel() {
  const { state, updateJobInput, updateJobMeta, duplicateJob, runAll, setView } = useWorkspace();
  const job = state.jobs.find((j) => j.id === state.activeJobId) ?? state.jobs[0];

  const cachedBatchResult =
    job &&
    state.batchSummary?.resultsByJobId[job.id] &&
    job.updatedAt <= state.batchSummary.finishedAt
      ? state.batchSummary.resultsByJobId[job.id]
      : null;

  const [asyncResult, setAsyncResult] = useState<{
    jobId: string;
    updatedAt: number;
    result: ModuleExecutionResult;
  } | null>(null);
  const reqSeqRef = useRef(0);

  const isSameJobPreview = Boolean(job && asyncResult?.jobId === job.id);
  const isAsyncFresh = Boolean(
    job && asyncResult?.jobId === job.id && asyncResult.updatedAt === job.updatedAt,
  );
  const isSolvingPreview = Boolean(job && !cachedBatchResult && !isAsyncFresh);

  useEffect(() => {
    if (!job || cachedBatchResult || isAsyncFresh) return;

    const targetJob = job;
    const reqId = reqSeqRef.current + 1;
    reqSeqRef.current = reqId;
    const delayMs = isSameJobPreview ? 180 : 0;

    const timer = window.setTimeout(() => {
      void runSingleJobAsync(targetJob).then((res) => {
        if (reqSeqRef.current !== reqId) return;
        setAsyncResult({ jobId: targetJob.id, updatedAt: targetJob.updatedAt, result: res });
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [job, cachedBatchResult, isAsyncFresh, isSameJobPreview]);

  if (!job) {
    return (
      <>
        <header className="view-header">
          <div>
            <div className="view-eyebrow">EDITOR PARAMETER &amp; MATRIKS</div>
            <h1 className="view-heading">Belum Ada Modul Dipilih</h1>
            <p className="view-lead">
              Pilih modul dari katalog 16 modul di sidebar kiri atau unggah berkas Excel, CSV, JSON, maupun JS untuk mulai mengolah model.
            </p>
          </div>
          <div className="view-header-actions no-print">
            <button type="button" className="btn btn-primary" onClick={() => setView('file-upload')}>
              <UploadCloud size={14} /> Upload File Data
            </button>
          </div>
        </header>
      </>
    );
  }

  const meta = MODULE_MAP[job.moduleId];
  const handleInputChange = (nextInput: ModuleInputData) => {
    updateJobInput(job.id, nextInput);
  };

  const liveResult =
    cachedBatchResult ??
    (asyncResult?.jobId === job.id ? asyncResult.result : null) ??
    state.batchSummary?.resultsByJobId[job.id] ??
    null;

  return (
    <>
      <header className="view-header">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="view-eyebrow">
            <span className="badge badge-primary mono-num">{meta.code}</span>
            <span>{meta.category}</span>
            <span aria-hidden="true">·</span>
            <span>{meta.name}</span>
          </div>
          <h1 className="sr-only">
            {job.title} — Editor {meta.indonesianName}
          </h1>
          <input
            type="text"
            id="input-active-job-title"
            className="title-inline-input"
            aria-label="Judul pekerjaan modul aktif"
            value={job.title}
            onChange={(e) => updateJobMeta(job.id, { title: e.target.value })}
          />
          <p className="view-lead">{meta.shortDesc}</p>
        </div>

        <div className="view-header-actions no-print">
          <button
            type="button"
            id="btn-duplicate-job"
            className="btn btn-sm"
            onClick={() => duplicateJob(job.id)}
            title="Gandakan modul ini untuk simulasi perbandingan What-If"
          >
            <Copy size={13} /> Duplikat (What-If)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void downloadSingleModuleTemplateExcel(job)}
          >
            <Download size={13} /> Template .xlsx
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => exportModuleInputCsv(job)}
          >
            <Download size={13} /> Input .csv
          </button>
          <button
            type="button"
            id="btn-editor-run-all"
            className="btn btn-primary btn-sm"
            onClick={() => void runAll(true)}
          >
            <Play size={13} /> Jalankan Semua Sekaligus
          </button>
        </div>
      </header>

      <section className="surface-panel" aria-label="Lembar Input Parameter">
        <div className="sheet-section-label">1. Lembar Input Data &amp; Parameter Model</div>

        {job.moduleId === 'linear-programming' && (
          <LinearProgrammingEditor
            input={job.input as LinearProgrammingInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'integer-programming' && (
          <LinearProgrammingEditor
            input={job.input as IntegerProgrammingInput}
            onChange={handleInputChange}
            isInteger
          />
        )}
        {job.moduleId === 'transportation' && (
          <TransportationEditor
            input={job.input as TransportationInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'assignment' && (
          <AssignmentEditor
            input={job.input as AssignmentInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'project-management' && (
          <ProjectManagementEditor
            input={job.input as ProjectManagementInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'forecasting' && (
          <ForecastingEditor
            input={job.input as ForecastingInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'inventory' && (
          <InventoryEditor
            input={job.input as InventoryInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'waiting-lines' && (
          <WaitingLinesEditor
            input={job.input as WaitingLinesInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'break-even' && (
          <BreakEvenEditor
            input={job.input as BreakEvenInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'decision-analysis' && (
          <DecisionAnalysisEditor
            input={job.input as DecisionAnalysisInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'quality-control' && (
          <QualityControlEditor
            input={job.input as QualityControlInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'network-models' && (
          <NetworkModelsEditor
            input={job.input as NetworkModelsInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'markov-analysis' && (
          <MarkovEditor
            input={job.input as MarkovAnalysisInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'mrp' && (
          <MrpEditor input={job.input as MrpInput} onChange={handleInputChange} />
        )}
        {job.moduleId === 'aggregate-planning' && (
          <AggregatePlanningEditor
            input={job.input as AggregatePlanningInput}
            onChange={handleInputChange}
          />
        )}
        {job.moduleId === 'scheduling' && (
          <SchedulingEditor
            input={job.input as SchedulingInput}
            onChange={handleInputChange}
          />
        )}
      </section>

      <section className="surface-panel" aria-label="Hasil Perhitungan Langsung">
        <div className="panel-header">
          <div>
            <div className="sheet-section-label" style={{ marginBottom: '0.2rem' }}>
              2. Keluaran Analitik Real-Time
            </div>
            <h2 className="panel-title">Hasil Perhitungan Modul (Live Preview)</h2>
            <p className="panel-subtitle">
              Dihitung otomatis melalui Web Worker Pool (debounce 180 ms) agar pengetikan matriks tetap mulus.
            </p>
          </div>
          <span className="sync-status mono-num">
            <span className={`status-dot ${isSolvingPreview ? 'warning' : (liveResult?.status ?? 'success')}`} />
            {isSolvingPreview
              ? 'Menghitung di Worker…'
              : liveResult
                ? `${liveResult.executionMs} ms · Worker Sync`
                : 'Menyiapkan…'}
          </span>
        </div>
        {liveResult ? (
          <ResultView job={job} result={liveResult} />
        ) : (
          <div style={{ padding: '1rem 0', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Menjalankan solver kuantitatif di Web Worker…
          </div>
        )}
      </section>
    </>
  );
}
