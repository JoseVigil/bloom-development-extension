# Synapse Simulator — auditoría del despliegue productivo local

**Fecha de evidencia:** 2026-08-19/20 UTC.  
**Roots leídos:** `C:\Users\josev\AppData\Local\BloomNucleus` y `C:\repos\eias-repos`.  
**Método:** sólo lectura; inventario, JSON sanitizado, logs y hashes. No se ejecutaron binarios ni se modificó el despliegue.

## 1. Resultado ejecutivo

El sistema compilado confirma una autopista Synapse real y operativa, pero el componente cognitivo del Simulator todavía no existe: Nucleus registra `synapse-simulator` como `healthy: true, state: STUB`, y su stream sólo contiene inicios de sesión `mode: STUB`.

La extensión del perfil sí contiene el Cortex Synapse Simulator real, sus schemas y config. `bloom-host.exe` actúa como Native Messaging host stdio para Chrome y como cliente TCP de Brain. Brain escucha en `:5678`; Control Plane expone HTTP `:48215` y WebSocket `:4124`.

El workspace seleccionado y el Nucleus organizacional existen, pero `sample_project` todavía no tiene un árbol `.bloom` propio ni Intents. Por eso el primer test de `ing/classification/turn_1` debe incluir como precondición la creación/hidratación real del Intent; hoy no hay un artefacto productivo existente que pueda replayarse como fixture inicial.

## 2. Topología desplegada confirmada

```text
Bloom Workspace / Conductor
  ├─ Svelte dev :5173
  └─ Control Plane HTTP :48215 / WebSocket :4124
          ↕
Brain service :5678 (TCP Big Endian)
          ↕ REGISTER_HOST / REGISTER_ACK / routed messages
bloom-host.exe
  ├─ TCP client de Brain
  └─ Chrome Native Messaging stdio
          ↕
Cortex MV3 background.js
  └─ profile extension / synapse-simulator/
```

Evidencia:

- `config/nucleus.json` declara paths de `nucleus.exe`, `sentinel.exe`, `brain.exe`, Chromium, Conductor, Sensor, Cortex, Ollama y `bloom-host.exe`.
- health de instalación registra Brain `:5678`, Control Plane/Bloom API `:48215`, Temporal `:7233`, Ollama `:11434`, Svelte `:5173` y OpenCode `:4096`.
- `telemetry.json` describe Control Plane como HTTP `:48215` + WebSocket `:4124`.
- el manifest de Native Messaging apunta a `bin/host/bloom-host.exe`, tipo `stdio`, restringido al origin de la extensión del perfil.
- logs de host prueban `REGISTER_ACK_RECEIVED`, `HOST_READY_SENT_PROACTIVE`, `handshake_confirm`, `PROFILE_CONNECTED` y handshake completo v2.2.0.
- logs de Brain prueban `REGISTER_HOST`, `REGISTER_CLI`, ACKs diferenciados y `PROFILE_DISCONNECTED` ante `STDIN_EOF`.

## 3. Binarios y packaging

El despliegue es soberano y autocontenido. Entre los binarios principales observados:

- `brain/brain.exe` (PyInstaller con Python 3.12 y templates de perfil incluidos);
- `host/bloom-host.exe`;
- `nucleus/nucleus.exe`, `sentinel/sentinel.exe`, `metamorph/metamorph.exe`;
- `workspace/bloom-workspace.exe`, `setup/bloom-setup.exe`;
- Chromium 151.0.7922.137;
- Node 24.19.0;
- OpenCode 1.3.14;
- Temporal, Ollama y runtime Python separado.

`nucleus.json` conserva un sovereign manifest de copia desde el repo/build hacia `BloomNucleus/bin`. La tabla `binary_versions` está vacía aunque los binarios existen; para auditabilidad del Simulator integrado conviene registrar build/version/hash en `capabilities()` y en cada evidence report, no depender de esa tabla.

## 4. Perfil y extensión desplegada

Perfil master: `b4619cb1-8996-4fae-8ed7-06b1ce8a826c`, alias `MasterWorker`, dos launches observados. `profiles.json` registraba handshake confirmado y sesión abierta al momento de lectura.

La extensión desplegada contiene:

- `background.js` y módulos de companion/device flow;
- `protocols/{discovery,landing,synapse-simulator,companion}.schema.json`;
- páginas `discovery/`, `landing/`, `companion/` y `synapse-simulator/`;
- `discovery.synapse.config.js` y `synapse-simulator.synapse.config.js` generados por launch.

El manifest MV3 declara `nativeMessaging`, service worker module y recursos web accesibles. La extensión permite hosts externos reales, pero el Simulator debe mantener su regla de no operar cuentas/sitios reales durante fixtures.

### Fidelidad source/deployed

- `background.js`: sha256 source = deployed.
- `protocols/synapse-simulator.schema.json`: sha256 source = deployed.
- `synapse-simulator.js`: hash de bytes diferente por un CRLF adicional; contenido normalizado idéntico, mismo número de líneas y mismo sha256 normalizado.

Conclusión: no hay drift funcional detectado entre source y perfil para las piezas auditadas.

## 5. Telemetría y observabilidad

`telemetry.json` registra 50 streams activos, incluidos Brain core/profile/server/EventBus/ServerManager, Cortex y host por launch, Nucleus Synapse, brain poller, Control Plane, Sentinel profile, traces, Temporal y el stream del Simulator.

El stream del Simulator es explícito:

```text
label: SYNAPSE_SIMULATOR [STUB]
categories: nucleus, synapse-simulator, debug
source: nucleus
```

Consecuencias contractuales:

1. Gate B debe exigir que `STUB` cambie a una capability verificable, no sólo que exista el log.
2. request/response/delivery deben tener streams propios o campos estructurados en este stream.
3. `request_id`, `logical_inference_id`, `correlation_id`, fixture/version, state transition y response hash deben ser consultables sin loguear contenido sensible.
4. ACK de `REGISTER_*` y ACKs de onboarding ya existen; el contrato cognitivo debe usar nombres/tipos inequívocos para no confundirse con ellos.

## 6. Estado del workspace `.bloom`

`nucleus.json` selecciona organización `eias-repos`, workspace `C:\repos\eias-repos` y proyecto `sample_project`.

El Nucleus organizacional real vive en:

```text
C:\repos\eias-repos\.bloom\.nucleus-eias-repos
```

Contiene ownership, governance, core config, cache, semantic index, relations, findings y reports. Sin embargo:

- el manifest de governance todavía declara `projects: []` y `total_intents_processed: 0`;
- `.semantic-index.json` tiene `entries: []`;
- el core config histórico lista otros dos proyectos y cero Intents;
- `sample_project` no contiene `.bloom`;
- `genesis_mandate_id` es `null` en la configuración global.

Hay drift entre snapshots históricos del Nucleus y la selección actual de onboarding. Brain no debe inferir el proyecto activo desde esos snapshots: el adapter debe recibir/resolver el contexto canónico de la operación y verificar que todas las rutas pertenecen al proyecto seleccionado.

## 7. Ajustes al paquete contractual

El paquete `CONTRACTS/v1` se mantiene, con estas precisiones obligatorias:

1. `capabilities()` debe incluir build/runtime identity y modo `headless | synapse_integrated`; `STUB` no satisface Gate B.
2. Gate B reutiliza Brain `:5678` Big Endian y Native Messaging sólo mediante un adapter probado; no reutiliza `submit_intent()` legacy Little Endian.
3. El ACK cognitivo debe llamarse y modelarse como `COGNITIVE_REQUEST_ACCEPTED` (o equivalente versionado), distinto de `REGISTER_ACK` y de la response final.
4. El primer E2E debe crear un Intent `ing` real porque no existe uno desplegado para replay.
5. La persistencia durable vive bajo el proyecto/Intent, no en `BloomNucleus/profiles/.../extension` ni en logs.
6. Telemetría referencia artefactos por ID/hash; no se convierte en ledger ni autoridad.
7. El adapter integrado debe tolerar reconnect/`STDIN_EOF` y delivery at-least-once; los logs prueban reconexiones reales frecuentes.

## 8. Impacto sobre gates

### Gate A — núcleo in-process

Sin cambios: schemas, evidencia de Brain, validator, fixture engine, persistencia y replay. Debe poder trabajar en un workspace temporal o fixture porque el proyecto productivo aún no tiene Intent.

### Gate B — integración Synapse

Debe demostrar sobre el despliegue real:

1. creación/hidratación de Intent `ing` en el proyecto seleccionado;
2. request durable antes de delivery;
3. ACK cognitivo separado;
4. tránsito Brain → host → Cortex y retorno;
5. raw response durable antes de validación;
6. `.domain_resolution.json` materializado por Brain;
7. resultado durable recuperable por Workspace/Temporal;
8. reconnect, duplicate y late response sin doble avance;
9. telemetría correlacionable;
10. health/capabilities deja de reportar `STUB` para la capacidad ejercitada.

## 9. Seguridad de la auditoría

No se registraron tokens, API keys ni secretos. La lectura sanitizó nombres de campos sensibles. No se ejecutaron binarios productivos. Los hashes se calcularon en modo lectura. Ningún archivo externo fue modificado.
