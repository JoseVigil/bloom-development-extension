> **Enmienda · 20 de junio de 2026 — post análisis de `nucleus_help.txt`**
>
> La revisión del CLI de nucleus resuelve dos incógnitas del spec original y corrige una decisión de arquitectura. **Incógnita 5 cerrada:** `nucleus synapse tab.create` no existe, pero existe `nucleus synapse onboarding <profile_id> --step <screen>`, que envía una señal de navegación a un perfil en ejecución. El método `_openLandingTab()` del MilestoneReactor debe reemplazarse por una llamada a `this._nucleus(['synapse', 'onboarding', this._profileId, '--step', 'success'])` — no hace falta abrir una tab, el canal ya existe. **Incógnita 1 parcialmente cerrada:** `nucleus onboarding steps` no existe como comando; el CLI no expone los steps en runtime. El archivo `onboarding_steps.json` existe en el repo bajo `bloom-development-extension/installer/native/config/onboarding/` pero no se deploya durante el setup, por lo que no está disponible en `~/.local/share/BloomNucleus/config/onboarding/` en producción. La decisión tomada es doble: (a) el setup debe copiar `onboarding_steps.json` al BloomRoot durante la instalación — requerimiento pendiente de implementar en el proceso de setup; (b) el `MilestoneRegistry` debe leer el archivo de disco si existe y caer a una constante hardcoded centralizada como fallback si no — esto lo hace seguro tanto en instalaciones correctas como en entornos de desarrollo sin deploy. Como requerimiento futuro no bloqueante, se registra la necesidad de agregar `nucleus --json onboarding steps` al CLI para que cualquier consumidor futuro acceda a los steps sin leer el disco directamente. La tabla de cambios del documento pasa de 6 a 8 items: se agregan el requerimiento de deploy del setup (#2) y el requerimiento futuro del CLI de nucleus (#8).

---

# Synapse Bridge — Análisis de gaps post-patch
## Estado de implementación · 20 de junio de 2026

---

## 1. Qué hace el patch (Cambio 1 de N)

El patch aplicado a `shared/synapse-bridge.js` introduce tres cambios atómicos:

1. **`ONBOARDING_EVENTS` Set** — declarado antes de la clase, exportado. Contiene los 11 eventos de onboarding conocidos. Es la única fuente de clasificación; no hay comparaciones de strings inline en el classifier.

2. **Case `ONBOARDING_MILESTONE` en `_classifyMessage()`** — insertado entre los prefijos de sistema (`PROFILE_`, `ION_`, `INTENT_`) y el fallback genérico. Prioridad correcta: no rompe ningún mensaje existente.

3. **`ONBOARDING_EVENTS` en `module.exports`** — permite que `MilestoneRegistry` extienda el Set en runtime con `ONBOARDING_EVENTS.add('NUEVO_EVENTO')` sin tocar el bridge.

**Resultado concreto:** los eventos de onboarding que antes caían al fallback `SYNAPSE_EVENT` ahora llegan al renderer clasificados como `ONBOARDING_MILESTONE`. El MilestoneReactor puede filtrar por `type === 'ONBOARDING_MILESTONE'` sin inspeccionar `event.event` campo a campo.

---

## 2. ¿Es el patch suficiente? No — faltan 3 cambios

El patch resuelve la clasificación en el bridge, pero el flujo completo tiene tres gaps adicionales que el patch no cierra.

### Gap 1 — `workspace-synapse-handlers.js`: no escucha `ONBOARDING_MILESTONE`

**Situación actual:** el bridge ahora emite eventos con `type: 'ONBOARDING_MILESTONE'`, pero nada en workspace los consume. El handler de synapse en workspace existe para otros tipos (`HANDSHAKE`, `STATUS`, `INTENT`, `ION`) pero no tiene case para `ONBOARDING_MILESTONE`.

**Cambio necesario:** en `workspace-synapse-handlers.js`, agregar un handler que reciba los eventos `ONBOARDING_MILESTONE` del bridge y los despache al `MilestoneReactor`.

```javascript
// En workspace-synapse-handlers.js — agregar en el switch/handler de tipos:
case 'ONBOARDING_MILESTONE': {
  const stepId = resolveStepId(enriched.event, milestoneRegistry);
  if (stepId) milestoneReactor.handleMilestone(stepId);
  break;
}
```

La función `resolveStepId` consulta el `MilestoneRegistry` para mapear el nombre del evento Cortex (`GITHUB_TOKEN_STORED`) al ID del step (`github_auth`). Este mapeo viene del campo `cortex_events` del registry (ver spec §4.3).

**Archivos involucrados:** `workspace-synapse-handlers.js`

---

### Gap 2 — `MilestoneReactor` y `MilestoneRegistry`: no existen todavía

El spec §4.5 describe el `MilestoneReactor` y el §4.3 describe el `MilestoneRegistry`. Ninguno de los dos existe aún como archivo de código. Son los componentes centrales de la arquitectura propuesta.

**Cambios necesarios:**

**`milestone-registry.js`** (nuevo archivo):
- Carga la fuente de verdad de hitos al arrancar (archivo JSON, endpoint o hardcoded centralizado según respuesta a Incógnita 1 del spec)
- Expone `steps[]` con schema: `{ id, label, blocking, requires, cortex_events, conductor_reaction }`
- Opcionalmente extiende `ONBOARDING_EVENTS` con eventos declarados en el registry

**`milestone-reactor.js`** (nuevo archivo):
- Mapea `stepId` → handler nombrado (`_onGithubAuthComplete`, etc.)
- Implementa idempotencia: no re-ejecuta un hito ya procesado
- Emite `milestone:reached` al renderer via IPC para que `onboarding.js` actualice la UI
- Verifica steps bloqueantes antes de llamar `_onOnboardingSuccess()`

**Archivos involucrados:** dos archivos nuevos bajo `conductor/` (path exacto a confirmar según estructura de directorios).

---

### Gap 3 — `onboarding.js` (renderer): sigue teniendo polling hardcodeado

El renderer actualmente hace `setInterval` de 3 segundos y reacciona solo a `steps.github_auth`. Los otros hitos (vault, Google, AI provider, proyecto) no tienen reacciones en el renderer.

**Cambios necesarios:**
- Eliminar o reducir a fallback el `setInterval` de polling
- Agregar listener de `milestone:reached` via `preload_onboarding.js`
- Agregar listener de `onboarding:step-ui-update` para actualizaciones de UI por hito

```javascript
// En preload_onboarding.js — agregar:
onMilestone: (cb) => {
  ipcRenderer.removeAllListeners('milestone:reached');
  ipcRenderer.on('milestone:reached', (_, data) => cb(data));
},
onStepUpdate: (cb) => {
  ipcRenderer.removeAllListeners('onboarding:step-ui-update');
  ipcRenderer.on('onboarding:step-ui-update', (_, data) => cb(data));
},
```

**Archivos involucrados:** `onboarding.js` (renderer), `preload_onboarding.js`

---

## 3. Tabla de cambios completa

| # | Archivo | Tipo | Estado | Descripción |
|---|---|---|---|---|
| 1 | `shared/synapse-bridge.js` | Modificación | ✅ **Aplicado** | `ONBOARDING_EVENTS` Set + case `ONBOARDING_MILESTONE` + export |
| 2 | `workspace-synapse-handlers.js` | Modificación | ⏳ Pendiente | Handler para `ONBOARDING_MILESTONE` → MilestoneReactor |
| 3 | `milestone-registry.js` | Archivo nuevo | ⏳ Pendiente | Carga dinámica de hitos — fuente de verdad |
| 4 | `milestone-reactor.js` | Archivo nuevo | ⏳ Pendiente | Handlers por hito, idempotencia, IPC al renderer |
| 5 | `preload_onboarding.js` | Modificación | ⏳ Pendiente | Exponer `onMilestone` y `onStepUpdate` al renderer |
| 6 | `onboarding.js` (renderer) | Modificación | ⏳ Pendiente | Reemplazar setInterval por listeners de milestone |

---

## 4. Dependencias entre cambios

```
Cambio 1 (bridge)            ← APLICADO
    ↓
Cambio 3 (registry)          ← base de datos de hitos, necesario antes del reactor
    ↓
Cambio 4 (reactor)           ← consume registry, emite IPC al renderer
    ↓
Cambio 2 (synapse-handlers)  ← conecta bridge → reactor
    ↓
Cambios 5+6 (renderer)       ← consume IPC del reactor, elimina polling
```

El orden de implementación recomendado es exactamente ese: registry → reactor → synapse-handlers → renderer. El bridge (Cambio 1) ya está listo y es independiente.

---

## 5. Incógnitas del spec que siguen abiertas

Las incógnitas del spec original (§3) no se resuelven con el patch. Siguen bloqueando la implementación de los Cambios 3-6:

| Incógnita | Impacto | Qué necesita |
|---|---|---|
| **#1 — Fuente de verdad de hitos** | Define cómo implementar `MilestoneRegistry` | `onboarding_steps.json` o `nucleus --json onboarding steps` |
| **#2 — Host nativo** | Define si hay canal más directo que TCP Brain | Código o docs de `bloom-host` |
| **#4 — Metadata de hitos** | Define schema del registry | Responde junto a Incógnita 1 |
| **#5 — `nucleus synapse tab.create`** | Define cómo `_openLandingTab()` en el reactor abre Chrome | `nucleus --json synapse --help` |

La Incógnita #3 (¿SynapseBridge tiene suscripción de eventos?) **está respondida**: sí tiene, via `this.emit('message', enriched)` en `_onBrainMessage()`. El bridge hereda de `EventEmitter` y emite en el canal `synapse:event`. El Cambio 2 se conecta exactamente ahí.

---

## 6. Documentación a actualizar

### `BLOOM_CONDUCTOR_MILESTONE_BRIDGE_SPEC_v0_1.md`

**Secciones que requieren actualización con el patch aplicado:**

- **§2.3 (Incógnita 3):** marcar como resuelta. `SynapseBridge` hereda de `EventEmitter` y emite `'message'` con cada mensaje de Brain. El bridge ya tenía capacidad push — faltaba clasificar los eventos de onboarding, que el patch resuelve.

- **§3 checklist Bloque 3:** marcar los dos items como resueltos:
  - ✅ `shared/synapse-bridge.js` tiene métodos de suscripción (`on()`, `emit()`) — es un `EventEmitter`
  - ✅ Eventos que emite `SynapseBridge` hacia `mainWindow`: todos los tipos incluyendo ahora `ONBOARDING_MILESTONE`

- **§4.4 Event Bridge — Opción C:** actualizar el código de ejemplo. La Opción C es la correcta y ya es implementable:

```javascript
// workspace-synapse-handlers.js — conexión real (no hipotética)
// bridge.on('message', ...) escucha todos los mensajes de Brain ya clasificados
bridge.on('message', (enriched) => {
  if (enriched.type === 'ONBOARDING_MILESTONE') {
    const stepId = milestoneRegistry.resolveEvent(enriched.event);
    if (stepId) milestoneReactor.handleMilestone(stepId);
  }
});
```

- **§6 (Archivos a adjuntar):** actualizar tabla — `shared/synapse-bridge.js` ya no es necesario para responder Incógnita 3 (ya se adjuntó y se resolvió). Los archivos pendientes son los de las Incógnitas 1, 2 y 5.

- **Estado del documento:** cambiar de "pre-implementación" a "implementación en curso — Cambio 1/6 aplicado".

### `synapse-bridge.js` (el archivo mismo)

El header JSDoc ya fue actualizado con la sección `CAMBIOS v3`. No requiere más cambios de documentación.

---

## 7. Resumen ejecutivo

El patch es correcto, atómico y backward-compatible. Resuelve exactamente lo que promete: clasificar los eventos de onboarding en el bridge antes de que lleguen al renderer como `SYNAPSE_EVENT` genérico.

Lo que el patch **no hace** (y no pretende hacer): construir el receptor. El bridge ahora emite `ONBOARDING_MILESTONE` correctamente, pero sin el `MilestoneReactor` y el handler en `workspace-synapse-handlers.js`, esos eventos llegan clasificados al renderer y nadie los procesa. El sistema queda en estado coherente pero incompleto — como conectar un cable bien etiquetado a un enchufe que todavía no existe.

Los Cambios 2-6 son el receptor. La secuencia recomendada para la próxima sesión es desbloquear la Incógnita 1 (fuente de verdad de hitos) e implementar `milestone-registry.js` primero, ya que es la base de todo lo demás.
