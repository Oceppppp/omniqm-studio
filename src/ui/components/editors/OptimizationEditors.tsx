import type { ClipboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  AssignmentInput,
  ConstraintSign,
  IntegerProgrammingInput,
  LinearProgrammingInput,
  ObjectiveSense,
  TransportationInput,
  VariableDomain,
} from '../../../core/types/module.types.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../utils/gridPaste.ts';

export function LinearProgrammingEditor({
  input,
  onChange,
  isInteger = false,
}: {
  input: LinearProgrammingInput | IntegerProgrammingInput;
  onChange: (next: LinearProgrammingInput | IntegerProgrammingInput) => void;
  isInteger?: boolean;
}) {
  const intInput = isInteger ? (input as IntegerProgrammingInput) : null;

  const addVar = () => {
    const idx = input.variableNames.length + 1;
    const next: LinearProgrammingInput = {
      ...input,
      variableNames: [...input.variableNames, `X${idx}`],
      objectiveCoeffs: [...input.objectiveCoeffs, 10],
      constraints: input.constraints.map((c) => ({ ...c, coeffs: [...c.coeffs, 1] })),
    };
    if (intInput) {
      onChange({ ...next, variableTypes: [...intInput.variableTypes, 'integer'] });
    } else {
      onChange(next);
    }
  };

  const removeVar = (vIdx: number) => {
    if (input.variableNames.length <= 1) return;
    const next: LinearProgrammingInput = {
      ...input,
      variableNames: input.variableNames.filter((_, i) => i !== vIdx),
      objectiveCoeffs: input.objectiveCoeffs.filter((_, i) => i !== vIdx),
      constraints: input.constraints.map((c) => ({
        ...c,
        coeffs: c.coeffs.filter((_, i) => i !== vIdx),
      })),
    };
    if (intInput) {
      onChange({
        ...next,
        variableTypes: intInput.variableTypes.filter((_, i) => i !== vIdx),
      });
    } else {
      onChange(next);
    }
  };

  const addConstraint = () => {
    onChange({
      ...input,
      constraints: [
        ...input.constraints,
        {
          name: `Kendala ${input.constraints.length + 1}`,
          coeffs: input.variableNames.map(() => 1),
          sign: '<=',
          rhs: 100,
        },
      ],
    });
  };

  const removeConstraint = (cIdx: number) => {
    if (input.constraints.length <= 1) return;
    onChange({
      ...input,
      constraints: input.constraints.filter((_, i) => i !== cIdx),
    });
  };

  const handleConstraintPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startConstraint: number,
    startVar: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextConstraints = input.constraints.map((c) => ({ ...c, coeffs: [...c.coeffs] }));

    for (let r = 0; r < grid.length; r += 1) {
      const cIdx = startConstraint + r;
      if (cIdx >= nextConstraints.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const vIdx = startVar + c;
        if (vIdx < input.variableNames.length) {
          nextConstraints[cIdx].coeffs[vIdx] = parseClipboardNumber(grid[r][c], 0);
        } else if (vIdx === input.variableNames.length) {
          nextConstraints[cIdx].rhs = parseClipboardNumber(grid[r][c], 0);
        }
      }
    }
    onChange({ ...input, constraints: nextConstraints });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label className="field-label" htmlFor="lp-sense">
            Tujuan Optimasi:
          </label>
          <select
            id="lp-sense"
            className="form-control"
            style={{ width: 170 }}
            value={input.sense}
            onChange={(e) => onChange({ ...input, sense: e.target.value as ObjectiveSense })}
          >
            <option value="max">Maksimasi (MAX)</option>
            <option value="min">Minimasi (MIN)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <span className="paste-hint">Ctrl+V rentang sel kendala</span>
          <button type="button" className="btn btn-sm" onClick={addVar}>
            <Plus size={12} /> Variabel
          </button>
          <button type="button" className="btn btn-sm" onClick={addConstraint}>
            <Plus size={12} /> Kendala
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Baris / Kendala</th>
              {input.variableNames.map((vName, j) => (
                <th key={j} style={{ minWidth: 105 }}>
                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="cell-input"
                      value={vName}
                      onChange={(e) => {
                        const next = [...input.variableNames];
                        next[j] = e.target.value;
                        onChange({ ...input, variableNames: next });
                      }}
                    />
                    {input.variableNames.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '0.15rem' }}
                        onClick={() => removeVar(j)}
                        title="Hapus variabel"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={{ width: 78 }}>Tanda</th>
              <th style={{ width: 100 }}>RHS</th>
              <th style={{ width: 42 }} />
            </tr>
          </thead>
          <tbody>
            <tr className="row-highlight">
              <td>
                <strong>{input.sense.toUpperCase()} Z</strong>
              </td>
              {input.objectiveCoeffs.map((coeff, j) => (
                <td key={j}>
                  <input
                    type="number"
                    className="cell-input num"
                    value={coeff}
                    onChange={(e) => {
                      const next = [...input.objectiveCoeffs];
                      next[j] = Number(e.target.value);
                      onChange({ ...input, objectiveCoeffs: next });
                    }}
                  />
                </td>
              ))}
              <td colSpan={3} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                Koefisien Fungsi Tujuan
              </td>
            </tr>

            {intInput && (
              <tr>
                <td>
                  <strong>Tipe Variabel</strong>
                </td>
                {intInput.variableTypes.map((vt, j) => (
                  <td key={j}>
                    <select
                      className="cell-input"
                      value={vt}
                      onChange={(e) => {
                        const next = [...intInput.variableTypes];
                        next[j] = e.target.value as VariableDomain;
                        onChange({ ...intInput, variableTypes: next });
                      }}
                    >
                      <option value="integer">Integer</option>
                      <option value="binary">Binary (0/1)</option>
                      <option value="continuous">Continuous</option>
                    </select>
                  </td>
                ))}
                <td colSpan={3} style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                  Domain Branch &amp; Bound
                </td>
              </tr>
            )}

            {input.constraints.map((c, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={c.name}
                    onChange={(e) => {
                      const next = [...input.constraints];
                      next[i] = { ...c, name: e.target.value };
                      onChange({ ...input, constraints: next });
                    }}
                  />
                </td>
                {input.variableNames.map((_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      className="cell-input num"
                      value={c.coeffs[j] ?? 0}
                      onPaste={(e) => handleConstraintPaste(e, i, j)}
                      onChange={(e) => {
                        const nextCoeffs = [...c.coeffs];
                        nextCoeffs[j] = Number(e.target.value);
                        const next = [...input.constraints];
                        next[i] = { ...c, coeffs: nextCoeffs };
                        onChange({ ...input, constraints: next });
                      }}
                    />
                  </td>
                ))}
                <td>
                  <select
                    className="cell-input"
                    value={c.sign}
                    onChange={(e) => {
                      const next = [...input.constraints];
                      next[i] = { ...c, sign: e.target.value as ConstraintSign };
                      onChange({ ...input, constraints: next });
                    }}
                  >
                    <option value="<=">&le;</option>
                    <option value=">=">&ge;</option>
                    <option value="=">=</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={c.rhs}
                    onChange={(e) => {
                      const next = [...input.constraints];
                      next[i] = { ...c, rhs: Number(e.target.value) };
                      onChange({ ...input, constraints: next });
                    }}
                  />
                </td>
                <td>
                  {input.constraints.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeConstraint(i)}
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

export function TransportationEditor({
  input,
  onChange,
}: {
  input: TransportationInput;
  onChange: (next: TransportationInput) => void;
}) {
  const addSource = () => {
    onChange({
      ...input,
      sourceNames: [...input.sourceNames, `Sumber ${input.sourceNames.length + 1}`],
      costs: [...input.costs, input.destinationNames.map(() => 10)],
      supplies: [...input.supplies, 100],
    });
  };

  const removeSource = (sIdx: number) => {
    if (input.sourceNames.length <= 1) return;
    onChange({
      ...input,
      sourceNames: input.sourceNames.filter((_, i) => i !== sIdx),
      costs: input.costs.filter((_, i) => i !== sIdx),
      supplies: input.supplies.filter((_, i) => i !== sIdx),
    });
  };

  const addDest = () => {
    onChange({
      ...input,
      destinationNames: [...input.destinationNames, `Tujuan ${input.destinationNames.length + 1}`],
      costs: input.costs.map((r) => [...r, 10]),
      demands: [...input.demands, 100],
    });
  };

  const removeDest = (dIdx: number) => {
    if (input.destinationNames.length <= 1) return;
    onChange({
      ...input,
      destinationNames: input.destinationNames.filter((_, j) => j !== dIdx),
      costs: input.costs.map((r) => r.filter((_, j) => j !== dIdx)),
      demands: input.demands.filter((_, j) => j !== dIdx),
    });
  };

  const handleCostPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startRow: number,
    startCol: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextCosts = input.costs.map((r) => [...r]);
    const nextSupplies = [...input.supplies];
    const nextDemands = [...input.demands];

    for (let r = 0; r < grid.length; r += 1) {
      const i = startRow + r;
      for (let c = 0; c < grid[r].length; c += 1) {
        const j = startCol + c;
        const val = parseClipboardNumber(grid[r][c], 0);
        if (i < input.sourceNames.length && j < input.destinationNames.length) {
          nextCosts[i][j] = val;
        } else if (i < input.sourceNames.length && j === input.destinationNames.length) {
          nextSupplies[i] = val;
        } else if (i === input.sourceNames.length && j < input.destinationNames.length) {
          nextDemands[j] = val;
        }
      }
    }
    onChange({ ...input, costs: nextCosts, supplies: nextSupplies, demands: nextDemands });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="form-control"
          style={{ width: 180 }}
          value={input.sense}
          onChange={(e) => onChange({ ...input, sense: e.target.value as ObjectiveSense })}
        >
          <option value="min">Minimasi Biaya (MIN)</option>
          <option value="max">Maksimasi Profit (MAX)</option>
        </select>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <span className="paste-hint">Ctrl+V matriks biaya</span>
          <button type="button" className="btn btn-sm" onClick={addSource}>
            <Plus size={12} /> Sumber
          </button>
          <button type="button" className="btn btn-sm" onClick={addDest}>
            <Plus size={12} /> Tujuan
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Sumber \ Tujuan</th>
              {input.destinationNames.map((dName, j) => (
                <th key={j}>
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="cell-input"
                      value={dName}
                      onChange={(e) => {
                        const next = [...input.destinationNames];
                        next[j] = e.target.value;
                        onChange({ ...input, destinationNames: next });
                      }}
                    />
                    {input.destinationNames.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '0.1rem' }}
                        onClick={() => removeDest(j)}
                        title={`Hapus tujuan ${dName}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th>Supply</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {input.sourceNames.map((sName, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={sName}
                    onChange={(e) => {
                      const next = [...input.sourceNames];
                      next[i] = e.target.value;
                      onChange({ ...input, sourceNames: next });
                    }}
                  />
                </td>
                {input.destinationNames.map((_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      className="cell-input num"
                      value={input.costs[i][j] ?? 0}
                      onPaste={(e) => handleCostPaste(e, i, j)}
                      onChange={(e) => {
                        const nextCosts = input.costs.map((r) => [...r]);
                        nextCosts[i][j] = Number(e.target.value);
                        onChange({ ...input, costs: nextCosts });
                      }}
                    />
                  </td>
                ))}
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={input.supplies[i] ?? 0}
                    onPaste={(e) => handleCostPaste(e, i, input.destinationNames.length)}
                    onChange={(e) => {
                      const next = [...input.supplies];
                      next[i] = Number(e.target.value);
                      onChange({ ...input, supplies: next });
                    }}
                  />
                </td>
                <td>
                  {input.sourceNames.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeSource(i)}
                      title={`Hapus sumber ${sName}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr className="row-highlight">
              <td>
                <strong>Demand</strong>
              </td>
              {input.demands.map((dem, j) => (
                <td key={j}>
                  <input
                    type="number"
                    className="cell-input num"
                    value={dem}
                    onPaste={(e) => handleCostPaste(e, input.sourceNames.length, j)}
                    onChange={(e) => {
                      const next = [...input.demands];
                      next[j] = Number(e.target.value);
                      onChange({ ...input, demands: next });
                    }}
                  />
                </td>
              ))}
              <td className="mono-num" style={{ fontSize: '0.76rem' }}>
                S:{input.supplies.reduce((a, b) => a + b, 0)} / D:{input.demands.reduce((a, b) => a + b, 0)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AssignmentEditor({
  input,
  onChange,
}: {
  input: AssignmentInput;
  onChange: (next: AssignmentInput) => void;
}) {
  const addRow = () => {
    onChange({
      ...input,
      agentNames: [...input.agentNames, `Agen ${input.agentNames.length + 1}`],
      costs: [...input.costs, input.taskNames.map(() => 15)],
    });
  };
  const removeRow = (rIdx: number) => {
    if (input.agentNames.length <= 1) return;
    onChange({
      ...input,
      agentNames: input.agentNames.filter((_, i) => i !== rIdx),
      costs: input.costs.filter((_, i) => i !== rIdx),
    });
  };

  const addCol = () => {
    onChange({
      ...input,
      taskNames: [...input.taskNames, `Tugas ${input.taskNames.length + 1}`],
      costs: input.costs.map((r) => [...r, 15]),
    });
  };
  const removeCol = (cIdx: number) => {
    if (input.taskNames.length <= 1) return;
    onChange({
      ...input,
      taskNames: input.taskNames.filter((_, j) => j !== cIdx),
      costs: input.costs.map((r) => r.filter((_, j) => j !== cIdx)),
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, startRow: number, startCol: number) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const next = input.costs.map((r) => [...r]);
    for (let r = 0; r < grid.length; r += 1) {
      const i = startRow + r;
      if (i >= next.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const j = startCol + c;
        if (j >= input.taskNames.length) break;
        next[i][j] = parseClipboardNumber(grid[r][c], 0);
      }
    }
    onChange({ ...input, costs: next });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="form-control"
          style={{ width: 180 }}
          value={input.sense}
          onChange={(e) => onChange({ ...input, sense: e.target.value as ObjectiveSense })}
        >
          <option value="min">Minimasi Biaya (MIN)</option>
          <option value="max">Maksimasi Skor (MAX)</option>
        </select>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <span className="paste-hint">Ctrl+V matriks penugasan</span>
          <button type="button" className="btn btn-sm" onClick={addRow}>
            <Plus size={12} /> Agen
          </button>
          <button type="button" className="btn btn-sm" onClick={addCol}>
            <Plus size={12} /> Tugas
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agen \ Tugas</th>
              {input.taskNames.map((t, j) => (
                <th key={j}>
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="cell-input"
                      value={t}
                      onChange={(e) => {
                        const next = [...input.taskNames];
                        next[j] = e.target.value;
                        onChange({ ...input, taskNames: next });
                      }}
                    />
                    {input.taskNames.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '0.1rem' }}
                        onClick={() => removeCol(j)}
                        title={`Hapus tugas ${t}`}
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
            {input.agentNames.map((agent, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={agent}
                    onChange={(e) => {
                      const next = [...input.agentNames];
                      next[i] = e.target.value;
                      onChange({ ...input, agentNames: next });
                    }}
                  />
                </td>
                {input.taskNames.map((_, j) => (
                  <td key={j}>
                    <input
                      type="number"
                      className="cell-input num"
                      value={input.costs[i][j] ?? 0}
                      onPaste={(e) => handlePaste(e, i, j)}
                      onChange={(e) => {
                        const next = input.costs.map((r) => [...r]);
                        next[i][j] = Number(e.target.value);
                        onChange({ ...input, costs: next });
                      }}
                    />
                  </td>
                ))}
                <td>
                  {input.agentNames.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeRow(i)}
                      title={`Hapus agen ${agent}`}
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
