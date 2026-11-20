import type { LineChartSpec } from '../../../core/types/chart.types.ts';

export function SvgLineChart({ spec }: { spec: LineChartSpec }) {
  const width = 560;
  const height = 240;
  const pad = { top: 20, right: 24, bottom: 38, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const allY: number[] = [];
  const xLabels: string[] = [];
  for (const s of spec.series) {
    for (const pt of s.points) {
      allY.push(pt.y);
      const xStr = String(pt.x);
      if (!xLabels.includes(xStr)) xLabels.push(xStr);
    }
  }
  for (const ref of spec.referenceLines ?? []) {
    allY.push(ref.value);
  }

  let minY = allY.length > 0 ? Math.min(...allY) : 0;
  let maxY = allY.length > 0 ? Math.max(...allY) : 100;
  if (Math.abs(maxY - minY) < 1e-6) {
    minY -= 1;
    maxY += 1;
  } else {
    const margin = (maxY - minY) * 0.12;
    minY = minY >= 0 && minY - margin < 0 ? 0 : minY - margin;
    maxY += margin;
  }

  const xPos = (xVal: number | string): number => {
    const idx = xLabels.indexOf(String(xVal));
    if (xLabels.length <= 1) return pad.left + plotW / 2;
    return pad.left + (Math.max(0, idx) / (xLabels.length - 1)) * plotW;
  };

  const yPos = (yVal: number): number => {
    return pad.top + plotH - ((yVal - minY) / (maxY - minY)) * plotH;
  };

  const ticks = 4;
  const yTickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => minY + ((maxY - minY) * i) / ticks,
  );

  return (
    <div className="chart-box">
      <div className="chart-title">{spec.title}</div>
      {spec.subtitle && <div className="chart-subtitle">{spec.subtitle}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ maxHeight: 240, display: 'block' }}>
        {yTickVals.map((yv, i) => {
          const y = yPos(yv);
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
                fontSize="10"
                fill="var(--text-muted)"
                className="mono-num"
              >
                {yv >= 1000 ? `${(yv / 1000).toFixed(1)}k` : yv.toFixed(yv % 1 === 0 ? 0 : 2)}
              </text>
            </g>
          );
        })}

        {/* Reference Lines (UCL/CL/LCL) */}
        {(spec.referenceLines ?? []).map((ref, idx) => {
          const y = yPos(ref.value);
          return (
            <g key={idx}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke={ref.colorToken}
                strokeWidth={1.5}
                strokeDasharray={ref.dashed ? '5 4' : undefined}
              />
              <text
                x={width - pad.right - 4}
                y={y - 4}
                textAnchor="end"
                fontSize="9.5"
                fontWeight="700"
                fill={ref.colorToken}
              >
                {ref.label} ({ref.value})
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + plotH}
          y2={pad.top + plotH}
          stroke="var(--border-strong)"
        />
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={pad.top + plotH}
          stroke="var(--border-strong)"
        />

        {/* X Labels */}
        {xLabels.map((lbl, idx) => {
          const step = Math.ceil(xLabels.length / 8);
          if (idx % step !== 0 && idx !== xLabels.length - 1) return null;
          const x = xPos(lbl);
          return (
            <text
              key={lbl}
              x={x}
              y={height - pad.bottom + 14}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {lbl.slice(0, 8)}
            </text>
          );
        })}

        {/* Data Series */}
        {spec.series.map((s) => {
          const d = s.points
            .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${xPos(pt.x)} ${yPos(pt.y)}`)
            .join(' ');
          return (
            <g key={s.name}>
              <path
                d={d}
                fill="none"
                stroke={s.colorToken}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '6 4' : undefined}
              />
              {s.points.map((pt, i) => (
                <circle
                  key={i}
                  cx={xPos(pt.x)}
                  cy={yPos(pt.y)}
                  r={3}
                  fill={s.colorToken}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '0.45rem', fontSize: '0.74rem' }}>
        {spec.series.map((s) => (
          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 12, height: 3, background: s.colorToken, display: 'inline-block', borderRadius: 2 }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
