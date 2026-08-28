import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
COMMAND_FILES = sorted((REPO_ROOT / "brain" / "commands" / "intent").glob("*.py")) + [
    REPO_ROOT / "brain" / "commands" / "nucleus" / "create_exp_intent.py",
    REPO_ROOT / "brain" / "commands" / "nucleus" / "exp_discovery_turn.py",
    REPO_ROOT / "brain" / "commands" / "nucleus" / "exp_export_findings.py",
]
COMMAND_FILES = [
    path for path in COMMAND_FILES
    if path.name not in {"__init__.py", "effect_command_errors.py"}
]
REQUIRED_EFFECT_COMMANDS = {
    "mark_effect_applied.py",
    "commit_turn.py",
    "advance_turn.py",
}


def _calls(tree, attribute):
    return [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == attribute
    ]


def test_suite_commands_follow_unified_template():
    failures = []
    present_names = {path.name for path in COMMAND_FILES}
    missing_commands = REQUIRED_EFFECT_COMMANDS - present_names
    if missing_commands:
        failures.append(f"missing contracted effect commands: {sorted(missing_commands)}")
    for path in COMMAND_FILES:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        classes = [node for node in tree.body if isinstance(node, ast.ClassDef)]
        command_classes = [
            node for node in classes
            if any(isinstance(base, ast.Name) and base.id == "BaseCommand" for base in node.bases)
        ]
        if not command_classes:
            failures.append(f"{path.name}: no BaseCommand subclass")
            continue
        top_core_imports = [
            node for node in tree.body
            if isinstance(node, (ast.Import, ast.ImportFrom))
            and (
                (isinstance(node, ast.ImportFrom) and (node.module or "").startswith("brain.core"))
                or (isinstance(node, ast.Import) and any(alias.name.startswith("brain.core") for alias in node.names))
            )
        ]
        if top_core_imports:
            failures.append(f"{path.name}: top-level brain.core import")
        for cls in command_classes:
            method_names = {node.name for node in cls.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
            for required in {"metadata", "register", "_handle_error"}:
                if required not in method_names:
                    failures.append(f"{path.name}:{cls.name}: missing {required}")
        for option in _calls(tree, "Option"):
            if not any(keyword.arg == "help" for keyword in option.keywords):
                failures.append(f"{path.name}:{option.lineno}: typer.Option without help")
        required_fragments = {
            "GlobalContext": "GlobalContext fallback",
            "gc.output(": "dual output",
            "gc.verbose": "verbose logging",
            "examples=": "metadata examples",
        }
        for fragment, label in required_fragments.items():
            if fragment not in source:
                failures.append(f"{path.name}: missing {label}")
        if not any(name.startswith("_render") for cls in command_classes for name in {
            node.name for node in cls.body if isinstance(node, ast.FunctionDef)
        }):
            failures.append(f"{path.name}: missing human renderer")

    assert not failures, "\n".join(failures)
