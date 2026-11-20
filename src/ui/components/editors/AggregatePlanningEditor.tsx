import type { ClipboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AggregatePlanningInput } from '../../../core/types/module.types.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../utils/gridPaste.ts';

type CapacityField = 'demands' | 'regularCapacity' | 'overtimeCapacity' | 'subcontractCapacity';

const ROWS: { label: string; field: CapacityField }[] = [
  { label: 'Demand (Permintaan)', field: 'demands' },
  { label: 'Kapasitas Reguler', field: 'regularCapacity' },
  { label: 'Kapasitas Overtime', field: 'overtimeCapacity' },
  { label: 'Kapasitas Subkontrak', field: 'subcontractCapacity' },
];

export function AggregatePlanningEditor({
  input,
  onChange,
}: {
  input: AggregatePlanningInput;
  onChange: (next: AggregatePlanningInput) => void;
}) {
  const updateArr = (field: CapacityField, idx: number, val: number) => {
    const next = [...input[field]];
    next[idx] = val;
    onChange({ ...input, [field]: next });
  };

  const addPeriod = () => {
    const idx = input.periodLabels.length;
    onChange({
      ...input,
      periodLabels: [...input.periodLabels, `Q${idx + 1}`],
      demands: [...input.demands, input.demands[idx - 1] ?? 1400],
      regularCapacity: [...input.regularCapacity, input.regularCapacity[idx - 1] ?? 1400],
      overtimeCapacity: [...input.overtimeCapacity, input.overtimeCapacity[idx - 1] ?? 250],
      subcontractCapacity: [...input.subcontractCapacity, input.subcontractCapacity[idx - 1] ?? 300],
    });
  };

  const removePeriod = (pIdx: number) => {
    if (input.periodLabels.length <= 2) return;
    onChange({
      ...input,
      periodLabels: input.periodLabels.filter((_, i) => i !== pIdx),
      demands: input.demands.filter((_, i) => i !== pIdx),
      regularCapacity: input.regularCapacity.filter((_, i) => i !== pIdx),
      overtimeCapacity: input.overtimeCapacity.filter((_, i) => i !== pIdx),
      subcontractCapacity: input.subcontractCapacity.filter((_, i) => i !== pIdx),
    });
  };

  const handleMatrixPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startRowIdx: number,
    startPeriodIdx: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const clone: AggregatePlanningInput = {
      ...input,
      demands: [...input.demands],
      regularCapacity: [...input.regularCapacity],
      overtimeCapacity: [...input.overtimeCapacity],
      subcontractCapacity: [...input.subcontractCapacity],
    };

    for (let r = 0; r < grid.length; r += 1) {
      const rowSpec = ROWS[startRowIdx + r];
      if (!rowSpec) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const pIdx = startPeriodIdx + c;
        if (pIdx >= input.periodLabels.length) break;
        clone[rowSpec.field][pIdx] = Math.max(0, parseClipboardNumber(grid[r][c], 0));
      }
    }
    onChange(clone);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Stok Awal</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.initialInventory}
            onChange={(e) => onChange({ ...input, initialInventory: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Tenaga Kerja Awal</label>
          <input
            type="number"
            min={0}
            className="form-control mono-num"
            value={input.initialWorkforce}
            onChange={(e) => onChange({ ...input, initialWorkforce: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Output / Pekerja</label>
          <input
            type="number"
            min={1}
            className="form-control mono-num"
            value={input.unitsPerWorker}
            onChange={(e) => onChange({ ...input, unitsPerWorker: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Reguler / Unit</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.regularCostPerUnit}
            onChange={(e) => onChange({ ...input, regularCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Overtime / Unit</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.overtimeCostPerUnit}
            onChange={(e) => onChange({ ...input, overtimeCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Subkontrak / Unit</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.subcontractCostPerUnit}
            onChange={(e) => onChange({ ...input, subcontractCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Simpan / Unit</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.holdingCostPerUnit}
            onChange={(e) => onChange({ ...input, holdingCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Backorder / Unit</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.backorderCostPerUnit}
            onChange={(e) => onChange({ ...input, backorderCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya Rekrut (Hiring)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.hiringCostPerWorker}
            onChange={(e) => onChange({ ...input, hiringCostPerWorker: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Biaya PHK (Firing)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.firingCostPerWorker}
            onChange={(e) => onChange({ ...input, firingCostPerWorker: Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="paste-hint">Tip: Ctrl+V tabel demand/kapasitas dari Excel langsung ke sel</span>
        <button type="button" id="btn-agg-add-period" className="btn btn-sm" onClick={addPeriod}>
          <Plus size={12} /> Tambah Periode
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Komponen Periode</th>
              {input.periodLabels.map((p, t) => (
                <th key={t}>
                  <div style={{ display: 'flex', gap: '0.2rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="cell-input"
                      value={p}
                      onChange={(e) => {
                        const next = [...input.periodLabels];
                        next[t] = e.target.value;
                        onChange({ ...input, periodLabels: next });
                      }}
                    />
                    {input.periodLabels.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        style={{ padding: '0.1rem' }}
                        onClick={() => removePeriod(t)}
                        title={`Hapus periode ${p}`}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ label, field }, rIdx) => (
              <tr key={field}>
                <td>
                  <strong>{label}</strong>
                </td>
                {input.periodLabels.map((_, t) => (
                  <td key={t}>
                    <input
                      type="number"
                      className="cell-input num"
                      value={input[field][t] ?? 0}
                      onPaste={(e) => handleMatrixPaste(e, rIdx, t)}
                      onChange={(e) => updateArr(field, t, Number(e.target.value))}
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
