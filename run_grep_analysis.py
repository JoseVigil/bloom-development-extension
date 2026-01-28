"""
Service to Server Rename - Grep Analysis Script
Runs all grep commands and saves results to individual text files
"""

import subprocess
import os
from pathlib import Path
from datetime import datetime

# Output directory for results
OUTPUT_DIR = Path("grep_analysis_results")
OUTPUT_DIR.mkdir(exist_ok=True)

# Timestamp for this analysis run
TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")

# Define all grep commands to run
GREP_COMMANDS = [
    {
        "name": "01_from_commands_service",
        "cmd": ['grep', '-r', 'from brain.commands.service', '--include=*.py', '.']
    },
    {
        "name": "02_from_core_service",
        "cmd": ['grep', '-r', 'from brain.core.service', '--include=*.py', '.']
    },
    {
        "name": "03_import_commands_service",
        "cmd": ['grep', '-r', 'import brain.commands.service', '--include=*.py', '.']
    },
    {
        "name": "04_import_core_service",
        "cmd": ['grep', '-r', 'import brain.core.service', '--include=*.py', '.']
    },
    {
        "name": "05_dotted_commands_service",
        "cmd": ['grep', '-r', r'brain\.commands\.service', '--include=*.py', '.']
    },
    {
        "name": "06_dotted_core_service",
        "cmd": ['grep', '-r', r'brain\.core\.service', '--include=*.py', '.']
    },
    {
        "name": "07_string_path_commands_dquote",
        "cmd": ['grep', '-r', '"brain/commands/service', '--include=*.py', '.']
    },
    {
        "name": "08_string_path_core_dquote",
        "cmd": ['grep', '-r', '"brain/core/service', '--include=*.py', '.']
    },
    {
        "name": "09_string_path_commands_squote",
        "cmd": ['grep', '-r', "'brain/commands/service", '--include=*.py', '.']
    },
    {
        "name": "10_string_path_core_squote",
        "cmd": ['grep', '-r', "'brain/core/service", '--include=*.py', '.']
    },
    {
        "name": "11_config_files_service_brain",
        "cmd": ['grep', '-r', 'service', '--include=*.json', '--include=*.yaml', 
                '--include=*.yml', '--include=*.toml', '--include=*.ini', 
                '--include=*.md', '.']
    },
    {
        "name": "12_find_commands_service_structure",
        "cmd": ['find', 'brain/commands/service', '-type', 'f']
    },
    {
        "name": "13_find_core_service_structure",
        "cmd": ['find', 'brain/core/service', '-type', 'f']
    },
]


def run_grep(name: str, cmd: list) -> tuple:
    """
    Run a grep command and return results.
    
    Returns:
        (success: bool, output: str, error: str)
    """
    try:
        print(f"Running: {name}...")
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        # grep returns 1 if no matches found, which is not an error for us
        if result.returncode in [0, 1]:
            return True, result.stdout, result.stderr
        else:
            return False, result.stdout, result.stderr
            
    except subprocess.TimeoutExpired:
        return False, "", "Command timed out after 30 seconds"
    except FileNotFoundError:
        return False, "", f"Command not found: {cmd[0]}"
    except Exception as e:
        return False, "", str(e)


def save_result(name: str, output: str, error: str, success: bool):
    """Save grep result to a text file"""
    filename = OUTPUT_DIR / f"{name}_{TIMESTAMP}.txt"
    
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(f"Command: {name}\n")
        f.write(f"Timestamp: {TIMESTAMP}\n")
        f.write(f"Success: {success}\n")
        f.write("=" * 80 + "\n\n")
        
        if output:
            f.write("OUTPUT:\n")
            f.write(output)
            f.write("\n\n")
        else:
            f.write("OUTPUT: (no matches found)\n\n")
        
        if error:
            f.write("ERRORS:\n")
            f.write(error)
            f.write("\n")
    
    return filename


def create_summary(results: list):
    """Create a summary file with all results"""
    summary_file = OUTPUT_DIR / f"00_SUMMARY_{TIMESTAMP}.txt"
    
    with open(summary_file, 'w', encoding='utf-8') as f:
        f.write("SERVICE TO SERVER RENAME - GREP ANALYSIS SUMMARY\n")
        f.write("=" * 80 + "\n")
        f.write(f"Analysis run: {TIMESTAMP}\n")
        f.write(f"Total commands: {len(results)}\n\n")
        
        f.write("RESULTS:\n")
        f.write("-" * 80 + "\n")
        
        for name, success, match_count, filename in results:
            status = "✓" if success else "✗"
            f.write(f"{status} {name}: {match_count} matches\n")
            f.write(f"   File: {filename.name}\n\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("RECOMMENDATIONS:\n")
        f.write("-" * 80 + "\n")
        
        total_matches = sum(count for _, _, count, _ in results if count > 0)
        
        if total_matches == 0:
            f.write("✓ No references found. Safe to rename directories.\n")
        else:
            f.write(f"⚠ Found {total_matches} total references that need updating.\n")
            f.write("\nPriority files to check:\n")
            for name, success, match_count, filename in results:
                if match_count > 0:
                    f.write(f"  - {filename.name} ({match_count} matches)\n")
    
    return summary_file


def main():
    print("=" * 80)
    print("SERVICE TO SERVER RENAME - GREP ANALYSIS")
    print("=" * 80)
    print(f"Output directory: {OUTPUT_DIR.absolute()}")
    print(f"Timestamp: {TIMESTAMP}")
    print()
    
    results = []
    
    for grep_def in GREP_COMMANDS:
        name = grep_def["name"]
        cmd = grep_def["cmd"]
        
        success, output, error = run_grep(name, cmd)
        
        # Count matches (lines in output)
        match_count = len([l for l in output.split('\n') if l.strip()]) if output else 0
        
        filename = save_result(name, output, error, success)
        results.append((name, success, match_count, filename))
        
        status_icon = "✓" if success else "✗"
        print(f"{status_icon} {name}: {match_count} matches -> {filename.name}")
    
    print()
    print("Creating summary...")
    summary_file = create_summary(results)
    print(f"✓ Summary created: {summary_file.name}")
    
    print()
    print("=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)
    print(f"Results saved to: {OUTPUT_DIR.absolute()}")
    print(f"\nCheck {summary_file.name} for overview")
    print()


if __name__ == "__main__":
    main()