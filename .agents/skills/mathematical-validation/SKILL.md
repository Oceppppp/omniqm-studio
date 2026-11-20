---
name: mathematical-validation
description: Design independent numerical tests and validation invariants for OmniQM Studio's 16 POM-QM optimization, forecasting, inventory, queueing, SPC, network, Markov, MRP, and scheduling engines.
---
# Mathematical Validation (OmniQM Studio)

## Procedure
1. Formulate the exact mathematical model, assumptions, units, variable domains, and objective sense (`min` vs `max`).
2. Construct hand-solvable textbook benchmarks (Heizer & Render, Taha, Montgomery) with expected intermediate and final values.
3. Construct edge cases: zero values, negative values where permitted, infeasible, unbounded, degenerate MODI tables, parallel critical paths, large `s` / `K` queueing overflow, `defects > n`, negative-weight cycles, all-absorbing Markov chains, and capacity shortages.
4. Add invariant tests in `tests/engines/mathAuditAndAnalysis.test.ts` verifying:
   - Exact dual/shadow prices across `<=`, `>=`, and `=` constraints.
   - Integrality gap vs LP relaxation in Branch-and-Bound.
   - Max-Flow === Min-Cut capacity theorem and Bellman-Ford negative-cycle detection.
   - `EVPI === min(EOL)` in Decision Analysis.
   - Zero `NaN` or `undefined` across `kpis`, `tables`, `derivedValues`, and `analysis` for all 16 default modules and alternate modes.
5. Separate solver status (`success` / `warning` / `error`) from Deep Analysis managerial interpretation.
6. Document numerical tolerances and heuristic limitations clearly.
