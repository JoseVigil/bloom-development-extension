# REVISIÓN-DA-001 — Auditoría de consistencia: WBS-DA-001 vs RFC-DA-001

| Campo | Valor |
|---|---|
| **Alcance** | Revisión cruzada de `WBS-DA-001-Plan-de-Trabajo.md` y `RFC-DA-001-DebuggerAdapter.md` (v0.1) |
| **Fecha** | 2026-09-20 (v3: R7 corregido con evidencia de `seed.go`/`ignition_identity.go`/`synapse-runner` — el puerto CDP externo ya existe en producción, no es una hipótesis) |
| **Tipo** | Revisión de consistencia interna, más una verificación puntual contra el código real del repositorio para R7 |
| **Estado** | Para discusión — bloquea el Go/No-Go de Fase 0 en lo referido a R7 (ver §4) |
| **Documentos y código revisados** | `RFC-DA-001-DebuggerAdapter.md`, `WBS-DA-001-Plan-de-Trabajo.md`, `brain/core/profile/profile_launcher.py` y soporte, `installer/sentinel/internal/ignition/{ignition_spec,ignition_identity,ignition_lifecycle,ignition}.go`, `installer/sentinel/internal/seed/seed.go`, `synapse-runner/src/surfaces/discovery-chromium.ts`, `synapse-runner/README.md` |

## 0. Resumen

Ambos documentos son consistentes en lo grueso: los 43 tickets del WBS suman exactamente los subtotales por fase (13 + 35 + 24 + 46 + 10 = 128 d-p) y las referencias cruzadas `§n`/`DA-n`/`H-n`/`R-n` en general apuntan al lugar correcto. Esta revisión encontró siete puntos de secuenciación, cobertura de gates, prioridad y alcance. El más importante (R7) dejó de ser una ambigüedad de diseño y pasó a ser un hallazgo de seguridad confirmado contra el código real: **el codebase ya abre hoy un puerto CDP externo (`--remote-debugging-port`) en los mismos perfiles Worker que usará el futuro `DebuggerActuator`, y un cliente externo (`synapse-runner`, vía Playwright) ya se conecta por ahí — algo que el RFC nunca audita ni menciona, y que puede saltarse por completo la fachada cerrada de seguridad que el propio RFC construye.**

## 1. Hallazgos

### R1 — El diagrama de dependencias (WBS §2) omite enlaces que los propios tickets declaran

DA-1-07 y DA-3-15 listan `DA-0-05` como dependencia en su campo "Depende de", pero el diagrama ASCII de §2 solo dibuja la flecha `DA-0-05 → DA-1-08`. Un lector que planifique mirando solo el diagrama puede subestimar cuánto repercute un hallazgo tardío de DA-0-05 sobre Fase 3C.

**Sugerencia:** actualizar el diagrama de §2 para incluir las flechas `DA-0-05 → DA-1-07` y `DA-0-05 → DA-3-15`, o aclarar que el diagrama es de grano grueso.

### R2 — Un supuesto de seguridad central de `DOM_WATCH` se valida después del gate de seguridad, no antes

RFC §8.4 marca como `[PoC]` el supuesto de que el binding de `Runtime.addBinding` queda acotado al mundo aislado, y esa validación ocurre en DA-3-13 (Fase 3C) — después de que DA-2-07 (el gate de seguridad, Fase 2) ya fue aprobado, aunque DA-2-07 dice que prueba el "spoof del binding de `SIGNAL`" contra un mecanismo que todavía no existe como implementación productiva.

**Pregunta abierta:** ¿contra qué exactamente prueba DA-2-07 el spoofing de binding si `DOM_WATCH` no está implementado hasta DA-3-13?

### R3 — Ola 3C no tiene ticket de gate formal, a diferencia de 3A y 3B

DA-3-06 y DA-3-11 cierran 3A y 3B con criterios explícitos; no existe equivalente para 3C. DA-4-01 (rollout) solo depende de `DA-3-06`, así que el grafo no impide arrancar Fase 4 sin que 3B/3C terminen.

**Sugerencia:** agregar un "Gate de la ola 3C" y hacer que DA-4-02 dependa de él.

### R4 — `deny_and_allow` (DA-2-08) queda fuera del gate de seguridad pese a ser la mitigación recomendada del riesgo más probable

RFC §7.2 recomienda `deny_and_allow` en producción para mitigar R-03 (Alta/Alto), pero DA-2-08 es P1 y DA-2-07 no depende de él.

**Sugerencia:** subir DA-2-08 a P0 y agregarlo como dependencia de DA-2-07, o documentar por qué `deny_only` alcanza durante la migración inicial.

### R5 — DA-0-06 depende de los cinco PoC de Fase 0, pero sus criterios solo usan tres

El Go/No-Go se basa en ADR-S/U/D (DA-0-01/02/03); DA-0-04 y DA-0-05 no están atados a ningún criterio de salida pero sí aparecen en el "Depende de".

**Sugerencia:** aclarar si DA-0-04 es realmente bloqueante del Go/No-Go.

### R6 — La estrategia S4 aparece en el RFC pero desaparece del plan de trabajo

RFC §8.3 define S1–S4; DA-0-01 y el criterio de No-Go de DA-0-06 solo contemplan hasta S3.

**Sugerencia:** decidir si S4 es una red de contención real y agregarla a la matriz, o descartarla explícitamente por escrito.

### R7 — El puerto CDP externo (`--remote-debugging-port`) ya existe en producción para perfiles Worker, y un cliente externo ya lo consume — el RFC nunca lo audita

**Cadena de evidencia confirmada** (camino real: `Launch()` → `execute()` → `prepareSessionFiles()`, el único que se ejecuta hoy para cualquier lanzamiento):

1. **`installer/sentinel/internal/seed/seed.go:417`** — al crear/seedear un perfil, `writeIgnitionSpec()` escribe `--remote-debugging-port=0` (puerto dinámico, asignado por el SO) en `engine_flags` de `ignition_spec.json`, junto con `--disable-web-security`, `--no-sandbox`, `--test-type` — exactamente los flags que `_launch_human_registration` (Google, en `profile_launcher.py`) prohíbe explícitamente por delatar automatización. El perfil normal ya nace con ellos.
2. **`installer/sentinel/internal/ignition/ignition_identity.go:155-192`** (`prepareSessionFiles`) — es la función que corre en **cada** lanzamiento, tanto modo `landing` como `discovery` (confirmado en `ignition_lifecycle.go:47`, `Launch()`). Relee el `ignition_spec.json` existente y solo actualiza `LaunchID`, `ProfileID`, `TargetURL` y `ConfigOverride`. **Nunca toca `EngineFlags` ni `CustomFlags`.** El flag de puerto que `seed.go` escribió una sola vez persiste sin cambios en todos los lanzamientos posteriores de ese perfil, incluido el modo `landing` — el modo normal de trabajo, el mismo que usará el `DebuggerActuator`.
3. **`ignition_lifecycle.go:114-176`** (`execute`) confirma que Sentinel no lanza Chrome directamente: delega a Brain por el mismo canal TCP `127.0.0.1:5678` que RFC §5.7 identifica como la frontera de confianza a asegurar ("Chrome lanzado via Brain → bloom-launcher → Session 1"). Brain (`profile_launcher.py::_launch_spec_driven`) hace *pass-through* de `engine_flags` sin filtrar, así que el flag de puerto llega intacto a la línea de comandos real de `chrome.exe`.
4. **`synapse-runner/src/surfaces/discovery-chromium.ts:1,24-25`** usa `chromium.connectOverCDP(cdpEndpoint)` de Playwright: **ya existe hoy un cliente CDP externo, fuera de la extensión**, que se conecta a ese puerto para automatizar la superficie de Discovery. El propio `README.md` de `synapse-runner` (líneas 257-259, 394-396) documenta el endpoint como `http://localhost:9222` (**"no confirmado"**, en sus propias palabras) — ni el equipo de `synapse-runner` tiene certeza de qué puerto se usa realmente en la práctica.
5. **Inconsistencia interna sin conciliar:** `ignition_lifecycle.go:81` (`Launch`) devuelve el entero **9222 hardcodeado** como "puerto de debug", incondicionalmente — aunque el spec real dice `=0` (dinámico). `preFlight()` (línea 234, `freePortQuirurgico(9222)`) mata procesos en el puerto 9222 antes de cada lanzamiento, pero solo está implementado en Windows y asume el puerto fijo. Nadie parece haber conciliado "puerto dinámico declarado en el spec" con "puerto fijo asumido en dos lugares distintos del código de Sentinel".
6. **Código posiblemente muerto, sin confirmar:** `ignition_spec.go` tiene su propia función `buildSilentLaunchArgs`, con `--remote-debugging-port=9222` hardcodeado más `--remote-allow-origins=*` (que desactiva la verificación de origen del WebSocket de CDP — vector conocido de ataque vía DNS rebinding). No se encontró ningún llamador de esa función ni de `loadIgnitionSpec` en el camino real revisado (`Launch`→`execute`→`prepareSessionFiles`); podría ser un camino alternativo no ejercitado hoy, pero no se confirmó con una búsqueda exhaustiva de call sites en todo el binario de Sentinel.

**Por qué esto es más grave que "quién inyecta el flag".** Todo el aparato de seguridad que el RFC construye con tanto cuidado —`PolicyEngine`, `CommandRegistry`, `CdpGate` con presupuesto de métodos y plantillas pineadas, denylist de hosts, redacción de campos sensibles, el §7 entero— vive **exclusivamente dentro de `chrome.debugger.attach()`**, la API de extensión que corre en el service worker. Si el mismo proceso de Chrome tiene además un puerto CDP crudo expuesto en `localhost` —con `--remote-allow-origins=*` en al menos una variante del código—, cualquier proceso local, o en el peor caso una página web maliciosa vía WebSocket/DNS rebinding, puede conectarse directamente por CDP y saltarse `PolicyEngine`/`CdpGate` por completo: `Network.getCookies`, `Runtime.evaluate`, navegar la pestaña a un host denegado — todo lo que el RFC dedica un capítulo entero a prohibir. El invariante I-2 ("Brain solo puede invocar comandos de un registro cerrado") y el ADR-2 ("Prohibido exponer CDP a Brain") protegen la ruta Brain→extensión, pero no dicen nada de esta ruta externa preexistente (`synapse-runner`↔`--remote-debugging-port`), que ni siquiera pasa por Brain y que el RFC nunca menciona.

Además, hay riesgo de interferencia directa con el propio `DebuggerActuator`: Chrome soporta múltiples clientes de depuración simultáneos desde la versión 63 (el propio RFC lo cita en §6.3 para T7), y un segundo cliente puede desplazar o interferir con la sesión que mantiene `SessionManager`. Si `synapse-runner` (u otra herramienta) se conecta al mismo target que la extensión tiene `attached`, es exactamente el escenario `LOST_FOREIGN`/`replaced_with_devtools` que el RFC diseñó para un DevTools *ocasional* — no para un segundo cliente CDP sistemático y deliberado, presente en cada lanzamiento.

## 2. Observaciones menores

- **DA-3-03/04/05 no repiten `DA-2-07`** en su propio campo "Depende de", aunque la prosa de apertura de Fase 3 lo establece como prerrequisito general.
- **Las decisiones de Gobernanza del Anexo B** (Q1, Q6, Q7, Q9) no están modeladas como dependencias duras de ningún ticket.

## 3. Lo que se verificó y cerró bien

- Conteo de tickets (6+10+8+15+4 = 43) y esfuerzo por fase (13/35/24/46/10 = 128 d-p): correcto.
- Límites de Native Messaging (1 MB / 64 MiB) citados de forma consistente.
- Mapeo `[PoC]` → ticket de Fase 0 para los puntos de fricción de §6.2/§8.2/§8.3: correcto salvo R2.
- Encabezados de ambos documentos (v0.1, 2026-09-19, referencia cruzada): consistentes.

## 4. Tickets propuestos — Fase 0 (Research)

R7 deja de ser una hipótesis: es un hallazgo de seguridad confirmado contra código en producción. Los tres tickets siguientes deben agregarse como dependencia de **DA-0-06** (Go/No-Go de Fase 0) con la misma jerarquía que ADR-S/U/D — si no se resuelve satisfactoriamente, es tan bloqueante para el diseño como una falla en el PoC de slave-mode. Suman **5 d-p** (13 → 18 d-p de Fase 0).

### DA-0-07 · Spike técnico (Brain/EXT) — Coexistencia de `chrome.debugger.attach` con el puerto CDP externo ya presente
**Tipo:** Spike · **Comp.:** EXT + BRAIN · **Rol:** EXT + SEC · **Est.:** 1 d · **Depende de:** — · **Prioridad:** P0 · **Riesgo cubierto:** R7

**Descripción.** Con un perfil lanzado exactamente como lo hace hoy la Fase 0 real (spec heredado de `seed.go`, incluyendo `--remote-debugging-port=0`, `--disable-web-security`, `--no-sandbox`, `--test-type`), comprobar empíricamente: (a) si `chrome.debugger.attach({tabId})` desde la extensión funciona normalmente con el puerto CDP externo abierto simultáneamente; (b) qué ocurre si un segundo cliente CDP externo (un script Playwright que simule a `synapse-runner`) se conecta al mismo target que la extensión tiene `attached` — ¿la extensión recibe `onDetach`/`LOST_FOREIGN`, o ambos clientes conviven sin conflicto?; (c) si se remueve el flag `--remote-debugging-port` de un perfil de prueba, qué se rompe (para medir el costo real de cerrarlo).

**Criterios de aceptación**
- [ ] Matriz de resultados: attach solo, attach + segundo cliente CDP simultáneo, sin el flag de puerto — con foco en si el `DebuggerActuator` queda expuesto a `LOST_FOREIGN`/inestabilidad por un cliente externo que hoy nadie audita.
- [ ] Confirmado si `Input.setIgnoreInputEvents`/`chrome.debugger` se comporta distinto con `--remote-allow-origins=*` presente vs. ausente.
- [ ] Documentado el costo de remover `--remote-debugging-port` de un perfil (qué flujos dependen de él hoy, más allá de `synapse-runner`).

### DA-0-08 · Auditoría del backend Go/Sentinel — Origen, alcance real y modularización del puerto CDP
**Tipo:** Spike de revisión · **Comp.:** PLAT (Sentinel) + EXT · **Rol:** SEC + PLAT + EXT · **Est.:** 3 d · **Depende de:** DA-0-07 · **Prioridad:** P0

**Descripción.** Auditar `installer/sentinel/internal/seed/seed.go`, `installer/sentinel/internal/ignition/ignition_identity.go` (`prepareSessionFiles`, el camino real) e `ignition_spec.go` (`buildSilentLaunchArgs`/`loadIgnitionSpec`, de uso no confirmado) para: (a) confirmar si `buildSilentLaunchArgs`/`loadIgnitionSpec` tienen algún llamador real en el binario de Sentinel o son código muerto; (b) reconciliar la discrepancia entre el puerto dinámico (`=0`) que escribe `seed.go` y el puerto fijo `9222` que `ignition_lifecycle.go:81` devuelve incondicionalmente y que `freePortQuirurgico` asume; (c) definir de manera unívoca si la apertura del puerto CDP es exclusiva del flujo de `synapse-runner`/Discovery (en cuyo caso debería aislarse a perfiles de tipo "seed"/dev, nunca a perfiles Worker de producción) o si debe modularizarse explícitamente para separar el `DebuggerActuator` (que no lo necesita) de cualquier necesidad legítima de CDP externo; (d) mapear qué constant/flag decide si un perfil lleva o no `--remote-debugging-port`, y si hoy existe algún mecanismo para que un perfil de producción NO lo lleve.

**Criterios de aceptación**
- [ ] Confirmado (con grep exhaustivo del binario de Sentinel, no solo de este directorio) si `buildSilentLaunchArgs`/`loadIgnitionSpec` están vivos o muertos.
- [ ] Discrepancia `=0` vs `9222` explicada o corregida; `Launch()` devuelve el puerto real, no un literal.
- [ ] Decisión explícita: ¿`--remote-debugging-port` debe existir en perfiles Worker de producción (`landing`, `actuator_impl=debugger`) o solo en perfiles `seed`/`discovery`/dev? Si la respuesta es "solo dev", ticket de seguimiento para que `seed.go`/`prepareSessionFiles` dejen de inyectarlo por defecto en perfiles de producción.
- [ ] `--remote-allow-origins=*` evaluado como hallazgo de seguridad aparte (si sigue vivo en algún camino real) — no debería sobrevivir a esta auditoría sin justificación explícita de SEC.

### DA-0-09 · Decisión (ADR-E, con revisión de SEC) — Convivencia de Native Messaging, `chrome.debugger` y el canal CDP externo
**Tipo:** Decisión (ADR) · **Comp.:** todos · **Rol:** Arquitectura + SEC + EXT + BRAIN + PLAT · **Est.:** 1 d · **Depende de:** DA-0-07, DA-0-08 · **Prioridad:** P0

**Descripción.** Con la evidencia de DA-0-07/08, redactar el ADR-E que declare por escrito, con aprobación explícita de `SEC` (no solo de Arquitectura, dado que R7 es un hallazgo de seguridad y no solo de diseño): (1) si el puerto CDP externo se elimina de los perfiles Worker de producción, se restringe a un modo dev/seed explícitamente marcado (análogo a `dev_silent_debugger`, con el mismo tipo de validador que lo rechace en producción), o se mantiene con una mitigación concreta (p. ej. `--remote-allow-origins` acotado, autenticación de token en el puerto, o firewall local); (2) cómo conviven —si es que deben convivir— `synapse-runner` (CDP externo vía Playwright) y el `DebuggerActuator` (CDP interno vía `chrome.debugger`) sin exponer una vía de bypass de `PolicyEngine`/`CdpGate`; (3) qué constante o campo del spec decide esto y quién lo controla (Sentinel, Brain, o ambos con doble validación, siguiendo I-4: la extensión no confía en ninguno de los dos).

**Criterios de aceptación**
- [ ] ADR-E redactado, aprobado por SEC además de Arquitectura, agregado a RFC §13.
- [ ] RFC actualizado (v0.2) con una subsección nueva reconociendo `synapse-runner`/el puerto CDP externo como parte del modelo de amenazas (posible T9 nuevo, o ampliación de T1/T7), y la decisión tomada.
- [ ] WBS actualizado: DA-1-09 (manifest/flags) y DA-2-02/DA-2-07 (denylist/gate de seguridad) referencian esta decisión si el puerto se mantiene en algún perfil de producción.

---
*Generado a pedido de José Vigil como insumo de discusión antes de iniciar la Fase 0. No reemplaza la sesión de estimación conjunta ni el sign-off de Gobernanza/SEC previstos en el propio WBS.*
