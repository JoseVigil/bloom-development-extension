# WBS-DA-001 — Plan de Trabajo (CoWork): migración a `DebuggerAdapter`

| Campo | Valor |
|---|---|
| **Iniciativa** | Migración de la automatización DOM de `content.js` a `chrome.debugger` (CDP) |
| **Documento de diseño** | `RFC-DA-001-DebuggerAdapter.md` (v0.1) — las referencias `§n`, `I-n`, `ADR-n`, `H-n`, `Q-n`, `R-n` apuntan a ese RFC |
| **Fecha** | 2026-09-19 |
| **Estado** | Propuesto — pendiente de estimación conjunta y priorización |

## 0. Convenciones

- **ID de ticket:** `DA-<fase>-<nn>`. Épicas: una por fase.
- **Roles:** `EXT` (extensión/JS), `HOST` (`bloom-host.exe`, C++), `BRAIN` (Python), `SEC` (seguridad), `QA`, `GOV` (Gobernanza/Producto), `PLAT` (Sentinel/Metamorph/build), `DOC`.
- **Estimación:** días-persona ideales, **rangos de orden de magnitud (±40 %)** para planificar; se refinan en la sesión de estimación. No incluyen revisión de código ni esperas de terceros.
- **Prioridad:** `P0` bloquea la fase siguiente · `P1` necesario para el objetivo · `P2` recomendado.
- **Etiquetas sugeridas para la plataforma:** `fase-0…4`, `ext`, `host`, `brain`, `security`, `poc`, `adr`, `breaking-contract`.
- **Regla de oro (gate de seguridad):** ningún build con `actuator_impl=debugger` habilitado puede salir de desarrollo sin **DA-2-03** (puntos P1–P5) y **DA-2-05** (`CdpGate`) completados. Hasta entonces, `PolicyEngine` opera con un **stub que deniega todo** (fail-closed).
- **Todos los tests** de denegación usan servidores locales con `--host-resolver-rules`; **ningún test automatiza sitios reales de proveedores de IA** (I-3).

## 1. Resumen por fase

| Fase | Objetivo | Tickets | Esfuerzo | Gate de salida |
|---|---|---|---|---|
| **0 — Viabilidad (PoC)** | Resolver incertidumbres del diseño con evidencia. | 6 | ~13 d | ADRs S/U/D firmados (DA-0-06) |
| **1 — Infraestructura y puente local** | Contrato v2, orquestador, sesiones, eventos, ciclo de vida. | 10 | ~35 d | Contrato v2 estable; ciclo de vida verde en E2E con **stub deny-all** |
| **2 — Seguridad y enrutamiento** | Denylist, fachada cerrada, presupuesto CDP. | 8 | ~24 d | Revisión de seguridad aprobada (DA-2-07) |
| **3 — Migración de comandos** | Olas 3A (NAVIGATE/TYPE/CLICK) → 3B → 3C. | 15 | ~46 d | Paridad + criterios de retiro por ola |
| **4 — Rollout y retiro** | Canary, retiro de `content.js`, documentación. | 4 | ~10 d | Criterios de retiro (RFC §11) |
| **Total** | | **43** | **~128 d-p** | Paralelizable entre EXT / BRAIN / HOST |

## 2. Dependencias entre fases

```
Fase 0 ──▶ DA-0-06 (Go/No-Go)
              │
              ▼
Fase 1:  DA-1-01 (SSoT) ─┬▶ DA-1-02 (host L1)
                         ├▶ DA-1-03 (ActuatorClient)
                         └▶ DA-1-04 (ActuatorPort) ─▶ DA-1-05 (Session) ─▶ DA-1-06 (eventos) ─▶ DA-1-07 (registro tabs)
          DA-0-05 ─▶ DA-1-08 (auth :5678)      DA-1-09 (manifest)      DA-1-10 (logs/auditoría)
              │
              ▼
Fase 2:  DA-2-01 (PolicyEngine) ─▶ DA-2-02 (denylist SSoT) ─▶ DA-2-03 (P1–P5)
         DA-2-04 (Registry) ─▶ DA-2-05 (CdpGate) ─▶ DA-2-06 (campos sensibles)
         DA-2-03 + DA-2-05 ─▶ DA-2-07 (revisión de seguridad) ─▶ ★ GATE DE SEGURIDAD
                                                                    │
                                                                    ▼
Fase 3:  3A: DA-3-01 (UI) ─┐
              DA-3-02 (frames) ─┼▶ DA-3-03 NAVIGATE ─▶ DA-3-04 TYPE ─▶ DA-3-05 CLICK ─▶ DA-3-06 (gate ola 1)
         3B:  DA-3-07 … DA-3-11  (lecturas, WAIT, FOCUS/SCROLL, SNAPSHOT, DOM_FRAMES)
         3C:  DA-3-12 UPLOAD · DA-3-13 WATCH · DA-3-14 WATCH_URL · DA-3-15 SIGNAL/PAGE_CHANGED
              │
              ▼
Fase 4:  DA-4-01 (canary) ─▶ DA-4-02 (retiro content.js) ─▶ DA-4-03 (docs) · DA-4-04 (runbooks)
```

## 3. Definición de "hecho" (aplica a todo ticket de código)

- [ ] Cambio cubierto por tests (unitarios y, si aplica, E2E con fixtures locales).
- [ ] Ningún uso de `chrome.debugger.sendCommand` fuera de `cdp-gate.js` (lint verde).
- [ ] Sin `console.log` de payloads sensibles (`text`, `result`, `response`).
- [ ] Contrato modificado ⇒ cambio en `protocols/actuator.schema.json` + regeneración de artefactos.
- [ ] Documentación actualizada (RFC/Reference) o ticket de doc enlazado.
- [ ] Revisión de código por un segundo rol (`SEC` si toca política, `CdpGate` o upload).

---

# FASE 0 — Pruebas de viabilidad (PoC)

> **Entorno común de PoC:** extensión aislada `poc-debugger/` (no modifica Cortex), páginas *fixture* locales, Chrome estable actual + versión mínima (125). Cada PoC entrega: informe con datos crudos, código de referencia y **recomendación para un ADR**. Los PoC-1/2/3 son los solicitados; PoC-4 y el spike DA-0-05 son **adicionales** por el riesgo que cubren.

### DA-0-01 · PoC — Clic *trusted* con slave mode y evaluación de `Input.setIgnoreInputEvents`
**Tipo:** Spike · **Comp.:** EXT · **Rol:** EXT + QA · **Est.:** 3 d · **Depende de:** — · **Prioridad:** P0 · **Riesgo cubierto:** R-01

**Descripción.** Determinar cómo coexisten los eventos de entrada trusted (`Input.dispatchMouseEvent`) con el bloqueo de usuario del slave mode (H8) y si `Input.setIgnoreInputEvents` exime a los eventos despachados por CDP. Fixtures: (a) botón que registra `event.isTrusted`; (b) formulario React con inputs controlados; (c) página con overlay; (d) `body{pointer-events:none}` como en `content.js`; (e) botón dentro de iframe.

**Matriz a ejecutar** (100 repeticiones por celda):

| Estrategia | Slave mode | Escenarios |
|---|---|---|
| Base (comportamiento actual: `el.click()` sintético) | ON / OFF | a, c, d, e |
| **S1** `setIgnoreInputEvents(true)` + CDP | ON | a, c, d, e |
| **S2** shield con toggle de `pointer-events` alrededor del despacho | ON | a, c, d, e |
| **S3** `input_mode:"synthetic"` | ON | a, c, d, e |

**Criterios de aceptación**
- [ ] Informe con éxito de entrega (%), `isTrusted`, latencia por clic y **si un clic humano real es bloqueado** (prueba manual: ≥ 3 personas × 10 intentos por estrategia).
- [ ] Respuesta documentada a: ¿`setIgnoreInputEvents(true)` bloquea también `Input.dispatchMouseEvent`, `dispatchKeyEvent` e `insertText`?
- [ ] Para S2: medir y documentar la ventana de carrera; el shield **no roba foco** (verificado con `document.activeElement`).
- [ ] Confirmar que `Input.insertText` funciona con inputs controlados de React (fixture b) y `contenteditable`.
- [ ] Recomendación para **ADR-S** (estrategia por defecto y condiciones de degradación a S3).

### DA-0-02 · PoC — Subida de archivos con `DOM.setFileInputFiles` y temporales escritos por el host
**Tipo:** Spike · **Comp.:** EXT + HOST · **Rol:** EXT + HOST + SEC · **Est.:** 3 d · **Depende de:** — · **Prioridad:** P0 · **Riesgo cubierto:** T5

**Descripción.** Validar que `chrome.debugger` permite `DOM.setFileInputFiles` con una ruta escrita por el host en un directorio de cuarentena, y comparar con el fallback `DataTransfer` por fragmentos (límite host→Chrome de 1 MB por mensaje, RFC §5.2).

**Casos:** tamaños 1 KB / 5 MB / 100 MB; binarios (PNG, PDF); ruta con espacios y Unicode; `<input type=file>` oculto (`display:none`), `multiple`, y dentro de iframe; lectura posterior con `FileReader` (nombre, tamaño, tipo, hash); permisos/ACL de Windows; posible demora por antivirus.

**Criterios de aceptación**
- [ ] Tabla de resultados por caso para (A) cuarentena + `setFileInputFiles` y (B) `DataTransfer` fragmentado (throughput y límites).
- [ ] **Pruebas negativas de seguridad** en el validador del host: rutas con `..`, UNC (`\\servidor\…`), enlaces simbólicos/junctions, ruta fuera de `upload_root` ⇒ rechazadas.
- [ ] Definido el ciclo de limpieza (tras comando, TTL, fin de `launch_id`) y verificado que no quedan temporales.
- [ ] Recomendación para **ADR-U**: cuarentena, fallback o híbrido (con umbral de tamaño).

### DA-0-03 · PoC — `onDetach` y banner de la API: desarrollo vs. producción
**Tipo:** Spike · **Comp.:** EXT + PLAT · **Rol:** EXT + QA + PLAT · **Est.:** 2 d · **Depende de:** — · **Prioridad:** P0 · **Riesgo cubierto:** R-02, R-05

**Descripción.** Construir la matriz empírica de `reason` de `onDetach` (RFC §6.3, que corrige la premisa sobre `canceled_by_user`) y caracterizar el banner.

**Matriz:** Chrome (estable actual, 125, Beta) × acción {cerrar tab, **abrir DevTools con sesión activa**, **descartar el banner**, navegación cross-origin, recarga de la extensión, detener el service worker, crash de tab, *tab discarding*} × {con / sin `--silent-debugger-extension-api`}.

**Criterios de aceptación**
- [ ] Tabla publicada en la KB: acción → `reason` **crudo** → ¿`attach` posterior posible? → mensaje de error.
- [ ] Confirmar si DevTools coexiste con la sesión (multi-cliente) o la desplaza; documentar la versión de Chrome.
- [ ] Medir el **desplazamiento de layout** al aparecer/desaparecer el banner (alto del viewport, tiempo de estabilización) y validar los parámetros de asentamiento del RFC §6.2 (2 lecturas × 50 ms, tope 500 ms).
- [ ] Fijar el valor efectivo de `requiredVersion` en `attach` (`"0.1"` vs `"1.3"`).
- [ ] Verificar que una sesión activa mantiene vivo el service worker > 5 min sin tráfico.
- [ ] Validar la política dev/prod (§6.6): el flag de silenciado funciona en dev y el validador de configuración lo **rechaza** en perfil de producción.
- [ ] Mapeo final de razones ⇒ acciones (actualiza la tabla de §6.3).

### DA-0-04 · PoC (adicional) — Frames anidados y OOPIF
**Tipo:** Spike · **Comp.:** EXT · **Rol:** EXT · **Est.:** 3 d · **Depende de:** — · **Prioridad:** P1 · **Riesgo cubierto:** R-04

**Descripción.** Validar `Target.setAutoAttach` con `flatten:true` (recursivo manual para A→B→C cross-origin, Chrome ≥ 125), `sessionId` en `sendCommand`, mundos aislados por frame y cálculo de coordenadas del clic sumando desplazamientos de `owner`.

**Criterios de aceptación**
- [ ] Clic trusted y `insertText` correctos dentro de iframes de 1, 2 y 3 niveles (mismo proceso y OOPIF), con scroll interno.
- [ ] Un iframe de host **denegado** (fixture servido bajo un nombre denegado vía `--host-resolver-rules`) queda **inalcanzable** sin usar `DOM.getDocument({pierce:true})`.
- [ ] Manejo verificado de `frameNavigated`/`frameDetached` (caducidad de `frame_id`).
- [ ] Recomendación de alcance inicial (¿solo `main` en 3A?).

### DA-0-05 · Spike (adicional) — Auditoría de canal `:5678`, `SYNAPSE_CONFIG` y dependencias de contrato
**Tipo:** Spike de revisión · **Comp.:** BRAIN + HOST + EXT · **Rol:** SEC + BRAIN + HOST · **Est.:** 1 d · **Depende de:** — · **Prioridad:** P0

**Descripción.** Responder Q2–Q5 del RFC revisando código: autenticación/bind de `:5678`; exposición de `*.synapse.config.js` en `web_accessible_resources` (H11); dónde se manejan `SIGNAL`/`PAGE_CHANGED` (¿`background-companion.js`?); qué flujos de Brain dependen de `ACTUATOR_READY`; qué recetas `.ion` dependen de iframes/broadcast.

**Criterios de aceptación**
- [ ] Respuestas escritas a Q2, Q3, Q4 y Q5, con referencias a archivos/líneas.
- [ ] Lista de brechas convertidas en tickets (DA-1-08, DA-1-09, DA-3-15 se ajustan al hallazgo).
- [ ] Si algún flujo IonPump actual apunta a sitios de IA (Q9): escalado inmediato a `GOV` (incumple I-3 hoy).

### DA-0-06 · Gate de decisión de Fase 0 (ADRs)
**Tipo:** Decisión · **Comp.:** todos · **Rol:** Arquitectura + `SEC` + `GOV` · **Est.:** 1 d · **Depende de:** DA-0-01…05 · **Prioridad:** P0

**Criterios de aceptación**
- [ ] **ADR-S** (slave mode / input trusted), **ADR-U** (upload), **ADR-D** (`onDetach`, banner y `requiredVersion`) redactados y aprobados.
- [ ] Decisión Go / No-Go / Go-con-alcance-reducido documentada. **No-Go** si ninguna estrategia S1–S3 permite clic trusted sin comprometer el bloqueo de usuario **y** S3 no cubre los flujos requeridos.
- [ ] RFC actualizado a v0.2 con los resultados.

---

# FASE 1 — Infraestructura base y puente local

> **Objetivo:** contrato v2, orquestador del lado Brain, manejador de sesiones, listeners y ciclo de vida en el adaptador. **Todo bajo `actuator_impl` con default `content`** y con `PolicyEngine` como stub deny-all: esta fase no cambia el comportamiento en producción.

### DA-1-01 · SSoT del protocolo `protocols/actuator.schema.json` + generación de artefactos
**Comp.:** protocolo · **Rol:** EXT + BRAIN + HOST · **Est.:** 4 d · **Depende de:** DA-0-06 · **Prioridad:** P0

**Descripción.** Definir en un único JSON Schema: envelope v2 (request/response/eventos), comandos (`DOM_*` + control: `ACTUATOR_REGISTER_TAB`, `ACTUATOR_RELEASE`, `ACTUATOR_CANCEL`, `DOM_FRAMES`, `ACTUATOR_STATUS`, `POLICY_TIGHTEN`), taxonomía de errores (RFC §5.3) y `frame`. Generar: dataclasses Python (Brain), validadores JS (extensión) y tabla de comandos/límites para C++ (host).
- [ ] Schema cubre todos los comandos actuales y sus `options` con defaults idénticos a `content.js` v2.3.
- [ ] Generadores integrados en el build; CI falla si los artefactos están desactualizados.
- [ ] Tests de compatibilidad: mensajes v1 reales (capturados de IonPump/SynapseSimulator) validan contra el *shim* v1.
- [ ] Campos extra y tipos incorrectos rechazados (fuzz básico).

### DA-1-02 · Validador L1 en `bloom-host.exe`
**Comp.:** HOST · **Rol:** HOST · **Est.:** 4 d · **Depende de:** DA-1-01 · **Prioridad:** P0

**Descripción.** Antes de reenviar por Native Messaging: JSON bien formado, `schema_v`, `command` ∈ tabla generada, tamaño **< 1 MB** (límite host→Chrome; superarlo cierra el puerto). Rechazos registrados y respondidos a Brain con `E_SCHEMA_INVALID` / `E_UNKNOWN_COMMAND` / `E_PAYLOAD_TOO_LARGE`.
- [ ] Ningún mensaje inválido llega a la extensión (test con corpus de fuzz).
- [ ] Handshake de 3 fases y heartbeat **sin cambios** (regresión verde).
- [ ] Log del host sin payloads sensibles.

### DA-1-03 · `ActuatorClient` en Brain (orquestador tipado)
**Comp.:** BRAIN · **Rol:** BRAIN · **Est.:** 5 d · **Depende de:** DA-1-01 · **Prioridad:** P0

**Descripción.** Implementar la interfaz del RFC §5.6 sobre `SynapseServer.send_command`: cola FIFO por tab (1 en vuelo), timeouts, `ACTUATOR_CANCEL`, mapeo `error_code` → excepciones tipadas, suscripción a eventos, `outcome` en errores de escritura, **sin reintentos automáticos de escrituras**.
- [ ] No existe API `send_cdp()`/`evaluate()` (test que inspecciona la interfaz pública).
- [ ] Adaptador *shim* que traduce las llamadas actuales de IonPump/IntentExecutor a `ActuatorClient` sin cambiar recetas.
- [ ] Tests con host simulado: orden por tab, paralelismo entre tabs, timeouts, cancelación, `ActuatorBusy`.

### DA-1-04 · `ActuatorPort` en `background.js` (unificación de rutas)
**Comp.:** EXT · **Rol:** EXT · **Est.:** 3 d · **Depende de:** DA-1-01 · **Prioridad:** P0

**Descripción.** Reemplazar los tres sitios de `tabs.sendMessage` (H4: `DOM_COMMANDS`, `forwardToContent`, `RUNTIME_DOM_COMMANDS`) por `ActuatorPort.execute`. Implementar `ContentActuator` (sin cambio funcional) y el enrutamiento por `actuator_impl`. **Dual-emit** `RESPONSE` + `DOM_COMMAND_ACK`.
- [ ] Paridad de comportamiento verificada con la suite de regresión existente (IonPump + SynapseSimulator).
- [ ] Una sola lista de comandos (generada del schema); `DOM_READ/UPLOAD/SNAPSHOT/LOCK_UI` y `DOM_NAVIGATE/WATCH*` funcionan por ambas rutas.
- [ ] `chrome.runtime.lastError` consumido en todos los callbacks.

### DA-1-05 · `SessionManager`: estados, attach perezoso, idle, revocación y reconciliación
**Comp.:** EXT · **Rol:** EXT · **Est.:** 5 d · **Depende de:** DA-1-04, DA-0-06 · **Prioridad:** P0

**Descripción.** Máquina de estados del RFC §6.1: `attach` perezoso con secuencia §6.2 (admisión → política → attach → asentamiento de layout → habilitaciones mínimas), `Set` de tabs adjuntas, histéresis de detach (`idle_detach_ms`, `post_unlock_grace_ms`), estado `REVOKED` pegajoso, lease persistido en `chrome.storage.session`, reconciliación al despertar el SW (§6.5). Listeners `onEvent`/`onDetach` registrados **síncronamente** en el primer turno.
- [ ] Ningún `attach` sin pasar por `PolicyEngine` (stub deny-all ⇒ todos los `attach` rechazados en esta fase).
- [ ] Tests: doble attach, reintento con `FOREIGN_DEBUGGER`, SW detenido/reanudado con sesión activa, cierre de tab en vuelo.
- [ ] Constantes (TTL, gracia, reintentos, `debugger_protocol_version`) configurables por perfil.

### DA-1-06 · Puente de eventos y ciclo de vida hacia Brain
**Comp.:** EXT + BRAIN · **Rol:** EXT + BRAIN · **Est.:** 3 d · **Depende de:** DA-1-05 · **Prioridad:** P0

**Descripción.** Implementar la tabla de `onDetach` (RFC §6.3): mapeo `reason` crudo → acción y eventos `ACTUATOR_ATTACHED`, `ACTUATOR_DETACHED {reason, revoked?, foreign?}`; fallo de comandos en vuelo con `E_REVOKED_BY_USER`/`E_DETACHED`; evento `ACTUATOR_CAPABILITIES` posterior a `CONFIRMED` (**sin tocar** la máquina de handshake). Brain expone estos eventos en `ActuatorClient.events()`.
- [ ] `reason` desconocido ⇒ `LOST_FOREIGN` + log de severidad alta (test).
- [ ] Tras `canceled_by_user`, **ningún** comando provoca re-attach (test).
- [ ] Capabilities incluyen versión de Chrome, `policy.version/sha256` y `features`.

### DA-1-07 · Registro de tabs y semántica de `ACTUATOR_READY`
**Comp.:** EXT + BRAIN · **Rol:** EXT + BRAIN · **Est.:** 2 d · **Depende de:** DA-1-06, DA-0-05 · **Prioridad:** P0

**Descripción.** `ACTUATOR_REGISTER_TAB`/`ACTUATOR_RELEASE`; `tab.create` iniciado por Brain registra automáticamente. `ACTUATOR_READY` (RFC §6.4) al completarse la carga del top frame de tabs registradas y admitidas, **sin exigir attach**, con `attach_state`. Tabs denegadas ⇒ `ACTUATOR_DENIED` **sin URL**. Auditar y adaptar los consumidores de `READY` en Brain (Q3).
- [ ] Ningún evento para tabs no registradas (test).
- [ ] Sin interbloqueo: Brain puede esperar `READY` y luego enviar su primer comando con la tab aún *detached*.
- [ ] Lista de flujos de Brain modificados y verificados.

### DA-1-08 · Autenticación del canal local `:5678` (token de lanzamiento)
**Comp.:** PLAT + BRAIN + HOST · **Rol:** SEC + PLAT + BRAIN + HOST · **Est.:** 4 d · **Depende de:** DA-0-05 · **Prioridad:** P0

**Descripción.** Implementar los requisitos del RFC §5.7: bind `127.0.0.1`; token de 256 bits por `launch_id` generado por Sentinel y entregado por canal privado del SO (**nunca** en `SYNAPSE_CONFIG`); verificación en el primer frame de cada conexión; rechazo y cierre si falla. Evaluar named pipe con ACL como evolución.
- [ ] Conexión sin token o con token de otro `launch_id` ⇒ rechazada (test).
- [ ] El token no aparece en logs, `SYNAPSE_CONFIG`, ni en el debug panel.
- [ ] Rotación al reiniciar el `launch_id`.

### DA-1-09 · Manifest, build y política de banner por entorno
**Comp.:** EXT + PLAT · **Rol:** EXT + PLAT · **Est.:** 2 d · **Depende de:** DA-0-03 · **Prioridad:** P1

**Descripción.** Agregar `debugger`; `minimum_chrome_version: "125"`; registro dinámico de `content.js` solo con `actuator_impl=content`; quitar `*.synapse.config.js` de `web_accessible_resources` si nada web lo necesita (H11); verificar ausencia de `clipboardRead`; evaluar acotar `host_permissions`. Sentinel: parámetro `dev_silent_debugger` (solo dev) con **validador que lo rechaza en producción**.
- [ ] Manifest de producción sin `content_scripts` estático de `content.js` bajo `actuator_impl=debugger`.
- [ ] Test del validador: flag silencioso en perfil de producción ⇒ falla el lanzamiento.
- [ ] Decisión documentada sobre `host_permissions`.

### DA-1-10 · Auditoría, métricas y redacción de logs
**Comp.:** EXT + BRAIN · **Rol:** EXT + SEC · **Est.:** 3 d · **Depende de:** DA-1-04 · **Prioridad:** P1

**Descripción.** `AuditLog` (RFC §9) en `storage.session` con espejo por lotes; métricas del §9; **redacción** en `sendToHost` y `forwardToDebugPanel` de `text`, `result` y `response` de comandos del actuador (H9); alarma de gobierno para `CDP_BUDGET_VIOLATION` y comandos sobre Tier A/B.
- [ ] Prueba automatizada: ningún log de consola/debug panel contiene el texto tipeado ni valores leídos.
- [ ] Auditoría sin URL completa ni query (solo hostname).
- [ ] Dashboard/consulta mínima de denegaciones por regla.

---

# FASE 2 — Interfaz de seguridad y enrutamiento

> **Objetivo:** que la frontera de autoridad y la fachada cerrada sean **propiedades técnicas verificables** antes de migrar un solo comando. Esta fase es un **gate**: sin ella, Fase 3 no habilita `debugger`.

### DA-2-01 · `PolicyEngine`: normalización de URL y función de decisión
**Comp.:** EXT · **Rol:** EXT + SEC · **Est.:** 3 d · **Depende de:** DA-1-01 · **Prioridad:** P0

**Descripción.** Función pura `decide(url, ctx)` según RFC §7.2: coincidencia por host (`===` o sufijo `.host`), normalización (minúsculas, punto final), tratamiento de `blob:`, `about:`/`data:` (heredan del padre), esquemas no `http(s)` denegados, fail-closed ante error de parseo.
- [ ] Suite por tablas ≥ 60 casos: `www.claude.ai` ⇒ deny; `claude.ai.evil.com` y `evilclaude.ai` ⇒ allow (por denylist); `CLAUDE.AI.` ⇒ deny; `https://user@claude.ai@evil.com` ⇒ host `evil.com`; IDN/punycode; puertos; `blob:https://claude.ai/…` ⇒ deny; `about:blank` bajo padre denegado ⇒ deny; `chrome:`, `file:`, `chrome-extension:` ⇒ deny.
- [ ] `aistudio.google.com` denegado **sin** denegar `google.com`.
- [ ] Reemplaza el stub deny-all de Fase 1 detrás de la flag.

### DA-2-02 · Denylist embebida, versionada y monótona
**Comp.:** EXT + PLAT + GOV · **Rol:** SEC + GOV + PLAT · **Est.:** 2 d · **Depende de:** DA-2-01 · **Prioridad:** P0

**Descripción.** `policy/authority-boundary.denylist.json` (RFC §7.2) incluido en el `.blx` firmado; `policy_version` y hash publicados en `ACTUATOR_CAPABILITIES`; comando `POLICY_TIGHTEN` solo *agrega* entradas hasta el próximo arranque. **`GOV` resuelve Q1, Q6 y Q9** (contenido definitivo de Tier B y C).
- [ ] Sign-off de Gobernanza sobre Tier A/B/C registrado en el ticket.
- [ ] Test: ningún camino de código permite quitar una entrada en runtime (I-6).
- [ ] La lista no es modificable por mensajes de host/Brain salvo `POLICY_TIGHTEN` (solo agregar).
- [ ] Proceso de alta de hosts documentado (quién, cómo, cuándo se despliega).

### DA-2-03 · Puntos de aplicación P1–P5
**Comp.:** EXT · **Rol:** EXT + SEC · **Est.:** 4 d · **Depende de:** DA-2-02, DA-1-05 · **Prioridad:** P0

**Descripción.** Implementar y cablear los cinco puntos del RFC §7.2: **P1** admisión (incluida la URL destino de `DOM_NAVIGATE`), **P2** antes de `attach`, **P3** navegación (`webNavigation` + `Page.frameNavigated` ⇒ detach inmediato y estado `DENIED`), **P4** frames/targets hijos (`Target.detachFromTarget`, exclusión de frames), **P5** recheck pre-despacho con caché síncrona de URL *committed* por frame. Deny dinámico de tabs en `googleLoginWatchers`.
- [ ] E2E: tab permitida que **redirige** a host denegado ⇒ detach inmediato y ningún comando posterior se ejecuta.
- [ ] E2E: página permitida con iframe de host denegado ⇒ el frame es inalcanzable (P4).
- [ ] E2E: tab bajo `googleLoginWatchers` ⇒ `E_POLICY_DENIED` sin importar el host.
- [ ] Test TOCTOU: cambio de URL entre P1 y P5 ⇒ abortado.
- [ ] `ACTUATOR_DENIED` sin URL; auditoría con `rule_id`/`tier`.

### DA-2-04 · `CommandRegistry` y validación de esquema (fachada cerrada)
**Comp.:** EXT · **Rol:** EXT + SEC · **Est.:** 3 d · **Depende de:** DA-1-01 · **Prioridad:** P0

**Descripción.** Registro cerrado: por comando, esquema, timeout máximo, clase de riesgo, presupuesto CDP y capacidad requerida (generado del SSoT). Desconocido ⇒ `E_UNKNOWN_COMMAND`. `allowed_commands` por perfil/intent.
- [ ] Cualquier mensaje con `command` fuera del registro nunca llega a `SessionManager` ni a `CdpGate` (test).
- [ ] Validación de `selector` (longitud, tipo), `text`, `url`, `frame`.
- [ ] `ttl_ms` vencido ⇒ descartado sin ejecutar.

### DA-2-05 · `CdpGate`: presupuesto de métodos y plantillas pineadas
**Comp.:** EXT · **Rol:** EXT + SEC · **Est.:** 5 d · **Depende de:** DA-2-04 · **Prioridad:** P0

**Descripción.** Único módulo con `chrome.debugger.sendCommand`. Valida `método ∈ presupuesto(comando)` y que `Runtime.callFunctionOn` use una `functionDeclaration` **idéntica a una plantilla registrada** (hash SHA-256 en build). Implementar plantillas base (`resolve`, `hit_test`, `read`, `wait`, `scroll`, `clear`, `outer_html`, `upload_datatransfer`, `watch`) sin concatenar datos en código. Regla de lint `no-restricted-properties`.
- [ ] Test de barrido: se enumera el catálogo de métodos CDP y **todo método no presupuestado es rechazado** (incluye `Network.getCookies`, `Runtime.evaluate`, `Page.captureScreenshot`, `Page.setBypassCSP`).
- [ ] Intentar `callFunctionOn` con una declaración modificada en 1 carácter ⇒ rechazado.
- [ ] `CDP_BUDGET_VIOLATION` genera alarma (DA-1-10) y falla el comando con `E_INTERNAL`.
- [ ] Lint en CI.

### DA-2-06 · Política de campos sensibles y redacción de resultados
**Comp.:** EXT · **Rol:** EXT + SEC · **Est.:** 2 d · **Depende de:** DA-2-05 · **Prioridad:** P1

**Descripción.** `E_SENSITIVE_FIELD` para `input[type=password]` y `autocomplete` `current-password`, `new-password`, `one-time-code`, `cc-*` en `DOM_READ`, `DOM_SNAPSHOT` (valores) y `DOM_TYPE`. Levantar la restricción solo con bandera de política firmada.
- [ ] Fixtures con campos sensibles: lectura/tipeo bloqueados; auditoría registra el intento.
- [ ] `DOM_SNAPSHOT` no incluye valores de esos campos.

### DA-2-07 · Revisión de seguridad y pruebas contra página hostil
**Comp.:** EXT · **Rol:** SEC + QA · **Est.:** 3 d · **Depende de:** DA-2-03, DA-2-05 · **Prioridad:** P0

**Descripción.** Recorrer el modelo de amenazas T1–T8 (RFC §7.1) con fixtures hostiles: prototipos de DOM alterados, spoof del binding de `SIGNAL`, redirecciones encadenadas, `blob:`, iframe de host denegado, selector patológico (ReDoS/DoS), comandos fuera de registro, mensajes fuera de orden, token inválido en `:5678`.
- [ ] Informe con cada amenaza: prueba, resultado y estado (mitigada / riesgo aceptado con dueño).
- [ ] **Cero** métodos CDP fuera de presupuesto observados durante toda la suite (instrumentación de `sendCommand`).
- [ ] Aprobación explícita de `SEC` = **gate de seguridad** para habilitar Fase 3.

### DA-2-08 · Modo `deny_and_allow`: allowlist por perfil/intent
**Comp.:** EXT + BRAIN + PLAT · **Rol:** EXT + BRAIN + GOV · **Est.:** 2 d · **Depende de:** DA-2-01 · **Prioridad:** P1

**Descripción.** `allowed_hosts` por perfil/intent en `SYNAPSE_CONFIG` (sin secretos); la denylist siempre prevalece; modo por defecto de producción `deny_and_allow`, `deny_only` solo dev (RFC §7.2, R-03).
- [ ] Host fuera de allowlist ⇒ `E_POLICY_DENIED` (`NOT_ALLOWLISTED`).
- [ ] Un host de la denylist nunca puede ser habilitado por allowlist (test).
- [ ] Documentado cómo Brain declara `allowed_hosts` por receta/intent.

---

# FASE 3 — Migración de comandos DOM (escalonada)

> **Prerrequisito:** gate de seguridad de DA-2-07. **Método por comando:** implementar en `DebuggerActuator` → tests de paridad con fixtures → `shadow` (solo lecturas) → canary por perfil → default `debugger`. Cada ticket de comando incluye su **criterio de paridad** respecto de `content.js` v2.3 y su **mejora esperada**.

## Ola 3A — Fundaciones y comandos prioritarios: `DOM_NAVIGATE`, `DOM_TYPE`, `DOM_CLICK`

### DA-3-01 · Rediseño de UI y slave mode (`ui/bloom-ui.js`)
**Comp.:** EXT · **Rol:** EXT + QA · **Est.:** 4 d · **Depende de:** DA-0-06 (ADR-S), DA-2-07 · **Prioridad:** P0

**Descripción.** Extraer ribbon, overlay y shield de `content.js` a un script de UI **bajo demanda** (`chrome.scripting.executeScript`, solo top frame, solo tras P1). Implementar la estrategia decidida en ADR-S (S1/S2 con degradación a S3). `LOCK_UI`/`UNLOCK_UI` conservan su contrato; se mantienen el timer de seguridad de 30 s y los eventos `slave_mode_changed`/`slave_mode_timeout`. Aceptar mensajes **solo** desde el service worker (`sender.id === chrome.runtime.id`).
- [ ] Ningún uso de `pointer-events:none` en `body` como mecanismo de bloqueo.
- [ ] El bloqueo impide la interacción humana **y** no impide los clics del adaptador (según ADR-S), verificado en E2E.
- [ ] La UI no lee ni modifica contenido de la página; no acepta comandos DOM.
- [ ] Timeout de seguridad probado (auto-liberación + evento al host).

### DA-3-02 · `FrameResolver` y direccionamiento explícito de iframes
**Comp.:** EXT · **Rol:** EXT · **Est.:** 5 d · **Depende de:** DA-0-04, DA-2-03 · **Prioridad:** P0

**Descripción.** Implementar RFC §8.2: `frame.by ∈ {main, frame_id, url, owner_selector, first_match}`; árbol vía `Page.getFrameTree` con exclusión de frames denegados (P4); mundos aislados por frame; OOPIF con `sessionId` y `setAutoAttach` recursivo manual; `nav_id` para caducidad; suma de offsets para coordenadas.
- [ ] Alcance inicial mínimo: `main` (obligatorio); `frame_id`/`url`/`owner_selector` según resultado de DA-0-04.
- [ ] `first_match` determinista (orden de árbol, principal primero), con `meta.frame_compat_used`.
- [ ] Frame denegado ⇒ `E_FRAME_NOT_FOUND` sin filtrar su URL.
- [ ] Sin uso de `DOM.getDocument({pierce:true})`.

### DA-3-03 · Migrar `DOM_NAVIGATE` (corrige H1)
**Comp.:** EXT · **Rol:** EXT · **Est.:** 2 d · **Depende de:** DA-2-05, DA-1-06 · **Prioridad:** P0

- [ ] P1 sobre URL **destino**; solo `http(s)`; `javascript:`/`file:`/`chrome:` ⇒ `E_POLICY_DENIED`/`E_SCHEMA_INVALID`.
- [ ] `Page.navigate` + espera de `load`/`domcontentloaded` (`wait_until`) desde el SW; **la respuesta llega** tras navegación cross-origin (regresión de H1).
- [ ] Emite `ACTUATOR_READY` y `PAGE_CHANGED` coherentes; P3 activo tras navegar.
- [ ] Ruta alternativa sin debugger (`tabs.update` + `webNavigation.onCompleted`) para tabs no adjuntas, con la misma política.
- [ ] `outcome` correcto en timeout.

### DA-3-04 · Migrar `DOM_TYPE` (corrige H7)
**Comp.:** EXT · **Rol:** EXT + QA · **Est.:** 3 d · **Depende de:** DA-3-03, DA-2-06 · **Prioridad:** P0

- [ ] `DOM.focus` + `Input.insertText`; `clear` por plantilla o `Ctrl+A`/`Delete`.
- [ ] **Paridad:** inputs y textareas simples. **Mejora:** inputs controlados de React y `contenteditable` (fixtures).
- [ ] Campos sensibles bloqueados (`E_SENSITIVE_FIELD`); `text` nunca aparece en logs (DA-1-10).
- [ ] Verificación posterior opcional (`verify:true`) que relee el valor y lo compara.

### DA-3-05 · Migrar `DOM_CLICK`
**Comp.:** EXT · **Rol:** EXT + QA · **Est.:** 5 d · **Depende de:** DA-3-01, DA-3-02, DA-3-04 · **Prioridad:** P0

- [ ] Resolución → `scrollIntoViewIfNeeded` → `getContentQuads` → verificación de oclusión → `mouseMoved/Pressed/Released` con coordenadas recalculadas inmediatamente antes.
- [ ] `input_mode: auto|trusted|synthetic` implementado y auditado; degradación a sintético documentada en `meta`.
- [ ] `waitVisible` ⇒ `E_ELEMENT_NOT_VISIBLE` / `E_ELEMENT_OCCLUDED`; `multiple` itera con límite.
- [ ] Funciona con slave mode activo (según ADR-S) y dentro de iframes soportados (DA-3-02).
- [ ] P5 verificado antes de cada despacho.

### DA-3-06 · Gate de la ola 3A
**Rol:** QA + Arquitectura + `SEC` · **Est.:** 3 d · **Depende de:** DA-3-03…05 · **Prioridad:** P0

- [ ] Suite E2E de paridad/mejora verde para los 3 comandos.
- [ ] `canary` en un perfil interno ≥ 1 semana: éxito ≥ línea base; p95 ≤ 1,5× línea base; **0** violaciones de presupuesto/política.
- [ ] Métricas de attach/detach y `LOST_FOREIGN` dentro de lo esperado; histéresis calibrada (RFC §6.2).
- [ ] Recetas `.ion` auditadas por dependencia de broadcast (Q4).

## Ola 3B — Lecturas y utilidades

### DA-3-07 · `DOM_READ` y `DOM_EXTRACT`
**Est.:** 2 d · **Depende de:** DA-3-06 · **Prioridad:** P1
- [ ] Plantilla `read` en mundo aislado; opciones `attribute`/`multiple` con paridad.
- [ ] Campos sensibles bloqueados; resultado redactado en logs.
- [ ] **Shadow** con `content.js` en fixtures y en canary: diferencias = 0 o explicadas.
- [ ] `DOM_EXTRACT` sigue como alias explícito.

### DA-3-08 · `DOM_WAIT`
**Est.:** 2 d · **Depende de:** DA-3-06 · **Prioridad:** P1
- [ ] MutationObserver con `awaitPromise`; comprobación inmediata (t=0); `timeout`/`checkInterval` respetados; cancelable con `ACTUATOR_CANCEL`.
- [ ] Shadow verde; sin fugas de observers tras timeout o detach.

### DA-3-09 · `DOM_FOCUS` y `DOM_SCROLL`
**Est.:** 2 d · **Depende de:** DA-3-06 · **Prioridad:** P1
- [ ] `DOM.focus`; scroll a `top|bottom|número|selector` con `behavior`; paridad de resultados (`scrolled_to`).
- [ ] Selector dentro de iframes soportados.

### DA-3-10 · `DOM_SNAPSHOT`
**Est.:** 3 d · **Depende de:** DA-3-06, DA-2-06 · **Prioridad:** P1
- [ ] Mantiene `{url, title, html, text, timestamp}`; `includeStyles` funcional (reimplementado con `DOMSnapshot`).
- [ ] Respeta el límite de 64 MiB de la respuesta (paginado o truncado con bandera).
- [ ] Valores de campos sensibles excluidos; `url` reportada solo si el host está permitido.

### DA-3-11 · `DOM_FRAMES` (nuevo) y gate de la ola 3B
**Est.:** 2 d · **Depende de:** DA-3-02, DA-3-07…10 · **Prioridad:** P1
- [ ] `DOM_FRAMES` devuelve el árbol filtrado por política (frames denegados como `denied:true`, sin URL).
- [ ] Shadow de lecturas sin diferencias inexplicadas durante ≥ 1 semana.
- [ ] Ola 3B en canary → default `debugger` para lecturas.

## Ola 3C — Comandos con diseño propio

### DA-3-12 · `DOM_UPLOAD` (según ADR-U)
**Comp.:** EXT + HOST + BRAIN · **Rol:** EXT + HOST + SEC · **Est.:** 5 d · **Depende de:** DA-3-06, DA-0-02, DA-2-07 · **Prioridad:** P1
- [ ] Cuarentena en el host (`%LOCALAPPDATA%\Bloom\uploads\{launch_id}\{upload_id}\…`, ACL restringida), `upload_ref {id, sha256, size, name}`; **el comando nunca lleva rutas**.
- [ ] Validación de ruta canónica en el host (sin `..`, UNC ni junctions); verificación de prefijo en la extensión.
- [ ] Soporta binarios y `multiple`; fallback `upload_datatransfer` fragmentado por debajo del umbral definido en ADR-U.
- [ ] Limpieza tras comando/TTL/fin de `launch_id`; tests negativos de seguridad.
- [ ] Hereda política de dominios; auditoría sin contenido.

### DA-3-13 · `DOM_WATCH` y `DOM_UNWATCH` (plantilla `watch` + binding)
**Est.:** 4 d · **Depende de:** DA-3-06, DA-3-15 · **Prioridad:** P2
- [ ] Observer en **mundo aislado con nombre** (`Page.addScriptToEvaluateOnNewDocument` con plantilla pineada) y `Runtime.addBinding` acotado a ese mundo; validar en PoC de este ticket que la página no puede invocar el binding.
- [ ] Persiste entre navegaciones; `once`, `priority` y disparo inmediato (`fired_immediately`) con paridad.
- [ ] Payload del binding tratado como **no confiable** (test de spoof desde página hostil).
- [ ] `DOM_UNWATCH` elimina binding y script; sin fugas tras detach.

### DA-3-14 · `DOM_WATCH_URL` (corrige H2)
**Est.:** 2 d · **Depende de:** DA-3-06 · **Prioridad:** P2
- [ ] `Page.navigatedWithinDocument` con sesión y `webNavigation.onHistoryStateUpdated` sin sesión.
- [ ] **Regresión H2:** dispara en SPA que usa `pushState` desde su propio JS (fixture); mantiene el matching glob actual (`*`).
- [ ] Emite `PAGE_CHANGED {new_page, url, timestamp}` con paridad; la URL solo si el host está permitido.

### DA-3-15 · Enrutamiento de `SIGNAL` y `PAGE_CHANGED` hacia el host (corrige H3)
**Comp.:** EXT + BRAIN · **Rol:** EXT + BRAIN · **Est.:** 2 d · **Depende de:** DA-0-05 (Q5) · **Prioridad:** P1
- [ ] Confirmado dónde se manejan hoy (¿`background-companion.js`?); si no existen, implementar el handler en `background.js` con `sendToHost`.
- [ ] Eventos llegan a Brain con `tab_id`, `frame_id` y `timestamp`; solo de tabs registradas y admitidas por política.
- [ ] Test extremo a extremo: `DOM_WATCH` → `SIGNAL` en Brain (con la implementación de `content.js` **y** la de `debugger`).

---

# FASE 4 — Rollout, retiro de `content.js` y documentación

### DA-4-01 · Flags, canary por perfil y observabilidad de rollout
**Rol:** PLAT + EXT + BRAIN · **Est.:** 3 d · **Depende de:** DA-3-06 · **Prioridad:** P1
- [ ] `actuator_impl` por perfil y override por comando; `shadow` limitado a lecturas.
- [ ] Panel con éxito/latencia por comando×implementación, `REVOKED`, `LOST_FOREIGN`, denegaciones y **violaciones de presupuesto (=0)**.
- [ ] Procedimiento de rollback probado (un cambio de flag restablece `content.js` dinámico).

### DA-4-02 · Retiro de `content.js` estático y del compat v1
**Rol:** EXT + BRAIN · **Est.:** 2 d · **Depende de:** DA-4-01, criterios de retiro (RFC §11) · **Prioridad:** P1
- [ ] Criterios cumplidos durante 2 releases (paridad, p95 ≤ 1,5×, 0 violaciones).
- [ ] Manifest sin `content_scripts` estático; eliminado el dual-emit `DOM_COMMAND_ACK` y `frame_compat:first_match` tras migrar recetas.
- [ ] `content.js` archivado con tag; ruta de rollback documentada para el release siguiente.

### DA-4-03 · Actualización documental
**Rol:** DOC + Arquitectura · **Est.:** 3 d · **Depende de:** DA-4-02 · **Prioridad:** P1
- [ ] `BTIPS-CORTEX-REFERENCE` → v1.3: nueva arquitectura del actuador, contrato v2, eliminación de las secciones del Clipboard Monitor y de `clipboardRead` (H12), manifest actualizado.
- [ ] `AUTHORITY_BOUNDARY.md`: referencia cruzada a la denylist técnica (**propuesta de cambio a `GOV`; el documento es de nivel 1**).
- [ ] `PROVIDER-EXECUTION-SPEC.md` enlazado; ejemplo `perplexity.ai` resuelto según decisión de `GOV` (Q6).
- [ ] RFC-DA-001 marcado como *Implementado* con desviaciones registradas.

### DA-4-04 · Runbooks y soporte
**Rol:** DOC + QA + PLAT · **Est.:** 2 d · **Depende de:** DA-4-01 · **Prioridad:** P2
- [ ] Guía de diagnóstico: `E_ATTACH_FAILED` (subcódigos, políticas empresariales), `LOST_FOREIGN`, `REVOKED`, `E_POLICY_DENIED`.
- [ ] Guía de usuario final: qué es el banner de depuración y qué ocurre si se descarta.
- [ ] Procedimiento de alta de hosts en la denylist y de respuesta ante `CDP_BUDGET_VIOLATION`.

---

## Anexo A — Hitos sugeridos

| Hito | Contenido | Criterio |
|---|---|---|
| **M0** | Fase 0 completa + ADR-S/U/D | Go / No-Go firmado (DA-0-06) |
| **M1** | Fase 1 completa | Contrato v2 estable; ciclo de vida verde con stub deny-all |
| **M2 ★** | Fase 2 completa | **Gate de seguridad** (DA-2-07) aprobado por `SEC` |
| **M3a** | Ola 3A en canary | DA-3-06 |
| **M3b / M3c** | Olas 3B y 3C | Shadow limpio; upload y watchers verificados |
| **M4** | Retiro de `content.js` | Criterios de retiro durante 2 releases |

## Anexo B — Decisiones que `GOV` debe tomar (bloquean tickets)

| ID | Decisión | Bloquea |
|---|---|---|
| Q1 | Contenido definitivo de Tier B y C | DA-2-02 |
| Q6 | Alcance de "herramientas de IA" (categoría vs. lista); ejemplo `perplexity.ai` | DA-2-02, DA-4-03 |
| Q9 | Si algún flujo IonPump actual apunta a sitios de IA (ya incumpliría I-3) | DA-0-05 → escalado inmediato |
| Q7 | ¿Se publicará en Chrome Web Store? | Antes de DA-4-02 |

## Anexo C — Riesgos del plan

| Riesgo | Efecto en el plan | Respuesta |
|---|---|---|
| PoC-1 da No-Go para trusted input | Ola 3A reducida a `DOM_NAVIGATE`/`DOM_TYPE`; `DOM_CLICK` en modo sintético | Alcance reducido explícito en DA-0-06 |
| Q2 revela `:5678` sin autenticación | DA-1-08 pasa a bloqueante de cualquier despliegue | Priorizar antes de DA-1-05 |
| Recetas IonPump dependientes de broadcast de iframes | Retraso de DA-4-02 | `first_match` + migración de recetas |
| Cambios de Chrome en `chrome.debugger` | Regresiones | `minimum_chrome_version`, canary en Beta, `ContentActuator` como salvavidas hasta M4 |
