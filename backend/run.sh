#!/bin/bash
# Load .env if exists
[ -f .env ] && export $(grep -v '^#' .env | xargs)

echo "Starting House Calc API..."
echo "Provider: ${LLM_PROVIDER:-openai}"
echo "Model: ${LLM_MODEL:-gpt-4o-mini}"

uvicorn main:app --reload --host 0.0.0.0 --port 8000
