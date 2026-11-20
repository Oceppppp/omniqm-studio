import { formatNum, roundTo } from '../core/math/matrix.ts';
import type {
  AggregatePlanningInput,
  ModuleExecutionResult,
  ResultTable,
} from '../core/types/module.types.ts';
import { solveTransportationCore } from './transportation.ts';

interface StrategyResult {
  name: string;
  totalCost: number;
  regularCost: number;
  overtimeCost: number;
  subcontractCost: number;
  holdingCost: number;
  backorderCost: number;
  hireFireCost: number;
  productionPerPeriod: number[];
  periodRows: (string | number)[][];
}

function evaluateStrategy(
  name: string,
  mode: 'chase' | 'level' | 'mixed',
  input: AggregatePlanningInput,
): StrategyResult {
  const T = input.periodLabels.length;
  const totalDemand = input.demands.reduce((a, b) => a + b, 0);
  const netNeeded = Math.max(0, totalDemand - input.initialInventory);
  const avgLevelProd = Math.ceil(netNeeded / Math.max(1, T));

  let inv = input.initialInventory;
  let workers = input.initialWorkforce;

  let regularCost = 0;
  let overtimeCost = 0;
  let subcontractCost = 0;
  let holdingCost = 0;
  let backorderCost = 0;
  let hireFireCost = 0;
  const productionPerPeriod: number[] = [];
  const periodRows: (string | number)[][] = [];

  for (let t = 0; t < T; t += 1) {
    const demand = input.demands[t] ?? 0;
    const regCap = input.regularCapacity[t] ?? 0;
    const otCap = input.overtimeCapacity[t] ?? 0;
    const subCap = input.subcontractCapacity[t] ?? 0;

    let regProd = 0;
    let otProd = 0;
    let subProd = 0;

    if (mode === 'chase') {
      const targetProd = Math.max(0, demand - inv);
      regProd = Math.min(targetProd, regCap);
      let rem = targetProd - regProd;
      otProd = Math.min(rem, otCap);
      rem -= otProd;
      subProd = Math.min(rem, subCap);
    } else if (mode === 'level') {
      regProd = Math.min(avgLevelProd, regCap);
      const remTarget = Math.max(0, demand - inv - regProd);
      if (inv + regProd < demand) {
        otProd = Math.min(remTarget, otCap);
      }
    } else {
      regProd = regCap;
      const netInvAfterReg = inv + regProd - demand;
      if (netInvAfterReg < 0) {
        const deficit = -netInvAfterReg;
        otProd = Math.min(deficit, otCap);
        subProd = Math.min(deficit - otProd, subCap);
      }
    }

    const reqWorkers = input.unitsPerWorker > 0 ? Math.ceil(regProd / input.unitsPerWorker) : workers;
    const diffWorkers = reqWorkers - workers;
    if (diffWorkers > 0) hireFireCost += diffWorkers * input.hiringCostPerWorker;
    else if (diffWorkers < 0) hireFireCost += Math.abs(diffWorkers) * input.firingCostPerWorker;
    workers = reqWorkers;

    const endBalance = inv + regProd + otProd + subProd - demand;
    const endInv = Math.max(0, endBalance);
    const backorder = Math.max(0, -endBalance);

    const pRegCost = regProd * input.regularCostPerUnit;
    const pOtCost = otProd * input.overtimeCostPerUnit;
    const pSubCost = subProd * input.subcontractCostPerUnit;
    const pHoldCost = endInv * input.holdingCostPerUnit;
    const pBackCost = backorder * input.backorderCostPerUnit;

    regularCost += pRegCost;
    overtimeCost += pOtCost;
    subcontractCost += pSubCost;
    holdingCost += pHoldCost;
    backorderCost += pBackCost;
    inv = endBalance;

    productionPerPeriod.push(roundTo(regProd + otProd + subProd, 1));
    periodRows.push([
      input.periodLabels[t],
      demand,
      roundTo(regProd, 1),
      roundTo(otProd, 1),
      roundTo(subProd, 1),
      roundTo(endInv, 1),
      roundTo(backorder, 1),
      roundTo(pRegCost + pOtCost + pSubCost + pHoldCost + pBackCost, 2),
    ]);
  }

  const totalCost =
    regularCost + overtimeCost + subcontractCost + holdingCost + backorderCost + hireFireCost;

  return {
    name,
    totalCost,
    regularCost,
    overtimeCost,
    subcontractCost,
    holdingCost,
    backorderCost,
    hireFireCost,
    productionPerPeriod,
    periodRows,
  };
}

function evaluateOptimalTransportation(input: AggregatePlanningInput): {
  strategy: StrategyResult;
  capacityShortage: boolean;
} {
  const T = input.periodLabels.length;
  const sourceNames: string[] = [];
  const supplies: number[] = [];
  const costs: number[][] = [];
  const sourceMeta: { period: number; kind: 'init' | 'reg' | 'ot' | 'sub' | 'shortage' }[] = [];

  if (input.initialInventory > 0) {
    sourceNames.push('Stok Awal');
    supplies.push(input.initialInventory);
    sourceMeta.push({ period: 0, kind: 'init' });
    costs.push(
      Array.from({ length: T }, (_, t) => t * input.holdingCostPerUnit),
    );
  }

  for (let s = 0; s < T; s += 1) {
    const regCap = Math.max(0, input.regularCapacity[s] ?? 0);
    if (regCap > 0) {
      sourceNames.push(`Reg ${input.periodLabels[s]}`);
      supplies.push(regCap);
      sourceMeta.push({ period: s, kind: 'reg' });
      costs.push(
        Array.from({ length: T }, (_, t) =>
          input.regularCostPerUnit +
          (t >= s
            ? (t - s) * input.holdingCostPerUnit
            : (s - t) * input.backorderCostPerUnit),
        ),
      );
    }

    const otCap = Math.max(0, input.overtimeCapacity[s] ?? 0);
    if (otCap > 0) {
      sourceNames.push(`OT ${input.periodLabels[s]}`);
      supplies.push(otCap);
      sourceMeta.push({ period: s, kind: 'ot' });
      costs.push(
        Array.from({ length: T }, (_, t) =>
          input.overtimeCostPerUnit +
          (t >= s
            ? (t - s) * input.holdingCostPerUnit
            : (s - t) * input.backorderCostPerUnit),
        ),
      );
    }

    const subCap = Math.max(0, input.subcontractCapacity[s] ?? 0);
    if (subCap > 0) {
      sourceNames.push(`Sub ${input.periodLabels[s]}`);
      supplies.push(subCap);
      sourceMeta.push({ period: s, kind: 'sub' });
      costs.push(
        Array.from({ length: T }, (_, t) =>
          input.subcontractCostPerUnit +
          (t >= s
            ? (t - s) * input.holdingCostPerUnit
            : (s - t) * input.backorderCostPerUnit),
        ),
      );
    }
  }

  const totalSupply = supplies.reduce((a, b) => a + b, 0);
  const totalDemand = input.demands.reduce((a, b) => a + Math.max(0, b), 0);
  const capacityShortage = totalSupply < totalDemand - 1e-6;

  if (sourceNames.length === 0) {
    return {
      strategy: evaluateStrategy('Transportation Method (Optimal LP)', 'mixed', input),
      capacityShortage: true,
    };
  }

  const destinationNames = input.periodLabels.map((lbl) => `Demand ${lbl}`);
  const demands = input.demands.map((d) => Math.max(0, d));

  if (totalSupply > totalDemand + 1e-6) {
    destinationNames.push('Unused Capacity');
    demands.push(totalSupply - totalDemand);
    for (const row of costs) row.push(0);
  } else if (capacityShortage) {
    // Explicit unmet-demand shortage source: 1 unit unmet in period t stays backordered for (T - t) remaining periods
    sourceNames.push('Unmet Demand (Shortage)');
    supplies.push(totalDemand - totalSupply);
    sourceMeta.push({ period: T - 1, kind: 'shortage' });
    costs.push(
      Array.from({ length: T }, (_, t) => (T - t) * input.backorderCostPerUnit),
    );
  }

  const core = solveTransportationCore({
    sense: 'min',
    sourceNames,
    destinationNames,
    costs,
    supplies,
    demands,
  });

  // Extract per-period production allocated strictly to real demand destinations 0..T-1
  const regByPeriod = Array<number>(T).fill(0);
  const otByPeriod = Array<number>(T).fill(0);
  const subByPeriod = Array<number>(T).fill(0);

  for (let i = 0; i < sourceMeta.length; i += 1) {
    const meta = sourceMeta[i];
    if (meta.kind === 'init' || meta.kind === 'shortage') continue;
    let allocatedToRealDemand = 0;
    for (let t = 0; t < T; t += 1) {
      allocatedToRealDemand += core.alloc[i][t] ?? 0;
    }
    if (meta.kind === 'reg') regByPeriod[meta.period] += allocatedToRealDemand;
    else if (meta.kind === 'ot') otByPeriod[meta.period] += allocatedToRealDemand;
    else if (meta.kind === 'sub') subByPeriod[meta.period] += allocatedToRealDemand;
  }

  let inv = input.initialInventory;
  let regularCost = 0;
  let overtimeCost = 0;
  let subcontractCost = 0;
  let holdingCost = 0;
  let backorderCost = 0;
  const productionPerPeriod: number[] = [];
  const periodRows: (string | number)[][] = [];

  for (let t = 0; t < T; t += 1) {
    const demand = input.demands[t] ?? 0;
    const regProd = regByPeriod[t];
    const otProd = otByPeriod[t];
    const subProd = subByPeriod[t];

    const endBalance = inv + regProd + otProd + subProd - demand;
    const endInv = Math.max(0, endBalance);
    const backorder = Math.max(0, -endBalance);

    const pRegCost = regProd * input.regularCostPerUnit;
    const pOtCost = otProd * input.overtimeCostPerUnit;
    const pSubCost = subProd * input.subcontractCostPerUnit;
    const pHoldCost = endInv * input.holdingCostPerUnit;
    const pBackCost = backorder * input.backorderCostPerUnit;

    regularCost += pRegCost;
    overtimeCost += pOtCost;
    subcontractCost += pSubCost;
    holdingCost += pHoldCost;
    backorderCost += pBackCost;
    inv = endBalance;

    productionPerPeriod.push(roundTo(regProd + otProd + subProd, 1));
    periodRows.push([
      input.periodLabels[t],
      demand,
      roundTo(regProd, 1),
      roundTo(otProd, 1),
      roundTo(subProd, 1),
      roundTo(endInv, 1),
      roundTo(backorder, 1),
      roundTo(pRegCost + pOtCost + pSubCost + pHoldCost + pBackCost, 2),
    ]);
  }

  const totalCost =
    regularCost + overtimeCost + subcontractCost + holdingCost + backorderCost;

  return {
    strategy: {
      name: 'Transportation Optimal LP (Bowman)',
      totalCost,
      regularCost,
      overtimeCost,
      subcontractCost,
      holdingCost,
      backorderCost,
      hireFireCost: 0,
      productionPerPeriod,
      periodRows,
    },
    capacityShortage,
  };
}

export function solveAggregatePlanning(
  jobId: string,
  jobTitle: string,
  input: AggregatePlanningInput,
): ModuleExecutionResult {
  const start = performance.now();
  if (input.periodLabels.length === 0) {
    return {
      jobId,
      moduleId: 'aggregate-planning',
      jobTitle,
      status: 'error',
      executionMs: 0,
      summaryText: 'Periode Aggregate Planning kosong.',
      kpis: [],
      tables: [],
      charts: [],
      warnings: ['Minimal harus terdapat 1 periode perencanaan.'],
      derivedValues: {},
      error: 'Periode kosong.',
    };
  }

  const { strategy: optimalTransport, capacityShortage } = evaluateOptimalTransportation(input);
  const strategies = [
    evaluateStrategy('Chase Strategy (Sesuai Demand)', 'chase', input),
    evaluateStrategy('Level Strategy (Produksi Rata)', 'level', input),
    evaluateStrategy('Mixed Strategy (Reguler + OT + Subkon)', 'mixed', input),
    optimalTransport,
  ].sort((a, b) => a.totalCost - b.totalCost);

  const best = strategies[0];
  const worst = strategies[strategies.length - 1];
  const totalDemand = input.demands.reduce((a, b) => a + b, 0);
  const totalRegCap = input.regularCapacity.reduce((a, b) => a + Math.max(0, b), 0);
  const totalAllCap =
    input.initialInventory +
    totalRegCap +
    input.overtimeCapacity.reduce((a, b) => a + Math.max(0, b), 0) +
    input.subcontractCapacity.reduce((a, b) => a + Math.max(0, b), 0);
  const regUtilPct = totalRegCap > 1e-9 ? (totalDemand / totalRegCap) * 100 : 0;
  const savingsVsWorst = worst.totalCost - best.totalCost;
  const savingsPct = worst.totalCost > 1e-9 ? (savingsVsWorst / worst.totalCost) * 100 : 0;

  const warnings: string[] = [];
  if (capacityShortage) {
    warnings.push(`Total kapasitas gabungan + stok awal (${formatNum(totalAllCap, 0)} unit) lebih kecil dari total demand horizon (${formatNum(totalDemand, 0)} unit); kekurangan ${formatNum(totalDemand - totalAllCap, 0)} unit dialihkan ke periode akhir untuk meminimalkan penalti backorder.`);
  }

  const compareTable: ResultTable = {
    id: 'agg-compare',
    title: 'Perbandingan Biaya Strategi Aggregate Planning (Termasuk Optimal LP)',
    headers: [
      'Strategi',
      'Biaya Reguler',
      'Biaya Overtime',
      'Biaya Subkontrak',
      'Biaya Simpan',
      'Biaya Backorder',
      'Hire / Fire',
      'Total Biaya',
    ],
    rows: strategies.map((s) => [
      s.name,
      roundTo(s.regularCost, 2),
      roundTo(s.overtimeCost, 2),
      roundTo(s.subcontractCost, 2),
      roundTo(s.holdingCost, 2),
      roundTo(s.backorderCost, 2),
      roundTo(s.hireFireCost, 2),
      roundTo(s.totalCost, 2),
    ]),
    highlightRowIndices: [0],
  };

  const detailTable: ResultTable = {
    id: 'agg-best-detail',
    title: `Jadwal Produksi Strategi Terbaik: ${best.name}`,
    headers: ['Periode', 'Demand', 'Reguler', 'Overtime', 'Subkontrak', 'Stok Akhir', 'Backorder', 'Biaya Periode'],
    rows: best.periodRows,
  };

  const extraCostBest = best.overtimeCost + best.subcontractCost + best.holdingCost + best.backorderCost + best.hireFireCost;
  const extraSharePct = best.totalCost > 1e-9 ? (extraCostBest / best.totalCost) * 100 : 0;

  return {
    jobId,
    moduleId: 'aggregate-planning',
    jobTitle,
    status: warnings.length > 0 ? 'warning' : 'success',
    executionMs: roundTo(performance.now() - start, 2),
    summaryText: `Strategi terbaik adalah ${best.name} dengan total biaya ${formatNum(best.totalCost, 2)}.`,
    kpis: [
      { label: 'Strategi Termurah', value: best.name.split(' (')[0], emphasis: 'success' },
      { label: 'Total Biaya Optimal', value: formatNum(best.totalCost, 2), emphasis: 'primary' },
      { label: 'Total Demand Horizon', value: formatNum(totalDemand, 0), unit: 'unit' },
      { label: 'Hemat vs Strategi Termahal', value: `${formatNum(savingsPct, 1)}%`, unit: formatNum(savingsVsWorst, 0) },
    ],
    tables: [compareTable, detailTable],
    charts: [
      {
        kind: 'bar',
        id: 'agg-strategy-bars',
        title: 'Perbandingan Total Biaya Antar Strategi',
        xLabel: 'Strategi',
        yLabel: 'Total Biaya',
        bars: strategies.map((s, idx) => ({
          label: s.name.split(' (')[0],
          value: roundTo(s.totalCost, 2),
          colorToken: idx === 0 ? 'var(--chart-2)' : 'var(--chart-1)',
        })),
      },
    ],
    warnings,
    auditSteps: [
      {
        title: '1. Formulasi Biaya Kapasitas & Persediaan',
        formula: 'TC = ∑(Reg·c_R + OT·c_OT + Sub·c_Sub + Inv⁺·h + Inv⁻·b) + Hire/Fire',
        detail: `Dievaluasi 4 pendekatan atas ${input.periodLabels.length} periode dengan total demand ${formatNum(totalDemand, 0)} unit.`,
      },
      {
        title: '2. Metode Transportasi Optimal (Bowman)',
        formula: 'c(s, t) = c_prod(s) + (t - s)·h (t ≥ s) · c_shortage(t) = (T - t)·b',
        detail: `Matriks biaya antar-periode diselesaikan dengan VAM + MODI sehingga biaya produksi+simpan+backorder optimal bernilai ${formatNum(optimalTransport.totalCost, 2)}.`,
      },
    ],
    analysis: {
      headline: `${best.name.split(' (')[0]} Termurah (${formatNum(best.totalCost, 2)}) — Hemat ${formatNum(savingsVsWorst, 2)} (${formatNum(savingsPct, 1)}%) dari ${worst.name.split(' (')[0]}`,
      interpretation: `Untuk memenuhi total permintaan ${formatNum(totalDemand, 0)} unit selama ${input.periodLabels.length} periode, strategi "${best.name}" menghasilkan total biaya terendah sebesar ${formatNum(best.totalCost, 2)} (biaya rata-rata ${formatNum(best.totalCost / Math.max(1, totalDemand), 2)}/unit). Proporsi biaya di luar produksi reguler (OT + subkontrak + simpan + backorder + hire/fire) mencapai ${formatNum(extraSharePct, 1)}% dari total biaya.`,
      sections: [
        {
          heading: 'Keseimbangan Kapasitas Reguler & Pemanfaatan Sumber Daya',
          body: `Rasio total demand terhadap kapasitas reguler adalah ${formatNum(regUtilPct, 1)}% (${formatNum(totalDemand, 0)} vs ${formatNum(totalRegCap, 0)} unit). ${capacityShortage ? `Total seluruh kapasitas termasuk lembur, subkontrak, dan stok awal (${formatNum(totalAllCap, 0)} unit) tetap defisit ${formatNum(totalDemand - totalAllCap, 0)} unit.` : regUtilPct > 100 ? 'Kapasitas reguler tidak mencukupi lonjakan musiman sehingga diperlukan kombinasi penimbunan stok awal, lembur (OT), atau subkontrak.' : 'Kapasitas reguler secara agregat mencukupi total demand, namun profil musiman menentukan apakah penumpukan persediaan atau lembur lebih ekonomis.'}`,
          tone: capacityShortage ? 'critical' : regUtilPct > 100 ? 'caution' : 'positive',
        },
        {
          heading: 'Catatan Perbandingan Bowman Optimal LP vs Heuristik',
          body: `Model Transportasi Bowman (${formatNum(optimalTransport.totalCost, 2)}) menjamin minimum global atas biaya produksi, lembur, subkontrak, simpan, dan backorder dengan asumsi jumlah tenaga kerja tetap (Hire/Fire = 0). Sementara strategi Chase/Level/Mixed juga memasukkan biaya rekrutmen/PHK (Hire/Fire) saat produksi reguler berubah antar-periode.`,
          tone: 'neutral',
        },
      ],
      recommendations: [
        `Gunakan jadwal produksi "${best.name}" (${best.productionPerPeriod.join(', ')}) sebagai masukan Master Production Schedule (MPS) menuju modul MRP.`,
        capacityShortage
          ? `Perluas kapasitas (tambah shift reguler atau kontrak subkontraktor baru sebesar minimal ${formatNum(totalDemand - totalAllCap, 0)} unit) untuk menghilangkan biaya penalti backorder.`
          : best.subcontractCost > 0 || best.overtimeCost > 0
            ? `Bandingkan selisih biaya lembur (${formatNum(input.overtimeCostPerUnit, 2)}) vs subkontrak (${formatNum(input.subcontractCostPerUnit, 2)}) vs simpan (${formatNum(input.holdingCostPerUnit, 2)}/periode): produksi lebih awal selama selisih biaya simpan antar-periode masih lebih murah dibanding premi lembur/subkontrak.`
            : 'Kapasitas reguler dan persediaan awal telah mencukupi tanpa lembur/subkontrak; jaga stabilitas ritme tenaga kerja guna menekan biaya hire/fire.',
      ],
    },
    derivedValues: {
      bestStrategy: best.name,
      lowestTotalCost: roundTo(best.totalCost, 2),
      optimalTransportCost: roundTo(optimalTransport.totalCost, 2),
      totalDemandHorizon: roundTo(totalDemand, 2),
      regularUtilizationPct: roundTo(regUtilPct, 2),
      mpsProductionSchedule: best.productionPerPeriod.join(', '),
    },
  };
}
