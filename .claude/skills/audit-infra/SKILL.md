---
name: audit-infra
description: Run a comprehensive infrastructure audit covering security, tokens, errors, logs, docs, infrastructure, git, and cleanup
user-invocable: true
argument-hint: "[--reset-counter]"
---

# Infrastructure Audit

Run a comprehensive audit of Rias infrastructure. Triggered automatically every 100 sessions or manually via `/audit-infra`.

## When to Run

- Automatically: Session counter reaches audit threshold (default: 100 sessions)
- Manually: `/audit-infra` command
- After major changes: New hooks, rules, or skills added

## Audit Checklist

Complete ALL 8 sections. For each, report: PASS / WARN / FAIL with details.

### 1. Security

- [ ] All hooks in `.claude/hooks/` have `set -euo pipefail`
- [ ] `validate-git-ops.sh` blocks: force push, main push, reset --hard
- [ ] Secret scanning patterns are comprehensive (check regex in validate-git-ops.sh)
- [ ] `settings.json` deny list covers dangerous commands
- [ ] No `.env`, `.key`, `.pem` files in git history: `git log --all --diff-filter=A --name-only | grep -iE '\.env|\.key|\.pem'`
- [ ] Permissions allowlist is not too broad

### 2. Token Consuming

- [ ] Review `.claude/learnings/token-usage.md` for trends
- [ ] Flag sessions with >100k tokens
- [ ] Check if threshold alert in `on-stop-token-log.sh` is working (look for TOKEN_WARNING in hook-log)
- [ ] Compare average tokens per session over last 10 entries

### 3. Errors & Bugs

- [ ] Review `.claude/learnings/mistakes.md` for recurring patterns
- [ ] Check if any mistake appears 3+ times (propose rule)
- [ ] Verify all hooks pass `bash -n` syntax check
- [ ] Run `npm test` — all tests must pass
- [ ] Check for known Windows/MINGW compatibility issues

### 4. Logs Checking

- [ ] Review `.claude/learnings/hook-log.md` for:
  - Missing hooks (expected hooks not firing)
  - Error entries
  - Frequency patterns (are all hooks running as expected?)
- [ ] Check hook-log.md size (truncate if >500 lines, keep last 200)
- [ ] Verify session counter in `.claude/agent-memory/session-counter.json`

### 5. Documentation Update

- [ ] `CLAUDE.md` project structure matches actual filesystem
- [ ] `README.md` matches current state (structure, skills, test count)
- [ ] `docs/skills/index.md` lists all skills (including audit-infra)
- [ ] All hooks documented in CLAUDE.md hooks table
- [ ] CHANGELOG.md is up to date: `npm run changelog`

### 6. Infrastructure Update

- [ ] `settings.json` hooks reference existing files
- [ ] All hook files have correct permissions (executable)
- [ ] `package.json` scripts work: `npm test`, `npm run changelog`
- [ ] `.gitignore` covers all generated/personal files
- [ ] Root `MEMORY.md` is accurate (ports, project relationships)

### 7. Git Verifying

- [ ] Current branch state: `git branch -a`
- [ ] No uncommitted changes on version branch
- [ ] Tags match version branches: `git tag -l`
- [ ] No ambiguous refnames (tag and branch with same name)
- [ ] Commit messages follow conventional format: `git log --oneline -20`
- [ ] No force pushes in reflog: `git reflog | grep 'forced'`

### 8. Cleaning

- [ ] Handovers older than 7 days: `find .claude/handovers -mtime +7`
- [ ] Learnings files under 100 lines each
- [ ] hook-log.md under 500 lines (truncate if needed)
- [ ] No junk files in project root: `ls -la` for unexpected files
- [ ] `node_modules/` not bloated: `du -sh node_modules`
- [ ] Stale branches: `git branch --merged`

## After Audit

1. Report findings as a summary table
2. Update session counter: set `lastAuditAt` to current `sessionCount` and `lastAuditDate` to today
3. Record audit result in hook-log.md
4. If issues found → create feature branch and fix them

### Update Counter

After completing the audit, update the session counter:

```bash
node -e "
  const fs = require('fs');
  const f = '.claude/agent-memory/session-counter.json';
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.lastAuditAt = j.sessionCount;
  j.lastAuditDate = new Date().toISOString().split('T')[0];
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
"
```

## Output Format

```markdown
## Audit Report - YYYY-MM-DD (Session #N)

| Area | Status | Issues |
|------|--------|--------|
| Security | PASS/WARN/FAIL | details |
| Token Consuming | PASS/WARN/FAIL | details |
| Errors & Bugs | PASS/WARN/FAIL | details |
| Logs Checking | PASS/WARN/FAIL | details |
| Documentation | PASS/WARN/FAIL | details |
| Infrastructure | PASS/WARN/FAIL | details |
| Git Verifying | PASS/WARN/FAIL | details |
| Cleaning | PASS/WARN/FAIL | details |

**Next audit due:** Session #N+100
```
