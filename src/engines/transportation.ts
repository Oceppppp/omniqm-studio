import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  ModuleExecutionResult,
  ResultTable,
  TransportationInput,
} from '../core/types/module.types.ts';

const EPS = 1e-8;

interface CellPos {
  r: number;
  c: number;
}

function wouldFormCycle(
  basisGrid: boolean[][],
  rows: number,
  cols: number,
  candR: number,
  candC: number,
): boolean {
  // Exact bipartite Union-Find on vertices [0..rows-1] (rows) and [rows..rows+cols-1] (cols).
  // Adding edge (candR, candC) creates a cycle iff row candR and col candC are already connected.
  const totalVerts = rows + cols;
  const parent = Array.from({ length: totalVerts }, (_, idx) => idx);
  const find = (x: number): number => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  };

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      if (!basisGrid[i][j]) continue;
      const ri = find(i);
      const rj = find(rows + j);
      if (ri !== rj) parent[ri] = rj;
    }
  }

  return find(candR) === find(rows + candC);
}

function findClosedLoop(
  basisGrid: boolean[][],
  rows: number,
  cols: number,
  startR: number,
  startC: number,
): CellPos[] | null {
  type State = { r: number; c: number; nextDir: 'row' | 'col'; path: CellPos[] };
  const queue: State[] = [
    { r: startR, c: startC, nextDir: 'row', path: [{ r: startR, c: startC }] },
  ];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.nextDir === 'row') {
      for (let j = 0; j < cols; j += 1) {
        if (j === cur.c) continue;
        if (basisGrid[cur.r][j]) {
          if (j === startC && cur.path.length >= 3) {
            return [...cur.path, { r: cur.r, c: j }];
          }
          const stateKey = `${cur.r},${j},col`;
          if (!visited.has(stateKey)) {
            visited.add(stateKey);
            queue.push({
              r: cur.r,
              c: j,
              nextDir: 'col',
              path: [...cur.path, { r: cur.r, c: j }],
            });
          }
        }
      }
    } else {
      for (let i = 0; i < rows; i += 1) {
        if (i === cur.r) continue;
        if (i === startR && cur.c === startC && cur.path.length >= 4) {
          return cur.path;
        }
        if (basisGrid[i][cur.c]) {
          const stateKey = `${i},${cur.c},row`;
          if (!visited.has(stateKey)) {
            visited.add(stateKey);
            queue.push({
              r: i,
              c: cur.c,
              nextDir: 'row',
              path: [...cur.path, { r: i, c: cur.c }],
            });
          }
        }
      }
    }
  }
  return null;
}

export interface TransportationCoreSolution {
  sourceNames: string[];
  destinationNames: string[];
  supplies: number[];
  demands: number[];
  rawCosts: number[][];
  alloc: number[][];
  vamInitialCost: number;
  totalCost: number;
  modiIterations: number;
  shipmentRows: (string | number)[][];
  warnings: string[];
}

export function solveTransportationCore(
  input: TransportationInput,
): TransportationCoreSolution {
  const warnings: string[] = [];
  const sourceNames = [...input.sourceNames];
  const destinationNames = [...input.destinationNames];
  const supplies = [...input.supplies];
  const demands = [...input.demands];
  const rawCosts = input.costs.map((row) => [...row]);

  const totalSupply = supplies.reduce((a, b) => a + b, 0);
  const totalDemand = demands.reduce((a, b) => a + b, 0);

  if (Math.abs(totalSupply - totalDemand) > EPS) {
    if (totalSupply > totalDemand) {
      const diff = totalSupply - totalDemand;
      destinationNames.push('Dummy Tujuan');
      demands.push(diff);
      for (const row of rawCosts) row.push(0);
      warnings.push(
        `Supply (${totalSupply}) > Demand (${totalDemand}): ditambahkan kolom Dummy Tujuan sebesar ${roundTo(diff, 2)}.`,
      );
    } else {
      const diff = totalDemand - totalSupply;
      sourceNames.push('Dummy Sumber');
      supplies.push(diff);
      rawCosts.push(Array<number>(destinationNames.length).fill(0));
      warnings.push(
        `Demand (${totalDemand}) > Supply (${totalSupply}): ditambahkan baris Dummy Sumber sebesar ${roundTo(diff, 2)}.`,
      );
    }
  }

  const m = sourceNames.length;
  const n = destinationNames.length;
  let maxRawCost = -Infinity;
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (rawCosts[i][j] > maxRawCost) maxRawCost = rawCosts[i][j];
    }
  }
  if (!Number.isFinite(maxRawCost)) maxRawCost = 0;

  const optCosts = rawCosts.map((row) =>
    row.map((c) => (input.sense === 'max' ? maxRawCost - c : c)),
  );

  // VAM Initialization
  const remSupply = [...supplies];
  const remDemand = [...demands];
  const rowActive = Array<boolean>(m).fill(true);
  const colActive = Array<boolean>(n).fill(true);
  const alloc = Array.from({ length: m }, () => Array<number>(n).fill(0));
  const isBasis = Array.from({ length: m }, () => Array<boolean>(n).fill(false));
  let basisCount = 0;

  while (rowActive.some(Boolean) && colActive.some(Boolean)) {
    const rowPenalties: { idx: number; pen: number }[] = [];
    for (let i = 0; i < m; i += 1) {
      if (!rowActive[i]) continue;
      const activeCosts: number[] = [];
      for (let j = 0; j < n; j += 1) {
        if (colActive[j]) activeCosts.push(optCosts[i][j]);
      }
      activeCosts.sort((a, b) => a - b);
      const pen = activeCosts.length >= 2 ? activeCosts[1] - activeCosts[0] : activeCosts[0] ?? 0;
      rowPenalties.push({ idx: i, pen });
    }

    const colPenalties: { idx: number; pen: number }[] = [];
    for (let j = 0; j < n; j += 1) {
      if (!colActive[j]) continue;
      const activeCosts: number[] = [];
      for (let i = 0; i < m; i += 1) {
        if (rowActive[i]) activeCosts.push(optCosts[i][j]);
      }
      activeCosts.sort((a, b) => a - b);
      const pen = activeCosts.length >= 2 ? activeCosts[1] - activeCosts[0] : activeCosts[0] ?? 0;
      colPenalties.push({ idx: j, pen });
    }

    rowPenalties.sort((a, b) => b.pen - a.pen);
    colPenalties.sort((a, b) => b.pen - a.pen);

    let chosenR = -1;
    let chosenC = -1;
    const topRow = rowPenalties[0];
    const topCol = colPenalties[0];

    if (topRow && (!topCol || topRow.pen >= topCol.pen)) {
      chosenR = topRow.idx;
      let bestCost = Infinity;
      for (let j = 0; j < n; j += 1) {
        if (colActive[j] && optCosts[chosenR][j] < bestCost) {
          bestCost = optCosts[chosenR][j];
          chosenC = j;
        }
      }
    } else if (topCol) {
      chosenC = topCol.idx;
      let bestCost = Infinity;
      for (let i = 0; i < m; i += 1) {
        if (rowActive[i] && optCosts[i][chosenC] < bestCost) {
          bestCost = optCosts[i][chosenC];
          chosenR = i;
        }
      }
    }

    if (chosenR === -1 || chosenC === -1) break;

    const qty = Math.min(remSupply[chosenR], remDemand[chosenC]);
    alloc[chosenR][chosenC] = qty;
    isBasis[chosenR][chosenC] = true;
    basisCount += 1;
    remSupply[chosenR] -= qty;
    remDemand[chosenC] -= qty;

    const activeRowCount = rowActive.filter(Boolean).length;
    const activeColCount = colActive.filter(Boolean).length;

    if (remSupply[chosenR] <= EPS && remDemand[chosenC] <= EPS) {
      if (activeRowCount > 1) {
        rowActive[chosenR] = false;
      } else {
        colActive[chosenC] = false;
      }
    } else if (remSupply[chosenR] <= EPS) {
      rowActive[chosenR] = false;
    } else {
      colActive[chosenC] = false;
    }

    if (activeRowCount === 1 && activeColCount === 1) {
      rowActive[chosenR] = false;
      colActive[chosenC] = false;
    }
  }

  let vamInitialCost = 0;
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (alloc[i][j] > EPS) vamInitialCost += alloc[i][j] * rawCosts[i][j];
    }
  }

  // Ensure exact m + n - 1 basic cells forming a spanning tree for MODI (exact degeneracy resolution)
  while (basisCount < m + n - 1) {
    let added = false;
    let bestR = -1;
    let bestC = -1;
    let bestCost = Infinity;
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (!isBasis[i][j] && optCosts[i][j] < bestCost && !wouldFormCycle(isBasis, m, n, i, j)) {
          bestCost = optCosts[i][j];
          bestR = i;
          bestC = j;
        }
      }
    }
    if (bestR !== -1) {
      isBasis[bestR][bestC] = true;
      alloc[bestR][bestC] = 0;
      basisCount += 1;
      added = true;
    }
    if (!added) break;
  }

  // MODI optimization iterations
  let modiIterations = 0;
  while (modiIterations < 400) {
    const u = Array<number | null>(m).fill(null);
    const v = Array<number | null>(n).fill(null);
    u[0] = 0;

    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < m; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (!isBasis[i][j]) continue;
          if (u[i] !== null && v[j] === null) {
            v[j] = optCosts[i][j] - u[i]!;
            progress = true;
          } else if (v[j] !== null && u[i] === null) {
            u[i] = optCosts[i][j] - v[j]!;
            progress = true;
          }
        }
      }
      if (!progress) {
        const missingU = u.findIndex((val) => val === null);
        if (missingU !== -1) {
          u[missingU] = 0;
          progress = true;
        }
      }
    }

    let enterR = -1;
    let enterC = -1;
    let minDelta = -EPS;
    for (let i = 0; i < m; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (isBasis[i][j]) continue;
        const delta = optCosts[i][j] - ((u[i] ?? 0) + (v[j] ?? 0));
        if (delta < minDelta) {
          minDelta = delta;
          enterR = i;
          enterC = j;
        }
      }
    }

    if (enterR === -1) break;

    const loop = findClosedLoop(isBasis, m, n, enterR, enterC);
    if (!loop || loop.length < 4) break;

    let theta = Infinity;
    let leaveIdx = -1;
    for (let k = 1; k < loop.length; k += 2) {
      const pos = loop[k];
      if (alloc[pos.r][pos.c] < theta - EPS) {
        theta = alloc[pos.r][pos.c];
        leaveIdx = k;
      }
    }

    for (let k = 0; k < loop.length; k += 1) {
      const pos = loop[k];
      if (k % 2 === 0) alloc[pos.r][pos.c] += theta;
      else alloc[pos.r][pos.c] = Math.max(0, alloc[pos.r][pos.c] - theta);
      if (Math.abs(alloc[pos.r][pos.c]) < EPS) alloc[pos.r][pos.c] = 0;
    }

    isBasis[enterR][enterC] = true;
    if (leaveIdx !== -1) {
      const leavePos = loop[leaveIdx];
      isBasis[leavePos.r][leavePos.c] = false;
      alloc[leavePos.r][leavePos.c] = 0;
    }

    modiIterations += 1;
  }

  let totalCost = 0;
  const shipmentRows: (string | number)[][] = [];
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (alloc[i][j] > EPS) {
        const sub = alloc[i][j] * rawCosts[i][j];
        totalCost += sub;
        shipmentRows.push([
          sourceNames[i],
          destinationNames[j],
          roundTo(alloc[i][j], 2),
          roundTo(rawCosts[i][j], 2),
          roundTo(sub, 2),
        ]);
      }
    }
  }

  return {
    sourceNames,
    destinationNames,
    supplies,
    demands,
    rawCosts,
    alloc,
    vamInitialCost,
    totalCost,
    modiIterations,
    shipmentRows,
    warnings,
  };
}

export function solveTransportation(
  jobId: string,
  jobTitle: string,
  input: TransportationInput,
): ModuleExecutionResult {
  const start = performance.now();
  if (input.sourceNames.length === 0 || input.destinationNames.length === 0) {
    return {
      jobId,
      moduleId: 'transportation',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Matriks transportasi kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Minimal harus terdapat 1 sumber dan 1 tujuan.'],
      derivedValues: {},
      error: 'Matriks transportasi kosong.',
    };
  }

  const totalSupply = input.supplies.reduce((a, b) => a + b, 0);
  const totalDemand = input.demands.reduce((a, b) => a + b, 0);
  const core = solveTransportationCore(input);
  const {
    sourceNames,
    destinationNames,
    supplies,
    rawCosts,
    alloc,
    vamInitialCost,
    totalCost,
    modiIterations,
    shipmentRows,
    warnings,
  } = core;

  const matrixTable: ResultTable = {
    id: 'transport-matrix',
    title: 'Matriks Alokasi Pengiriman Optimal',
    headers: ['Sumber \\ Tujuan', ...destinationNames, 'Supply'],
    rows: sourceNames.map((sName, i) => [
      sName,
      ...destinationNames.map((_, j) =>
        alloc[i][j] > EPS ? `${roundTo(alloc[i][j], 2)} (c=${rawCosts[i][j]})` : '-',
      ),
      roundTo(supplies[i], 2),
    ]),
  };

  const detailTable: ResultTable = {
    id: 'transport-shipments',
    title: 'Daftar Rute Pengiriman Aktif',
    headers: ['Dari (Sumber)', 'Ke (Tujuan)', 'Kuantitas', 'Biaya/Profit Unit', 'Subtotal'],
    rows: shipmentRows,
  };

  const realShipments = shipmentRows.filter(
    (r) => !String(r[0]).includes('Dummy') && !String(r[1]).includes('Dummy'),
  );
  const totalRealUnits = Math.min(totalSupply, totalDemand);
  const avgUnitCost = totalRealUnits > 0 ? totalCost / totalRealUnits : 0;
  const vamDelta = Math.abs(vamInitialCost - totalCost);
  const sortedRoutes = [...realShipments].sort((a, b) => Number(b[4]) - Number(a[4]));
  const topRoute = sortedRoutes[0];
  const highestUnitCostRoute = [...realShipments].sort((a, b) => Number(b[3]) - Number(a[3]))[0];
  const isBalanced = Math.abs(totalSupply - totalDemand) <= EPS;
  const elapsed = roundTo(performance.now() - start, 2);

  return {
    jobId,
    moduleId: 'transportation',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: elapsed,
    summaryText: `Alokasi optimal ditemukan dengan total ${input.sense === 'min' ? 'biaya' : 'profit'} ${formatNum(totalCost)} (${modiIterations} iterasi MODI setelah VAM).`,
    kpis: [
      {
        label: input.sense === 'min' ? 'Total Biaya Optimal' : 'Total Profit Optimal',
        value: formatNum(totalCost, 2),
        emphasis: 'primary',
      },
      { label: 'Rute Aktif', value: realShipments.length, emphasis: 'success' },
      { label: 'Total Unit Terdistribusi', value: formatNum(totalRealUnits, 2) },
      { label: input.sense === 'min' ? 'Rata-rata Biaya / Unit' : 'Rata-rata Profit / Unit', value: formatNum(avgUnitCost, 2) },
    ],
    tables: [matrixTable, detailTable],
    charts: [
      {
        kind: 'bar',
        id: 'transport-cost-bar',
        title: 'Kontribusi Biaya / Profit per Rute Aktif',
        xLabel: 'Rute',
        yLabel: input.sense === 'min' ? 'Biaya' : 'Profit',
        bars: shipmentRows.map((r) => ({
          label: `${r[0]} -> ${r[1]}`,
          value: Number(r[4]),
          annotation: `${r[2]} unit`,
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Keseimbangan Supply & Demand',
        detail: `Total Supply = ${formatNum(totalSupply, 2)}, Total Demand = ${formatNum(totalDemand, 2)} (${sourceNames.length} × ${destinationNames.length}).`,
      },
      {
        title: '2. Inisialisasi VAM & Optimasi MODI',
        formula: 'uᵢ + vⱼ = cᵢⱼ (basis) · Δᵢⱼ = cᵢⱼ - (uᵢ + vⱼ)',
        detail: `Solusi awal VAM bernilai ${formatNum(vamInitialCost, 2)}, lalu disempurnakan dalam ${modiIterations} iterasi MODI hingga seluruh Δᵢⱼ ≥ 0 (hasil akhir ${formatNum(totalCost, 2)}).`,
      },
    ],
    analysis: {
      headline: `Jaringan Distribusi Optimal Memerlukan ${realShipments.length} Rute Aktif (Rata-rata ${formatNum(avgUnitCost, 2)}/unit)`,
      interpretation: `Total ${formatNum(totalRealUnits, 2)} unit berhasil dialokasikan dari ${input.sourceNames.length} sumber ke ${input.destinationNames.length} tujuan dengan total ${input.sense === 'min' ? 'biaya minimum' : 'profit maksimum'} ${formatNum(totalCost, 2)}.${
        vamDelta > 1e-4
          ? ` Tahap MODI memperbaiki solusi awal VAM (${formatNum(vamInitialCost, 2)}) sebesar ${formatNum(vamDelta, 2)}.`
          : ' Solusi awal VAM langsung mencapai kondisi optimal global tanpa perbaikan tambahan pada MODI.'
      }`,
      sections: [
        {
          heading: 'Struktur Rute & Konsentrasi Biaya',
          body: topRoute
            ? `Rute dengan kontribusi terbesar adalah ${topRoute[0]} → ${topRoute[1]} (${topRoute[2]} unit × ${topRoute[3]} = ${formatNum(Number(topRoute[4]), 2)}, atau ${formatNum((Number(topRoute[4]) / Math.max(1e-6, Math.abs(totalCost))) * 100, 1)}% dari total).`
            : 'Tidak ada rute pengiriman aktif.',
          tone: 'neutral',
        },
        {
          heading: 'Keseimbangan Kapasitas & Permintaan',
          body: isBalanced
            ? `Sistem seimbang sempurna (Supply = Demand = ${formatNum(totalSupply, 2)} unit), seluruh kapasitas pabrik terserap 100% dan seluruh permintaan gudang terpenuhi.`
            : totalSupply > totalDemand
              ? `Terdapat kelebihan kapasitas (excess supply) sebesar ${formatNum(totalSupply - totalDemand, 2)} unit yang dialihkan ke Dummy Tujuan (tidak diproduksi/dikirim).`
              : `Terdapat kekurangan pasokan (unmet demand) sebesar ${formatNum(totalDemand - totalSupply, 2)} unit yang ditandai pada baris Dummy Sumber.`,
          tone: isBalanced ? 'positive' : 'caution',
        },
      ],
      recommendations: [
        ...(highestUnitCostRoute && input.sense === 'min'
          ? [
              `Negosiasikan tarif angkut pada rute aktif bertarif unit tertinggi (${highestUnitCostRoute[0]} → ${highestUnitCostRoute[1]} sebesar ${highestUnitCostRoute[3]}/unit) untuk menekan biaya distribusi lebih lanjut.`,
            ]
          : []),
        ...(totalDemand > totalSupply
          ? [
              `Tambah kapasitas sumber minimal ${formatNum(totalDemand - totalSupply, 2)} unit atau siapkan subkontrak agar seluruh permintaan gudang terpenuhi.`,
            ]
          : totalSupply > totalDemand
            ? [
                `Realokasi ${formatNum(totalSupply - totalDemand, 2)} unit kapasitas menganggur pada sumber yang dialokasikan ke Dummy Tujuan.`,
              ]
            : ['Pertahankan jadwal alokasi rute di atas karena seluruh sel non-basis memiliki peluang perbaikan Δᵢⱼ ≥ 0.']),
      ],
    },
    derivedValues: {
      totalCost: roundTo(totalCost, 4),
      activeRoutes: realShipments.length,
    },
  };
}

