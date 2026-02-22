---
name: shell-exec
description: Execute sandboxed commands on Adrian's PC
---

## When to Use

Use when Adrian asks to run a command, check system info, list or manage files.

## How to Call

First generate a JWT token, then call the API:

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<unique-id>","action":"run_command","params":{"command":"<cmd>","args":[<args>]}}' \
  http://shell-sandbox:9001/execute
```

**Tip:** For complex args, write JSON to a temp file to avoid escaping issues:
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"sh-1","action":"run_command","params":{"command":"hostname","args":[]}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://shell-sandbox:9001/execute
```

### Example: Get hostname

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"sh-1","action":"run_command","params":{"command":"hostname","args":[]}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://shell-sandbox:9001/execute
```

### Response

```json
{
  "request_id": "sh-1",
  "status": "success",
  "result": { "stdout": "DESKTOP-ABC123" },
  "metadata": { "duration_ms": 42, "action": "shell:hostname", "tier": "safe" }
}
```

## Commands Available

| Command | Tier | Args | Paths |
|---------|------|------|-------|
| hostname | safe | no | - |
| whoami | safe | no | - |
| systeminfo | notice | no | - |
| dir | notice | yes | /mnt/documents, /mnt/downloads |
| type | notice | yes | /mnt/documents, /mnt/downloads |
| ping | notice | yes | any (max 4 count) |
| copy | dangerous | yes | /mnt/downloads only |
| move | dangerous | yes | /mnt/downloads only |
| del | dangerous | yes | /mnt/downloads only |
| mkdir | dangerous | yes | /mnt/downloads only |
| start | dangerous | yes | notepad, calc, explorer only |

## Important

- ALWAYS check tier before executing
- DANGEROUS commands require approval — tell Adrian what you want to do and wait
- NEVER try commands not in the allowlist
- NEVER construct commands with pipes, redirects, semicolons, or backticks
- NEVER use path traversal (../)
- Audit logging is automatic — do NOT manually call audit-logger
