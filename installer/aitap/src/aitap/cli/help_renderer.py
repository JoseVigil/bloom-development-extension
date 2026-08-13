"""
Help renderer dual-mode para AITap: texto humano y JSON AI-native.

Mismo contrato que brain/cli/help_renderer.py:
    render_help(registry, json_mode=False, ai_native=False, full_help=False)

Esto es lo que permite que el resto del ecosistema (scripts de build que vuelcan
a installer/help/, o agentes de IA que necesitan introspeccionar los comandos
disponibles) traten a aitap igual que a brain o a nucleus.
"""
import json
import sys
from typing import Any, Dict, List

from aitap.cli.categories import CommandCategory
from aitap.cli.registry import CommandRegistry

try:
    from rich.console import Console
    from rich.table import Table
    _HAS_RICH = True
except ImportError:
    _HAS_RICH = False


APP_NAME = "aitap"
APP_TAGLINE = "Router centralizado de acceso a proveedores de IA para el ecosistema Bloom"


def _command_to_dict(command) -> Dict[str, Any]:
    meta = command.metadata()
    return {
        "name": meta.name,
        "category": meta.category.name,
        "description": meta.description,
        "requires_vault": meta.requires_vault,
        "aliases": meta.aliases,
        "examples": meta.examples,
    }


def _build_schema(registry: CommandRegistry, full_help: bool) -> Dict[str, Any]:
    commands = registry.get_all_commands()
    by_category: Dict[str, List[Dict[str, Any]]] = {}
    for cmd in commands:
        meta = cmd.metadata()
        by_category.setdefault(meta.category.name, []).append(_command_to_dict(cmd))

    return {
        "app": APP_NAME,
        "tagline": APP_TAGLINE,
        "schema_version": "1.0",
        "vault_owner": "nucleus",
        "vault_note": "aitap solo guarda referencias (key_id) y politica de ruteo. El secreto real vive en Nucleus Vault (OS Keyring).",
        "categories": {
            cat.name: {
                "description": cat.description,
                "commands": by_category.get(cat.name, []),
            }
            for cat in CommandCategory.get_all_categories()
            if full_help or by_category.get(cat.name)
        },
    }


def _render_json(registry: CommandRegistry, full_help: bool):
    schema = _build_schema(registry, full_help=full_help)
    sys.stdout.write(json.dumps(schema, indent=2, ensure_ascii=False))
    sys.stdout.write("\n")


def _render_text_plain(registry: CommandRegistry, full_help: bool):
    lines = [f"{APP_NAME} — {APP_TAGLINE}", ""]
    lines.append("USAGE")
    lines.append(f"  {APP_NAME} [OPTIONS] <category> <command> [args]")
    lines.append("")
    lines.append("GLOBAL OPTIONS")
    lines.append("  --json          Output en JSON (para automatizacion)")
    lines.append("  --json-help     Referencia completa de comandos en JSON (AI-native)")
    lines.append("  --verbose       Logging detallado")
    lines.append("  --help          Esta ayuda")
    lines.append("")
    lines.append("NOTA: aitap no es dueno del vault. Las credenciales viven en Nucleus")
    lines.append("(OS Keyring). aitap solo guarda referencias y politica de ruteo.")
    lines.append("")
    lines.append("CATEGORIAS")
    for cat in CommandCategory.get_all_categories():
        cmds = registry.get_by_category(cat)
        if not cmds and not full_help:
            continue
        lines.append(f"  {cat.name:<10} {cat.description}")
        if full_help:
            for cmd in cmds:
                meta = cmd.metadata()
                lines.append(f"      {APP_NAME} {cat.name} {meta.name:<12} {meta.description}")
    lines.append("")
    sys.stdout.write("\n".join(lines) + "\n")


def _render_text_rich(registry: CommandRegistry, full_help: bool):
    console = Console()
    console.print(f"\n[bold cyan]{APP_NAME}[/bold cyan] — [dim]{APP_TAGLINE}[/dim]\n")
    console.print("[bold yellow]USAGE[/bold yellow]")
    console.print(f"  [bold]{APP_NAME}[/bold] [OPTIONS] <category> <command> [args]\n")
    console.print("[bold yellow]GLOBAL OPTIONS[/bold yellow]")
    console.print("  --json          Output en JSON")
    console.print("  --json-help     Referencia completa en JSON (AI-native)")
    console.print("  --verbose       Logging detallado")
    console.print("  --help          Esta ayuda\n")
    console.print("[dim]aitap no es dueno del vault — Nucleus lo es. Solo guarda referencias y politica de ruteo.[/dim]\n")

    table = Table(title="Categorias de comandos", show_lines=False)
    table.add_column("Categoria", style="bold magenta")
    table.add_column("Descripcion")
    table.add_column("Comandos")
    for cat in CommandCategory.get_all_categories():
        cmds = registry.get_by_category(cat)
        if not cmds and not full_help:
            continue
        cmd_names = ", ".join(c.metadata().name for c in cmds) or "-"
        table.add_row(cat.name, cat.description, cmd_names)
    console.print(table)
    console.print()


def render_help(registry: CommandRegistry, json_mode: bool = False, ai_native: bool = False, full_help: bool = False):
    """
    Punto de entrada unico para renderizar help en cualquiera de los 2 modos:
    - json_mode/ai_native=True -> JSON AI-native (consumible por agentes/scripts de build)
    - default -> texto humano (rich si esta disponible, texto plano si no)
    """
    if json_mode or ai_native:
        _render_json(registry, full_help=full_help)
        return
    if _HAS_RICH:
        _render_text_rich(registry, full_help=full_help)
    else:
        _render_text_plain(registry, full_help=full_help)
