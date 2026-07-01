# Brain Service — Troubleshooting Guide
> Linux / Ubuntu · Última actualización: 1 de julio de 2026

---

## 0. ⚡ Procedimiento rápido (caso más común: puerto ocupado)

**Este es el escenario más frecuente.** Si `nucleus --json health` muestra `brain_service` en `UNREACHABLE` con `connection refused`, empezá por acá antes de leer el resto de la guía.

```bash
# 1. Ver si algo tiene el puerto 5678
sudo fuser 5678/tcp

# 2. Si devuelve un PID, matarlo
sudo fuser -k 5678/tcp

# 3. Confirmar que quedó libre (fuser Y ss, no alcanza con uno solo)
sudo fuser 5678/tcp
sudo ss -tlnp 'sport = :5678'

# 4. ⚠️ CRÍTICO: esperar antes de relanzar (ver nota abajo)
sleep 2

# 5. Levantar el brain como daemon
nohup brain service start --port 5678 > /tmp/brain-service.log 2>&1 & disown

# 6. Verificar que arrancó sin errores
sleep 2
cat /tmp/brain-service.log
pgrep -a -f "brain service start"
sudo fuser 5678/tcp

# 7. Confirmación final
nucleus --json health 2>/dev/null
```

> **⚠️ Por qué el `sleep 2` es obligatorio — Race condition confirmada (2026-07-01):**
> `fuser -k` envía `SIGKILL`, que mata el proceso de forma abrupta sin darle tiempo al kernel a liberar el socket prolijamente. Si se relanza el brain inmediatamente después del kill, el nuevo proceso intenta bindear al puerto 5678 mientras el socket viejo todavía está en estado `TIME_WAIT`/liberándose, y falla con:
> ```
> ERROR Puerto 5678 no disponible: [Errno 98] Address already in use
> ```
> Esto pasó incluso con `fuser 5678/tcp` devolviendo vacío justo antes del intento — el puerto *parece* libre pero el kernel todavía no terminó de soltarlo. Un `sleep 2` entre el kill y el `nohup ... start` resuelve el problema de forma consistente.
>
> Si después del `sleep 2` **igual** falla con `Address already in use`, aumentar a `sleep 5` o verificar con `sudo ss -tlnp 'sport = :5678'` (más confiable que `fuser` solo) antes de reintentar.

Si esto no resuelve el problema, seguir con el diagnóstico detallado abajo.

---

## 1. Síntomas comunes

`nucleus --json health` muestra:
```json
"brain_service": {
  "healthy": false,
  "state": "UNREACHABLE",
  "error": "Port 5678 not accessible: dial tcp 127.0.0.1:5678: connection refused"
}
```

`brain health full-stack` muestra:
```
🔴 Bloom Host (TCP 5678): DISCONNECTED — Error: Connection refused
Overall Score: 20%
```

`brain service start --port 5678 --daemon` muestra:
```
AttributeError: 'ServerManager' object has no attribute 'start_daemon'
```
> **Bug conocido:** el flag `--daemon` no está implementado en Linux. No usar.

---

## 2. Diagnóstico rápido

### 2.1 Estado general del stack
```bash
nucleus --json health 2>/dev/null
```
Revisar:
- `brain_service.healthy` → debe ser `true`
- `brain_service.state` → debe ser `RUNNING`
- `worker.state` → debe ser `CONNECTED`

### 2.2 Ver quién tiene el puerto 5678
```bash
sudo fuser 5678/tcp
# o alternativa:
sudo ss -tlnp 'sport = :5678'
```
- Si devuelve un PID → hay un proceso ocupando el puerto (ver Sección 3)
- Si devuelve vacío → el brain no está corriendo en absoluto (ver Sección 4)

### 2.3 Ver logs del brain
```bash
tail -50 /home/jose/.local/share/BloomNucleus/logs/brain/server/brain_service_$(date +%Y%m%d).log
```
Errores clave a buscar:
- `[Errno 98] Address already in use` → puerto ocupado
- `FATAL ERROR EN SERVER START` → crash en startup
- `Server stopped (no status data available)` → proceso terminó inesperadamente

---

## 3. Puerto 5678 ocupado por otro proceso

Ocurre cuando una sesión anterior del brain quedó colgada o un proceso zombie retiene el puerto.

```bash
# 1. Identificar el proceso
sudo fuser 5678/tcp

# 2. Matarlo directamente
sudo fuser -k 5678/tcp

# 3. Verificar que quedó libre (debe devolver vacío)
sudo fuser 5678/tcp

# 4. ⚠️ Esperar antes de relanzar — ver nota sobre race condition en Sección 0
sleep 2

# 5. Levantar el brain
nohup brain service start --port 5678 > /tmp/brain-service.log 2>&1 & disown

# 6. Verificar
nucleus --json health --component brain_service 2>/dev/null
```

> ⚠️ Sin el `sleep 2` del paso 4, es común que el paso 5 falle con `Address already in use` aunque `fuser` haya mostrado el puerto libre — el kernel todavía no terminó de liberar el socket tras el `SIGKILL`. Ver Sección 0 para el detalle.

---

## 4. Brain no está corriendo (puerto libre pero UNREACHABLE)

El puerto 5678 está libre pero nadie escucha en él. El brain simplemente no se inició o crasheó.

### Levantar el brain como daemon en Linux

```bash
nohup brain service start --port 5678 > /tmp/brain-service.log 2>&1 & disown
```

| Parte | Para qué sirve |
|---|---|
| `nohup` | Evita que el proceso muera al cerrar la terminal |
| `> /tmp/brain-service.log 2>&1` | Redirige stdout y stderr a un log |
| `& disown` | Desvincula el proceso de la terminal (daemon real) |

### Verificar que levantó
```bash
# Confirmar que el proceso existe
pgrep -a -f "brain service start"

# Confirmar que el puerto está ocupado
sudo fuser 5678/tcp

# Ver los logs en tiempo real
tail -f /tmp/brain-service.log

# Chequeo final
nucleus --json health 2>/dev/null
```

---

## 5. Worker desconectado (DISCONNECTED)

Si `brain_service` está healthy pero el worker sigue en `DISCONNECTED`:

```bash
nucleus health --fix
```

`nucleus health --fix` resuelve el worker automáticamente — lo arranca y lo conecta a la task queue `profile-orchestration`. El brain debe estar corriendo antes de ejecutar esto.

```bash
# Verificar resultado
nucleus --json health 2>/dev/null | grep -A3 '"worker"'
```

---

## 6. Errores conocidos en Linux (no críticos)

### `name 'WindowsError' is not defined`
- **Aparece en:** `brain health full-stack` → Chrome Extension y Onboarding
- **Causa:** código con referencias a excepciones Windows-only
- **Impacto:** no bloquea el brain service ni el funcionamiento normal
- **Acción:** ignorar

### `AttributeError: 'ServerManager' object has no attribute 'start_daemon'`
- **Aparece en:** `brain service start --daemon`
- **Causa:** el flag `--daemon` aparece en el help pero no está implementado
- **Impacto:** el brain no levanta si se usa `--daemon`
- **Acción:** usar `nohup ... & disown` (ver Sección 4)

### `API REST (HTTP 48215): ERROR` en `brain health full-stack`
- **Aparece** incluso cuando `nucleus --json health` muestra `bloom_api: RUNNING`
- **Causa:** `brain health full-stack` y `nucleus health` usan criterios distintos
- **Acción:** usar `nucleus --json health` como fuente de verdad principal

---

## 7. Secuencia de recuperación completa

Usar cuando el sistema está en estado `FAILED` o `DEGRADED` y no se sabe por dónde empezar:

```bash
# 1. Ver estado actual
nucleus --json health 2>/dev/null

# 2. Liberar el puerto si está ocupado
sudo fuser -k 5678/tcp

# 3. ⚠️ Esperar antes de relanzar (evita race condition, ver Sección 0)
sleep 2

# 4. Levantar el brain como daemon
nohup brain service start --port 5678 > /tmp/brain-service.log 2>&1 & disown

# 5. Esperar y verificar
sleep 3 && nucleus --json health 2>/dev/null

# 6. Si worker sigue DISCONNECTED, aplicar fix
nucleus health --fix

# 7. Verificación final
nucleus --json health 2>/dev/null
```

Estado esperado al final:
```json
{
  "success": true,
  "state": "HEALTHY",
  "components": {
    "brain_service": { "healthy": true, "state": "RUNNING" },
    "worker":        { "healthy": true, "state": "CONNECTED" }
  }
}
```

---

## 8. Referencia rápida

| Comando | Para qué sirve |
|---|---|
| `nucleus --json health 2>/dev/null` | Estado completo del sistema (fuente de verdad) |
| `nucleus health --fix` | Fix automático del worker y componentes conocidos |
| `nucleus health --component brain_service` | Chequeo aislado del brain + últimos logs |
| `brain health full-stack` | Stack completo (menos confiable en Linux) |
| `brain service status` | Estado del servidor brain TCP |
| `sudo fuser 5678/tcp` | Ver qué proceso tiene el puerto 5678 |
| `sudo ss -tlnp 'sport = :5678'` | Confirmar liberación del puerto (más confiable que `fuser` solo) |
| `sudo fuser -k 5678/tcp` | Matar el proceso que tiene el puerto 5678 |
| `sleep 2` (después de matar, antes de relanzar) | Evita race condition de `Address already in use` — ver Sección 0 |
| `nohup brain service start --port 5678 > /tmp/brain-service.log 2>&1 & disown` | Levantar brain como daemon en Linux |
| `pgrep -a -f "brain service start"` | Verificar que el proceso brain existe |
| `tail -f /tmp/brain-service.log` | Ver logs del brain en tiempo real |

---

*Bloom Development — Brain Service Troubleshooting v1.0*
