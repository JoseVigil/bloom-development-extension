"""Alfred — núcleo conversacional real.

Distinto del Alfred-Go (`nucleus alfred start`, dentro de Nucleus): ese es
un auditor angosto que verifica intents contra la constitución y devuelve
APPROVED/DENIED. Este es la voz — conversación abierta, con memoria de la
sesión, para hablar del modelo de negocio y del proyecto en general. Cuando
Alfred-Go esté estable, este loop puede invocarlo como una tool más (POST a
http://localhost:48216/alfred/verify) para pedir un veredicto de gobernanza
en medio de la charla — hoy no lo hace, para no acoplar algo inestable.

Usa el arm de Gemini (alfred/providers/gemini_provider.py) tal cual.
AIPromptPayload.text es un string único, no un array de turnos, así que el
historial de conversación se arma acá mismo, concatenando turnos con
roles, y se manda entero en cada llamada.

Requiere GEMINI_API_KEY en el entorno. Chequeá si ya hay una clave real
cargada en el vault de Nucleus con `brain gemini keys-list` antes de pedir
una nueva.

Uso:
    export GEMINI_API_KEY=...
    python -m alfred.chat

Migrado desde agentic-harness/harness/alfred_chat.py (2026-08-09).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from alfred.contracts.errors import ProviderError
from alfred.contracts.types import AIPromptPayload
from alfred.providers.gemini_provider import GeminiTextProvider

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
    return parser.parse_args()


def one_shot(system: str, provider: GeminiTextProvider, message: str) -> int:
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
    provider = GeminiTextProvider()

    if args.message:
        raise SystemExit(one_shot(system, provider, args.message))

    print("=== Alfred (conversacional) — elias-repos ===")
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
