# brain/build_deploy/bump_version.py
"""
Version bumper script.
Usage: python bump_version.py [major|minor|patch]
"""

import re
import sys
from pathlib import Path


def bump_version(bump_type: str = "patch"):
    """Auto-increment version in pyproject.toml."""
    
    pyproject = Path(__file__).parent.parent / "pyproject.toml"
    content = pyproject.read_text(encoding='utf-8')
    
    # Find current version
    match = re.search(r'version\s*=\s*["\'](\d+)\.(\d+)\.(\d+)["\']', content)
    if not match:
        raise ValueError("Version not found")
    
    major, minor, patch = map(int, match.groups())
    
    # Bump
    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    else:  # patch
        patch += 1
    
    new_version = f"{major}.{minor}.{patch}"
    
    # Replace
    new_content = re.sub(
        r'version\s*=\s*["\'][^"\']+["\']',
        f'version = "{new_version}"',
        content
    )
    
    pyproject.write_text(new_content, encoding='utf-8')
    print(f"✅ Version bumped: {match.group(1)} → {new_version}")
    return new_version


if __name__ == "__main__":
    bump = sys.argv[1] if len(sys.argv) > 1 else "patch"
    bump_version(bump)