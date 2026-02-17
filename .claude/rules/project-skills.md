# Project Skills Rules

## Goal

Rias je vendor-agnosticka infra vrstva. Skill pravidla musia byt pouzitelne pre lubovolny projekt.

## Skill format

Kazdy projektovy skill MUSI mat `SKILL.md` s YAML frontmatter:

```yaml
---
name: skill-name
description: What this skill does
---
```

### Required fields
- `name` - lowercase with hyphens
- `description` - clear concise purpose

### Optional fields
- `user-invocable` (bool)
- `disable-model-invocation` (bool)
- `argument-hint`
- `command-dispatch: tool`
- `command-tool`
- `command-arg-mode: raw`
- `agent` (dispatch to subagent)

## Location model

- Infra/workflow skills: `.claude/skills/`
- Project/business skills: `src/skills/`

## Validation before commit

1. SKILL.md has valid YAML frontmatter
2. `name` and `description` are present
3. skill description matches actual behavior
4. docs entry exists in `docs/skills/index.md`
