import { useRef, useState } from 'react';
import { MODULE_MAP } from '../../../core/registry/moduleRegistry.ts';
import type { ModuleExecutionResult } from '../../../core/types/module.types.ts';
import type { ModuleJob, PipelineLink } from '../../../core/types/workspace.types.ts';
import { ChartExportActions } from './ChartExportActions.tsx';

interface SvgPipelineDagProps {
  stages: ModuleJob[][];
  links: PipelineLink[];
  resultsByJobId?: Record<string, ModuleExecutionResult>;
  onSelectJob?: (jobId: string) => void;
}

export function SvgPipelineDag({
  stages,
  links,
  resultsByJobId,
  onSelectJob,
}: SvgPipelineDagProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredJob, setHoveredJob] = useState<ModuleJob | null>(null);

  if (stages.length === 0) return null;

  const nodeW = 198;
  const nodeH = 52;
  const colGap = 116;
  const rowGap = 14;
  const padX = 24;
  const padTop = 36;
  const padBottom = 20;

  const width = Math.max(
    540,
    padX * 2 + stages.length * nodeW + Math.max(0, stages.length - 1) * colGap,
  );

  const positions = new Map<string, { cx: number; cy: number; x: number; y: number }>();
  let maxBottomY = padTop + nodeH;

  stages.forEach((stageJobs, sIdx) => {
    const x = padX + sIdx * (nodeW + colGap);
    if (sIdx === 0) {
      stageJobs.forEach((job, rIdx) => {
        const y = padTop + rIdx * (nodeH + rowGap);
        positions.set(job.id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });
        maxBottomY = Math.max(maxBottomY, y + nodeH);
      });
      return;
    }

    let prevBottom = padTop - rowGap;
    stageJobs.forEach((job) => {
      const incoming = links.filter((l) => l.targetJobId === job.id);
      const srcYs = incoming
        .map((l) => positions.get(l.sourceJobId)?.y)
        .filter((v): v is number => v !== undefined);
      const desiredY =
        srcYs.length > 0
          ? srcYs.reduce((a, b) => a + b, 0) / srcYs.length
          : prevBottom + rowGap;
      const y = Math.max(prevBottom + rowGap, desiredY);
      positions.set(job.id, { x, y, cx: x + nodeW / 2, cy: y + nodeH / 2 });
      prevBottom = y + nodeH;
      maxBottomY = Math.max(maxBottomY, prevBottom);
    });
  });

  const height = Math.max(170, maxBottomY + padBottom);
  const markerId = `dag-arrow-${stages.length}-${links.length}`;

  const hoveredRes = hoveredJob ? resultsByJobId?.[hoveredJob.id] : undefined;

  return (
    <div className="dag-card">
      <div className="chart-header-row" style={{ marginBottom: '0.45rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          Klik node modul untuk langsung membuka editor · Arahkan kursor untuk ringkasan KPI
        </div>
        <ChartExportActions svgRef={svgRef} title="Pipeline_DAG_OmniQM" />
      </div>

      <div className="chart-svg-wrap">
        <div style={{ overflowX: 'auto', maxHeight: 540, overflowY: 'auto' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            style={{
              display: 'block',
              width: `${width}px`,
              maxWidth: '100%',
              height: 'auto',
              margin: '0 auto',
            }}
            onMouseLeave={() => setHoveredJob(null)}
          >
            <defs>
              <marker
                id={markerId}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--primary)" />
              </marker>
              {stages.flat().map((job) => {
                const pos = positions.get(job.id);
                if (!pos) return null;
                return (
                  <clipPath key={`clip-${job.id}`} id={`dag-clip-${job.id}`}>
                    <rect x={pos.x + 6} y={pos.y + 4} width={nodeW - 14} height={nodeH - 8} />
                  </clipPath>
                );
              })}
            </defs>

            {stages.map((stageJobs, sIdx) => {
              const x = padX + sIdx * (nodeW + colGap) + nodeW / 2;
              return (
                <g key={`hdr-${sIdx}`}>
                  <text
                    x={x}
                    y={20}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="var(--primary)"
                    letterSpacing="0.04em"
                  >
                    STAGE {sIdx + 1} ({stageJobs.length} MODUL)
                  </text>
                </g>
              );
            })}

            {links.map((link) => {
              const p1 = positions.get(link.sourceJobId);
              const p2 = positions.get(link.targetJobId);
              if (!p1 || !p2) return null;

              const x1 = p1.x + nodeW;
              const y1 = p1.cy;
              const x2 = p2.x - 2;
              const y2 = p2.cy;
              const sameOrReverse = x2 <= x1;
              const midX = (x1 + x2) / 2;
              const d = sameOrReverse
                ? `M ${p1.cx} ${p1.y + nodeH} C ${p1.cx} ${p1.y + nodeH + 28}, ${p2.cx} ${p2.y - 28}, ${p2.cx} ${p2.y - 2}`
                : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

              const rawLabel = link.targetField;
              const labelText = rawLabel.length > 16 ? `${rawLabel.slice(0, 15)}…` : rawLabel;
              const labelX = sameOrReverse ? (p1.cx + p2.cx) / 2 : midX;
              const labelY = (y1 + y2) / 2 - 9;

              return (
                <g key={link.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={1.6}
                    strokeDasharray="4 2"
                    markerEnd={`url(#${markerId})`}
                  />
                  <rect
                    x={labelX - 48}
                    y={labelY - 9}
                    width={96}
                    height={13}
                    rx={3}
                    fill="var(--bg-subtle)"
                    opacity={0.92}
                  />
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="600"
                    fill="var(--text-secondary)"
                    className="mono-num"
                  >
                    {labelText}
                  </text>
                </g>
              );
            })}

            {stages.flat().map((job) => {
              const pos = positions.get(job.id);
              if (!pos) return null;
              const meta = MODULE_MAP[job.moduleId];
              const res = resultsByJobId?.[job.id];
              const kpi = res?.kpis[0];
              const rawSub = kpi
                ? `${kpi.value}${kpi.unit ? ` ${kpi.unit}` : ''} · ${kpi.label}`
                : meta.indonesianName;
              const isActive = hoveredJob?.id === job.id;

              return (
                <g
                  key={job.id}
                  onClick={() => onSelectJob?.(job.id)}
                  onMouseEnter={() => setHoveredJob(job)}
                  style={{ cursor: onSelectJob ? 'pointer' : 'default' }}
                >
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={nodeW}
                    height={nodeH}
                    rx={5}
                    fill="var(--bg-surface)"
                    stroke={
                      isActive
                        ? 'var(--primary)'
                        : res?.status === 'error'
                          ? 'var(--error)'
                          : 'var(--border-strong)'
                    }
                    strokeWidth={isActive ? 2 : 1.2}
                  />
                  <rect
                    x={pos.x}
                    y={pos.y}
                    width={3}
                    height={nodeH}
                    rx={1}
                    fill={res?.status === 'error' ? 'var(--error)' : 'var(--primary)'}
                  />
                  <g clipPath={`url(#dag-clip-${job.id})`}>
                    <rect
                      x={pos.x + 8}
                      y={pos.y + 8}
                      width={25}
                      height={15}
                      rx={3}
                      fill="var(--primary-soft)"
                    />
                    <text
                      x={pos.x + 20.5}
                      y={pos.y + 18.5}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="700"
                      fill="var(--primary)"
                      className="mono-num"
                    >
                      {meta.code}
                    </text>
                    <text
                      x={pos.x + 39}
                      y={pos.y + 19}
                      fontSize="10"
                      fontWeight="700"
                      fill="var(--text-primary)"
                    >
                      {job.title.length > 20 ? `${job.title.slice(0, 19)}…` : job.title}
                    </text>
                    <text
                      x={pos.x + 9}
                      y={pos.y + 39}
                      fontSize="9"
                      fill="var(--text-muted)"
                      className="mono-num"
                    >
                      {rawSub.length > 28 ? `${rawSub.slice(0, 27)}…` : rawSub}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {hoveredJob && (
          <div className="chart-tooltip no-print" role="status">
            <div className="chart-tooltip-title">
              {MODULE_MAP[hoveredJob.moduleId].code} — {hoveredJob.title}
            </div>
            {hoveredRes?.kpis[0] ? (
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-key">{hoveredRes.kpis[0].label}</span>
                <strong className="mono-num">
                  {hoveredRes.kpis[0].value} {hoveredRes.kpis[0].unit ?? ''}
                </strong>
              </div>
            ) : (
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-key">{MODULE_MAP[hoveredJob.moduleId].indonesianName}</span>
                <span>Klik untuk edit</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
