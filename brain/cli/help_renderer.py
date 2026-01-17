"""Auto-generated help renderer with AI-Native JSON Schema support."""
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
        if '-' in name:
            prefix = name.split('-')[0]
            section_name = section_titles.get(prefix, prefix.upper())
            subsections[section_name].append(dcmd)
        else:
            subsections['_main'].append(dcmd)
    if len(subsections) == 1 and '_main' in subsections:
        return {'': subsections['_main']}
    result = {}
    for section_name, section_commands in subsections.items():
        if section_name == '_main' and section_commands:
            result['GENERAL'] = section_commands
        elif section_commands:
            result[section_name] = section_commands
    return result


def _infer_command_intent(dcmd: DiscoveredCommand) -> List[str]:
    name = dcmd.name.lower()
    desc = dcmd.description.lower()
    intents = []
    if 'create' in name or 'new' in name or 'init' in name:
        intents.append('create_resource')
    if 'delete' in name or 'remove' in name or 'destroy' in name:
        intents.append('delete_resource')
    if 'list' in name or 'show' in name or 'get' in name:
        intents.append('read_resource')
    if 'update' in name or 'edit' in name or 'modify' in name:
        intents.append('update_resource')
    if 'check' in desc or 'verify' in desc or 'ping' in name:
        intents.append('health_check')
    if 'auth' in name or 'login' in name:
        intents.append('authentication')
    if 'build' in name or 'compile' in name:
        intents.append('build_artifact')
    return intents or ['general_operation']


def _build_openai_function_schema(dcmd: DiscoveredCommand, params: List[CommandParameter]) -> Dict[str, Any]:
    properties = {}
    required = []
    for param in params:
        param_name = param.flag.strip('<>').lower().replace(' ', '_').replace('-', '_')
        schema = {"type": "string", "description": param.help_text or f"Parameter {param_name}"}
        if param.type_hint:
            type_map = {'str': 'string', 'int': 'integer', 'float': 'number', 'bool': 'boolean', 'list': 'array', 'dict': 'object'}
            schema["type"] = type_map.get(param.type_hint, "string")
        if param.default_value is not None:
            schema["default"] = param.default_value
        properties[param_name] = schema
        if param.is_required:
            required.append(param_name)
    exe_name = get_executable_name()
    full_command = f"{dcmd.category.category_name} {dcmd.name}"
    function_name = f"brain_{dcmd.category.category_name}_{dcmd.name}".replace('-', '_')
    return {
        "type": "function",
        "function": {
            "name": function_name,
            "description": f"{dcmd.description}. Execute via: {exe_name} {full_command}",
            "parameters": {"type": "object", "properties": properties, "required": required},
            "metadata": {
                "category": dcmd.category.category_name,
                "command": dcmd.name,
                "full_syntax": f"{exe_name} [--json] [--verbose] {full_command}",
                "intents": _infer_command_intent(dcmd),
                "is_idempotent": 'list' in dcmd.name or 'get' in dcmd.name or 'show' in dcmd.name,
                "is_destructive": 'delete' in dcmd.name or 'remove' in dcmd.name,
                "estimated_duration": "fast" if 'ping' in dcmd.name or 'status' in dcmd.name else "medium"
            }
        }
    }


def _build_ai_native_json(registry: CommandRegistry) -> Dict[str, Any]:
    structure = _extract_structure(registry)
    exe_name = get_executable_name()
    is_exe = is_frozen_executable()
    tools = []
    intent_mappings = defaultdict(list)
    dependency_graph = {}
    for category in structure.categories:
        commands = structure.commands_by_category.get(category, [])
        for cmd in commands:
            discovered_commands = _discover_commands_from_class(cmd, category)
            for dcmd in discovered_commands:
                params = _extract_params_with_help(dcmd.callback)
                function_schema = _build_openai_function_schema(dcmd, params)
                tools.append(function_schema)
                intents = _infer_command_intent(dcmd)
                for intent in intents:
                    intent_mappings[intent].append(f"{category.category_name} {dcmd.name}")
                if 'create' in dcmd.name and category.category_name == 'nucleus':
                    dependency_graph[f"{category.category_name} {dcmd.name}"] = {"suggests": ["github auth-login"], "requires": []}
    ai_schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "title": "Brain CLI - AI-Native Tool Definitions",
        "version": "2.0.0",
        "description": "Complete function calling schema for AI agents to interact with Brain CLI",
        "metadata": {"cli_name": "Brain CLI", "executable": exe_name, "mode": "executable" if is_exe else "development", "supports_json_output": True, "supports_streaming": False, "max_parallel_commands": 5},
        "tools": tools,
        "semantic_layer": {"intent_mappings": dict(intent_mappings), "dependency_graph": dependency_graph, "command_categories": [{"name": cat.category_name, "description": cat.category_description, "command_count": len(structure.commands_by_category.get(cat, []))} for cat in structure.categories]},
        "execution_policies": {"global_options": {"--json": {"position": "before_category", "description": "Enable JSON output for machine parsing", "affects_all_commands": True}, "--verbose": {"position": "before_category", "description": "Enable detailed logging", "affects_all_commands": True}}, "safety_rails": {"require_confirmation": [cmd["function"]["name"] for cmd in tools if cmd["function"]["metadata"]["is_destructive"]], "idempotent_commands": [cmd["function"]["name"] for cmd in tools if cmd["function"]["metadata"]["is_idempotent"]]}},
        "usage_examples": [{"user_intent": "Check if the system is healthy", "commands": [{"tool": "brain_health_native_ping", "params": {}}, {"tool": "brain_health_onboarding_status", "params": {}}], "explanation": "Run health checks to verify system connectivity"}],
        "error_recovery": {"common_patterns": [{"error_signature": "authentication.*failed", "suggested_commands": ["brain_github_auth_login"], "description": "Re-authenticate with GitHub"}]},
        "agent_protocol": {"version": "1.0", "capabilities": {"can_chain_commands": True, "supports_rollback": False, "supports_dry_run": True, "supports_parallel_execution": False}, "communication": {"input_format": "natural_language | structured_json", "output_format": "json", "progress_updates": "synchronous"}}
    }
    return ai_schema


def _build_json_structure(registry: CommandRegistry) -> Dict[str, Any]:
    structure = _extract_structure(registry)
    exe_name = get_executable_name()
    is_exe = is_frozen_executable()
    json_output = {
        "cli_info": {"name": "Brain CLI", "version": "1.0.0", "description": "Modular system for Bloom", "executable": exe_name, "mode": "executable" if is_exe else "development"},
        "global_options": [{"flag": "--json", "description": "Salida en formato JSON (debe ir ANTES del comando)", "position": "before_category"}, {"flag": "--verbose", "description": "Habilitar logging detallado (debe ir ANTES del comando)", "position": "before_category"}, {"flag": "--help", "description": "Mostrar este mensaje de ayuda", "position": "anywhere"}],
        "usage": {"syntax": f"{exe_name} [OPTIONS] <category> <command> [COMMAND_OPTIONS]", "examples": [{"description": "Comando básico", "command": f"{exe_name} health native-ping"}, {"description": "Con flags globales", "command": f"{exe_name} --json nucleus list"}, {"description": "Con verbose", "command": f"{exe_name} --verbose profile create 'My Profile'"}], "notes": ["Los flags globales (--json, --verbose) van ANTES de <category>"]},
        "categories": [], "root_commands": []
    }
    for category in structure.categories:
        commands = structure.commands_by_category.get(category, [])
        all_discovered = []
        for cmd in commands:
            all_discovered.extend(_discover_commands_from_class(cmd, category))
        subsections = _detect_subsections(category, all_discovered)
        category_data = {"name": category.category_name, "description": category.category_description, "command_count": len(all_discovered), "subsections": []}
        for subsection_name, subsection_commands in subsections.items():
            subsection_data = {"name": subsection_name if subsection_name else None, "commands": []}
            for dcmd in sorted(subsection_commands, key=lambda c: c.name):
                params = _extract_params_with_help(dcmd.callback)
                arguments = [p for p in params if p.is_argument]
                options = [p for p in params if not p.is_argument]
                syntax_parts = [exe_name, "[GLOBAL_OPTIONS]", category.category_name, dcmd.name]
                for arg in arguments:
                    syntax_parts.append(arg.flag)
                if options:
                    syntax_parts.append("[OPTIONS]")
                command_data = {"name": dcmd.name, "display_name": dcmd.name.upper().replace('-', ' '), "description": dcmd.description, "syntax": " ".join(syntax_parts), "arguments": [{"name": arg.flag, "required": arg.is_required, "help": arg.help_text, "type": arg.type_hint} for arg in arguments], "options": [{"flag": opt.flag, "required": opt.is_required, "help": opt.help_text, "type": opt.type_hint, "default": opt.default_value} for opt in options]}
                subsection_data["commands"].append(command_data)
            category_data["subsections"].append(subsection_data)
        json_output["categories"].append(category_data)
    return json_output


def _render_discovered_command_detail(dcmd: DiscoveredCommand, params: List[CommandParameter]) -> List[Text]:
    lines = []
    cmd_display_name = dcmd.name.upper().replace('-', ' ')
    lines.append(Text(f"{cmd_display_name} - {dcmd.description}", style="bold white"))
    lines.append(Text())
    exe_name = get_executable_name()
    syntax_parts = [exe_name, "[GLOBAL_OPTIONS]", dcmd.category.category_name, dcmd.name]
    arguments = [p for p in params if p.is_argument]
    options = [p for p in params if not p.is_argument]
    for arg in arguments:
        syntax_parts.append(arg.flag)
    if options:
        syntax_parts.append("[OPTIONS]")
    syntax = " ".join(syntax_parts)
    lines.append(Text(f"  {syntax}", style="green"))
    lines.append(Text())
    if arguments:
        lines.append(Text("  Argumentos:", style="bold cyan"))
        for arg in arguments:
            type_info = f" ({arg.type_hint})" if arg.type_hint else ""
            lines.append(Text(f"    {arg.flag:20} {arg.help_text}{type_info}", style="white"))
        lines.append(Text())
    if options:
        lines.append(Text("  Opciones:", style="bold cyan"))
        for opt in options:
            type_info = f" ({opt.type_hint})" if opt.type_hint else ""
            default_info = f" [default: {opt.default_value}]" if opt.default_value is not None else ""
            lines.append(Text(f"    {opt.flag:20} {opt.help_text}{type_info}{default_info}", style="white"))
        lines.append(Text())
    return lines


def _render_category_panel(console: Console, category: CommandCategory, commands: List[BaseCommand]):
    all_discovered = []
    for cmd in commands:
        discovered = _discover_commands_from_class(cmd, category)
        all_discovered.extend(discovered)
    all_discovered = sorted(all_discovered, key=lambda c: c.name)
    subsections = _detect_subsections(category, all_discovered)
    content_lines = []
    for section_name, section_commands in subsections.items():
        if section_name and section_name != '_main':
            content_lines.append(Text(f"{section_name}", style="bold yellow"))
            content_lines.append(Text())
        for dcmd in sorted(section_commands, key=lambda c: c.name):
            params = _extract_params_with_help(dcmd.callback)
            command_lines = _render_discovered_command_detail(dcmd, params)
            content_lines.extend(command_lines)
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    content = Text("\n").join(content_lines)
    title = f"[bold]{category.category_name.upper()}[/bold]"
    subtitle = category.category_description
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


def render_help(registry: CommandRegistry, json_mode: bool = False, ai_native: bool = False):
    if ai_native or (json_mode and "--ai" in sys.argv):
        ai_schema = _build_ai_native_json(registry)
        print(json.dumps(ai_schema, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.flush()
        return
    
    if json_mode:
        json_data = _build_json_structure(registry)
        print(json.dumps(json_data, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.flush()
        return
    
    is_file_output = not sys.stdout.isatty()
    
    # SOLUCIÓN: Cuando hay redirección, usa Rich con record=True y captura TODO
    if is_file_output:
        # Crear console que graba todo en memoria
        console = Console(record=True, width=100, force_terminal=False, legacy_windows=False)
    else:
        console = Console(width=95)
    
    exe_type = "Executable" if is_frozen_executable() else "Development Mode"
    console.print(f"\n[bold yellow]Brain CLI[/bold yellow] - Modular system for Bloom [dim]({exe_type})[/dim]\n")
    
    structure = _extract_structure(registry)
    
    _render_usage(console)
    console.print()
    _render_options(console)
    console.print()
    _render_categories(console, structure.categories, structure)
    console.print()
    
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()
    
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
    
    for category in priority_order:
        if category in structure.commands_by_category:
            commands = structure.commands_by_category[category]
            _render_category_panel(console, category, commands)
            console.print()
    
    for category in structure.commands_by_category:
        if category not in priority_order:
            _render_category_panel(console, category, structure.commands_by_category[category])
            console.print()
    
    # CRÍTICO: Si estamos redirigiendo, extraer y escribir TODO el contenido
    if is_file_output:
        # Exportar TODO el texto sin formato
        full_output = console.export_text()
        # Escribir directamente sin Rich
        sys.stdout.write(full_output)
        sys.stdout.flush()