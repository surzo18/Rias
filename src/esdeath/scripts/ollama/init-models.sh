#!/bin/bash
# Pull required models for Esdeath v2 LLM routing
# Run after starting ollama container:
#   docker compose --profile v2 exec ollama bash /scripts/init-models.sh

set -euo pipefail

echo "Pulling Esdeath v2 models..."

echo "[1/3] Pulling Qwen3 8B (primary local model)..."
ollama pull qwen3:8b

echo "[2/3] Pulling EuroLLM 9B (Slovak/European languages)..."
ollama pull eurollm:9b

echo "[3/3] Pulling GLM4 7B (general reasoning fallback)..."
ollama pull glm4:7b

echo ""
echo "All models ready:"
ollama list
