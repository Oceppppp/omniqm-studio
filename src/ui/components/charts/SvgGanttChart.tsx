import type { GanttChartSpec } from '../../../core/types/chart.types.ts';

export function SvgGanttChart({ spec }: { spec: GanttChartSpec }) {
  const rowH = 28;
  const pad = { top: 24, right: 24, bottom: 26, left: 150 };
  const width = 620;
  const height = pad.top + pad.bottom + Math.max(1, spec.tasks.length) * rowH;
  const plotW = width - pad.left - pad.right;
  const total = Math.max(1, spec.totalDuration);

  const toX = (t: number) => pad.left + (t / total) * plotW;

  return (
    <div className="chart-box">
      <div className="chart-title">{spec.title}</div>
      {spec.subtitle && <div className="chart-subtitle">{spec.subtitle}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const val = Number((total * frac).toFixed(1));
          const x = toX(val);
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={pad.top - 4}
                y2={height - pad.bottom}
                stroke="var(--border-hairline)"
                strokeDasharray="3 3"
              />
              <text
                x={x}
                y={height - 6}
                textAnchor="middle"
                fontSize="9.5"
                fill="var(--text-muted)"
                className="mono-num"
              >
                {val}
              </text>
            </g>
          );
        })}

        {spec.tasks.map((task, idx) => {
          const y = pad.top + idx * rowH;
          const xStart = toX(task.es);
          const barW = Math.max(4, toX(task.ef) - xStart);
          const slackW = Math.max(0, toX(task.lf) - toX(task.ef));

          return (
            <g key={task.id}>
              <text
                x={pad.left - 8}
                y={y + 17}
                textAnchor="end"
                fontSize="10.5"
                fontWeight={task.isCritical ? '700' : '500'}
                fill={task.isCritical ? 'var(--error)' : 'var(--text-primary)'}
              >
                {task.label.length > 22 ? `${task.label.slice(0, 21)}…` : task.label}
              </text>
              {slackW > 0 && (
                <rect
                  x={xStart + barW}
                  y={y + 9}
                  width={slackW}
                  height={10}
                  rx={2}
                  fill="var(--border-strong)"
                  opacity={0.45}
                />
              )}
              <rect
                x={xStart}
                y={y + 6}
                width={barW}
                height={16}
                rx={3}
                fill={task.isCritical ? 'var(--error)' : 'var(--chart-2)'}
              />
              <text
                x={xStart + barW + slackW + 5}
                y={y + 17}
                fontSize="9"
                fill="var(--text-muted)"
                className="mono-num"
              >
                {task.es}–{task.ef}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.73rem', marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--error)', display: 'inline-block' }} />
          Jalur Kritis (Slack = 0)
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--chart-2)', display: 'inline-block' }} />
          Aktivitas Non-Kritis
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--border-strong)', opacity: 0.6, display: 'inline-block' }} />
          Total Slack
        </span>
      </div>
    </div>
  );
}
