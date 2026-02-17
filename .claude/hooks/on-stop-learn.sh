#!/usr/bin/env bash
# Stop hook (command): Analyze transcript for learnings and persist to local files
set -euo pipefail

INPUT=$(cat)

TRANSCRIPT=$(echo "$INPUT" | node -e "
  let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { console.log(JSON.parse(d).transcript_path||''); }
    catch { console.log(''); }
  });
" 2>/dev/null || echo "")

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
LEARNINGS_DIR="$PROJECT_DIR/.claude/local/learnings"
mkdir -p "$LEARNINGS_DIR"

DATE=$(date +%Y-%m-%d)
HOOK_LOG="$LEARNINGS_DIR/hook-log.md"

node -e "
  const fs = require('fs');
  const path = process.argv[1];
  const learningsDir = process.argv[2];
  const date = process.argv[3];

  const lines = fs.readFileSync(path, 'utf8').trim().split('\\n');
  const patterns = [];
  const decisions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'human') {
      const text = JSON.stringify(obj.message || '').toLowerCase();
      if (/\\b(no[, .!]|wrong|nope|nie[, .!]|zle|nechcem|preco si|nemal by|shouldn\\'t|that\\'s not|should be)\\b/.test(text)) {
        if (i < lines.length - 1) {
          const content = (typeof obj.message === 'string' ? obj.message : JSON.stringify(obj.message)).slice(0, 100);
          patterns.push('User correction detected: ' + content.replace(/[\\n\\r]/g, ' ').trim());
        }
      }
    }

    if (obj.type === 'assistant' && obj.message && obj.message.content) {
      const content = JSON.stringify(obj.message.content).toLowerCase();
      if (/\\b(decided to|chose|approach:|architecture:|trade-?off|instead of)\\b/.test(content)) {
        const text = (typeof obj.message.content === 'string'
          ? obj.message.content
          : obj.message.content.map(b => b.text || '').join(' ')
        ).slice(0, 150);
        if (text.length > 30) decisions.push(text.replace(/[\\n\\r]/g, ' ').trim());
      }
    }
  }

  const uniqPatterns = [...new Set(patterns)].slice(0, 3);
  const uniqDecisions = [...new Set(decisions)].slice(0, 3);

  if (uniqPatterns.length > 0) {
    const patternsFile = learningsDir + '/patterns.md';
    let existing = '';
    try { existing = fs.readFileSync(patternsFile, 'utf8'); } catch {}
    if (!existing.startsWith('# ')) existing = '# Patterns\\n\\n';
    if (!existing) existing = '# Patterns\\n\\n';
    if (!fs.existsSync(patternsFile)) fs.writeFileSync(patternsFile, existing);
    const entries = uniqPatterns.map(p => '### ' + date + ': ' + p).join('\\n\\n');
    fs.appendFileSync(patternsFile, '\\n' + entries + '\\n');
  }

  if (uniqDecisions.length > 0) {
    const decisionsFile = learningsDir + '/decisions.md';
    let existing = '';
    try { existing = fs.readFileSync(decisionsFile, 'utf8'); } catch {}
    if (!existing.startsWith('# ')) existing = '# Decisions\\n\\n';
    if (!existing) existing = '# Decisions\\n\\n';
    if (!fs.existsSync(decisionsFile)) fs.writeFileSync(decisionsFile, existing);
    const entries = uniqDecisions.map(d => '### ' + date + '\\n' + d).join('\\n\\n');
    fs.appendFileSync(decisionsFile, '\\n' + entries + '\\n');
  }

  [learningsDir + '/patterns.md', learningsDir + '/decisions.md'].forEach(f => {
    try {
      const count = fs.readFileSync(f, 'utf8').split('\\n').length;
      if (count > 100) process.stderr.write('BLOAT_WARNING: ' + f.split('/').pop() + ' has ' + count + ' lines (soft limit: 100).\\n');
    } catch {}
  });

  const total = uniqPatterns.length + uniqDecisions.length;
  if (total > 0) process.stderr.write('Recorded ' + total + ' learning(s) to local patterns/decisions files\\n');
" "$TRANSCRIPT" "$LEARNINGS_DIR" "$DATE" 2>&1 || true

if [ ! -f "$HOOK_LOG" ]; then
  printf '# Hook Execution Log\n\n| Date | Hook | Status | Details |\n|------|------|--------|---------|\n' > "$HOOK_LOG"
fi
printf '| %s | stop-learn | ok | analyzed transcript |\n' "$(date +'%Y-%m-%d %H:%M')" >> "$HOOK_LOG"

exit 0
