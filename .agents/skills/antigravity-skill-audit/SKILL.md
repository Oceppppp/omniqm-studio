---
name: antigravity-skill-audit
description: Audit Antigravity skills and project customizations available on the current machine, then map relevant capabilities to OmniQM Studio work without claiming unavailable skills.
---
# Antigravity Skill Audit (OmniQM Studio)

## When to use
Use at project setup, before assigning a specialized development task, and whenever a new skill, plugin, or customization is added.

## Procedure
1. Inspect workspace `.agents/skills/` and active Antigravity skills/plugins on the current surface.
2. Read each task-relevant `SKILL.md` in full before invoking skill-dependent tools.
3. Verify connected plugins/CLIs (such as `gh`, `gdrive`) and authentication before running external actions.
4. Map only relevant skills to OmniQM Studio tasks (`src/engines/`, `src/io/`, `src/ui/`, `tests/`, GitHub/Netlify CI); do not claim unused skills.
5. Propose or refine project-specific skill files under `.agents/skills/` only when they add repeatable OmniQM Studio procedures.
6. Re-check the active skill list after changes.

## Output
A concise skill inventory, task mapping, and exact source path for each skill. Never copy private credentials or global secrets into the repository.
