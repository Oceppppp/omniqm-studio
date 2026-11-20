---
name: data-import-validation
description: Build safe Excel, CSV, JSON, and JavaScript data import, column mapping, validation, and normalization for OmniQM Studio.
---
# Data Import and Validation (OmniQM Studio)

## Procedure
1. Inspect `src/io/parsers/` (`fileDetector.ts`, `excelParser.ts`, `csvParser.ts`, `jsonParser.ts`, `jsDataParser.ts`, `columnMapping.ts`, `moduleMapper.ts`).
2. Validate file extension, MIME/signature, size, and parser bounds before processing.
3. Parse passively. Never execute untrusted macros, spreadsheet formulas, or arbitrary JavaScript via `eval`/`new Function` — `jsDataParser.ts` must strictly use safe AST/token/JSON-like extraction.
4. Detect CSV delimiters/encoding and multi-sheet Excel workbooks; expose manual sheet and `headerRowIndex` overrides.
5. Support interactive column mapping (`columnMapping.ts`) and direct spreadsheet paste (`Ctrl+V`) while keeping inferred mappings as suggestions only.
6. Guard all numeric parsers (`asNum`, `parseOptNum`, `parseOptionalNum`) against `NaN` and preserve module-specific defaults (e.g., `'min'` objective sense for Transportation and Assignment).
7. Return clear Indonesian row/column-specific warnings without crashing the batch queue.
8. Add malformed, empty-sheet, multi-sheet, non-standard JS filename, and edge-case tests in `tests/io/`.

## Guardrails
- Uploaded files are untrusted input.
- Never evaluate spreadsheet formulas or execute uploaded JS files.
- Never silently coerce invalid numbers into `NaN`.
