#!/usr/bin/env bash
# Stop hook (command): Analyze transcript for learnings and persist to files
# Detects: user corrections, discovered patterns, architectural decisions
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
LEARNINGS_DIR="$PROJECT_DIR/.claude/learnings"
mkdir -p "$LEARNINGS_DIR"

DATE=$(date +%Y-%m-%d)

# Analyze transcript for learnings using node
# Looks for concrete signals, NOT content of secrets/files
node -e "
  const fs = require('fs');
  const path = process.argv[1];
  const learningsDir = process.argv[2];
  const date = process.argv[3];

  const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
  const patterns = [];
  const decisions = [];

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    // Detect user corrections (user says 'no', 'wrong', 'nie', 'zle', 'nechcem')
    if (obj.type === 'human') {
      const text = JSON.stringify(obj.message || '').toLowerCase();
      if (/\b(no[, .!]|wrong|nie[, .!]|zle|nechcem|preco si|prečo si|nemal by|shouldn.t)\b/.test(text)) {
        // Check if next assistant message exists (indicates correction happened)
        const idx = lines.indexOf(line);
        if (idx < lines.length - 1) {
          // Extract first 100 chars of user message for context
          const content = (typeof obj.message === 'string' ? obj.message : JSON.stringify(obj.message)).slice(0, 100);
          patterns.push('User correction detected: ' + content.replace(/[\\n\\r]/g, ' ').trim());
        }
      }
    }

    // Detect architectural decisions (assistant mentions 'decision', 'chose', 'approach')
    if (obj.type === 'assistant' && obj.message && obj.message.content) {
      const content = JSON.stringify(obj.message.content).toLowerCase();
      if (/\b(decided to|chose|approach:|architecture:|trade-?off|instead of)\b/.test(content)) {
        const text = (typeof obj.message.content === 'string'
          ? obj.message.content
          : obj.message.content.map(b => b.text || '').join(' ')
        ).slice(0, 150);
        if (text.length > 30) {
          decisions.push(text.replace(/[\\n\\r]/g, ' ').trim());
        }
      }
    }
  }

  // Deduplicate and limit
  const uniqPatterns = [...new Set(patterns)].slice(0, 3);
  const uniqDecisions = [...new Set(decisions)].slice(0, 3);

  // Write patterns
  if (uniqPatterns.length > 0) {
    const patternsFile = learningsDir + '/patterns.md';
    let existing = '';
    try { existing = fs.readFileSync(patternsFile, 'utf8'); } catch {}
    if (!existing.startsWith('# ')) { existing = '# Patterns\\n\\n' + existing; }
    const entries = uniqPatterns.map(p => '### ' + date + ': ' + p).join('\\n\\n');
    fs.appendFileSync(patternsFile, '\\n' + entries + '\\n');
  }

  // Write decisions
  if (uniqDecisions.length > 0) {
    const decisionsFile = learningsDir + '/decisions.md';
    let existing = '';
    try { existing = fs.readFileSync(decisionsFile, 'utf8'); } catch {}
    if (!existing.startsWith('# ')) { existing = '# Decisions\\n\\n' + existing; }
    const entries = uniqDecisions.map(d => '### ' + date + '\\n' + d).join('\\n\\n');
    fs.appendFileSync(decisionsFile, '\\n' + entries + '\\n');
  }

  const total = uniqPatterns.length + uniqDecisions.length;
  if (total > 0) {
    process.stderr.write('Recorded ' + total + ' learning(s) to patterns/decisions files\\n');
  }
" "$TRANSCRIPT" "$LEARNINGS_DIR" "$DATE" 2>&1 || true

exit 0
