"""Auto-generated help renderer using Rich."""
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
    categories: List[CommandCategory]
    commands_by_category: Dict[CommandCategory, List[BaseCommand]]
    root_commands: List[BaseCommand]


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
        categories=sorted(categories, key=lambda c: c.value),
        commands_by_category=dict(commands_by_category),
        root_commands=root_commands
    )


def _render_options(console: Console):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="cyan", no_wrap=True)
    table.add_column()
    table.add_row("--json", "Enable JSON output mode")
    table.add_row("--verbose", "Enable detailed logging")
    table.add_row("--help", "Show this help message")
    console.print(Panel(table, title="[bold]Options[/bold]", border_style="cyan"))


def _render_categories(console: Console, categories: List[CommandCategory]):
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_column(style="green", no_wrap=True)
    table.add_column(style="dim")
    for cat in categories:
        table.add_row(cat.value, cat.description)
    console.print(Panel(table, title="[bold]Categories[/bold]", border_style="green"))


def _extract_params(callback) -> List[str]:
    """Extract parameters from a command callback with SHORT FLAGS."""
    if not callback:
        return []
    
    params = []
    sig = inspect.signature(callback)
    
    for name, param in sig.parameters.items():
        if name == "ctx":
            continue
        
        default = param.default
        if isinstance(default, OptionInfo):
            if hasattr(default, "param_decls") and default.param_decls:
                # Prefer short flag (-o) over long (--output)
                short_flags = [f for f in default.param_decls if f.startswith('-') and not f.startswith('--')]
                long_flags = [f for f in default.param_decls if f.startswith('--')]
                flag = short_flags[0] if short_flags else (long_flags[0] if long_flags else default.param_decls[0])
                
                if default.default == ...:
                    params.append(f"[yellow]{flag} <VALUE>[/yellow]")
                else:
                    params.append(f"[cyan]{flag}[/cyan]")
            else:
                flag = f"--{name.replace('_', '-')}"
                if default.default == ...:
                    params.append(f"[yellow]{flag} <VALUE>[/yellow]")
                else:
                    params.append(f"[cyan]{flag}[/cyan]")
        elif param.default == inspect.Parameter.empty or isinstance(default, ArgumentInfo):
            params.append(f"[yellow]<{name.upper()}>[/yellow]")
    
    return params


def _render_commands(console: Console, commands_by_category: Dict[CommandCategory, List[BaseCommand]]):
    lines = []
    
    for category in sorted(commands_by_category.keys(), key=lambda c: c.value):
        commands = commands_by_category[category]
        lines.append(Text(f"\n{category.value.upper()}", style="bold cyan"))
        
        for cmd in sorted(commands, key=lambda c: c.metadata().name):
            meta = cmd.metadata()
            
            # Create temp app to extract command
            temp_app = typer.Typer()
            cmd.register(temp_app)
            
            if temp_app.registered_commands:
                registered = temp_app.registered_commands[0]
                params = _extract_params(registered.callback)
                params_str = " ".join(params) if params else ""
                
                # Full executable command
                full_cmd = f"python -m brain {category.value} {meta.name}"
                if params_str:
                    full_cmd += f" {params_str}"
                
                cmd_line = Text.from_markup(f"  [green]{full_cmd}[/green]")
                lines.append(cmd_line)
                
                if meta.description:
                    lines.append(Text(f"      {meta.description}", style="dim"))
    
    content = Text("\n").join(lines)
    console.print(Panel(content, title="[bold]Commands[/bold]", border_style="yellow"))


def _render_root_commands(console: Console, root_commands: List[BaseCommand]):
    if not root_commands:
        return
    
    lines = []
    
    for cmd in sorted(root_commands, key=lambda c: c.metadata().name):
        meta = cmd.metadata()
        temp_app = typer.Typer()
        cmd.register(temp_app)
        
        if temp_app.registered_commands:
            registered = temp_app.registered_commands[0]
            params = _extract_params(registered.callback)
            params_str = " ".join(params) if params else ""
            
            # Full executable command
            full_cmd = f"python -m brain {meta.name}"
            if params_str:
                full_cmd += f" {params_str}"
            
            cmd_line = Text.from_markup(f"[green]{full_cmd}[/green]")
            lines.append(cmd_line)
            
            if meta.description:
                lines.append(Text(f"    {meta.description}", style="dim"))
    
    if lines:
        content = Text("\n").join(lines)
        console.print(Panel(content, title="[bold]Quick Access[/bold]", border_style="magenta"))


def render_help(registry: CommandRegistry):
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