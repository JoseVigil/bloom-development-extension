# 🔍 Brain Logger - Guía Completa de Troubleshooting

## 📍 Ubicación de los Logs

El sistema guarda los logs en ubicaciones estándar según el OS:

- **Windows**: `%LOCALAPPDATA%\BloomNucleus\logs\brain_core_YYYYMMDD.log`
- **macOS**: `~/Library/Logs/BloomNucleus/brain_core_YYYYMMDD.log`
- **Linux**: `~/.local/share/BloomNucleus/logs/brain_core_YYYYMMDD.log`

### Rotación Automática
- Máximo 10MB por archivo
- Mantiene 5 backups (50MB total)
- Archivos viejos: `brain_core_YYYYMMDD.log.1`, `.2`, etc.

---

## 🚀 Quick Start

### 1. Inicializar en `__main__.py` (YA HECHO ✅)
```python
from brain.shared.logger import setup_global_logging

# Al inicio de main(), antes de cualquier otra cosa
setup_global_logging(verbose="--verbose" in sys.argv)
```

### 2. Usar en cualquier módulo
```python
from brain.shared.logger import get_logger

logger = get_logger(__name__)  # __name__ = "brain.commands.edit"

logger.debug("Mensaje de debugging (solo visible con --verbose)")
logger.info("Mensaje informativo (siempre visible)")
logger.warning("Advertencia")
logger.error("Error recuperable")
logger.critical("Error crítico del sistema")
```

---

## 📊 Niveles de Logging

| Nivel | Cuándo Usar | Ejemplo |
|-------|-------------|---------|
| **DEBUG** | Detalles internos, valores de variables | `logger.debug(f"Variable x = {x}")` |
| **INFO** | Flujo normal del programa | `logger.info("✓ Comando completado")` |
| **WARNING** | Algo inesperado pero no crítico | `logger.warning("Archivo no encontrado, usando default")` |
| **ERROR** | Error que impide completar una operación | `logger.error("Error al conectar con API", exc_info=True)` |
| **CRITICAL** | Error que detiene el sistema | `logger.critical("No se puede inicializar", exc_info=True)` |

### ⚡ Comportamiento con `--verbose`
- **Sin `--verbose`**: Consola muestra INFO, WARNING, ERROR, CRITICAL
- **Con `--verbose`**: Consola muestra TODO (incluye DEBUG)
- **Archivo**: SIEMPRE captura TODO (DEBUG incluido)

---

## 🎯 Patrones Recomendados

### ✅ Patrón 1: Comandos con Try-Catch
```python
from brain.shared.logger import get_logger

logger = get_logger(__name__)

def execute(self, ctx, files: list[str]):
    logger.info(f"📝 Iniciando comando EDIT con {len(files)} archivos")
    
    try:
        for file in files:
            logger.debug(f"  → Procesando: {file}")
            result = self._process(file)
            logger.info(f"  ✓ {file} completado")
        
        logger.info("✅ Comando completado exitosamente")
        return True
        
    except FileNotFoundError as e:
        logger.error(f"❌ Archivo no encontrado: {e}")
        raise
    except Exception as e:
        logger.error(f"❌ Error inesperado: {e}", exc_info=True)
        raise
```

**☝️ Nota**: `exc_info=True` captura el full traceback automáticamente.

### ✅ Patrón 2: Imports con Manejo de Errores
```python
from brain.shared.logger import get_logger, BrainLogger

logger = get_logger(__name__)

def load_command(module_path: str):
    try:
        logger.debug(f"Importando {module_path}...")
        module = __import__(module_path, fromlist=[''])
        logger.debug(f"  ✓ {module_path} cargado")
        return module
    except Exception as e:
        BrainLogger.log_import_error(module_path, e)
        return None
```

### ✅ Patrón 3: Medición de Performance
```python
from brain.shared.logger import get_logger
import time

logger = get_logger(__name__)

def expensive_operation():
    logger.info("⏱️  Iniciando operación costosa...")
    start = time.time()
    
    try:
        # Tu código aquí
        result = do_work()
        
        duration = time.time() - start
        logger.info(f"✅ Completado en {duration:.2f}s")
        return result
        
    except Exception as e:
        duration = time.time() - start
        logger.error(f"❌ Falló después de {duration:.2f}s: {e}", exc_info=True)
        raise
```

### ✅ Patrón 4: Logging de Llamadas a API
```python
from brain.shared.logger import get_logger

logger = get_logger(__name__)

async def call_anthropic_api(prompt: str):
    logger.info("🤖 Llamando a Anthropic API...")
    logger.debug(f"Prompt length: {len(prompt)} chars")
    logger.debug(f"Preview: {prompt[:100]}...")
    
    try:
        response = await client.messages.create(...)
        
        logger.info(f"✓ Respuesta recibida: {response.usage.input_tokens} tokens in, {response.usage.output_tokens} tokens out")
        logger.debug(f"Content preview: {response.content[0].text[:100]}...")
        
        return response
        
    except Exception as e:
        logger.error(f"❌ API call failed: {e}", exc_info=True)
        raise
```

---

## 🔧 Troubleshooting con Logs

### 1. Verificar que el Logger Funciona
```python
from brain.shared.logger import BrainLogger

brain_logger = BrainLogger()
print(f"Log file: {brain_logger.log_file}")
```

### 2. Buscar Errores Específicos
**Windows**:
```cmd
# Ver últimas 50 líneas
type %LOCALAPPDATA%\BloomNucleus\logs\brain_core_*.log | more

# Buscar errores
findstr /I "ERROR CRITICAL" %LOCALAPPDATA%\BloomNucleus\logs\brain_core_*.log
```

**Linux/Mac**:
```bash
# Ver últimas 50 líneas
tail -n 50 ~/.local/share/BloomNucleus/logs/brain_core_*.log

# Buscar errores
grep -i "ERROR\|CRITICAL" ~/.local/share/BloomNucleus/logs/brain_core_*.log
```

### 3. Debugging de Importaciones
Los errores de importación son comunes en PyInstaller. Busca en los logs:
```
❌ Error al importar brain.commands.edit: ModuleNotFoundError
```

### 4. Debugging de Comandos
Para ver qué comando se ejecutó:
```
INFO | brain.main | Argumentos: edit file.py --instructions "..."
INFO | brain.commands | ▶️  Ejecutando comando: edit
```

---

## 🎨 Emojis Recomendados (para filtrar visualmente)

| Emoji | Significado |
|-------|-------------|
| 🚀 | Sistema iniciando |
| 📦 | Cargando módulos/comandos |
| 📝 | Comando EDIT |
| 🔧 | Comando REFACTOR |
| ✨ | Comando CREATE |
| 🤖 | Llamadas a IA/API |
| ⏱️  | Medición de tiempo |
| ✅ | Operación exitosa |
| ❌ | Error |
| ⚠️  | Advertencia |
| 🔍 | Búsqueda/Análisis |

---

## 🚨 Errores Críticos que SIEMPRE Debes Loggear

1. **Errores de importación** → `BrainLogger.log_import_error()`
2. **Excepciones no manejadas** → Capturadas automáticamente
3. **Fallas de API** → `logger.error(..., exc_info=True)`
4. **Archivos no encontrados** → `logger.error()`
5. **Validaciones fallidas** → `logger.warning()` o `logger.error()`

---

## 📋 Checklist de Implementación

### Para cada módulo nuevo:
- [ ] Importar logger: `from brain.shared.logger import get_logger`
- [ ] Crear instancia: `logger = get_logger(__name__)`
- [ ] Loggear inicio de operaciones importantes: `logger.info("...")`
- [ ] Loggear pasos intermedios: `logger.debug("...")`
- [ ] Try-catch con logging: `logger.error(..., exc_info=True)`
- [ ] Loggear resultados: `logger.info("✅ ...")`

### Para comandos:
- [ ] Loggear argumentos recibidos
- [ ] Loggear cada archivo/item procesado
- [ ] Loggear tiempo de ejecución
- [ ] Loggear resultado final (éxito o error)

---

## 🔒 Consideraciones de Seguridad

**NO loggear**:
- API keys o tokens
- Contraseñas
- Información personal sensible

**SÍ loggear**:
- Rutas de archivos
- Nombres de comandos
- Cantidad de items procesados
- Tiempos de ejecución
- Stack traces de errores

---

## 📞 Soporte

Si encuentras errores:
1. Abre el archivo de log más reciente
2. Busca líneas con `ERROR` o `CRITICAL`
3. Copia el traceback completo
4. Revisa las líneas anteriores para ver el contexto

El formato de log incluye:
```
2026-01-12 14:30:45 | ERROR    | brain.commands.edit        | execute              | ❌ Error: File not found
```
Esto te dice: **cuándo, qué nivel, qué módulo, qué función, qué pasó**.
