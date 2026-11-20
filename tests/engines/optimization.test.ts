import { describe, expect, it } from 'vitest';
import { solveAssignment } from '../../src/engines/assignment.ts';
import { solveIntegerProgramming } from '../../src/engines/integerProgramming.ts';
import { solveLinearProgramming } from '../../src/engines/linearProgramming.ts';
import { solveTransportation } from '../../src/engines/transportation.ts';

describe('Optimization Engines (LP, IP, Transportation, Assignment)', () => {
  it('solves classic Wyndor/Furniture Linear Programming problem accurately', () => {
    // Max 70*M + 50*K s.t. 4M+3K <= 240, 2M+1K <= 100
    // Optimal corner: M=30, K=40 => Z = 2100 + 2000 = 4100
    const res = solveLinearProgramming('t-lp', 'Furniture LP', {
      sense: 'max',
      variableNames: ['Meja', 'Kursi'],
      objectiveCoeffs: [70, 50],
      constraints: [
        { name: 'Pertukangan', coeffs: [4, 3], sign: '<=', rhs: 240 },
        { name: 'Pengecatan', coeffs: [2, 1], sign: '<=', rhs: 100 },
      ],
    });
    expect(res.status).toBe('success');
    expect(res.derivedValues.optimalZ).toBeCloseTo(4100, 3);
    expect(res.derivedValues.Meja).toBeCloseTo(30, 3);
    expect(res.derivedValues.Kursi).toBeCloseTo(40, 3);
  });

  it('handles LP with >= and = constraints and detects infeasible LP', () => {
    const feasibleMin = solveLinearProgramming('t-lp-min', 'Diet Min', {
      sense: 'min',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [2, 3],
      constraints: [
        { name: 'Min A', coeffs: [1, 1], sign: '>=', rhs: 10 },
        { name: 'Exact B', coeffs: [1, 0], sign: '=', rhs: 4 },
      ],
    });
    expect(feasibleMin.status).toBe('success');
    expect(feasibleMin.derivedValues.optimalZ).toBeCloseTo(26, 3); // X1=4, X2=6 -> 8+18=26

    const infeasible = solveLinearProgramming('t-lp-inf', 'Infeasible', {
      sense: 'max',
      variableNames: ['X1', 'X2'],
      objectiveCoeffs: [1, 1],
      constraints: [
        { name: 'Upper', coeffs: [1, 1], sign: '<=', rhs: 5 },
        { name: 'Lower', coeffs: [1, 1], sign: '>=', rhs: 10 },
      ],
    });
    expect(infeasible.status).toBe('warning');
  });

  it('solves Binary/Integer Knapsack via Branch-and-Bound', () => {
    const res = solveIntegerProgramming('t-ip', 'Knapsack', {
      sense: 'max',
      variableNames: ['P1', 'P2', 'P3', 'P4'],
      objectiveCoeffs: [150, 210, 120, 95],
      variableTypes: ['binary', 'binary', 'binary', 'binary'],
      constraints: [
        { name: 'Budget', coeffs: [40, 65, 35, 25], sign: '<=', rhs: 110 },
      ],
    });
    expect(res.status).toBe('success');
    // P1(40)+P3(35)+P4(25)=100 <= 110 => Z=150+120+95=365 (better than P1+P2=360)
    expect(res.derivedValues.optimalZ).toBeCloseTo(365, 2);
    expect(res.derivedValues.P1).toBe(1);
    expect(res.derivedValues.P2).toBe(0);
    expect(res.derivedValues.P3).toBe(1);
    expect(res.derivedValues.P4).toBe(1);
  });

  it('solves Transportation problem to global optimum via VAM + MODI', () => {
    const res = solveTransportation('t-tr', 'Classic Transport', {
      sense: 'min',
      sourceNames: ['S1', 'S2', 'S3'],
      destinationNames: ['D1', 'D2', 'D3'],
      costs: [
        [8, 6, 10],
        [9, 12, 13],
        [14, 9, 16],
      ],
      supplies: [150, 150, 100],
      demands: [100, 180, 120],
    });
    expect(res.status).toBe('success');
    // Optimal: S1->D3(120)*10 + S1->D2(30)*6 + S2->D1(100)*9 + S2->D2(50)*12 + S3->D2(100)*9
    // = 1200 + 180 + 900 + 600 + 900 = 3780? Check S1->D1/D3 vs S2->D1:
    // Actually S2->D1(100)=900, S2->D3(50)=650, S1->D3(70)=700, S1->D2(80)=480, S3->D2(100)=900 => 3630!
    expect(res.derivedValues.totalCost).toBeCloseTo(3630, 1);
  });

  it('solves Assignment problem via Hungarian algorithm', () => {
    const res = solveAssignment('t-as', 'Hungarian 3x3', {
      sense: 'min',
      agentNames: ['A', 'B', 'C'],
      taskNames: ['T1', 'T2', 'T3'],
      costs: [
        [10, 19, 8],
        [15, 7, 12],
        [11, 14, 9],
      ],
    });
    expect(res.status).toBe('success');
    // A->T3(8) or A->T1(10)? A->T1(10) + B->T2(7) + C->T3(9) = 26! (vs A->T3(8)+B->T2(7)+C->T1(11)=26)
    expect(res.derivedValues.totalCost).toBeCloseTo(26, 2);
  });
});
