---
name: weather
description: Current weather and 3-day forecast for any location (default: Kysucke Nove Mesto)
---

## When to Use

Use when Adrian asks about weather, temperature, rain, snow, or forecast. Also used by cron jobs (morning brief, evening recap).

## How to Call

```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"<unique-id>","action":"<action>","params":{...}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://weather-tool:9005/execute
```

## Actions

| Action | Tier | Description |
|--------|------|-------------|
| current | safe | Current weather conditions |
| forecast | safe | 3-day forecast |

## Parameters

Both actions accept:
- `location` (optional) — Location name. Defaults to `Kysucke Nove Mesto` if omitted.

## Examples

**Current weather (default location):**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"wx-1","action":"current","params":{}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://weather-tool:9005/execute
```

**Current weather (specific location):**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"wx-2","action":"current","params":{"location":"Bratislava"}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://weather-tool:9005/execute
```

**3-day forecast:**
```bash
TOKEN=$(node /home/node/.openclaw/config/gen-token.js)
cat > /tmp/req.json <<JSON
{"request_id":"wx-3","action":"forecast","params":{}}
JSON
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @/tmp/req.json http://weather-tool:9005/execute
```

## Response Format

**Current:**
```json
{
  "location": "Kysucke+Nove+Mesto",
  "temp_C": 5,
  "feels_like_C": 2,
  "humidity": 78,
  "weather_desc": "Partly cloudy",
  "wind_kmph": 12,
  "precip_mm": 0,
  "visibility_km": 10,
  "pressure_mb": 1015,
  "uv_index": 2,
  "observation_time": "12:00 PM"
}
```

**Forecast:**
```json
{
  "location": "Kysucke+Nove+Mesto",
  "forecast": [
    {
      "date": "2026-02-16",
      "maxtemp_C": 8,
      "mintemp_C": -1,
      "avgtemp_C": 4,
      "weather_desc": "Partly cloudy",
      "chance_of_rain": 20,
      "chance_of_snow": 10,
      "total_snow_cm": 0,
      "sunrise": "07:05 AM",
      "sunset": "05:30 PM"
    }
  ]
}
```

## Important

- Uses wttr.in (free, no API key needed, no rate limit concerns)
- Default location is Kysucke Nove Mesto (Adrian's location)
- Present temperatures in Celsius with feels-like comparison
- Forecast covers today + 2 days ahead
- Audit logging is automatic — do NOT manually call audit-logger
- **ONLY these actions exist:** current, forecast — do NOT try other action names
