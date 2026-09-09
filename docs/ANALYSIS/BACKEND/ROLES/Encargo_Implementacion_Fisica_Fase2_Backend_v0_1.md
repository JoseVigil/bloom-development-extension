# Encargo — Implementación física de la autoridad remota, Fase 2 (Backend)

**Estado: para autorización puntual de José. Para ejecutar en el Work ROLES de Codex.**
**Fecha:** 2026-09-04
**Depende de (fijo, no se reabre):** `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` (diseño físico completo,
aprobado 2026-09-04), Fase 1 ya implementada en Nucleus (`.ownership.json` canónico + módulo
`internal/authority`).
**Guía de homologación de esta fase:** relevamiento real de Backend (Hono, Cloudflare Worker, D1) provisto
por José 2026-09-04 — fuente de verdad de convenciones existentes (o su ausencia deliberada) para esta ronda.
**Incorpora:** los 4 riesgos de ejecución de `Nota_Tecnica_Riesgos_Ejecucion_Encargo_Fase2_Backend_v0_1.md`
(cowork BACKEND, 2026-09-04) — patrón `batch()` con concurrencia optimista para `authority_state`, `ETag`
por combinación completa de query params, vector de prueba cruzado Go/JS para JCS, y `wrangler secret put`
para el token provisorio. Ninguno reabre el diseño físico ni ninguna decisión `PHY-DEC-*`/`SNAP-INV-*`.

---

## 0. Qué ya está resuelto — no se vuelve a discutir

El diseño físico completo (wire schema, perfil criptográfico, contenido del snapshot, versionado
anti-downgrade, catálogo de roles) queda fijo. Esta ronda no rediscute ninguna decisión (`PHY-DEC-*`) ni
ningún invariante (`SNAP-INV-*`) — los implementa del lado productor (Backend).

## 1. Alcance de esta fase — exclusivamente los 7 puntos de responsabilidad de Backend

Esta fase cubre únicamente lo que Control detalló como responsabilidad de Backend sobre el Authority
Snapshot y la notificación hacia Batcave. Nada más.

### 1.1 Tablas D1 — fuente de verdad organizacional

**Archivo nuevo:** `backend/migrations/0001_authority_snapshot.sql`

Agrega, junto a `organizations`/`org_members` ya existentes:

- `principals` — identidad interna estable + identidades externas vinculadas;
- `memberships` — relación principal↔organización con estado/vigencia;
- `role_definitions` — catálogo versionado (`master`/`specialist` built-in según §15 del diseño físico, más
  soporte para roles custom por organización);
- `role_assignments` — principal/membership + rol + versión + scope + vigencia;
- `revocations` — target, versión en que se hace visible, punto desde el cual deja de ser vigente;
- `authority_state` — high-water mark por organización: `organization_id`, `current_version`,
  `current_digest`, `updated_at`. Es la tabla que garantiza que Backend nunca reutiliza una versión para
  contenido distinto (§16 del diseño físico).

**Precisión de ejecución (D1 no soporta transacciones interactivas):** el incremento de versión y la
escritura de contenido nuevo deben ir en el mismo `db.batch([...])` (atómico, todo o nada), con concurrencia
optimista en la statement de `authority_state`:

```sql
UPDATE authority_state
SET current_version = ?, current_digest = ?
WHERE organization_id = ? AND current_version = ?
```

El último parámetro (`current_version` esperado) es la versión leída antes de construir el batch — si otro
request movió la versión entretanto, el `UPDATE` afecta cero filas y el batch debe tratarse como conflicto a
reintentar, no como éxito silencioso. No se implementa un patrón de dos pasos separados (leer, después
escribir en otra llamada) — D1 no lo garantiza atómico entre sí.

### 1.2 Wire schema y firma

**Archivos nuevos:**

| Archivo | Contenido exigido |
|---|---|
| `backend/src/authority/schema.ts` | Interfaces TS locales del payload full/delta (§4, §5, §7 del diseño físico) — mismo patrón que `manifest.ts` (`ReleaseRow`/`IonEntry`/`IonManifest`): interfaces locales, **sin Zod ni ninguna librería de validación** (no hay precedente de eso en `backend/src` hoy). |
| `backend/src/authority/canonical.ts` | Canonicalización JCS RFC 8785, digest SHA-256, firma Ed25519 con separador de dominio (§3, §8.1 del diseño físico). Esto **sí requiere una dependencia nueva** (no hay canonicalización/firma Ed25519 en el Worker hoy) — es implementación directa de una decisión física ya aprobada, no invención de infraestructura. Génesis elige la librería (verificar primero si el runtime de Workers ya soporta Ed25519 nativo vía `SubtleCrypto` antes de sumar una librería pura JS) y lo documenta en el reporte de cierre. |
| `backend/src/authority/snapshot.ts` | Construye el payload full desde las tablas de `1.1`, soporta delta cuando `base_authority_version` coincide con el high-water mark, invoca `canonical.ts` para producir el envelope firmado, actualiza `authority_state` de forma atómica junto con cualquier escritura de contenido. |

**Archivo nuevo de tests:** `backend/test/authority.spec.ts` — mismo patrón que `test/manifest.spec.ts`.

### 1.3 Rutas — dentro de `backend/src/index.ts` (sin refactor)

**Archivo modificado:** `backend/src/index.ts` (agrega rutas nuevas al archivo plano existente; **no se
autoriza extraerlo a `routes/`/`middleware/` ni ninguna reestructuración — como mucho, el código de negocio
vive aislado en `src/authority/`, el archivo de rutas solo importa y conecta**):

- `GET /v1/authority/snapshot` — query params `org`, `issuer`, `installation_id`, `high_water_mark`,
  `digest`, `capability` (`full`/`delta`), `correlation_id` (mismo estilo que `/v1/manifest?org=...`, query
  params no path params). Responde el envelope firmado (full o delta) o "no hay versión superior". Reusa el
  patrón condicional ya existente en `/v1/manifest` (`Cache-Control: private, no-cache`, comparación
  server-side de `If-None-Match`) — esto es también el mecanismo de "notificación": un `304` significa nada
  nuevo, un `200` con `ETag` nuevo es la señal de versión disponible para quien haga polling (Batcave, cuando
  exista). No se implementa push por WebSocket en esta fase — Batcave no tiene servidor real que lo reciba
  todavía; queda para la fase de Batcave.

  **Precisión de ejecución (el `ETag` no puede depender solo de la organización):** a diferencia de
  `/v1/manifest` (una sola representación por org/canal), este endpoint responde payloads distintos según
  `capability` y `high_water_mark` del cliente. El `ETag` debe derivarse de la combinación completa de los
  query params relevantes (`org`, `issuer`, `installation_id`, `high_water_mark`, `capability`) — no sólo del
  digest de `authority_state` — para que un cliente pidiendo `delta` nunca reciba un `304` validado contra
  una respuesta `full` de otro cliente, o viceversa.
- `GET /v1/authority/trust-bundle` — query param `org`. Devuelve el manifiesto de issuer (§11.1 del diseño
  físico: issuer, organización canónica, claves de firma autorizadas, vigencia).
- Ambas rutas siguen el patrón de error existente `{ error: string, message?: string }` y los códigos ya en
  uso (`200`, `304`, `400`, `404`) — no se inventa un schema de error nuevo.

## 2. Restricciones explícitas — no negociables en esta fase

- **Cero invención de infraestructura de logging.** No existe convención de logging en Backend hoy (sin
  `console.log` estructurado, sin librería). No agregar ninguna en esta fase — sólo los logs de Wrangler que
  ya existen por defecto.
- **SQL crudo, no Drizzle.** El código real usa D1 prepared statements (`db.prepare(...).bind(...).all<T>()`)
  aunque `drizzle-orm`/`drizzle-kit` estén instalados. Toda query nueva de esta fase usa el mismo patrón de
  SQL crudo — no migrar `manifest.ts` ni ningún archivo existente a Drizzle como parte de este encargo.
- **Estructura mínima.** Adaptarse a la estructura plana actual. Único directorio nuevo autorizado:
  `backend/src/authority/`. No se autoriza ninguna reorganización de `index.ts` o `manifest.ts` más allá de
  agregar las dos rutas nuevas.
- **Autenticación en pausa.** El modelo S2S completo (desafío/nonce/firma vía Nucleus) tiene cinco decisiones
  abiertas de José — **prohibido resolverlas en esta fase.** `GET /v1/authority/snapshot` y `GET
  /v1/authority/trust-bundle` se implementan sin autenticación estricta (mismo criterio que `/v1/manifest`
  hoy) o con un token estático provisorio de pruebas — a elección de Génesis, documentando cuál eligió. El
  handshake criptográfico real queda para una Fase 3 dedicada a Seguridad, todavía no encargada.
  **Precisión de ejecución:** si se elige el token estático, va como Workers secret binding
  (`wrangler secret put`) desde el arranque de esta fase — nunca hardcodeado en código ni en
  `wrangler.jsonc` — para que no quede un secreto real expuesto de forma permanente en el historial de git
  cuando la Fase 3 lo reemplace.
- **Foco láser.** Ningún archivo fuera de los listados en §1. No se toca Batcave ni Brain en esta fase — la
  "notificación a Batcave" se resuelve enteramente del lado Backend vía el patrón `ETag`/`If-None-Match` ya
  existente (§1.3), sin ningún cambio en `installer/batcave`.

## 3. Explícitamente fuera de esta fase

- El handshake S2S criptográfico completo (desafío/nonce/firma) y sus cinco decisiones abiertas.
- Cualquier cambio en Batcave o Brain.
- Migración de `manifest.ts`/`index.ts` a Drizzle o a cualquier librería de validación.
- Librería o convención de logging.
- Endpoints de escritura para administrar principals/memberships/roles/asignaciones desde fuera de esta
  fase (UI, onboarding) — esta fase sólo construye la lectura/emisión del snapshot a partir de lo que exista
  en las tablas; poblar esas tablas por otra vía no está en el alcance.
- WebSocket de notificación real hacia Batcave.

## 4. Validación

```text
npm run typecheck
npm test
```

(`vitest run`, según `package.json` real de `backend/`). Migraciones D1 aplicadas localmente vía
`wrangler d1 migrations apply bloom-backend --local` antes de correr los tests, si los tests las requieren.
Sin Git ni pipelines.

**Requisito adicional de `backend/test/authority.spec.ts`:** cumplir el mismo RFC 8785 en Go
(`github.com/gowebpki/jcs`, ya en uso en Nucleus) y en JS no garantiza por sí solo output canonicalizado
idéntico byte a byte en casos límite (orden de claves Unicode, números, escapes). El test debe incluir al
menos un vector de prueba cruzado: el mismo payload lógico canonicalizado por la implementación de Nucleus y
por `canonical.ts`, verificando que el digest SHA-256 resultante sea idéntico — no alcanza con asumir que
"ambas implementaciones cumplen el RFC".

## 5. Regla de continuidad

Esta autorización cubre exactamente los archivos listados en §1 (2 nuevos en D1/migraciones, 3 nuevos en
`src/authority/`, 1 archivo de test nuevo, 1 archivo modificado — `index.ts`). Ningún otro archivo se
modifica sin una lista exacta adicional. No se activa autenticación real, no se toca Batcave, no se toca
Brain, no se activa `shadow_remote` como consecuencia de esta fase.
