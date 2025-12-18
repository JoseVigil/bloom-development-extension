from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

# Imports relativos a la nueva estructura
from brain.core.context.detector import MultiStackDetector
from brain.core.context.strategy_loader import load_strategy


class ContextManager:
    """
    Orquestador headless para generación de contexto multi-stack.
    """
    
    def __init__(self, root_path: Path, output_dir: str = ".bloom"):
        self.root = root_path.resolve()
        self.output_dir = output_dir
        self.bloom_path = self.root / output_dir
        self.detector = MultiStackDetector(self.root)
    
    def generate(self, manual_strategy: Optional[str] = None) -> Dict[str, Any]:
        """
        Ejecuta el proceso completo de generación de contexto.
        """
        result = {
            'strategies_detected': [],
            'files_created': [],
            'modules_analyzed': 0,
            'primary_stack': 'generic',
            'success': False
        }
        
        try:
            # 1. DETECCIÓN
            detected_modules = self._detect_technologies(manual_strategy)
            
            if not detected_modules:
                result['primary_stack'] = manual_strategy or 'generic'
                self._create_generic_context(result)
                result['success'] = True
                return result
            
            # 2. ANÁLISIS
            project_data = self._analyze_modules(detected_modules)
            result['strategies_detected'] = list(set(project_data['strategies_detected']))
            result['modules_analyzed'] = len(project_data['modules'])
            result['primary_stack'] = project_data['primary_stack']
            
            # 3. GENERACIÓN
            self._create_bloom_structure()
            self._generate_files(project_data, result)
            
            result['success'] = True
            
        except Exception as e:
            result['success'] = False
            result['error'] = str(e)
        
        return result
    
    def _detect_technologies(self, manual_strategy: Optional[str]) -> List[Dict[str, Any]]:
        if manual_strategy and manual_strategy != 'auto':
            return [] # TODO: Soportar forzado manual real
        return self.detector.detect()
    
    def _analyze_modules(self, detected_modules: List[Dict[str, Any]]) -> Dict[str, Any]:
        project_data = {
            "root_path": str(self.root),
            "strategies_detected": [],
            "modules": [],
            "primary_stack": "generic"
        }
        
        for module in detected_modules:
            strategy_type = module['type']
            module_path = module['abs_path']
            
            module_info = {
                "type": strategy_type,
                "path": module['path'],
                "markers": module['markers'],
                "analysis": {}
            }
            
            # Carga dinámica usando el Loader
            StrategyClass = load_strategy(strategy_type)
            
            if StrategyClass:
                try:
                    strategy_instance = StrategyClass(module_path)
                    # Asumimos que tus strategies viejas tienen un método .analyze()
                    # Si tienen otro nombre (ej. extract_info), cámbialo aquí.
                    if hasattr(strategy_instance, 'analyze'):
                        module_info["analysis"] = strategy_instance.analyze()
                    elif hasattr(strategy_instance, 'extract_data'):
                         module_info["analysis"] = strategy_instance.extract_data()
                    else:
                        module_info["analysis"] = {"note": "Method analyze() not found in strategy"}
                except Exception as e:
                    module_info["analysis"] = {"error": str(e)}
            else:
                module_info["analysis"] = {"note": "Strategy implementation not found"}
            
            project_data["modules"].append(module_info)
            project_data["strategies_detected"].append(strategy_type)
        
        # Determinar stack principal
        if project_data["modules"]:
            root_modules = [m for m in project_data["modules"] if m["path"] == ""]
            if root_modules:
                project_data["primary_stack"] = root_modules[0]["type"]
            else:
                project_data["primary_stack"] = project_data["modules"][0]["type"]
        
        return project_data
    
    def _create_bloom_structure(self):
        (self.bloom_path / 'core').mkdir(parents=True, exist_ok=True)
        (self.bloom_path / 'context').mkdir(parents=True, exist_ok=True)
    
    def _generate_files(self, project_data: Dict[str, Any], result: Dict[str, Any]):
        strategies = result['strategies_detected']
        
        # .rules.bl
        core_rules_path = self.bloom_path / 'core' / '.rules.bl'
        core_rules_path.write_text(self._get_core_rules(project_data['primary_stack']), encoding='utf-8')
        result['files_created'].append(str(core_rules_path.relative_to(self.root)))
        
        # Archivos por estrategia
        for strategy in strategies:
            context_file = self.bloom_path / 'context' / f'.{strategy}.bl'
            strategy_modules = [m for m in project_data['modules'] if m['type'] == strategy]
            context_file.write_text(self._get_context_content(strategy, strategy_modules), encoding='utf-8')
            result['files_created'].append(str(context_file.relative_to(self.root)))
    
    def _create_generic_context(self, result: Dict[str, Any]):
        self._create_bloom_structure()
        generic_path = self.bloom_path / 'context' / '.generic.bl'
        generic_path.write_text(self._get_generic_content(), encoding='utf-8')
        result['files_created'].append(str(generic_path.relative_to(self.root)))

    # --- TEMPLATES SIMPLIFICADOS ---
    def _get_core_rules(self, strategy: str) -> str:
        return f"# BLOOM CORE RULES\nStack: {strategy}\nGenerated: {datetime.now()}"
    
    def _get_context_content(self, strategy: str, modules: List) -> str:
        import json
        return f"# CONTEXT: {strategy}\n\n```json\n{json.dumps(modules, default=str, indent=2)}\n```"

    def _get_generic_content(self) -> str:
        return "# GENERIC CONTEXT\nNo specific stack detected."