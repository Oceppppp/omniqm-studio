import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  AssignmentInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';

/**
 * Exact O(n^3) Hungarian Algorithm (1-indexed potentials implementation)
 */
function hungarianMin(matrix: number[][]): number[] {
  const n = matrix.length;
  const u = Array<number>(n + 1).fill(0);
  const v = Array<number>(n + 1).fill(0);
  const p = Array<number>(n + 1).fill(0);
  const way = Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = Array<number>(n + 1).fill(Infinity);
    const used = Array<boolean>(n + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;

      for (let j = 1; j <= n; j += 1) {
        if (!used[j]) {
          const cur = matrix[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }

      for (let j = 0; j <= n; j += 1) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }

      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const rowToCol = Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j += 1) {
    if (p[j] > 0) {
      rowToCol[p[j] - 1] = j - 1;
    }
  }
  return rowToCol;
}

export function solveAssignment(
  jobId: string,
  jobTitle: string,
  input: AssignmentInput,
): ModuleExecutionResult {
  const start = performance.now();
  const warnings: string[] = [];

  const rows = input.agentNames.length;
  const cols = input.taskNames.length;
  if (rows === 0 || cols === 0) {
    return {
      jobId,
      moduleId: 'assignment',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Matriks penugasan kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Minimal harus terdapat 1 agen dan 1 tugas.'],
      derivedValues: {},
      error: 'Matriks penugasan kosong.',
    };
  }

  const n = Math.max(rows, cols);

  if (rows !== cols) {
    warnings.push(
      `Matriks penugasan tidak persegi (${rows}x${cols}): dilengkapi menjadi ${n}x${n} dengan elemen dummy bernilai 0.`,
    );
  }

  let maxVal = -Infinity;
  const paddedOriginal = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const val = i < rows && j < cols ? input.costs[i]?.[j] ?? 0 : 0;
      if (val > maxVal) maxVal = val;
      return val;
    }),
  );
  if (!Number.isFinite(maxVal)) maxVal = 0;

  const costMatrix = paddedOriginal.map((row) =>
    row.map((val) => (input.sense === 'max' ? maxVal - val : val)),
  );

  const assignmentCols = hungarianMin(costMatrix);

  let totalCost = 0;
  const assignRows: (string | number)[][] = [];
  const realAssignments: { agent: string; task: string; val: number }[] = [];
  for (let i = 0; i < rows; i += 1) {
    const col = assignmentCols[i];
    if (col >= 0 && col < cols) {
      const val = input.costs[i]?.[col] ?? 0;
      totalCost += val;
      realAssignments.push({ agent: input.agentNames[i], task: input.taskNames[col], val });
      assignRows.push([input.agentNames[i], input.taskNames[col], roundTo(val, 2)]);
    } else {
      assignRows.push([input.agentNames[i], '(Dummy / Tidak Ditugaskan)', 0]);
    }
  }

  const assignTable: ResultTable = {
    id: 'assignment-result',
    title: 'Penugasan Optimal (Metode Hungarian)',
    headers: ['Agen / Pekerja', 'Tugas Terpilih', input.sense === 'min' ? 'Biaya' : 'Skor / Profit'],
    rows: assignRows,
  };

  const matrixTable: ResultTable = {
    id: 'assignment-matrix',
    title: 'Matriks Penugasan Lengkap',
    headers: ['Agen \\ Tugas', ...input.taskNames],
    rows: input.agentNames.map((agent, i) => [
      agent,
      ...input.taskNames.map((_, j) =>
        assignmentCols[i] === j ? `* ${roundTo(input.costs[i]?.[j] ?? 0, 2)} *` : roundTo(input.costs[i]?.[j] ?? 0, 2),
      ),
    ]),
  };

  const cellSum = input.costs.reduce(
    (acc, r) => acc + r.reduce((s, v) => s + v, 0),
    0,
  );
  const avgCell = cellSum / Math.max(1, rows * cols);
  const randomBaseline = avgCell * Math.min(rows, cols);
  const improvement =
    input.sense === 'min' ? randomBaseline - totalCost : totalCost - randomBaseline;
  const improvementPct =
    Math.abs(randomBaseline) > 1e-6 ? (improvement / Math.abs(randomBaseline)) * 100 : 0;

  const sortedReal = [...realAssignments].sort((a, b) =>
    input.sense === 'min' ? a.val - b.val : b.val - a.val,
  );
  const strongestPair = sortedReal[0];
  const weakestPair = sortedReal[sortedReal.length - 1];
  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'assignment',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Penugasan optimal Hungarian menghasilkan total ${input.sense === 'min' ? 'biaya' : 'profit'} = ${formatNum(totalCost)}.`,
    kpis: [
      {
        label: input.sense === 'min' ? 'Total Biaya Optimal' : 'Total Profit Optimal',
        value: formatNum(totalCost, 2),
        emphasis: 'primary',
      },
      { label: 'Jumlah Penugasan', value: realAssignments.length, emphasis: 'success' },
      { label: 'Rata-rata per Penugasan', value: formatNum(totalCost / Math.max(1, realAssignments.length), 2) },
      { label: 'Dimensi Matriks', value: `${rows} × ${cols}` },
    ],
    tables: [assignTable, matrixTable],
    charts: [
      {
        kind: 'bar',
        id: 'assignment-bars',
        title: 'Nilai Penugasan Terpilih per Agen',
        xLabel: 'Penugasan',
        yLabel: input.sense === 'min' ? 'Biaya' : 'Profit',
        bars: realAssignments.map((r) => ({
          label: `${r.agent} → ${r.task}`,
          value: roundTo(r.val, 2),
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Reduksi Matriks & Algoritma Hungarian O(n³)',
        formula: 'Reduksi Baris (cᵢⱼ - min baris) → Reduksi Kolom → Penutupan Garis Minimum',
        detail: `Menugaskan ${realAssignments.length} pasangan 1-ke-1 secara optimal dengan total ${input.sense === 'min' ? 'biaya minimum' : 'skor maksimum'} = ${formatNum(totalCost, 2)}.`,
      },
    ],
    analysis: {
      headline: `Alokasi 1-ke-1 Optimal ${improvement >= 0 ? `Lebih Efisien ${formatNum(Math.abs(improvementPct), 1)}%` : ''} Dibanding Penugasan Acak`,
      interpretation: `Metode Hungarian menjamin optimalitas global dengan total ${input.sense === 'min' ? 'biaya' : 'profit'} ${formatNum(totalCost, 2)} (rata-rata ${formatNum(totalCost / Math.max(1, realAssignments.length), 2)} per tugas), dibanding estimasi penugasan acak sebesar ${formatNum(randomBaseline, 2)} (selisih ${formatNum(Math.abs(improvement), 2)}).`,
      sections: [
        {
          heading: 'Pasangan Terbaik & Beban Terberat',
          body:
            strongestPair && weakestPair
              ? `Kecocokan paling optimal adalah ${strongestPair.agent} → ${strongestPair.task} (${formatNum(strongestPair.val, 2)}), sedangkan pasangan bernilai ${input.sense === 'min' ? 'biaya tertinggi' : 'skor terendah'} yang tetap diperlukan demi optimalitas global adalah ${weakestPair.agent} → ${weakestPair.task} (${formatNum(weakestPair.val, 2)}).`
              : 'Seluruh pasangan berhasil dialokasikan.',
          tone: 'neutral',
        },
        {
          heading: 'Keseimbangan Agen & Tugas',
          body:
            rows === cols
              ? `Matriks persegi ${rows}×${cols}: setiap agen mendapat tepat satu tugas tanpa sumber daya yang menganggur.`
              : rows > cols
                ? `Jumlah agen (${rows}) melebihi tugas (${cols}), sehingga ${rows - cols} agen berstatus cadangan (Dummy).`
                : `Jumlah tugas (${cols}) melebihi agen (${rows}), sehingga ${cols - rows} tugas belum teralokasi dan memerlukan kapasitas tambahan.`,
          tone: rows === cols ? 'positive' : 'caution',
        },
      ],
      recommendations: [
        `Terapkan penugasan persis sesuai daftar Hungarian (${realAssignments.map((r) => `${r.agent}→${r.task}`).join(', ')}) karena pemilihan serakah (greedy) per baris belum tentu optimal secara keseluruhan.`,
        ...(weakestPair && input.sense === 'min'
          ? [
              `Tingkatkan pelatihan silang (cross-training) pada "${weakestPair.agent}" untuk tugas "${weakestPair.task}" guna menurunkan biaya penugasan paling tinggi (${formatNum(weakestPair.val, 2)}).`,
            ]
          : []),
      ],
    },
    derivedValues: {
      totalCost: roundTo(totalCost, 4),
    },
  };
}
