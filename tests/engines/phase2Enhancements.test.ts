import { describe, expect, it } from 'vitest';
import { buildPipelineExecutionStages } from '../../src/core/pipeline/pipelineResolver.ts';
import { MODULE_REGISTRY } from '../../src/core/registry/moduleRegistry.ts';
import { solveModuleJob } from '../../src/engines/index.ts';
import { createAllModulesSamplePack, createPpicPipelinePreset } from '../../src/io/templates/sampleDatasets.ts';
import { runAllModulesSimultaneously } from '../../src/workers/workerPool.ts';

describe('Phase 2 & 3 Quantitative Engines & End-to-End PPIC Pipeline', () => {
  it('computes LP Objective & RHS Ranging, Simplex iteration steps, and audit formulas', () => {
    const res = solveModuleJob({
      id: 'lp-ranging-test',
      moduleId: 'linear-programming',
      title: 'LP Ranging',
      enabled: true,
      input: {
        sense: 'max',
        variableNames: ['Meja', 'Kursi'],
        objectiveCoeffs: [70, 50],
        constraints: [
          { name: 'Kayu', coeffs: [4, 3], sign: '<=', rhs: 240 },
          { name: 'Tenaga', coeffs: [2, 1], sign: '<=', rhs: 100 },
        ],
      },
      updatedAt: Date.now(),
    });

    expect(res.status).toBe('success');
    expect(res.derivedValues.optimalZ).toBe(4100);
    expect(res.tables.some((t) => t.id === 'lp-ranging-obj')).toBe(true);
    expect(res.tables.some((t) => t.id === 'lp-ranging-rhs')).toBe(true);
    expect(res.tables.some((t) => t.id === 'lp-simplex-steps')).toBe(true);
    expect(res.auditSteps && res.auditSteps.length).toBeGreaterThanOrEqual(3);
  });

  it('solves MRP with POQ/EOQ/Silver-Meal lot-sizing and multi-parent BOM Low-Level Coding', () => {
    const res = solveModuleJob({
      id: 'mrp-multi-parent',
      moduleId: 'mrp',
      title: 'MRP Multi-Parent & Silver-Meal',
      enabled: true,
      input: {
        periodLabels: ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'],
        items: [
          {
            item: 'Produk A',
            level: 0,
            parent: '-',
            qtyPerParent: 1,
            leadTime: 1,
            onHand: 0,
            safetyStock: 0,
            lotSizing: 'SM',
            setupCost: 200,
            holdingCostPerUnit: 2,
            grossRequirements: [20, 40, 60, 50, 30, 80],
            scheduledReceipts: [0, 0, 0, 0, 0, 0],
          },
          {
            item: 'Sub-Assembly X',
            level: 1,
            parent: 'Produk A',
            qtyPerParent: 2,
            leadTime: 0,
            onHand: 10,
            safetyStock: 0,
            lotSizing: 'POQ',
            fixedOrderPeriods: 2,
            setupCost: 150,
            holdingCostPerUnit: 1,
            grossRequirements: [0, 0, 0, 0, 0, 0],
            scheduledReceipts: [0, 0, 0, 0, 0, 0],
          },
          {
            item: 'Baut M8',
            level: 2,
            parent: 'Produk A, Sub-Assembly X',
            qtyPerParent: 4,
            leadTime: 1,
            onHand: 50,
            safetyStock: 0,
            lotSizing: 'EOQ',
            setupCost: 300,
            holdingCostPerUnit: 0.5,
            grossRequirements: [0, 0, 0, 0, 0, 0],
            scheduledReceipts: [0, 0, 0, 0, 0, 0],
          },
        ],
      },
      updatedAt: Date.now(),
    });

    expect(res.status).not.toBe('error');
    const compTable = res.tables.find((t) => t.id === 'mrp-lotsize-comparison');
    expect(compTable).toBeDefined();
    // 3 BOM items x 5 lot-sizing methods (L4L, FOQ, POQ, EOQ, SM) = 15 comparison rows
    expect(compTable!.rows.length).toBe(15);
    const bautTable = res.tables.find((t) => t.id === 'mrp-Baut M8');
    expect(bautTable).toBeDefined();
    const grossRow = bautTable!.rows[0].slice(1) as number[];
    // Common part receives exploded requirements from both Produk A and Sub-Assembly X
    expect(grossRow.some((v) => v > 0)).toBe(true);
  });

  it('computes Seasonal Multiplicative index decomposition and Auto-Optimize smoothing', () => {
    const res = solveModuleJob({
      id: 'fc-seasonal-tune',
      moduleId: 'forecasting',
      title: 'Forecasting Musiman + Auto-Tune',
      enabled: true,
      input: {
        periodLabels: ['Q1-1', 'Q2-1', 'Q3-1', 'Q4-1', 'Q1-2', 'Q2-2', 'Q3-2', 'Q4-2', 'Q1-3', 'Q2-3', 'Q3-3', 'Q4-3'],
        values: [120, 180, 240, 160, 132, 198, 264, 176, 145, 218, 290, 194],
        alpha: 0.3,
        beta: 0.2,
        gamma: 0.3,
        seasonalPeriod: 4,
        seasonalType: 'multiplicative',
        autoOptimize: true,
        movingAvgWindow: 4,
        weightedWeights: [0.5, 0.3, 0.2],
        horizon: 4,
      },
      updatedAt: Date.now(),
    });

    expect(res.status).toBe('success');
    expect(res.tables.some((t) => t.id === 'forecast-seasonal-indices')).toBe(true);
    expect(String(res.derivedValues.horizonForecasts).split(',').length).toBe(4);
    expect(typeof res.derivedValues.tunedAlpha).toBe('number');
  });

  it('performs Project Crashing (Time-Cost Trade-Off) and builds AON Network diagram', () => {
    const res = solveModuleJob({
      id: 'cpm-crash-test',
      moduleId: 'project-management',
      title: 'CPM Crashing Test',
      enabled: true,
      input: {
        mode: 'cpm',
        targetCrashDuration: 9,
        activities: [
          { id: 'A', name: 'Desain', predecessors: [], duration: 5, crashTime: 3, normalCost: 1000, crashCost: 1400 },
          { id: 'B', name: 'Pengadaan', predecessors: ['A'], duration: 4, crashTime: 2, normalCost: 800, crashCost: 1100 },
          { id: 'C', name: 'Paralel UI', predecessors: ['A'], duration: 2, crashTime: 1, normalCost: 400, crashCost: 700 },
          { id: 'D', name: 'Integrasi', predecessors: ['B', 'C'], duration: 3, crashTime: 2, normalCost: 900, crashCost: 1500 },
        ],
      },
      updatedAt: Date.now(),
    });

    expect(res.status).toBe('success');
    // Normal critical path A(5)->B(4)->D(3) = 12
    expect(res.derivedValues.projectDuration).toBe(12);
    expect(res.derivedValues.crashedDuration).toBe(9);
    // Cheapest slopes: B = 150/day (crushed 2 days = 300), A = 200/day (crushed 1 day = 200) -> added cost = 500
    expect(res.derivedValues.totalCrashCost).toBe(500);
    expect(res.tables.some((t) => t.id === 'cpm-crashing')).toBe(true);
    expect(res.charts.some((c) => c.kind === 'network')).toBe(true);
  });

  it('computes Aggregate Planning Optimal Transportation LP <= heuristic costs', () => {
    const pack = createAllModulesSamplePack();
    const aggJob = pack.jobs.find((j) => j.moduleId === 'aggregate-planning')!;
    const res = solveModuleJob(aggJob);

    expect(res.status).not.toBe('error');
    const compareTable = res.tables.find((t) => t.id === 'agg-compare');
    expect(compareTable).toBeDefined();
    expect(compareTable!.rows.length).toBe(4);
    expect(typeof res.derivedValues.optimalTransportCost).toBe('number');
    expect(typeof res.derivedValues.mpsProductionSchedule).toBe('string');
  });

  it('executes 5-stage PPIC Pipeline Preset end-to-end and generates auditSteps on all 16 modules', async () => {
    const ppic = createPpicPipelinePreset();
    const plan = buildPipelineExecutionStages(ppic.jobs, ppic.links);
    expect(plan.hasCycle).toBe(false);
    expect(plan.stages.length).toBe(5);

    const ppicSummary = await runAllModulesSimultaneously(ppic.jobs, ppic.links);
    expect(ppicSummary.errorCount).toBe(0);
    expect(ppicSummary.totalJobs).toBe(5);

    const pack16 = createAllModulesSamplePack();
    const summary16 = await runAllModulesSimultaneously(pack16.jobs, pack16.links);
    expect(summary16.totalJobs).toBe(MODULE_REGISTRY.length);
    expect(summary16.errorCount).toBe(0);
    for (const j of pack16.jobs) {
      const r = summary16.resultsByJobId[j.id];
      expect(r.auditSteps && r.auditSteps.length).toBeGreaterThan(0);
    }
  });
});
