import type { ClipboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  DecisionAnalysisInput,
  MarkovAnalysisInput,
  NetworkModelsInput,
  QualityControlInput,
  SchedulingInput,
} from '../../../core/types/module.types.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../utils/gridPaste.ts';

export function DecisionAnalysisEditor({
  input,
  onChange,
}: {
  input: DecisionAnalysisInput;
  onChange: (next: DecisionAnalysisInput) => void;
}) {
  const addAlt = () => {
    onChange({
      ...input,
      alternativeNames: [...input.alternativeNames, `Alternatif ${input.alternativeNames.length + 1}`],
      payoffs: [...input.payoffs, input.stateNames.map(() => 100)],
    });
  };

  const removeAlt = (altIdx: number) => {
    if (input.alternativeNames.length <= 2) return;
    onChange({
      ...input,
      alternativeNames: input.alternativeNames.filter((_, i) => i !== altIdx),
      payoffs: input.payoffs.filter((_, i) => i !== altIdx),
    });
  };

  const addState = () => {
    const newCount = input.stateNames.length + 1;
    const eq = Number((1 / newCount).toFixed(4));
    const probs = Array.from({ length: newCount }, () => eq);
    probs[probs.length - 1] = Number((1 - eq * (newCount - 1)).toFixed(4));
    onChange({
      ...input,
      stateNames: [...input.stateNames, `Kondisi ${newCount}`],
      probabilities: probs,
      payoffs: input.payoffs.map((row) => [...row, 0]),
    });
  };

  const removeState = (sIdx: number) => {
    if (input.stateNames.length <= 2) return;
    const nextProbs = input.probabilities.filter((_, i) => i !== sIdx);
    const sum = nextProbs.reduce((a, b) => a + b, 0) || 1;
    onChange({
      ...input,
      stateNames: input.stateNames.filter((_, i) => i !== sIdx),
      probabilities: nextProbs.map((p) => Number((p / sum).toFixed(4))),
      payoffs: input.payoffs.map((row) => row.filter((_, i) => i !== sIdx)),
    });
  };

  const handlePayoffPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startAlt: number,
    startState: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextPayoffs = input.payoffs.map((r) => [...r]);
    for (let r = 0; r < grid.length; r += 1) {
      const aIdx = startAlt + r;
      if (aIdx >= nextPayoffs.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const sIdx = startState + c;
        if (sIdx >= input.stateNames.length) break;
        nextPayoffs[aIdx][sIdx] = parseClipboardNumber(grid[r][c], 0);
      }
    }
    onChange({ ...input, payoffs: nextPayoffs });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Koefisien Hurwicz (α: 0–1)</label>
          <input
            type="number"
            step="0.05"
            min={0}
            max={1}
            className="form-control mono-num"
            value={input.hurwiczAlpha}
            onChange={(e) => onChange({ ...input, hurwiczAlpha: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Tipe Nilai Tabel</label>
          <select
            className="form-control"
            value={input.isCostTable ? 'cost' : 'profit'}
            onChange={(e) => onChange({ ...input, isCostTable: e.target.value === 'cost' })}
          >
            <option value="profit">Profit / Benefit (Lebih besar lebih baik)</option>
            <option value="cost">Biaya / Cost (Lebih kecil lebih baik)</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-sm" onClick={addAlt}>
            <Plus size={12} /> Alternatif
          </button>
          <button type="button" className="btn btn-sm" onClick={addState}>
            <Plus size={12} /> Kondisi Alam
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Alternatif \ Kondisi</th>
              {input.stateNames.map((s, j) => (
                <th key={j}>
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="cell-input"
                      value={s}
                      onChange={(e) => {
                        const next = [...input.stateNames];
                        next[j] = e.target.value;
                        onChange({ ...input, stateNames: next });
                      }}
                    />
                    {input.stateNames.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '0.1rem' }}
                        onClick={() => removeState(j)}
                        title="Hapus kondisi alam"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            <tr className="row-highlight">
              <td>
                <strong>Probabilitas</strong>
              </td>
              {input.probabilities.map((p, j) => (
                <td key={j}>
                  <input
                    type="number"
                    step="0.05"
                    className="cell-input num"
                    value={p}
                    onChange={(e) => {
                      const next = [...input.probabilities];
                      next[j] = Number(e.target.value);
                      onChange({ ...input, probabilities: next });
                    }}
                  />
                </td>
              ))}
              <td />
            </tr>
            {input.alternativeNames.map((alt, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={alt}
                    onChange={(e) => {
                      const next = [...input.alternativeNames];
                      next[i] = e.target.value;
                      onChange({ ...input, alternativeNames: next });
                    }}
                  />
                </td>
                {input.stateNames.map((_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      className="cell-input num"
                      value={input.payoffs[i][j] ?? 0}
                      onPaste={(e) => handlePayoffPaste(e, i, j)}
                      onChange={(e) => {
                        const next = input.payoffs.map((r) => [...r]);
                        next[i][j] = Number(e.target.value);
                        onChange({ ...input, payoffs: next });
                      }}
                    />
                  </td>
                ))}
                <td>
                  {input.alternativeNames.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeAlt(i)}
                      title="Hapus alternatif"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QualityControlEditor({
  input,
  onChange,
}: {
  input: QualityControlInput;
  onChange: (next: QualityControlInput) => void;
}) {
  const maxObs = Math.max(
    1,
    input.chartType === 'xbar-r' ? input.subgroupSize : 1,
  );

  const handleSubgroupSizeChange = (rawSize: number) => {
    const newSize = Math.max(1, Math.min(25, Math.round(rawSize || 1)));
    const nextSamples = input.samples.map((s) => {
      const avg = s.values.length > 0 ? Number((s.values.reduce((a, b) => a + b, 0) / s.values.length).toFixed(2)) : 50;
      const resized = Array.from({ length: newSize }, (_, k) => s.values[k] ?? avg);
      return { ...s, values: resized };
    });
    onChange({ ...input, subgroupSize: newSize, samples: nextSamples });
  };

  const addSample = () => {
    const cols = input.chartType === 'xbar-r' ? input.subgroupSize : 1;
    const baseVal = input.samples[input.samples.length - 1]?.values[0] ?? (input.chartType === 'xbar-r' ? 50 : 2);
    onChange({
      ...input,
      samples: [
        ...input.samples,
        {
          label: `S${input.samples.length + 1}`,
          values: Array.from({ length: cols }, () => baseVal),
        },
      ],
    });
  };

  const removeSample = (sIdx: number) => {
    if (input.samples.length <= 2) return;
    onChange({
      ...input,
      samples: input.samples.filter((_, idx) => idx !== sIdx),
    });
  };

  const handleObsPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startSample: number,
    startObs: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextSamples = input.samples.map((s) => ({ ...s, values: [...s.values] }));
    for (let r = 0; r < grid.length; r += 1) {
      const sIdx = startSample + r;
      if (sIdx >= nextSamples.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const oIdx = startObs + c;
        if (oIdx >= maxObs) break;
        nextSamples[sIdx].values[oIdx] = parseClipboardNumber(grid[r][c], 0);
      }
    }
    onChange({ ...input, samples: nextSamples });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Jenis Peta Kendali SPC</label>
          <select
            className="form-control"
            value={input.chartType}
            onChange={(e) =>
              onChange({ ...input, chartType: e.target.value as QualityControlInput['chartType'] })
            }
          >
            <option value="xbar-r">X-bar &amp; R Chart (Variabel)</option>
            <option value="p-chart">p-Chart (Proporsi Cacat)</option>
            <option value="c-chart">c-Chart (Jumlah Cacat)</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Ukuran Subgrup / Sampel (n)</label>
          <input
            type="number"
            min={1}
            max={25}
            className="form-control mono-num"
            value={input.subgroupSize}
            onChange={(e) => handleSubgroupSizeChange(Number(e.target.value))}
          />
        </div>
        {input.chartType === 'xbar-r' && (
          <>
            <div className="field-group">
              <label className="field-label">USL (Opsional)</label>
              <input
                type="number"
                step="0.1"
                className="form-control mono-num"
                value={input.usl ?? ''}
                onChange={(e) =>
                  onChange({ ...input, usl: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>
            <div className="field-group">
              <label className="field-label">LSL (Opsional)</label>
              <input
                type="number"
                step="0.1"
                className="form-control mono-num"
                value={input.lsl ?? ''}
                onChange={(e) =>
                  onChange({ ...input, lsl: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </div>
          </>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={addSample}>
            <Plus size={12} /> Tambah Sampel
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sampel</th>
              {Array.from({ length: maxObs }, (_, j) => (
                <th key={j}>
                  {input.chartType === 'xbar-r' ? `Obs ${j + 1}` : 'Jumlah Cacat'}
                </th>
              ))}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {input.samples.map((samp, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={samp.label}
                    onChange={(e) => {
                      const next = [...input.samples];
                      next[i] = { ...samp, label: e.target.value };
                      onChange({ ...input, samples: next });
                    }}
                  />
                </td>
                {Array.from({ length: maxObs }, (_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      step="0.1"
                      className="cell-input num"
                      value={samp.values[j] ?? 0}
                      onPaste={(e) => handleObsPaste(e, i, j)}
                      onChange={(e) => {
                        const nextSamples = [...input.samples];
                        const nextVals = [...samp.values];
                        nextVals[j] = Number(e.target.value);
                        nextSamples[i] = { ...samp, values: nextVals };
                        onChange({ ...input, samples: nextSamples });
                      }}
                    />
                  </td>
                ))}
                <td>
                  {input.samples.length > 2 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeSample(i)}
                      title="Hapus sampel"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NetworkModelsEditor({
  input,
  onChange,
}: {
  input: NetworkModelsInput;
  onChange: (next: NetworkModelsInput) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Algoritma Jaringan</label>
          <select
            className="form-control"
            value={input.mode}
            onChange={(e) =>
              onChange({ ...input, mode: e.target.value as NetworkModelsInput['mode'] })
            }
          >
            <option value="shortest-route">Shortest Route (Rute Terpendek)</option>
            <option value="mst">Minimum Spanning Tree (Kruskal)</option>
            <option value="max-flow">Maximal Flow (Edmonds-Karp)</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Node Awal (Source)</label>
          <input
            type="text"
            className="form-control"
            value={input.sourceNode}
            onChange={(e) => onChange({ ...input, sourceNode: e.target.value })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Node Akhir (Sink)</label>
          <input
            type="text"
            className="form-control"
            value={input.sinkNode}
            onChange={(e) => onChange({ ...input, sinkNode: e.target.value })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Arah Graf</label>
          <select
            className="form-control"
            value={input.directed ? 'true' : 'false'}
            onChange={(e) => onChange({ ...input, directed: e.target.value === 'true' })}
          >
            <option value="false">Tidak Berarah (Undirected)</option>
            <option value="true">Berarah (Directed)</option>
          </select>
        </div>
      </div>

      <div>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            onChange({
              ...input,
              edges: [...input.edges, { from: 'Node A', to: 'Node B', weight: 10 }],
            })
          }
        >
          <Plus size={12} /> Tambah Busur (Edge)
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dari Node</th>
              <th>Ke Node</th>
              <th>Bobot / Jarak / Kapasitas</th>
              <th style={{ width: 42 }} />
            </tr>
          </thead>
          <tbody>
            {input.edges.map((e, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={e.from}
                    onChange={(ev) => {
                      const next = [...input.edges];
                      next[i] = { ...e, from: ev.target.value };
                      onChange({ ...input, edges: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={e.to}
                    onChange={(ev) => {
                      const next = [...input.edges];
                      next[i] = { ...e, to: ev.target.value };
                      onChange({ ...input, edges: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={e.weight}
                    onChange={(ev) => {
                      const next = [...input.edges];
                      next[i] = { ...e, weight: Number(ev.target.value) };
                      onChange({ ...input, edges: next });
                    }}
                  />
                </td>
                <td>
                  {input.edges.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        onChange({
                          ...input,
                          edges: input.edges.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MarkovEditor({
  input,
  onChange,
}: {
  input: MarkovAnalysisInput;
  onChange: (next: MarkovAnalysisInput) => void;
}) {
  const handleMatrixPaste = (e: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextMatrix = input.transitionMatrix.map((r) => [...r]);
    for (let r = 0; r < grid.length; r += 1) {
      const i = startRow + r;
      if (i >= nextMatrix.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const j = startCol + c;
        if (j >= input.stateNames.length) break;
        nextMatrix[i][j] = parseClipboardNumber(grid[r][c], 0);
      }
    }
    onChange({ ...input, transitionMatrix: nextMatrix });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Jumlah Langkah Simulasi (t)</label>
          <input
            type="number"
            min={1}
            max={100}
            className="form-control mono-num"
            value={input.steps}
            onChange={(e) => onChange({ ...input, steps: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Dari \ Ke</th>
              {input.stateNames.map((s, j) => (
                <th key={j}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="row-highlight">
              <td>
                <strong>Vektor Awal (π₀)</strong>
              </td>
              {input.initialVector.map((v, j) => (
                <td key={j}>
                  <input
                    type="number"
                    step="0.05"
                    className="cell-input num"
                    value={v}
                    onChange={(e) => {
                      const next = [...input.initialVector];
                      next[j] = Number(e.target.value);
                      onChange({ ...input, initialVector: next });
                    }}
                  />
                </td>
              ))}
            </tr>
            {input.stateNames.map((s, i) => (
              <tr key={i}>
                <td>
                  <strong>{s}</strong>
                </td>
                {input.stateNames.map((_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      step="0.05"
                      className="cell-input num"
                      value={input.transitionMatrix[i][j] ?? 0}
                      onPaste={(e) => handleMatrixPaste(e, i, j)}
                      onChange={(e) => {
                        const next = input.transitionMatrix.map((r) => [...r]);
                        next[i][j] = Number(e.target.value);
                        onChange({ ...input, transitionMatrix: next });
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SchedulingEditor({
  input,
  onChange,
}: {
  input: SchedulingInput;
  onChange: (next: SchedulingInput) => void;
}) {
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextJobs = input.jobs.map((j) => ({ ...j }));

    for (let r = 0; r < grid.length; r += 1) {
      const idx = startRow + r;
      if (idx >= nextJobs.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const colIdx = startCol + c;
        const val = parseClipboardNumber(grid[r][c], 0);
        if (colIdx === 0) nextJobs[idx].processingTime = val;
        else if (colIdx === 1 && input.mode === 'johnson-two-machine') {
          nextJobs[idx].processingTimeMachine2 = val;
        } else if ((colIdx === 1 && input.mode !== 'johnson-two-machine') || colIdx === 2) {
          nextJobs[idx].dueDate = val;
        }
      }
    }
    onChange({ ...input, jobs: nextJobs });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="form-control"
          style={{ width: 250 }}
          value={input.mode}
          onChange={(e) =>
            onChange({ ...input, mode: e.target.value as SchedulingInput['mode'] })
          }
        >
          <option value="single-machine">Single Machine (FCFS, SPT, LPT, EDD, CR)</option>
          <option value="johnson-two-machine">2-Machine Flow Shop (Algoritma Johnson)</option>
        </select>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            onChange({
              ...input,
              jobs: [
                ...input.jobs,
                {
                  jobId: `Order-${101 + input.jobs.length}`,
                  processingTime: 5,
                  processingTimeMachine2: 4,
                  dueDate: 15,
                },
              ],
            })
          }
        >
          <Plus size={12} /> Tambah Job
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Waktu Proses {input.mode === 'johnson-two-machine' ? '(Mesin 1)' : ''}</th>
              {input.mode === 'johnson-two-machine' && <th>Waktu Proses (Mesin 2)</th>}
              <th>Due Date</th>
              <th style={{ width: 42 }} />
            </tr>
          </thead>
          <tbody>
            {input.jobs.map((job, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={job.jobId}
                    onChange={(e) => {
                      const next = [...input.jobs];
                      next[i] = { ...job, jobId: e.target.value };
                      onChange({ ...input, jobs: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={job.processingTime}
                    onPaste={(e) => handlePaste(e, i, 0)}
                    onChange={(e) => {
                      const next = [...input.jobs];
                      next[i] = { ...job, processingTime: Number(e.target.value) };
                      onChange({ ...input, jobs: next });
                    }}
                  />
                </td>
                {input.mode === 'johnson-two-machine' && (
                  <td>
                    <input
                      type="number"
                      className="cell-input num"
                      value={job.processingTimeMachine2 ?? 0}
                      onPaste={(e) => handlePaste(e, i, 1)}
                      onChange={(e) => {
                        const next = [...input.jobs];
                        next[i] = { ...job, processingTimeMachine2: Number(e.target.value) };
                        onChange({ ...input, jobs: next });
                      }}
                    />
                  </td>
                )}
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={job.dueDate}
                    onPaste={(e) =>
                      handlePaste(e, i, input.mode === 'johnson-two-machine' ? 2 : 1)
                    }
                    onChange={(e) => {
                      const next = [...input.jobs];
                      next[i] = { ...job, dueDate: Number(e.target.value) };
                      onChange({ ...input, jobs: next });
                    }}
                  />
                </td>
                <td>
                  {input.jobs.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        onChange({
                          ...input,
                          jobs: input.jobs.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
