"""
Auto-generated help renderer with AI-Native JSON Schema support.
REFACTORED: Buffer completo para redirecciones (help > file.txt).
"""
from dataclasses import dataclass
from collections import defaultdict
from typing import Dict, List, Optional, Any, get_type_hints
import sys
import inspect
import json
from pathlib import Path
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
import typer
from typer.models import OptionInfo, ArgumentInfo
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.cli.registry import CommandRegistry


class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Path):
            return str(obj)
        if isinstance(obj, CommandCategory):
            return obj.category_name
        if hasattr(obj, '__dict__'):
            return obj.__dict__
        return super().default(obj)


def is_frozen_executable():
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')


def get_executable_name():
    if is_frozen_executable():
        return "brain"
    else:
        return "python brain/__main__.py"


@dataclass
class HelpStructure:
    categories: List[CommandCategory]
    commands_by_category: Dict[CommandCategory, List[BaseCommand]]
    root_commands: List[BaseCommand]


@dataclass
class CommandParameter:
    flag: str
    is_required: bool
    help_text: str
    is_argument: bool = False
    type_hint: Optional[str] = None
    default_value: Optional[Any] = None


@dataclass
class DiscoveredCommand:
    name: str
    callback: Any
    description: str
    source_class: BaseCommand
    category: CommandCategory


def _python_type_to_json_schema(py_type: Any) -> Dict[str, Any]:
    type_mapping = {
        str: {"type": "string"},
        int: {"type": "integer"},
        float: {"type": "number"},
        bool: {"type": "boolean"},
        list: {"type": "array"},
        dict: {"type": "object"},
    }
    origin = getattr(py_type, '__origin__', None)
    if origin is type(None):
        return {"type": "null"}
    base_type = py_type if origin is None else origin
    return type_mapping.get(base_type, {"type": "string"})


def _discover_commands_from_class(cmd: BaseCommand, category: CommandCategory) -> List[DiscoveredCommand]:
    temp_app = typer.Typer()
    cmd.register(temp_app)
    discovered = []
    if not temp_app.registered_commands:
        return discovered
    for registered_cmd in temp_app.registered_commands:
        cmd_name = registered_cmd.name
        callback = registered_cmd.callback
        description = ""
        if callback and callback.__doc__:
            description = callback.__doc__.strip().split('\n')[0]
        if not description:
            meta = cmd.metadata()
            description = meta.description
        discovered.append(DiscoveredCommand(
            name=cmd_name,
            callback=callback,
            description=description,
            source_class=cmd,
            category=category
        ))
    return discovered


def _extract_structure(registry: CommandRegistry) -> HelpStructure:
    categories = set()
    commands_by_category = defaultdict(list)
    root_commands = []
    for cmd in registry.get_all_commands():
        meta = cmd.metadata()
        if meta.is_root:
            root_commands.append(cmd)
        else:
            categories.add(meta.category)
            commands_by_category[meta.category].append(cmd)
    return HelpStructure(
        categories=sorted(categories, key=lambda c: c.category_name),
        commands_by_category=dict(commands_by_category),
        root_commands=root_commands
    )


def _extract_params_with_help(callback) -> List[CommandParameter]:
    if not callback:
        return []
    params = []
    sig = inspect.signature(callback)
    type_hints = get_type_hints(callback) if callback else {}
    for name, param in sig.parameters.items():
        if name == "ctx":
            continue
        default = param.default
        type_hint = type_hints.get(name)
        if isinstance(default, OptionInfo):
            flag = None
            if hasattr(default, "param_decls") and default.param_decls:
                short_flags = [f for f in default.param_decls if f.startswith('-') and not f.startswith('--')]
                long_flags = [f for f in default.param_decls if f.startswith('--')]
                flag = short_flags[0] if short_flags else (long_flags[0] if long_flags else default.param_decls[0])
            else:
                flag = f"--{name.replace('_', '-')}"
            help_text = default.help or ""
            is_required = default.default == ...
            default_val = None
            if not is_required and default.default is not None:
                if isinstance(default.default, (str, int, float, bool)):
                    default_val = default.default
                elif isinstance(default.default, Path):
                    default_val = str(default.default)
                else:
                    default_val = str(default.default)
            if is_required:
                flag = f"{flag} <VALUE>"
            params.append(CommandParameter(
                flag=flag,
                is_required=is_required,
                help_text=help_text,
                is_argument=False,
                type_hint=str(type_hint.__name__) if type_hint else None,
                default_value=default_val
            ))
        elif param.default == inspect.Parameter.empty or isinstance(default, ArgumentInfo):
            arg_name = f"<{name.upper()}>"
            help_text = default.help if isinstance(default, ArgumentInfo) and hasattr(default, 'help') else ""
            params.append(CommandParameter(
                flag=arg_name,
                is_required=True,
                help_text=help_text,
                is_argument=True,
                type_hint=str(type_hint.__name__) if type_hint else None,
                default_value=None
            ))
    return params


def _detect_subsections(category: CommandCategory, discovered_commands: List[DiscoveredCommand]) -> Dict[str, List[DiscoveredCommand]]:
    if not discovered_commands:
        return {'': []}
    subsections = defaultdict(list)
    section_titles = {
        'auth': 'AUTENTICACIÓN', 'repos': 'REPOSITORIOS', 'orgs': 'ORGANIZACIONES',
        'build': 'BUILD', 'keys': 'KEYS', 'accounts': 'ACCOUNTS', 'read': 'READ',
        'exp': 'EXP', 'add': 'ADD', 'list': 'LIST', 'create': 'CREATE',
        'onboarding': 'ONBOARDING', 'project': 'PROJECT',
    }
    for dcmd in discovered_commands:
        name = dcmd.name
        found = False
        for keyword, section_name in section_titles.items():
            if keyword in name:
                subsections[section_name].append(dcmd)
                found = True
                break
        if not found:
            subsections[''].append(dcmd)
    return dict(subsections)


def _build_json_structure(registry: CommandRegistry) -> Dict[str, Any]:
    structure = _extract_structure(registry)
    result = {
        "version": "1.0.0",
        "executable": get_executable_name(),
        "categories": [],
        "root_commands": []
    }
    for cat in structure.categories:
        cmds_in_cat = structure.commands_by_category.get(cat, [])
        discovered_all = []
        for cmd_obj in cmds_in_cat:
            discovered_all.extend(_discover_commands_from_class(cmd_obj, cat))
        subsections = _detect_subsections(cat, discovered_all)
        commands_json = []
        for section_title, section_cmds in subsections.items():
            for dcmd in sorted(section_cmds, key=lambda c: c.name):
                params = _extract_params_with_help(dcmd.callback)
                commands_json.append({
                    "name": dcmd.name,
                    "description": dcmd.description,
                    "subsection": section_title if section_title else None,
                    "parameters": [
                        {
                            "flag": p.flag,
                            "is_required": p.is_required,
                            "is_argument": p.is_argument,
                            "help": p.help_text,
                            "type": p.type_hint,
                            "default": p.default_value
                        }
                        for p in params
                    ]
                })
        result["categories"].append({
            "name": cat.category_name,
            "description": cat.category_description,
            "command_count": len(commands_json),
            "commands": commands_json
        })
    for root_cmd in structure.root_commands:
        discovered = _discover_commands_from_class(root_cmd, CommandCategory.SYSTEM)
        for dcmd in discovered:
            params = _extract_params_with_help(dcmd.callback)
            result["root_commands"].append({
                "name": dcmd.name,
                "description": dcmd.description,
                "parameters": [
                    {
                        "flag": p.flag,
                        "is_required": p.is_required,
                        "is_argument": p.is_argument,
                        "help": p.help_text,
                        "type": p.type_hint,
                        "default": p.default_value
                    }
                    for p in params
                ]
            })
    return result


def _build_ai_native_json(registry: CommandRegistry) -> Dict[str, Any]:
    structure = _extract_structure(registry)
    commands = []
    exe_name = get_executable_name()
    for cat in structure.categories:
        cmds_in_cat = structure.commands_by_category.get(cat, [])
        for cmd_obj in cmds_in_cat:
            discovered = _discover_commands_from_class(cmd_obj, cat)
            for dcmd in discovered:
                params_info = _extract_params_with_help(dcmd.callback)
                properties = {}
                required = []
                for p in params_info:
                    if p.is_argument:
                        param_name = p.flag.strip('<>').lower()
                        properties[param_name] = {
                            "description": p.help_text or f"Argumento {param_name}",
                            **_python_type_to_json_schema(str)
                        }
                        if p.is_required:
                            required.append(param_name)
                    else:
                        param_name = p.flag.replace('--', '').replace('-', '_').split()[0]
                        properties[param_name] = {
                            "description": p.help_text or f"Opción {param_name}",
                            **_python_type_to_json_schema(str)
                        }
                        if p.default_value is not None:
                            properties[param_name]["default"] = p.default_value
                        if p.is_required:
                            required.append(param_name)
                cmd_syntax = f"{exe_name} {cat.category_name} {dcmd.name}"
                commands.append({
                    "name": f"{cat.category_name}.{dcmd.name}",
                    "description": dcmd.description,
                    "category": cat.category_name,
                    "syntax": cmd_syntax,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": required
                    }
                })
    for root_cmd in structure.root_commands:
        discovered = _discover_commands_from_class(root_cmd, CommandCategory.SYSTEM)
        for dcmd in discovered:
            params_info = _extract_params_with_help(dcmd.callback)
            properties = {}
            required = []
            for p in params_info:
                if p.is_argument:
                    param_name = p.flag.strip('<>').lower()
                    properties[param_name] = {
                        "description": p.help_text or f"Argumento {param_name}",
                        **_python_type_to_json_schema(str)
                    }
                    if p.is_required:
                        required.append(param_name)
                else:
                    param_name = p.flag.replace('--', '').replace('-', '_').split()[0]
                    properties[param_name] = {
                        "description": p.help_text or f"Opción {param_name}",
                        **_python_type_to_json_schema(str)
                    }
                    if p.default_value is not None:
                        properties[param_name]["default"] = p.default_value
                    if p.is_required:
                        required.append(param_name)
            commands.append({
                "name": dcmd.name,
                "description": dcmd.description,
                "category": "root",
                "syntax": f"{exe_name} {dcmd.name}",
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required
                }
            })
    return {
        "schema_version": "1.0.0",
        "executable": exe_name,
        "total_commands": len(commands),
        "commands": commands
    }


def _render_category_panel(console: Console, category: CommandCategory, commands: List[BaseCommand]):
    discovered_all = []
    for cmd in commands:
        discovered_all.extend(_discover_commands_from_class(cmd, category))
    
    if not discovered_all:
        return
    
    subsections = _detect_subsections(category, discovered_all)
    content_lines = []
    exe_name = get_executable_name()
    
    for section_title, section_cmds in subsections.items():
        if section_title:
            content_lines.append(Text(f"── {section_title} ──", style="bold yellow"))
            content_lines.append(Text())
        
        for dcmd in sorted(section_cmds, key=lambda c: c.name):
            params = _extract_params_with_help(dcmd.callback)
            syntax_parts = [exe_name, category.category_name, dcmd.name]
            arguments = [p for p in params if p.is_argument]
            options = [p for p in params if not p.is_argument]
            
            for arg in arguments:
                syntax_parts.append(arg.flag)
            if options:
                syntax_parts.append("[OPTIONS]")
            
            syntax = " ".join(syntax_parts)
            content_lines.append(Text(f"{dcmd.name}", style="bold white"))
            content_lines.append(Text(f"  {dcmd.description}", style="dim"))
            content_lines.append(Text(f"  {syntax}", style="green"))
            
            if arguments:
                content_lines.append(Text())
                content_lines.append(Text("  Argumentos:", style="bold cyan"))
                for arg in arguments:
                    help_text = arg.help_text or "Sin descripción"
                    content_lines.append(Text(f"    {arg.flag:20} {help_text}", style="white"))
            
            if options:
                content_lines.append(Text())
                content_lines.append(Text("  Opciones:", style="bold cyan"))
                for opt in options:
                    help_text = opt.help_text or "Sin descripción"
                    default_info = f" [default: {opt.default_value}]" if opt.default_value is not None else ""
                    content_lines.append(Text(f"    {opt.flag:20} {help_text}{default_info}", style="white"))
            
            content_lines.append(Text())
    
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    
    content = Text("\n").join(content_lines)
    title = f"[bold]{category.category_name.upper()}[/bold]"
    subtitle = f"[dim]{category.category_description}[/dim]"
    console.print(Panel(content, title=title, subtitle=subtitle, border_style="cyan", padding=(1, 2)))


def _render_usage(console: Console):
    content_lines = []
    exe_name = get_executable_name()
    is_exe = is_frozen_executable()
    if is_exe:
        content_lines.append(Text("Brain CLI - Ejecutable standalone", style="bold white"))
        content_lines.append(Text())
        content_lines.append(Text("Uso:", style="bold green"))
        content_lines.append(Text(f"  {exe_name} [OPTIONS] <category> <command>", style="green"))
        content_lines.append(Text())
        content_lines.append(Text("Ejemplos:", style="bold cyan"))
        content_lines.append(Text())
        content_lines.append(Text("  # Comando básico", style="dim"))
        content_lines.append(Text(f"  {exe_name} health native-ping", style="white"))
        content_lines.append(Text())
        content_lines.append(Text("  # Con flags globales", style="dim"))
        content_lines.append(Text(f"  {exe_name} --json nucleus list", style="white"))
        content_lines.append(Text())
        content_lines.append(Text("  # Con verbose", style="dim"))
        content_lines.append(Text(f"  {exe_name} --verbose profile create 'My Profile'", style="white"))
        content_lines.append(Text())
        content_lines.append(Text("[!] Los flags globales (--json, --verbose) van ANTES de <category>", style="yellow"))
    else:
        content_lines.append(Text("Brain CLI soporta dos modos de ejecución:", style="bold white"))
        content_lines.append(Text())
        content_lines.append(Text("1. MODO RUNTIME (✅ RECOMENDADO)", style="bold green"))
        content_lines.append(Text("   Ejecución directa sin configuración de PYTHONPATH", style="dim green"))
        content_lines.append(Text())
        content_lines.append(Text(f"   {exe_name} [OPTIONS] <category> <command>", style="green"))
        content_lines.append(Text())
        content_lines.append(Text("2. MODO MODULE (⚠️ Legacy)", style="bold yellow"))
        content_lines.append(Text("   python -m brain [OPTIONS] <category> <command>", style="yellow"))
        content_lines.append(Text())
        content_lines.append(Text("Ejemplos:", style="bold cyan"))
        content_lines.append(Text())
        content_lines.append(Text("  # Comando básico", style="dim"))
        content_lines.append(Text(f"  {exe_name} --json health onboarding-status", style="white"))
        content_lines.append(Text())
        content_lines.append(Text("  # Modo MODULE (alternativo)", style="dim"))
        content_lines.append(Text("  python -m brain --json nucleus list", style="white"))
    content = Text("\n").join(content_lines)
    title = "[bold]Uso / Usage[/bold]" if is_exe else "[bold]Uso / Usage - Dual Mode Support[/bold]"
    console.print(Panel(content, title=title, border_style="yellow", padding=(1, 2), width=95))


def _render_options(console: Console):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    table.add_row("--json", "Salida en formato JSON (debe ir ANTES del comando)")
    table.add_row("--verbose", "Habilitar logging detallado (debe ir ANTES del comando)")
    table.add_row("--help", "Mostrar este mensaje de ayuda")
    exe_name = get_executable_name()
    subtitle = f"[dim]Estas opciones deben ir después de '{exe_name}'[/dim]"
    console.print(Panel(table, title="[bold]Opciones Globales / Global Options[/bold]", subtitle=subtitle, border_style="green"))


def _render_root_commands(console: Console, root_commands: List[BaseCommand]):
    if not root_commands:
        return
    content_lines = []
    exe_name = get_executable_name()
    for cmd in sorted(root_commands, key=lambda c: c.metadata().name):
        discovered = _discover_commands_from_class(cmd, CommandCategory.SYSTEM)
        for dcmd in discovered:
            params = _extract_params_with_help(dcmd.callback)
            cmd_display_name = dcmd.name.upper().replace('-', ' ')
            content_lines.append(Text(f"{cmd_display_name} - {dcmd.description}", style="bold white"))
            content_lines.append(Text())
            syntax_parts = [exe_name, "[GLOBAL_OPTIONS]", dcmd.name]
            arguments = [p for p in params if p.is_argument]
            options = [p for p in params if not p.is_argument]
            for arg in arguments:
                syntax_parts.append(arg.flag)
            if options:
                syntax_parts.append("[OPTIONS]")
            syntax = " ".join(syntax_parts)
            content_lines.append(Text(f"  {syntax}", style="green"))
            content_lines.append(Text())
            if arguments:
                content_lines.append(Text("  Argumentos:", style="bold cyan"))
                for arg in arguments:
                    content_lines.append(Text(f"    {arg.flag:20} {arg.help_text}", style="white"))
                content_lines.append(Text())
            if options:
                content_lines.append(Text("  Opciones:", style="bold cyan"))
                for opt in options:
                    content_lines.append(Text(f"    {opt.flag:20} {opt.help_text}", style="white"))
                content_lines.append(Text())
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    content = Text("\n").join(content_lines)
    console.print(Panel(content, title="[bold]Quick Access[/bold]", border_style="magenta", padding=(1, 2)))


def _render_categories(console: Console, categories: List[CommandCategory], structure: HelpStructure):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="green", no_wrap=True)
    table.add_column(style="dim")
    table.add_column(style="cyan", justify="right")
    total_commands = 0
    for cat in categories:
        count = len(structure.commands_by_category.get(cat, []))
        total_commands += count
        table.add_row(cat.category_name, cat.category_description, f"{count} cmd{'s' if count != 1 else ''}")
    table.add_row("", "", f"{'─' * 10}")
    table.add_row("", "", f"{total_commands} cmds", style="bold cyan")
    console.print(Panel(table, title="[bold]Categories[/bold]", border_style="green"))


def render_help(registry: CommandRegistry, json_mode: bool = False, ai_native: bool = False, full_help: bool = False):
    """
    Renderiza la ayuda completa del sistema.
    
    REFACTORED: Garantiza captura completa del buffer cuando se redirige a archivo.
    
    Args:
        registry: Registro de comandos
        json_mode: Activar modo JSON
        ai_native: Activar esquema AI-Native JSON
        full_help: Si True, renderiza todos los comandos de todas las categorías
    """
    
    # ========================================================================
    # FIX CRÍTICO: Forzar UTF-8 en stdout ANTES de cualquier renderizado
    # ========================================================================
    import io
    if not sys.stdout.isatty():
        # Redirección a archivo detectada - forzar UTF-8
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(
                sys.stdout.buffer, 
                encoding='utf-8', 
                errors='replace',
                line_buffering=False
            )
    
    # Modo AI-Native JSON (para LLMs)
    if ai_native or (json_mode and "--ai" in sys.argv):
        ai_schema = _build_ai_native_json(registry)
        sys.stdout.write(json.dumps(ai_schema, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.write('\n')
        sys.stdout.flush()
        return
    
    # Modo JSON estándar
    if json_mode:
        json_data = _build_json_structure(registry)
        sys.stdout.write(json.dumps(json_data, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.write('\n')
        sys.stdout.flush()
        return
    
    # Detectar si estamos redirigiendo a archivo
    is_file_output = not sys.stdout.isatty()
    
    # CRÍTICO: Cuando hay redirección, usar Console con record=True
    # para capturar TODO el output en memoria antes de escribir
    if is_file_output:
        console = Console(
            record=True,
            width=100,
            force_terminal=False,
            legacy_windows=False
        )
    else:
        # Modo TTY normal
        console = Console(width=95)
    
    # ========================================================================
    # RENDERIZADO COMPLETO (todo va al mismo console object)
    # ========================================================================
    exe_type = "Executable" if is_frozen_executable() else "Development Mode"
    console.print(f"\n[bold yellow]Brain CLI[/bold yellow] - Modular system for Bloom [dim]({exe_type})[/dim]\n")
    
    structure = _extract_structure(registry)
    
    # Secciones principales
    _render_usage(console)
    console.print()
    _render_options(console)
    console.print()
    _render_categories(console, structure.categories, structure)
    console.print()
    
    # Comandos root (si existen)
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()
    
    # Orden de prioridad para categorías
    priority_order = [
        CommandCategory.HEALTH,
        CommandCategory.SYSTEM,
        CommandCategory.NUCLEUS,
        CommandCategory.PROJECT,
        CommandCategory.PROFILE,
        CommandCategory.EXTENSION,
        CommandCategory.SYNAPSE,
        CommandCategory.SERVICE,
        CommandCategory.RUNTIME,
        CommandCategory.CONTEXT,
        CommandCategory.INTENT,
        CommandCategory.FILESYSTEM,
        CommandCategory.GITHUB,
        CommandCategory.GEMINI,
        CommandCategory.TWITTER,
        CommandCategory.CHROME,
    ]
    
    # CRÍTICO: Solo renderizar paneles detallados si full_help=True
    if full_help:
        # Renderizar categorías en orden de prioridad
        for category in priority_order:
            if category in structure.commands_by_category:
                commands = structure.commands_by_category[category]
                _render_category_panel(console, category, commands)
                console.print()
        
        # Renderizar categorías restantes (no prioritarias)
        for category in structure.commands_by_category:
            if category not in priority_order:
                _render_category_panel(console, category, structure.commands_by_category[category])
                console.print()
    else:
        # Modo compacto: mostrar mensaje de ayuda para obtener detalles
        console.print()
        console.print("[dim]Para ver todos los comandos detallados de cada categoría, usa:[/dim]")
        console.print("[bold cyan]  brain --help --full[/bold cyan]")
        console.print()
        console.print("[dim]Para ayuda de una categoría específica:[/dim]")
        console.print("[bold cyan]  brain <category> --help[/bold cyan]")
        console.print()
    
    if is_file_output:
        # Exportar TODO el contenido capturado
        full_output = console.export_text()
        
        # CRÍTICO: Forzar UTF-8 para redirección
        if hasattr(sys.stdout, 'buffer'):
            # Escribir directamente al buffer con UTF-8
            sys.stdout.buffer.write(full_output.encode('utf-8'))
            sys.stdout.buffer.flush()
        else:
            # Fallback si no hay buffer
            sys.stdout.write(full_output)
            sys.stdout.flush()