import { useState, type ClipboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { MrpInput, MrpItemInput, MrpLotSizingMethod } from '../../../core/types/module.types.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../utils/gridPaste.ts';

export function MrpEditor({
  input,
  onChange,
}: {
  input: MrpInput;
  onChange: (next: MrpInput) => void;
}) {
  const [periodMode, setPeriodMode] = useState<'gross' | 'sched'>('gross');

  const addItem = () => {
    const newItem: MrpItemInput = {
      item: `Komponen-${input.items.length + 1}`,
      level: 1,
      parent: input.items[0]?.item,
      qtyPerParent: 1,
      leadTime: 1,
      onHand: 10,
      safetyStock: 0,
      lotSizing: 'L4L',
      fixedOrderQty: 100,
      fixedOrderPeriods: 2,
      setupCost: 100,
      holdingCostPerUnit: 2,
      grossRequirements: input.periodLabels.map(() => 0),
      scheduledReceipts: input.periodLabels.map(() => 0),
    };
    onChange({ ...input, items: [...input.items, newItem] });
  };

  const removeItem = (idx: number) => {
    if (input.items.length <= 1) return;
    onChange({ ...input, items: input.items.filter((_, i) => i !== idx) });
  };

  const addPeriod = () => {
    const nextLabel = `M${input.periodLabels.length + 1}`;
    onChange({
      periodLabels: [...input.periodLabels, nextLabel],
      items: input.items.map((it) => ({
        ...it,
        grossRequirements: [...it.grossRequirements, 0],
        scheduledReceipts: [...it.scheduledReceipts, 0],
      })),
    });
  };

  const removePeriod = (pIdx: number) => {
    if (input.periodLabels.length <= 1) return;
    onChange({
      periodLabels: input.periodLabels.filter((_, idx) => idx !== pIdx),
      items: input.items.map((it) => ({
        ...it,
        grossRequirements: it.grossRequirements.filter((_, idx) => idx !== pIdx),
        scheduledReceipts: it.scheduledReceipts.filter((_, idx) => idx !== pIdx),
      })),
    });
  };

  const handlePeriodPaste = (
    e: ClipboardEvent<HTMLInputElement>,
    startItem: number,
    startPeriod: number,
  ) => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const nextItems = input.items.map((it) => ({
      ...it,
      grossRequirements: [...it.grossRequirements],
      scheduledReceipts: [...it.scheduledReceipts],
    }));

    for (let r = 0; r < grid.length; r += 1) {
      const iIdx = startItem + r;
      if (iIdx >= nextItems.length) break;
      for (let c = 0; c < grid[r].length; c += 1) {
        const pIdx = startPeriod + c;
        if (pIdx >= input.periodLabels.length) break;
        const val = Math.max(0, parseClipboardNumber(grid[r][c], 0));
        if (periodMode === 'gross') {
          nextItems[iIdx].grossRequirements[pIdx] = val;
        } else {
          nextItems[iIdx].scheduledReceipts[pIdx] = val;
        }
      }
    }
    onChange({ ...input, items: nextItems });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-sm ${periodMode === 'gross' ? 'btn-primary' : ''}`}
            onClick={() => setPeriodMode('gross')}
          >
            Edit Gross Requirements
          </button>
          <button
            type="button"
            className={`btn btn-sm ${periodMode === 'sched' ? 'btn-primary' : ''}`}
            onClick={() => setPeriodMode('sched')}
          >
            Edit Scheduled Receipts
          </button>
          <span className="paste-hint">Tip: Ctrl+V rentang sel Excel langsung ke kolom periode</span>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem' }}>
          <button type="button" id="btn-mrp-add-item" className="btn btn-sm" onClick={addItem}>
            <Plus size={12} /> Item BOM
          </button>
          <button type="button" id="btn-mrp-add-period" className="btn btn-sm" onClick={addPeriod}>
            <Plus size={12} /> Periode
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ minWidth: 115 }}>Item</th>
              <th style={{ width: 58 }}>Level</th>
              <th style={{ minWidth: 105 }}>Parent (koma u/ multi)</th>
              <th style={{ width: 65 }}>Qty/P</th>
              <th style={{ width: 55 }}>LT</th>
              <th style={{ width: 68 }}>OnHand</th>
              <th style={{ width: 65 }}>Safety</th>
              <th style={{ minWidth: 86 }}>Lot Size</th>
              <th style={{ width: 72 }}>FOQ / p</th>
              <th style={{ width: 72 }}>Biaya Pesan (S)</th>
              <th style={{ width: 68 }}>Simpan (H)</th>
              {input.periodLabels.map((p, t) => (
                <th key={t} style={{ minWidth: 82 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
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
                    {input.periodLabels.length > 1 && (
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
              <th style={{ width: 38 }} />
            </tr>
          </thead>
          <tbody>
            {input.items.map((it, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={it.item}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, item: e.target.value };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input num"
                    value={it.level}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, level: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    placeholder="-"
                    value={it.parent ?? ''}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, parent: e.target.value || undefined };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0.1}
                    step="any"
                    className="cell-input num"
                    value={it.qtyPerParent}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, qtyPerParent: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input num"
                    value={it.leadTime}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, leadTime: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input num"
                    value={it.onHand}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, onHand: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input num"
                    value={it.safetyStock}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, safetyStock: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <select
                    className="cell-input"
                    value={it.lotSizing}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, lotSizing: e.target.value as MrpLotSizingMethod };
                      onChange({ ...input, items: next });
                    }}
                  >
                    <option value="L4L">L4L</option>
                    <option value="FOQ">FOQ</option>
                    <option value="POQ">POQ</option>
                    <option value="EOQ">EOQ</option>
                    <option value="SM">Silver-Meal</option>
                  </select>
                </td>
                <td>
                  {it.lotSizing === 'POQ' ? (
                    <input
                      type="number"
                      min={1}
                      className="cell-input num"
                      title="Interval Periode POQ (p)"
                      value={it.fixedOrderPeriods ?? 2}
                      onChange={(e) => {
                        const next = [...input.items];
                        next[i] = { ...it, fixedOrderPeriods: Number(e.target.value) };
                        onChange({ ...input, items: next });
                      }}
                    />
                  ) : (
                    <input
                      type="number"
                      min={1}
                      disabled={it.lotSizing !== 'FOQ'}
                      className="cell-input num"
                      title="Fixed Order Quantity (FOQ)"
                      value={it.fixedOrderQty ?? 100}
                      onChange={(e) => {
                        const next = [...input.items];
                        next[i] = { ...it, fixedOrderQty: Number(e.target.value) };
                        onChange({ ...input, items: next });
                      }}
                    />
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    className="cell-input num"
                    value={it.setupCost ?? 100}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, setupCost: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="cell-input num"
                    value={it.holdingCostPerUnit ?? 2}
                    onChange={(e) => {
                      const next = [...input.items];
                      next[i] = { ...it, holdingCostPerUnit: Number(e.target.value) };
                      onChange({ ...input, items: next });
                    }}
                  />
                </td>
                {input.periodLabels.map((_, t) => {
                  const arr = periodMode === 'gross' ? it.grossRequirements : it.scheduledReceipts;
                  return (
                    <td key={t}>
                      <input
                        type="number"
                        min={0}
                        className="cell-input num"
                        value={arr[t] ?? 0}
                        onPaste={(e) => handlePeriodPaste(e, i, t)}
                        onChange={(e) => {
                          const next = [...input.items];
                          if (periodMode === 'gross') {
                            const nextGross = [...it.grossRequirements];
                            nextGross[t] = Number(e.target.value);
                            next[i] = { ...it, grossRequirements: nextGross };
                          } else {
                            const nextSched = [...it.scheduledReceipts];
                            nextSched[t] = Number(e.target.value);
                            next[i] = { ...it, scheduledReceipts: nextSched };
                          }
                          onChange({ ...input, items: next });
                        }}
                      />
                    </td>
                  );
                })}
                <td>
                  {input.items.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => removeItem(i)}
                      title="Hapus item BOM"
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
