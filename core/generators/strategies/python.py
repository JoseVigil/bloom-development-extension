from pathlib import Path
from typing import Dict

class PythonStrategy:
    """Analizador para proyectos Python."""
    
    def __init__(self, project_root: Path):
        self.root = project_root

    def generate(self) -> str:
        info = self._analyze()
        return f"""
### 🐍 Python Stack
- **Configuración:** {info['config_type']}
- **Dependencias:** {info['deps_count']} librerías detectadas
- **Entry Points:** {', '.join(info['entry_points'])}
"""

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