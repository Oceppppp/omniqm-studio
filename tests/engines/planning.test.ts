import { describe, expect, it } from 'vitest';
import { solveAggregatePlanning } from '../../src/engines/aggregatePlanning.ts';
import { solveDecisionAnalysis } from '../../src/engines/decisionAnalysis.ts';
import { solveMarkovAnalysis } from '../../src/engines/markovAnalysis.ts';
import { solveMrp } from '../../src/engines/mrp.ts';
import { solveNetworkModels } from '../../src/engines/networkModels.ts';
import { solveQualityControl } from '../../src/engines/qualityControl.ts';
import { solveScheduling } from '../../src/engines/scheduling.ts';
import { DEFAULT_MODULE_INPUTS } from '../../src/io/templates/sampleDatasets.ts';

describe('Planning, Decision, Network, Quality, Markov, MRP, Scheduling Engines', () => {
  it('solves Decision Analysis EMV and EVPI accurately', () => {
    const res = solveDecisionAnalysis('t-da', 'Decision', {
      alternativeNames: ['Large', 'Small'],
      stateNames: ['Good', 'Bad'],
      probabilities: [0.5, 0.5],
      payoffs: [
        [200, -180],
        [100, -20],
      ],
      hurwiczAlpha: 0.6,
    });
    // EMV Large = 10, EMV Small = 40; EVwPI = 0.5*200 + 0.5*(-20) = 90; EVPI = 90-40 = 50
    expect(res.status).toBe('success');
    expect(res.derivedValues.bestAlternative).toBe('Small');
    expect(res.derivedValues.bestEmv).toBeCloseTo(40, 2);
    expect(res.derivedValues.evpi).toBeCloseTo(50, 2);
  });

  it('solves Quality Control X-bar & R chart', () => {
    const res = solveQualityControl('t-qc', 'SPC', DEFAULT_MODULE_INPUTS['quality-control']);
    expect(res.tables.length).toBe(1);
    expect(res.charts.length).toBe(2);
    expect(typeof res.derivedValues.xDoubleBar).toBe('number');
  });

  it('solves Network Shortest Route, MST, and Max Flow', () => {
    const edges = [
      { from: 'A', to: 'B', weight: 4 },
      { from: 'A', to: 'C', weight: 2 },
      { from: 'C', to: 'B', weight: 1 },
      { from: 'B', to: 'D', weight: 5 },
      { from: 'C', to: 'D', weight: 8 },
    ];
    const sr = solveNetworkModels('t-sr', 'SR', {
      mode: 'shortest-route',
      sourceNode: 'A',
      sinkNode: 'D',
      directed: true,
      edges,
    });
    // A->C(2)->B(1)->D(5) = 8
    expect(sr.derivedValues.shortestDistance).toBe(8);

    const mst = solveNetworkModels('t-mst', 'MST', {
      mode: 'mst',
      sourceNode: 'A',
      sinkNode: 'D',
      directed: false,
      edges,
    });
    // C-B(1) + A-C(2) + B-D(5) = 8
    expect(mst.derivedValues.mstWeight).toBe(8);

    const mf = solveNetworkModels('t-mf', 'MF', {
      mode: 'max-flow',
      sourceNode: 'A',
      sinkNode: 'D',
      directed: true,
      edges,
    });
    // Bottleneck out of A is 4+2=6; into D is 5+8=13 -> A->B->D(4) + A->C->D(2) or A->C->B->D(1)+A->C->D(1) = 6
    expect(mf.derivedValues.maxFlow).toBe(6);
  });

  it('solves Markov steady-state probabilities', () => {
    const res = solveMarkovAnalysis('t-mk', 'Markov', {
      stateNames: ['A', 'B'],
      initialVector: [1, 0],
      transitionMatrix: [
        [0.8, 0.2],
        [0.4, 0.6],
      ],
      steps: 5,
    });
    // Steady state: 0.2*A = 0.4*B, A+B=1 => A=2/3, B=1/3
    expect(res.status).toBe('success');
    expect(res.derivedValues.steady_A).toBeCloseTo(0.6667, 3);
    expect(res.derivedValues.steady_B).toBeCloseTo(0.3333, 3);
  });

  it('explodes multi-level MRP BOM accurately', () => {
    const res = solveMrp('t-mrp', 'MRP', DEFAULT_MODULE_INPUTS.mrp);
    expect(res.tables.length).toBeGreaterThanOrEqual(4);
    expect(res.tables.some((t) => t.id === 'mrp-lotsize-comparison')).toBe(true);
    expect(Number(res.derivedValues.totalPlannedReleases)).toBeGreaterThan(0);
  });

  it('solves Aggregate Planning and Job Shop Scheduling', () => {
    const agg = solveAggregatePlanning('t-agg', 'Agg', DEFAULT_MODULE_INPUTS['aggregate-planning']);
    expect(agg.status).toBe('success');
    expect(Number(agg.derivedValues.lowestTotalCost)).toBeGreaterThan(0);

    const sch = solveScheduling('t-sch', 'Sch', DEFAULT_MODULE_INPUTS.scheduling);
    expect(sch.status).toBe('success');
    expect(Number(sch.derivedValues.bestFlowTime)).toBeGreaterThan(0);
  });
});
