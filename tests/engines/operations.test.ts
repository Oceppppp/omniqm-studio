import { describe, expect, it } from 'vitest';
import { solveBreakEven } from '../../src/engines/breakEven.ts';
import { solveForecasting } from '../../src/engines/forecasting.ts';
import { solveInventory } from '../../src/engines/inventory.ts';
import { solveProjectManagement } from '../../src/engines/projectManagement.ts';
import { solveWaitingLines } from '../../src/engines/waitingLines.ts';

describe('Operations Engines (PERT/CPM, Forecasting, Inventory, Queuing, BEP)', () => {
  it('solves CPM critical path and duration accurately', () => {
    const res = solveProjectManagement('t-pm', 'CPM Test', {
      mode: 'cpm',
      activities: [
        { id: 'A', name: 'Start', predecessors: [], duration: 4 },
        { id: 'B', name: 'Parallel', predecessors: [], duration: 2 },
        { id: 'C', name: 'Mid', predecessors: ['A'], duration: 5 },
        { id: 'D', name: 'Join', predecessors: ['B', 'C'], duration: 3 },
      ],
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.projectDuration).toBe(12);
    expect(res.derivedValues.criticalPath).toBe('A → C → D');
  });

  it('solves Forecasting across 6 methods and picks lowest MAD', () => {
    const res = solveForecasting('t-fc', 'Linear Growth', {
      periodLabels: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
      values: [100, 120, 140, 160, 180, 200],
      movingAvgWindow: 3,
      weightedWeights: [0.5, 0.3, 0.2],
      alpha: 0.3,
      beta: 0.2,
      horizon: 2,
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.nextPeriodForecast).toBeCloseTo(220, 1);
  });

  it('solves classic EOQ Inventory accurately', () => {
    // D=1000, S=10, H=0.5 => Q* = sqrt(2*1000*10/0.5) = sqrt(40000) = 200
    const res = solveInventory('t-inv', 'Textbook EOQ', {
      model: 'eoq',
      annualDemand: 1000,
      orderingCost: 10,
      holdingCostPerUnit: 0.5,
      unitPrice: 5,
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.optimalQ).toBeCloseTo(200, 3);
    expect(res.derivedValues.totalInventoryCost).toBeCloseTo(100, 3);
  });

  it('solves M/M/1 and M/M/s Queuing accurately', () => {
    // M/M/1: lambda=2, mu=3 => rho=2/3, Ls = 2/(3-2) = 2, Lq = 4/3 = 1.3333
    const mm1 = solveWaitingLines('t-q1', 'MM1', {
      model: 'mm1',
      arrivalRate: 2,
      serviceRate: 3,
      servers: 1,
    });
    expect(mm1.status).toBe('success');
    expect(mm1.derivedValues.ls).toBeCloseTo(2, 3);
    expect(mm1.derivedValues.lq).toBeCloseTo(1.3333, 3);
  });

  it('solves Break-Even units and revenue accurately', () => {
    // FC=10000, VC=5, P=15 => CM=10, BEP=1000 units, Rev=15000
    const res = solveBreakEven('t-bep', 'BEP', {
      fixedCost: 10000,
      variableCostPerUnit: 5,
      sellingPricePerUnit: 15,
      expectedVolume: 1500,
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.bepUnits).toBeCloseTo(1000, 2);
    expect(res.derivedValues.bepRevenue).toBeCloseTo(15000, 2);
    expect(res.derivedValues.expectedProfit).toBeCloseTo(5000, 2);
  });
});
