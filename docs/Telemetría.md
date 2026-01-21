### 📜 Prompt / Especificación para Integración de Telemetría

**Objetivo:** Registrar un flujo de datos (log) para que sea visualizado dinámicamente en la terminal de monitoreo Sentinel.

**Archivo Destino:** `C:\Users\josev\AppData\Local\BloomNucleus\logs\telemetry.json`

#### 1. Formato de Datos (Schema)
Cualquier aplicación que desee mostrar información debe insertar o actualizar una entrada dentro del objeto `active_streams`. La clave debe ser un **ID único** (ej: el PID del proceso o el ID del perfil).

```json
{
  "active_streams": {
    "ID_UNICO": {
      "label": "NOMBRE VISIBLE",
      "path": "RUTA/AL/ARCHIVO.log",
      "priority": 1,
      "last_update": "2024-01-20T22:30:00Z"
    }
  }
}
```
- **`label`**: El título que aparecerá en el marco de la ventana (Ej: "🧠 BRAIN", "🚀 FB_PROFILE").
- **`path`**: Ruta absoluta al archivo `.log` que el Cockpit debe "tailing" (seguir).
- **`priority`**: 
    - `1`: Alta prioridad (Ocupa la parte superior o 50% de la pantalla).
    - `2`: Media prioridad (Se divide el espacio restante).
    - `3`: Baja prioridad (Ventanas pequeñas al fondo).

#### 2. Protocolo de Escritura (Evitar colisiones en Windows)
Dado que múltiples aplicaciones editarán este archivo simultáneamente, se debe seguir este algoritmo de "Escritura Segura":

1.  **Abrir con Reintentos:** Si el archivo está bloqueado por otro proceso, esperar entre 50ms y 100ms y reintentar (máximo 5 veces).
2.  **Lectura-Modificación-Escritura (RMW):**
    - Cargar el JSON actual.
    - Si no existe, inicializarlo como `{"active_streams": {}}`.
    - Añadir o actualizar tu entrada bajo tu `ID_UNICO`.
    - Guardar el archivo inmediatamente.
3.  **Registro de Vida (Heartbeat):** Actualizar el campo `last_update` cada 10-20 segundos. Si el Cockpit ve que una entrada no se ha actualizado en más de 1 minuto, puede considerar que el proceso murió.

#### 3. Protocolo de Salida (Cleanup)
- **Cierre ordenado:** Antes de que la aplicación finalice, **debe eliminar** su clave del objeto `active_streams` para que el Cockpit cierre la ventana automáticamente.
- **Cierre inesperado (Crash):** El Cockpit limpiará la ventana si el archivo de log deja de recibir datos o si el `last_update` expira.

---

### Ejemplo de implementación rápida para el "Brain" (Python)

Si quieres que el **Brain Service** reporte su actividad al Cockpit, el código debería verse así:

```python
import json
import os
import time
from datetime import datetime

TELEMETRY_PATH = r"C:\Users\josev\AppData\Local\BloomNucleus\logs\telemetry.json"

def register_telemetry(stream_id, label, log_path, priority=2):
    try:
        # 1. Leer actual
        if os.path.exists(TELEMETRY_PATH):
            with open(TELEMETRY_PATH, 'r') as f:
                data = json.load(f)
        else:
            data = {"active_streams": {}}

        # 2. Actualizar
        data["active_streams"][stream_id] = {
            "label": label,
            "path": log_path.replace("\\", "/"),
            "priority": priority,
            "last_update": datetime.now().isoformat()
        }

        # 3. Escribir (con suerte, atómico)
        with open(TELEMETRY_PATH, 'w') as f:
            json.dump(data, f, indent=2)
            
    except Exception as e:
        print(f"Error registrando telemetría: {e}")

# Al iniciar el servicio
register_telemetry("brain_service", "🧠 BRAIN CORE", "C:/logs/brain.log", priority=1)
```

---

### ¿Cómo seguimos?

1.  **Dime si necesitas que ajuste algo en el Cockpit de Go** para que sea más tolerante a errores de lectura si el JSON se está escribiendo justo en ese momento.
2.  **¿Quieres que implemente en Go una función "Mánager de Telemetría"** que centralice estas escrituras para que tus otros módulos de Sentinel no tengan que lidiar con el JSON manualmente?