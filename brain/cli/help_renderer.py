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
    HEAVY_SEP = "━"
    LEFT_BRACKET = "┫"
    RIGHT_BRACKET = "┣"
    ARROW = "→"
    CHECKMARK = "✓"
    STAR = "★"
    BOX = "▪"


# ============================================================================
# JSON ENCODER
# ============================================================================
class JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Path):
            return str(obj)
        if isinstance(obj, CommandCategory):
            return obj.category_name
        if hasattr(obj, '__dict__'):
            return obj.__dict__
        return super().default(obj)


# ============================================================================
# EXECUTABLE DETECTION
# ============================================================================
def is_frozen_executable():
    return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')


def get_executable_name():
    return "brain" if is_frozen_executable() else "python brain/__main__.py"


# ============================================================================
# DATA STRUCTURES
# ============================================================================
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


# ============================================================================
# VISUAL HELPERS - DRY Principle
# ============================================================================
def draw_section_header(title: str, style: str = ColorScheme.NEON_CYAN) -> Text:
    """Creates a modern section header with Unicode decorations"""
    decoration = f"{Symbols.HEAVY_SEP * 3}{Symbols.LEFT_BRACKET}"
    return Text(f"{decoration} {title.upper()} {Symbols.RIGHT_BRACKET}{Symbols.HEAVY_SEP * 3}", style=f"bold {style}")


def draw_gradient_line(width: int = 80, char: str = Symbols.SEPARATOR) -> Text:
    """Creates a visual separator line"""
    return Text(char * width, style=ColorScheme.DIM)


def create_command_badge(count: int) -> str:
    """Creates a visual badge for command counts"""
    return f"{Symbols.STAR} {count} cmd{'s' if count != 1 else ''}"


# ============================================================================
# TYPE CONVERSION
# ============================================================================
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


# ============================================================================
# COMMAND DISCOVERY
# ============================================================================
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


# ============================================================================
# PARAMETER EXTRACTION
# ============================================================================
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


def _extract_option_flag(name: str, default: OptionInfo) -> str:
    """Extracts the primary flag from OptionInfo"""
    if hasattr(default, "param_decls") and default.param_decls:
        short_flags = [f for f in default.param_decls if f.startswith('-') and not f.startswith('--')]
        long_flags = [f for f in default.param_decls if f.startswith('--')]
        return short_flags[0] if short_flags else (long_flags[0] if long_flags else default.param_decls[0])
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


# ============================================================================
# SUBSECTION DETECTION
# ============================================================================
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


# ============================================================================
# JSON BUILDERS
# ============================================================================
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


# ============================================================================
# MODERN RENDERERS
# ============================================================================
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
    
    # Header
    content_lines.append(draw_section_header("USAGE", ColorScheme.NEON_GREEN))
    content_lines.append(Text())
    
    # Generic syntax
    content_lines.append(Text(f"  {exe_name} ", style=ColorScheme.SILVER) + 
                        Text("[GLOBAL_OPTIONS] ", style=ColorScheme.GOLD) +
                        Text("<category> <command> ", style=f"bold {ColorScheme.NEON_CYAN}") +
                        Text("[OPTIONS] [ARGS]", style=ColorScheme.LAVENDER))
    content_lines.append(Text())
    
    # Global options note
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
    
    # Quick help hints
    content_lines.append(Text(f"  {Symbols.ARROW} ", style=ColorScheme.ELECTRIC_BLUE) +
                        Text("View all commands: ", style=ColorScheme.DIM) +
                        Text(f"{exe_name} --help --full", style=f"bold {ColorScheme.NEON_CYAN}"))
    
    content_lines.append(Text(f"  {Symbols.ARROW} ", style=ColorScheme.ELECTRIC_BLUE) +
                        Text("Category help: ", style=ColorScheme.DIM) +
                        Text(f"{exe_name} <category> --help", style=f"bold {ColorScheme.NEON_CYAN}"))
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_global_options(console: Console):
    """Renders global options with modern styling"""
    content_lines = []
    
    content_lines.append(draw_section_header("GLOBAL OPTIONS", ColorScheme.NEON_MAGENTA))
    content_lines.append(Text())
    
    options = [
        ("--json", "Output in JSON format", ColorScheme.NEON_CYAN),
        ("--verbose", "Enable detailed logging", ColorScheme.NEON_GREEN),
        ("--help", "Show help information", ColorScheme.GOLD),
    ]
    
    for flag, desc, color in options:
        line = Text()
        line.append(f"  {Symbols.ITEM} ", style=ColorScheme.DIM)
        line.append(f"{flag:15}", style=f"bold {color}")
        line.append(desc, style=ColorScheme.SILVER)
        content_lines.append(line)
    
    content = Text("\n").join(content_lines)
    console.print(content)


def _render_categories_overview(console: Console, structure: HelpStructure):
    """Renders categories with modern badges and visual hierarchy"""
    content_lines = []
    
    content_lines.append(draw_section_header("CATEGORIES", ColorScheme.ELECTRIC_BLUE))
    content_lines.append(Text())
    
    total_commands = 0
    
    for cat in structure.categories:
        commands = structure.commands_by_category.get(cat, [])
        
        # Count actual commands
        count = 0
        for cmd_obj in commands:
            discovered = _discover_commands_from_class(cmd_obj, cat)
            count += len(discovered)
        
        total_commands += count
        
        line = Text()
        line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.NEON_CYAN)
        line.append(f"{cat.category_name:15}", style=f"bold {ColorScheme.WHITE}")
        line.append(f"{cat.category_description:45}", style=ColorScheme.SILVER)
        line.append(f"  {create_command_badge(count)}", style=ColorScheme.GOLD)
        content_lines.append(line)
    
    # Total separator
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
            
            # Command name and description
            line = Text()
            line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.CORAL)
            line.append(dcmd.name.upper().replace('-', ' '), style=f"bold {ColorScheme.WHITE}")
            content_lines.append(line)
            
            content_lines.append(Text(f"    {dcmd.description}", style=ColorScheme.SILVER))
            content_lines.append(Text())
            
            # Syntax
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
            
            # Arguments
            if arguments:
                content_lines.append(Text(f"    {Symbols.BOX} Arguments:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for arg in arguments:
                    content_lines.append(Text(f"      {arg.flag:20} {arg.help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
            
            # Options
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
    
    # Category header
    header = Text()
    header.append(f"{Symbols.HEAVY_SEP * 3}{Symbols.LEFT_BRACKET} ", style=ColorScheme.NEON_CYAN)
    header.append(category.category_name.upper(), style=f"bold {ColorScheme.WHITE}")
    header.append(f" {Symbols.RIGHT_BRACKET}{Symbols.HEAVY_SEP * 3}", style=ColorScheme.NEON_CYAN)
    content_lines.append(header)
    
    content_lines.append(Text(f"  {category.category_description}", style=ColorScheme.SILVER))
    content_lines.append(Text())
    
    for section_title, section_cmds in subsections.items():
        if section_title:
            subsec_header = Text()
            subsec_header.append(f"  {Symbols.SEPARATOR * 2} ", style=ColorScheme.GOLD)
            subsec_header.append(section_title, style=f"bold {ColorScheme.GOLD}")
            subsec_header.append(f" {Symbols.SEPARATOR * 2}", style=ColorScheme.GOLD)
            content_lines.append(subsec_header)
            content_lines.append(Text())
        
        for dcmd in sorted(section_cmds, key=lambda c: c.name):
            params = _extract_params_with_help(dcmd.callback)
            
            # Command name
            cmd_line = Text()
            cmd_line.append(f"  {Symbols.COMMAND} ", style=ColorScheme.NEON_CYAN)
            cmd_line.append(dcmd.name, style=f"bold {ColorScheme.WHITE}")
            content_lines.append(cmd_line)
            
            # Description
            content_lines.append(Text(f"    {dcmd.description}", style=ColorScheme.SILVER))
            
            # Syntax
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
            
            # Arguments
            if arguments:
                content_lines.append(Text(f"    {Symbols.BOX} Arguments:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for arg in arguments:
                    help_text = arg.help_text or "Sin descripción"
                    content_lines.append(Text(f"      {arg.flag:20} {help_text}", style=ColorScheme.SILVER))
                content_lines.append(Text())
            
            # Options
            if options:
                content_lines.append(Text(f"    {Symbols.BOX} Options:", style=f"bold {ColorScheme.NEON_CYAN}"))
                for opt in options:
                    help_text = opt.help_text or "Sin descripción"
                    default_info = f" [default: {opt.default_value}]" if opt.default_value is not None else ""
                    content_lines.append(Text(f"      {opt.flag:20} {help_text}{default_info}", style=ColorScheme.SILVER))
                content_lines.append(Text())
    
    # Clean trailing empty lines
    while content_lines and str(content_lines[-1]).strip() == "":
        content_lines.pop()
    
    content = Text("\n").join(content_lines)
    console.print(content)
    console.print()


# ============================================================================
# MAIN RENDER FUNCTION
# ============================================================================
def render_help(registry: CommandRegistry, json_mode: bool = False, ai_native: bool = False, full_help: bool = False):
    """
    Renders the complete system help with modern aesthetics.
    
    Args:
        registry: Command registry
        json_mode: Enable JSON output
        ai_native: Enable AI-Native JSON schema
        full_help: If True, renders all commands from all categories
    """
    
    # ========================================================================
    # UTF-8 ENFORCEMENT for file redirection
    # ========================================================================
    import io
    if not sys.stdout.isatty():
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout = io.TextIOWrapper(
                sys.stdout.buffer, 
                encoding='utf-8', 
                errors='replace',
                line_buffering=False
            )
    
    # ========================================================================
    # JSON MODES
    # ========================================================================
    if ai_native or (json_mode and "--ai" in sys.argv):
        ai_schema = _build_ai_native_json(registry)
        sys.stdout.write(json.dumps(ai_schema, indent=2, ensure_ascii=False, cls=JSONEncoder))
        sys.stdout.write('\n')
        sys.stdout.flush()
        return
    
    if json_mode:
        json_data = _build_json_structure(registry)
        sys.stdout.write(json.dumps(