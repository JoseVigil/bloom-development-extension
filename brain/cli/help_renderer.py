"""
Auto-generated help renderer using Rich.
NO MAINTENANCE REQUIRED - reads from command metadata.
"""
from dataclasses import dataclass
from collections import defaultdict
from typing import Dict, List
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
    """Extracted structure from registry."""
    categories: List[CommandCategory]
    commands_by_category: Dict[CommandCategory, List[BaseCommand]]
    root_commands: List[BaseCommand]


def _extract_structure(registry: CommandRegistry) -> HelpStructure:
    """Extract help structure from registry."""
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


def _render_options(console: Console):
    """Render global options section."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    
    table.add_row("--json", "Enable JSON output mode")
    table.add_row("--verbose", "Enable detailed logging")
    table.add_row("--help", "Show this help message")
    
    console.print(Panel(table, title="[bold]Options[/bold]", border_style="cyan"))


def _render_categories(console: Console, categories: List[CommandCategory]):
    """Render available categories."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="green", no_wrap=True)
    table.add_column(style="dim")
    
    for cat in categories:
        table.add_row(cat.value, cat.description)
    
    console.print(Panel(table, title="[bold]Categories[/bold]", border_style="green"))


def _extract_subcommands(cmd: BaseCommand) -> List[tuple]:
    """Extract subcommands from a command group."""
    
    # Create temporary Typer app to introspect
    temp_app = typer.Typer()
    cmd.register(temp_app)
    
    subcommands = []
    for registered_cmd in temp_app.registered_commands:
        # Extract parameters
        params = []
        if registered_cmd.callback:
            sig = inspect.signature(registered_cmd.callback)
            for name, param in sig.parameters.items():
                if name == "ctx":
                    continue
                
                default = param.default
                if isinstance(default, OptionInfo):
                    # Extract flag name
                    if hasattr(default, "param_decls") and default.param_decls:
                        # Use the longest flag (usually the --long-form)
                        flags = [f for f in default.param_decls if f.startswith('--')]
                        flag = flags[0] if flags else default.param_decls[0]
                        
                        # Check if required
                        if default.default == ...:
                            params.append(f"[yellow]{flag} <VALUE>[/yellow]")
                        else:
                            params.append(f"[cyan]{flag}[/cyan]")
                    else:
                        flag_name = f"--{name.replace('_', '-')}"
                        if default.default == ...:
                            params.append(f"[yellow]{flag_name} <VALUE>[/yellow]")
                        else:
                            params.append(f"[cyan]{flag_name}[/cyan]")
                elif param.default == inspect.Parameter.empty or isinstance(default, ArgumentInfo):
                    # It's a required argument
                    params.append(f"[yellow]<{name.upper()}>[/yellow]")
        
        # Get help text
        help_text = registered_cmd.help or ""
        if help_text:
            help_text = help_text.split('\n')[0]  # First line only
        
        subcommands.append((registered_cmd.name, params, help_text))
    
    return subcommands


def _render_commands(console: Console, commands_by_category: Dict[CommandCategory, List[BaseCommand]]):
    """Render all commands grouped by category."""
    lines = []
    
    for category in sorted(commands_by_category.keys(), key=lambda c: c.value):
        commands = commands_by_category[category]
        
        # Category header
        lines.append(Text(f"\n{category.value.upper()}", style="bold cyan"))
        
        for cmd in sorted(commands, key=lambda c: c.metadata().name):
            meta = cmd.metadata()
            
            # Extract subcommands
            subcommands = _extract_subcommands(cmd)
            
            if subcommands:
                # Multi-command group (like auth with login/logout/status)
                for subcmd_name, params, help_text in subcommands:
                    # Build full command: brain github auth login --token <VALUE>
                    full_cmd = f"  {meta.name} {subcmd_name}"
                    params_str = " ".join(params) if params else ""
                    
                    cmd_line = Text(full_cmd, style="green")
                    if params_str:
                        cmd_line.append(" ")
                        cmd_line.append(Text.from_markup(params_str))
                    
                    lines.append(cmd_line)
                    
                    if help_text:
                        lines.append(Text(f"      {help_text}", style="dim"))
            else:
                # Single command without subcommands
                cmd_line = Text(f"  {meta.name}", style="green")
                lines.append(cmd_line)
                
                if meta.description:
                    lines.append(Text(f"      {meta.description}", style="dim"))
    
    # Join all lines
    content = Text("\n").join(lines)
    console.print(Panel(content, title="[bold]Commands[/bold]", border_style="yellow"))


def _render_root_commands(console: Console, root_commands: List[BaseCommand]):
    """Render root-level commands if any exist."""
    if not root_commands:
        return
    
    lines = []
    
    for cmd in sorted(root_commands, key=lambda c: c.metadata().name):
        meta = cmd.metadata()
        subcommands = _extract_subcommands(cmd)
        
        if subcommands:
            # Root command with subcommands (like nucleus)
            for subcmd_name, params, help_text in subcommands:
                full_cmd = f"{meta.name} {subcmd_name}"
                params_str = " ".join(params) if params else ""
                
                cmd_line = Text(full_cmd, style="green")
                if params_str:
                    cmd_line.append(" ")
                    cmd_line.append(Text.from_markup(params_str))
                
                lines.append(cmd_line)
                
                if help_text:
                    lines.append(Text(f"    {help_text}", style="dim"))
        else:
            # Simple root command (like tree, context, load)
            # Extract its parameters
            temp_app = typer.Typer()
            cmd.register(temp_app)
            
            if temp_app.registered_commands:
                registered = temp_app.registered_commands[0]
                params = []
                
                if registered.callback:
                    sig = inspect.signature(registered.callback)
                    for name, param in sig.parameters.items():
                        if name == "ctx":
                            continue
                        
                        default = param.default
                        if isinstance(default, OptionInfo):
                            if hasattr(default, "param_decls") and default.param_decls:
                                flags = [f for f in default.param_decls if f.startswith('--')]
                                flag = flags[0] if flags else default.param_decls[0]
                                
                                if default.default == ...:
                                    params.append(f"[yellow]{flag} <VALUE>[/yellow]")
                                else:
                                    params.append(f"[cyan]{flag}[/cyan]")
                        elif param.default == inspect.Parameter.empty or isinstance(default, ArgumentInfo):
                            params.append(f"[yellow]<{name.upper()}>[/yellow]")
                
                cmd_line = Text(meta.name, style="green")
                if params:
                    cmd_line.append(" ")
                    cmd_line.append(Text.from_markup(" ".join(params)))
                
                lines.append(cmd_line)
                
                if meta.description:
                    lines.append(Text(f"    {meta.description}", style="dim"))
    
    if lines:
        content = Text("\n").join(lines)
        console.print(Panel(content, title="[bold]Quick Access[/bold]", border_style="magenta"))


def render_help(registry: CommandRegistry):
    """
    Render complete help from command registry.
    AUTO-GENERATED - no maintenance needed when adding commands.
    """
    console = Console()
    
    console.print("\n[bold yellow]Brain CLI[/bold yellow] - Modular system for Bloom\n")
    
    structure = _extract_structure(registry)
    
    _render_options(console)
    console.print()
    
    _render_categories(console, structure.categories)
    console.print()
    
    _render_commands(console, structure.commands_by_category)
    console.print()
    
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()