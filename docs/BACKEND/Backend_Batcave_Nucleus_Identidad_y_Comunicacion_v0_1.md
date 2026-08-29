# Backend ↔ Batcave ↔ Nucleus/Devices — Contrato de Identidad y Comunicación (v0.1)

**Tipo:** Diseño de arquitectura (no implementación) — encargo explícito de Jose, no rediseña Wisdom ni asume transferencia de ownership.
**Estado:** Borrador v0.1
**Fecha:** 2026-08-29
**Encargo explícito (pivot confirmado sobre §6 de `Backend_Cloudflare_Arquitectura_v0_1.md`):**

> Propongo reemplazar el polling periódico como mecanismo principal por un modelo híbrido. Batcave mantiene una conexión saliente autenticada con el backend —SSE o WebSocket, a definir— y recibe avisos livianos cuando existe una nueva publicación aplicable a su organización, canal o dispositivo. El aviso no transporta ni autoriza por sí mismo el cambio: Batcave realiza después un GET autenticado del manifest, verifica versión, audiencia, firma y ETag, y continúa el recorrido existente. Se conserva un polling de respaldo con jitter para recuperación ante desconexiones. El backend no llama directamente a los devices; su identidad nace durante el enrolamiento gobernado por Nucleus y Batcave funciona como relay organizacional. Antes de cerrar el diseño deben definirse identidad de Batcave, identidad de device, cursor/replay, targeting y revocación.

Y el mandato de alcance:

> Diseñá, sin implementar, el contrato de identidad y comunicación entre Backend, Batcave y los Nucleus/devices de una organización. [...] Separá distribución operativa de intercambio de Wisdom, aunque compartan infraestructura de identidad y transporte. Entregá actores, trust boundaries, enrolamiento, credenciales, targeting, revocación, replay/recovery, flujo secuencial y decisiones que requieren aprobación. No diseñes todavía la lógica interna de Wisdom ni asumas transferencia de ownership.

**Fuentes revisadas para este documento:** `BATCAVE_ARCHITECTURE.md` v1.2 (releído completo — identidad organizacional, las dos GitHub Apps, BlindJudge, RelayEngine, config del túnel Sovereign Link, store cifrado de tokens), `Backend_Cloudflare_Arquitectura_v0_1.md` (este mismo proyecto), y documentación vigente de Cloudflare sobre Durable Objects/WebSockets (agosto 2026, ver Fuentes al final).

---

## 0. Qué cambia y qué no cambia

Lo que **no** cambia: Metamorph sigue sin tocar internet, Batcave sigue siendo el único punto que habla con el backend nuevo (Opción A, ya confirmada), y el esquema `releases`/`downloadRules` de D1 sigue siendo la fuente de verdad del manifest.

Lo que cambia: el mecanismo por el que Batcave se entera de que hay algo nuevo deja de ser *solo* sondeo periódico. Pasa a ser un modelo híbrido de tres capas:

1. **Push liviano** (aviso, no autoridad) — vía conexión saliente persistente.
2. **Pull autoritativo** (el mismo `GET /v1/manifest` con ETag ya diseñado) — dispara siempre que llega un aviso, y es la única fuente que Batcave trata como verdad.
3. **Polling de respaldo con jitter** — red de seguridad si el canal push se cae.

Este documento no rediseña el pull (ya está en §6 de la arquitectura); se concentra en las piezas nuevas que ese pivot requiere: identidad, confianza, y el ciclo de vida de la conexión.

---

## 1. Actores y qué identidad tienen hoy (evidencia, no propuesta)

| Actor | Identidad que ya existe | Fuente | Le falta para hablar con el backend nuevo |
|---|---|---|---|
| **Organización** | `organization_fingerprint` (`bloom:org:{name}`) en `.ownership.json`, con `key_fingerprint` (clave real, ej. `ed25519:SHA256:...`) | `BATCAVE_ARCHITECTURE.md §4.1, §5.3` | Nada — coincide 1:1 con `organizations.id` ya propuesto en el schema D1. Es la raíz de confianza natural. |
| **Máquina/Nucleus individual ("device")** | `sovereign_machine_id`, campo **opcional** dentro de `sovereignty_metadata` en `.ownership.json` | `BATCAVE_ARCHITECTURE.md §5.3` | Hoy nadie lo puebla ni lo valida en ningún flujo confirmado. Es el candidato natural para "identidad de device", pero no está en uso real todavía. |
| **Batcave (el proceso)** | Ninguna credencial propia frente a un servicio externo que no sea GitHub. Repo Ops vive en Cortex, no en Batcave. Batcave Auth autentica **usuarios humanos** que se conectan a Batcave, no al proceso de Batcave hablando con otro servicio. | `BATCAVE_ARCHITECTURE.md §4.3, §9.5` | **Este es el gap real.** Batcave necesita una identidad de servicio propia para autenticarse ante el backend nuevo — no existe hoy, hay que crearla. |
| **Usuario humano (mobile/AITAP)** | Batcave Auth (OAuth clásica) + QR/nonce efímero (TTL 30s) | `BATCAVE_ARCHITECTURE.md §9.5` | No aplica — esta es una conexión servidor-a-servidor (Batcave↔Backend), no de usuario. Se menciona solo para no confundir los tres tipos de identidad que ya conviven en el sistema. |

---

## 2. Trust boundaries

```
┌─────────────────────────┐
│   Backend (Cloudflare)   │  ← público, sin conocer nunca claves privadas de ninguna org
└───────────┬──────────────┘
            │  conexión saliente autenticada (nace en Batcave, nunca al revés)
┌───────────▼──────────────┐
│  Batcave (por-org, en     │  ← confía en Nucleus local; nunca interpreta ni decide
│  GitHub Codespaces)       │
└───────────┬──────────────┘
            │  túnel soberano local (ya existente, sin cambios)
┌───────────▼──────────────┐
│  Nucleus local            │  ← única autoridad real de firma; nunca expuesto a internet
│  (+ otras máquinas/devices │     directamente, ni antes ni después de este cambio
│  de la misma org, si hay)  │
└────────────────────────────┘
```

Regla que no se negocia: **el backend nunca inicia una conexión hacia un device o Nucleus.** Todo nace del lado de Batcave — exactamente el mismo principio que ya rige el flujo mobile/AITAP (`BATCAVE_ARCHITECTURE.md §2`: "Sovereign Link: túnel seguro que permite a clientes autorizados conectarse... "; nunca al revés). Esto es consistente con el invariante de Metamorph (nunca toca internet) y con el rol ya documentado de Batcave como el único punto de la arquitectura que cruza la frontera interior/exterior.

---

## 3. Enrolamiento — cómo nace la identidad de Batcave frente al backend

Propuesta (a validar — no hay nada implementado ni un mecanismo previo del que copiar esto directamente):

1. Nucleus (dueño real de la clave privada de la organización) firma una solicitud de enrolamiento: `{organization_fingerprint, sovereign_machine_id, timestamp, nonce}`.
2. Batcave envía esa solicitud **una sola vez** a `POST /v1/enroll`.
3. El backend verifica la firma contra la clave pública de la organización.
4. Si es válida, el backend emite una **credencial de canal** (token/JWT) con scope acotado (`manifest:read`, nada más), atada a `{organization_fingerprint, sovereign_machine_id}`, con expiración.
5. Batcave guarda esa credencial y la usa tanto para abrir la conexión push como para cada `GET /v1/manifest` posterior.

Este paso ocurre una sola vez por Batcave/máquina (o cuando la credencial expira o se revoca) — nunca en cada poll o en cada mensaje push.

**Punto abierto marcado explícitamente:** cómo se establece confianza en la clave pública de la organización *la primera vez* (¿TOFU en el primer contacto? ¿registro fuera de banda cuando se crea la organización en el backend?). Esto es literalmente el mismo problema no resuelto que ya señalamos en la investigación de Wisdom como Pendiente P-1 (`publisherKeyRef`) — no es una coincidencia, es la misma pregunta de fondo ("¿cómo confío en una clave pública la primera vez que la veo?") apareciendo en dos lugares distintos del mismo sistema. Vale la pena resolverla una sola vez y reusar la respuesta en los dos casos.

---

## 4. Credenciales — qué guarda Batcave, y cómo

`BATCAVE_ARCHITECTURE.md §4.3` ya establece el patrón a seguir: cada canal externo guarda su token bajo su propio `key_id` en el store cifrado (`{user_id}:github:repo_ops`, `{user_id}:github:batcave_auth`), precisamente para que revocar uno no invalide los otros. Propongo extender el mismo patrón, sin inventar un mecanismo nuevo de almacenamiento:

```
{organization_fingerprint}:backend:channel
```

- Habilita dos usos: mantener la conexión push abierta, y autenticar cada `GET /v1/manifest`.
- **Rotación/expiración:** sin definir todavía. Recomiendo TTL corto (horas o pocos días) con renovación automática mientras el canal siga vivo — mismo patrón que un refresh token — para no depender de que alguien reenrole manualmente cada vez que expira.

---

## 5. Targeting — a quién le llega qué

Lo que ya está resuelto (sin cambios): el backend targetea por **organización + canal** vía `releases`/`downloadRules` (`organizationId` nullable = default global) — eso ya cubre el caso "todas las organizaciones" y "esta organización puntual".

Lo que falta si se quiere targeting **por device individual** dentro de una misma organización: hoy no existe ninguna tabla que modele "devices" en el schema propuesto, y `sovereign_machine_id` es un campo opcional sin consumidor real (§1). Antes de construir esto, hace falta una decisión de producto, no técnica: **¿una organización va a tener necesidad real de actualizar un device distinto del resto (ej. canary por-máquina), o alcanza con org+canal como ya está diseñado?** Si la respuesta es "sí, hace falta", la pieza que falta es chica (una tabla `devices` con `sovereign_machine_id` como clave, y una columna opcional en `downloadRules`) — pero no la agrego al schema todavía porque no hay evidencia de que se necesite hoy.

---

## 6. Revocación

- Revocar = invalidar la credencial de ese `key_id` puntual en el backend — no toca la clave raíz de la organización, mismo principio de blast-radius acotado que ya usan Repo Ops/Batcave Auth.
- Casos candidatos a disparar revocación (a confirmar con Jose, no asumidos): rotación del `key_fingerprint` de la organización, sospecha de compromiso del Codespace, organización dada de baja.
- No hay hoy ningún endpoint ni mecanismo de revocación descrito en ningún documento de los que revisé — esto es diseño enteramente nuevo, marcado como tal.

---

## 7. Replay y recovery

- **Anti-replay:** el flujo mobile ya usa nonce de un solo uso con TTL corto (QR+nonce, 30s — `BATCAVE_ARCHITECTURE.md §9.5`). El mismo patrón (nonce + TTL corto) es el candidato natural para cada aviso push del canal nuevo, para que un mensaje reenviado o interceptado no se pueda reproducir.
- **Cursor:** el canal push debe llevar un cursor (ej. un id de evento o la versión de manifest ya vista) para que, tras una reconexión, Batcave pueda pedir "qué me perdí desde X" en vez de asumir que no se perdió nada. Sin esto, cualquier corte de conexión (incluido un deploy del backend — ver §9) puede dejar a Batcave sin enterarse de una publicación.
- **Polling de respaldo con jitter:** confirmado por Jose como mecanismo de recuperación. Reusa el mismo `GET /v1/manifest` + ETag ya diseñado (§6 de la arquitectura) — el jitter evita que todas las organizaciones resincronicen en el mismo instante tras una caída masiva del canal push.
- El bloque de configuración de reconexión que **ya existe** en `batcave.config.json` (`tunnel.heartbeat_interval_ms`, `tunnel.reconnect_delay_ms`, `tunnel.max_reconnect_attempts` — `BATCAVE_ARCHITECTURE.md §6`) es el candidato natural para gobernar también esta conexión nueva hacia el backend, en vez de inventar un formato de config paralelo.

---

## 8. Flujo secuencial propuesto (end-to-end)

```
1. Enrolamiento (una vez)
   Nucleus firma → Batcave POST /v1/enroll → backend verifica → emite credencial de canal

2. Batcave abre conexión saliente persistente (push) al backend, autenticada con esa credencial

3. Backend publica un release/mandate nuevo
   → empuja un aviso liviano por esa conexión: "hay novedad para org X, canal Y, cursor Z"
   (el aviso no lleva el manifest ni autoriza nada por sí mismo)

4. Batcave recibe el aviso → GET /v1/manifest?org=...&channel=...
   (autenticado con la credencial de canal, con If-None-Match del último ETag visto)

5. Backend responde 200 + manifest firmado, o 304 si no aplica

6. Batcave valida firma/versión/audiencia → entrega el manifest a Metamorph
   exactamente como ya estaba diseñado (§6 de la arquitectura — sin tocar el invariante de Metamorph)

7. Si el canal push se cae: Batcave sigue con el polling de respaldo (mismo endpoint del paso 4,
   con jitter) hasta que la reconexión del canal push tenga éxito
```

---

## 9. Nota de infraestructura — Durable Objects, no solo Workers

Confirmado contra la documentación vigente de Cloudflare (agosto 2026): mantener conexiones WebSocket persistentes que además reciben eventos empujados desde una request *distinta* a la que abrió la conexión (exactamente este caso: "se publica un release" y "hay un Batcave con la conexión abierta" son dos requests distintas) requiere **Durable Objects**, no un Worker sin estado. El patrón recomendado por Cloudflare es la **WebSocket Hibernation API** (la conexión permanece abierta del lado del cliente mientras el Durable Object puede "dormir" sin costo de cómputo entre mensajes), y un mismo Durable Object puede atender múltiples conexiones simultáneas — así que un Durable Object por organización (o por Batcave) es un diseño razonable, no hace falta uno por conexión individual.

Esto es una adición real al stack propuesto en §3 de `Backend_Cloudflare_Arquitectura_v0_1.md` (que hoy solo lista Workers/Hono/D1/Drizzle/R2/KV) — si este canal push avanza, **Durable Objects** entra como pieza nueva.

Limitación a tener en cuenta desde ya: un deploy del backend reinicia los Durable Objects y desconecta los WebSockets activos — es exactamente el escenario que el cursor de recovery (§7) y el polling de respaldo (§7) están diseñados para absorber, no un caso raro a ignorar.

La documentación de Cloudflare no cubre Server-Sent Events como alternativa dentro de Durable Objects — SSE es viable como respuesta en streaming de un Worker normal, pero no resuelve por sí solo el problema de "empujar un evento a una conexión que se abrió en otra request", que es justamente lo que se necesita acá. Por eso, si hay que elegir entre los dos, **WebSocket vía Durable Object** es la opción que la plataforma soporta de forma nativa para este caso de uso — lo dejo como recomendación, no como decisión cerrada (ver §10).

---

## 10. Separación operativa vs. Wisdom — comparten tubería, no lógica

La misma base de identidad (organization_fingerprint + enrolamiento firmado + credencial de canal con scope acotado) es reutilizable como fundamento para el futuro handshake de publish/adopt de Wisdom — pero **no** se diseña acá la lógica de Wisdom. Dos "productos" distintos sobre la misma tubería de identidad:

- **Distribución operativa (este documento):** el backend registra releases/manifests y quién los consume.
- **Wisdom (track separado, en Codex):** el backend, según la nota de handshake que ya compartiste, "registra únicamente el artefacto publicable y su procedencia, nunca el estado ni la evidencia cruda local" — mismo principio de identidad/procedencia, lógica de promoción completamente distinta y todavía sin definir.

No se asume acá ninguna transferencia de ownership, ni se toca la lógica interna de Wisdom — eso sigue en su propio track.

---

## 11. Decisiones que requieren tu aprobación (no las decido yo)

1. **Confianza inicial en la clave pública de la organización** frente al backend — TOFU en el primer contacto vs. registro fuera de banda al crear la organización. Comparte respuesta con el Pendiente P-1 de Wisdom (`publisherKeyRef`).
2. **Targeting por-device** (`sovereign_machine_id`) — ¿hace falta ya, o alcanza con org+canal como está hoy?
3. **Reglas de revocación** — qué eventos la disparan y quién la ejecuta.
4. **TTL y rotación** de la credencial de canal.
5. **WebSocket (vía Durable Object) vs. SSE** para el canal push — recomiendo WebSocket por soporte nativo de Cloudflare para este patrón (§9), pero es tu decisión de producto/costo, no solo técnica.

---

## 12. Qué NO se decide en este documento

- No se diseña el schema de Wisdom.
- No se asume transferencia de ownership de nada.
- No se implementa código — esto es diseño para validar antes de tocarlo.
- No se asume que este contrato deba ser la primera entrega del backend — puede construirse después de que el manifest endpoint simple con polling (§6 de la arquitectura) ya esté funcionando, una vez resueltas las decisiones de §11.

---

## Fuentes

- `BATCAVE_ARCHITECTURE.md` v1.2 (repo local, releído completo para este documento).
- `Backend_Cloudflare_Arquitectura_v0_1.md` (este proyecto).
- [Cloudflare Durable Objects — WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (consultado agosto 2026).

---

*Fin del borrador v0.1. Diseño de identidad y comunicación — no implementa código, no cierra las decisiones marcadas en §11.*
