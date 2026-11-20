---
name: frontend-ui
description: Build accessible, typed React 19 and TypeScript interfaces for OmniQM Studio following the Precision Analytical Workbench design system.
---
# OmniQM Studio Frontend UI

## Procedure
1. Read `docs/DESIGN_SYSTEM.md` before modifying any UI component or stylesheet (`src/styles/tokens.css`, `base.css`, `layout.css`, `components.css`).
2. Follow the *Precision Analytical Workbench* aesthetic: high-craft crisp light surface, restrained slate/navy accents, strict tabular-nums alignment, hairline borders, and zero "AI slop" (no gratuitous gradients, neon glows, or decorative bloat).
3. Keep mathematical computation inside `src/engines/` (executed via Web Worker Pool); UI components (`ResultView.tsx`, `BatchDashboard.tsx`, `ModuleInputPanel.tsx`, SVG charts) only format, visualize, and explain returned `ModuleExecutionResult` data.
4. Ensure every result view renders `kpis`, `analysis` (Deep Analysis panel), `charts` (SVG), `tables` (with highlighted optimal/OOC rows), and `auditSteps` cleanly in both screen and `@media print` layouts.
5. Preserve all `data-testid` and element IDs used by tests and accessibility landmarks.
6. Verify responsive behavior and zero console/runtime errors in headless Chromium or preview before release.

## Guardrails
- Never infer success from a non-empty result object; always inspect `result.status` and surface `result.warnings`.
- Never display `NaN` or `undefined` in any KPI, table cell, chart label, or analysis card.
