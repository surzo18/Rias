---
name: git-management
description: Use before ANY git operation (branch, commit, PR, merge) in the Rias project to enforce version-based workflow conventions and Claude infrastructure sync.
user-invocable: true
argument-hint: "[branch-name|commit-message]"
---

# Git Management - Rias

Enforce correct version-based git workflow for the Rias project. This skill is MANDATORY before creating branches, committing, creating PRs, or merging.

## Branch Model

```
main (stable, tagged releases only)
  │
  ├── v0.1.0 (version branch, all v0.1.0 work goes here)
  │     ├── feature/add-skill-x     (squash merge → v0.1.0)
  │     └── bugfix/fix-hook          (squash merge → v0.1.0)
  │     └── merge --no-ff → main + tag v0.1.0
  │
  └── v0.2.0 (next version, created from main after v0.1.0 release)
        ├── feature/gateway-integ    (squash merge → v0.2.0)
        └── ...
```

## Branch Creation

### Version branches (from main only)

```bash
git checkout main
git checkout -b v0.2.0
```

### Work branches (from vX.Y.Z only)

```bash
git checkout v0.1.0
git checkout -b feature/add-gateway-skill
```

### Hotfix branches (from main at a tag)

```bash
git checkout main
git checkout -b hotfix/v0.1.1-fix-crash
```

### Allowed branch patterns

| Pattern | Example | Origin |
|---------|---------|--------|
| `vX.Y.Z` | `v0.2.0` | From `main` |
| `feature/<name>` | `feature/add-skill` | From `vX.Y.Z` |
| `bugfix/<name>` | `bugfix/fix-hook` | From `vX.Y.Z` |
| `refactor/<name>` | `refactor/cleanup` | From `vX.Y.Z` |
| `test/<name>` | `test/add-hooks` | From `vX.Y.Z` |
| `docs/<name>` | `docs/update-readme` | From `vX.Y.Z` |
| `hotfix/vX.Y.Z-<desc>` | `hotfix/v0.1.1-fix-crash` | From `main` (at tag) |

**Rules:**
- Lowercase with hyphens only
- No uppercase, underscores, or spaces
- Work branches MUST originate from a version branch, NOT from main
- Hotfix branches MUST originate from main

## Merge Strategies

| Source → Target | Strategy | Command |
|----------------|----------|---------|
| `feature/*` → `vX.Y.Z` | Squash merge | `git merge --squash feature/name && git commit` |
| `bugfix/*` → `vX.Y.Z` | Squash merge | `git merge --squash bugfix/name && git commit` |
| `vX.Y.Z` → `main` | Merge commit | `git merge --no-ff vX.Y.Z` |
| `hotfix/*` → `main` | Merge commit | `git merge --no-ff hotfix/name` |

**Never** squash version branches into main - use `--no-ff` to preserve version history.

**`--force-with-lease`:** Allowed ONLY when rebasing a personal feature branch that has already been pushed. Never use on shared branches (version branches or main). The validate hook blocks `--force` but permits `--force-with-lease`.

**IMPORTANT:** Never merge a version branch to main automatically. The user decides when to release. Keep version branches alive until explicitly told to merge.

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

## Version Branch Lifecycle

### 1. Create version branch

```bash
git checkout main
git checkout -b vX.Y.Z
```

### 2. Develop features

```bash
git checkout vX.Y.Z
git checkout -b feature/my-feature
# ... work ...
git checkout vX.Y.Z
git merge --squash feature/my-feature
git commit -m "feat: add my feature"
git branch -d feature/my-feature
```

### 3. Release

Follow the release checklist below.

### 4. Clean up

```bash
git branch -d vX.Y.Z
```

## Release Checklist

Before merging a version branch to main:

1. **Tests pass:** `npm test` returns all green
2. **Changelog generated:** `npm run changelog`
3. **Docs updated:** README, CLAUDE.md, docs/skills/index.md reflect changes
4. **Version in package.json** matches branch name
5. **Merge to main:**
   ```bash
   git checkout main
   git merge --no-ff vX.Y.Z
   ```
6. **Tag the merge commit:**
   ```bash
   git tag vX.Y.Z
   ```
7. **Delete version branch:**
   ```bash
   git branch -d vX.Y.Z
   ```

## Hotfix Process

For urgent fixes to a released version:

1. Branch from main: `git checkout -b hotfix/vX.Y.Z-description`
2. Fix the issue, add tests
3. Update version in package.json (patch bump)
4. Run release checklist (tests, changelog, docs)
5. Merge to main with `--no-ff`, tag, delete branch

## Pre-Commit Infrastructure Sync Checklist

**BEFORE every commit**, check if any of these files need updating:

### Rias-local files

| Trigger | Update |
|---------|--------|
| New OpenClaw skill added | `CLAUDE.md` (project structure) |
| Stack decision made | `CLAUDE.md` (stack, build commands) |
| New dependency added | `CLAUDE.md` (stack section) |
| Architecture change | `CLAUDE.md` (project structure, conventions) |
| New hook added/changed | `CLAUDE.md` hooks table + `settings.json` |
| New rule added | `CLAUDE.md` project structure tree |
| New test file added | `CLAUDE.md` project structure tree |

### Documentation files

| Trigger | Update |
|---------|--------|
| New skill added/removed | `docs/skills/index.md` + `README.md` skills table |
| New npm script added | `README.md` quick start + `CLAUDE.md` build commands |
| Project structure changed | `README.md` structure tree + `CLAUDE.md` structure tree |
| Version released | `README.md` + CHANGELOG.md (via `npm run changelog`) |

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

## Quick Reference

```bash
# Create version branch
git checkout main && git checkout -b v0.2.0

# Create feature branch from version
git checkout v0.2.0 && git checkout -b feature/my-feature

# Squash merge feature into version
git checkout v0.2.0 && git merge --squash feature/my-feature && git commit

# Release version to main
git checkout main && git merge --no-ff v0.2.0 && git tag v0.2.0 && git branch -d v0.2.0

# Stage specific files (prefer over git add -A)
git add path/to/file1 path/to/file2

# Commit with conventional message
git commit -m "$(cat <<'EOF'
feat(skills): add gateway health check skill

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Push with upstream tracking
git push -u origin v0.2.0
```
