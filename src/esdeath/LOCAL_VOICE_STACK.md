# Local Voice Stack (RTX 5090, Docker, Security-First)

This setup keeps Telegram + LLM on your existing OpenClaw gateway, while routing TTS to a local GPU service.

## Architecture

- `openclaw-gateway` talks to `OPENAI_BASE_URL=http://openai-router:8080/v1`
- `openai-router` forwards:
  - `/v1/audio/speech` -> `kokoro-tts` (local)
  - all other `/v1/*` -> `https://api.openai.com` (cloud)
- `kokoro-tts` runs fully inside Docker with NVIDIA GPU

No TTS/router ports are exposed to host or internet.

## Security Controls Applied

- No published ports on `kokoro-tts` and `openai-router`
- `openai-router` is read-only with `no-new-privileges`, `tmpfs`
- `kokoro-tts` has `cap_drop: ALL`, `no-new-privileges`, bounded tmpfs
- Telegram remains allowlist-only in `openclaw-data/config/openclaw.json`

## Start / Restart

```bash
docker compose pull kokoro-tts openai-router
docker compose up -d --force-recreate
```

## Verify

```bash
docker compose ps
docker compose logs --tail=120 openai-router
docker compose logs --tail=120 kokoro-tts
```

Quick checks from gateway container:

```bash
docker compose exec openclaw-gateway sh -lc "wget -qO- http://openai-router:8080/health"
docker compose exec openclaw-gateway sh -lc "wget -S -O /dev/null http://openai-router:8080/v1/models"
```

## Voice Selection

Edit `openclaw-data/config/openclaw.json`:

- `messages.tts.openai.model`: `kokoro`
- `messages.tts.openai.voice`: example `af_sky` (current)

Then apply:

```bash
docker compose up -d --force-recreate
```

## Notes

- If your Docker/NVIDIA runtime is not ready, `kokoro-tts` may fail to start.
- If needed, test with CPU by removing the GPU reservation block from `docker-compose.yml`.
