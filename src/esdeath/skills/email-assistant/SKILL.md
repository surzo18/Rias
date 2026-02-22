---
name: email-assistant
description: Read and send emails via Gmail
---

## When to Use

Use when Adrian asks about emails — checking inbox, reading messages, searching, or sending.

## How to Call

First generate a JWT token, then call the API:

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<unique-id>","action":"<action>","params":{...}}' \
  http://email-tool:9003/execute
```

**Tip:** For complex params, write JSON to a temp file to avoid escaping issues:
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"em-1","action":"list_unread","params":{"account":"primary","max_results":10}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

## Actions

| Action | Tier | Description |
|--------|------|-------------|
| list_unread | notice | List unread emails |
| search | notice | Search emails by query |
| read_email | notice | Read a specific email by ID |
| send_email | dangerous | Send an email |

## Accounts

Three accounts available: `primary`, `work`, `spam`. Default is `primary`.

## Examples

**List unread:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"em-1","action":"list_unread","params":{"account":"primary","max_results":10}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

**Search:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"em-2","action":"search","params":{"account":"work","query":"invoice"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

**Read email:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"em-3","action":"read_email","params":{"account":"primary","message_id":"abc123"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

**Send email (DANGEROUS — needs approval):**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"em-4","action":"send_email","params":{"account":"primary","to":"user@example.com","subject":"Hello","body":"Message text"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

## Important

- send_email is DANGEROUS — always confirm with Adrian before sending
- Always specify which account when Adrian has context about work vs personal
- Never send emails without explicit approval
- Summarize long emails rather than dumping full text
- Audit logging is automatic — do NOT manually call audit-logger
