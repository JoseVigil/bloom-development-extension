#!/usr/bin/env python3
"""Chequeo de salud de los dos arms de Alfred, para uso manual.

No es un test automatizado — es el chequeo rápido antes de probar
alfred.chat de punta a punta: ¿Ollama está corriendo y tiene el modelo?,
¿hay una GEMINI_API_KEY exportada y válida?

Migrado desde agentic-harness/scripts/check_providers.py (2026-08-09).

Uso:
    cd installer/alfred
    PYTHONPATH=src python3 scripts/check_health.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from alfred.providers.gemini_provider import GeminiTextProvider
from alfred.providers.ollama_provider import OllamaEmbeddingProvider


def main() -> int:
    ollama = OllamaEmbeddingProvider.from_default_nucleus_path()
    ollama_health = ollama.health()
    print(f"[ollama]  status={ollama_health.status}")
    for key, value in ollama_health.detail.items():
        if key == "installed_models":
            print(f"          installed_models={value}")
        elif key != "error":
            print(f"          {key}={value}")
    if ollama_health.status == "error":
        print(f"          error: {ollama_health.detail.get('error')}")
    if ollama_health.status == "model_missing":
        print("          -> ollama pull nomic-embed-text")

    print()

    gemini = GeminiTextProvider()
    gemini_health = gemini.health()
    print(f"[gemini]  status={gemini_health.status}")
    if gemini_health.status != "ok":
        print(f"          detail={gemini_health.detail}")
        print(
            "          -> export GEMINI_API_KEY=... (chequeá 'brain gemini "
            "keys-list' por si ya hay una clave real cargada)"
        )
    else:
        print(f"          model={gemini_health.detail.get('model')}")

    return 0 if ollama_health.status == "ok" and gemini_health.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
