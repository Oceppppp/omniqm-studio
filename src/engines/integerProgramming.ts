import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  IntegerProgrammingInput,
  LinearProgrammingInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';
import { solveSimplexCore } from './linearProgramming.ts';

const INT_TOL = 1e-5;
const MAX_NODES = 2500;

interface BbNode {
  lowerBounds: number[];
  upperBounds: number[];
  parentBound: number;
}

function satisfiesAllConstraints(input: IntegerProgrammingInput, x: number[]): boolean {
  return input.constraints.every((c) => {
    const lhs = c.coeffs.reduce((sum, a, j) => sum + a * x[j], 0);
    if (c.sign === '<=') return lhs <= c.rhs + 1e-5;
    if (c.sign === '>=') return lhs >= c.rhs - 1e-5;
    return Math.abs(lhs - c.rhs) <= 1e-5;
  });
}

export function solveIntegerProgramming(
  jobId: string,
  jobTitle: string,
  input: IntegerProgrammingInput,
): ModuleExecutionResult {
  const start = performance.now();
  const n = input.variableNames.length;
  const isMax = input.sense === 'max';
  const varTypes = Array.from({ length: n }, (_, j) => input.variableTypes[j] ?? 'integer');

  let bestZ = isMax ? -Infinity : Infinity;
  let bestX: number[] | null = null;
  let nodesExplored = 0;
  let rootRelaxationZ: number | null = null;
  let rootUnbounded = false;

  const initLower = Array<number>(n).fill(0);
  const initUpper = varTypes.map((t) => (t === 'binary' ? 1 : Infinity));

  const queue: BbNode[] = [
    { lowerBounds: initLower, upperBounds: initUpper, parentBound: isMax ? Infinity : -Infinity },
  ];

  while (queue.length > 0 && nodesExplored < MAX_NODES) {
    // Best-First Search: pick node with most promising parent LP bound
    let bestQueueIdx = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (isMax ? queue[i].parentBound > queue[bestQueueIdx].parentBound : queue[i].parentBound < queue[bestQueueIdx].parentBound) {
        bestQueueIdx = i;
      }
    }
    const [node] = queue.splice(bestQueueIdx, 1);

    // Pre-fathom before solving LP if parent bound cannot beat incumbent
    if (bestX !== null) {
      if (isMax && node.parentBound <= bestZ + INT_TOL) continue;
      if (!isMax && node.parentBound >= bestZ - INT_TOL) continue;
    }

    nodesExplored += 1;

    const augmentedConstraints = [...input.constraints];
    for (let j = 0; j < n; j += 1) {
      if (node.lowerBounds[j] > 0) {
        const coeffs = Array<number>(n).fill(0);
        coeffs[j] = 1;
        augmentedConstraints.push({
          name: `LB_${input.variableNames[j]}`,
          coeffs,
          sign: '>=',
          rhs: node.lowerBounds[j],
        });
      }
      if (Number.isFinite(node.upperBounds[j])) {
        const coeffs = Array<number>(n).fill(0);
        coeffs[j] = 1;
        augmentedConstraints.push({
          name: `UB_${input.variableNames[j]}`,
          coeffs,
          sign: '<=',
          rhs: node.upperBounds[j],
        });
      }
    }

    const lpInput: LinearProgrammingInput = {
      sense: input.sense,
      variableNames: input.variableNames,
      objectiveCoeffs: input.objectiveCoeffs,
      constraints: augmentedConstraints,
    };

    const lpSol = solveSimplexCore(lpInput);
    if (nodesExplored === 1) {
      if (lpSol.status === 'unbounded') {
        rootUnbounded = true;
        break;
      }
      if (lpSol.status === 'optimal') {
        rootRelaxationZ = lpSol.objectiveValue;
      }
    }
    if (lpSol.status !== 'optimal') continue;

    // Fathom by bound
    if (bestX !== null) {
      if (isMax && lpSol.objectiveValue <= bestZ + INT_TOL) continue;
      if (!isMax && lpSol.objectiveValue >= bestZ - INT_TOL) continue;
    }

    // Find most-fractional integer/binary variable
    let branchIdx = -1;
    let maxFrac = 0;
    for (let j = 0; j < n; j += 1) {
      if (varTypes[j] === 'continuous') continue;
      const val = lpSol.variableValues[j];
      const frac = Math.abs(val - Math.round(val));
      if (frac > INT_TOL && frac > maxFrac) {
        maxFrac = frac;
        branchIdx = j;
      }
    }

    if (branchIdx === -1) {
      const candidateX = lpSol.variableValues.map((v, j) =>
        varTypes[j] === 'continuous' ? v : Math.round(v),
      );
      if (!satisfiesAllConstraints(input, candidateX)) continue;
      const candidateZ = candidateX.reduce(
        (sum, xj, j) => sum + xj * (input.objectiveCoeffs[j] ?? 0),
        0,
      );
      if (
        bestX === null ||
        (isMax && candidateZ > bestZ + 1e-9) ||
        (!isMax && candidateZ < bestZ - 1e-9)
      ) {
        bestZ = candidateZ;
        bestX = candidateX;
      }
      continue;
    }

    const fracVal = lpSol.variableValues[branchIdx];
    const floorVal = Math.floor(fracVal);
    const ceilVal = Math.ceil(fracVal);

    if (ceilVal <= node.upperBounds[branchIdx]) {
      const upLower = [...node.lowerBounds];
      upLower[branchIdx] = Math.max(upLower[branchIdx], ceilVal);
      queue.push({
        lowerBounds: upLower,
        upperBounds: [...node.upperBounds],
        parentBound: lpSol.objectiveValue,
      });
    }
    if (floorVal >= node.lowerBounds[branchIdx]) {
      const downUpper = [...node.upperBounds];
      downUpper[branchIdx] = Math.min(downUpper[branchIdx], floorVal);
      queue.push({
        lowerBounds: [...node.lowerBounds],
        upperBounds: downUpper,
        parentBound: lpSol.objectiveValue,
      });
    }
  }

  const elapsed = roundTo(performance.now() - start, 2);

  if (rootUnbounded || !bestX) {
    return {
      jobId,
      moduleId: 'integer-programming',
      jobTitle,
      status: 'warning',
      executionMs: elapsed,
      summaryText: rootUnbounded
        ? 'Relaksasi LP tidak terbatas (Unbounded); tambahkan batas kendala atas.'
        : 'Tidak ditemukan solusi bilangan bulat yang layak.',
      kpis: [
        {
          label: 'Status',
          value: rootUnbounded ? 'Unbounded' : 'Infeasible Integer',
          emphasis: 'danger',
        },
        { label: 'Node Branch & Bound', value: nodesExplored },
      ],
      tables: [],
      charts: [],
      warnings: [
        rootUnbounded
          ? 'Relaksasi LP tidak terbatas (Unbounded).'
          : 'Tidak ada solusi layak yang memenuhi batasan integer/biner.',
      ],
      analysis: {
        headline: rootUnbounded
          ? 'Model Integer Tidak Terbatas (Unbounded Relaxation)'
          : 'Tidak Ada Kombinasi Bilangan Bulat yang Layak',
        interpretation: rootUnbounded
          ? 'Relaksasi linear pada node akar tidak dibatasi kendala kapasitas sehingga fungsi tujuan menuju tak hingga.'
          : `Setelah mengeksplorasi ${nodesExplored} node percabangan Branch-and-Bound, tidak ada kombinasi integer/biner yang memenuhi semua kendala secara bersamaan.`,
        sections: [
          {
            heading: 'Evaluasi Kelayakan Diskrit',
            body: rootUnbounded
              ? 'Variabel integer tanpa batas atas menyebabkan ruang pencarian tidak terbatas.'
              : 'Walaupun relaksasi pecahan mungkin memiliki solusi, tidak ada titik kisi (lattice point) bilangan bulat di dalam poligon kendala.',
            tone: 'critical',
          },
        ],
        recommendations: [
          'Periksa konsistensi tanda kendala (≤, ≥, =) dan tipe variabel (binary vs integer).',
          'Pastikan batas kapasitas (RHS) cukup untuk menampung minimal satu kombinasi bulat/biner.',
        ],
      },
      derivedValues: {},
    };
  }

  const varTable: ResultTable = {
    id: 'ip-variables',
    title: 'Solusi Optimal Integer / Mixed-Integer Programming',
    headers: ['Variabel', 'Tipe', 'Nilai Optimal', 'Koefisien Tujuan', 'Kontribusi Z'],
    rows: input.variableNames.map((name, i) => [
      name,
      varTypes[i],
      roundTo(bestX![i], 4),
      roundTo(input.objectiveCoeffs[i] ?? 0, 4),
      roundTo(bestX![i] * (input.objectiveCoeffs[i] ?? 0), 4),
    ]),
  };

  const constraintUsage = input.constraints.map((c) => {
    const lhs = c.coeffs.reduce((s, a, j) => s + a * bestX![j], 0);
    const slack = Math.abs(c.rhs - lhs);
    const utilPct = Math.abs(c.rhs) > 1e-9 ? (lhs / c.rhs) * 100 : 100;
    return { name: c.name, sign: c.sign, rhs: c.rhs, lhs, slack, utilPct };
  });

  const constraintTable: ResultTable = {
    id: 'ip-constraints',
    title: 'Evaluasi Kendala pada Solusi Integer',
    headers: ['Kendala', 'Tanda', 'RHS', 'Terpakai (LHS)', 'Slack / Surplus'],
    rows: constraintUsage.map((c) => [
      c.name,
      c.sign,
      roundTo(c.rhs, 4),
      roundTo(c.lhs, 4),
      roundTo(c.slack, 4),
    ]),
  };

  const warnings: string[] = [];
  if (nodesExplored >= MAX_NODES) {
    warnings.push(`Pencarian Branch-and-Bound mencapai batas ${MAX_NODES} node; hasil adalah solusi layak terbaik yang ditemukan.`);
  }

  const derivedValues: Record<string, number | string> = {
    optimalZ: roundTo(bestZ, 4),
    ...(rootRelaxationZ !== null ? { lpRelaxationZ: roundTo(rootRelaxationZ, 4) } : {}),
  };
  input.variableNames.forEach((name, idx) => {
    derivedValues[name] = roundTo(bestX![idx], 4);
  });

  const integralityGap =
    rootRelaxationZ !== null ? Math.abs(rootRelaxationZ - bestZ) : 0;
  const integralityGapPct =
    rootRelaxationZ !== null && Math.abs(rootRelaxationZ) > 1e-6
      ? (integralityGap / Math.abs(rootRelaxationZ)) * 100
      : 0;

  const chosenVars = input.variableNames
    .map((name, i) => ({ name, val: bestX![i], type: varTypes[i], contrib: bestX![i] * (input.objectiveCoeffs[i] ?? 0) }))
    .filter((v) => v.val > 1e-6);
  const rejectedVars = input.variableNames
    .map((name, i) => ({ name, val: bestX![i], type: varTypes[i] }))
    .filter((v) => v.val <= 1e-6);
  const tightestConstraint = [...constraintUsage].sort((a, b) => a.slack - b.slack)[0];

  return {
    jobId,
    moduleId: 'integer-programming',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Solusi integer optimal ${input.sense.toUpperCase()} Z = ${formatNum(bestZ)} (${nodesExplored} node B&B).`,
    kpis: [
      {
        label: `Nilai Optimal (${input.sense.toUpperCase()} Z)`,
        value: formatNum(bestZ, 2),
        emphasis: 'primary',
      },
      { label: 'Status', value: 'Optimal Integer', emphasis: 'success' },
      ...(rootRelaxationZ !== null
        ? [{ label: 'Relaksasi LP (Batas)', value: formatNum(rootRelaxationZ, 2) }]
        : []),
      { label: 'Node Branch & Bound', value: nodesExplored },
    ],
    tables: [varTable, constraintTable],
    charts: [],
    warnings,
    auditSteps: [
      {
        title: '1. Relaksasi LP & Percabangan Branch-and-Bound (Best-First)',
        formula: `Z_LP = ${rootRelaxationZ !== null ? formatNum(rootRelaxationZ, 2) : '-'} · Percabangan xⱼ ≤ ⌊vⱼ⌋ dan xⱼ ≥ ⌈vⱼ⌉`,
        detail: `Mengeksplorasi ${nodesExplored} node hingga diperoleh solusi bulat/biner optimal Z* = ${formatNum(bestZ, 2)} dengan Integrality Gap ${formatNum(integralityGap, 2)} (${formatNum(integralityGapPct, 2)}%).`,
      },
    ],
    analysis: {
      headline: `Keputusan Diskrit Optimal Mencapai Z* = ${formatNum(bestZ, 2)}`,
      interpretation: `Algoritma Branch-and-Bound Best-First memilih ${chosenVars.length} variabel aktif (${chosenVars
        .map((v) => (v.type === 'binary' ? `${v.name} (Dipilih)` : `${v.name} = ${formatNum(v.val, 0)}`))
        .join(', ')})${
        rejectedVars.length > 0
          ? ` dan tidak memilih ${rejectedVars.length} opsi lainnya (${rejectedVars.map((v) => v.name).join(', ')}).`
          : '.'
      }`,
      sections: [
        {
          heading: 'Biaya Diskritisasi (Integrality Gap vs Relaksasi LP)',
          body:
            rootRelaxationZ !== null
              ? `Solusi relaksasi kontinu bernilai ${formatNum(rootRelaxationZ, 2)}, sedangkan syarat bilangan bulat menghasilkan ${formatNum(bestZ, 2)} — selisih sebesar ${formatNum(integralityGap, 2)} (${formatNum(integralityGapPct, 2)}%). ${
                  integralityGap < 1e-4
                    ? 'Tidak ada kehilangan nilai akibat pembulatan (solusi relaksasi sudah bulat sempurna).'
                    : 'Pembulatan naif dari solusi LP tidak aman; Branch-and-Bound memastikan kombinasi diskrit optimal global.'
                }`
              : 'Solusi bulat terverifikasi terhadap seluruh kendala.',
          tone: integralityGap < 1e-4 ? 'positive' : 'neutral',
        },
        {
          heading: 'Penyerapan Kapasitas & Kendala Paling Ketat',
          body: tightestConstraint
            ? `Kendala paling ketat adalah "${tightestConstraint.name}" dengan pemakaian ${formatNum(tightestConstraint.lhs, 2)} dari ${formatNum(tightestConstraint.rhs, 2)} (${formatNum(tightestConstraint.utilPct, 1)}%, sisa ${formatNum(tightestConstraint.slack, 2)}).`
            : 'Seluruh kendala terpenuhi secara eksak.',
          tone: tightestConstraint && tightestConstraint.utilPct >= 90 ? 'caution' : 'neutral',
        },
      ],
      recommendations: [
        ...(tightestConstraint
          ? [
              `Evaluasi penambahan kapasitas pada "${tightestConstraint.name}" (sisa hanya ${formatNum(tightestConstraint.slack, 2)}) bila ingin membuka peluang mengaktifkan variabel yang saat ini ditolak.`,
            ]
          : []),
        ...(rejectedVars.length > 0
          ? [
              `Opsi tidak terpilih (${rejectedVars.map((v) => v.name).join(', ')}) memiliki rasio kontribusi-per-sumber-daya yang kalah efisien dibanding kombinasi aktif saat ini.`,
            ]
          : ['Seluruh kandidat variabel sudah aktif dalam solusi optimal.']),
      ],
    },
    derivedValues,
  };
}
