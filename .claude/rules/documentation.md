# Documentation Rules

## README.md

- Keep under 500 lines
- Update on new features, breaking changes, or structural changes
- Sections: Overview, Quick Start, Project Structure, Skills, Documentation System, OpenClaw Reference, License
- Do NOT duplicate CLAUDE.md content - README is for users, CLAUDE.md is for Claude

## CHANGELOG.md

- Auto-generated ONLY via `npm run changelog` (conventional-changelog)
- NEVER hand-edit CHANGELOG.md
- Run `npm run changelog` before releases or when requested
- Format follows Angular conventional changelog preset

## Architecture Decision Records (ADRs)

- Location: `D:\REPOS\docs\decisions/` (shared across all projects)
- Create an ADR when:
  - Choosing between multiple viable approaches
  - Making a decision that constrains future choices
  - Reversing a previous decision
- Format: `YYYY-MM-DD-title.md` with Status, Context, Decision, Consequences sections

## Skill Documentation

- Every skill MUST have an entry in `docs/skills/index.md`
- Entry includes: name, command, description, key behaviors
- Update `docs/skills/index.md` whenever a skill is added, removed, or significantly changed

## Doc Update Triggers

| Change | Update |
|--------|--------|
| New skill added | `docs/skills/index.md` + README.md skills table |
| Skill removed | `docs/skills/index.md` + README.md skills table |
| New npm script | README.md quick start section |
| Structure change | README.md project structure tree + CLAUDE.md |
| Breaking change | README.md + CHANGELOG.md (via `npm run changelog`) |
