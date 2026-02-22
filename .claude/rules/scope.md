# Agent Scope Rule

## Constraint

This agent operates exclusively within `D:/REPOS/tools/Rias/`.

## Rule

- All file edits, creates, and deletes MUST be within `D:/REPOS/tools/Rias/` (or its subdirectories).
- All shell commands MUST be run from within `D:/REPOS/tools/Rias/`.
- If a task requires a change outside this directory (e.g., `D:/REPOS/CLAUDE.md`, `D:/REPOS/.claude/rules/`), the agent MUST:
  1. **NOT execute** that change.
  2. **Describe** exactly what change would be needed and in which file.
  3. **Inform the user** so they can apply it manually or in the correct project context.

## Rationale

Rias is a standalone Claude Code infrastructure template. Changes to sibling projects, workspace-level files, or shared rules fall outside its scope and should be handled intentionally, not automatically.
