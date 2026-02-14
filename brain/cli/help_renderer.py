"""
Auto-generated help renderer with AI-Native JSON Schema support.
REFACTORED: Modern CLI design with vibrant aesthetics and optimized code structure.
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
from rich.align import Align
import typer
from typer.models import OptionInfo, ArgumentInfo
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.cli.registry import CommandRegistry


# ============================================================================
# COLOR SCHEME - Modern Vibrant Palette
# ============================================================================
class ColorScheme:
    """Unified color palette for modern CLI aesthetics"""
    # Primary colors
    NEON_CYAN = "bright_cyan"
    NEON_GREEN = "bright_green"
    NEON_MAGENTA = "bright_magenta"
    ELECTRIC_BLUE = "dodger_blue1"
    
    # Accent colors
    GOLD = "gold1"
    CORAL = "light_coral"
    LAVENDER = "plum2"
    RED = "red"
    
    # Neutral colors
    WHITE = "white"
    SILVER = "grey74"
    DIM = "grey50"
    DARKER = "grey35"
    
    # Semantic colors
    SUCCESS = "bright_green"
    WARNING = "yellow"
    ERROR = "bright_red"
    INFO = "bright_cyan"


# ============================================================================
# UNICODE SYMBOLS - Modern Visual Elements
# ============================================================================
class Symbols:
    """Modern Unicode symbols for visual hierarchy"""
    COMMAND = "▸"
    ITEM = "•"
    SEPARATOR = "─"
    HEAVY_SEP = "═"
    LEFT_BRACKET = "┫"
    RIGHT_BRACKET = "┣"
    ARROW = "→"
    CHECKMARK = "✓"
    STAR = "★"
    BOX = "▪"


# ============================================================================
# VISUAL HELPERS - DRY Principle
# ============================================================================
def draw_section_header(title: str, style: str = ColorScheme.NEON_CYAN) -> Text:
    """Creates a modern section header with Unicode decorations"""
    decoration = f"{Symbols.HEAVY_SEP * 3}{Symbols.LEFT_BRACKET}"
    return Text(f"{decoration} {title.upper()} {Symbols.RIGHT_BRACKET}{Symbols.HEAVY_SEP * 3}", style=f"bold {style}")


def draw_gradient_line(width: int = 80, char: str = None) -> Text:
    """Creates a visual separator line"""
    if char is None:
        char = Symbols.SEPARATOR
    return Text(char * width, style=ColorScheme.DIM)


def create_command_badge(count: int) -> str:
    """Creates a visual badge for command counts"""
    return f"* {count} cmd{'s' if count != 1 else ''}" 


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


def _extract_option_flag(name: str, default: OptionInfo) -> str:
    """Extracts the primary flag from OptionInfo, showing both short and long forms"""
    if hasattr(default, "param_decls") and default.param_decls:
        short_flags = [f for f in default.param_decls if f.startswith('-') and not f.startswith('--')]
        long_flags = [f for f in default.param_decls if f.startswith('--')]
        
        # Show both short and long flags if both exist
        if short_flags and long_flags:
            return f"{short_flags[0]}, {long_flags[0]}"
        elif long_flags:
            return long_flags[0]
        elif short_flags:
            return short_flags[0]
        else:
            return default.param_decls[0]
    
    return f"--{name.replace('_', '-')}"


def _extract_default_value(default: OptionInfo, is_required: bool) -> Optional[Any]:
    """Extracts and formats default value from OptionInfo"""
    if is_required or default.default is None:
        return None
    
    if isinstance(default.default, (str, int, float, bool)):
        return default.default
    elif isinstance(default.default, Path):
        return str(default.default)
    else:
        return str(default.default)


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
            flag = _extract_option_flag(name, default)
            help_text = default.help or ""
            is_required = default.default == ...
            default_val = _extract_default_value(default, is_required)
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
    
    # Títulos profesionales con contexto de categoría
    section_titles = {
        'auth': 'Authentication & Authorization',
        'repos': 'Repository Management',
        'orgs': 'Organization Management',
        'build': 'Build & Compilation',
        'keys': 'API Key Management',
        'accounts': 'Account Operations',
        'read': 'Log Analysis & Debugging',
        'exp': 'Exploration & Discovery',
        'add': 'Adding & Linking',
        'list': 'Listing & Inspection',
        'create': 'Creation & Initialization',
        'onboarding': 'Onboarding & Setup',
        'project': 'Project Operations',
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


def _render_header(console: Console):
    """Renders minimalist centered header"""
    exe_type = "Executable" if is_frozen_executable() else "Dev Mode"
    
    title = Text()
    title.append("BRAIN CLI", style=f"bold {ColorScheme.NEON_CYAN}")
    title.append(" ", style="")
    title.append(Symbols.SEPARATOR * 3, style=ColorScheme.DIM)
    title.append(" ", style="")
    title.append("Modular System for Bloom", style=ColorScheme.SILVER)
    title.append(" ", style="")
    title.append(f"({exe_type})", style=ColorScheme.DARKER)
    
    console.print()
    console.print(Align.center(title))
    console.print(Align.center(draw_gradient_line(60)))
    console.print()


def _render_usage(console: Console):
    """Renders generic usage section without specific examples"""
    content_lines = []
    exe_name = get_executable_name()
    
    content_lines.append(draw_section_header("USAGE", ColorScheme.NEON_GREEN))
    content_lines.append(Text())
    
    content_lines.append(Text(f"  {exe_name} ", style=ColorScheme.SILVER) + 
                        Text("[GLOBAL_OPTIONS] ", style=ColorScheme.GOLD) +
                        Text("<category> <command> ", style=f"bold {ColorScheme.NEON_CYAN}") +
                        Text("[OPTIONS] [ARGS]", style=ColorScheme.LAVENDER))
    content_lines.append(Text())
    
    note = Text()
    note.append(f"  {Symbols.ITEM} ", style=ColorScheme.GOLD)
    note.append("Global options (", style=ColorScheme.DIM)
    note.append("--json", style=ColorScheme.NEON_CYAN)
    note.append(", ", style=ColorScheme.DIM)
    note.append("--verbose", style=ColorScheme.NEON_CYAN)
    note.append(") must precede ", style=ColorScheme.DIM)
    note.append("<category>", style=f"bold {ColorScheme.NEON_CYAN}")
    content_lines.append(note)
    
    content_lines.append(Text())
    
    content_lines.append(Text(f"  {Symbols.ARROW} ", style=ColorScheme.ELECTRIC_BLUE) +
                        Text("View all commands: ", style=ColorScheme.DIM) +
                        Text(f"{exe_name} --help --full", style=f"bold {ColorScheme.NEON_CYAN}"))
    
    content_lines.append(Text(f"  {Symbols.ARROW} ", style=ColorScheme.ELECTRIC_BLUE) +
                        Text("Category help: ", style=ColorScheme.DIM) +
                        Text(f"{exe_name} <category> --help", style=f"bold {ColorScheme.NEON_CYAN}"))
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_options(console: Console):
    """Renders global options with modern styling"""
    content_lines = []
    
    content_lines.append(draw_section_header("GLOBAL OPTIONS", ColorScheme.NEON_MAGENTA))
    content_lines.append(Text())
    
    options = [
        ("--json", "Output in JSON format", ColorScheme.NEON_CYAN),
        ("--verbose", "Enable detailed logging", ColorScheme.NEON_GREEN),
        ("--help", "Show help information", ColorScheme.GOLD),
        ("--version", "Brain Version Number", ColorScheme.ELECTRIC_BLUE),
        ("--info", "Technicall System Information", ColorScheme.RED)
    ]
    
    for flag, desc, color in options:
        line = Text()
        line.append(f"  {Symbols.ITEM} ", style=ColorScheme.DIM)
        line.append(f"{flag:15}", style=f"bold {color}")
        line.append(desc, style=ColorScheme.SILVER)
        content_lines.append(line)
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_categories(console: Console, categories: List[CommandCategory], structure: HelpStructure):
    """Renders categories with modern badges and visual hierarchy"""
    content_lines = []
    
    content_lines.append(draw_section_header("CATEGORIES", ColorScheme.ELECTRIC_BLUE))
    content_lines.append(Text())
    
    total_commands = 0
    
    # Calcular ancho máximo de descripción para alinear badges
    max_desc_len = 0
    for cat in categories:
        desc_len = len(cat.category_description)
        if desc_len > max_desc_len:
            max_desc_len = desc_len
    
    for cat in categories:
        commands = structure.commands_by_category.get(cat, [])
        
        count = 0
        for cmd_obj in commands:
            discovered = _discover_commands_from_class(cmd_obj, cat)
            count += len(discovered)
        
        total_commands += count
        
        line = Text()
        line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.NEON_CYAN)
        line.append(f"{cat.category_name:15}", style=f"bold {ColorScheme.NEON_CYAN}")  # CYAN para nombres
        
        # Padding para alinear badges
        desc = cat.category_description
        padding_needed = max_desc_len - len(desc) + 3
        line.append(desc, style=ColorScheme.SILVER)
        line.append(" " * padding_needed)
        line.append(f"{count} cmd{'s' if count != 1 else ''}", style=ColorScheme.GOLD)
        content_lines.append(line)
    
    content_lines.append(Text())
    content_lines.append(Text(f"  {Symbols.SEPARATOR * 70}", style=ColorScheme.DIM))
    
    total_line = Text()
    total_line.append(f"  {Symbols.CHECKMARK} ", style=ColorScheme.SUCCESS)
    total_line.append("TOTAL: ", style=f"bold {ColorScheme.WHITE}")
    total_line.append(f"{len(structure.categories)} categories", style=ColorScheme.SILVER)
    total_line.append(" • ", style=ColorScheme.DIM)
    total_line.append(f"{total_commands} commands", style=f"bold {ColorScheme.NEON_CYAN}")
    content_lines.append(total_line)
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_root_commands(console: Console, root_commands: List[BaseCommand]):
    """Renders root commands with modern styling"""
    if not root_commands:
        return
    
    content_lines = []
    exe_name = get_executable_name()
    
    content_lines.append(draw_section_header("QUICK ACCESS", ColorScheme.CORAL))
    content_lines.append(Text())
    
    for cmd in sorted(root_commands, key=lambda c: c.metadata().name):
        discovered = _discover_commands_from_class(cmd, CommandCategory.SYSTEM)
        for dcmd in discovered:
            params = _extract_params_with_help(dcmd.callback)
            
            line = Text()
            line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.CORAL)
            line.append(dcmd.name.upper().replace('-', ' '), style=f"bold {ColorScheme.WHITE}")
            content_lines.append(line)
            
            content_lines.append(Text(f"    {dcmd.description}", style=ColorScheme.SILVER))
            content_lines.append(Text())
            
            syntax_parts = [exe_name, "[GLOBAL_OPTIONS]", dcmd.name]
            arguments = [p for p in params if p.is_argument]
            options = [p for p in params if not p.is_argument]
            
            for arg in arguments:
                syntax_parts.append(arg.flag)
            if options:
                syntax_parts.append("[OPTIONS]")
            
            syntax = " ".join(syntax_parts)
            content_lines.append(Text(f"    {syntax}", style=ColorScheme.NEON_GREEN))
            content_lines.append(Text())
            
            if arguments:
                content_lines.append(Text(f"    {Symbols.BOX} Arguments:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for arg in arguments:
                    content_lines.append(Text(f"      {arg.flag:20} {arg.help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
            
            if options:
                content_lines.append(Text(f"    {Symbols.BOX} Options:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for opt in options:
                    content_lines.append(Text(f"      {opt.flag:20} {opt.help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_category_panel(console: Console, category: CommandCategory, commands: List[BaseCommand]):
    """Renders detailed category panel with modern design"""
    discovered_all = []
    for cmd in commands:
        discovered_all.extend(_discover_commands_from_class(cmd, category))
    
    if not discovered_all:
        return
    
    subsections = _detect_subsections(category, discovered_all)
    content_lines = []
    exe_name = get_executable_name()
    
    # Salto de línea antes
    content_lines.append(Text())
    
    # Category header CENTRADO con = como separadores (MAGENTA)
    header_text = category.category_name.upper()
    total_width = 120
    header_content = f"[ {header_text} ]"
    padding = (total_width - len(header_content)) // 2
    left_sep = "=" * padding
    right_sep = "=" * (total_width - padding - len(header_content))
    
    header = Text()
    header.append(left_sep, style=ColorScheme.NEON_MAGENTA)
    header.append(f"[ {header_text} ]", style=f"bold {ColorScheme.NEON_MAGENTA}")
    header.append(right_sep, style=ColorScheme.NEON_MAGENTA)
    content_lines.append(header)
    
    # Descripción centrada en MAGENTA
    desc_padding = (total_width - len(category.category_description)) // 2
    content_lines.append(Text())
    content_lines.append(Text(" " * desc_padding + category.category_description, style=ColorScheme.NEON_MAGENTA))
    content_lines.append(Text())
    content_lines.append(Text())
    
    for section_title, section_cmds in subsections.items():
        if section_title:
            # Subsección en BLANCO
            subsec_header = Text()
            subsec_header.append(f"  {Symbols.BOX} ", style=ColorScheme.WHITE)
            subsec_header.append(section_title.upper(), style=f"bold {ColorScheme.WHITE}")
            content_lines.append(subsec_header)
            content_lines.append(Text(f"  {Symbols.SEPARATOR * (len(section_title) + 4)}", style=ColorScheme.DIM))
            content_lines.append(Text())
        
        for dcmd in sorted(section_cmds, key=lambda c: c.name):
            params = _extract_params_with_help(dcmd.callback)
            
            # Nombre del comando en GOLD (amarillo)
            cmd_line = Text()
            cmd_line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.GOLD)
            cmd_line.append(dcmd.name, style=f"bold {ColorScheme.GOLD}")
            content_lines.append(cmd_line)
            
            content_lines.append(Text(f"    {dcmd.description}", style=ColorScheme.SILVER))
            
            syntax_parts = [exe_name, category.category_name, dcmd.name]
            arguments = [p for p in params if p.is_argument]
            options = [p for p in params if not p.is_argument]
            
            for arg in arguments:
                syntax_parts.append(arg.flag)
            if options:
                syntax_parts.append("[OPTIONS]")
            
            syntax = " ".join(syntax_parts)
            content_lines.append(Text(f"    {syntax}", style=ColorScheme.NEON_GREEN))
            content_lines.append(Text())
            
            if arguments:
                content_lines.append(Text(f"    {Symbols.BOX} Arguments:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for arg in arguments:
                    help_text = arg.help_text or "Sin descripción"
                    content_lines.append(Text(f"      {arg.flag:20} {help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
            
            if options:
                content_lines.append(Text(f"    {Symbols.BOX} Options:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for opt in options:
                    help_text = opt.help_text or "Sin descripción"
                    default_info = f" [default: {opt.default_value}]" if opt.default_value is not None else ""
                    content_lines.append(Text(f"      {opt.flag:25} {opt.help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
    
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    
    content_lines.append(Text())
    
    content = Text("\n").join(content_lines)
    console.print(content)


def render_help(registry: CommandRegistry, json_mode: bool = False, ai_native: bool = False, full_help: bool = False):
    """
    Renders the complete system help with modern aesthetics.
    
    Args:
        registry: Command registry
        json_mode: Enable JSON output
        ai_native: Enable AI-Native JSON schema
        full_help: If True, renders all commands from all categories
    """
    
    import io
    
    # CRÍTICO: Proteger contra stdout/stderr cerrados en PyInstaller
    # Esto puede pasar cuando subprocess captura la salida
    try:
        # Intentar acceder a stdout para verificar que funciona
        _ = sys.stdout.fileno()
    except (ValueError, AttributeError, OSError):
        # stdout está cerrado o inválido - recrear
        try:
            sys.stdout = io.TextIOWrapper(
                open(1, 'wb', buffering=0),
                encoding='utf-8',
                errors='replace',
                write_through=True
            )
        except:
            # Si todo falla, crear un StringIO temporal
            sys.stdout = io.StringIO()
    
    try:
        _ = sys.stderr.fileno()
    except (ValueError, AttributeError, OSError):
        try:
            sys.stderr = io.TextIOWrapper(
                open(2, 'wb', buffering=0),
                encoding='utf-8',
                errors='replace',
                write_through=True
            )
        except:
            sys.stderr = io.StringIO()
    
    # Guardar referencia al stdout original ANTES de modificarlo
    original_stdout = sys.stdout
    original_buffer = sys.stdout.buffer if hasattr(sys.stdout, 'buffer') else None
    
    if not sys.stdout.isatty():
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(
                sys.stdout.buffer, 
                encoding='utf-8', 
                errors='replace',
                line_buffering=False
            )
    
    if ai_native or (json_mode and "--ai" in sys.argv):
        ai_schema = _build_ai_native_json(registry)
        sys.stdout.write(json.dumps(ai_schema, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.write('\n')
        sys.stdout.flush()
        return
    
    if json_mode:
        json_data = _build_json_structure(registry)
        sys.stdout.write(json.dumps(json_data, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.write('\n')
        sys.stdout.flush()
        return
    
    try:
        is_file_output = not sys.stdout.isatty()
    except (ValueError, AttributeError):
        # Si stdout está cerrado o no disponible (ej: capturado por subprocess), asumir redirección
        is_file_output = True
    
    if is_file_output:
        console = Console(
            record=True,
            width=120,  
            force_terminal=False,
            legacy_windows=False,
            file=io.StringIO()  
        )
    else:
        console = Console(width=120)  
    
    structure = _extract_structure(registry)
    
    _render_header(console)
    _render_usage(console)
    console.print()
    _render_options(console)
    console.print()
    _render_categories(console, structure.categories, structure)
    console.print()
    
    if structure.root_commands:
        _render_root_commands(console, structure.root_commands)
        console.print()
    
    if full_help:
        priority_order = [
            CommandCategory.HEALTH, CommandCategory.SYSTEM, CommandCategory.NUCLEUS,
            CommandCategory.PROJECT, CommandCategory.PROFILE, CommandCategory.EXTENSION,
            CommandCategory.SYNAPSE, CommandCategory.SERVICE, CommandCategory.RUNTIME,
            CommandCategory.CONTEXT, CommandCategory.INTENT, CommandCategory.FILESYSTEM,
            CommandCategory.GITHUB, CommandCategory.AI, CommandCategory.TWITTER,
            CommandCategory.CHROME,
        ]
        
        # Convertir a set para búsqueda eficiente
        priority_set = set(priority_order)
        
        for category in priority_order:
            if category in structure.commands_by_category:
                commands = structure.commands_by_category[category]
                _render_category_panel(console, category, commands)
        
        for category in structure.commands_by_category:
            if category not in priority_set:
                _render_category_panel(console, category, structure.commands_by_category[category])
    else:
        footer = Text()
        footer.append(f"\n  {Symbols.ARROW} ", style=ColorScheme.ELECTRIC_BLUE)
        footer.append("To see all detailed commands: ", style=ColorScheme.DIM)
        footer.append(f"{get_executable_name()} --help --full\n", style=f"bold {ColorScheme.NEON_CYAN}")
        console.print(footer)

    if is_file_output:
        full_output = console.export_text()
        
        # Usar el buffer original guardado al inicio
        try:
            if original_buffer:
                original_buffer.write(full_output.encode('utf-8'))
                original_buffer.flush()
            elif hasattr(original_stdout, 'buffer'):
                original_stdout.buffer.write(full_output.encode('utf-8'))
                original_stdout.buffer.flush()
            else:
                original_stdout.write(full_output)
                original_stdout.flush()
        except (ValueError, OSError) as e:
            # Si el buffer está cerrado, intentar con print directo
            print(full_output, file=original_stdout, flush=True)