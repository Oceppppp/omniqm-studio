import type { NetworkChartSpec, NetworkNodeSpec } from '../../../core/types/chart.types.ts';

export function SvgNetworkChart({ spec }: { spec: NetworkChartSpec }) {
  if (spec.nodes.length === 0) return null;

  const layers = new Map<number, NetworkNodeSpec[]>();
  let maxLayer = 0;
  for (const node of spec.nodes) {
    const l = Math.max(0, node.layer);
    if (l > maxLayer) maxLayer = l;
    const arr = layers.get(l) ?? [];
    arr.push(node);
    layers.set(l, arr);
  }

  let maxRows = 1;
  for (const list of layers.values()) {
    if (list.length > maxRows) maxRows = list.length;
  }

  const nodeW = 124;
  const nodeH = 54;
  const colGap = 54;
  const rowGap = 24;
  const padX = 28;
  const padY = 26;

  const width = Math.max(580, padX * 2 + (maxLayer + 1) * nodeW + maxLayer * colGap);
  const height = Math.max(220, padY * 2 + maxRows * nodeH + Math.max(0, maxRows - 1) * rowGap);

  const positions = new Map<string, { cx: number; cy: number }>();
  for (let l = 0; l <= maxLayer; l += 1) {
    const list = layers.get(l) ?? [];
    const totalColH = list.length * nodeH + Math.max(0, list.length - 1) * rowGap;
    const startY = (height - totalColH) / 2;
    const cx = padX + l * (nodeW + colGap) + nodeW / 2;
    list.forEach((node, idx) => {
      const cy = startY + idx * (nodeH + rowGap) + nodeH / 2;
      positions.set(node.id, { cx, cy });
    });
  }

  const safeId = spec.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const normMarkerId = `arrow-norm-${safeId}`;
  const critMarkerId = `arrow-crit-${safeId}`;

  return (
    <div className="chart-box">
      <div className="chart-title">{spec.title}</div>
      {spec.subtitle && <div className="chart-subtitle">{spec.subtitle}</div>}
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', width: '100%', minWidth: Math.min(width, 520), height: 'auto' }}
        >
          <defs>
            <marker
              id={normMarkerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--border-strong)" />
            </marker>
            <marker
              id={critMarkerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--error)" />
            </marker>
          </defs>

          {spec.edges.map((edge, idx) => {
            const p1 = positions.get(edge.from);
            const p2 = positions.get(edge.to);
            if (!p1 || !p2) return null;

            const sameOrBack = p2.cx <= p1.cx;
            const x1 = sameOrBack ? p1.cx : p1.cx + nodeW / 2;
            const y1 = sameOrBack ? p1.cy + nodeH / 2 : p1.cy;
            const x2 = sameOrBack ? p2.cx : p2.cx - nodeW / 2 - 2;
            const y2 = sameOrBack ? p2.cy - nodeH / 2 - 2 : p2.cy;
            const midX = (x1 + x2) / 2;
            const d = sameOrBack
              ? `M ${x1} ${y1} C ${x1 + 36} ${y1}, ${x2 - 36} ${y2}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;

            return (
              <g key={`${edge.from}-${edge.to}-${idx}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={edge.isCritical ? 'var(--error)' : 'var(--border-strong)'}
                  strokeWidth={edge.isCritical ? 2.2 : 1.3}
                  markerEnd={`url(#${edge.isCritical ? critMarkerId : normMarkerId})`}
                />
                {edge.label && (
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fontSize="8.5"
                    fill={edge.isCritical ? 'var(--error)' : 'var(--text-muted)'}
                    className="mono-num"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}

          {spec.nodes.map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
            const x = pos.cx - nodeW / 2;
            const y = pos.cy - nodeH / 2;
            const crit = Boolean(node.isCritical);

            return (
              <g key={node.id}>
                <rect
                  x={x}
                  y={y}
                  width={nodeW}
                  height={nodeH}
                  rx={5}
                  fill={crit ? 'var(--error-soft)' : 'var(--bg-surface)'}
                  stroke={crit ? 'var(--error)' : 'var(--border-strong)'}
                  strokeWidth={crit ? 1.6 : 1.2}
                />
                <rect
                  x={x}
                  y={y}
                  width={3}
                  height={nodeH}
                  rx={1}
                  fill={crit ? 'var(--error)' : 'var(--primary)'}
                />
                <text
                  x={pos.cx}
                  y={y + 17}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="700"
                  fill={crit ? 'var(--error)' : 'var(--text-primary)'}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                </text>
                {node.subtitle && (
                  <text
                    x={pos.cx}
                    y={y + 31}
                    textAnchor="middle"
                    fontSize="8.8"
                    fill="var(--text-secondary)"
                    className="mono-num"
                  >
                    {node.subtitle}
                  </text>
                )}
                {node.meta && (
                  <text
                    x={pos.cx}
                    y={y + 44}
                    textAnchor="middle"
                    fontSize="8.2"
                    fill="var(--text-muted)"
                    className="mono-num"
                  >
                    {node.meta}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          fontSize: '0.73rem',
          marginTop: '0.35rem',
          color: 'var(--text-secondary)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background: 'var(--error-soft)',
              border: '1.5px solid var(--error)',
              display: 'inline-block',
            }}
          />
          Aktivitas Jalur Kritis
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: 2,
              background: 'var(--bg-surface)',
              border: '1.5px solid var(--primary)',
              display: 'inline-block',
            }}
          />
          Aktivitas Non-Kritis
        </span>
      </div>
    </div>
  );
}
