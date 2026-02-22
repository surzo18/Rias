#!/usr/bin/env bash
# deploy-skills.sh — Sync skill definitions to the OpenClaw workspace
# Idempotent: safe to run repeatedly.
#
# Usage: bash scripts/deploy-skills.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/skills"
DST_DIR="$REPO_ROOT/openclaw-data/config/workspace/skills"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: Source directory not found: $SRC_DIR" >&2
  exit 1
fi

deployed=0
skipped=0

for skill_dir in "$SRC_DIR"/*/; do
  skill_name="$(basename "$skill_dir")"
  src_file="$skill_dir/SKILL.md"

  if [ ! -f "$src_file" ]; then
    echo "SKIP: $skill_name (no SKILL.md)"
    skipped=$((skipped + 1))
    continue
  fi

  dst_skill_dir="$DST_DIR/$skill_name"
  dst_file="$dst_skill_dir/SKILL.md"

  mkdir -p "$dst_skill_dir"

  if [ -f "$dst_file" ] && diff -q "$src_file" "$dst_file" > /dev/null 2>&1; then
    echo "  OK: $skill_name (up to date)"
  else
    cp "$src_file" "$dst_file"
    echo "  DEPLOYED: $skill_name"
  fi
  deployed=$((deployed + 1))
done

echo ""
echo "Done: $deployed skills deployed, $skipped skipped."
