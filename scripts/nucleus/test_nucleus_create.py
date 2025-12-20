"""Test script for Nucleus V2.0 creation"""
import sys
from pathlib import Path

# Add brain to path
sys.path.insert(0, str(Path(__file__).parent))

from brain.core.nucleus_manager import NucleusManager

def test_create_nucleus():
    """Test nucleus creation"""
    test_path = Path("./test-nucleus-v2")
    
    # Clean previous test
    if test_path.exists():
        import shutil
        shutil.rmtree(test_path)
    
    print("🧪 Testing Nucleus V2.0 creation...")
    
    manager = NucleusManager(test_path)
    result = manager.create(
        organization_name="TestOrg",
        organization_url="https://github.com/testorg",
        on_progress=lambda msg: print(f"  → {msg}")
    )
    
    print("\n✅ Nucleus created successfully!")
    print(f"📁 Path: {result['path']}")
    print(f"📊 Files created: {len(result['files_created'])}")
    print(f"🔗 Projects detected: {result['projects_detected']}")
    
    # Verify structure
    nucleus_dir = test_path / ".bloom" / ".nucleus-testorg"
    
    expected_dirs = [
        ".core",
        ".governance",
        ".intents/.exp",
        ".cache",
        ".relations",
        "findings",
        "reports"
    ]
    
    print("\n🔍 Verifying structure...")
    for dir_path in expected_dirs:
        full_path = nucleus_dir / dir_path
        status = "✅" if full_path.exists() else "❌"
        print(f"  {status} {dir_path}")
    
    print("\n📄 Generated files:")
    for file in result['files_created'][:10]:  # Show first 10
        print(f"  • {file}")
    if len(result['files_created']) > 10:
        print(f"  ... and {len(result['files_created']) - 10} more")

if __name__ == "__main__":
    test_create_nucleus()