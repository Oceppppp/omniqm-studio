import type { BarChartSpec } from '../../../core/types/chart.types.ts';

export function SvgBarChart({ spec }: { spec: BarChartSpec }) {
  const width = 560;
  const height = 235;
  const pad = { top: 22, right: 20, bottom: 48, left: 56 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const vals = spec.bars.map((b) => b.value);
  const rawMax = Math.max(1, ...vals, 0);
  const minVal = Math.min(0, ...vals);
  const maxVal = rawMax * 1.1;
  const range = Math.max(1e-6, maxVal - minVal);
  const yFor = (val: number) => pad.top + plotH - ((val - minVal) / range) * plotH;
  const zeroY = yFor(0);

  const barCount = Math.max(1, spec.bars.length);
  const slotW = plotW / barCount;
  const barW = Math.min(44, Math.max(12, slotW * 0.62));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => minVal + range * f);

  return (
    <div className="chart-box">
      <div className="chart-title">{spec.title}</div>
      {spec.subtitle && <div className="chart-subtitle">{spec.subtitle}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxHeight: 235, display: 'block' }}>
        {yTicks.map((yv, i) => {
          const y = yFor(yv);
          return (
            <g key={i}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--border-hairline)"
                strokeDasharray="3 3"
              />
              <text
                x={pad.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="9.5"
                fill="var(--text-muted)"
                className="mono-num"
              >
                {Math.abs(yv) >= 1000 ? `${(yv / 1000).toFixed(1)}k` : yv.toFixed(yv % 1 === 0 ? 0 : 1)}
              </text>
            </g>
          );
        })}

        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border-strong)"
        />
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={pad.top + plotH}
          stroke="var(--border-strong)"
        />

        {spec.bars.map((b, idx) => {
          const x = pad.left + idx * slotW + (slotW - barW) / 2;
          const valY = yFor(b.value);
          const topY = Math.min(zeroY, valY);
          const barH = Math.max(2, Math.abs(zeroY - valY));
          const fill = b.colorToken ?? 'var(--chart-1)';
          return (
            <g key={`${b.label}-${idx}`}>
              <rect x={x} y={topY} width={barW} height={barH} rx={2.5} fill={fill} opacity={0.92} />
              <text
                x={x + barW / 2}
                y={topY - 5}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="var(--text-primary)"
                className="mono-num"
              >
                {Math.abs(b.value) >= 10000 ? `${(b.value / 1000).toFixed(1)}k` : b.value}
              </text>
              <text
                x={x + barW / 2}
                y={height - pad.bottom + 14}
                textAnchor="middle"
                fontSize="9.5"
                fill="var(--text-secondary)"
              >
                {b.label.length > 12 ? `${b.label.slice(0, 11)}…` : b.label}
              </text>
              {b.annotation && (
                <text
                  x={x + barW / 2}
                  y={height - pad.bottom + 27}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill="var(--text-muted)"
                >
                  {b.annotation}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
