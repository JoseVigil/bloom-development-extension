# strategies/php.py
import json
from pathlib import Path
from typing import Dict, Any, List

class PhpStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "composer.json"

    def analyze(self) -> Dict[str, Any]:
        """
        Retorna un diccionario estandarizado. 
        No genera texto, solo devuelve datos.
        """
        raw_data = self._read_composer()
        
        # Detectar framework basado en dependencias
        framework = "Native/Custom"
        reqs = raw_data.get('require', {})
        if "laravel/framework" in reqs:
            framework = "Laravel"
        elif "symfony/symfony" in reqs or "symfony/flex" in reqs:
            framework = "Symfony"
        elif "drupal/core" in reqs:
            framework = "Drupal"

        return {
            "language": "PHP",
            "framework": framework,
            "project_name": raw_data.get('name', 'Unknown'),
            "description": raw_data.get('description', ''),
            "dependencies": [f"{k}: {v}" for k, v in reqs.items()],
            "scripts": list(raw_data.get('scripts', {}).keys()),
            "entry_points": ["index.php", "artisan"] if framework == "Laravel" else ["index.php"]
        }

    def _read_composer(self) -> Dict:
        if not self.marker_file.exists():
            return {}
        try:
            with open(self.marker_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}