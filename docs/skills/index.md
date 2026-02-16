# Skill Inventory

All Claude Code skills available in the Rias project.

## git-management

- **Command:** `/git-management`
- **File:** `.claude/skills/git-management/SKILL.md`
- **Description:** Enforces correct git workflow for the Rias project. Mandatory before creating branches, committing, creating PRs, or merging.
- **Key behaviors:**
  - Validates branch naming conventions (feature/, bugfix/, hotfix/, etc.)
  - Enforces conventional commit message format
  - Runs pre-commit infrastructure sync checklist
  - Provides PR creation template

## reflect

- **Command:** `/reflect`
- **File:** `.claude/skills/reflect/SKILL.md`
- **Description:** Triggers deep reflection on accumulated learnings. Identifies repeated patterns, proposes new rules, promotes key insights, and cleans up stale entries.
- **Key behaviors:**
  - Analyzes `.claude/learnings/` directory (mistakes, patterns, decisions)
  - Patterns with 3+ occurrences become rule proposals
  - Promotes insights to CLAUDE.md
  - Dispatches to reflector subagent

## update-docs

- **Command:** `/update-docs`
- **File:** `.claude/skills/update-docs/SKILL.md`
- **Description:** Regenerates and validates all project documentation. Ensures CHANGELOG, README, skill inventory, and CLAUDE.md are up to date.
- **Key behaviors:**
  - Regenerates CHANGELOG.md from conventional commits
  - Verifies README.md reflects current project structure
  - Validates all skills are listed in this index
  - Checks CLAUDE.md matches actual `.claude/` structure
