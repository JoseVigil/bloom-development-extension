# 🧠 Brain v2 Command Generator - Unified Template

## 📋 USAR ESTE TEMPLATE PARA CREAR COMANDOS BRAIN

---

## 🎯 REQUERIMIENTO

**[PEGAR AQUÍ LA DESCRIPCIÓN DEL COMANDO DESEADO]**

---

## 🏗️ ARQUITECTURA OBLIGATORIA

### Estructura de Archivos
```
brain/
├── commands/[categoria]/[nombre].py  # CLI Layer (Typer + UI)
└── core/[dominio]/[manager].py       # Core Layer (Lógica Pura)
```

### Reglas Arquitectónicas (NO VIOLAR)

**R1. Separación CLI/Core**
- CLI: Solo Typer, validación, orquestación → `brain/commands/`
- Core: Lógica pura, sin Typer → `brain/core/`

**R2. Lazy Imports**
```python
# CORRECTO: Dentro de funciones
def execute(ctx: typer.Context, ...):
    from brain.core.xxx.manager import Manager  # ✅

# INCORRECTO: Nivel de módulo
from brain.core.xxx.manager import Manager  # ❌
```

**R3. GlobalContext Injection**
```python
gc = ctx.obj
if gc is None:
    from brain.shared.context import GlobalContext
    gc = GlobalContext()  # Fallback para testing
```

**R4. Output Dual (JSON/Humano)**
```python
result = {
    "status": "success",
    "operation": "nombre_operacion",
    "data": {...}
}
gc.output(result, self._render_success)
```

**R5. Manejo de Errores Unificado**
```python
def _handle_error(self, gc, message: str):
    if gc.json_mode:
        import json
        typer.echo(json.dumps({"status": "error", "message": message}))
    else:
        typer.echo(f"❌ {message}", err=True)
    raise typer.Exit(code=1)
```

**R6. Verbose Logging**
```python
if gc.verbose:
    typer.echo("🔍 Operación en progreso...", err=True)
```

---

## 📝 TEMPLATE CLI LAYER

```python
"""
Descripción del módulo de comandos.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class MiComandoCommand(BaseCommand):
    """
    [DESCRIPCIÓN DE LA CLASE]
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="mi-comando",
            category=CommandCategory.XXX,  # Ver categorías disponibles abajo
            version="1.0.0",
            description="Descripción corta y clara",
            examples=[
                "brain categoria mi-comando --arg valor",
                "brain categoria mi-comando --flag --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registra el comando en la aplicación Typer.
        
        Patrón 1: Comando simple
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            arg: str = typer.Argument(..., help="Descripción del argumento"),
            flag: bool = typer.Option(False, "--flag", "-f", help="Descripción del flag")
        ):
            """Docstring del comando."""
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Lazy Import del Core
                from brain.core.mi_dominio.manager import MiManager
                
                # 3. Verbose logging (opcional)
                if gc.verbose:
                    typer.echo(f"🔍 Procesando {arg}...", err=True)
                
                # 4. Ejecutar lógica del Core
                manager = MiManager()
                data = manager.procesar(arg, flag=flag)
                
                # 5. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "mi_comando",
                    "data": data
                }
                
                # 6. Output dual
                gc.output(result, self._render_success)
                
            except Exception as e:
                self._handle_error(gc, f"Error: {e}")
    
    def _render_success(self, data: dict):
        """Output humano para éxito."""
        typer.echo(f"✅ Operación '{data['operation']}' completada")
        # Agregar más output según necesidad
    
    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


# PATRÓN 2: Comando con subcomandos
class MiComandoGrupoCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="grupo",
            category=CommandCategory.XXX,
            description="Grupo de comandos relacionados",
            examples=["brain grupo subcomando1", "brain grupo subcomando2"]
        )
    
    def register(self, app: typer.Typer) -> None:
        grupo_app = typer.Typer(help="Ayuda del grupo")
        
        @grupo_app.command(name="subcomando1")
        def subcomando1(ctx: typer.Context, ...):
            """Subcomando 1."""
            # Implementación...
        
        @grupo_app.command(name="subcomando2")
        def subcomando2(ctx: typer.Context, ...):
            """Subcomando 2."""
            # Implementación...
        
        app.add_typer(grupo_app, name="grupo")
```

---

## 📝 TEMPLATE CORE LAYER

```python
"""
Lógica de negocio pura sin dependencias de CLI.
"""

from pathlib import Path
from typing import Dict, Any, Optional


class MiManager:
    """
    [DESCRIPCIÓN DE LA CLASE MANAGER]
    
    Esta clase contiene la lógica de negocio pura.
    No debe tener dependencias de Typer o CLI.
    """
    
    def __init__(self, param_inicial: Optional[str] = None):
        """
        Inicializa el manager.
        
        Args:
            param_inicial: Parámetro opcional de inicialización
        """
        self.param = param_inicial
    
    def procesar(self, entrada: str, flag: bool = False) -> Dict[str, Any]:
        """
        Procesa la entrada y retorna datos estructurados.
        
        Args:
            entrada: Dato de entrada
            flag: Flag opcional para modificar comportamiento
            
        Returns:
            Diccionario con resultados estructurados
            
        Raises:
            ValueError: Si entrada es inválida
            FileNotFoundError: Si archivo no existe
        """
        # Validaciones
        if not entrada:
            raise ValueError("Entrada no puede estar vacía")
        
        # Lógica de negocio aquí
        resultado = self._logica_interna(entrada)
        
        # Retornar datos estructurados
        return {
            "entrada_procesada": entrada,
            "flag_usado": flag,
            "resultado": resultado,
            "metadata": {
                "timestamp": "...",
                "version": "1.0.0"
            }
        }
    
    def _logica_interna(self, entrada: str) -> Any:
        """
        Método privado con lógica específica.
        
        Args:
            entrada: Dato a procesar
            
        Returns:
            Resultado del procesamiento
        """
        # Implementación...
        return f"Procesado: {entrada}"
```

---

## 🎨 CATEGORÍAS DISPONIBLES

```python
from brain.cli.categories import CommandCategory

CommandCategory.NUCLEUS      # Proyectos Nucleus
CommandCategory.GITHUB       # GitHub operations
CommandCategory.CONTEXT      # AI context generation
CommandCategory.PROJECT      # Project scaffolding
CommandCategory.FILESYSTEM   # File operations
CommandCategory.INTENT       # Intent system
CommandCategory.AI           # AI features
```

---

## ✅ CHECKLIST PRE-ENTREGA

**CLI Layer:**
- [ ] Hereda de `BaseCommand`
- [ ] Método `metadata()` completo con ejemplos
- [ ] Método `register()` implementado
- [ ] Lazy imports en funciones (no en nivel módulo)
- [ ] GlobalContext inyectado con fallback
- [ ] Output dual con `gc.output(result, renderer)`
- [ ] Método `_render_*` para output humano
- [ ] Método `_handle_error` para errores
- [ ] Verbose logging a stderr con `if gc.verbose:`
- [ ] Docstrings en funciones públicas

**Core Layer:**
- [ ] Sin dependencias de Typer
- [ ] Métodos documentados con docstrings completos
- [ ] Type hints en todos los métodos
- [ ] Validaciones con excepciones claras
- [ ] Retorna `Dict[str, Any]` o dataclasses
- [ ] Sin prints, sin inputs, sin sys.exit()
- [ ] Lógica testeable independientemente

**General:**
- [ ] Sin imports circulares
- [ ] Nombres descriptivos (no genéricos)
- [ ] Categoría correcta del enum
- [ ] Manejo de errores robusto
- [ ] Compatible con `--json` flag
- [ ] Compatible con `--verbose` flag

---

## 🚨 ERRORES COMUNES A EVITAR

| ❌ Incorrecto | ✅ Correcto |
|--------------|-------------|
| `from brain.core.xxx import Manager` (top-level) | Lazy import dentro de función |
| `print("mensaje")` | `typer.echo("mensaje", err=True)` |
| `return "string simple"` | `return {"status": "success", ...}` |
| `def comando(param: str):` | `def comando(ctx: typer.Context, param: str):` |
| Lógica de negocio en CLI | Toda la lógica en Core |
| `typer.echo("log")` | `typer.echo("log", err=True)` para logs |
| Nombres genéricos: `Manager`, `Handler` | Nombres descriptivos: `ProjectLinker`, `GitHubAPIClient` |

---

## 📦 ENTREGABLES ESPERADOS

Genera **EXACTAMENTE 2 archivos** con código completo y production-ready:

### 1️⃣ `brain/commands/[categoria]/[nombre].py`
- Clase completa heredando `BaseCommand`
- Todos los métodos implementados
- Manejo de errores completo
- Output dual (JSON/humano)

### 2️⃣ `brain/core/[dominio]/[manager].py`
- Clase(s) con lógica pura
- Sin dependencias CLI
- Documentación completa
- Type hints

---

## 🎯 AHORA GENERA EL CÓDIGO

Basándote en el **REQUERIMIENTO** al inicio de este documento, genera los 2 archivos completos siguiendo estrictamente este template.
