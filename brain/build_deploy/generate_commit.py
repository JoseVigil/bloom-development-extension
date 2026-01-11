import json
from pathlib import Path
from datetime import datetime
import re


COMMITS_DIR = Path("commits/brain")  # Ahora genera en commits/brain/


def slugify(text: str) -> str:
    """Convierte texto en slug seguro para filenames"""
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def load_update_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_commit_message(data: dict) -> str:
    from_v = data.get("current_version", "unknown")
    to_v = data.get("new_version", "unknown")
    changelog = data.get("changelog", {})
    timestamp = data.get("timestamp", "")
    requested_by = data.get("requested_by", "unknown")
    update_count = data.get("update_count", 1)
    version_number = data.get("version_number", "N/A")

    lines = []

    # Conventional commit header
    lines.append(f"chore(release): {to_v}")
    lines.append("")
    lines.append(f"Version: {from_v} → {to_v}")
    lines.append(f"Build Number: #{version_number}")
    lines.append(f"Requested by: {requested_by}")
    lines.append(f"Timestamp: {timestamp}")
    lines.append(f"Update count: {update_count}")
    lines.append("")

    for section in ("added", "changed", "details"):
        items = changelog.get(section)
        if items:
            lines.append(f"{section.capitalize()}:")
            for item in items:
                lines.append(f"- {item}")
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def build_commit_filename(data: dict) -> str:
    ts = data.get("timestamp")
    dt = datetime.fromisoformat(ts) if ts else datetime.utcnow()
    date_str = dt.strftime("%Y-%m-%d")

    from_v = data.get("current_version", "unknown")
    to_v = data.get("new_version", "unknown")
    version_number = data.get("version_number", "N/A")

    title_hint = "semantic-changelog"
    # Formato: {version_number}_{slug}_{date}.txt
    filename = f"{version_number}_{slugify(title_hint)}_{date_str}.txt"
    return filename


def save_commit_file(content: str, filename: str) -> Path:
    COMMITS_DIR.mkdir(parents=True, exist_ok=True)  # Crea commits/brain/
    path = COMMITS_DIR / filename
    path.write_text(content, encoding="utf-8")
    return path


def main(json_path: str):
    data = load_update_json(json_path)
    commit_message = build_commit_message(data)
    filename = build_commit_filename(data)
    path = save_commit_file(commit_message, filename)

    print("✅ Commit file generado:")
    print(path.resolve())
    print("\n👉 Usalo con:")
    print(f"git commit -F {path}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 2:
        print("Uso: python generate_commit.py <update.json>")
        sys.exit(1)

    main(sys.argv[1])