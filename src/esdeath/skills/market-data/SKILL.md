---
name: market-data
description: Stock market quotes, history, news, watchlist, and price alerts
---

## When to Use

Use when Adrian asks about stock prices, market news, his watchlist, or wants to set price alerts.

## How to Call

First generate a JWT token, then call the API:

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id":"<unique-id>","action":"<action>","params":{...}}' \
  http://market-tool:9004/execute
```

**Tip:** For complex params, write JSON to a temp file to avoid escaping issues:
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-1","action":"quote","params":{"symbol":"AAPL"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

## Actions

| Action | Tier | Description |
|--------|------|-------------|
| quote | notice | Get current price for a symbol |
| history | notice | Get daily price history |
| news | notice | Get news sentiment for tickers |
| watchlist | notice | View/add/remove watchlist symbols |
| alert_set | notice | Set a price alert |
| alert_list | notice | List active price alerts |

## Examples

**Get quote:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-1","action":"quote","params":{"symbol":"AAPL"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

**Price history:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-2","action":"history","params":{"symbol":"TSLA","outputsize":"compact"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

**News:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-3","action":"news","params":{"tickers":"AAPL,MSFT"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

**Watchlist operations:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-4","action":"watchlist","params":{"operation":"add","symbol":"NVDA"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

**Set alert:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"mkt-5","action":"alert_set","params":{"symbol":"AAPL","condition":"above","price":200}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://market-tool:9004/execute
```

## Important

- Alpha Vantage free tier: 5 API calls per minute — space out requests
- Watchlist and alerts are stored locally, no API calls needed
- Present prices formatted with currency symbol ($) and 2 decimal places
- For history, summarize trends rather than dumping raw data
- News sentiment scores: >0.35 bullish, <-0.35 bearish, otherwise neutral
- Audit logging is automatic — do NOT manually call audit-logger
- **ONLY these actions exist:** quote, history, news, watchlist, alert_set, alert_list — do NOT try other action names
- `quote` returns **stock prices only** (not crypto) — for Bitcoin use the web-researcher skill to search
