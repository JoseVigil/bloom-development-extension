"""Cliente del lado Emisión — cómo Alfred le hablaría a AITAP.

Interfaz preparada, no wireada a `chat.py` todavía (ver AGENTS.md de este
proyecto para el porqué). Motivo concreto: `aitap route status` hoy
responde literalmente "no implementado todavía. Motor de ruteo
inter-proveedor pendiente."
(`installer/aitap/src/aitap/commands/route/route_status.py`) — no existe
ningún comando `aitap route ask` ni equivalente al que este cliente pueda
apuntar de verdad todavía.

`AitapClient.ask()` levanta `AitapNotImplementedError` a propósito, en vez
de simular una respuesta. Misma disciplina que GOV-INV-004 en Nucleus:
nunca fallback silencioso a un simulation_env — si algo no está
implementado, falla fuerte y dice por qué, no finge que funciona.

Cuando el motor de ruteo de AITAP exista, este módulo es el único lugar
que necesita cambiar para que Alfred deje de llamar a GeminiTextProvider
directo con GEMINI_API_KEY y empiece a pedir razonamiento de frontera a
través del grifo. Ollama local no pasa por acá nunca: AITAP enruta
modelos de frontera (Gemini/Claude/OpenAI/xAI), no modelos locales — ver
README de installer/aitap, sección "Decisiones ya tomadas".
"""

from __future__ import annotations

from dataclasses import dataclass

from alfred.aitap.bisp_payload import BispPayload


class AitapNotImplementedError(RuntimeError):
    """AITAP todavía no tiene motor de ruteo real — ver docstring del módulo."""


@dataclass(frozen=True)
class AitapRawResponse:
    """Lo que AITAP devolvería: respuesta cruda + metadata de Contabilidad.

    Campos de contabilidad tomados literalmente de
    `AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` §1, pilar 3:
    "conteo estricto de tokens de input/output, costo, latencia y
    auditoría, por consumidor". `raw_text` es la respuesta del modelo
    "tal cual la dio el modelo" (§1) — Alfred, no AITAP, la parsea contra
    el schema del Contrato D una vez que ese schema exista (§3 del mismo
    documento, hoy bloqueado — ver `Alfred_Integracion_AITAP_Disparo2_v1_0.md` §4).
    """

    raw_text: str
    provider_used: str
    tokens_input: int
    tokens_output: int
    cost_usd: float
    latency_ms: int


class AitapClient:
    """Consumidor de AITAP para el lado Emisión de Alfred.

    `ask()` no ejecuta nada localmente ni interpreta la respuesta — Alfred
    sigue siendo dueño exclusivo de parsear `raw_text` y decidir qué hacer
    con el resultado (§3 de la arquitectura de AITAP). Este cliente solo
    representa el viaje de ida y vuelta ante AITAP.
    """

    def __init__(self, aitap_cli: str = "aitap") -> None:
        self.aitap_cli = aitap_cli

    def ask(self, payload: BispPayload) -> AitapRawResponse:
        raise AitapNotImplementedError(
            "AITAP no tiene todavía un motor de ruteo real "
            "('aitap route status' es un placeholder, ver "
            "installer/aitap/src/aitap/commands/route/route_status.py). "
            "Este cliente queda preparado con la forma correcta del "
            "payload (BispPayload) y de la respuesta esperada "
            "(AitapRawResponse), pero no hay nada real que invocar "
            "todavía. No lo reemplaces por una simulación — usá "
            "--provider ollama o --provider gemini directo mientras tanto."
        )
