---
name: update-docs
description: Regenerate and validate all project documentation - CHANGELOG, README, skill inventory, CLAUDE.md
user-invocable: true
---

# Update Documentation

Regenerate and validate all Rias project documentation. Run this after significant changes or before releases.

## Steps

### 1. Regenerate CHANGELOG.md

```bash
npm run changelog
```

If CHANGELOG.md doesn't exist yet, use `npm run changelog:init` instead.

### 2. Verify README.md

Read `README.md` and verify:
- Project structure tree matches actual directory layout (use `ls` and `find` to confirm)
- Skills table lists all skills found in `.claude/skills/`
- Quick start commands match `package.json` scripts
- Architecture pillars section is accurate

If anything is outdated, update README.md.

### 3. Verify docs/skills/index.md

Read `docs/skills/index.md` and cross-reference with actual skills:

```bash
find .claude/skills -name "SKILL.md" -type f
```

For each skill found:
- Verify it has an entry in `docs/skills/index.md`
- Verify the description matches the SKILL.md frontmatter
- Verify the command name is correct

Add missing skills, remove deleted skills.

### 4. Verify CLAUDE.md

Read `CLAUDE.md` and verify:
- Project structure tree matches actual layout
- Hooks table matches `settings.json` hooks
- Build & Test Commands section matches `package.json`
- Rules listed match files in `.claude/rules/`
- Skills listed match files in `.claude/skills/`

If anything is outdated, update CLAUDE.md.

### 5. Report

Summarize what was updated and what was already correct. List any issues that need manual attention.
