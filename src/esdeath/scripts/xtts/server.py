"""Minimal XTTS v2 server with OpenAI-compatible /v1/audio/speech endpoint."""

import io
import os
import logging
import torch
import torchaudio
import soundfile as sf
import numpy as np
from pathlib import Path

# torchaudio 2.9 hardcodes torchcodec for load/save, ignoring the backend param.
# torchcodec has ABI incompatibility with torch 2.9+cu128 on Blackwell GPUs.
# Replace torchaudio.load/save with soundfile-based implementations.

def _sf_load(uri, frame_offset=0, num_frames=-1, normalize=True,
             channels_first=True, format=None, buffer_size=4096, backend=None):
    if num_frames == -1:
        data, sr = sf.read(uri, start=frame_offset, dtype="float32", always_2d=True)
    else:
        data, sr = sf.read(uri, start=frame_offset, frames=num_frames,
                           dtype="float32", always_2d=True)
    # data shape: (samples, channels)
    tensor = torch.from_numpy(data)
    if channels_first:
        tensor = tensor.T  # -> (channels, samples)
    return tensor, sr

def _sf_save(uri, src, sample_rate, channels_first=True, format=None,
             encoding=None, bits_per_sample=None, buffer_size=4096, backend=None):
    if channels_first:
        data = src.cpu().numpy().T  # (channels, samples) -> (samples, channels)
    else:
        data = src.cpu().numpy()
    fmt = (format or "WAV").upper()
    sf.write(uri, data, sample_rate, format=fmt)

torchaudio.load = _sf_load
torchaudio.save = _sf_save
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal

from TTS.tts.configs.xtts_config import XttsConfig
from TTS.tts.models.xtts import Xtts
from TTS.utils.manage import ModelManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="XTTS v2 TTS Server")

VOICES_DIR = Path(os.environ.get("VOICES_DIR", "/app/voices"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
LANG = os.environ.get("TTS_LANGUAGE", "cs")
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

model: Xtts = None


class SpeechRequest(BaseModel):
    model: str = "xtts-v2"
    input_: str = Field(..., alias="input", max_length=10000)
    voice: str = "esdeath.wav"
    response_format: Literal["wav", "mp3", "opus"] = "wav"
    speed: float = 1.0
    language: str | None = None


def find_voice(name: str) -> Path:
    for d in [VOICES_DIR, Path("/app/reference_audio")]:
        p = (d / name).resolve()
        if not str(p).startswith(str(d.resolve())):
            raise FileNotFoundError(f"Voice '{name}' not found")
        if p.exists():
            return p
    raise FileNotFoundError(f"Voice '{name}' not found")


@app.on_event("startup")
async def load_model():
    global model
    logger.info("Loading XTTS v2 model (will download on first run)...")

    manager = ModelManager()
    model_path, _, _ = manager.download_model(MODEL_NAME)
    # model_path points to the model file; model dir may be parent or same level
    model_dir = os.path.dirname(model_path)
    # If config.json is not directly in model_dir, check one level up
    config_path = os.path.join(model_dir, "config.json")
    if not os.path.exists(config_path):
        # Try the model subdirectory
        subdir = os.path.join(os.path.expanduser("~"), ".local", "share", "tts",
                              "tts_models--multilingual--multi-dataset--xtts_v2")
        if os.path.exists(os.path.join(subdir, "config.json")):
            model_dir = subdir
            config_path = os.path.join(model_dir, "config.json")
    logger.info(f"Model directory: {model_dir}")

    config = XttsConfig()
    config.load_json(config_path)
    model = Xtts.init_from_config(config)
    model.load_checkpoint(config, checkpoint_dir=model_dir)
    model.to(DEVICE)
    logger.info(f"XTTS v2 loaded on {DEVICE}, default language: {LANG}")


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model not loaded yet")
    return {"status": "ok", "model": "xtts-v2", "device": DEVICE, "language": LANG}


@app.get("/docs")
async def docs_redirect():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/redoc")


@app.post("/v1/audio/speech")
async def speech(request: SpeechRequest):
    if model is None:
        raise HTTPException(503, "Model not loaded")

    try:
        voice_path = find_voice(request.voice)
    except FileNotFoundError:
        raise HTTPException(404, f"Voice file '{request.voice}' not found")

    lang = request.language or LANG
    logger.info(f"Generating speech: lang={lang}, voice={request.voice}, text={request.input_[:80]}...")

    try:
        gpt_cond_latent, speaker_embedding = model.get_conditioning_latents(
            audio_path=[str(voice_path)]
        )

        out = model.inference(
            text=request.input_,
            language=lang,
            gpt_cond_latent=gpt_cond_latent,
            speaker_embedding=speaker_embedding,
            speed=request.speed,
        )

        wav = torch.tensor(out["wav"]).unsqueeze(0)
        buf = io.BytesIO()
        torchaudio.save(buf, wav, 24000, format="wav")
        buf.seek(0)

        logger.info(f"Generated {buf.getbuffer().nbytes} bytes")
        return StreamingResponse(buf, media_type="audio/wav")

    except Exception as e:
        logger.error(f"TTS generation failed: {e}", exc_info=True)
        raise HTTPException(500, "TTS generation failed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)
