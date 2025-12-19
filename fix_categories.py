"""
Fix category assignments in command files.
"""
from pathlib import Path
import re


def fix_category(file_path: Path, correct_category: str):
    """Fix category in a command file."""
    content = file_path.read_text(encoding='utf-8')
    
    # Replace category line
    pattern = r'category=CommandCategory\.\w+'
    replacement = f'category=CommandCategory.{correct_category}'
    
    new_content = re.sub(pattern, replacement, content)
    
    if new_content != content:
        file_path.write_text(new_content, encoding='utf-8')
        print(f"✅ Fixed: {file_path.name} → {correct_category}")
        return True
    else:
        print(f"⚠️  No change: {file_path.name}")
        return False


def main():
    brain_path = Path(__file__).parent / "brain" / "commands"
    
    # Map: directory → correct category
    fixes = {
        "github": "GITHUB",
        "context": "CONTEXT",
        "filesystem": "FILESYSTEM",
        "project": "PROJECT"
    }
    
    fixed = 0
    
    for dir_name, category in fixes.items():
        dir_path = brain_path / dir_name
        
        if not dir_path.exists():
            continue
        
        print(f"\n📁 {dir_name}/")
        
        for file_path in dir_path.glob("*.py"):
            if file_path.name == "__init__.py":
                continue
            
            if fix_category(file_path, category):
                fixed += 1
    
    print(f"\n{'='*50}")
    print(f"✅ Fixed {fixed} files")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()