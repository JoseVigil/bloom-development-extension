"""
fs_contracts.py — Brain / validación de shape de negocio para BSIP-Response (Contrato D)
==========================================================================================

Disparo 1 (PoC). Ver docs/AITAP/BSIP_Response_Spec_PoC_Disparo1_v1_0.md.

QUÉ ES ESTE ARCHIVO
--------------------
Este módulo es la primera versión de `fs_contracts.py`, el "dueño declarado de la
validación de shape de negocio de los turnos" que `DEV_Intent_Spec_v1_0.md §4` menciona
pero que, al momento de este PoC, NO existía en el codebase — se crea acá.

Vive en brain/core/intent/, junto al resto de los managers de etapa del pipeline
(response_parser.py, validation_manager.py, staging_manager.py, merge_manager.py) —
NO en brain/core/ como hermano directo de intent_manager.py (corrección respecto a
la nota original de este docstring, ver prompt de integración).

AITAP no lo importa, no lo llama, y no valida este contrato bajo ninguna
circunstancia — AITAP transporta la respuesta cruda del modelo de frontera
(Grifo + Vault + Contabilidad) y nada más.

DÓNDE EMPIEZA ESTE MÓDULO
-----------------------------------------------------------------------------
Confirmado con código real (no supuesto): este módulo NO se conecta al pipeline
legacy de dev/doc (ResponseParser → ValidationManager → StagingManager →
MergeManager). Ese pipeline valida un envelope distinto (bloom_protocol/metadata/
content.files[] con file_ref) y trabaja copiando archivos completos, sin concepto
de operaciones granulares con diff/checksum por operación.

fs_contracts.py valida exclusivamente Contrato D / BSIP-Response — un formato
nuevo, sin productor ni consumidor real todavía en el codebase. Su consumidor
futuro es el adapter de OpenCode (no implementado en esta sesión).

QUÉ NO HACE ESTE MÓDULO
-------------------------
- No aplica las operaciones sobre el filesystem real (eso será el adapter de
  OpenCode, o su equivalente — todavía no existe).
- No decide si una respuesta con violaciones de scope debe bloquear todo el turno o
  solo esa operación — eso es política del consumidor (Nucleus/gobernanza), este módulo
  solo la detecta y la reporta.
- No valida el envelope de protocolo/checksum de `.raw_output.txt` — eso es
  ResponseParser.parse(), y es un mecanismo completamente distinto e intacto.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from jsonschema import Draft202012Validator

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

_SCHEMA_PATH = Path(__file__).parent / "schema" / "bsip_response_contrato_d_v0_1.json"

with open(_SCHEMA_PATH, "r", encoding="utf-8") as _f:
    BSIP_RESPONSE_SCHEMA_V0_1: dict = json.load(_f)

_validator = Draft202012Validator(BSIP_RESPONSE_SCHEMA_V0_1)

_SUPPORTED_OPS = {"create", "edit", "patch", "delete"}
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


# ---------------------------------------------------------------------------
# Excepciones — diseñadas para alimentar el bucle de fallback del canal web
# (§3.2 del spec: parseo → validación → reintento con mensaje de corrección)
# ---------------------------------------------------------------------------

@dataclass
class Violation:
    """Un único punto de fallo, en un formato que tanto un log como un prompt de
    corrección al modelo pueden consumir sin traducción adicional."""

    code: str
    message: str
    json_pointer: str = ""  # ej. "/operations/2/checksum_before"
    hint: str = ""  # frase corta orientada a que el modelo se corrija


class ContractViolation(Exception):
    """Se levanta cuando el contenido decodificado no es un BSIP-Response válido
    contra Contrato D v0.1 — falla de shape, no de transporte."""

    def __init__(self, violations: list[Violation]):
        self.violations = violations
        super().__init__(
            f"{len(violations)} violación(es) de Contrato D: "
            + "; ".join(f"{v.code} @ {v.json_pointer or '<root>'}: {v.message}" for v in violations)
        )


class ScopeViolation(ContractViolation):
    """Subclase específica para violaciones de scope autorizado — se separa de
    ContractViolation genérico porque la política de qué hacer ante esto (bloquear
    todo el turno vs. solo la operación) es del consumidor, no de este módulo, y
    conviene que el llamador pueda distinguir el tipo con un except específico."""


class MalformedInputError(Exception):
    """El contenido ni siquiera es JSON parseable. Distinto de ContractViolation:
    acá no llegamos a tener un objeto contra el cual correr el schema."""


# ---------------------------------------------------------------------------
# Paso 0: decodificar el contenido entregado por el llamador
# ---------------------------------------------------------------------------

_MD_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*?)\n```\s*$", re.DOTALL)


def parse_bsip_response(raw: str | dict) -> dict:
    """Normaliza lo que entrega el llamador a un dict Python.

    Acepta dict (passthrough) o str. Si es str, intenta json.loads directo, y si
    falla, intenta despojar un fence de markdown ```json ... ``` — defensivo para
    el canal web, donde el modelo puede envolver el JSON en un bloque de código
    pese al prompting rígido.

    No confundir con validate_shape(): esto solo decodifica JSON, no valida
    Contrato D.
    """
    if isinstance(raw, dict):
        return raw

    if not isinstance(raw, str):
        raise MalformedInputError(
            f"Se esperaba str o dict, se recibió {type(raw).__name__}"
        )

    text = raw.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    m = _MD_FENCE_RE.match(text)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError as e:
            raise MalformedInputError(f"JSON malformado incluso tras despojar fence de markdown: {e}") from e

    raise MalformedInputError(
        "El contenido no es JSON parseable ni un bloque de código ```json``` con JSON válido adentro."
    )


# ---------------------------------------------------------------------------
# Paso 1: validación de shape contra el schema (Contrato D v0.1)
# ---------------------------------------------------------------------------

def validate_shape(payload: dict) -> list[Violation]:
    """Corre el JSON Schema de Contrato D sobre el payload ya decodificado.

    Devuelve la lista de violaciones (vacía si es válido) en vez de levantar
    directamente, para que el caller decida si agrega más violaciones (scope,
    semánticas) antes de decidir si levanta ContractViolation una sola vez con
    todo junto — importante para el canal web, donde queremos mandarle al modelo
    TODOS los problemas en un solo mensaje de corrección, no uno por reintento.
    """
    violations = []
    for err in _validator.iter_errors(payload):
        pointer = "/" + "/".join(str(p) for p in err.absolute_path)
        violations.append(
            Violation(
                code="schema_violation",
                message=err.message,
                json_pointer=pointer,
                hint=_hint_for_schema_error(err),
            )
        )
    return violations


def _hint_for_schema_error(err) -> str:
    """Traduce el error crudo de jsonschema a una instrucción corta y accionable
    para el modelo, pensada para el mensaje de corrección del fallback del canal
    web (§3.2). No es exhaustivo — cubre los casos más comunes esperados."""
    msg = err.message
    if "is not one of" in msg and "op" in str(err.absolute_path):
        return "El campo 'op' debe ser exactamente uno de: create, edit, patch, delete."
    if "is a required property" in msg:
        missing = msg.split("'")[1] if "'" in msg else "?"
        return f"Falta el campo requerido '{missing}' para esta operación — revisar qué campos exige cada tipo de 'op'."
    if "does not match" in msg and "path" in str(err.absolute_path):
        return "El 'path' debe ser relativo (sin '/' inicial) y no puede contener '..'."
    if "does not match" in msg and "checksum" in str(err.absolute_path):
        return "Los checksums deben ser un hash sha256 en hex minúscula (64 caracteres)."
    return "Revisar este campo contra el schema de Contrato D v0.1."


# ---------------------------------------------------------------------------
# Paso 2: validación de scope — enforcement real, NO el declared_scope autodeclarado
# ---------------------------------------------------------------------------
#
# Decisión de diseño: el scope autorizado NUNCA se toma del propio BSIP-Response
# (metadata.declared_scope es solo diagnóstico/auditoría). El enforcement se hace
# acá, contra la lista de paths autorizados que el LLAMADOR (Brain, con el intent
# real) le pasa a esta función — nunca contra algo que el modelo mismo declaró.

def validate_scope(payload: dict, authorized_prefixes: list[str]) -> list[Violation]:
    """authorized_prefixes: paths (o prefijos de path) autorizados por el intent,
    provistos por Brain/Nucleus — NUNCA derivados de payload['metadata'].

    Un path se considera dentro de scope si coincide exactamente con un prefijo o
    cuelga de él (comparación por segmentos, no por substring, para que
    'src/app' no autorice 'src/app_evil').
    """
    violations = []
    norm_prefixes = [_normalize_path(p) for p in authorized_prefixes]

    for i, op in enumerate(payload.get("operations", [])):
        raw_path = op.get("path", "")
        norm_path = _normalize_path(raw_path)
        if not _within_any_prefix(norm_path, norm_prefixes):
            violations.append(
                Violation(
                    code="scope_violation",
                    message=(
                        f"path '{raw_path}' está fuera del scope autorizado del intent "
                        f"({norm_prefixes})."
                    ),
                    json_pointer=f"/operations/{i}/path",
                    hint="Esta operación toca un archivo fuera del scope autorizado para este intent.",
                )
            )
    return violations


def _normalize_path(p: str) -> str:
    return p.strip().lstrip("/")


def _within_any_prefix(path: str, prefixes: list[str]) -> bool:
    path_parts = Path(path).parts
    for prefix in prefixes:
        prefix_parts = Path(prefix).parts
        if path_parts[: len(prefix_parts)] == prefix_parts:
            return True
    return False


# ---------------------------------------------------------------------------
# Paso 3: entrypoint combinado
# ---------------------------------------------------------------------------

def validate_business_shape(
    raw: str | dict,
    authorized_prefixes: Optional[list[str]] = None,
    raise_on_violation: bool = True,
) -> tuple[dict, list[Violation]]:
    """Entrypoint principal para Brain: decodifica, valida shape, y (si se provee
    authorized_prefixes) valida scope. Devuelve (payload, violations).

    Si raise_on_violation=True (default) y hay violaciones, levanta
    ContractViolation (o ScopeViolation si TODAS las violaciones son de scope)
    con la lista completa — pensado para que el canal API falle rápido, y para
    que el canal web pueda capturar la excepción y construir el mensaje de
    corrección de una sola vez con format_correction_prompt().
    """
    payload = parse_bsip_response(raw)

    violations = validate_shape(payload)
    # Solo tiene sentido validar scope si la shape básica ya es correcta —
    # si 'operations' ni siquiera tiene la forma esperada, iterarlo para scope
    # daría errores ruidosos y redundantes.
    if not violations and authorized_prefixes is not None:
        violations = validate_scope(payload, authorized_prefixes)

    if violations and raise_on_violation:
        if all(v.code == "scope_violation" for v in violations):
            raise ScopeViolation(violations)
        raise ContractViolation(violations)

    return payload, violations


# ---------------------------------------------------------------------------
# Utilidad para el bucle de fallback del canal web (§3.2)
# ---------------------------------------------------------------------------

def format_correction_prompt(violations: list[Violation]) -> str:
    """Arma el mensaje de corrección a reinyectar al modelo tras un intento
    fallido en el canal web. Nunca se le pasa al consumidor de ejecución un
    BSIP-Response no validado — este mensaje es lo que separa un reintento
    guiado de simplemente volver a preguntar 'a ver, mandá de nuevo'."""
    lines = [
        "Tu respuesta anterior no cumple el formato BSIP-Response (Contrato D). "
        "Corregí los siguientes problemas y respondé de nuevo con el JSON completo, "
        "sin texto adicional fuera del bloque JSON:",
        "",
    ]
    for v in violations:
        pointer = v.json_pointer or "(raíz del documento)"
        lines.append(f"- En {pointer}: {v.message}")
        if v.hint:
            lines.append(f"  → {v.hint}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Utilidad de checksum — usada tanto para generar fixtures de prueba como,
# potencialmente, por el consumidor real al verificar drift contra el filesystem.
# ---------------------------------------------------------------------------

def sha256_hex(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
