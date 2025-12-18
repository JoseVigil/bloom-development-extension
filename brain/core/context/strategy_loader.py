from typing import Optional, Type, Any
import importlib

def load_strategy(strategy_type: str) -> Optional[Type[Any]]:
    """
    Carga dinámicamente la clase de estrategia correspondiente.
    Asume que las estrategias están en brain.core.context.strategies.<tipo>.py
    y que la clase se llama <Tipo>Strategy (TitleCase).
    """
    
    # Mapeo manual para casos especiales donde el nombre del archivo 
    # no coincide exactamente con el nombre de la clase
    SPECIAL_MAP = {
        "typescript": ("typescript", "TypeScriptStrategy"),
        "python": ("python", "PythonStrategy"),
        "android": ("android", "AndroidStrategy"),
        "php": ("php", "PHPStrategy"),
        "ios": ("ios", "IOSStrategy"),
    }
    
    try:
        if strategy_type in SPECIAL_MAP:
            module_name, class_name = SPECIAL_MAP[strategy_type]
        else:
            # Intento genérico: android -> AndroidStrategy
            module_name = strategy_type
            class_name = f"{strategy_type.title()}Strategy"
            
        module_path = f"brain.core.context.strategies.{module_name}"
        
        # Import dinámico
        module = importlib.import_module(module_path)
        strategy_class = getattr(module, class_name)
        
        return strategy_class
        
    except (ImportError, AttributeError) as e:
        # Si no existe la estrategia, retornamos None para que el Manager lo maneje
        # print(f"DEBUG: Could not load strategy for {strategy_type}: {e}")
        return None