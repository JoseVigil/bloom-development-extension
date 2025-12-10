import unittest
import json
import tempfile
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from create_intent import create_intent_structure


class TestCreateIntent(unittest.TestCase):
    
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        
    def test_intent_structure_creation(self):
        """Test que se creen todas las carpetas y archivos."""
        args = type('Args', (), {
            'name': 'test-intent',
            'uid': 'abc',
            'profile': 'Profile 1',
            'provider': 'claude',
            'account': 'claude-default',
            'files': '["src/main.ts", "src/util.ts"]',
            'workspace': self.temp_dir,
            'nucleus_id': None,
            'project_id': None,
            'problem': None,
            'expected_output': None
        })()
        
        result = create_intent_structure(args)
        
        self.assertEqual(result, 0)
        
        intent_path = Path(self.temp_dir) / '.bloom' / 'intents' / 'dev' / 'test-intent-abc'
        self.assertTrue(intent_path.exists())
        
        intent_json = intent_path / '.briefing' / '.intent.json'
        self.assertTrue(intent_json.exists())
        
        with open(intent_json) as f:
            data = json.load(f)
            self.assertEqual(data['name'], 'test-intent')
            self.assertEqual(data['uid'], 'abc')
            self.assertEqual(data['profileId'], 'Profile 1')
            self.assertEqual(data['status'], 'draft')
    
    def test_uid_in_filename(self):
        """Test que UID se incluya en nombre de carpeta."""
        args = type('Args', (), {
            'name': 'my-intent',
            'uid': 'x7k',
            'profile': 'Profile 1',
            'provider': 'grok',
            'account': 'grok-default',
            'files': '["file.txt"]',
            'workspace': self.temp_dir,
            'nucleus_id': None,
            'project_id': None,
            'problem': None,
            'expected_output': None
        })()
        
        create_intent_structure(args)
        
        intent_path = Path(self.temp_dir) / '.bloom' / 'intents' / 'dev' / 'my-intent-x7k'
        self.assertTrue(intent_path.exists())


if __name__ == '__main__':
    unittest.main()