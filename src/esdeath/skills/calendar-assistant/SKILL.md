---
name: calendar-assistant
description: Manage Google Calendar events
---

## When to Use

Use when Adrian asks about calendar events, schedules, or wants to create events.

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

## Actions

| Action | Tier | Description |
|--------|------|-------------|
| calendar_today | notice | List today's events |
| calendar_week | notice | List this week's events |
| calendar_create | dangerous | Create a new event |

## Examples

**Today's events:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"cal-1","action":"calendar_today","params":{"account":"primary"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

**This week:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"cal-2","action":"calendar_week","params":{"account":"work"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

**Create event (DANGEROUS — needs approval):**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"cal-3","action":"calendar_create","params":{"account":"primary","title":"Meeting","start":"2026-02-16T10:00:00","end":"2026-02-16T11:00:00","description":"Team standup"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://email-tool:9003/execute
```

## Important

- calendar_create is DANGEROUS — always confirm details with Adrian first
- Format times clearly when presenting events to Adrian
- Use the correct account (work vs personal) based on context
- Audit logging is automatic — do NOT manually call audit-logger
