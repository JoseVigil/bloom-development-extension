from pathlib import Path
from typing import Dict

class PythonStrategy:
    """Analizador para proyectos Python."""
    
    def __init__(self, project_root: Path):
        self.root = project_root

    def analyze(self) -> Dict:
        info = self._analyze()
        config_files = []
        if (self.root / "pyproject.toml").exists():
            config_files.append('pyproject.toml')
        elif (self.root / "requirements.txt").exists():
            config_files.append('requirements.txt')
        return {
            'language': 'Python',
            'entry_points': info['entry_points'],
            'config_files': config_files,
            'raw_data': {'config_type': info['config_type'], 'deps_count': info['deps_count']}
        }

    def _analyze(self) -> Dict:
        info = {"config_type": "Desconocido", "entry_points": [], "deps_count": 0}
        
        if (self.root / "pyproject.toml").exists():
            info["config_type"] = "Modern (pyproject.toml)"
            # Podríamos leer el toml para contar deps reales
        elif (self.root / "requirements.txt").exists():
            info["config_type"] = "Legacy (requirements.txt)"
            try:
                content = (self.root / "requirements.txt").read_text()
                info["deps_count"] = len([l for l in content.splitlines() if l.strip() and not l.startswith('#')])
            except: pass
            
        # Buscar entry points comunes
        for entry in ["__main__.py", "main.py", "app.py", "wsgi.py"]:
            if (self.root / entry).exists():
                info["entry_points"].append(entry)
                
        return info