---
name: web-researcher
description: Browse the web, search, take screenshots, extract content
---

## When to Use

Use when Adrian asks to look something up online, fetch a webpage, take a screenshot, or extract specific content from a URL.

## How to Call

First generate a JWT token, then call the API:

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<unique-id>","action":"<action>","params":{...}}' \
  http://web-browser:9002/execute
```

**Tip:** For complex params, write JSON to a temp file to avoid escaping issues:
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"web-1","action":"search","params":{"query":"your search query"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://web-browser:9002/execute
```

## Actions

| Action | Tier | Description |
|--------|------|-------------|
| search | notice | Search via SearXNG (Google+Bing+Brave+DDG). Returns structured results with title, url, snippet |
| fetch_url | notice | Fetch and extract text from a URL. Auto-detects JSON/text APIs (fast) vs HTML (uses browser) |
| screenshot | notice | Take a screenshot of a webpage |
| extract | notice | Extract specific elements by CSS selector |

## Examples

**Search:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"web-1","action":"search","params":{"query":"typescript best practices 2026"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://web-browser:9002/execute
```

**Fetch URL:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"web-2","action":"fetch_url","params":{"url":"https://example.com/article"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://web-browser:9002/execute
```

**Screenshot:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"web-3","action":"screenshot","params":{"url":"https://example.com"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://web-browser:9002/execute
```

**Extract elements:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"web-4","action":"extract","params":{"url":"https://example.com","selector":"h1, h2, p"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://web-browser:9002/execute
```

## Response Format

- **search**: `{ results: [{title, url, snippet}], count, suggestions, answers }`
- **fetch_url**: `{ title, text (max 10k chars), url }`
- **screenshot**: `{ screenshot_base64, url }`
- **extract**: `{ elements: string[], count, url }`

## Important

- All URLs are validated for SSRF protection — no localhost, private IPs, or internal networks
- Only HTTP and HTTPS protocols allowed
- Pages have a 20-second load timeout
- Text is truncated to 10,000 characters — summarize for Adrian
- screenshot returns base64 PNG — describe what you see rather than dumping raw data
- Audit logging is automatic — do NOT manually call audit-logger
- **ONLY these 4 actions exist:** search, fetch_url, screenshot, extract — do NOT try other action names
