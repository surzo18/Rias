# Esdeath Voice Cloning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Kokoro TTS with Fish Speech S1-mini for voice cloning, add a TTS adapter for OpenAI API translation, and keep Kokoro as a config-switchable fallback.

**Architecture:** OpenClaw gateway sends OpenAI-format `/v1/audio/speech` requests. Nginx routes to a lightweight Node.js TTS adapter that translates OpenAI format to Fish Speech's `/v1/tts` format and forwards to the Fish Speech GPU container. Switching to Kokoro requires changing one env variable and restarting the router.

**Tech Stack:** Fish Speech S1-mini (GPU TTS), Node.js 22 (TTS adapter, zero deps), nginx 1.27 (router), Docker Compose

**Design doc:** `docs/plans/2026-02-13-esdeath-voice-cloning-design.md`

---

## Key Context

- **Project location:** `D:\REPOS\esdeath`
- **Docker-only:** NEVER run services on host. All commands via `docker compose`.
- **Current TTS:** Kokoro at `kokoro-tts:8880`, accepts OpenAI format natively.
- **New TTS:** Fish Speech at `fish-speech:8080`, uses `/v1/tts` (NOT OpenAI format).
- **Problem:** Fish Speech's API is `/v1/tts` with `{text, reference_id, format}`, NOT `/v1/audio/speech` with `{input, voice, response_format}`. A TTS adapter translates between the two.
- **Voice samples:** Fish Speech uses `references/<voice_id>/` folders with `.wav` audio + `.lab` transcript files.
- **Switching:** `TTS_UPSTREAM` env variable controls nginx routing. `tts-adapter:3100` (Fish Speech) or `kokoro-tts:8880` (Kokoro).

---

### Task 1: Create TTS adapter service

The TTS adapter is a zero-dependency Node.js HTTP server (~40 lines) that receives OpenAI-format TTS requests and translates them to Fish Speech format.

**Files:**
- Create: `scripts/tts-adapter/server.js`
- Create: `scripts/tts-adapter/Dockerfile`

**Step 1: Create the adapter directory**

```bash
mkdir -p D:/REPOS/esdeath/scripts/tts-adapter
```

**Step 2: Write server.js**

Create `scripts/tts-adapter/server.js`:

```javascript
const http = require('http');

const FISH_HOST = process.env.FISH_SPEECH_HOST || 'fish-speech';
const FISH_PORT = parseInt(process.env.FISH_SPEECH_PORT || '8080', 10);
const PORT = parseInt(process.env.PORT || '3100', 10);

const FORMAT_MAP = { opus: 'wav', aac: 'wav', flac: 'wav' };

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }

  if (req.method !== 'POST' || req.url !== '/v1/audio/speech') {
    res.writeHead(404);
    return res.end('not found');
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let openai;
    try {
      openai = JSON.parse(body);
    } catch {
      res.writeHead(400);
      return res.end('invalid json');
    }

    const fmt = FORMAT_MAP[openai.response_format] || openai.response_format || 'mp3';
    const fishBody = JSON.stringify({
      text: openai.input || '',
      reference_id: openai.voice || null,
      format: fmt,
      normalize: true,
    });

    const fishReq = http.request(
      {
        hostname: FISH_HOST,
        port: FISH_PORT,
        path: '/v1/tts',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(fishBody),
        },
      },
      (fishRes) => {
        res.writeHead(fishRes.statusCode, {
          'Content-Type': fishRes.headers['content-type'] || 'audio/mpeg',
        });
        fishRes.pipe(res);
      }
    );

    fishReq.on('error', () => {
      res.writeHead(502);
      res.end('fish speech unavailable');
    });

    fishReq.end(fishBody);
  });
});

server.listen(PORT, '0.0.0.0');
```

**Step 3: Write Dockerfile**

Create `scripts/tts-adapter/Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server.js .
USER 1000:1000
EXPOSE 3100
CMD ["node", "server.js"]
```

**Step 4: Verify the adapter builds**

```bash
cd D:/REPOS/esdeath && docker build -t tts-adapter:local scripts/tts-adapter/
```

Expected: Build succeeds, image created.

**Step 5: Commit**

```bash
git add scripts/tts-adapter/
git commit -m "feat: add TTS adapter for OpenAI-to-Fish-Speech translation"
```

---

### Task 2: Create voices directory and update .gitignore

**Files:**
- Create: `voices/.gitkeep`
- Modify: `.gitignore`

**Step 1: Create voices directory**

```bash
mkdir -p D:/REPOS/esdeath/voices
touch D:/REPOS/esdeath/voices/.gitkeep
```

**Step 2: Update .gitignore**

Add these lines at the end of `.gitignore`:

```gitignore

# Voice reference audio (large files, download separately)
voices/*.wav
voices/*.mp3
voices/*.flac
voices/*/
!voices/.gitkeep
```

The `voices/*/` pattern ignores Fish Speech reference folders (each containing audio + transcript). `.gitkeep` is preserved.

**Step 3: Commit**

```bash
git add voices/.gitkeep .gitignore
git commit -m "feat: add voices directory for TTS reference audio"
```

---

### Task 3: Update docker-compose.yml

Add Fish Speech + TTS adapter services, move Kokoro to profile.

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add fish-speech service**

Add after the `openai-router` service block (before `kokoro-tts`):

```yaml
  fish-speech:
    image: fishaudio/fish-speech:server-cuda
    container_name: clawdbot-fish-speech
    restart: unless-stopped
    environment:
      COMPILE: "0"
    volumes:
      - fish_speech_checkpoints:/app/checkpoints
      - ./voices:/app/references:ro
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    tmpfs:
      - /tmp:noexec,nosuid,size=200m
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/v1/health"]
      interval: 30s
      timeout: 10s
      start_period: 120s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

Note: `start_period: 120s` because Fish Speech needs time to load models on first start.

**Step 2: Add tts-adapter service**

Add after `fish-speech`:

```yaml
  tts-adapter:
    build: ./scripts/tts-adapter
    image: tts-adapter:local
    container_name: clawdbot-tts-adapter
    restart: unless-stopped
    user: "1000:1000"
    environment:
      FISH_SPEECH_HOST: fish-speech
      FISH_SPEECH_PORT: "8080"
      PORT: "3100"
    depends_on:
      fish-speech:
        condition: service_healthy
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=16m
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

**Step 3: Move kokoro-tts to profile**

Add `profiles: ["kokoro"]` to the `kokoro-tts` service:

```yaml
  kokoro-tts:
    image: ghcr.io/remsky/kokoro-fastapi-gpu:v0.2.2
    container_name: clawdbot-kokoro-tts
    restart: unless-stopped
    profiles:
      - kokoro
    # ... rest unchanged
```

**Step 4: Update openclaw-gateway depends_on**

Change the gateway's `depends_on` from `kokoro-tts` to `tts-adapter`:

```yaml
  openclaw-gateway:
    # ...
    depends_on:
      - openai-router
      - tts-adapter
```

**Step 5: Update openai-router depends_on and add env**

Change `depends_on` from `kokoro-tts` to `tts-adapter`, and add the `TTS_UPSTREAM` env variable. Also use a template for nginx.conf:

```yaml
  openai-router:
    image: nginx:1.27-alpine
    container_name: clawdbot-openai-router
    environment:
      TTS_UPSTREAM: ${TTS_UPSTREAM:-tts-adapter:3100}
    read_only: true
    tmpfs:
      - /var/cache/nginx:noexec,nosuid,size=32m
      - /var/run:noexec,nosuid,size=8m
      - /tmp:noexec,nosuid,size=32m
    security_opt:
      - no-new-privileges:true
    restart: unless-stopped
    volumes:
      - ./openclaw-data/router/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro
      - ./openclaw-data/router/nginx-main.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      tts-adapter:
        condition: service_healthy
```

**Step 6: Add fish_speech_checkpoints volume**

In the `volumes:` section at the bottom:

```yaml
volumes:
  openclaw_home:
    external: true
    name: clawdbot_home
  kokoro_models:
  fish_speech_checkpoints:
```

**Step 7: Verify compose config is valid**

```bash
cd D:/REPOS/esdeath && docker compose config --quiet
```

Expected: No errors. If errors appear, fix the YAML syntax.

**Step 8: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add fish-speech and tts-adapter services, move kokoro to profile"
```

---

### Task 4: Update nginx configuration

Split nginx config into a main config and a template that uses `TTS_UPSTREAM` env variable. The official nginx Docker image processes `*.template` files in `/etc/nginx/templates/` with `envsubst` automatically.

**Files:**
- Create: `openclaw-data/router/nginx-main.conf`
- Create: `openclaw-data/router/nginx.conf.template`
- Keep: `openclaw-data/router/nginx.conf` (unchanged, as reference)

**Step 1: Create nginx-main.conf**

This is the top-level nginx config (worker settings only):

```nginx
worker_processes  1;

events {
  worker_connections  1024;
}

http {
  server_tokens off;
  client_max_body_size 25m;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  include /etc/nginx/conf.d/*.conf;
}
```

**Step 2: Create nginx.conf.template**

The template uses `${TTS_UPSTREAM}` which `envsubst` replaces at container startup:

```nginx
server {
  listen 8080;

  location = /health {
    return 200 "ok\n";
    add_header Content-Type text/plain;
  }

  # Route TTS to configurable backend.
  # Fish Speech (via tts-adapter): TTS_UPSTREAM=tts-adapter:3100
  # Kokoro (direct):               TTS_UPSTREAM=kokoro-tts:8880
  location = /v1/audio/speech {
    proxy_pass http://${TTS_UPSTREAM}/v1/audio/speech;
    proxy_set_header Authorization "";
    proxy_set_header Connection "";
    proxy_request_buffering on;
    proxy_buffering off;
  }

  # Route everything else to OpenAI API.
  location /v1/ {
    proxy_pass https://api.openai.com;
    proxy_ssl_server_name on;
    proxy_set_header Host api.openai.com;
    proxy_set_header Connection "";
    proxy_request_buffering on;
    proxy_buffering off;
  }
}
```

**Step 3: Verify nginx config syntax**

```bash
docker run --rm \
  -e TTS_UPSTREAM=tts-adapter:3100 \
  -v "D:/REPOS/esdeath/openclaw-data/router/nginx-main.conf:/etc/nginx/nginx.conf:ro" \
  -v "D:/REPOS/esdeath/openclaw-data/router/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro" \
  nginx:1.27-alpine nginx -t
```

Expected: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

**Step 4: Commit**

```bash
git add openclaw-data/router/nginx-main.conf openclaw-data/router/nginx.conf.template
git commit -m "feat: add templated nginx config with TTS_UPSTREAM switching"
```

---

### Task 5: Update environment files

**Files:**
- Modify: `.env.example`
- Modify: `.env`

**Step 1: Update .env.example**

Replace the comment about kokoro-tts routing and add TTS_UPSTREAM:

```
# TTS Backend
# Fish Speech (voice cloning, default):
TTS_UPSTREAM=tts-adapter:3100
# Kokoro (preset voices, fallback):
# TTS_UPSTREAM=kokoro-tts:8880
```

Also update the existing comment:

```
# Gateway uses an internal router:
# - /v1/audio/speech -> TTS backend (Fish Speech or Kokoro via TTS_UPSTREAM)
# - all other /v1/* -> OpenAI API
```

**Step 2: Update .env**

Add `TTS_UPSTREAM=tts-adapter:3100` to the existing `.env` file.

**Step 3: Commit**

```bash
git add .env.example
git commit -m "feat: add TTS_UPSTREAM config for backend switching"
```

Note: `.env` is gitignored, do not commit it.

---

### Task 6: Verify Fish Speech and TTS adapter start

**Step 1: Build and start the new services**

```bash
cd D:/REPOS/esdeath && docker compose up -d --build
```

**Step 2: Wait for Fish Speech to become healthy**

```bash
docker compose ps
```

Expected: `fish-speech` shows `healthy` (may take 1-2 minutes on first start for model loading).

**Step 3: Check Fish Speech health directly**

```bash
docker exec clawdbot-fish-speech curl -s http://localhost:8080/v1/health
```

Expected: `{"status": "ok"}`

**Step 4: Check TTS adapter health**

```bash
docker exec clawdbot-tts-adapter node -e "fetch('http://127.0.0.1:3100/health').then(r=>r.text()).then(t=>console.log(t))"
```

Expected: `ok`

**Step 5: Test TTS adapter with a simple request (no voice cloning)**

```bash
docker exec clawdbot-gateway node -e "
fetch('http://openai-router:8080/v1/audio/speech', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({model:'tts-1', input:'Hello world, this is a test.', voice:'alloy', response_format:'mp3'})
}).then(r => {
  console.log('Status:', r.status);
  console.log('Content-Type:', r.headers.get('content-type'));
  return r.arrayBuffer();
}).then(buf => {
  console.log('Audio size:', buf.byteLength, 'bytes');
}).catch(e => console.error('Error:', e.message));
"
```

Expected: Status 200, Content-Type contains audio, Audio size > 0 bytes. The `voice: 'alloy'` will be ignored since there's no reference for it — Fish Speech will use its default voice.

**Step 6: Check logs for any errors**

```bash
docker logs clawdbot-fish-speech --tail 20
docker logs clawdbot-tts-adapter --tail 20
docker logs clawdbot-openai-router --tail 20
```

Expected: No errors. Fish Speech should show model loaded.

---

### Task 7: Prepare Esdeath voice samples

This task requires manual work — extracting clean voice samples from the anime.

**Tools needed (on host or in a container):**
- `ffmpeg` for audio extraction
- `demucs` (Meta AI) for vocal separation (optional but recommended)

**Step 1: Find suitable Esdeath scenes**

Look for scenes in Akame ga Kill where Esdeath speaks solo without background music or sound effects. Good candidates:
- Episode 10: Esdeath's monologue about love
- Episode 14: Esdeath speaking to Tatsumi in private
- Episode 24: Final battle dialogue

Use Japanese audio track (Masami Takasaki) for best voice cloning quality.

**Step 2: Extract audio from video**

```bash
# Extract audio track from a clip
ffmpeg -i esdeath_clip.mkv -vn -acodec pcm_s16le -ar 44100 -ac 1 esdeath_raw.wav
```

**Step 3: Separate vocals (optional but recommended)**

If the audio has background music or effects, use Demucs to isolate vocals:

```bash
# Install demucs (Python, runs on GPU)
pip install demucs
# Separate vocals
demucs --two-stems=vocals esdeath_raw.wav -o output/
# Result: output/htdemucs/esdeath_raw/vocals.wav
```

**Step 4: Trim and clean**

Use ffmpeg or Audacity to:
- Remove silence longer than 0.5s
- Trim to 15-30 seconds of clean dialogue
- Normalize volume
- Ensure 24kHz+ sample rate, mono, WAV format

```bash
# Normalize and convert to 44.1kHz mono WAV
ffmpeg -i vocals.wav -af "loudnorm,silenceremove=1:0:-40dB" -ar 44100 -ac 1 esdeath_clean.wav
# Trim to 30 seconds
ffmpeg -i esdeath_clean.wav -t 30 esdeath_final.wav
```

**Step 5: Create Fish Speech reference folder**

```bash
mkdir -p D:/REPOS/esdeath/voices/esdeath/
cp esdeath_final.wav D:/REPOS/esdeath/voices/esdeath/sample.wav
```

**Step 6: Create transcript file**

Create `voices/esdeath/sample.lab` with the Japanese transcript of what Esdeath says in the audio clip. This helps Fish Speech understand the voice characteristics:

```
(Japanese transcript of the reference audio, romanized or in kanji)
```

If using English dub instead, write the English transcript.

**Step 7: Verify files are in place**

```bash
ls -la D:/REPOS/esdeath/voices/esdeath/
```

Expected: `sample.wav` (15-30 seconds, ~1-2MB) and `sample.lab` (text file with transcript).

---

### Task 8: Test voice cloning

**Step 1: Restart Fish Speech to pick up new references**

```bash
cd D:/REPOS/esdeath && docker compose restart fish-speech
```

Wait for healthy:

```bash
docker compose ps
```

**Step 2: List available references**

```bash
docker exec clawdbot-fish-speech curl -s http://localhost:8080/v1/references/list
```

Expected: Response includes `"esdeath"` in the list.

**Step 3: Test TTS with Esdeath voice via the full pipeline**

```bash
docker exec clawdbot-gateway node -e "
const fs = require('fs');
fetch('http://openai-router:8080/v1/audio/speech', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model: 'tts-1',
    input: 'Hello, I am Esdeath. The strong survive and the weak die.',
    voice: 'esdeath',
    response_format: 'mp3'
  })
}).then(r => {
  console.log('Status:', r.status);
  return r.arrayBuffer();
}).then(buf => {
  console.log('Audio size:', buf.byteLength, 'bytes');
  fs.writeFileSync('/tmp/esdeath_test.mp3', Buffer.from(buf));
  console.log('Saved to /tmp/esdeath_test.mp3');
}).catch(e => console.error('Error:', e.message));
"
```

**Step 4: Copy test audio to host and listen**

```bash
docker cp clawdbot-gateway:/tmp/esdeath_test.mp3 D:/REPOS/esdeath/esdeath_test.mp3
```

Listen to `esdeath_test.mp3` and verify it sounds like Esdeath.

**Step 5: Test Slovak text**

```bash
docker exec clawdbot-gateway node -e "
const fs = require('fs');
fetch('http://openai-router:8080/v1/audio/speech', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model: 'tts-1',
    input: 'Ahoj, som Esdeath. Silni prežijú a slabí zomrú.',
    voice: 'esdeath',
    response_format: 'mp3'
  })
}).then(r => r.arrayBuffer()).then(buf => {
  fs.writeFileSync('/tmp/esdeath_sk.mp3', Buffer.from(buf));
  console.log('Slovak test saved, size:', buf.byteLength);
}).catch(e => console.error(e.message));
"
```

```bash
docker cp clawdbot-gateway:/tmp/esdeath_sk.mp3 D:/REPOS/esdeath/esdeath_sk.mp3
```

Listen and evaluate Slovak pronunciation quality. If unacceptable, proceed to Approach B (RVC post-processing) — see design doc.

**Step 6: Clean up test files**

```bash
rm D:/REPOS/esdeath/esdeath_test.mp3 D:/REPOS/esdeath/esdeath_sk.mp3
```

---

### Task 9: Update openclaw.json

**Files:**
- Modify: `openclaw-data/config/openclaw.json`

**Step 1: Update TTS config**

Change the `messages.tts.openai` section:

```json
"openai": {
  "model": "fish-speech",
  "voice": "esdeath"
}
```

Was:
```json
"openai": {
  "model": "kokoro",
  "voice": "af_sky"
}
```

**Step 2: Restart gateway to pick up config change**

```bash
cd D:/REPOS/esdeath && docker compose restart openclaw-gateway
```

**Step 3: Verify gateway starts cleanly**

```bash
docker logs clawdbot-gateway --tail 10
```

Expected: No errors, gateway healthy.

Note: `openclaw-data/` is gitignored — this change is not committed.

---

### Task 10: End-to-end test via Telegram

**Step 1: Send a text message to the bot on Telegram**

Send any message to @EsDeath_AI_BOT. The bot should:
1. Respond with text
2. Send a voice message/audio file with Esdeath's voice

**Step 2: Send a voice note to the bot**

Record a voice note and send it. The bot should:
1. Process the voice note
2. Respond with text
3. Send a voice response in Esdeath's voice

**Step 3: Verify voice quality**

Listen to the bot's voice responses and evaluate:
- Does it sound like Esdeath? (voice timbre)
- Is the Slovak pronunciation acceptable?
- Is the latency acceptable? (<3 seconds)

If voice cloning quality is poor, consider:
- Using a longer/cleaner reference audio
- Trying English text instead of Slovak
- Proceeding to Approach B (RVC pipeline)

---

### Task 11: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `D:\REPOS\CLAUDE.md` (root routing table)
- Modify: `C:\Users\adria\.claude\projects\D--REPOS\memory\MEMORY.md`

**Step 1: Update esdeath CLAUDE.md**

Update the project overview and architecture sections to reflect Fish Speech, tts-adapter, and TTS_UPSTREAM switching. Specifically:

- Replace "kokoro-tts" references with "fish-speech + tts-adapter" as default
- Add Kokoro as optional profile
- Document TTS_UPSTREAM switching
- Add voice sample management section

**Step 2: Update root CLAUDE.md**

In the esdeath row of the projects table, add "(Fish Speech TTS)" to the purpose.

**Step 3: Update MEMORY.md**

Update the Docker Port Mapping table. No new external ports, but note the internal services changed.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Fish Speech TTS architecture"
```

---

### Task 12: Final commit and cleanup

**Step 1: Verify everything is running**

```bash
cd D:/REPOS/esdeath && docker compose ps
```

Expected: All services healthy (openclaw-gateway, openai-router, fish-speech, tts-adapter).

**Step 2: Check for uncommitted changes**

```bash
git status
```

**Step 3: Remove any temporary files**

```bash
rm -f D:/REPOS/esdeath/node_modules/ D:/REPOS/esdeath/package-lock.json
```

(These were created by earlier npm install during PDF extraction — clean up.)

**Step 4: Final commit if needed**

```bash
git add -A
git status
# Review what's staged, then:
git commit -m "chore: clean up temporary files"
```

---

## Switching Between TTS Backends

### Switch to Kokoro (fallback):

```bash
# 1. Edit .env: set TTS_UPSTREAM=kokoro-tts:8880
# 2. Start Kokoro
docker compose --profile kokoro up -d kokoro-tts
# 3. Restart router to pick up new upstream
docker compose restart openai-router
# 4. (Optional) Stop Fish Speech to free GPU
docker compose stop fish-speech tts-adapter
```

### Switch back to Fish Speech:

```bash
# 1. Edit .env: set TTS_UPSTREAM=tts-adapter:3100
# 2. Start Fish Speech stack
docker compose up -d fish-speech tts-adapter
# 3. Restart router
docker compose restart openai-router
# 4. (Optional) Stop Kokoro
docker compose --profile kokoro stop kokoro-tts
```

---

## Adding New Voices

To add a new voice (e.g., Akame):

1. Prepare 15-30s clean audio: `voices/akame/sample.wav`
2. Create transcript: `voices/akame/sample.lab`
3. Restart Fish Speech: `docker compose restart fish-speech`
4. Update `openclaw.json`: change `"voice": "akame"`
5. Restart gateway: `docker compose restart openclaw-gateway`
