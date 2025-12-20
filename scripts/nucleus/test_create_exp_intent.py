"""Test script for create-exp-intent command"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from brain.core.nucleus_manager import NucleusManager


def test_create_exp_intent():
    """Test exploration intent creation"""
    # Assumes test-nucleus-v2 exists
    test_path = Path("./test-nucleus-v2")
    
    if not test_path.exists():
        print("❌ Test nucleus not found. Run test_nucleus_create.py first")
        return
    
    print("🔬 Testing exploration intent creation...")
    
    manager = NucleusManager(test_path)
    
    try:
        result = manager.create_exp_intent(
            name="Authentication Optimization",
            inquiry="How can we improve authentication across all microservices?",
            description="Cross-project analysis of authentication patterns",
            projects=None,  # Include all projects
            on_progress=lambda msg: print(f"  → {msg}")
        )
        
        print("\n✅ Exploration intent created!")
        print(f"🔬 Name: {result['intent_name']}")
        print(f"🆔 ID: {result['intent_id']}")
        print(f"📁 Path: {result['intent_path']}")
        print(f"📦 Projects: {len(result['projects_included'])}")
        print(f"📝 Files: {len(result['files_created'])}")
        
        # Verify structure
        intent_dir = Path(result['intent_path'])
        
        expected_files = [
            ".exp_state.json",
            ".inquiry/.inquiry.json",
            ".inquiry/.context_exp_plan.json",
            ".inquiry/.files/.expbase.json",
            ".inquiry/.files/.expbase_index.json",
            ".findings/.findings.json"
        ]
        
        print("\n🔍 Verifying files...")
        for file_path in expected_files:
            full_path = intent_dir / file_path
            status = "✅" if full_path.exists() else "❌"
            print(f"  {status} {file_path}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    test_create_exp_intent()