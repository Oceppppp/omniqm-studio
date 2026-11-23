import { useRef, useState } from 'react';
import type { Lp2dChartSpec } from '../../../core/types/chart.types.ts';
import { ChartExportActions } from './ChartExportActions.tsx';

export function SvgLpPlot({ spec }: { spec: Lp2dChartSpec }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredVertex, setHoveredVertex] = useState<{ label: string; x1: number; x2: number; z?: number } | null>(null);

  const width = 540;
  const height = 270;
  const pad = { top: 20, right: 24, bottom: 42, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxX1 = Math.max(1e-6, spec.maxX1);
  const maxX2 = Math.max(1e-6, spec.maxX2);
  const toX = (x1: number) => pad.left + (x1 / maxX1) * plotW;
  const toY = (x2: number) => pad.top + plotH - (x2 / maxX2) * plotH;

  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const clipId = `lp-clip-${safeId}`;

  const polyPoints = spec.feasiblePolygon
    .map((pt) => `${toX(pt.x1)},${toY(pt.x2)}`)
    .join(' ');

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="chart-box">
      <div className="chart-header-row">
        <div>
          <div className="chart-title">{spec.title}</div>
          {spec.subtitle && <div className="chart-subtitle">{spec.subtitle}</div>}
        </div>
        <ChartExportActions svgRef={svgRef} title={spec.title} />
      </div>

      <div className="chart-svg-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ maxHeight: 270, display: 'block' }}
          onMouseLeave={() => setHoveredVertex(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {ticks.map((f, i) => {
            const x = pad.left + f * plotW;
            const y = pad.top + plotH - f * plotH;
            const xVal = maxX1 * f;
            const yVal = maxX2 * f;
            return (
              <g key={i}>
                {f > 0 && (
                  <>
                    <line
                      x1={pad.left}
                      x2={width - pad.right}
                      y1={y}
                      y2={y}
                      stroke="var(--border-hairline)"
                      strokeDasharray="3 3"
                    />
                    <line
                      x1={x}
                      x2={x}
                      y1={pad.top}
                      y2={pad.top + plotH}
                      stroke="var(--border-hairline)"
                      strokeDasharray="3 3"
                    />
                  </>
                )}
                <text
                  x={x}
                  y={pad.top + plotH + 14}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--text-muted)"
                  className="mono-num"
                >
                  {xVal >= 1000 ? `${(xVal / 1000).toFixed(1)}k` : xVal.toFixed(xVal % 1 === 0 ? 0 : 1)}
                </text>
                <text
                  x={pad.left - 7}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9.5"
                  fill="var(--text-muted)"
                  className="mono-num"
                >
                  {yVal >= 1000 ? `${(yVal / 1000).toFixed(1)}k` : yVal.toFixed(yVal % 1 === 0 ? 0 : 1)}
                </text>
              </g>
            );
          })}

          <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--border-strong)" />
          <line x1={pad.left} x2={pad.left} y1={pad.top} y2={pad.top + plotH} stroke="var(--border-strong)" />

          <g clipPath={`url(#${clipId})`}>
            {spec.feasiblePolygon.length >= 3 && (
              <polygon
                points={polyPoints}
                fill="var(--primary)"
                fillOpacity={0.14}
                stroke="var(--primary)"
                strokeWidth={1.5}
              />
            )}

            {spec.constraintLines.map((cl, idx) => (
              <line
                key={idx}
                x1={toX(cl.p1.x1)}
                y1={toY(cl.p1.x2)}
                x2={toX(cl.p2.x1)}
                y2={toY(cl.p2.x2)}
                stroke={`var(--chart-${(idx % 5) + 1})`}
                strokeWidth={1.6}
                strokeDasharray="5 3"
              />
            ))}
          </g>

          {spec.feasiblePolygon.map((pt, idx) => (
            <circle
              key={`vtx-${idx}`}
              cx={toX(pt.x1)}
              cy={toY(pt.x2)}
              r={4.5}
              fill="var(--primary)"
              stroke="var(--bg-surface)"
              strokeWidth={1.5}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() =>
                setHoveredVertex({ label: `Titik Pojok #${idx + 1}`, x1: pt.x1, x2: pt.x2 })
              }
            />
          ))}

          {spec.optimalPoint && (
            <g
              style={{ cursor: 'pointer' }}
              onMouseEnter={() =>
                setHoveredVertex({
                  label: 'Titik Optimal Z*',
                  x1: spec.optimalPoint!.x1,
                  x2: spec.optimalPoint!.x2,
                  z: spec.optimalPoint!.z,
                })
              }
            >
              <circle
                cx={toX(spec.optimalPoint.x1)}
                cy={toY(spec.optimalPoint.x2)}
                r={6.5}
                fill="var(--error)"
                stroke="var(--bg-surface)"
                strokeWidth={2}
              />
              <text
                x={Math.min(width - pad.right - 88, toX(spec.optimalPoint.x1) + 8)}
                y={Math.max(pad.top + 14, toY(spec.optimalPoint.x2) - 6)}
                fontSize="10"
                fontWeight="700"
                fill="var(--error)"
                className="mono-num"
              >
                Z* ({spec.optimalPoint.x1.toFixed(1)}, {spec.optimalPoint.x2.toFixed(1)})
              </text>
            </g>
          )}

          <text
            x={pad.left + plotW / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--text-secondary)"
          >
            {spec.x1Label}
          </text>
          <text
            x={13}
            y={pad.top + plotH / 2}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--text-secondary)"
            transform={`rotate(-90 13 ${pad.top + plotH / 2})`}
          >
            {spec.x2Label}
          </text>
        </svg>

        {hoveredVertex && (
          <div className="chart-tooltip no-print" role="status">
            <div className="chart-tooltip-title">{hoveredVertex.label}</div>
            <div className="chart-tooltip-row">
              <span className="chart-tooltip-key">
                ({spec.x1Label}, {spec.x2Label})
              </span>
              <strong className="mono-num">
                ({hoveredVertex.x1.toFixed(2)}, {hoveredVertex.x2.toFixed(2)})
              </strong>
            </div>
            {hoveredVertex.z !== undefined && (
              <div className="chart-tooltip-row">
                <span className="chart-tooltip-key">Nilai Objektif Z*</span>
                <strong className="mono-num">{hoveredVertex.z.toLocaleString('id-ID')}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '0.4rem', fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--primary-soft)', border: '1.5px solid var(--primary)', display: 'inline-block' }} />
          Feasible Region
        </span>
        {spec.constraintLines.slice(0, 4).map((cl, idx) => (
          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 12, height: 2, background: `var(--chart-${(idx % 5) + 1})`, display: 'inline-block' }} />
            {cl.label}
          </span>
        ))}
        {spec.optimalPoint && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: '999px', background: 'var(--error)', display: 'inline-block' }} />
            Titik Optimal Z*
          </span>
        )}
      </div>
    </div>
  );
}
