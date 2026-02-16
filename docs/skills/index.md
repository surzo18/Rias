# Skill Inventory

All Claude Code skills available in the Rias project.

## git-management

- **Command:** `/git-management`
- **File:** `.claude/skills/git-management/SKILL.md`
- **Description:** Enforces version-based git workflow for the Rias project. Mandatory before creating branches, committing, creating PRs, or merging. Implements `main → vX.Y.Z → feature/*` branching model.
- **Key behaviors:**
  - Validates branch naming (vX.Y.Z, feature/, bugfix/, hotfix/vX.Y.Z-*, etc.)
  - Warns when creating work branches from main instead of version branches
  - Enforces conventional commit message format
  - Provides version branch lifecycle and release checklist
  - Runs pre-commit infrastructure sync checklist
  - Provides PR creation template

## reflect

- **Command:** `/reflect`
- **File:** `.claude/skills/reflect/SKILL.md`
- **Description:** Triggers deep reflection on accumulated learnings. Identifies repeated patterns, proposes new rules, promotes key insights, analyzes token usage, and cleans up stale entries.
- **Key behaviors:**
  - Analyzes `.claude/learnings/` directory (mistakes, patterns, decisions, token usage)
  - Patterns with 3+ occurrences become rule proposals
  - Promotes insights to CLAUDE.md
  - Analyzes token consumption trends and flags high-usage sessions
  - Dispatches to reflector subagent

## audit-infra

- **Command:** `/audit-infra`
- **File:** `.claude/skills/audit-infra/SKILL.md`
- **Description:** Comprehensive infrastructure audit covering 8 areas. Triggered automatically every 100 sessions or manually.
- **Key behaviors:**
  - Checks security (hooks, permissions, secret scanning)
  - Reviews token consumption trends
  - Scans for errors and recurring bugs
  - Verifies hook execution logs
  - Validates documentation accuracy
  - Checks infrastructure consistency
  - Verifies git state and workflow compliance
  - Cleans up stale files and bloated learnings
  - Updates session counter after completion

## update-docs

- **Command:** `/update-docs`
- **File:** `.claude/skills/update-docs/SKILL.md`
- **Description:** Regenerates and validates all project documentation. Ensures CHANGELOG, README, skill inventory, and CLAUDE.md are up to date.
- **Key behaviors:**
  - Regenerates CHANGELOG.md from conventional commits
  - Verifies README.md reflects current project structure
  - Validates all skills are listed in this index
  - Checks CLAUDE.md matches actual `.claude/` structure
