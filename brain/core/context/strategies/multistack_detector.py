import os
from pathlib import Path
from typing import Dict, List, Set, Optional

class MultiStackDetector:
    """
    Escanea el árbol de directorios buscando 'Marcadores de Tecnología'.
    Identifica qué lenguajes/frameworks viven en qué carpetas.
    """

    # Carpetas a ignorar para optimizar el scan
    IGNORED_DIRS = {
        'node_modules', 'venv', '.venv', '__pycache__', '.git', 
        'dist', 'build', 'out', '.next', '.idea', '.vscode'
    }

    # Mapa heurístico: archivo marcador -> tipo de estrategia
    MARKERS = {
        # Web / JS / TS
        "package.json": "typescript",
        "tsconfig.json": "typescript",
        "vite.config.js": "typescript", # Asumimos ecosistema JS/TS
        "vite.config.ts": "typescript",
        
        # Python
        "pyproject.toml": "python",
        "requirements.txt": "python",
        "setup.py": "python",
        "Pipfile": "python",
        
        # Mobile
        "AndroidManifest.xml": "android",
        "build.gradle": "android", # Si está en app/
        "build.gradle.kts": "android",
        "Podfile": "ios",
        
        # Otros
        "Dockerfile": "docker",
        "docker-compose.yml": "docker",
    }

    def __init__(self, root_path: Path):
        self.root = root_path.resolve()

    def detect(self) -> List[Dict]:
        """
        Retorna una lista de módulos detectados.
        Ejemplo:
        [
            {"type": "python", "path": "core", "markers": ["pyproject.toml"]},
            {"type": "typescript", "path": ".", "markers": ["package.json"]}
        ]
        """
        found_modules: Dict[str, Dict] = {}

        # Walk optimizado (evita entrar en node_modules)
        for root, dirs, files in os.walk(self.root):
            # Filtrar directorios ignorados in-place
            dirs[:] = [d for d in dirs if d not in self.IGNORED_DIRS]
            
            current_path = Path(root)
            
            for file in files:
                strategy_type = self._match_marker(file)
                
                if strategy_type:
                    # Calcular ruta relativa a la raíz del proyecto
                    try:
                        rel_path = current_path.relative_to(self.root)
                    except ValueError:
                        continue # Fuera del root (no debería pasar)

                    str_path = str(rel_path).replace('\\', '/')
                    if str_path == '.': str_path = ''

                    # Identificar módulo único por ruta
                    if str_path not in found_modules:
                        found_modules[str_path] = {
                            "type": strategy_type, # Prioridad al primero encontrado
                            "path": str_path,
                            "abs_path": current_path,
                            "markers": set()
                        }
                    
                    # Si encontramos un marcador 'android' en una carpeta que ya tenía 'java',
                    # actualizamos a android porque es más específico.
                    if strategy_type == 'android' and found_modules[str_path]['type'] == 'java':
                         found_modules[str_path]['type'] = 'android'

                    found_modules[str_path]["markers"].add(file)

        # Convertir a lista y limpiar sets
        result = []
        for mod in found_modules.values():
            mod['markers'] = list(mod['markers'])
            # Filtro especial: build.gradle en raíz suele ser config, no un módulo android per-se
            # a menos que tenga app/build.gradle. Dejamos que la Strategy decida si es válida.
            result.append(mod)
            
        # Ordenar: Raíz primero, luego alfabético
        return sorted(result, key=lambda x: (x['path'] != '', x['path']))

    def _match_marker(self, filename: str) -> Optional[str]:
        return self.MARKERS.get(filename)