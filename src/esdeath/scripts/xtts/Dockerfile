FROM nvidia/cuda:12.8.1-runtime-ubuntu24.04

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV COQUI_TOS_AGREED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev python3-venv git ffmpeg libsndfile1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Install PyTorch 2.9.0+cu128 (proven on RTX 5090)
RUN pip3 install --no-cache-dir --break-system-packages \
    --index-url https://download.pytorch.org/whl/cu128 \
    torch==2.9.0 torchaudio==2.9.0

# Install Coqui TTS with language support
# Pin transformers<5.0 — coqui-tts uses API removed in transformers 5.x
RUN pip3 install --no-cache-dir --break-system-packages \
    "coqui-tts[languages]" "transformers>=4.57,<5.0"

# Patch: remove torchcodec requirement check from TTS/__init__.py
# torchcodec has ABI incompatibility with torch 2.9+cu128 on this platform.
# We use torchaudio for audio I/O instead.
RUN TTS_DIR=$(python3 -c "import importlib.util; print(importlib.util.find_spec('TTS').submodule_search_locations[0])") && \
    sed -i '/is_torch_greater_or_equal.*2\.9/,/raise ImportError.*TORCHCODEC/d' "$TTS_DIR/__init__.py" && \
    echo "Patched $TTS_DIR/__init__.py"

# Install API dependencies + soundfile backend for torchaudio
# (torchcodec is ABI-incompatible with torch 2.9+cu128, so we use soundfile instead)
RUN pip3 install --no-cache-dir --break-system-packages fastapi uvicorn soundfile

# Model is downloaded on first startup into /root/.local/share/tts (persisted via volume)

COPY server.py .

RUN mkdir -p voices reference_audio

EXPOSE 8005

CMD ["python3", "server.py"]
