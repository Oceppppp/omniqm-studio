---
name: architecture-review
description: Review OmniQM Studio code changes against its modular browser-side architecture, Web Worker boundaries, pipeline DAG integrity, and Netlify PWA deployment topology.
---
# Architecture Review (OmniQM Studio)

## Review checklist
1. Read `docs/ARCHITECTURE.md` and `docs/DESIGN_SYSTEM.md` to confirm layer boundaries (`src/core/` → `src/engines/` → `src/workers/` → `src/io/` → `src/store/` → `src/ui/`).
2. Ensure `src/engines/` and `src/core/` remain pure TypeScript with zero DOM or React imports so they run identically in Web Workers and Vitest.
3. Check for circular dependencies, cross-module private imports, and oversized files.
4. Verify `ModuleExecutionResult` and `DeepAnalysis` contracts in `src/core/types/module.types.ts` remain backward-compatible with `ResultView`, CSV/Excel exporters, and JSON project bundles.
5. Check pipeline DAG resolution (`src/core/pipeline/pipelineResolver.ts`), topological ordering, cycle detection, and parallel Web Worker Pool execution (`src/workers/workerPool.ts`).
6. Verify Service Worker (`public/sw.js`), Vite precache manifest generation (`vite.config.ts`), and `netlify.toml` / `public/_headers` / `public/_redirects` remain intact.
7. Add or update Vitest tests in `tests/` for every architectural or contract change.
8. Report blocking issues separately from non-blocking recommendations.
