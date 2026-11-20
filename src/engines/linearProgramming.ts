import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ConstraintSign,
  LinearProgrammingInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';
import type { Lp2dChartSpec, ModuleChartSpec } from '../core/types/chart.types.ts';

const EPS = 1e-8;

export interface ObjectiveRangeEntry {
  variable: string;
  value: number;
  coeff: number;
  reducedCost: number;
  allowableDecrease: number;
  allowableIncrease: number;
}

export interface RhsRangeEntry {
  constraint: string;
  rhs: number;
  shadowPrice: number;
  allowableDecrease: number;
  allowableIncrease: number;
}

export interface SimplexStepSnapshot {
  step: number;
  phase: 1 | 2;
  enteringVar: string;
  leavingVar: string;
  pivotValue: number;
  objectiveValue: number;
  colHeaders: string[];
  basisLabels: string[];
  rows: number[][];
}

export interface SimplexSolution {
  status: 'optimal' | 'infeasible' | 'unbounded' | 'error';
  objectiveValue: number;
  variableValues: number[];
  slacks: number[];
  shadowPrices: number[];
  reducedCosts: number[];
  iterations: number;
  objectiveRanges?: ObjectiveRangeEntry[];
  rhsRanges?: RhsRangeEntry[];
  steps?: SimplexStepSnapshot[];
  message?: string;
}

interface NormalizedConstraint {
  name: string;
  coeffs: number[];
  sign: ConstraintSign;
  rhs: number;
  flipped: boolean;
}

function normalizeConstraints(input: LinearProgrammingInput): NormalizedConstraint[] {
  return input.constraints.map((c) => {
    if (c.rhs < -EPS) {
      const flippedSign: ConstraintSign =
        c.sign === '<=' ? '>=' : c.sign === '>=' ? '<=' : '=';
      return {
        name: c.name,
        coeffs: c.coeffs.map((v) => -v),
        sign: flippedSign,
        rhs: -c.rhs,
        flipped: true,
      };
    }
    return {
      name: c.name,
      coeffs: [...c.coeffs],
      sign: c.sign,
      rhs: Math.max(0, c.rhs),
      flipped: false,
    };
  });
}

function runSimplexPhase(
  tableau: number[][],
  bInv: number[][],
  basis: number[],
  colHeaders: string[],
  phase: 1 | 2,
  signMult: number,
  stepsOut: SimplexStepSnapshot[],
  maxIterations = 2000,
): { status: 'optimal' | 'unbounded'; iterations: number } {
  const m = basis.length;
  const rhsCol = tableau[0].length - 1;
  const totalVars = rhsCol;
  let iterations = 0;

  while (iterations < maxIterations) {
    let enteringCol = -1;
    let bestNeg = -EPS;
    const useBland = iterations >= 400;

    for (let j = 0; j < totalVars; j += 1) {
      const rc = tableau[m][j];
      if (rc < -EPS) {
        if (useBland) {
          enteringCol = j;
          break;
        }
        if (rc < bestNeg) {
          bestNeg = rc;
          enteringCol = j;
        }
      }
    }

    if (enteringCol === -1) {
      return { status: 'optimal', iterations };
    }

    let leavingRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i += 1) {
      const aij = tableau[i][enteringCol];
      if (aij > EPS) {
        const ratio = Math.max(0, tableau[i][rhsCol]) / aij;
        if (
          ratio < minRatio - EPS ||
          (Math.abs(ratio - minRatio) <= EPS &&
            leavingRow !== -1 &&
            basis[i] < basis[leavingRow])
        ) {
          minRatio = ratio;
          leavingRow = i;
        }
      }
    }

    if (leavingRow === -1) {
      return { status: 'unbounded', iterations };
    }

    const leavingVar = colHeaders[basis[leavingRow]] ?? `B${leavingRow + 1}`;
    const enteringVar = colHeaders[enteringCol] ?? `X${enteringCol + 1}`;
    const pivot = tableau[leavingRow][enteringCol];

    for (let j = 0; j <= totalVars; j += 1) {
      tableau[leavingRow][j] /= pivot;
    }
    for (let j = 0; j < m; j += 1) {
      bInv[leavingRow][j] /= pivot;
    }

    for (let r = 0; r <= m; r += 1) {
      if (r === leavingRow) continue;
      const factor = tableau[r][enteringCol];
      if (Math.abs(factor) < EPS) continue;
      for (let j = 0; j <= totalVars; j += 1) {
        tableau[r][j] -= factor * tableau[leavingRow][j];
      }
      if (r < m) {
        for (let j = 0; j < m; j += 1) {
          bInv[r][j] -= factor * bInv[leavingRow][j];
        }
      }
    }

    basis[leavingRow] = enteringCol;
    iterations += 1;

    if (stepsOut.length < 12) {
      stepsOut.push({
        step: stepsOut.length + 1,
        phase,
        enteringVar,
        leavingVar,
        pivotValue: roundTo(pivot, 4),
        objectiveValue: roundTo(phase === 2 ? signMult * tableau[m][rhsCol] : tableau[m][rhsCol], 4),
        colHeaders: [...colHeaders, 'RHS'],
        basisLabels: [...basis.map((b) => colHeaders[b] ?? `V${b + 1}`), phase === 2 ? 'Z' : 'W'],
        rows: tableau.map((row) => row.map((v) => roundTo(v, 3))),
      });
    }
  }

  return { status: 'optimal', iterations };
}

export function solveSimplexCore(input: LinearProgrammingInput): SimplexSolution {
  const n = input.variableNames.length;
  const m = input.constraints.length;
  if (n === 0 || m === 0) {
    return {
      status: 'error',
      objectiveValue: 0,
      variableValues: Array<number>(n).fill(0),
      slacks: [],
      shadowPrices: [],
      reducedCosts: Array<number>(n).fill(0),
      iterations: 0,
      message: 'Minimal harus terdapat 1 variabel keputusan dan 1 kendala.',
    };
  }

  const normalized = normalizeConstraints(input);

  const slackCols: number[] = [];
  const surplusCols: number[] = [];
  const artificialCols: number[] = [];
  const colHeaders: string[] = [...input.variableNames];

  let nextCol = n;
  for (let i = 0; i < m; i += 1) {
    const sign = normalized[i].sign;
    if (sign === '<=') {
      slackCols.push(nextCol);
      colHeaders.push(`S${i + 1}`);
      nextCol += 1;
    } else if (sign === '>=') {
      surplusCols.push(nextCol);
      colHeaders.push(`Sur${i + 1}`);
      nextCol += 1;
      artificialCols.push(nextCol);
      colHeaders.push(`A${i + 1}`);
      nextCol += 1;
    } else {
      artificialCols.push(nextCol);
      colHeaders.push(`A${i + 1}`);
      nextCol += 1;
    }
  }

  const totalCols = nextCol;
  const rhsCol = totalCols;
  const tableau = Array.from({ length: m + 1 }, () => Array<number>(totalCols + 1).fill(0));
  const bInv = Array.from({ length: m }, (_, i) =>
    Array.from({ length: m }, (__, j) => (i === j ? 1 : 0)),
  );
  const basis: number[] = [];

  let slackIdx = 0;
  let surplusIdx = 0;
  let artIdx = 0;

  for (let i = 0; i < m; i += 1) {
    const c = normalized[i];
    for (let j = 0; j < n; j += 1) {
      tableau[i][j] = c.coeffs[j] ?? 0;
    }
    tableau[i][rhsCol] = c.rhs;

    if (c.sign === '<=') {
      const col = slackCols[slackIdx++];
      tableau[i][col] = 1;
      basis.push(col);
    } else if (c.sign === '>=') {
      const sCol = surplusCols[surplusIdx++];
      const aCol = artificialCols[artIdx++];
      tableau[i][sCol] = -1;
      tableau[i][aCol] = 1;
      basis.push(aCol);
    } else {
      const aCol = artificialCols[artIdx++];
      tableau[i][aCol] = 1;
      basis.push(aCol);
    }
  }

  let totalIterations = 0;
  const steps: SimplexStepSnapshot[] = [];
  const artSet = new Set(artificialCols);
  const signMult = input.sense === 'max' ? 1 : -1;

  if (artificialCols.length > 0) {
    for (const aCol of artificialCols) {
      tableau[m][aCol] = 1;
    }
    for (let i = 0; i < m; i += 1) {
      if (artSet.has(basis[i])) {
        for (let j = 0; j <= totalCols; j += 1) {
          tableau[m][j] -= tableau[i][j];
        }
      }
    }

    const p1 = runSimplexPhase(tableau, bInv, basis, colHeaders, 1, signMult, steps);
    totalIterations += p1.iterations;

    if (tableau[m][rhsCol] < -1e-5) {
      return {
        status: 'infeasible',
        objectiveValue: 0,
        variableValues: Array<number>(n).fill(0),
        slacks: Array<number>(m).fill(0),
        shadowPrices: Array<number>(m).fill(0),
        reducedCosts: Array<number>(n).fill(0),
        iterations: totalIterations,
        steps,
        message: 'Tidak ada solusi layak (Infeasible): kendala saling bertentangan.',
      };
    }

    for (let i = 0; i < m; i += 1) {
      if (artSet.has(basis[i])) {
        let replacement = -1;
        for (let j = 0; j < totalCols; j += 1) {
          if (!artSet.has(j) && Math.abs(tableau[i][j]) > EPS) {
            replacement = j;
            break;
          }
        }
        if (replacement !== -1) {
          const piv = tableau[i][replacement];
          for (let j = 0; j <= totalCols; j += 1) tableau[i][j] /= piv;
          for (let j = 0; j < m; j += 1) bInv[i][j] /= piv;
          for (let r = 0; r <= m; r += 1) {
            if (r === i) continue;
            const f = tableau[r][replacement];
            if (Math.abs(f) < EPS) continue;
            for (let j = 0; j <= totalCols; j += 1) tableau[r][j] -= f * tableau[i][j];
            if (r < m) {
              for (let j = 0; j < m; j += 1) bInv[r][j] -= f * bInv[i][j];
            }
          }
          basis[i] = replacement;
        }
      }
    }
  }

  const activeMask = Array<boolean>(totalCols).fill(true);
  for (const aCol of artificialCols) {
    activeMask[aCol] = false;
    if (!basis.includes(aCol)) {
      for (let r = 0; r <= m; r += 1) tableau[r][aCol] = 0;
    }
  }

  tableau[m].fill(0);
  for (let j = 0; j < n; j += 1) {
    tableau[m][j] = -(signMult * (input.objectiveCoeffs[j] ?? 0));
  }

  for (let i = 0; i < m; i += 1) {
    const bCol = basis[i];
    const cb = bCol < n ? signMult * (input.objectiveCoeffs[bCol] ?? 0) : 0;
    if (Math.abs(cb) > EPS) {
      for (let j = 0; j <= totalCols; j += 1) {
        tableau[m][j] += cb * tableau[i][j];
      }
    }
  }

  // Ensure artificial columns cannot enter during Phase 2
  for (const aCol of artificialCols) {
    if (!basis.includes(aCol)) {
      tableau[m][aCol] = 0;
    }
  }

  const p2 = runSimplexPhase(tableau, bInv, basis, colHeaders, 2, signMult, steps);
  totalIterations += p2.iterations;

  if (p2.status === 'unbounded') {
    return {
      status: 'unbounded',
      objectiveValue: input.sense === 'max' ? Infinity : -Infinity,
      variableValues: Array<number>(n).fill(0),
      slacks: Array<number>(m).fill(0),
      shadowPrices: Array<number>(m).fill(0),
      reducedCosts: Array<number>(n).fill(0),
      iterations: totalIterations,
      steps,
      message: 'Fungsi tujuan tidak terbatas (Unbounded). Periksa kembali kendala.',
    };
  }

  const variableValues = Array<number>(n).fill(0);
  for (let i = 0; i < m; i += 1) {
    if (basis[i] < n) {
      variableValues[basis[i]] = Math.max(0, tableau[i][rhsCol]);
    }
  }

  const objectiveValue = signMult * tableau[m][rhsCol];

  const slacks = input.constraints.map((c) => {
    const lhs = c.coeffs.reduce((acc, coeff, j) => acc + coeff * variableValues[j], 0);
    return Math.abs(c.rhs - lhs);
  });

  // Exact Shadow Prices (dual vector y = c_B^T * B^-1) across ALL constraint types (<=, >=, =)
  const cBasis = basis.map((bCol) =>
    bCol < n ? signMult * (input.objectiveCoeffs[bCol] ?? 0) : 0,
  );
  const shadowPrices = normalized.map((c, idx) => {
    let rawDual = 0;
    for (let r = 0; r < m; r += 1) {
      rawDual += cBasis[r] * bInv[r][idx];
    }
    const oriented = signMult * rawDual;
    return c.flipped ? -oriented : oriented;
  });

  const reducedCosts = Array.from({ length: n }, (_, j) => -signMult * tableau[m][j]);

  // Objective Coefficient Sensitivity / Ranging
  const basisSet = new Set(basis);
  const objectiveRanges: ObjectiveRangeEntry[] = input.variableNames.map((name, j) => {
    const coeff = input.objectiveCoeffs[j] ?? 0;
    const basisRowIdx = basis.indexOf(j);
    let allowInc = Infinity;
    let allowDec = Infinity;

    if (basisRowIdx === -1) {
      const gap = Math.max(0, tableau[m][j]);
      if (input.sense === 'max') {
        allowInc = gap;
      } else {
        allowDec = gap;
      }
    } else {
      for (let k = 0; k < totalCols; k += 1) {
        if (!activeMask[k] || basisSet.has(k) || artSet.has(k)) continue;
        const rk = tableau[basisRowIdx][k];
        const mk = Math.max(0, tableau[m][k]);
        const gamma = signMult * rk;
        if (gamma > EPS) {
          allowDec = Math.min(allowDec, mk / gamma);
        } else if (gamma < -EPS) {
          allowInc = Math.min(allowInc, mk / -gamma);
        }
      }
    }

    return {
      variable: name,
      value: variableValues[j],
      coeff,
      reducedCost: reducedCosts[j],
      allowableDecrease: allowDec,
      allowableIncrease: allowInc,
    };
  });

  // Constraint RHS Sensitivity / Ranging using exact tracked B^-1
  const rhsRanges: RhsRangeEntry[] = input.constraints.map((c, i) => {
    let allowInc = Infinity;
    let allowDec = Infinity;
    const flipMult = normalized[i].flipped ? -1 : 1;

    for (let r = 0; r < m; r += 1) {
      const val = Math.max(0, tableau[r][rhsCol]);
      const d = flipMult * bInv[r][i];
      if (d > EPS) {
        allowDec = Math.min(allowDec, val / d);
      } else if (d < -EPS) {
        allowInc = Math.min(allowInc, val / -d);
      }
    }

    return {
      constraint: c.name,
      rhs: c.rhs,
      shadowPrice: shadowPrices[i],
      allowableDecrease: allowDec,
      allowableIncrease: allowInc,
    };
  });

  return {
    status: 'optimal',
    objectiveValue,
    variableValues,
    slacks,
    shadowPrices,
    reducedCosts,
    iterations: totalIterations,
    objectiveRanges,
    rhsRanges,
    steps,
  };
}


function build2dFeasiblePlot(
  input: LinearProgrammingInput,
  sol: SimplexSolution,
): Lp2dChartSpec | null {
  if (input.variableNames.length !== 2 || sol.status !== 'optimal') return null;

  type Line = { a: number; b: number; rhs: number; label: string };
  const lines: Line[] = input.constraints.map((c) => ({
    a: c.coeffs[0] ?? 0,
    b: c.coeffs[1] ?? 0,
    rhs: c.rhs,
    label: c.name,
  }));

  const isFeasible = (x1: number, x2: number) => {
    if (x1 < -1e-6 || x2 < -1e-6) return false;
    return input.constraints.every((c) => {
      const lhs = (c.coeffs[0] ?? 0) * x1 + (c.coeffs[1] ?? 0) * x2;
      if (c.sign === '<=') return lhs <= c.rhs + 1e-6;
      if (c.sign === '>=') return lhs >= c.rhs - 1e-6;
      return Math.abs(lhs - c.rhs) <= 1e-6;
    });
  };

  let maxX1 = Math.max(sol.variableValues[0] * 1.45, 10);
  let maxX2 = Math.max(sol.variableValues[1] * 1.45, 10);
  for (const l of lines) {
    if (Math.abs(l.a) > 1e-6 && l.rhs > 0) {
      maxX1 = Math.max(maxX1, Math.min((l.rhs / l.a) * 1.2, maxX1 * 2.5));
    }
    if (Math.abs(l.b) > 1e-6 && l.rhs > 0) {
      maxX2 = Math.max(maxX2, Math.min((l.rhs / l.b) * 1.2, maxX2 * 2.5));
    }
  }

  // Include non-negativity axes and plot bounding box for unbounded MIN feasible regions
  const allLines: Line[] = [
    ...lines,
    { a: 1, b: 0, rhs: 0, label: 'x1=0' },
    { a: 0, b: 1, rhs: 0, label: 'x2=0' },
    { a: 1, b: 0, rhs: maxX1, label: 'x1=max' },
    { a: 0, b: 1, rhs: maxX2, label: 'x2=max' },
  ];

  const candidates: { x1: number; x2: number }[] = [];
  for (let i = 0; i < allLines.length; i += 1) {
    for (let j = i + 1; j < allLines.length; j += 1) {
      const l1 = allLines[i];
      const l2 = allLines[j];
      const det = l1.a * l2.b - l2.a * l1.b;
      if (Math.abs(det) < 1e-9) continue;
      const x1 = (l1.rhs * l2.b - l2.rhs * l1.b) / det;
      const x2 = (l1.a * l2.rhs - l2.a * l1.rhs) / det;
      if (
        Number.isFinite(x1) &&
        Number.isFinite(x2) &&
        x1 <= maxX1 + 1e-5 &&
        x2 <= maxX2 + 1e-5 &&
        isFeasible(x1, x2)
      ) {
        const dup = candidates.some(
          (p) => Math.hypot(p.x1 - x1, p.x2 - x2) < 1e-5,
        );
        if (!dup) candidates.push({ x1: Math.max(0, x1), x2: Math.max(0, x2) });
      }
    }
  }

  if (candidates.length >= 3) {
    const cx = candidates.reduce((s, p) => s + p.x1, 0) / candidates.length;
    const cy = candidates.reduce((s, p) => s + p.x2, 0) / candidates.length;
    candidates.sort(
      (p1, p2) => Math.atan2(p1.x2 - cy, p1.x1 - cx) - Math.atan2(p2.x2 - cy, p2.x1 - cx),
    );
  }

  const constraintLines = lines
    .map((l) => {
      if (Math.abs(l.b) < 1e-7 && Math.abs(l.a) > 1e-7) {
        const x = l.rhs / l.a;
        return { label: l.label, p1: { x1: x, x2: 0 }, p2: { x1: x, x2: maxX2 } };
      }
      if (Math.abs(l.a) < 1e-7 && Math.abs(l.b) > 1e-7) {
        const y = l.rhs / l.b;
        return { label: l.label, p1: { x1: 0, x2: y }, p2: { x1: maxX1, x2: y } };
      }
      if (Math.abs(l.b) >= 1e-7) {
        const yAt0 = l.rhs / l.b;
        const xAt0 = l.rhs / l.a;
        if (yAt0 >= 0 && xAt0 >= 0) {
          return { label: l.label, p1: { x1: 0, x2: yAt0 }, p2: { x1: xAt0, x2: 0 } };
        }
        return {
          label: l.label,
          p1: { x1: 0, x2: yAt0 },
          p2: { x1: maxX1, x2: (l.rhs - l.a * maxX1) / l.b },
        };
      }
      return null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    kind: 'lp2d',
    id: 'lp-2d-plot',
    title: 'Grafik Daerah Layak (Feasible Region 2D)',
    subtitle: `Titik Optimal (${formatNum(sol.variableValues[0])}, ${formatNum(sol.variableValues[1])})`,
    x1Label: input.variableNames[0],
    x2Label: input.variableNames[1],
    maxX1,
    maxX2,
    feasiblePolygon: candidates,
    constraintLines,
    optimalPoint: {
      x1: sol.variableValues[0],
      x2: sol.variableValues[1],
      z: sol.objectiveValue,
    },
  };
}

export function solveLinearProgramming(
  jobId: string,
  jobTitle: string,
  input: LinearProgrammingInput,
): ModuleExecutionResult {
  const start = performance.now();
  const sol = solveSimplexCore(input);
  const elapsed = roundTo(performance.now() - start, 2);

  if (sol.status !== 'optimal') {
    const isInf = sol.status === 'infeasible';
    const isUnb = sol.status === 'unbounded';
    return {
      jobId,
      moduleId: 'linear-programming',
      jobTitle,
      status: sol.status === 'error' ? 'error' : 'warning',
      executionMs: elapsed,
      summaryText: sol.message ?? `Status optimasi: ${sol.status}`,
      kpis: [
        { label: 'Status Solusi', value: sol.status.toUpperCase(), emphasis: 'danger' },
        { label: 'Iterasi Simpleks', value: sol.iterations },
      ],
      tables: [],
      charts: [],
      warnings: [sol.message ?? 'Solusi optimal tidak ditemukan'],
      analysis: {
        headline: isInf
          ? 'Model Tidak Memiliki Daerah Layak (Infeasible)'
          : isUnb
            ? 'Fungsi Tujuan Tidak Terbatas (Unbounded)'
            : 'Formulasi Model Belum Lengkap',
        interpretation: isInf
          ? 'Kombinasi batas atas (≤), batas bawah (≥), dan persamaan (=) saling bertentangan sehingga tidak ada satu pun titik non-negatif yang memenuhi seluruh kendala sekaligus.'
          : isUnb
            ? `Nilai fungsi tujuan ${input.sense.toUpperCase()} Z dapat bergerak menuju tak hingga karena satu atau lebih variabel keputusan tidak dibatasi oleh kendala kapasitas.`
            : sol.message ?? 'Periksa kelengkapan variabel dan kendala model.',
        sections: [
          {
            heading: 'Diagnosis Matematis Simpleks',
            body: isInf
              ? `Fase 1 Metode Simpleks gagal menihilkan variabel artifisial dalam ${sol.iterations} iterasi, membuktikan irisan himpunan kendala kosong (∅).`
              : isUnb
                ? `Fase 2 menemukan variabel masuk basis dengan koefisien kolom ≤ 0 pada seluruh baris sehingga rasio uji minimum tidak ada.`
                : 'Minimal diperlukan 1 variabel keputusan dan 1 baris kendala.',
            tone: 'critical',
          },
        ],
        recommendations: isInf
          ? [
              'Periksa ulang kendala bertanda ≥ dan = yang mungkin menuntut target melebihi kapasitas kendala ≤.',
              'Longgarkan RHS kendala yang paling ketat satu per satu untuk menemukan sumber konflik kelayakan.',
            ]
          : [
              'Tambahkan kendala kapasitas (≤) untuk membatasi variabel yang tumbuh tanpa batas.',
              'Periksa kembali arah tujuan (MAX vs MIN) dan tanda pertidaksamaan kendala.',
            ],
      },
      derivedValues: {},
      error: sol.status === 'error' ? sol.message : undefined,
    };
  }

  const fmtDelta = (val: number): string | number => (Number.isFinite(val) ? roundTo(val, 4) : '∞');

  const varTable: ResultTable = {
    id: 'lp-variables',
    title: 'Nilai Variabel Keputusan Optimal',
    headers: ['Variabel', 'Nilai Optimal', 'Koefisien Tujuan', 'Kontribusi Z', 'Reduced Cost'],
    rows: input.variableNames.map((name, i) => [
      name,
      roundTo(sol.variableValues[i], 4),
      roundTo(input.objectiveCoeffs[i] ?? 0, 4),
      roundTo(sol.variableValues[i] * (input.objectiveCoeffs[i] ?? 0), 4),
      roundTo(sol.reducedCosts[i], 4),
    ]),
  };

  const constraintTable: ResultTable = {
    id: 'lp-constraints',
    title: 'Analisis Kendala & Shadow Price (Dual Value)',
    headers: ['Kendala', 'Tanda', 'RHS', 'Nilai Terpakai (LHS)', 'Slack / Surplus', 'Shadow Price'],
    rows: input.constraints.map((c, i) => {
      const lhs = c.coeffs.reduce((acc, coeff, j) => acc + coeff * sol.variableValues[j], 0);
      return [
        c.name,
        c.sign,
        roundTo(c.rhs, 4),
        roundTo(lhs, 4),
        roundTo(sol.slacks[i], 4),
        roundTo(sol.shadowPrices[i], 4),
      ];
    }),
  };

  const tables: ResultTable[] = [varTable, constraintTable];

  if (sol.objectiveRanges && sol.objectiveRanges.length > 0) {
    tables.push({
      id: 'lp-ranging-obj',
      title: 'Ranging Analysis — Koefisien Fungsi Tujuan (Cj)',
      subtitle: 'Rentang koefisien tujuan agar basis optimal saat ini tidak berubah.',
      headers: [
        'Variabel',
        'Nilai Optimal',
        'Koef. Asal (Cj)',
        'Allowable Decrease',
        'Allowable Increase',
        'Batas Bawah',
        'Batas Atas',
      ],
      rows: sol.objectiveRanges.map((r) => [
        r.variable,
        roundTo(r.value, 4),
        roundTo(r.coeff, 4),
        fmtDelta(r.allowableDecrease),
        fmtDelta(r.allowableIncrease),
        Number.isFinite(r.allowableDecrease) ? roundTo(r.coeff - r.allowableDecrease, 4) : '-∞',
        Number.isFinite(r.allowableIncrease) ? roundTo(r.coeff + r.allowableIncrease, 4) : '∞',
      ]),
    });
  }

  if (sol.rhsRanges && sol.rhsRanges.length > 0) {
    tables.push({
      id: 'lp-ranging-rhs',
      title: 'Ranging Analysis — Kapasitas Kendala / RHS (bi)',
      subtitle: 'Rentang perubahan RHS agar Shadow Price & basis tetap valid.',
      headers: [
        'Kendala',
        'RHS Asal',
        'Shadow Price',
        'Allowable Decrease',
        'Allowable Increase',
        'Batas Bawah',
        'Batas Atas',
      ],
      rows: sol.rhsRanges.map((r) => [
        r.constraint,
        roundTo(r.rhs, 4),
        roundTo(r.shadowPrice, 4),
        fmtDelta(r.allowableDecrease),
        fmtDelta(r.allowableIncrease),
        Number.isFinite(r.allowableDecrease) ? roundTo(r.rhs - r.allowableDecrease, 4) : '-∞',
        Number.isFinite(r.allowableIncrease) ? roundTo(r.rhs + r.allowableIncrease, 4) : '∞',
      ]),
    });
  }

  if (sol.steps && sol.steps.length > 0) {
    tables.push({
      id: 'lp-simplex-steps',
      title: `Jejak Iterasi Tabel Simpleks (${sol.steps.length} Langkah Terakhir)`,
      subtitle: 'Ringkasan variabel masuk/keluar basis & nilai pivot di setiap iterasi.',
      headers: ['Iterasi', 'Fase', 'Masuk Basis (Entering)', 'Keluar Basis (Leaving)', 'Elemen Pivot', 'Nilai Z / W', 'Basis Aktif'],
      rows: sol.steps.map((st) => [
        st.step,
        st.phase === 1 ? 'Fase 1 (Kelayakan)' : 'Fase 2 (Optimasi)',
        st.enteringVar,
        st.leavingVar,
        st.pivotValue,
        st.objectiveValue,
        st.basisLabels.slice(0, -1).join(', '),
      ]),
    });
  }

  const charts: ModuleChartSpec[] = [];
  const lpPlot = build2dFeasiblePlot(input, sol);
  if (lpPlot) charts.push(lpPlot);

  const derivedValues: Record<string, number | string> = {
    optimalZ: roundTo(sol.objectiveValue, 4),
  };
  input.variableNames.forEach((name, idx) => {
    derivedValues[name] = roundTo(sol.variableValues[idx], 4);
  });

  const objFormula = input.variableNames
    .map((n, j) => `${input.objectiveCoeffs[j] ?? 0}·${n}`)
    .join(' + ');

  // Build Deep Analytical Interpretation
  const activeVars = input.variableNames
    .map((name, i) => ({
      name,
      val: sol.variableValues[i],
      coeff: input.objectiveCoeffs[i] ?? 0,
      contrib: sol.variableValues[i] * (input.objectiveCoeffs[i] ?? 0),
    }))
    .filter((v) => v.val > 1e-6);
  const inactiveVars = input.variableNames
    .map((name, i) => ({ name, val: sol.variableValues[i], rc: sol.reducedCosts[i] }))
    .filter((v) => v.val <= 1e-6);

  const bindingConstraints = input.constraints
    .map((c, i) => ({
      name: c.name,
      sign: c.sign,
      rhs: c.rhs,
      slack: sol.slacks[i],
      shadow: sol.shadowPrices[i],
      range: sol.rhsRanges?.[i],
    }))
    .filter((c) => c.slack <= 1e-5);
  const nonBindingConstraints = input.constraints
    .map((c, i) => ({ name: c.name, sign: c.sign, rhs: c.rhs, slack: sol.slacks[i] }))
    .filter((c) => c.slack > 1e-5);

  const topShadow = [...bindingConstraints].sort((a, b) => Math.abs(b.shadow) - Math.abs(a.shadow))[0];
  const dominantVar = [...activeVars].sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))[0];
  const dominantShare =
    dominantVar && Math.abs(sol.objectiveValue) > 1e-6
      ? (Math.abs(dominantVar.contrib) / Math.abs(sol.objectiveValue)) * 100
      : 0;

  const tightestObjRange = (sol.objectiveRanges ?? [])
    .filter((r) => r.value > 1e-6)
    .map((r) => ({
      ...r,
      minMargin: Math.min(r.allowableDecrease, r.allowableIncrease),
    }))
    .sort((a, b) => a.minMargin - b.minMargin)[0];

  const lpRecommendations: string[] = [];
  if (topShadow && Math.abs(topShadow.shadow) > 1e-6) {
    const incText =
      topShadow.range && Number.isFinite(topShadow.range.allowableIncrease)
        ? `hingga tambahan +${formatNum(topShadow.range.allowableIncrease, 2)} unit (RHS s.d. ${formatNum(topShadow.rhs + topShadow.range.allowableIncrease, 2)})`
        : 'selama kapasitas dapat ditambah';
    lpRecommendations.push(
      `Prioritaskan ekspansi/penyesuaian pada kendala "${topShadow.name}" (Shadow Price = ${formatNum(topShadow.shadow, 2)} per unit RHS) ${incText}.`,
    );
  }
  if (nonBindingConstraints.length > 0) {
    lpRecommendations.push(
      `Hindari investasi kapasitas tambahan pada kendala berlebih (${nonBindingConstraints.map((c) => `${c.name} sisa ${formatNum(c.slack, 2)}`).join(', ')}) karena Shadow Price = 0 dan tidak memperbaiki Z.`,
    );
  }
  if (inactiveVars.length > 0) {
    const sampleInact = inactiveVars[0];
    lpRecommendations.push(
      `Variabel non-basis "${sampleInact.name}" bernilai 0 dengan Reduced Cost ${formatNum(sampleInact.rc, 2)}; ${
        input.sense === 'max'
          ? `marginnya perlu naik minimal ${formatNum(Math.abs(sampleInact.rc), 2)} per unit agar layak diproduksi.`
          : `biayanya perlu turun minimal ${formatNum(Math.abs(sampleInact.rc), 2)} per unit agar dipilih.`
      }`,
    );
  }
  if (tightestObjRange && Number.isFinite(tightestObjRange.minMargin)) {
    lpRecommendations.push(
      `Pantau fluktuasi koefisien "${tightestObjRange.variable}" (rentang stabil [${
        Number.isFinite(tightestObjRange.allowableDecrease)
          ? formatNum(tightestObjRange.coeff - tightestObjRange.allowableDecrease, 2)
          : '-∞'
      }, ${
        Number.isFinite(tightestObjRange.allowableIncrease)
          ? formatNum(tightestObjRange.coeff + tightestObjRange.allowableIncrease, 2)
          : '∞'
      }]) karena paling sensitif mengubah bauran optimal.`,
    );
  }

  return {
    jobId,
    moduleId: 'linear-programming',
    jobTitle,
    status: 'success',
    executionMs: elapsed,
    summaryText: `Solusi optimal ${input.sense.toUpperCase()} Z = ${formatNum(sol.objectiveValue)} dalam ${sol.iterations} iterasi simpleks.`,
    kpis: [
      {
        label: `Nilai Optimal (${input.sense.toUpperCase()} Z)`,
        value: formatNum(sol.objectiveValue, 2),
        emphasis: 'primary',
      },
      {
        label: 'Status',
        value: 'Optimal',
        emphasis: 'success',
      },
      {
        label: 'Jumlah Variabel',
        value: input.variableNames.length,
      },
      {
        label: 'Iterasi Simpleks',
        value: sol.iterations,
      },
    ],
    tables,
    charts,
    warnings: [],
    auditSteps: [
      {
        title: '1. Formulasi Fungsi Tujuan & Standar Simpleks',
        formula: `${input.sense.toUpperCase()} Z = ${objFormula}`,
        detail: `${input.constraints.length} kendala dikonversi dengan variabel slack/surplus/artificial untuk Metode Simpleks Dua Fase.`,
      },
      {
        title: '2. Substitusi Titik Optimal',
        formula: input.variableNames
          .map((n, idx) => `${n}* = ${formatNum(sol.variableValues[idx], 2)}`)
          .join(', '),
        detail: `Total Z optimal = ${formatNum(sol.objectiveValue, 2)} tercapai pada iterasi ke-${sol.iterations}.`,
      },
      {
        title: '3. Analisis Sensitivitas (Ranging & Shadow Price)',
        formula: 'yᵀ = c_Bᵀ · B⁻¹ · ΔZ = Shadow Price × Δbᵢ (dalam Allowable Range)',
        detail: 'Matriks basis invers B⁻¹ dipakai langsung untuk menghitung Shadow Price (termasuk kendala =) serta batas Allowable Increase & Decrease koefisien Cj maupun RHS bi.',
      },
    ],
    analysis: {
      headline: `Kombinasi Optimal Menghasilkan ${input.sense === 'max' ? 'Nilai Maksimum' : 'Biaya Minimum'} Z = ${formatNum(sol.objectiveValue, 2)}`,
      interpretation:
        activeVars.length > 0
          ? `Solusi titik sudut optimal tercapai dengan mengaktifkan ${activeVars.length} dari ${input.variableNames.length} variabel (${activeVars.map((v) => `${v.name} = ${formatNum(v.val, 2)}`).join(', ')}).${
              dominantVar
                ? ` Kontributor terbesar adalah "${dominantVar.name}" sebesar ${formatNum(dominantVar.contrib, 2)} (${formatNum(dominantShare, 1)}% dari total Z).`
                : ''
            }`
          : 'Seluruh variabel keputusan bernilai 0 pada titik optimal (solusi sudut asal).',
      sections: [
        {
          heading: 'Kendala Mengikat (Bottleneck) & Shadow Price',
          body:
            bindingConstraints.length > 0
              ? `Terdapat ${bindingConstraints.length} kendala habis terpakai (Slack = 0): ${bindingConstraints
                  .map((c) => `${c.name} (Shadow Price = ${formatNum(c.shadow, 2)})`)
                  .join('; ')}. Nilai Shadow Price menunjukkan perubahan Z untuk setiap tambahan +1 unit RHS selama berada dalam rentang allowable.`
              : 'Tidak ada kendala yang mengikat penuh pada solusi saat ini.',
          tone: bindingConstraints.length > 0 ? 'caution' : 'neutral',
        },
        {
          heading: 'Kapasitas Menganggur (Slack / Surplus)',
          body:
            nonBindingConstraints.length > 0
              ? `${nonBindingConstraints.length} kendala masih memiliki cadangan: ${nonBindingConstraints
                  .map((c) => `${c.name} (${c.sign === '<=' ? 'slack' : 'surplus'} ${formatNum(c.slack, 2)} dari ${formatNum(c.rhs, 2)})`)
                  .join('; ')}. Sumber daya ini bukan pembatas utama.`
              : 'Seluruh kendala terpakai 100% tanpa sisa kapasitas (utilisasi penuh).',
          tone: nonBindingConstraints.length > 0 ? 'positive' : 'neutral',
        },
        {
          heading: 'Stabilitas Solusi & Sensitivitas Koefisien',
          body: tightestObjRange
            ? `Variabel basis paling sensitif terhadap perubahan harga/biaya adalah "${tightestObjRange.variable}" (Cj = ${formatNum(tightestObjRange.coeff, 2)}, toleransi turun ${fmtDelta(tightestObjRange.allowableDecrease)} / naik ${fmtDelta(tightestObjRange.allowableIncrease)}). Selama koefisien berada dalam batas tersebut, rencana alokasi tetap optimal.`
            : 'Seluruh koefisien tujuan berada dalam rentang stabilitas basis saat ini.',
          tone: 'neutral',
        },
      ],
      recommendations: lpRecommendations,
    },
    derivedValues,
  };
}

