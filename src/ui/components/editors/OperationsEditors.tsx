import { useState, type ClipboardEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  BreakEvenInput,
  ForecastingInput,
  InventoryInput,
  ProjectManagementInput,
  WaitingLinesInput,
} from '../../../core/types/module.types.ts';
import { parseClipboardGrid, parseClipboardNumber } from '../../utils/gridPaste.ts';

export function ProjectManagementEditor({
  input,
  onChange,
}: {
  input: ProjectManagementInput;
  onChange: (next: ProjectManagementInput) => void;
}) {
  const [showCrashing, setShowCrashing] = useState(
    () =>
      input.targetCrashDuration !== undefined ||
      input.activities.some(
        (a) => a.crashTime !== undefined || a.normalCost !== undefined || a.crashCost !== undefined,
      ),
  );

  const addActivity = () => {
    const nextCode = String.fromCharCode(65 + input.activities.length);
    onChange({
      ...input,
      activities: [
        ...input.activities,
        {
          id: nextCode,
          name: `Aktivitas ${nextCode}`,
          predecessors: [],
          duration: 3,
          optimistic: 2,
          mostLikely: 3,
          pessimistic: 5,
          ...(showCrashing ? { crashTime: 2, normalCost: 100, crashCost: 180 } : {}),
        },
      ],
    });
  };

  const handleToggleCrashing = (enabled: boolean) => {
    setShowCrashing(enabled);
    if (enabled) {
      onChange({
        ...input,
        activities: input.activities.map((a) => {
          const baseDur = a.duration ?? a.mostLikely ?? 3;
          return {
            ...a,
            crashTime: a.crashTime ?? Math.max(1, Math.floor(baseDur * 0.7)),
            normalCost: a.normalCost ?? 100,
            crashCost: a.crashCost ?? 160,
          };
        }),
      });
    } else {
      onChange({
        ...input,
        targetCrashDuration: undefined,
        activities: input.activities.map(({ crashTime: _ct, normalCost: _nc, crashCost: _cc, ...rest }) => rest),
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Mode Estimasi Waktu</label>
          <select
            className="form-control"
            value={input.mode}
            onChange={(e) => onChange({ ...input, mode: e.target.value as 'cpm' | 'pert' })}
          >
            <option value="pert">PERT (3 Estimasi: a, m, b)</option>
            <option value="cpm">CPM (Durasi Pasti Tunggal)</option>
          </select>
        </div>
        {input.mode === 'pert' && (
          <div className="field-group">
            <label className="field-label">Target Waktu Selesai (Probabilitas Z)</label>
            <input
              type="number"
              className="form-control mono-num"
              value={input.targetTime ?? 25}
              onChange={(e) => onChange({ ...input, targetTime: Number(e.target.value) })}
            />
          </div>
        )}
        <div className="field-group" style={{ justifyContent: 'flex-end' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={showCrashing}
              onChange={(e) => handleToggleCrashing(e.target.checked)}
            />
            Aktifkan Time-Cost Crashing
          </label>
        </div>
        {showCrashing && (
          <div className="field-group">
            <label className="field-label">Target Durasi Crash (Opsional)</label>
            <input
              type="number"
              className="form-control mono-num"
              placeholder="Maksimal crash"
              value={input.targetCrashDuration ?? ''}
              onChange={(e) =>
                onChange({
                  ...input,
                  targetCrashDuration: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button type="button" className="btn btn-sm" onClick={addActivity}>
            <Plus size={12} /> Tambah Aktivitas
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nama Aktivitas</th>
              <th>Predecessor (koma)</th>
              {input.mode === 'cpm' ? (
                <th>Durasi</th>
              ) : (
                <>
                  <th>Optimis (a)</th>
                  <th>Most Likely (m)</th>
                  <th>Pesimis (b)</th>
                </>
              )}
              {showCrashing && (
                <>
                  <th>Crash Time</th>
                  <th>Normal Cost</th>
                  <th>Crash Cost</th>
                </>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {input.activities.map((act, i) => (
              <tr key={i}>
                <td style={{ width: 65 }}>
                  <input
                    type="text"
                    className="cell-input"
                    value={act.id}
                    onChange={(e) => {
                      const next = [...input.activities];
                      next[i] = { ...act, id: e.target.value };
                      onChange({ ...input, activities: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={act.name}
                    onChange={(e) => {
                      const next = [...input.activities];
                      next[i] = { ...act, name: e.target.value };
                      onChange({ ...input, activities: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    placeholder="misal A, B"
                    value={act.predecessors.join(', ')}
                    onChange={(e) => {
                      const next = [...input.activities];
                      next[i] = {
                        ...act,
                        predecessors: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      };
                      onChange({ ...input, activities: next });
                    }}
                  />
                </td>
                {input.mode === 'cpm' ? (
                  <td>
                    <input
                      type="number"
                      className="cell-input num"
                      value={act.duration ?? act.mostLikely ?? 1}
                      onChange={(e) => {
                        const next = [...input.activities];
                        next[i] = { ...act, duration: Number(e.target.value) };
                        onChange({ ...input, activities: next });
                      }}
                    />
                  </td>
                ) : (
                  <>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={act.optimistic ?? 1}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, optimistic: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={act.mostLikely ?? 2}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, mostLikely: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={act.pessimistic ?? 3}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, pessimistic: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                  </>
                )}
                {showCrashing && (
                  <>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="cell-input num"
                        value={act.crashTime ?? 1}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, crashTime: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="cell-input num"
                        value={act.normalCost ?? 0}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, normalCost: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="cell-input num"
                        value={act.crashCost ?? 0}
                        onChange={(e) => {
                          const next = [...input.activities];
                          next[i] = { ...act, crashCost: Number(e.target.value) };
                          onChange({ ...input, activities: next });
                        }}
                      />
                    </td>
                  </>
                )}
                <td>
                  {input.activities.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        onChange({
                          ...input,
                          activities: input.activities.filter((_, idx) => idx !== i),
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

export function ForecastingEditor({
  input,
  onChange,
}: {
  input: ForecastingInput;
  onChange: (next: ForecastingInput) => void;
}) {
  const addPeriod = () => {
    const idx = input.values.length + 1;
    onChange({
      ...input,
      periodLabels: [...input.periodLabels, `P${idx}`],
      values: [...input.values, input.values[input.values.length - 1] ?? 100],
    });
  };

  const handleSeriesPaste = (e: ClipboardEvent<HTMLInputElement>, startIdx: number, colMode: 'label' | 'value') => {
    const raw = e.clipboardData.getData('text/plain');
    if (!raw.includes('\t') && !raw.includes('\n')) return;
    e.preventDefault();
    const grid = parseClipboardGrid(raw);
    const labels = [...input.periodLabels];
    const values = [...input.values];

    for (let r = 0; r < grid.length; r += 1) {
      const idx = startIdx + r;
      const row = grid[r];
      if (colMode === 'label' && row.length >= 2) {
        labels[idx] = row[0] || `P${idx + 1}`;
        values[idx] = parseClipboardNumber(row[1], 0);
      } else {
        values[idx] = parseClipboardNumber(row[0], 0);
        if (!labels[idx]) labels[idx] = `P${idx + 1}`;
      }
    }
    onChange({ ...input, periodLabels: labels, values });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Window Moving Average (k)</label>
          <input
            type="number"
            min={2}
            className="form-control mono-num"
            value={input.movingAvgWindow}
            onChange={(e) => onChange({ ...input, movingAvgWindow: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Alpha (α Exp. Smoothing)</label>
          <input
            type="number"
            step="0.05"
            min={0.01}
            max={0.99}
            className="form-control mono-num"
            value={input.alpha}
            onChange={(e) => onChange({ ...input, alpha: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Beta (β Holt Trend)</label>
          <input
            type="number"
            step="0.05"
            min={0.01}
            max={0.99}
            className="form-control mono-num"
            value={input.beta}
            onChange={(e) => onChange({ ...input, beta: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Horizon Ramalan (Periode)</label>
          <input
            type="number"
            min={1}
            className="form-control mono-num"
            value={input.horizon}
            onChange={(e) => onChange({ ...input, horizon: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Periode Musiman (L, opsional)</label>
          <input
            type="number"
            min={0}
            placeholder="0 = non-musiman"
            className="form-control mono-num"
            value={input.seasonalPeriod ?? ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange({
                ...input,
                seasonalPeriod: e.target.value === '' || v < 2 ? undefined : Math.round(v),
              });
            }}
          />
        </div>
        {(input.seasonalPeriod ?? 0) >= 2 && (
          <>
            <div className="field-group">
              <label className="field-label">Tipe Musiman</label>
              <select
                className="form-control"
                value={input.seasonalType ?? 'multiplicative'}
                onChange={(e) =>
                  onChange({ ...input, seasonalType: e.target.value as 'multiplicative' | 'additive' })
                }
              >
                <option value="multiplicative">Multiplicative (Y / Indeks)</option>
                <option value="additive">Additive (Y - Indeks)</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Gamma (γ Holt-Winters)</label>
              <input
                type="number"
                step="0.05"
                min={0.01}
                max={0.99}
                className="form-control mono-num"
                value={input.gamma ?? 0.25}
                onChange={(e) => onChange({ ...input, gamma: Number(e.target.value) })}
              />
            </div>
          </>
        )}
        <div className="field-group" style={{ justifyContent: 'flex-end' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={Boolean(input.autoOptimize)}
              onChange={(e) => onChange({ ...input, autoOptimize: e.target.checked })}
            />
            Auto-Tune (α, β) Optimal
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="paste-hint">Ctrl+V 1 atau 2 kolom data historis dari Excel</span>
        <button type="button" className="btn btn-sm" onClick={addPeriod}>
          <Plus size={12} /> Tambah Periode
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Periode</th>
              <th>Nilai Permintaan / Aktual</th>
              <th style={{ width: 42 }} />
            </tr>
          </thead>
          <tbody>
            {input.values.map((val, i) => (
              <tr key={i}>
                <td>
                  <input
                    type="text"
                    className="cell-input"
                    value={input.periodLabels[i] ?? `P${i + 1}`}
                    onPaste={(e) => handleSeriesPaste(e, i, 'label')}
                    onChange={(e) => {
                      const next = [...input.periodLabels];
                      next[i] = e.target.value;
                      onChange({ ...input, periodLabels: next });
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    className="cell-input num"
                    value={val}
                    onPaste={(e) => handleSeriesPaste(e, i, 'value')}
                    onChange={(e) => {
                      const next = [...input.values];
                      next[i] = Number(e.target.value);
                      onChange({ ...input, values: next });
                    }}
                  />
                </td>
                <td>
                  {input.values.length > 3 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        onChange({
                          ...input,
                          periodLabels: input.periodLabels.filter((_, idx) => idx !== i),
                          values: input.values.filter((_, idx) => idx !== i),
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

export function InventoryEditor({
  input,
  onChange,
}: {
  input: InventoryInput;
  onChange: (next: InventoryInput) => void;
}) {
  const abcItems = input.abcItems ?? [];
  const discountTiers = input.discountTiers ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Model Persediaan</label>
          <select
            className="form-control"
            value={input.model}
            onChange={(e) =>
              onChange({ ...input, model: e.target.value as InventoryInput['model'] })
            }
          >
            <option value="eoq">Economic Order Quantity (EOQ)</option>
            <option value="poq">Production Order Quantity (POQ)</option>
            <option value="quantity-discount">Quantity Discount Model</option>
            <option value="abc">ABC Classification (Pareto)</option>
          </select>
        </div>

        {input.model !== 'abc' && (
          <>
            <div className="field-group">
              <label className="field-label">Permintaan Tahunan (D)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.annualDemand}
                onChange={(e) => onChange({ ...input, annualDemand: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Biaya Pesan / Setup (S)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.orderingCost}
                onChange={(e) => onChange({ ...input, orderingCost: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Biaya Simpan / Unit / Thn (H)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.holdingCostPerUnit}
                onChange={(e) => onChange({ ...input, holdingCostPerUnit: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Harga Unit (P)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.unitPrice}
                onChange={(e) => onChange({ ...input, unitPrice: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Lead Time (Hari)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.leadTimeDays ?? 5}
                onChange={(e) => onChange({ ...input, leadTimeDays: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {input.model === 'poq' && (
          <>
            <div className="field-group">
              <label className="field-label">Laju Permintaan Harian (d)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.dailyDemandRate ?? 20}
                onChange={(e) => onChange({ ...input, dailyDemandRate: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Laju Produksi Harian (p)</label>
              <input
                type="number"
                className="form-control mono-num"
                value={input.dailyProductionRate ?? 60}
                onChange={(e) =>
                  onChange({ ...input, dailyProductionRate: Number(e.target.value) })
                }
              />
            </div>
          </>
        )}
      </div>

      {input.model === 'quantity-discount' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const lastMax = discountTiers[discountTiers.length - 1]?.maxQty ?? 999;
                onChange({
                  ...input,
                  discountTiers: [
                    ...discountTiers,
                    { minQty: lastMax + 1, maxQty: null, unitPrice: Math.max(1, input.unitPrice - 5) },
                  ],
                });
              }}
            >
              <Plus size={12} /> Tambah Tier Harga
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Min Qty</th>
                  <th>Max Qty (kosong = ∞)</th>
                  <th>Harga / Unit</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {discountTiers.map((tier, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={tier.minQty}
                        onChange={(e) => {
                          const next = [...discountTiers];
                          next[i] = { ...tier, minQty: Number(e.target.value) };
                          onChange({ ...input, discountTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        placeholder="∞"
                        value={tier.maxQty ?? ''}
                        onChange={(e) => {
                          const next = [...discountTiers];
                          next[i] = {
                            ...tier,
                            maxQty: e.target.value === '' ? null : Number(e.target.value),
                          };
                          onChange({ ...input, discountTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={tier.unitPrice}
                        onChange={(e) => {
                          const next = [...discountTiers];
                          next[i] = { ...tier, unitPrice: Number(e.target.value) };
                          onChange({ ...input, discountTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      {discountTiers.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() =>
                            onChange({
                              ...input,
                              discountTiers: discountTiers.filter((_, idx) => idx !== i),
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
      )}

      {input.model === 'abc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onChange({
                  ...input,
                  abcItems: [
                    ...abcItems,
                    { sku: `SKU-${abcItems.length + 1}`, annualUsage: 500, unitCost: 20 },
                  ],
                })
              }
            >
              <Plus size={12} /> Tambah SKU
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nama SKU</th>
                  <th>Pemakaian Tahunan</th>
                  <th>Harga / Unit</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {abcItems.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="text"
                        className="cell-input"
                        value={it.sku}
                        onChange={(e) => {
                          const next = [...abcItems];
                          next[i] = { ...it, sku: e.target.value };
                          onChange({ ...input, abcItems: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={it.annualUsage}
                        onChange={(e) => {
                          const next = [...abcItems];
                          next[i] = { ...it, annualUsage: Number(e.target.value) };
                          onChange({ ...input, abcItems: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="cell-input num"
                        value={it.unitCost}
                        onChange={(e) => {
                          const next = [...abcItems];
                          next[i] = { ...it, unitCost: Number(e.target.value) };
                          onChange({ ...input, abcItems: next });
                        }}
                      />
                    </td>
                    <td>
                      {abcItems.length > 2 && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() =>
                            onChange({
                              ...input,
                              abcItems: abcItems.filter((_, idx) => idx !== i),
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
      )}
    </div>
  );
}

export function WaitingLinesEditor({
  input,
  onChange,
}: {
  input: WaitingLinesInput;
  onChange: (next: WaitingLinesInput) => void;
}) {
  return (
    <div className="form-grid" style={{ marginBottom: 0 }}>
      <div className="field-group">
        <label className="field-label">Model Antrean</label>
        <select
          className="form-control"
          value={input.model}
          onChange={(e) =>
            onChange({ ...input, model: e.target.value as WaitingLinesInput['model'] })
          }
        >
          <option value="mm1">M/M/1 (Server Tunggal)</option>
          <option value="mms">M/M/s (Multi-Server Erlang-C)</option>
          <option value="mm1k">M/M/1/K (Kapasitas Terbatas)</option>
          <option value="md1">M/D/1 (Waktu Layanan Konstan)</option>
        </select>
      </div>
      <div className="field-group">
        <label className="field-label">Laju Kedatangan (λ)</label>
        <input
          type="number"
          step="0.1"
          className="form-control mono-num"
          value={input.arrivalRate}
          onChange={(e) => onChange({ ...input, arrivalRate: Number(e.target.value) })}
        />
      </div>
      <div className="field-group">
        <label className="field-label">Laju Layanan per Server (μ)</label>
        <input
          type="number"
          step="0.1"
          className="form-control mono-num"
          value={input.serviceRate}
          onChange={(e) => onChange({ ...input, serviceRate: Number(e.target.value) })}
        />
      </div>
      {input.model === 'mms' && (
        <div className="field-group">
          <label className="field-label">Jumlah Server (s)</label>
          <input
            type="number"
            min={1}
            className="form-control mono-num"
            value={input.servers}
            onChange={(e) => onChange({ ...input, servers: Number(e.target.value) })}
          />
        </div>
      )}
      {input.model === 'mm1k' && (
        <div className="field-group">
          <label className="field-label">Kapasitas Sistem (K)</label>
          <input
            type="number"
            min={1}
            className="form-control mono-num"
            value={input.systemCapacity ?? 10}
            onChange={(e) => onChange({ ...input, systemCapacity: Number(e.target.value) })}
          />
        </div>
      )}
      <div className="field-group">
        <label className="field-label">Biaya Tunggu / Jam (Cw)</label>
        <input
          type="number"
          className="form-control mono-num"
          value={input.waitingCostPerHour ?? 0}
          onChange={(e) => onChange({ ...input, waitingCostPerHour: Number(e.target.value) })}
        />
      </div>
      <div className="field-group">
        <label className="field-label">Biaya Server / Jam (Cs)</label>
        <input
          type="number"
          className="form-control mono-num"
          value={input.serverCostPerHour ?? 0}
          onChange={(e) => onChange({ ...input, serverCostPerHour: Number(e.target.value) })}
        />
      </div>
    </div>
  );
}

export function BreakEvenEditor({
  input,
  onChange,
}: {
  input: BreakEvenInput;
  onChange: (next: BreakEvenInput) => void;
}) {
  const alts = input.alternatives ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="form-grid" style={{ marginBottom: 0 }}>
        <div className="field-group">
          <label className="field-label">Fixed Cost (FC)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.fixedCost}
            onChange={(e) => onChange({ ...input, fixedCost: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Variable Cost / Unit (VC)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.variableCostPerUnit}
            onChange={(e) => onChange({ ...input, variableCostPerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Harga Jual / Unit (P)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.sellingPricePerUnit}
            onChange={(e) => onChange({ ...input, sellingPricePerUnit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Target Laba</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.targetProfit ?? 0}
            onChange={(e) => onChange({ ...input, targetProfit: Number(e.target.value) })}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Volume Ekspektasi (Unit)</label>
          <input
            type="number"
            className="form-control mono-num"
            value={input.expectedVolume ?? 5000}
            onChange={(e) => onChange({ ...input, expectedVolume: Number(e.target.value) })}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            onChange({
              ...input,
              alternatives: [
                ...alts,
                { name: `Proses ${alts.length + 1}`, fixedCost: 80000, variableCost: 35 },
              ],
            })
          }
        >
          <Plus size={12} /> Tambah Alternatif Crossover
        </button>
      </div>

      {alts.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Alternatif Proses (Crossover)</th>
                <th>Fixed Cost</th>
                <th>Variable Cost / Unit</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {alts.map((alt, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      className="cell-input"
                      value={alt.name}
                      onChange={(e) => {
                        const next = [...alts];
                        next[i] = { ...alt, name: e.target.value };
                        onChange({ ...input, alternatives: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="cell-input num"
                      value={alt.fixedCost}
                      onChange={(e) => {
                        const next = [...alts];
                        next[i] = { ...alt, fixedCost: Number(e.target.value) };
                        onChange({ ...input, alternatives: next });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="cell-input num"
                      value={alt.variableCost}
                      onChange={(e) => {
                        const next = [...alts];
                        next[i] = { ...alt, variableCost: Number(e.target.value) };
                        onChange({ ...input, alternatives: next });
                      }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() =>
                        onChange({
                          ...input,
                          alternatives: alts.filter((_, idx) => idx !== i),
                        })
                      }
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
