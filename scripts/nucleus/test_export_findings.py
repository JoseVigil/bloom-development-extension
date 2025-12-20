"""Test script for findings export"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from brain.core.nucleus_manager import NucleusManager


def test_export_findings():
    """Test exporting findings"""
    test_path = Path("./test-nucleus-v2")
    
    if not test_path.exists():
        print("❌ Test nucleus not found")
        return
    
    print("📤 Testing findings export...")
    
    manager = NucleusManager(test_path)
    
    try:
        result = manager.export_findings(
            intent_id="auth-optimization",
            export_format="markdown",
            include_raw=True,
            on_progress=lambda msg: print(f"  → {msg}")
        )
        
        print("\n✅ Findings exported!")
        print(f"📁 Export dir: {result['export_dir']}")
        print(f"📊 Total turns: {result['total_turns']}")
        print(f"\n📄 Files:")
        for file_info in result['exported_files']:
            print(f"  • {file_info['name']} ({file_info['size']})")
        
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    test_export_findings()