from pathlib import Path
from typing import Dict, Type

# Importamos el detector
from core.generators.strategies.multistack_detector import MultiStackDetector

# Importamos las estrategias específicas
from core.generators.strategies.typescript import TypeScriptNodeStrategy
from core.generators.strategies.android import AndroidStrategy
from core.generators.strategies.python import PythonStrategy

class ContextStrategyManager:
    """
    Orquestador Maestro.
    1. Usa MultiStackDetector para mapear el territorio.
    2. Instancia la estrategia correcta para cada carpeta detectada.
    3. Consolida todo en un único reporte Markdown.
    """
    
    # Mapa: String del detector -> Clase de Estrategia
    STRATEGY_MAP: Dict[str, Type] = {
        "typescript": TypeScriptNodeStrategy,
        "android": AndroidStrategy,
        "python": PythonStrategy,
        # "docker": DockerStrategy, # Futuro
    }

    def __init__(self, root_path: Path):
        self.root = root_path.resolve()
        self.detector = MultiStackDetector(self.root)

    def execute_analysis(self, output_file: Path) -> bool:
        print(f"🧠 Escaneando repositorio en busca de stacks tecnológicos...")
        
        # 1. Detectar
        modules = self.detector.detect()
        
        if not modules:
            print("⚠️ No se detectaron stacks conocidos.")
            return False

        # 2. Generar Reporte Consolidado
        report_lines = []
        report_lines.append(f"# ARQUITECTURA DEL SISTEMA (Bloom Auto-Discovery)\n")
        report_lines.append(f"> Generado el: {output_file.parent}\n")
        report_lines.append(f"**Estrategia:** Detección Multi-Stack Recursiva\n")
        
        modules_processed = 0
        
        for module in modules:
            strategy_type = module['type']
            module_path = module['path'] if module['path'] else "(Root)"
            abs_path = module['abs_path']
            
            # Buscar la clase correspondiente
            StrategyClass = self.STRATEGY_MAP.get(strategy_type)
            
            if StrategyClass:
                print(f"   ⚙️  Analizando módulo [{strategy_type}]: {module_path}")
                try:
                    # Instanciar estrategia apuntando a la subcarpeta
                    strategy_instance = StrategyClass(abs_path)
                    
                    # Generar contenido parcial
                    content = strategy_instance.generate()
                    
                    # Agregar al reporte con encabezado claro
                    report_lines.append(f"---")
                    report_lines.append(f"## 📦 Módulo: `{module_path}`")
                    report_lines.append(f"**Tecnología Detectada:** {strategy_type.upper()}")
                    report_lines.append(f"**Marcadores:** {', '.join(module['markers'])}")
                    report_lines.append(content)
                    report_lines.append("\n")
                    
                    modules_processed += 1
                except Exception as e:
                    print(f"   ❌ Error analizando {module_path}: {e}")
                    report_lines.append(f"⚠️ Error analizando módulo {module_path}: {e}")

        # 3. Guardar
        if modules_processed > 0:
            final_content = "\n".join(report_lines)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_text(final_content, encoding='utf-8')
            return True
        else:
            return False