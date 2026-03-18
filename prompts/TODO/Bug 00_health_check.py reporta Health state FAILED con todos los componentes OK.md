**Bug: `00_health_check.py` reporta `Health state: FAILED` con todos los componentes OK**

**Contexto del sistema**

`nucleus/internal/mandates/system_health_activity.go` invoca el hook `hooks/system_health/00_health_check.py` cada 60 segundos via un Temporal Schedule. El hook corre `nucleus --json health`, evalúa el resultado, y escribe el estado en `logs/nucleus/system_health/nucleus_system_health_YYYYMMDD.log`. El estado que loguea en la línea `Health state: X` viene directamente de `health.get("state")` — es decir, lo que devuelve `nucleus --json health` en ese momento, sin ningún cálculo propio.

**Síntoma exacto**

```
[2026-03-18T06:54:00Z] INFO    Health state: HEALTHY
[2026-03-18T06:54:02Z] INFO      memory: OK -- 2623 MB free
[2026-03-18T06:54:02Z] INFO    === Health check completed ===
[2026-03-18T06:55:00Z] INFO    === System health check started ===
[2026-03-18T06:55:02Z] INFO    Health state: FAILED
[2026-03-18T06:55:02Z] INFO      memory: OK -- 2461 MB free
[2026-03-18T06:55:02Z] INFO    === Health check completed ===
[2026-03-18T06:56:00Z] INFO    === System health check started ===
[2026-03-18T06:56:02Z] INFO    Health state: HEALTHY
[2026-03-18T06:56:02Z] INFO      memory: OK -- 2456 MB free
```

Estado FAILED durante exactamente un ciclo (06:55), sin ningún componente reportado como caído, sin WARN ni ERROR en esa ejecución, con memoria OK (2461 MB libres). El ciclo anterior y el siguiente son HEALTHY.

**Bug identificado en el código**

En `main()` línea 287:
```python
state = health.get("state", "UNKNOWN")
write_log(log_path, "INFO", f"Health state: {state}")
```

`state` se captura del primer `run_nucleus_health(fix=False)` y **nunca se actualiza** aunque después se corra `run_nucleus_health(fix=True)`. Si el primer chequeo devuelve FAILED y el fix lo resuelve, la metadata final en línea 389 sigue reportando el estado original:

```python
metadata = {
    "health_state": state,   # ← estado del primer chequeo, nunca actualizado
    ...
}
```

Esto también significa que el log escribe el estado incorrecto: loguea FAILED pero en realidad el sistema estaba en proceso de auto-recuperación o ya se había recuperado.

**Causa más probable del FAILED transitorio**

`nucleus --json health` corre todos los checks en paralelo con timeouts muy cortos (latencias reportadas de 1-19ms). En el ciclo de las 06:55 algún componente tardó más de lo esperado en responder (TCP handshake lento, proceso bajo carga), `nucleus health` lo marcó como FAILED, pero cuando el hook loguea los componentes en el for-loop de línea 293 ese componente ya había sido evaluado y `healthy=True` — o directamente no entró al bloque de log porque para entonces ya era saludable.

**Lo que hay que arreglar**

Dos cosas independientes:

1. **El estado logueado debe ser el estado final**, no el del primer chequeo. Después del bloque de fix, `state` debe actualizarse con `state_after`:
```python
# Al final del bloque if fixable_failures:
state = state_after  # actualizar para metadata y log
```

2. **Loguear todos los componentes también después del fix**, no solo los que fallaron antes. Actualmente el for-loop de componentes solo corre una vez con el resultado del primer chequeo.

**Comandos para reproducir y diagnosticar**

```powershell
# Correr el hook manualmente y ver el JSON completo que devuelve
$ctx = '{"log_base_dir":"C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\logs","nucleus_bin":"C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\bin\\nucleus\\nucleus.exe"}'
echo $ctx | & "C:\Users\josev\AppData\Local\BloomNucleus\bin\engine\runtime\python.exe" "C:\Users\josev\AppData\Local\BloomNucleus\hooks\system_health\00_health_check.py"

# Ver el estado que nucleus health devuelve directamente
.\nucleus.exe --json health 2>$null | ConvertFrom-Json | Select-Object state, success

# Monitorear el log en tiempo real mientras corre el schedule
Get-Content "$env:LOCALAPPDATA\BloomNucleus\logs\nucleus\system_health\nucleus_system_health_$(Get-Date -Format 'yyyyMMdd').log" -Wait -Tail 10
```

**Archivos a modificar**

`%LOCALAPPDATA%\BloomNucleus\hooks\system_health\00_health_check.py` — función `main()`, bloque del fix (líneas 333-382) y construcción de metadata (línea 389).