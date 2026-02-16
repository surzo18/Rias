---
name: git-management
description: Use before ANY git operation (branch, commit, PR, merge) in the Rias project to enforce workflow conventions and Claude infrastructure sync.
user-invocable: true
argument-hint: "[branch-name|commit-message]"
---

# Git Management - Rias

Enforce correct git workflow for the Rias project. This skill is MANDATORY before creating branches, committing, creating PRs, or merging.

## Branch Creation

Before creating any branch, validate the name:

**Allowed prefixes:**
- `feature/<name>` - New functionality
- `bugfix/<name>` - Bug fix
- `hotfix/<name>` - Urgent production fix
- `refactor/<name>` - Code refactoring
- `test/<name>` - Test additions
- `docs/<name>` - Documentation

**Rules:**
- Lowercase with hyphens only (e.g., `feature/add-gateway-skill`)
- No uppercase, underscores, or spaces
- Descriptive but concise name

**Command:**
```bash
cd /d/REPOS/tools/Rias && git checkout -b <prefix>/<name>
```

## Commit Messages

**Format:** Conventional commits: `<type>(<optional-scope>): <description>`

**Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `chore`, `perf`, `ci`, `build`, `revert`

**Rules:**
- Description in English, lowercase start, no period at end
- Add Co-Authored-By trailer on every commit:
  ```
  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  ```
- Use HEREDOC for commit messages:
  ```bash
  git commit -m "$(cat <<'EOF'
  type(scope): description

  Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
  EOF
  )"
  ```

## Pre-Commit Infrastructure Sync Checklist

**BEFORE every commit**, check if any of these files need updating:

### Rias-local files

| Trigger | Update |
|---------|--------|
| New OpenClaw skill added | `tools/Rias/CLAUDE.md` (project structure) |
| Stack decision made | `tools/Rias/CLAUDE.md` (stack, build commands) |
| New dependency added | `tools/Rias/CLAUDE.md` (stack section) |
| Architecture change | `tools/Rias/CLAUDE.md` (project structure, conventions) |

### Documentation files

| Trigger | Update |
|---------|--------|
| New skill added/removed | `docs/skills/index.md` + `README.md` skills table |
| New npm script added | `README.md` quick start + `CLAUDE.md` build commands |
| Project structure changed | `README.md` structure tree + `CLAUDE.md` structure tree |
| New hook added/changed | `CLAUDE.md` hooks table + `settings.json` |

### Root workspace files

| Trigger | Update |
|---------|--------|
| New port allocated | `MEMORY.md` (port mapping table) |
| New keywords for routing | `D:\REPOS\CLAUDE.md` (routing table) |
| Build/test commands changed | `D:\REPOS\CLAUDE.md` (quick reference section) |
| Stack finalized | `D:\REPOS\CLAUDE.md` (Dev Tools table) |
| New shared pattern (3+) | `D:\REPOS\.claude\rules\` (extract rule) |
| Docker service added | `MEMORY.md` (port mapping) + `D:\REPOS\CLAUDE.md` |

### Procedure

1. Review staged changes
2. Walk through the checklist above
3. If any infrastructure file needs updating - update it NOW before committing
4. Commit code AND infrastructure changes together
5. If root repo also needs changes, make a separate commit there

## PR Creation

When creating a pull request:

**Title:** Under 70 characters, descriptive

**Body template:**
```markdown
## Summary
- <1-3 bullet points describing what changed>

## Test plan
- [ ] <Testing steps>

## Infrastructure sync
- [ ] CLAUDE.md updated (if needed)
- [ ] Root routing table updated (if needed)
- [ ] MEMORY.md updated (if needed)

Generated with [Claude Code](https://claude.com/claude-code)
```

**Command:**
```bash
cd /d/REPOS/tools/Rias && gh pr create --title "title" --body "$(cat <<'EOF'
<body>
EOF
)"
```

## Merge Strategy

- **Squash merge** to main branch
- **Never force push** (`--force`). Use `--force-with-lease` only if absolutely necessary
- **Never push directly to main** - use Pull Requests
- Before merge, verify all infra sync checklist items are done

## Quick Reference

```bash
# Create branch
git checkout -b feature/my-feature

# Stage specific files (prefer over git add -A)
git add path/to/file1 path/to/file2

# Commit with conventional message
git commit -m "$(cat <<'EOF'
feat(skills): add gateway health check skill

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Push with upstream tracking
git push -u origin feature/my-feature

# Create PR
gh pr create --title "feat: add gateway health check" --body "..."
```
