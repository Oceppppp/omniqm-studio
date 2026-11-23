import { useEffect, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2, XCircle, Clock, BookOpen, FileText } from 'lucide-react';
import { MODULE_MAP } from '../../core/registry/moduleRegistry.ts';
import type { ModuleExecutionResult } from '../../core/types/module.types.ts';
import type { ModuleJob } from '../../core/types/workspace.types.ts';
import { exportModuleResultCsv } from '../../io/exporters/csvExporter.ts';
import { SvgBarChart } from './charts/SvgBarChart.tsx';
import { SvgGanttChart } from './charts/SvgGanttChart.tsx';
import { SvgLineChart } from './charts/SvgLineChart.tsx';
import { SvgLpPlot } from './charts/SvgLpPlot.tsx';
import { SvgNetworkChart } from './charts/SvgNetworkChart.tsx';

interface ResultViewProps {
  job?: ModuleJob;
  result: ModuleExecutionResult;
  compactHeader?: boolean;
  forceExpandAudit?: boolean;
}

export function ResultView({
  job,
  result,
  compactHeader = false,
  forceExpandAudit = false,
}: ResultViewProps) {
  const meta = MODULE_MAP[result.moduleId];
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const onBeforePrint = () => setIsPrinting(true);
    const onAfterPrint = () => setIsPrinting(false);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  const statusBadge =
    result.status === 'success' ? (
      <span className="badge badge-success">
        <CheckCircle2 size={12} /> Sukses
      </span>
    ) : result.status === 'warning' ? (
      <span className="badge badge-warning">
        <AlertTriangle size={12} /> Peringatan
      </span>
    ) : (
      <span className="badge badge-error">
        <XCircle size={12} /> Error
      </span>
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        {!compactHeader ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span className="badge badge-primary mono-num">{meta.code}</span>
            <strong style={{ fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
              {result.jobTitle}
            </strong>
            {statusBadge}
            <span className="badge mono-num">
              <Clock size={11} /> {result.executionMs} ms
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            {statusBadge}
            <span className="badge mono-num">
              <Clock size={11} /> {result.executionMs} ms
            </span>
          </div>
        )}

        {job && (
          <button
            type="button"
            id={`btn-export-csv-${job.id}`}
            className="btn btn-sm no-print"
            onClick={() => exportModuleResultCsv(job, result)}
          >
            <Download size={13} /> Ekspor Hasil CSV
          </button>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        {result.summaryText}
      </p>

      {result.warnings.length > 0 && (
        <div className="alert-strip alert-warning" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {result.warnings.map((w, i) => (
            <div key={i}>• {w}</div>
          ))}
        </div>
      )}

      {result.kpis.length > 0 && (
        <div className="kpi-grid">
          {result.kpis.map((kpi, idx) => (
            <div
              key={idx}
              className={`kpi-box ${kpi.emphasis ? `emphasis-${kpi.emphasis}` : ''}`}
            >
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-val">
                {kpi.value}
                {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.analysis && (
        <section
          className="analysis-panel"
          data-testid={`analysis-panel-${result.moduleId}`}
          aria-label="Analisis Mendalam Hasil Perhitungan"
        >
          <div className="analysis-header">
            <div className="analysis-kicker">
              <FileText size={12} />
              <span>Analisis Mendalam &amp; Interpretasi Manajerial</span>
            </div>
            <h3 className="analysis-headline">{result.analysis.headline}</h3>
            <p className="analysis-lead">{result.analysis.interpretation}</p>
          </div>

          {result.analysis.sections.length > 0 && (
            <div className="analysis-grid">
              {result.analysis.sections.map((sec, idx) => (
                <div
                  key={idx}
                  className={`analysis-cell ${sec.tone ? `tone-${sec.tone}` : ''}`}
                >
                  <div className="analysis-cell-heading">{sec.heading}</div>
                  <p className="analysis-cell-body">{sec.body}</p>
                </div>
              ))}
            </div>
          )}

          {result.analysis.recommendations.length > 0 && (
            <div className="analysis-recs">
              <div className="analysis-recs-title">Rekomendasi Tindak Lanjut</div>
              <ol className="analysis-rec-list">
                {result.analysis.recommendations.map((rec, idx) => (
                  <li key={idx}>{rec}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {result.charts.length > 0 && (
        <div className="charts-grid">
          {result.charts.map((chart) => {
            if (chart.kind === 'line') return <SvgLineChart key={chart.id} spec={chart} />;
            if (chart.kind === 'bar') return <SvgBarChart key={chart.id} spec={chart} />;
            if (chart.kind === 'gantt') return <SvgGanttChart key={chart.id} spec={chart} />;
            if (chart.kind === 'network') return <SvgNetworkChart key={chart.id} spec={chart} />;
            return <SvgLpPlot key={chart.id} spec={chart} />;
          })}
        </div>
      )}

      {result.tables.map((tbl) => {
        const hlSet = new Set(tbl.highlightRowIndices ?? []);
        return (
          <div key={tbl.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div className="sheet-section-label" style={{ marginBottom: 0 }}>
              {tbl.title}
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {tbl.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tbl.rows.map((row, rIdx) => (
                    <tr key={rIdx} className={hlSet.has(rIdx) ? 'row-highlight' : undefined}>
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={typeof cell === 'number' ? 'mono-num' : undefined}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {result.auditSteps && result.auditSteps.length > 0 && (
        <details className="audit-accordion" open={isPrinting || forceExpandAudit || undefined}>
          <summary className="audit-summary">
            <BookOpen size={13} />
            <span>Langkah Perhitungan &amp; Rumus ({result.auditSteps.length} Langkah)</span>
          </summary>
          <div className="audit-body">
            {result.auditSteps.map((step, idx) => (
              <div key={idx} className="audit-step-card">
                <div className="audit-step-title">
                  {idx + 1}. {step.title}
                </div>
                {step.formula && <code className="audit-formula mono-num">{step.formula}</code>}
                <div className="audit-step-detail">{step.detail}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
