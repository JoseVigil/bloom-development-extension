"""Salida dual (humana/JSON) y envelope de error únicos para el CLI de AITAP.

Todos los comandos nuevos usan estas funciones para que un consumidor
automatizado (el administrador de AITAP en Core, vía Nucleus) reciba siempre
el mismo contrato:

    éxito: {"status": "success", "operation": <str>, "data": <obj>}
    error: {"status": "error", "error": {"code", "message", "stage",
                                         "retryable", "details"}}

El envelope de error es el mismo que ya emite ``SupplyError.envelope()``
(``aitap.providers.base``), para no introducir un segundo formato.

Este módulo es CLI: puede usar Typer. La lógica de dominio no lo importa.
"""
from __future__ import annotations

import json
from typing import Any, Callable, Mapping

import typer


def json_mode(ctx: typer.Context | None) -> bool:
    """Lee ``--json`` del GlobalContext de forma segura."""
    return bool(getattr(getattr(ctx, "obj", None), "json_mode", False))


def verbose(ctx: typer.Context | None) -> bool:
    return bool(getattr(getattr(ctx, "obj", None), "verbose", False))


def log(ctx: typer.Context | None, message: str) -> None:
    """Logging verbose: siempre a stderr, nunca mezclado con el JSON de stdout."""
    if verbose(ctx):
        typer.echo(message, err=True)


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def emit(ctx: typer.Context | None, operation: str, data: Any,
         human: Callable[[Any], None]) -> None:
    """Emite un resultado exitoso en JSON o en formato humano."""
    if json_mode(ctx):
        typer.echo(dumps({"status": "success", "operation": operation, "data": data}))
        return
    human(data)


def error_envelope(code: str, message: str, *, stage: str = "cli", retryable: bool = False,
                   details: Mapping[str, Any] | None = None) -> dict:
    return {"status": "error", "error": {"code": code, "message": message, "stage": stage,
                                         "retryable": retryable, "details": dict(details or {})}}


def fail(ctx: typer.Context | None, code: str, message: str, *, stage: str = "cli",
         retryable: bool = False, details: Mapping[str, Any] | None = None) -> None:
    """Emite el envelope de error y termina con exit code 1."""
    if json_mode(ctx):
        typer.echo(dumps(error_envelope(code, message, stage=stage, retryable=retryable,
                                        details=details)))
    else:
        typer.echo(f"Error [{code}]: {message}", err=True)
    raise typer.Exit(code=1)
