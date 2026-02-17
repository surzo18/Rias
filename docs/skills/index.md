# Skill Inventory

All Claude Code skills available in the Rias project.

## git-management

- **Command:** `/git-management`
- **File:** `.claude/skills/git-management/SKILL.md`
- **Description:** Enforces version-based git workflow for the Rias project. Implements `main -> vX.Y.Z -> feature/*` branching model.

## reflect

- **Command:** `/reflect`
- **File:** `.claude/skills/reflect/SKILL.md`
- **Description:** Deep reflection over accumulated learnings and token usage.

## audit-infra

- **Command:** `/audit-infra`
- **File:** `.claude/skills/audit-infra/SKILL.md`
- **Description:** Infrastructure audit with follow-up action tracking.
- **Key behaviors:**
  - persists latest state in `.claude/local/audits/latest.json`
  - checks unresolved actions before new implementation
  - requires explicit user confirmation before applying audit plan

## update-docs

- **Command:** `/update-docs`
- **File:** `.claude/skills/update-docs/SKILL.md`
- **Description:** Regenerates and validates documentation consistency.

## Project skills

Project-specific skills belong in `src/skills/`.
