---
name: qa-release
description: Execute OmniQM Studio release verification across static lint, TypeScript typecheck, Vitest mathematical suite, Vite production build, live preview, and Netlify/GitHub CI.
---
# OmniQM Studio QA and Release

## Procedure
1. Confirm target branch, `package.json`, `package-lock.json`, and `.nvmrc` (Node 22).
2. Run full verification gates:
   ```bash
   npm run lint        # oxlint (0 warnings, 0 errors)
   npx tsc --noEmit    # strict TypeScript check
   npm test            # Vitest unit, IO, PWA & mathematical audit suite
   npm run build       # tsc -b && vite build -> dist/
   ```
3. Verify `dist/` serves HTTP 200 on `/`, `/sw.js`, `/manifest.webmanifest`, and `/icon.svg`, and check headless browser rendering for zero console/page errors.
4. Verify Excel/CSV exports include `DeepAnalysis` and all 16 batch jobs execute concurrently via Web Worker Pool.
5. Push to GitHub `main` and confirm `.github/workflows/ci.yml` passes with green status.
6. If distributing offline ZIP, exclude `node_modules/` and `.git/`, verify `unzip -tq`, and update the archive.

## Reporting
Never mark a gate passed unless the exact command or browser check was executed and succeeded.
