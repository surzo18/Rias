# Skill Inventory

All Claude Code skills available in the Rias project.

## audit-infra

- **Command:** `/audit-infra`
- **File:** `.claude/skills/audit-infra/SKILL.md`
- **Description:** 8-area infrastructure audit with follow-up action tracking.
- **Key behaviors:**
  - Persists latest state in `.claude/local/audits/latest.json`
  - Checks unresolved actions before new implementation
  - Requires explicit user confirmation before applying audit plan

## git-management

- **Command:** `/git-management`
- **File:** `.claude/skills/git-management/SKILL.md`
- **Description:** Enforces version-based git workflow. Implements `main -> vX.Y.Z -> feature/*` branching model.

## reflect

- **Command:** `/reflect`
- **File:** `.claude/skills/reflect/SKILL.md`
- **Description:** Deep analysis of accumulated learnings, pattern → rule promotion.

## update-docs

- **Command:** `/update-docs`
- **File:** `.claude/skills/update-docs/SKILL.md`
- **Description:** Regenerates and validates documentation consistency.

## Project skills

Project-specific skills belong in `src/skills/`.
