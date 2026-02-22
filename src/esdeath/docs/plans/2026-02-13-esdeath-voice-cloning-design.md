# Esdeath Voice Cloning Design

## Goal

Add voice cloning to the esdeath Telegram bot so it responds with Esdeath's voice (from Akame ga Kill anime). Replace Kokoro TTS with Fish Speech S1-mini as the primary TTS engine while keeping Kokoro as a config-switchable fallback.

## Requirements

- **Voice cloning**: Clone Esdeath's voice from 15-30s of anime audio samples
- **Languages**: Slovak (primary), English (secondary) - cross-lingual cloning
- **Multi-voice**: Architecture supports adding more voices later (one WAV file per voice)
- **GPU**: RTX 5090 (32GB VRAM) - local inference only
- **Integration**: Drop-in replacement via existing nginx router (`/v1/audio/speech`)
- **Fallback**: Kokoro TTS remains available via config switch

## Decision: Why Fish Speech over Kokoro

Kokoro has no voice cloning capability. It only offers preset voice styles (af_sky, af_heart, etc.) with no way to add custom voices from audio samples. Fish Speech S1-mini supports zero-shot voice cloning from 10-30s of reference audio and is #1 on TTS-Arena2 (2026).

## Decision: Why Fish Speech over XTTS-v2/AllTalk

XTTS-v2 (Coqui TTS) was the 2024 standard but Coqui shut down in December 2025. Community-maintained only, no new model improvements. Fish Speech is actively developed by a funded company, has better quality benchmarks, and its LLM-based architecture (no phoneme dependency) gives it the best chance of handling unseen languages like Slovak.

## Architecture

```
Telegram User
    |
openclaw-gateway:18789
    |
openai-router (nginx):8080
    |-- /v1/chat/completions --> api.openai.com (unchanged)
    |-- /v1/audio/speech     --> fish-speech:8080 (NEW, was kokoro-tts:8880)
    |                        --> kokoro-tts:8880  (fallback via TTS_BACKEND env)
    |-- /v1/*                --> api.openai.com (unchanged)
    |
fish-speech (GPU container)
    |-- OpenAI-compatible API wrapper
    |-- Voice profiles from ./voices/ directory
    |-- Zero-shot cloning per request
```

### TTS Backend Switching

Nginx routes `/v1/audio/speech` based on `TTS_BACKEND` environment variable:
- `TTS_BACKEND=fish-speech` (default) -> fish-speech:8080
- `TTS_BACKEND=kokoro` -> kokoro-tts:8880

Switch requires: change `.env` + `docker compose restart openai-router`.

Kokoro moves to Docker Compose profile `kokoro` so it doesn't consume GPU resources when not active.

### Docker Services (after change)

| Service | Image | GPU | Port | Profile |
|---------|-------|-----|------|---------|
| openclaw-gateway | openclaw:local | No | 18789, 18790 | default |
| openai-router | nginx:1.27-alpine | No | internal | default |
| fish-speech | fishaudio/fish-speech:latest | Yes | internal | default |
| kokoro-tts | ghcr.io/remsky/kokoro-fastapi-gpu:v0.2.2 | Yes | internal | kokoro |

## Voice Samples

### Source

Esdeath from Akame ga Kill:
- Japanese VA: Masami Takasaki
- English dub VA: Jessica Boone

### Extraction Process

1. Find solo dialogue scenes (monologues, no BGM/SFX)
2. Extract audio from video with ffmpeg
3. Separate vocals from background using Demucs (Meta AI)
4. Trim to clean segments, concatenate to 15-30s WAV
5. Save as `voices/esdeath.wav`

### Quality Requirements

- 24kHz+ sample rate, WAV format
- Clean vocals without music, SFX, or other characters
- Consistent volume and tone
- Varied sentences (not repetitive)

## Voice Profiles

```
voices/
  esdeath.wav       # default voice (Esdeath from Akame ga Kill)
  # future voices:
  akame.wav
  mine.wav
  ...
```

OpenAI API mapping: `voice` parameter -> filename in `voices/` directory.

openclaw.json config:
```json
{
  "messages": {
    "tts": {
      "provider": "openai",
      "openai": {
        "model": "fish-speech",
        "voice": "esdeath"
      }
    }
  }
}
```

## Fallback Plan (Approach B)

If Fish Speech cannot produce acceptable Slovak pronunciation:

1. Add RVC (Retrieval-based Voice Conversion) as additional Docker service
2. Fish Speech generates Slovak speech in a base voice
3. RVC converts the audio to Esdeath's voice timbre
4. Pipeline: `text -> Fish Speech (SK speech) -> RVC (Esdeath voice) -> Telegram`

This decouples language (Fish Speech handles Slovak pronunciation) from voice identity (RVC handles Esdeath's timbre).

## Files Changed

| File | Change |
|------|--------|
| `docker-compose.yml` | Add fish-speech service, move kokoro to profile |
| `openclaw-data/router/nginx.conf` | TTS_BACKEND routing logic |
| `openclaw-data/config/openclaw.json` | Update model/voice params |
| `.env.example` | Add TTS_BACKEND variable |
| `.env` | Set TTS_BACKEND=fish-speech |
| `voices/` | New directory with reference audio |
| `.gitignore` | Add voices/*.wav (large files) |
| `CLAUDE.md` | Update with new TTS info |

## VRAM Budget (RTX 5090, 32GB)

| Component | VRAM |
|-----------|------|
| Fish Speech S1-mini | 4-12GB |
| Kokoro (if active) | <1GB |
| Total | 4-12GB |
| Remaining for other tasks | 20-28GB |
