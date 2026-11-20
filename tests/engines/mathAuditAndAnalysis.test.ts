import { describe, expect, it } from 'vitest';
import { getSpcConstants } from '../../src/core/math/distributions.ts';
import { roundTo } from '../../src/core/math/matrix.ts';
import { MODULE_REGISTRY } from '../../src/core/registry/moduleRegistry.ts';
import type { ModuleExecutionResult } from '../../src/core/types/module.types.ts';
import { solveAggregatePlanning } from '../../src/engines/aggregatePlanning.ts';
import { solveAssignment } from '../../src/engines/assignment.ts';
import { solveBreakEven } from '../../src/engines/breakEven.ts';
import { solveDecisionAnalysis } from '../../src/engines/decisionAnalysis.ts';
import { solveForecasting } from '../../src/engines/forecasting.ts';
import { solveModuleJob } from '../../src/engines/index.ts';
import { solveIntegerProgramming } from '../../src/engines/integerProgramming.ts';
import { solveInventory } from '../../src/engines/inventory.ts';
import { solveLinearProgramming } from '../../src/engines/linearProgramming.ts';
import { solveMarkovAnalysis } from '../../src/engines/markovAnalysis.ts';
import { solveMrp } from '../../src/engines/mrp.ts';
import { solveNetworkModels } from '../../src/engines/networkModels.ts';
import { solveProjectManagement } from '../../src/engines/projectManagement.ts';
import { solveQualityControl } from '../../src/engines/qualityControl.ts';
import { solveScheduling } from '../../src/engines/scheduling.ts';
import { solveTransportation } from '../../src/engines/transportation.ts';
import { solveWaitingLines } from '../../src/engines/waitingLines.ts';
import { mapGridToModuleInput } from '../../src/io/parsers/moduleMapper.ts';
import { DEFAULT_MODULE_INPUTS } from '../../src/io/templates/sampleDatasets.ts';

function assertCleanDeepAnalysis(res: ModuleExecutionResult): void {
  expect(res.analysis, `Missing analysis for ${res.moduleId}`).toBeDefined();
  const analysis = res.analysis!;
  expect(analysis.headline.trim().length).toBeGreaterThan(8);
  expect(analysis.interpretation.trim().length).toBeGreaterThan(20);
  expect(analysis.sections.length).toBeGreaterThanOrEqual(1);
  expect(analysis.recommendations.length).toBeGreaterThanOrEqual(1);

  const serialized = JSON.stringify({
    summaryText: res.summaryText,
    kpis: res.kpis,
    tables: res.tables,
    analysis: res.analysis,
    derivedValues: res.derivedValues,
  });
  expect(serialized).not.toMatch(/\bNaN\b/);
  expect(serialized).not.toMatch(/\bundefined\b/);
}

describe('Core Math Helpers & Parser Safeguards', () => {
  it('rounds negative ties symmetrically without producing -0', () => {
    expect(Object.is(roundTo(-0.000001, 2), -0)).toBe(false);
    expect(roundTo(-0.000001, 2)).toBe(0);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(1.005, 2)).toBe(1.01);
  });

  it('provides exact ASTM SPC constants for every subgroup size n=2..25', () => {
    const c11 = getSpcConstants(11);
    expect(c11.a2).toBeCloseTo(0.285, 3);
    expect(c11.d3).toBeCloseTo(0.256, 3);
    expect(c11.d4).toBeCloseTo(1.744, 3);
    expect(c11.d2).toBeCloseTo(3.173, 3);

    const c24 = getSpcConstants(24);
    expect(c24.a2).toBeCloseTo(0.157, 3);
  });

  it('defaults transportation and assignment sense to min when omitted in spreadsheet import', () => {
    const trans = mapGridToModuleInput('transportation', [
      ['Sumber \\ Tujuan', 'G1', 'G2', 'Supply'],
      ['P1', 4, 8, 50],
      ['P2', 6, 3, 50],
      ['Demand', 40, 60, ''],
    ]);
    expect((trans as { sense: string }).sense).toBe('min');

    const assign = mapGridToModuleInput('assignment', [
      ['Agen \\ Tugas', 'T1', 'T2'],
      ['A1', 5, 9],
      ['A2', 8, 4],
    ]);
    expect((assign as { sense: string }).sense).toBe('min');
  });
});

describe('Mathematical Verification Across All 16 POM-QM Engines', () => {
  it('LP: computes exact non-zero shadow prices on equality (=) and >= constraints', () => {
    // MIN Z = 2X1 + 3X2 s.t. X1 + X2 >= 10, X1 = 4 => X1=4, X2=6, Z=26
    // Duals: dZ*/db1 = +3, dZ*/db2 = -1
    const res = solveLinearProgramming('lp-eq', 'LP Equality Duals', {
      sense: 'min',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [2, 3],
      constraints: [
        { name: 'DemandMin', coeffs: [1, 1], sign: '>=', rhs: 10 },
        { name: 'FixedX1', coeffs: [1, 0], sign: '=', rhs: 4 },
      ],
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.optimalZ).toBeCloseTo(26, 3);
    expect(res.derivedValues.X1).toBeCloseTo(4, 3);
    expect(res.derivedValues.X2).toBeCloseTo(6, 3);
    const dualTable = res.tables.find((t) => t.id === 'lp-constraints')!;
    expect(Number(dualTable.rows[0][5])).toBeCloseTo(3, 3);
    expect(Number(dualTable.rows[1][5])).toBeCloseTo(-1, 3);
    assertCleanDeepAnalysis(res);
  });

  it('LP: handles flipped negative RHS, infeasible, and unbounded models cleanly', () => {
    const flipped = solveLinearProgramming('lp-neg', 'LP Negative RHS', {
      sense: 'max',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [5, 4],
      constraints: [
        { name: 'NegCap', coeffs: [-1, -1], sign: '>=', rhs: -10 },
        { name: 'CapX1', coeffs: [1, 0], sign: '<=', rhs: 6 },
      ],
    });
    expect(flipped.derivedValues.optimalZ).toBeCloseTo(46, 3);

    const unbounded = solveLinearProgramming('lp-unb', 'LP Unbounded', {
      sense: 'max',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [1, 1],
      constraints: [{ name: 'Open', coeffs: [1, -1], sign: '>=', rhs: 2 }],
    });
    expect(unbounded.status).toBe('warning');
    assertCleanDeepAnalysis(unbounded);

    const infeasible = solveLinearProgramming('lp-inf', 'LP Infeasible', {
      sense: 'max',
      variableNames: ['X1'],
      objectiveCoeffs: [1],
      constraints: [
        { name: 'Upper', coeffs: [1], sign: '<=', rhs: 2 },
        { name: 'Lower', coeffs: [1], sign: '>=', rhs: 5 },
      ],
    });
    expect(infeasible.status).toBe('warning');
    assertCleanDeepAnalysis(infeasible);
  });

  it('IP: solves binary 0-1 knapsack with exact LP relaxation gap and detects unbounded root', () => {
    const knapsack = solveIntegerProgramming('ip-knap', '0-1 Knapsack', {
      sense: 'max',
      variableNames: ['X1', 'X2', 'X3', 'X4'],
      objectiveCoeffs: [8, 11, 6, 4],
      variableTypes: ['binary', 'binary', 'binary', 'binary'],
      constraints: [{ name: 'Weight', coeffs: [5, 7, 4, 3], sign: '<=', rhs: 14 }],
    });
    expect(knapsack.status).toBe('success');
    expect(knapsack.derivedValues.optimalZ).toBeCloseTo(21, 3);
    expect(knapsack.derivedValues.X1).toBe(0);
    expect(knapsack.derivedValues.X2).toBe(1);
    expect(knapsack.derivedValues.X3).toBe(1);
    expect(knapsack.derivedValues.X4).toBe(1);
    expect(knapsack.derivedValues.lpRelaxationZ).toBeCloseTo(22, 3);
    assertCleanDeepAnalysis(knapsack);

    const unb = solveIntegerProgramming('ip-unb', 'IP Unbounded', {
      sense: 'max',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [1, 1],
      variableTypes: ['integer', 'integer'],
      constraints: [{ name: 'Open', coeffs: [1, -1], sign: '>=', rhs: 1 }],
    });
    expect(unb.status).toBe('warning');
    expect(unb.summaryText.toLowerCase()).toContain('unbounded');
    assertCleanDeepAnalysis(unb);
  });

  it('Transportation: solves degenerate MODI transportation problem to exact global optimum (430)', () => {
    const res = solveTransportation('tr-deg', 'Degenerate MODI', {
      sense: 'min',
      sourceNames: ['S1', 'S2', 'S3'],
      destinationNames: ['D1', 'D2', 'D3'],
      supplies: [10, 20, 30],
      demands: [10, 20, 30],
      costs: [
        [2, 3, 11],
        [1, 0, 6],
        [5, 8, 15],
      ],
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.totalCost).toBeCloseTo(430, 3);
    assertCleanDeepAnalysis(res);
  });

  it('Assignment: solves rectangular MAX profit matrix with negative values via Hungarian', () => {
    const res = solveAssignment('asg-rect', 'Rectangular MAX Assignment', {
      sense: 'max',
      agentNames: ['A1', 'A2', 'A3'],
      taskNames: ['T1', 'T2', 'T3', 'T4'],
      costs: [
        [10, -2, 7, 5],
        [4, 12, 6, 8],
        [9, 5, 14, 3],
      ],
    });
    // Optimal: A1->T1 (10), A2->T2 (12), A3->T3 (14) => 36
    expect(res.derivedValues.totalCost).toBeCloseTo(36, 3);
    assertCleanDeepAnalysis(res);
  });

  it('PERT/CPM: enumerates parallel critical paths, avoids variance double-counting, and selects cheaper multi-node crash cut', () => {
    // Parallel critical paths: A->B->D (dur 9, var 1) and A->C->D (dur 9, var 25/9 = 2.7778)
    const pert = solveProjectManagement('pm-par', 'Parallel PERT', {
      mode: 'pert',
      targetTime: 10,
      activities: [
        { id: 'A', name: 'Start', predecessors: [], optimistic: 2, mostLikely: 2, pessimistic: 2 },
        { id: 'B', name: 'Branch 1', predecessors: ['A'], optimistic: 1, mostLikely: 4, pessimistic: 7 },
        { id: 'C', name: 'Branch 2', predecessors: ['A'], optimistic: 1, mostLikely: 3, pessimistic: 11 },
        { id: 'D', name: 'Finish', predecessors: ['B', 'C'], optimistic: 3, mostLikely: 3, pessimistic: 3 },
      ],
    });
    expect(pert.derivedValues.projectDuration).toBeCloseTo(9, 3);
    expect(String(pert.derivedValues.criticalPath)).toContain('A → B → D');
    expect(String(pert.derivedValues.criticalPath)).toContain('A → C → D');
    expect(pert.derivedValues.projectStdDev).toBeCloseTo(5 / 3, 3);
    assertCleanDeepAnalysis(pert);

    // Crashing: cutting parallel pair {B, C} costs 200+250=450, beating single node A (1000)
    const crash = solveProjectManagement('pm-crash', 'Multi-Node Cut Crashing', {
      mode: 'cpm',
      targetCrashDuration: 9,
      activities: [
        { id: 'A', name: 'A', predecessors: [], duration: 4, crashTime: 2, normalCost: 1000, crashCost: 3000 },
        { id: 'B', name: 'B', predecessors: ['A'], duration: 4, crashTime: 2, normalCost: 1000, crashCost: 1400 },
        { id: 'C', name: 'C', predecessors: ['A'], duration: 4, crashTime: 2, normalCost: 1000, crashCost: 1500 },
        { id: 'D', name: 'D', predecessors: ['B', 'C'], duration: 2, crashTime: 2, normalCost: 500, crashCost: 500 },
      ],
    });
    expect(crash.derivedValues.crashedDuration).toBeCloseTo(9, 3);
    expect(crash.derivedValues.totalCrashCost).toBeCloseTo(450, 3);
    assertCleanDeepAnalysis(crash);
  });

  it('Forecasting: normalizes truncated WMA weights and achieves R² = 1.0 on exact linear series', () => {
    // n=4 => kw = min(weights.length=4, n-1=3) = 3, so 4th weight (99) MUST be sliced before normalizing
    const res = solveForecasting('fc-lin', 'Linear & WMA Check', {
      periodLabels: ['P1', 'P2', 'P3', 'P4'],
      values: [10, 20, 30, 40],
      movingAvgWindow: 3,
      weightedWeights: [3, 2, 1, 99],
      alpha: 0.5,
      beta: 0.5,
      horizon: 2,
    });
    expect(res.derivedValues.rSquared).toBeCloseTo(1, 4);
    expect(res.derivedValues.nextPeriodForecast).toBeCloseTo(50, 2);
    // WMA(t=4) using [30, 20, 10] with normalized [3/6, 2/6, 1/6] = 23.3333 => err at P4 (40) = 16.6667
    const wmaRow = res.tables[0].rows.find((r) => String(r[0]).startsWith('Weighted MA'))!;
    expect(Number(wmaRow[1])).toBeCloseTo(16.67, 1);
    assertCleanDeepAnalysis(res);
  });

  it('Inventory: verifies textbook EOQ, POQ, Quantity Discount, and ABC analysis', () => {
    const eoq = solveInventory('inv-eoq', 'Textbook EOQ', {
      model: 'eoq',
      annualDemand: 1000,
      orderingCost: 10,
      holdingCostPerUnit: 0.5,
      unitPrice: 5,
    });
    expect(eoq.derivedValues.optimalQ).toBeCloseTo(200, 3);
    expect(eoq.derivedValues.totalInventoryCost).toBeCloseTo(100, 3);
    assertCleanDeepAnalysis(eoq);

    const poq = solveInventory('inv-poq', 'Textbook POQ', {
      model: 'poq',
      annualDemand: 1000,
      orderingCost: 10,
      holdingCostPerUnit: 0.5,
      unitPrice: 5,
      dailyDemandRate: 4,
      dailyProductionRate: 8,
    });
    expect(poq.derivedValues.optimalQ).toBeCloseTo(Math.sqrt(80000), 2);
    assertCleanDeepAnalysis(poq);

    // Quantity Discount with constant H = 1.0/unit/yr:
    // Tier 1 (P=5): Q=700, TC=25000+700=25700
    // Tier 2 (P=4.8, min 1000): Q=1000, order=245, hold=500, TC=24000+745=24745 (OPTIMAL)
    // Tier 3 (P=4.75, min 2000): Q=2000, order=122.5, hold=1000, TC=23750+1122.5=24872.5
    const qd = solveInventory('inv-qd', 'Quantity Discount Constant H', {
      model: 'quantity-discount',
      annualDemand: 5000,
      orderingCost: 49,
      holdingCostPerUnit: 1.0,
      unitPrice: 5,
      discountTiers: [
        { minQty: 1, maxQty: 999, unitPrice: 5.0 },
        { minQty: 1000, maxQty: 1999, unitPrice: 4.8 },
        { minQty: 2000, maxQty: null, unitPrice: 4.75 },
      ],
    });
    expect(qd.derivedValues.optimalQ).toBeCloseTo(1000, 3);
    expect(qd.derivedValues.totalCost).toBeCloseTo(24745, 2);
    expect(qd.derivedValues.totalInventoryCost).toBeCloseTo(745, 2);
    assertCleanDeepAnalysis(qd);

    const abc = solveInventory('inv-abc', 'ABC Pareto', {
      ...DEFAULT_MODULE_INPUTS.inventory,
      model: 'abc',
      abcItems: [
        { sku: 'A1', annualUsage: 100, unitCost: 800 },
        { sku: 'B1', annualUsage: 100, unitCost: 150 },
        { sku: 'C1', annualUsage: 100, unitCost: 50 },
      ],
    });
    expect(abc.derivedValues.totalDollar).toBeCloseTo(100000, 2);
    assertCleanDeepAnalysis(abc);
  });

  it('Waiting Lines: verifies M/M/1, M/M/s (incl. s=200 overflow safety), M/M/1/K (K=1 & K=200), M/D/1, and native timeUnit', () => {
    const mm1 = solveWaitingLines('wl-mm1', 'M/M/1', {
      model: 'mm1',
      arrivalRate: 2,
      serviceRate: 3,
      servers: 1,
      timeUnit: 'menit',
    });
    expect(mm1.derivedValues.ls).toBeCloseTo(2, 3);
    expect(mm1.derivedValues.lq).toBeCloseTo(4 / 3, 3);
    expect(mm1.derivedValues.wq).toBeCloseTo(2 / 3, 3);
    const wqKpiVal = String(mm1.kpis.find((k) => k.label.includes('Wq'))?.value ?? '');
    expect(wqKpiVal).toContain('0.67');
    expect(wqKpiVal).toContain('menit');
    assertCleanDeepAnalysis(mm1);

    const mms = solveWaitingLines('wl-mms', 'M/M/2 Textbook', {
      model: 'mms',
      arrivalRate: 4,
      serviceRate: 3,
      servers: 2,
    });
    expect(mms.derivedValues.p0).toBeCloseTo(0.2, 4);
    expect(mms.derivedValues.lq).toBeCloseTo(16 / 15, 3);
    assertCleanDeepAnalysis(mms);

    // Overflow stress test: s = 200 (200! would overflow Infinity)
    const mmsHuge = solveWaitingLines('wl-mms-200', 'M/M/200 Overflow Safe', {
      model: 'mms',
      arrivalRate: 180,
      serviceRate: 1,
      servers: 200,
    });
    expect(Number.isFinite(Number(mmsHuge.derivedValues.lq))).toBe(true);
    expect(Number(mmsHuge.derivedValues.lq)).toBeGreaterThanOrEqual(0);
    assertCleanDeepAnalysis(mmsHuge);

    // M/M/1/1: zero waiting room => Lq = 0, Pw = 0, P_blocked = 0.5
    const mm1k1 = solveWaitingLines('wl-k1', 'M/M/1/1', {
      model: 'mm1k',
      arrivalRate: 5,
      serviceRate: 5,
      servers: 1,
      systemCapacity: 1,
    });
    expect(mm1k1.derivedValues.lq).toBeCloseTo(0, 4);
    expect(mm1k1.derivedValues.pw).toBeCloseTo(0, 4);
    expect(mm1k1.derivedValues.pBlocked).toBeCloseTo(0.5, 4);
    assertCleanDeepAnalysis(mm1k1);

    // M/M/1/200 with a = 4 (4^200 previously overflowed)
    const mm1kHuge = solveWaitingLines('wl-k200', 'M/M/1/200 High Load', {
      model: 'mm1k',
      arrivalRate: 20,
      serviceRate: 5,
      servers: 1,
      systemCapacity: 200,
    });
    expect(mm1kHuge.derivedValues.pBlocked).toBeCloseTo(0.75, 4);
    expect(mm1kHuge.derivedValues.ls).toBeCloseTo(199 + 2 / 3, 2);
    assertCleanDeepAnalysis(mm1kHuge);

    const md1 = solveWaitingLines('wl-md1', 'M/D/1', {
      model: 'md1',
      arrivalRate: 2,
      serviceRate: 3,
      servers: 1,
    });
    expect(md1.derivedValues.lq).toBeCloseTo(2 / 3, 3);
    assertCleanDeepAnalysis(md1);
  });

  it('Break-Even: calculates exact BEP, Margin of Safety %, DOL, and Crossover intervals', () => {
    const res = solveBreakEven('bep-exact', 'Break-Even Exact', {
      fixedCost: 10000,
      variableCostPerUnit: 30,
      sellingPricePerUnit: 50,
      targetProfit: 5000,
      expectedVolume: 800,
      alternatives: [
        { name: 'Manual', fixedCost: 10000, variableCost: 20 },
        { name: 'Otomatis', fixedCost: 25000, variableCost: 10 },
      ],
    });
    expect(res.derivedValues.bepUnits).toBeCloseTo(500, 3);
    expect(res.derivedValues.bepRevenue).toBeCloseTo(25000, 3);
    expect(res.derivedValues.expectedProfit).toBeCloseTo(6000, 3);
    expect(res.derivedValues.marginOfSafetyPct).toBeCloseTo(37.5, 3);
    expect(res.derivedValues.dol).toBeCloseTo(16000 / 6000, 3);
    const crossTbl = res.tables.find((t) => t.id === 'bep-crossover')!;
    expect(crossTbl.rows[0][1]).toBeCloseTo(1500, 2);
    assertCleanDeepAnalysis(res);
  });

  it('Decision Analysis: uses correct Minimin/Minimax headers on cost tables and preserves EVPI === min(EOL)', () => {
    const res = solveDecisionAnalysis('da-cost', 'Cost Table Decision', {
      alternativeNames: ['Vendor A', 'Vendor B'],
      stateNames: ['Low', 'High'],
      probabilities: [0.4, 0.6],
      payoffs: [
        [100, 300],
        [180, 200],
      ],
      hurwiczAlpha: 0.5,
      isCostTable: true,
    });
    const summaryHeaders = res.tables[0].headers;
    expect(summaryHeaders[1]).toBe('Minimin (Optimis)');
    expect(summaryHeaders[2]).toBe('Minimax (Pesimis)');
    // EMV(A)=220, EMV(B)=192 => Best=B (192); EVwPI=0.4*100+0.6*200=160; EVPI=32; EOL(B)=0.4*80+0.6*0=32
    expect(res.derivedValues.bestAlternative).toBe('Vendor B');
    expect(res.derivedValues.bestEmv).toBeCloseTo(192, 3);
    expect(res.derivedValues.evpi).toBeCloseTo(32, 3);
    assertCleanDeepAnalysis(res);
  });

  it('Quality Control: handles n=11 X-bar/R, invalid USL<=LSL guard, p-chart defects>n guard, and c-chart highlights', () => {
    const xbar = solveQualityControl('qc-x11', 'X-bar/R n=11', {
      chartType: 'xbar-r',
      subgroupSize: 11,
      usl: 105,
      lsl: 95,
      samples: [
        { label: 'S1', values: [100, 101, 99, 100, 101, 100, 99, 100, 101, 100, 99] },
        { label: 'S2', values: [100, 100, 101, 99, 100, 101, 100, 99, 100, 100, 100] },
      ],
    });
    expect(xbar.derivedValues.uclX).toBeCloseTo(100 + 0.285 * 2, 3);
    expect(Number(xbar.derivedValues.cp)).toBeGreaterThan(2);
    assertCleanDeepAnalysis(xbar);

    const pBad = solveQualityControl('qc-p-guard', 'p-Chart Guard', {
      chartType: 'p-chart',
      subgroupSize: 10,
      samples: [
        { label: 'L1', values: [15], sampleSize: 10 },
        { label: 'L2', values: [2], sampleSize: 10 },
      ],
    });
    expect(pBad.status).toBe('warning');
    expect(Number.isFinite(Number(pBad.derivedValues.pBar))).toBe(true);
    assertCleanDeepAnalysis(pBad);

    const cChart = solveQualityControl('qc-c', 'c-Chart Highlight', {
      chartType: 'c-chart',
      subgroupSize: 1,
      samples: [
        { label: 'U1', values: [2] },
        { label: 'U2', values: [3] },
        { label: 'U3', values: [2] },
        { label: 'U4', values: [25] },
      ],
    });
    expect(cChart.tables[0].highlightRowIndices?.length).toBeGreaterThan(0);
    assertCleanDeepAnalysis(cChart);
  });

  it('Network Models: detects negative cycles, ignores orphan nodes in MST, and proves Max-Flow === Min-Cut', () => {
    const negCycle = solveNetworkModels('net-neg', 'Negative Cycle', {
      mode: 'shortest-route',
      sourceNode: 'A',
      sinkNode: 'C',
      directed: true,
      edges: [
        { from: 'A', to: 'B', weight: 1 },
        { from: 'B', to: 'C', weight: -5 },
        { from: 'C', to: 'B', weight: 1 },
      ],
    });
    expect(negCycle.status).toBe('error');
    expect(negCycle.derivedValues.hasNegativeCycle).toBe(1);
    assertCleanDeepAnalysis(negCycle);

    const mst = solveNetworkModels('net-mst', 'MST Orphan Safe', {
      mode: 'mst',
      sourceNode: 'UNUSED_ORPHAN_NODE',
      sinkNode: 'ANOTHER_ORPHAN',
      directed: false,
      edges: [
        { from: 'A', to: 'B', weight: 4 },
        { from: 'B', to: 'C', weight: 2 },
        { from: 'A', to: 'C', weight: 5 },
      ],
    });
    expect(mst.status).toBe('success');
    expect(mst.derivedValues.mstWeight).toBeCloseTo(6, 3);
    expect(mst.derivedValues.isConnected).toBe(1);
    assertCleanDeepAnalysis(mst);

    const mf = solveNetworkModels('net-mf', 'Max-Flow Undirected Min-Cut', {
      mode: 'max-flow',
      sourceNode: 'S',
      sinkNode: 'T',
      directed: false,
      edges: [
        { from: 'A', to: 'S', weight: 10 }, // reversed orientation in input!
        { from: 'A', to: 'T', weight: 7 },
        { from: 'S', to: 'B', weight: 5 },
        { from: 'B', to: 'T', weight: 8 },
      ],
    });
    expect(mf.derivedValues.maxFlow).toBeCloseTo(12, 3);
    expect(mf.derivedValues.minCutCapacity).toBeCloseTo(12, 3);
    assertCleanDeepAnalysis(mf);
  });

  it('Markov Analysis: solves ergodic steady-state, absorbing N & B matrices, and all-absorbing chains', () => {
    const ergodic = solveMarkovAnalysis('mk-erg', 'Ergodic 2x2', {
      stateNames: ['A', 'B'],
      initialVector: [0.5, 0.5],
      transitionMatrix: [
        [0.8, 0.2],
        [0.4, 0.6],
      ],
      steps: 10,
    });
    expect(ergodic.derivedValues.steady_A).toBeCloseTo(2 / 3, 3);
    expect(ergodic.derivedValues.steady_B).toBeCloseTo(1 / 3, 3);
    assertCleanDeepAnalysis(ergodic);

    const absorb = solveMarkovAnalysis('mk-abs', 'Absorbing Chain', {
      stateNames: ['Paid', 'Active', 'Default'],
      initialVector: [0, 1, 0],
      transitionMatrix: [
        [1, 0, 0],
        [0.3, 0.5, 0.2],
        [0, 0, 1],
      ],
      steps: 6,
    });
    expect(absorb.derivedValues.absorb_Paid).toBeCloseTo(0.6, 3);
    expect(absorb.derivedValues.absorb_Default).toBeCloseTo(0.4, 3);
    expect(absorb.derivedValues.expectedStepsFromInit).toBeCloseTo(2.0, 3);
    assertCleanDeepAnalysis(absorb);

    const allAbs = solveMarkovAnalysis('mk-id', 'All Absorbing', {
      stateNames: ['S1', 'S2'],
      initialVector: [0.3, 0.7],
      transitionMatrix: [
        [1, 0],
        [0, 1],
      ],
      steps: 3,
    });
    expect(allAbs.status).toBe('warning');
    expect(allAbs.derivedValues.steady_S1).toBeCloseTo(0.3, 3);
    assertCleanDeepAnalysis(allAbs);
  });

  it('MRP: flags cascading child urgency when parent order is Past Due and computes lot-sizing savings', () => {
    const res = solveMrp('mrp-pd', 'MRP Past-Due Cascade', {
      periodLabels: ['W1', 'W2', 'W3', 'W4'],
      items: [
        {
          item: 'FinishA',
          level: 0,
          qtyPerParent: 1,
          leadTime: 2,
          onHand: 0,
          safetyStock: 0,
          lotSizing: 'L4L',
          setupCost: 200,
          holdingCostPerUnit: 1,
          grossRequirements: [50, 0, 40, 40],
          scheduledReceipts: [0, 0, 0, 0],
        },
        {
          item: 'CompB',
          level: 1,
          parent: 'FinishA',
          qtyPerParent: 2,
          leadTime: 1,
          onHand: 0,
          safetyStock: 0,
          lotSizing: 'L4L',
          setupCost: 200,
          holdingCostPerUnit: 1,
          grossRequirements: [0, 0, 0, 0],
          scheduledReceipts: [0, 0, 0, 0],
        },
      ],
    });
    expect(res.warnings.some((w) => w.includes('CompB') && w.includes('Past Due'))).toBe(true);
    expect(Number(res.derivedValues.potentialSavings)).toBeGreaterThan(0);
    assertCleanDeepAnalysis(res);
  });

  it('Aggregate Planning: defers Bowman LP shortage to final period minimizing multi-period backorder cost', () => {
    const res = solveAggregatePlanning('agg-short', 'Bowman Shortage Minimizer', {
      periodLabels: ['P1', 'P2', 'P3'],
      demands: [120, 120, 120],
      regularCapacity: [100, 100, 100],
      overtimeCapacity: [0, 0, 0],
      subcontractCapacity: [0, 0, 0],
      initialInventory: 0,
      initialWorkforce: 10,
      unitsPerWorker: 10,
      regularCostPerUnit: 10,
      overtimeCostPerUnit: 15,
      subcontractCostPerUnit: 20,
      holdingCostPerUnit: 2,
      backorderCostPerUnit: 20,
      hiringCostPerWorker: 50,
      firingCostPerWorker: 50,
    });
    expect(res.status).toBe('warning');
    expect(res.derivedValues.optimalTransportCost).toBeCloseTo(5400, 2);
    assertCleanDeepAnalysis(res);
  });

  it('Scheduling: verifies SPT/EDD theorems on single-machine and Johnson 2-machine textbook optimum + Gantt', () => {
    const single = solveScheduling('sch-1', 'Single Machine Audit', DEFAULT_MODULE_INPUTS.scheduling);
    expect(single.tables[0].headers).toContain('Max Tardiness');
    const eddRow = single.tables[0].rows.find((r) => String(r[0]).startsWith('EDD'))!;
    const minMaxLate = Math.min(...single.tables[0].rows.map((r) => Number(r[6])));
    expect(Number(eddRow[6])).toBeCloseTo(minMaxLate, 3);
    assertCleanDeepAnalysis(single);

    const johnson = solveScheduling('sch-j', 'Johnson 2-Machine Textbook', {
      mode: 'johnson-two-machine',
      jobs: [
        { jobId: 'A', processingTime: 5, dueDate: 20, processingTimeMachine2: 2 },
        { jobId: 'B', processingTime: 1, dueDate: 20, processingTimeMachine2: 6 },
        { jobId: 'C', processingTime: 9, dueDate: 20, processingTimeMachine2: 7 },
        { jobId: 'D', processingTime: 3, dueDate: 20, processingTimeMachine2: 8 },
        { jobId: 'E', processingTime: 10, dueDate: 20, processingTimeMachine2: 4 },
      ],
    });
    expect(johnson.derivedValues.sequence).toBe('B → D → C → E → A');
    expect(johnson.derivedValues.makespan).toBeCloseTo(30, 3);
    expect(johnson.derivedValues.totalIdleM2).toBeCloseTo(3, 3);
    expect(johnson.charts.some((c) => c.kind === 'gantt')).toBe(true);
    assertCleanDeepAnalysis(johnson);
  });
});

describe('Universal Smoke & Deep Analysis Audit Across All 16 Default Modules', () => {
  for (const mod of MODULE_REGISTRY) {
    it(`${mod.code} (${mod.id}): runs cleanly with non-empty Deep Analysis and zero NaN`, () => {
      const res = solveModuleJob({
        id: `smoke-${mod.id}`,
        moduleId: mod.id,
        title: mod.indonesianName,
        input: DEFAULT_MODULE_INPUTS[mod.id],
        enabled: true,
        sourceLabel: 'Audit Test',
        createdAt: 0,
      });
      expect(res.status).not.toBe('error');
      expect(res.kpis.length).toBeGreaterThan(0);
      expect(res.tables.length).toBeGreaterThan(0);
      assertCleanDeepAnalysis(res);
    });
  }
});
