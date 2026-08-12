"""Alfred — núcleo conversacional real.

Distinto del Alfred-Go (`nucleus alfred start`, dentro de Nucleus): ese es
un auditor angosto que verifica intents contra la constitución y devuelve
APPROVED/DENIED. Este es la voz — conversación abierta, con memoria de la
sesión, para hablar del modelo de negocio y del proyecto en general. Cuando
Alfred-Go esté estable, este loop puede invocarlo como una tool más (POST a
http://localhost:48216/alfred/verify) para pedir un veredicto de gobernanza
en medio de la charla — hoy no lo hace, para no acoplar algo inestable.

Provider default: Ollama local (OllamaTextProvider), no Gemini. Decisión
de Jose (2026-08-09): el arm de Ollama no se hizo para después reemplazarlo
por Gemini — es el motor real, para tener un bot local. Gemini queda
disponible detrás de la misma interfaz (TextGenerationProviderArm) como
opt-in explícito (--provider gemini o ALFRED_TEXT_PROVIDER=gemini), nunca
como default silencioso — mandar el contexto real de la organización a un
proveedor externo es una decisión consciente, no automática. Ver también
la nota de seguridad en BTIPS sobre distribución agnóstica de cargas: que
un solo punto (ni siquiera una IA) pueda reconstruir el negocio completo
es justamente lo que se evita eligiendo local por default.

AIPromptPayload.text es un string único, no un array de turnos, así que el
historial de conversación se arma acá mismo, concatenando turnos con
roles, y se manda entero en cada llamada — esto aplica igual para
cualquiera de los dos providers, el loop no cambia de forma.

Uso:
    python -m alfred.chat                        # Ollama local (default)
    python -m alfred.chat --provider gemini       # opt-in explícito
    export GEMINI_API_KEY=...                     # solo si usás --provider gemini

Migrado desde agentic-harness/harness/alfred_chat.py (2026-08-09).
OllamaTextProvider agregado el mismo día.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from alfred.contracts.errors import ProviderError
from alfred.contracts.types import AIPromptPayload
from alfred.providers.base import TextGenerationProviderArm
from alfred.providers.gemini_provider import GeminiTextProvider
from alfred.providers.ollama_text_provider import OllamaTextProvider

# Contexto real de elias-repos — no el mock de portfolio (Northwind Labs).
NUCLEUS_CORE = Path(
    "/home/jose/repos/elias-repos/.bloom/.nucleus-elias-repos/.core"
)
SOVEREIGN_CONTRACT = NUCLEUS_CORE / ".ai_bot.sovereign.bl"
RULES = NUCLEUS_CORE / ".rules.bl"

SYSTEM_PREAMBLE = """Sos Alfred, hablando en primera persona con Jose, el Master de esta organización (elias-repos).

Este es el canal conversacional — no el custodio de gobernanza que audita intents. Acá tu trabajo es conversar en serio sobre el modelo de negocio, la arquitectura de Bloom, y el estado del proyecto, con el contexto real de la organización que se te da abajo. No devuelvas veredictos APPROVED/DENIED ni formato JSON — hablá en lenguaje natural, directo, sin rodeos.

--- Contrato soberano real (.ai_bot.sovereign.bl) ---
{sovereign}

--- Reglas reales (.rules.bl) ---
{rules}

--- Fin del contexto ---
"""


def load_context() -> str:
    missing = [p for p in (SOVEREIGN_CONTRACT, RULES) if not p.exists()]
    if missing:
        names = ", ".join(str(p) for p in missing)
        raise SystemExit(
            f"No encuentro estos archivos reales de elias-repos: {names}\n"
            "Sin esto Alfred no tiene contexto real de la organización — "
            "no lo reemplaces por un mock."
        )
    sovereign = SOVEREIGN_CONTRACT.read_text(encoding="utf-8")
    rules = RULES.read_text(encoding="utf-8")
    return SYSTEM_PREAMBLE.format(sovereign=sovereign, rules=rules)


def build_prompt(system: str, history: list[tuple[str, str]], user_message: str) -> str:
    turns = "\n\n".join(f"{role}: {text}" for role, text in history)
    parts = [system]
    if turns:
        parts.append("--- Conversación hasta ahora ---\n" + turns)
    parts.append(f"Usuario: {user_message}\n\nAlfred:")
    return "\n\n".join(parts)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--message",
        "-m",
        help=(
            "Modo one-shot: manda un solo mensaje, imprime la respuesta y "
            "sale. Sin esto arranca el loop interactivo. Útil para smoke "
            "test rápido sin sentarse a conversar."
        ),
    )
    parser.add_argument(
        "--provider",
        "-p",
        choices=("ollama", "gemini"),
        default=os.environ.get("ALFRED_TEXT_PROVIDER", "ollama"),
        help=(
            "Qué arm genera la conversación. Default: ollama (local). "
            "gemini es opt-in explícito, manda contexto real de la "
            "organización a un proveedor externo — usalo a consciencia."
        ),
    )
    return parser.parse_args()


def build_provider(name: str) -> TextGenerationProviderArm:
    if name == "gemini":
        print(
            "[Alfred: usando Gemini — el contexto de esta conversación sale "
            "de esta máquina hacia un proveedor externo.]",
            file=sys.stderr,
        )
        return GeminiTextProvider()
    return OllamaTextProvider()


def one_shot(system: str, provider: TextGenerationProviderArm, message: str) -> int:
    payload = AIPromptPayload(context="general", text=build_prompt(system, [], message))
    try:
        reply = provider.generate_text(payload)
    except ProviderError as exc:
        print(f"[Alfred no pudo responder: {exc}]", file=sys.stderr)
        return 1
    print(reply)
    return 0


def main() -> None:
    args = parse_args()
    system = load_context()
    provider = build_provider(args.provider)

    if args.message:
        raise SystemExit(one_shot(system, provider, args.message))

    print(f"=== Alfred (conversacional, provider={args.provider}) — elias-repos ===")
    print("Escribí 'salir' para terminar.\n")

    history: list[tuple[str, str]] = []

    while True:
        try:
            user_message = input("Vos: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break

        if not user_message:
            continue
        if user_message.lower() in {"salir", "exit", "quit"}:
            break

        prompt = build_prompt(system, history, user_message)
        payload = AIPromptPayload(context="general", text=prompt)

        try:
            reply = provider.generate_text(payload)
        except ProviderError as exc:
            print(f"\n[Alfred no pudo responder: {exc}]\n", file=sys.stderr)
            continue

        print(f"\nAlfred: {reply}\n")
        history.append(("Usuario", user_message))
        history.append(("Alfred", reply))


if __name__ == "__main__":
    main()
