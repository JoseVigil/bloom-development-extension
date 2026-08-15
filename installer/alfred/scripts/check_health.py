#!/usr/bin/env python3
"""Chequeo de salud de los arms de Alfred, para uso manual.

No es un test automatizado — es el chequeo rápido antes de probar
alfred.chat de punta a punta. Ollama (embeddings + texto) es el motor
default; Gemini es opt-in, se chequea igual acá para no descubrir recién
en medio de una conversación que la key no está configurada.

Migrado desde agentic-harness/scripts/check_providers.py (2026-08-09).
Chequeo de OllamaTextProvider agregado el mismo día, junto con el arm.
Refactorizado para reusar alfred.health.collect_health() (2026-08-14),
que ahora comparte instanciación de providers con server.py — antes cada
consumidor armaba su propia lista de providers por separado.

Uso:
    cd installer/alfred
    PYTHONPATH=src python3 scripts/check_health.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from alfred.health import collect_health


def _print_health(label: str, health, missing_hint: str) -> None:
    print(f"[{label}]  status={health.status}")
    for key, value in health.detail.items():
        if key == "installed_models":
            print(f"          installed_models={value}")
        elif key != "error":
            print(f"          {key}={value}")
    if health.status == "error":
        print(f"          error: {health.detail.get('error')}")
    if health.status == "model_missing":
        print(f"          -> {missing_hint}")


def main() -> int:
    health = collect_health()

    ollama_embed_health = health["ollama_embeddings"]
    _print_health("ollama-embeddings", ollama_embed_health, "ollama pull nomic-embed-text")

    print()

    ollama_text_health = health["ollama_text"]
    _print_health(
        "ollama-text (default de Alfred)",
        ollama_text_health,
        f"ollama pull {ollama_text_health.detail.get('model', '<modelo>')}",
    )

    print()

    gemini_health = health["gemini"]
    print(f"[gemini (opt-in)]  status={gemini_health.status}")
    if gemini_health.status != "ok":
        print(f"          detail={gemini_health.detail}")
        print(
            "          -> export GEMINI_API_KEY=... solo si vas a usar "
            "--provider gemini (chequeá 'brain gemini keys-list' por si ya "
            "hay una clave real cargada)"
        )
    else:
        print(f"          model={gemini_health.detail.get('model')}")

    # El chequeo pasa con que Ollama-texto (el default) esté ok. Gemini es
    # opcional — no bloquea el smoke test si no está configurado.
    return 0 if ollama_text_health.status == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
