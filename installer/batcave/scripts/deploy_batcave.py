#!/usr/bin/env python3
"""
BATCAVE Deployment Script
Deploys source code from development repository to production .batcave/ structure
"""

import os
import sys
import json
import shutil
import argparse
from pathlib import Path
from datetime import datetime, timezone


def read_version(script_dir: Path) -> str:
    """Read version from VERSION file"""
    version_file = script_dir / "VERSION"
    if not version_file.exists():
        raise FileNotFoundError(f"VERSION file not found at {version_file}")
    return version_file.read_text().strip()


def read_and_increment_build(script_dir: Path) -> int:
    """Read and increment build number"""
    build_file = script_dir / "build_number.txt"
    if not build_file.exists():
        build_file.write_text("1")
        return 1
    
    current_build = int(build_file.read_text().strip())
    new_build = current_build + 1
    build_file.write_text(str(new_build))
    return new_build


def validate_bloom_path(bloom_path: Path) -> None:
    """Validate that bloom directory exists"""
    if not bloom_path.exists():
        raise FileNotFoundError(f"Bloom directory not found: {bloom_path}")
    if not bloom_path.is_dir():
        raise NotADirectoryError(f"Bloom path is not a directory: {bloom_path}")


def create_nucleus_structure(bloom_path: Path, organization: str) -> Path:
    """Create nucleus structure if it doesn't exist"""
    nucleus_path = bloom_path / f".nucleus-{organization}"
    batcave_path = nucleus_path / ".batcave"
    
    # Create nucleus directories if they don't exist
    nucleus_path.mkdir(exist_ok=True)
    
    # Create batcave directory
    batcave_path.mkdir(exist_ok=True)
    
    return batcave_path


def should_exclude(path: Path, exclude_patterns: list) -> bool:
    """Check if path should be excluded from deployment"""
    path_str = str(path)
    name = path.name
    
    for pattern in exclude_patterns:
        if pattern in path_str or name == pattern or name.startswith(pattern):
            return True
    return False


def copy_source_to_production(src_dir: Path, dest_dir: Path, exclude_patterns: list) -> None:
    """Copy source directory to production, excluding specified patterns"""
    # Remove existing content in batcave (clean deploy)
    if dest_dir.exists():
        for item in dest_dir.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    
    # Copy all files from src/
    for item in src_dir.rglob("*"):
        if item.is_file() and not should_exclude(item, exclude_patterns):
            relative_path = item.relative_to(src_dir)
            dest_file = dest_dir / relative_path
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest_file)
            print(f"  ✓ {relative_path}")


def generate_version_json(dest_dir: Path, version: str, build: int, organization: str) -> None:
    """Generate version.json file in production"""
    version_data = {
        "version": version,
        "build": build,
        "deployDate": datetime.now(timezone.utc).isoformat(),
        "organization": organization
    }
    
    version_file = dest_dir / "version.json"
    with open(version_file, 'w') as f:
        json.dump(version_data, f, indent=2)
    
    print(f"  ✓ Generated version.json (v{version} build {build})")


def generate_config_json(dest_dir: Path, organization: str, bloom_path: Path) -> None:
    """Generate config/config.json file in production"""
    config_dir = dest_dir / "config"
    config_dir.mkdir(exist_ok=True)
    
    config_data = {
        "organization": organization,
        "nucleusPath": f".nucleus-{organization}",
        "bloomPath": ".bloom",
        "deployedAt": datetime.now(timezone.utc).isoformat()
    }
    
    config_file = config_dir / "config.json"
    with open(config_file, 'w') as f:
        json.dump(config_data, f, indent=2)
    
    print(f"  ✓ Generated config/config.json")


def generate_readme(dest_dir: Path, organization: str, version: str, build: int) -> None:
    """Generate README.md file in production"""
    deploy_date = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    
    readme_content = f"""# BATCAVE - {organization}

**Sovereign Control Plane for GitHub Codespaces**

## Deployment Information

- **Organization**: `{organization}`
- **Version**: `{version}`
- **Build**: `{build}`
- **Deployed**: `{deploy_date}`

## About

This is the BATCAVE control plane for the `{organization}` organization. BATCAVE provides:

- Dynamic workspace management
- GitHub OAuth integration
- Secure tunnel management
- Organization-scoped governance
- AI-powered development assistance

## Getting Started

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

### Start

```bash
npm start
```

Or use the environment variable:

```bash
BLOOM_ORGANIZATION={organization} npm start
```

## Environment Configuration

Configure your environment in `.env.{organization}`:

```bash
BLOOM_ORGANIZATION={organization}
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
PORT_REST=48215
PORT_WSS=4124
```

## Architecture

This deployment follows the BATCAVE Dynamic Architecture pattern where:

- Organization context is resolved from `.ownership.json`
- All paths are dynamically constructed based on organization name
- No hardcoded values - everything derives from `{{organization}}`

## Structure

```
.batcave/
├── core/              # Core control plane logic
├── dynamic/           # Dynamic workspace management
├── config/            # Configuration files
├── utils/             # Utilities and helpers
├── main.ts           # Entry point
├── package.json
├── tsconfig.json
├── version.json      # Build information
└── README.md         # This file
```

## Support

For issues or questions about this deployment, contact your BATCAVE administrator.

---

*Generated by BATCAVE deployment system v{version}*
"""
    
    readme_file = dest_dir / "README.md"
    readme_file.write_text(readme_content)
    
    print(f"  ✓ Generated README.md")


def initialize_git_repo(dest_dir: Path, organization: str) -> None:
    """Initialize git repository in production batcave"""
    import subprocess
    
    try:
        # Initialize git repo
        subprocess.run(["git", "init"], cwd=dest_dir, check=True, capture_output=True)
        
        # Configure git
        subprocess.run(
            ["git", "config", "user.name", "BATCAVE Deploy"],
            cwd=dest_dir,
            check=True,
            capture_output=True
        )
        subprocess.run(
            ["git", "config", "user.email", f"deploy@batcave-{organization}"],
            cwd=dest_dir,
            check=True,
            capture_output=True
        )
        
        # Add all files
        subprocess.run(["git", "add", "."], cwd=dest_dir, check=True, capture_output=True)
        
        # Initial commit
        commit_msg = f"Initial BATCAVE deployment for {organization}"
        subprocess.run(
            ["git", "commit", "-m", commit_msg],
            cwd=dest_dir,
            check=True,
            capture_output=True
        )
        
        print(f"  ✓ Initialized git repository")
        
    except subprocess.CalledProcessError as e:
        print(f"  ⚠ Git initialization failed: {e}")
        print(f"    You can manually initialize git in {dest_dir}")


def main():
    parser = argparse.ArgumentParser(
        description="Deploy BATCAVE to production structure",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/deploy_batcave.py -b ~/.bloom -o acme-corp
  python scripts/deploy_batcave.py --bloom-path /var/workspaces/.bloom --organization startup-xyz
        """
    )
    
    parser.add_argument(
        "-b", "--bloom-path",
        type=str,
        required=True,
        help="Path to the .bloom directory"
    )
    
    parser.add_argument(
        "-o", "--organization",
        type=str,
        required=True,
        help="Organization name (used to create .nucleus-{organization}/)"
    )
    
    args = parser.parse_args()
    
    # Convert paths
    repo_root = Path(__file__).parent.parent
    script_dir = Path(__file__).parent
    src_dir = repo_root / "src"
    bloom_path = Path(args.bloom_path).resolve()
    organization = args.organization
    
    print(f"\n🦇 BATCAVE Deployment")
    print(f"{'=' * 60}")
    
    # Validate inputs
    print(f"\n📋 Validating...")
    if not src_dir.exists():
        print(f"❌ Source directory not found: {src_dir}")
        sys.exit(1)
    
    try:
        validate_bloom_path(bloom_path)
    except (FileNotFoundError, NotADirectoryError) as e:
        print(f"❌ {e}")
        sys.exit(1)
    
    print(f"  ✓ Source directory: {src_dir}")
    print(f"  ✓ Bloom path: {bloom_path}")
    print(f"  ✓ Organization: {organization}")
    
    # Read version and build
    print(f"\n📦 Version Control...")
    version = read_version(script_dir)
    build = read_and_increment_build(script_dir)
    print(f"  ✓ Version: {version}")
    print(f"  ✓ Build: {build}")
    
    # Create nucleus structure
    print(f"\n🏗️  Creating structure...")
    batcave_path = create_nucleus_structure(bloom_path, organization)
    print(f"  ✓ Nucleus path: {bloom_path / f'.nucleus-{organization}'}")
    print(f"  ✓ Batcave path: {batcave_path}")
    
    # Load config
    config_file = repo_root / "config" / "deploy_config.json"
    if config_file.exists():
        with open(config_file) as f:
            config = json.load(f)
        exclude_patterns = config.get("deploy", {}).get("exclude_patterns", [])
    else:
        exclude_patterns = [".git", "__pycache__", "*.pyc", "node_modules"]
    
    # Copy source
    print(f"\n📂 Deploying source code...")
    copy_source_to_production(src_dir, batcave_path, exclude_patterns)
    
    # Generate files
    print(f"\n🔧 Generating production files...")
    generate_version_json(batcave_path, version, build, organization)
    generate_config_json(batcave_path, organization, bloom_path)
    generate_readme(batcave_path, organization, version, build)
    
    # Initialize git
    print(f"\n🔀 Initializing git repository...")
    initialize_git_repo(batcave_path, organization)
    
    print(f"\n{'=' * 60}")
    print(f"✅ Deployment completed successfully!")
    print(f"\n📍 Production location:")
    print(f"   {batcave_path}")
    print(f"\n📊 Build info:")
    print(f"   Version: {version}")
    print(f"   Build: {build}")
    print(f"   Organization: {organization}")
    print(f"\n🚀 Next steps:")
    print(f"   cd {batcave_path}")
    print(f"   npm install")
    print(f"   npm start")
    print()


if __name__ == "__main__":
    main()
