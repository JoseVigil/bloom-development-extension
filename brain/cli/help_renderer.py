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
    subsections = defaultdict(list)
    
    # Mapping of prefixes to subsection titles
    section_titles = {
        'auth': 'AUTENTICACIÓN',
        'repos': 'REPOSITORIOS',
        'orgs': 'ORGANIZACIONES',
    }
    
    for cmd in commands:
        name = cmd.metadata().name
        if '-' in name:
            prefix = name.split('-')[0]
            section_name = section_titles.get(prefix, prefix.upper())
            subsections[section_name].append(cmd)
        else:
            subsections['_main'].append(cmd)
    
    # If we only have _main or only have a few commands, don't create subsections
    if len(subsections) == 1 or len(commands) <= 3:
        return {'': commands}
    
    # Remove empty _main if exists
    result = {k: v for k, v in subsections.items() if k != '_main' or v}
    
    # If _main has items and there are subsections, add _main items to first subsection
    if '_main' in result and len(result) > 1:
        main_items = result.pop('_main')
        # Create a general section or merge with first section
        if main_items:
            result['GENERAL'] = main_items
    
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
    
    # 2. Full command syntax
    syntax_parts = ["python -m brain", category.value, meta.name]
    
    # Add required parameters to syntax
    required_params = [p for p in params if p.is_required]
    optional_params = [p for p in params if not p.is_required]
    
    for param in required_params:
        syntax_parts.append(param.flag)
    
    if optional_params:
        syntax_parts.append("[OPTIONS]")
    
    syntax = " ".join(syntax_parts)
    lines.append(Text(f"  {syntax}", style="green"))
    lines.append(Text())  # Empty line
    
    # 3. Required parameters section
    if required_params:
        lines.append(Text("  Parámetros requeridos:", style="bold cyan"))
        for param in required_params:
            flag_display = param.flag.split()[0]  # Remove <VALUE> for display
            lines.append(Text(f"    {flag_display:20} {param.help_text}", style="white"))
        lines.append(Text())  # Empty line
    
    # 4. Optional parameters section
    if optional_params:
        lines.append(Text("  Parámetros opcionales:", style="bold cyan"))
        for param in optional_params:
            lines.append(Text(f"    {param.flag:20} {param.help_text}", style="white"))
        lines.append(Text())  # Empty line
    
    # 5. Arguments/Targets section (if any non-flag arguments)
    arguments = [p for p in params if p.is_argument]
    if arguments:
        lines.append(Text("  Argumentos:", style="bold cyan"))
        for arg in arguments:
            lines.append(Text(f"    {arg.flag:20} {arg.help_text}", style="white"))
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


def _render_options(console: Console):
    """Render global CLI options."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    table.add_row("--json", "Enable JSON output mode")
    table.add_row("--verbose", "Enable detailed logging")
    table.add_row("--help", "Show this help message")
    console.print(Panel(table, title="[bold]Options[/bold]", border_style="green"))


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
        
        # Full syntax
        syntax_parts = ["python -m brain", meta.name]
        
        required_params = [p for p in params if p.is_required]
        optional_params = [p for p in params if not p.is_required]
        
        for param in required_params:
            syntax_parts.append(param.flag)
        
        if optional_params:
            syntax_parts.append("[OPTIONS]")
        
        syntax = " ".join(syntax_parts)
        content_lines.append(Text(f"  {syntax}", style="green"))
        content_lines.append(Text())
        
        # Parameters
        if required_params:
            content_lines.append(Text("  Parámetros requeridos:", style="bold cyan"))
            for param in required_params:
                flag_display = param.flag.split()[0]
                content_lines.append(Text(f"    {flag_display:20} {param.help_text}", style="white"))
            content_lines.append(Text())
        
        if optional_params:
            content_lines.append(Text("  Parámetros opcionales:", style="bold cyan"))
            for param in optional_params:
                content_lines.append(Text(f"    {param.flag:20} {param.help_text}", style="white"))
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


def _render_categories(console: Console, categories: List[CommandCategory]):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="green", no_wrap=True)
    table.add_column(style="dim")
    for cat in categories:
        table.add_row(cat.value, cat.description)
    console.print(Panel(table, title="[bold]Categories[/bold]", border_style="green"))


def render_help(registry: CommandRegistry):
    """Main help rendering function with prioritized category order."""
    console = Console()
    
    console.print("\n[bold yellow]Brain CLI[/bold yellow] - Modular system for Bloom\n")
    
    structure = _extract_structure(registry)
    
    _render_options(console)
    console.print()
    _render_categories(console, structure.categories)
    console.print()
    
    # Render root commands if any
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()
    
    # Priority order for categories
    priority_order = [
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
            _render_category_panel(console, category, structure.commands_by_category[category])
            console.print()
    
    # Render any remaining categories not in priority list
    for category in structure.commands_by_category:
        if category not in priority_order:
            _render_category_panel(console, category, structure.commands_by_category[category])
            console.print()