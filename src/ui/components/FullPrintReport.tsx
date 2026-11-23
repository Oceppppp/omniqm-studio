import { MODULE_MAP } from '../../core/registry/moduleRegistry.ts';
import { useWorkspace } from '../../store/workspaceContext.ts';
import { ResultView } from './ResultView.tsx';

export function FullPrintReport() {
  const { state } = useWorkspace();
  const summary = state.batchSummary;

  if (state.printMode !== 'full' || !summary) return null;

  const executedJobs = state.jobs.filter((j) => Boolean(summary.resultsByJobId[j.id]));

  return (
    <div className="full-print-report" aria-label="Laporan Lengkap Multi-Modul OmniQM Studio">
      {/* Halaman Sampul & Ringkasan Eksekutif */}
      <section className="print-cover-page">
        <div className="print-cover-kicker mono-num">
          OMNIQM STUDIO · LAPORAN ANALITIK KUANTITATIF POM-QM &amp; PPIC
        </div>
        <h1 className="print-cover-title">{state.activeProjectName}</h1>
        <p className="print-cover-subtitle">
          Laporan komprehensif seluruh modul aktif beserta KPI utama, interpretasi manajerial mendalam, tabel solusi, grafik vektor SVG, dan jejak audit rumus.
        </p>

        <div className="kpi-grid" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
          <div className="kpi-box emphasis-primary">
            <div className="kpi-label">Total Modul</div>
            <div className="kpi-val">{summary.totalJobs}</div>
          </div>
          <div className="kpi-box emphasis-success">
            <div className="kpi-label">Sukses Optimal</div>
            <div className="kpi-val">{summary.successCount}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-label">Peringatan</div>
            <div className="kpi-val">{summary.warningCount}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-label">Durasi Batch</div>
            <div className="kpi-val">
              {summary.totalDurationMs}
              <span className="kpi-unit">ms</span>
            </div>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: '0.75rem' }}>
          Dicetak pada: <strong className="mono-num">{new Date(summary.finishedAt).toLocaleString('id-ID')}</strong>
          {state.links.length > 0 && ` · Pipeline Integrasi Aktif: ${state.links.length} tautan`}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Kode</th>
                <th>Modul &amp; Pekerjaan</th>
                <th>Status</th>
                <th>KPI Utama</th>
                <th>Ringkasan Solusi</th>
              </tr>
            </thead>
            <tbody>
              {executedJobs.map((job, idx) => {
                const res = summary.resultsByJobId[job.id];
                const meta = MODULE_MAP[job.moduleId];
                const mainKpi = res.kpis[0];
                return (
                  <tr key={job.id}>
                    <td className="mono-num">{idx + 1}</td>
                    <td className="mono-num">
                      <strong>{meta.code}</strong>
                    </td>
                    <td>
                      <strong>{job.title}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                        {meta.indonesianName}
                      </div>
                    </td>
                    <td className="mono-num">{res.status.toUpperCase()}</td>
                    <td className="mono-num">
                      {mainKpi ? `${mainKpi.value}${mainKpi.unit ? ` ${mainKpi.unit}` : ''}` : '-'}
                    </td>
                    <td style={{ fontSize: '0.75rem' }}>{res.summaryText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Halaman Detail per Modul */}
      {executedJobs.map((job, idx) => {
        const res = summary.resultsByJobId[job.id];
        const meta = MODULE_MAP[job.moduleId];
        return (
          <section key={`print-mod-${job.id}`} className="print-module-section">
            <div className="print-module-banner">
              <span className="mono-num">
                MODUL {idx + 1} / {executedJobs.length} · {meta.code}
              </span>
              <span>{meta.category}</span>
            </div>
            <ResultView job={job} result={res} forceExpandAudit />
          </section>
        );
      })}
    </div>
  );
}
