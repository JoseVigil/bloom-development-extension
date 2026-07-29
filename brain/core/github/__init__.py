"""
GitHub Core Package
Lógica pura de integración con GitHub (sin dependencias de Typer/CLI).

Este archivo estaba pisado por una copia accidental del __init__.py de
brain/commands/github/ (capa CLI) — importaba GithubAuthCommand,
GithubReposCommand, etc., que son clases de comando y no existen ni
deberían existir en brain/core/github/. Ese import rompía la ejecución de
este __init__.py con ModuleNotFoundError apenas algo tocaba
brain.core.github.* (ej. brain.core.github.api_client), porque Python
siempre ejecuta el __init__.py del paquete padre antes de resolver el
submódulo.

Ningún call site importa nada a nivel de paquete de aquí (todos hacen
`from brain.core.github.api_client import GitHubAPIClient` o
`from brain.core.github.models import Repository`), así que no hace
falta re-exportar nada.
"""
