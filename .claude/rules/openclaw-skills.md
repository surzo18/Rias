# OpenClaw Skills Rules

## Source of Truth

Always consult https://docs.openclaw.ai before making assumptions about OpenClaw APIs, skill format, or gateway behavior.

Key docs:
- Skills: https://docs.openclaw.ai/tools/skills
- Skills config: https://docs.openclaw.ai/tools/skills-config
- Full index: https://docs.openclaw.ai/llms.txt

## Skill Format

Every OpenClaw skill MUST have a `SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: What this skill does
---
```

### Required fields
- `name` - lowercase with hyphens
- `description` - clear, concise purpose

### Optional fields
- `user-invocable` (bool, default `true`)
- `disable-model-invocation` (bool, default `false`)
- `command-dispatch: tool`
- `command-tool` - tool to invoke
- `command-arg-mode: raw`
- `homepage` - URL

## Skill Loading Priority (highest to lowest)

1. Workspace skills: `<workspace>/skills`
2. Managed/local: `~/.openclaw/skills`
3. Bundled (shipped with install)

Extra dirs via `skills.load.extraDirs` in `~/.openclaw/openclaw.json`.

## Metadata Gating

Skills can gate on requirements:

```json
"metadata": {
  "openclaw": {
    "requires": {
      "bins": ["tool"],
      "env": ["VAR"],
      "config": ["setting"]
    }
  }
}
```

## Validation

Before committing any OpenClaw skill:
1. Verify SKILL.md has valid YAML frontmatter
2. Verify `name` and `description` are present
3. Test with `openclaw skills check` if gateway is available
