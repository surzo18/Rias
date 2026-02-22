---
name: audit-logger
description: Query the audit database for action history and costs
---

## When to Use

Use when Adrian asks about past actions, audit history, daily costs, or usage statistics. All tool actions are **automatically logged** by middleware — you do NOT need to manually log anything.

## How to Call

First generate a JWT token, then call the API:

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
```

### Query recent logs

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -H "Authorization: Bearer $TOKEN" "http://audit-db:9000/query?limit=10"
```

### Filter by action

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -H "Authorization: Bearer $TOKEN" "http://audit-db:9000/query?limit=10&action=shell:hostname"
```

### Daily costs

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -H "Authorization: Bearer $TOKEN" "http://audit-db:9000/costs/2026-02-16"
```

## Query Parameters

| Param | Description |
|-------|-------------|
| limit | Max results (default 50) |
| action | Filter by action name (e.g., `web:search`, `shell:hostname`) |
| tool | Filter by tool name (e.g., `web-browser`, `shell-sandbox`) |
| state | Filter by state (`success`, `failed`, `blocked`) |

## Audit Entry Fields

| Field | Description |
|-------|-------------|
| source | `user`, `cron`, `heartbeat`, or `system` |
| action | Tool-prefixed action name (e.g., `shell:hostname`, `email:send_email`) |
| tier | Action's tier classification |
| state | `success`, `failed`, `blocked`, `pending`, `timeout` |
| params | JSON string — sensitive fields are auto-redacted |
| duration_ms | How long the action took |

## Important

- **Automatic logging:** All tool containers log every `/execute` call automatically via middleware. Do NOT manually POST to `/log`.
- Params are automatically sanitized (passwords, tokens, API keys redacted)
- Logs are also forwarded to the Telegram audit channel automatically
- Use the query API to review past actions when Adrian asks
