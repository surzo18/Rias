# Telegram Voice Notes Only

This setup enables Telegram voice notes for OpenClaw and blocks everyone except an explicit allowlist.

## What Is Configured

- Gateway and CLI both use a pinned config file: `openclaw-data/config/openclaw.json`
- The whole config directory is mounted (`./openclaw-data/config -> /home/node/.openclaw`) to avoid Windows file-lock issues during atomic config writes
- Telegram DM access policy is allowlist-only (`dmPolicy: "allowlist"`)
- Group usage is disabled (`groupPolicy: "disabled"`)
- Telegram config writes are disabled (`configWrites: false`)
- TTS is enabled for inbound voice interactions (`messages.tts.auto: "inbound"`)

## Required Edits

1. Update `openclaw-data/config/openclaw.json`:
   - `channels.telegram.allowFrom` must contain your Telegram identity in `tg:<id>` format.
2. Update `.env`:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - `OPENCLAW_GATEWAY_TOKEN`

## Change Voice

Edit `openclaw-data/config/openclaw.json`:

- `messages.tts.openai.voice` (example: `alloy`)
- Optional: `messages.tts.openai.model`

## Start

```powershell
docker compose up -d
```

If logs still show doctor pending changes:

```powershell
docker compose run --rm --profile cli openclaw-cli doctor --fix
docker compose up -d --force-recreate
```

## Quick Validation

1. Send a text message from a non-allowlisted account. The bot should ignore it.
2. Send a voice note from the allowlisted account. The bot should answer with a voice note.
