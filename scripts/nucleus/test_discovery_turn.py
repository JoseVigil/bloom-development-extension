"""Test script for discovery turn command"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from brain.core.nucleus_manager import NucleusManager


def test_discovery_turn():
    """Test adding discovery turn"""
    test_path = Path("./test-nucleus-v2")
    
    if not test_path.exists():
        print("❌ Test nucleus not found")
        return
    
    print("🔄 Testing discovery turn...")
    
    manager = NucleusManager(test_path)
    
    try:
        # Assumes intent exists from previous test
        result = manager.add_discovery_turn(
            intent_id="auth-optimization",  # Or use actual ID
            notes="Analyzed authentication patterns across services",
            analysis="Found 3 different auth implementations, opportunity for standardization",
            on_progress=lambda msg: print(f"  → {msg}")
        )
        
        print("\n✅ Discovery turn created!")
        print(f"🔄 Turn: {result['turn_number']}")
        print(f"📁 Path: {result['turn_path']}")
        print(f"📝 Files: {len(result['files_created'])}")
        
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    test_discovery_turn()