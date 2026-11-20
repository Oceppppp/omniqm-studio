---
name: or-module-development
description: Implement or extend a POM-QM module in OmniQM Studio using typed contracts, pure Web-Worker-safe solvers, DeepAnalysis generation, and isolated Vitest coverage.
---
# OR Module Development (OmniQM Studio)

## Procedure
1. Define or update typed input/output interfaces in `src/core/types/module.types.ts` and register metadata in `src/core/registry/moduleRegistry.ts`.
2. Implement the pure solver function in `src/engines/<module>.ts` and wire it in `src/engines/index.ts`.
3. Separate structural input validation (empty inputs, negative rates, `USL <= LSL`, cycles) from core mathematical solving.
4. Populate every `ModuleExecutionResult` with:
   - `status`, `summaryText`, `kpis`, `tables`, `charts`, `warnings`, `auditSteps`, `derivedValues`, and structured `analysis: DeepAnalysis` (`headline`, `interpretation`, `sections`, `recommendations` in clear Indonesian).
5. Update `src/io/parsers/moduleMapper.ts`, `src/io/exporters/excelExporter.ts`, `src/io/exporters/csvExporter.ts`, and `src/io/templates/sampleDatasets.ts` so import, export, and default datasets stay in sync.
6. Add or update the module's editor component under `src/ui/components/editors/` only after the engine contract is stable.
7. Add textbook & edge-case tests in `tests/engines/` and run `npm run lint && npx tsc --noEmit && npm test && npm run build`.

## Guardrails
- Never fake "optimal" when a solver hits an iteration/node cap, is infeasible, or is unbounded.
- Never fabricate shadow prices, ranging bounds, or sensitivity metrics.
- Avoid importing React or browser DOM APIs inside `src/engines/` or `src/core/`.
