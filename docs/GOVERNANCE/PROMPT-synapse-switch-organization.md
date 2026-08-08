# PROMPT — Desarrollo del handler de Synapse: cambio de organización activa

## Cómo usar este documento

Este prompt está escrito para pegarse como mensaje inicial en una sesión nueva (con Claude o con cualquier otra persona del equipo) dedicada **exclusivamente** a implementar el handler de `SWITCH_ORGANIZATION` / `ORGANIZATION_SWITCHED` dentro del protocolo Synapse. No asume que quien lo lea tiene el historial de las sesiones anteriores — todo el contexto necesario está acá o referenciado explícitamente.

No pidas que se resuelva nada fuera de lo que este documento delimita en la sección 7 ("Fuera de scope"). Si durante la implementación aparece algo que parece necesario pero no está cubierto acá, decilo explícitamente antes de improvisar una solución — no asumas.

---

## 1. Contexto de negocio — por qué existe este feature

Bloom soporta que un mismo perfil **Master** administre **más de una organización**. Cada organización tiene su propio namespace completo y aislado: su propio `.nucleus-{organization}`, su propia instancia de Batcave, su propia instalación de GitHub App, su propio Vault, sus propios logs. Esto ya está descrito en `BATCAVE_ARCHITECTURE.md` v1.1, secciones §1, §4.1-4.3 y los invariantes `INVARIANT-ORG-001` a `INVARIANT-ORG-008` — leelos antes de escribir código, porque el handler que vas a construir tiene que **respetarlos**, no reinterpretarlos.

Hasta ahora, el sistema asumía una sola organización activa por sesión de Cortex/Discovery. Con multi-organización, el usuario Master necesita poder **cambiar cuál organización está activa** sin cerrar y reabrir todo el flujo de onboarding — por ejemplo, para pasar de trabajar con "acme" a trabajar con "globex" dentro de la misma sesión de Chrome Extension.

Ese cambio de contexto es lo que este handler resuelve. No es un feature de autenticación (eso ya está cubierto por GitHub App + Device Flow, ver `HANDOFF-github-app-batcave-synapse.md`) — es un feature de **enrutamiento de contexto organizacional** dentro de una sesión ya autenticada.

### 1.1 Modelo de concurrencia asumido (no negociable en esta sesión)

El sistema **no soporta multi-tenant concurrente en memoria**. Nucleus corre **una sola organización activa por instancia**. "Cambiar de organización" no es enrutar a una instancia distinta que ya está corriendo en paralelo — es: (a) drenar todo lo in-flight de la organización actual, (b) dejarlo persistido de forma inmutable en `.bloom/.nucleus-{org}/`, y recién entonces (c) autorizar el switch y activar la organización destino.

Esta decisión ya está tomada y documentada en `G1-G8_multi-org-switch-design.md` (guardas G1–G8). Ese documento es la fuente de verdad para todo lo que tiene que ver con *cuándo* un switch puede proceder y *qué* lo bloquea — léelo completo antes de escribir el handler de Synapse, porque el handler que este prompt describe es el **caller** del lado de Cortex/Discovery/Conductor de ese contrato, no una implementación alternativa de él. Concretamente, el handler de `SWITCH_ORGANIZATION` tiene que:

- Consultar primero el endpoint `can-switch-org` de Nucleus (G2) — nunca inferir por su cuenta si es seguro cambiar de org sumando estados propios.
- Si `blocked: true`, no tocar `nucleus.json` ni ningún estado de organización — comunicar el motivo real al usuario (G6), no un genérico "no se puede ahora".
- Asumir que, mientras la organización actual esté drenando (`draining: true`, G4), cualquier intento nuevo de switch debe rechazarse o encolarse — no hay una ventana donde dos switches puedan resolverse en paralelo.

Si en algún punto de la implementación aparece una razón concreta para que este handler necesite un modelo distinto (por ejemplo, instancias de Batcave ya activas en paralelo por organización), **no lo asumas ni lo implementes acá** — es un cambio de diseño que excede el scope de este prompt y tiene que decidirse explícitamente contra `G1-G8_multi-org-switch-design.md`, no dentro de esta sesión.

---

## 2. Los dos mensajes a implementar

Ya están declarados a nivel arquitectónico en `BATCAVE_ARCHITECTURE.md` §10.3. Tu trabajo es la implementación real, no la decisión de que existan — esa ya está tomada.

| Mensaje | Dirección | Payload | Propósito |
|---|---|---|---|
| `SWITCH_ORGANIZATION` | Cortex/Discovery → Conductor | `{ org_id, org_slug }` | Solicita activar el contexto de una organización distinta a la actual |
| `ORGANIZATION_SWITCHED` | Conductor → Cortex/Discovery | `{ org_id, org_slug, batcave_endpoint_rest, batcave_endpoint_wss }` | Confirma que el cambio se completó y publica los endpoints de Batcave de la organización recién activada |

`org_slug` es el mismo valor que usa `resolveOrganization()` en Batcave para construir `.nucleus-{org_slug}` (ver `BATCAVE_ARCHITECTURE.md` §4.1). `org_id` es un identificador estable (no necesariamente el slug — puede cambiar el slug sin cambiar la organización) que el handler debe poder resolver contra el `org_slug` correspondiente. Si en el código real de Discovery/Cortex no existe todavía esa distinción `org_id` vs `org_slug`, preguntá antes de asumir que son intercambiables — es una fuente típica de bugs de resolución silenciosa.

---

## 3. Lecciones ya aprendidas que este handler NO puede repetir

Esta no es la primera vez que se toca el protocolo Synapse. La auditoría `PROTOCOLO-synapse-homologacion-v3.md` encontró bugs concretos que ya se arreglaron en otra sesión (ver `HANDOFF-github-app-batcave-synapse.md` §4). Los patrones de esos bugs son exactamente el tipo de error que este handler nuevo puede reintroducir si no se tiene cuidado:

### 3.1 Eventos "zombie" — declarar el mensaje en un solo lugar del manifest

La auditoría encontró que `GITHUB_PAT_DETECTED` y `GITHUB_TOKEN_STORED` quedaron "zombies" porque se declararon en la lista `messages` del manifest de Discovery pero no en `observable_events` (o viceversa) — el mensaje se emitía pero nadie lo escuchaba, o se esperaba pero nunca llegaba.

`SWITCH_ORGANIZATION` y `ORGANIZATION_SWITCHED` tienen que declararse en **todos** los lugares donde el manifest de Discovery distingue entre "mensajes que puede emitir esta pieza" y "eventos que puede observar esta pieza". Antes de dar por terminada la implementación, confirmá explícitamente — no supongas — cuáles son esos lugares en el manifest real (`discovery.schema.json` o el archivo que lo haya reemplazado) y verificá que ambos mensajes aparezcan en cada uno que corresponda.

### 3.2 Semántica AND vs. OR al completar pasos — no asumir que "cualquier evento" alcanza

El Ticket 1 de la auditoría (`allBlockingDone`) fue un bug donde el sistema de milestones confundía "cualquiera de estos eventos completa el paso" (OR, la semántica real de `cortex_events`) con "necesito que hayan pasado varias cosas independientes" (AND, lo que en realidad hacía falta). El fix fue separar `_completedSteps` de `_processed` en `milestone-reactor.js`.

Si el cambio de organización necesita coordinarse con el sistema de milestones (por ejemplo, si hay un paso de onboarding que depende de "la organización activa está resuelta"), **no agregues `ORGANIZATION_SWITCHED` a una lista `cortex_events` existente asumiendo semántica OR** si en realidad el paso necesita que el switch Y otra condición independiente se cumplan. Ese fue exactamente el error de diseño que se evitó a propósito para el step `github_app_auth` en la sesión anterior (ver `HANDOFF-github-app-batcave-synapse.md` §5.2) — no lo repitas acá por apuro.

### 3.3 Discriminación de eventos genéricos por payload

`milestone-registry.js` ya tiene la convención `"EVENTO:service"` para eventos genéricos que necesitan discriminarse por un campo del payload (ver el fix de `resolveEvent(cortexEvent, payload)`). Si en algún punto el handler de switch de organización necesita reaccionar a un evento que también dispara otras lógicas (por ejemplo, si `ACCOUNT_REGISTERED` u otro evento compartido terminara solapándose con el flujo de switch), usá esa misma convención en lugar de inventar una nueva forma de discriminar. Si no hace falta discriminar nada, no la uses — no la traigas "por las dudas".

### 3.4 Lógica duplicada entre `main_conductor.js` y `workspace-synapse-handlers.js`

La auditoría documentó (y la sesión anterior solo sincronizó, no resolvió) que hay lógica de resolución de eventos duplicada en dos call sites: `main_conductor.js` y `workspace-synapse-handlers.js`. Si el handler de `SWITCH_ORGANIZATION` necesita engancharse en ese mismo punto de resolución, **vas a tener que tocar los dos lugares y mantenerlos sincronizados**, igual que se hizo con el fix anterior. No es tu tarea resolver la duplicación en sí (está fuera de scope, ver §7) — pero sí es tu responsabilidad no dejar los dos lugares desincronizados.

---

## 4. Qué tiene que hacer el handler, en términos concretos

Cuando llega `SWITCH_ORGANIZATION { org_id, org_slug }`:

1. **Validar que la organización de destino existe localmente.** Si no hay `.nucleus-{org_slug}` con `.ownership.json` válido, el switch tiene que fallar de forma explícita y comunicable al usuario — no en silencio. Definí (con el equipo, no adivinando) qué mensaje de error o evento de fallo corresponde emitir; ese mensaje de error también necesita declararse en el manifest si es nuevo (ver §3.1).

2. **Resolver el `OrganizationContext` de la organización destino** usando el mismo mecanismo que ya existe en Batcave (`resolveOrganization()` / `buildOrgContext()`, `BATCAVE_ARCHITECTURE.md` §4.1) — no reimplementar la resolución de paths ni la lectura de `.ownership.json` de otra forma. Esto incluye leer `github_app_installation_id` de esa organización (§4.3 del documento de arquitectura) para que las operaciones subsiguientes usen las credenciales correctas.

3. **Drenar el estado de la organización que estaba activa antes de autorizar el switch.** Esto es lo más delicado del feature, y el modelo ya está decidido (ver §1.1 y `G1-G8_multi-org-switch-design.md`): no hay dos organizaciones activas al mismo tiempo, así que no hay "estado huérfano que limpiar en paralelo" — hay estado in-flight que tiene que terminar y persistirse **antes** de que el switch se autorice. Concretamente, antes de emitir `ORGANIZATION_SWITCHED` el handler tiene que confirmar (vía G2, no adivinando) que ya no queda:
   - Sesiones de Alfred activas de la organización anterior sin terminar ni persistir (`batcave.config.json` → `alfred.max_concurrent_sessions` es por instancia/organización; una sesión sin cerrar es exactamente el tipo de "in-flight" que G3 define y que bloquea el switch).
   - Túneles soberanos abiertos (`RelayEngine.waitForTunnel()`, `tunnel/manager.ts`) de la organización anterior.
   - Comandos pendientes en cola (`security.max_pending_commands` en `batcave.config.json`) sin resolver.

   Si `can-switch-org` (G2) devuelve `blocked: true` por cualquiera de estos motivos, el handler **no** procede con el switch — devuelve el motivo al usuario y espera (o dispara el drenado si ese trigger le corresponde a esta pieza; confirmalo con el equipo, no lo asumas). No hay una rama de "cerrar todo a la fuerza" en este handler: forzar el cierre de sesiones/túneles/comandos in-flight es responsabilidad de Nucleus (G3/G4), no de Synapse.

4. **No filtrar datos entre organizaciones.** Los invariantes `INVARIANT-ORG-004` (logs segregados), `INVARIANT-ORG-006` (runtime data aislado) y el principio general de §1 de la arquitectura ("sin data leakage entre organizaciones", checklist §12) aplican directamente acá: ningún estado en memoria del lado de Cortex/Discovery o Conductor puede quedar mezclando datos de la organización anterior con la nueva después del switch. Esto es fácil de romper con cachés, closures, o variables de módulo que no se resetean — prestale atención especial si el código existente usa alguno de esos patrones.

5. **Emitir `ORGANIZATION_SWITCHED`** con `org_id`, `org_slug`, y los endpoints reales de Batcave para la organización activada, usando `EndpointGenerator` (`BATCAVE_ARCHITECTURE.md` §7) — no construir las URLs a mano en el handler.

### Casos borde a cubrir explícitamente (no opcionales)

- Switch a la misma organización que ya está activa (¿no-op, o re-valida igual?).
- Switch mientras hay un Mandate o intent en curso en la organización actual: `can-switch-org` (G2) tiene que devolver `blocked: true` con el motivo, y el handler tiene que superficializar ese motivo al usuario tal cual lo describe G6 — no traducirlo a un mensaje genérico ni reintentar en silencio.
- Switch a una organización cuya instancia de Batcave no está corriendo todavía (Codespace apagado, por ejemplo) — ¿el switch la levanta, o falla pidiendo que se levante primero?
- Doble switch rápido (el usuario pide cambiar a "globex" y antes de que termine pide cambiar a "acme" de nuevo): con el modelo de drenado (G4), el segundo switch tiene que toparse con `draining: true` y rechazarse o encolarse explícitamente — no hay condición de carrera posible si el lock de drenado está bien implementado del lado de Nucleus, pero el handler de Synapse tiene que manejar esa respuesta de rechazo sin asumir que el segundo pedido "simplemente no pasó nada".
- Intento de switch bloqueado por G2: tiene que quedar auditado igual que uno exitoso (G8) — si el handler de Synapse expone algún log o evento propio del lado de Conductor, confirmá que también registra los intentos rechazados, no solo los que terminan en `ORGANIZATION_SWITCHED`.

---

## 5. Archivos que necesitás antes de escribir una sola línea

Igual que en la sesión anterior de Synapse (`HANDOFF-github-app-batcave-synapse.md` §6), **no adivines el código existente**. Pedí, y leé, estos archivos reales antes de tocar nada:

- `G1-G8_multi-org-switch-design.md` — el diseño ya aceptado del lado de Nucleus para el switch con single-org-activa y drenado (§1.1 de este documento). El handler de Synapse es un consumidor de ese contrato (`can-switch-org`, G2), no una implementación paralela — si algo de lo que describís en el handler contradice ese documento, el documento gana y hay que ajustar el handler, no al revés.
- `discovery.js` — implementación real del `OnboardingFlow` y de cualquier lógica de contexto organizacional que ya exista del lado de Cortex.
- `discovery.schema.json` (o el manifest que lo haya reemplazado) — para confirmar dónde declarar `SWITCH_ORGANIZATION` / `ORGANIZATION_SWITCHED` sin repetir el patrón de eventos zombie.
- `background.js` — service worker de la Chrome Extension; confirmar si el manejo de organización activa vive ahí o en otro lado.
- `main_conductor.js` y `workspace-synapse-handlers.js` — los dos call sites de resolución de eventos que hay que mantener sincronizados si el handler se engancha ahí.
- `milestone-registry.js` y `milestone-reactor.js` — solo si el switch de organización efectivamente necesita interactuar con el sistema de milestones (confirmar esto primero, no asumirlo).
- `synapse-bridge.js` — la sospecha abierta de la auditoría anterior (§7, "no confirmada") sobre cómo `ONBOARDING_EVENTS` se sincroniza con el registry sigue sin resolver; si este handler toca esa zona, es buen momento para confirmarla, pero no es obligación de este trabajo resolverla si no la toca.
- `batcave.config.json` (de al menos dos organizaciones de prueba) — para tener casos reales de `alfred.max_concurrent_sessions` y `security.max_pending_commands` al diseñar el teardown de §4.3.

Si alguno de estos archivos no existe todavía o no se puede compartir, decilo explícitamente en vez de completar el gap con una suposición razonable — una suposición razonable pero incorrecta acá es exactamente cómo se originaron los bugs de la auditoría anterior.

---

## 6. Criterios de verificación

Igual que se hizo con los fixes anteriores (`node --check` + script de simulación end-to-end, ver `HANDOFF-github-app-batcave-synapse.md` §4), este handler necesita, como mínimo:

- Un test simulado de switch exitoso entre dos organizaciones reales locales, verificando que `ORGANIZATION_SWITCHED` trae los endpoints correctos de la organización destino (no los de la organización anterior).
- Un test de switch a una organización inexistente, verificando que falla de forma explícita y no en silencio.
- Un test que confirme que no queda ningún dato (log, sesión, caché) de la organización anterior visible o accesible después del switch — esto es lo que valida `INVARIANT-ORG-004` / `INVARIANT-ORG-006` en la práctica, no solo en el documento.
- Confirmar con `node --check` (o el linter que corresponda) que no se rompió sintaxis en ninguno de los archivos tocados, en particular si tocaste los dos call sites de §3.4.

---

## 7. Fuera de scope (no traer a esta sesión salvo que bloquee lo anterior)

- Resolver la duplicación de lógica entre `main_conductor.js` y `workspace-synapse-handlers.js` en sí misma — solo hay que mantenerla sincronizada si este handler la toca.
- Confirmar la sospecha abierta sobre `synapse-bridge.js` (auditoría §7) — solo si el handler la toca directamente.
- Cualquier trabajo de GitHub App / Device Flow / scopes — eso es un feature de autenticación ya resuelto en otra sesión (`HANDOFF-github-app-batcave-synapse.md`), este handler asume que la autenticación y la instalación de GitHub App por organización ya están resueltas y solo lee `github_app_installation_id` del `.ownership.json` correspondiente.
- El bug medio de `DISCOVERY_COMPLETE` cerrando `project_create` antes de tiempo (`HANDOFF-github-app-batcave-synapse.md` §5.4) — no relacionado con este feature, no lo toques a menos que el switch de organización interactúe con ese mismo step.
- Trabajo de app mobile o de Batcave como tal más allá de leer `OrganizationContext`/`EndpointGenerator` ya existentes — no rediseñes esas piezas.

---

## 8. Resumen de una línea para arrancar

Implementá el handler Synapse de `SWITCH_ORGANIZATION` → `ORGANIZATION_SWITCHED`, leyendo primero `G1-G8_multi-org-switch-design.md` y el código real listado en §5, consultando siempre `can-switch-org` (G2) antes de tocar cualquier estado de organización, validando la organización destino contra `.ownership.json`, resolviendo su contexto con el mismo mecanismo que ya usa Batcave, respetando el modelo de single-org-activa con drenado (no asumiendo instancias concurrentes), y verificando con tests simulados que no hay data leakage entre organizaciones ni eventos zombie en el manifest.
