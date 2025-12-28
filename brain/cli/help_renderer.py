"""Auto-generated help renderer using Rich with categorized panels."""
from dataclasses import dataclass
from collections import defaultdict
from typing import Dict, List, Tuple
import inspect
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
import typer
from typer.models import OptionInfo, ArgumentInfo
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.cli.registry import CommandRegistry


@dataclass
class HelpStructure:
    categories: List[CommandCategory]
    commands_by_category: Dict[CommandCategory, List[BaseCommand]]
    root_commands: List[BaseCommand]


@dataclass
class CommandParameter:
    """Represents a command parameter with its metadata."""
    flag: str
    is_required: bool
    help_text: str
    is_argument: bool = False


def _extract_structure(registry: CommandRegistry) -> HelpStructure:
    """Extract command structure from registry."""
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
        categories=sorted(categories, key=lambda c: c.value),
        commands_by_category=dict(commands_by_category),
        root_commands=root_commands
    )


def _extract_params_with_help(callback) -> List[CommandParameter]:
    """Extract parameters and their help text with full metadata."""
    if not callback:
        return []
    
    params = []
    sig = inspect.signature(callback)
    
    for name, param in sig.parameters.items():
        if name == "ctx":
            continue
        
        default = param.default
        
        if isinstance(default, OptionInfo):
            # Extract flag name (prefer short form)
            flag = None
            if hasattr(default, "param_decls") and default.param_decls:
                short_flags = [f for f in default.param_decls if f.startswith('-') and not f.startswith('--')]
                long_flags = [f for f in default.param_decls if f.startswith('--')]
                flag = short_flags[0] if short_flags else (long_flags[0] if long_flags else default.param_decls[0])
            else:
                flag = f"--{name.replace('_', '-')}"
            
            help_text = default.help or ""
            is_required = default.default == ...
            
            # Add value placeholder for required params
            if is_required:
                flag = f"{flag} <VALUE>"
            
            params.append(CommandParameter(
                flag=flag,
                is_required=is_required,
                help_text=help_text,
                is_argument=False
            ))
        elif param.default == inspect.Parameter.empty or isinstance(default, ArgumentInfo):
            # Positional argument
            arg_name = f"<{name.upper()}>"
            help_text = default.help if isinstance(default, ArgumentInfo) and hasattr(default, 'help') else ""
            
            params.append(CommandParameter(
                flag=arg_name,
                is_required=True,
                help_text=help_text,
                is_argument=True
            ))
    
    return params


def _detect_subsections(category: CommandCategory, commands: List[BaseCommand]) -> Dict[str, List[BaseCommand]]:
    """
    Detect subsections based on command name prefixes.
    E.g., auth-login, auth-status → subsection "AUTENTICACIÓN"
    """
    if not commands:
        return {'': []}
    
    subsections = defaultdict(list)
    
    # Mapping of prefixes to subsection titles
    section_titles = {
        'auth': 'AUTENTICACIÓN',
        'repos': 'REPOSITORIOS',
        'orgs': 'ORGANIZACIONES',
        'build': 'BUILD',
    }
    
    for cmd in commands:
        name = cmd.metadata().name
        if '-' in name:
            prefix = name.split('-')[0]
            section_name = section_titles.get(prefix, prefix.upper())
            subsections[section_name].append(cmd)
        else:
            subsections['_main'].append(cmd)
    
    # Si solo hay _main (no hay subsecciones), retornar sin encabezado
    if len(subsections) == 1 and '_main' in subsections:
        return {'': subsections['_main']}
    
    # Si hay subsecciones mixtas, preservar TODO
    result = {}
    for section_name, section_commands in subsections.items():
        if section_name == '_main' and section_commands:
            # Comandos sin guión van a GENERAL
            result['GENERAL'] = section_commands
        elif section_commands:  # Solo agregar si hay comandos
            result[section_name] = section_commands
    
    return result


def _render_command_detail(cmd: BaseCommand, category: CommandCategory) -> List[Text]:
    """Render a command with full detailed formatting."""
    meta = cmd.metadata()
    
    # Extract command parameters
    temp_app = typer.Typer()
    cmd.register(temp_app)
    
    params = []
    if temp_app.registered_commands:
        registered = temp_app.registered_commands[0]
        params = _extract_params_with_help(registered.callback)
    
    lines = []
    
    # 1. Command name and description
    cmd_display_name = meta.name.upper().replace('-', ' ')
    lines.append(Text(f"{cmd_display_name} - {meta.description}", style="bold white"))
    lines.append(Text())  # Empty line
    
    # 2. Full command syntax with GLOBAL OPTIONS placement
    syntax_parts = ["python -m brain", "[GLOBAL_OPTIONS]", category.value, meta.name]
    
    # Separate arguments and options
    arguments = [p for p in params if p.is_argument]
    options = [p for p in params if not p.is_argument]
    
    # Add arguments to syntax
    for arg in arguments:
        syntax_parts.append(arg.flag)
    
    # Add [OPTIONS] if there are any options
    if options:
        syntax_parts.append("[OPTIONS]")
    
    syntax = " ".join(syntax_parts)
    lines.append(Text(f"  {syntax}", style="green"))
    lines.append(Text())  # Empty line
    
    # 3. Arguments section (positional parameters)
    if arguments:
        lines.append(Text("  Argumentos:", style="bold cyan"))
        for arg in arguments:
            lines.append(Text(f"    {arg.flag:20} {arg.help_text}", style="white"))
        lines.append(Text())  # Empty line
    
    # 4. Options section (flags and optional parameters)
    if options:
        lines.append(Text("  Opciones:", style="bold cyan"))
        for opt in options:
            lines.append(Text(f"    {opt.flag:20} {opt.help_text}", style="white"))
        lines.append(Text())  # Empty line
    
    return lines


def _render_category_panel(console: Console, category: CommandCategory, commands: List[BaseCommand]):
    """Render a complete panel for a single category."""
    
    # Sort commands alphabetically
    commands = sorted(commands, key=lambda c: c.metadata().name)
    
    # Detect subsections
    subsections = _detect_subsections(category, commands)
    
    content_lines = []
    
    # Render each subsection
    for section_name, section_commands in subsections.items():
        # Add subsection header if not empty
        if section_name and section_name != '_main':
            content_lines.append(Text(f"{section_name}", style="bold yellow"))
            content_lines.append(Text())  # Empty line
        
        # Render each command in the subsection
        for cmd in sorted(section_commands, key=lambda c: c.metadata().name):
            command_lines = _render_command_detail(cmd, category)
            content_lines.extend(command_lines)
    
    # Remove trailing empty lines
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    
    # Combine all lines
    content = Text("\n").join(content_lines)
    
    # Create panel
    title = f"[bold]{category.value.upper()}[/bold]"
    subtitle = category.description
    
    console.print(Panel(
        content,
        title=title,
        subtitle=subtitle,
        border_style="cyan",
        padding=(1, 2)
    ))


def _render_usage(console: Console):
    """Render usage section explaining global options placement."""
    content_lines = []
    
    # Basic syntax
    content_lines.append(Text("python -m brain [GLOBAL_OPTIONS] <category> <command> [ARGS] [OPTIONS]", style="bold green"))
    content_lines.append(Text())
    
    # Examples section
    content_lines.append(Text("Ejemplos:", style="bold cyan"))
    content_lines.append(Text())
    
    # Example 1: Basic command
    content_lines.append(Text("  # Comando básico", style="dim"))
    content_lines.append(Text("  python -m brain profile list", style="white"))
    content_lines.append(Text())
    
    # Example 2: With global flag BEFORE subcommand
    content_lines.append(Text("  # Con flag global (--json ANTES del subcomando)", style="dim"))
    content_lines.append(Text("  python -m brain --json profile create 'My Profile'", style="white"))
    content_lines.append(Text())
    
    # Example 3: With multiple global flags
    content_lines.append(Text("  # Con múltiples flags globales", style="dim"))
    content_lines.append(Text("  python -m brain --json --verbose nucleus list", style="white"))
    content_lines.append(Text())
    
    # Important note
    content_lines.append(Text("⚠️  IMPORTANTE:", style="bold yellow"))
    content_lines.append(Text("   Los flags globales (--json, --verbose) DEBEN ir ANTES del nombre de la categoría.", style="yellow"))
    content_lines.append(Text("   Ejemplo correcto:   python -m brain --json profile create 'test'", style="green"))
    content_lines.append(Text("   Ejemplo incorrecto: python -m brain profile create 'test' --json", style="red dim"))
    
    content = Text("\n").join(content_lines)
    
    console.print(Panel(
        content,
        title="[bold]Uso / Usage[/bold]",
        border_style="yellow",
        padding=(1, 2)
    ))


def _render_options(console: Console):
    """Render global CLI options with clear explanation."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    
    table.add_row("--json", "Salida en formato JSON (debe ir ANTES del comando)")
    table.add_row("--verbose", "Habilitar logging detallado (debe ir ANTES del comando)")
    table.add_row("--help", "Mostrar este mensaje de ayuda")
    
    console.print(Panel(
        table, 
        title="[bold]Opciones Globales / Global Options[/bold]",
        subtitle="[dim]Estas opciones deben ir inmediatamente después de 'python -m brain'[/dim]",
        border_style="green"
    ))


def _render_root_commands(console: Console, root_commands: List[BaseCommand]):
    """Render root-level commands if any exist."""
    if not root_commands:
        return
    
    content_lines = []
    
    for cmd in sorted(root_commands, key=lambda c: c.metadata().name):
        meta = cmd.metadata()
        temp_app = typer.Typer()
        cmd.register(temp_app)
        
        params = []
        if temp_app.registered_commands:
            registered = temp_app.registered_commands[0]
            params = _extract_params_with_help(registered.callback)
        
        # Command name and description
        cmd_display_name = meta.name.upper().replace('-', ' ')
        content_lines.append(Text(f"{cmd_display_name} - {meta.description}", style="bold white"))
        content_lines.append(Text())
        
        # Full syntax with GLOBAL OPTIONS
        syntax_parts = ["python -m brain", "[GLOBAL_OPTIONS]", meta.name]
        
        # Separate arguments and options
        arguments = [p for p in params if p.is_argument]
        options = [p for p in params if not p.is_argument]
        
        # Add arguments to syntax
        for arg in arguments:
            syntax_parts.append(arg.flag)
        
        # Add [OPTIONS] if there are any options
        if options:
            syntax_parts.append("[OPTIONS]")
        
        syntax = " ".join(syntax_parts)
        content_lines.append(Text(f"  {syntax}", style="green"))
        content_lines.append(Text())
        
        # Arguments section
        if arguments:
            content_lines.append(Text("  Argumentos:", style="bold cyan"))
            for arg in arguments:
                content_lines.append(Text(f"    {arg.flag:20} {arg.help_text}", style="white"))
            content_lines.append(Text())
        
        # Options section
        if options:
            content_lines.append(Text("  Opciones:", style="bold cyan"))
            for opt in options:
                content_lines.append(Text(f"    {opt.flag:20} {opt.help_text}", style="white"))
            content_lines.append(Text())
    
    # Remove trailing empty lines
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    
    content = Text("\n").join(content_lines)
    console.print(Panel(
        content,
        title="[bold]Quick Access[/bold]",
        border_style="magenta",
        padding=(1, 2)
    ))


def _render_categories(console: Console, categories: List[CommandCategory], structure: HelpStructure):
    """Render categories table with command counts."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="green", no_wrap=True)
    table.add_column(style="dim")
    table.add_column(style="cyan", justify="right")  # Nueva columna para contadores
    
    total_commands = 0
    
    for cat in categories:
        # Contar comandos en esta categoría
        count = len(structure.commands_by_category.get(cat, []))
        total_commands += count
        
        table.add_row(cat.value, cat.description, f"{count} cmd{'s' if count != 1 else ''}")
    
    # Fila de total (sin líneas extras arriba/abajo)
    table.add_row("", "", f"{'─' * 10}")
    table.add_row("", "", f"{total_commands} cmds", style="bold cyan")
    
    console.print(Panel(table, title="[bold]Categories[/bold]", border_style="green"))

def render_help(registry: CommandRegistry):
    """Main help rendering function with prioritized category order."""
    import sys
    
    # Detectar si stdout está siendo redirigido a un archivo
    is_file_output = not sys.stdout.isatty()
    
    # Configurar console según el contexto
    if is_file_output:
        # Para archivos: sin color, sin legacy Windows rendering, UTF-8
        console = Console(
            width=100,
            file=sys.stdout,
            force_terminal=False,
            legacy_windows=False,
            no_color=True
        )
    else:
        # Para terminal: con colores y formato normal
        console = Console(width=85)
    
    console.print("\n[bold yellow]Brain CLI[/bold yellow] - Modular system for Bloom\n")
    
    structure = _extract_structure(registry)
    
    # NEW: Render usage section FIRST to explain global options
    _render_usage(console)
    console.print()
    
    _render_options(console)
    console.print()
    _render_categories(console, structure.categories, structure)
    console.print()
    
    # Render root commands if any
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()
    
    # Priority order for categories
    priority_order = [
        CommandCategory.HEALTH,
        CommandCategory.NUCLEUS,
        CommandCategory.CONTEXT,
        CommandCategory.FILESYSTEM,
        CommandCategory.GITHUB,
        CommandCategory.PROJECT,
        CommandCategory.INTENT,
        CommandCategory.AI,
    ]
    
    # Render each category in priority order
    for category in priority_order:
        if category in structure.commands_by_category:
            commands = structure.commands_by_category[category]           
               
            _render_category_panel(console, category, commands)
            console.print()
    
    # Render any remaining categories not in priority list
    for category in structure.commands_by_category:
        if category not in priority_order:
            _render_category_panel(console, category, structure.commands_by_category[category])
            console.print()