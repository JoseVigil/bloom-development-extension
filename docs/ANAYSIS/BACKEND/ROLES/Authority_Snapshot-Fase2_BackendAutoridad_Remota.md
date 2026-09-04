# backend/src/authority/README.md

# Authority Snapshot — Fase 2 Backend (Autoridad Remota)

**Estado:** implementación completa de los 7 puntos de `§1` del encargo. Pendiente de
revisión de Génesis contra `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` antes de
considerarse cerrada — ver `§2 Decisiones abiertas y supuestos` más abajo, varias no son
cosméticas.

**Referencias:**
`Encargo_Implementacion_Fisica_Fase2_Backend_v0_1.md` (2026-09-04) ·
`Nota_Tecnica_Riesgos_Ejecucion_Encargo_Fase2_Backend_v0_1.md` (cowork BACKEND, 2026-09-04)

---

## 0. Corrección requerida antes de correr los tests (bloqueante)

`test/authority.spec.ts` importa desde un archivo que no existe:

```ts
import { canonicalizeJson, digestCanonical, sha256Hex, signDigest, verifyDigestSignature }
  from "../src/authority/schema-canonical-shim";
```

Esas cinco funciones están implementadas en `src/authority/canonical.ts`, no en
`schema-canonical-shim.ts` (ese archivo no forma parte de los 6 entregados en `§1` del
encargo ni existe en el repo). Es un error de import, no una decisión de diseño — hay que
corregir la ruta a `../src/authority/canonical` antes de `npm test`, o el archivo no
compila. Se deja documentado acá en vez de corregido en silencio porque tocar
`test/authority.spec.ts` sin que quede registro sería exactamente el tipo de cambio no
trazado que el encargo pide evitar (`§5`, regla de continuidad).

---

## 1. Qué se entregó

| Archivo | Contenido |
|---|---|
| `backend/migrations/0001_authority_snapshot.sql` | `principals`, `memberships`, `role_definitions`, `role_assignments`, `revocations`, `authority_state`. |
| `backend/src/authority/schema.ts` | Interfaces TS locales del wire schema full/delta + envelope + trust bundle. Sin Zod. |
| `backend/src/authority/canonical.ts` | JCS (RFC 8785) vía `canonicalize`, digest SHA-256, firma/verificación Ed25519 con separador de dominio. |
| `backend/src/authority/snapshot.ts` | Lectura de las 5 tablas de contenido, construcción full/delta, versionado atómico de `authority_state`, orquestación (`resolveAuthoritySnapshot`), trust bundle. |
| `backend/src/index.ts` (modificado) | `GET /v1/authority/snapshot`, `GET /v1/authority/trust-bundle`, ETag por combinación de query params, token estático opcional vía secret binding. |
| `backend/test/authority.spec.ts` | Tests de canonicalización, firma, concurrencia optimista sobre `authority_state`, `no_newer_version`. Vector cruzado Go/JS como `.todo` (ver `§2.3`). |

Ningún archivo fuera de esta lista fue tocado. `index.ts` sólo agrega las dos rutas
nuevas e imports asociados — no se extrajo a `routes/`ni se reorganizó el archivo plano
existente (`§2` del encargo).

---

## 2. Decisiones abiertas y supuestos de diseño

Ninguno de estos reabre el diseño físico ni ningún `PHY-DEC-*`/`SNAP-INV-*` — son huecos
que aparecieron porque `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` no estaba
disponible en la sesión donde se implementó cada archivo. Cada uno está marcado en el
código fuente como `SUPUESTO DE DISEÑO` en el archivo correspondiente; acá quedan
consolidados para revisión de Génesis.

### 2.1 Quién dispara el versionado de `authority_state` (`snapshot.ts`)

Esta fase no incluye endpoints de escritura para poblar `principals`/`memberships`/
`role_assignments` (`§3` del encargo lo deja explícitamente fuera). Eso deja abierto quién
incrementa `authority_state.current_version` cuando esas tablas cambian por una vía
externa a esta fase.

**Solución adoptada:** `resolveAuthoritySnapshot` recalcula el contenido "full" en cada
request a partir del estado actual de las tablas, lo canonicaliza, y compara el digest
contra `authority_state.current_digest`. Si difieren, hace un bump atómico de
versión/digest (concurrencia optimista, `§2.2`); si coinciden, no escribe nada — la
lectura es idempotente ("auto-reparación por lectura", no un endpoint de negocio nuevo).

**A confirmar:** si el diseño físico define otro disparador (un job separado, un endpoint
de "publish" para una fase futura), este mecanismo debe reemplazarse. Está aislado en
`buildFullContent` / `ensureAuthorityVersion` para que el reemplazo sea localizado sin
tocar el resto de `snapshot.ts`.

### 2.2 Concurrencia optimista sobre `authority_state` (Nota técnica de riesgos §1)

Implementado como pide la nota técnica: una única statement dentro de `db.batch([...])`

```sql
UPDATE authority_state
SET current_version = ?, current_digest = ?, updated_at = ?
WHERE organization_id = ? AND current_version = ?
```

con `current_version` esperado = versión leída antes de construir el batch. Si
`updateResult.meta.changes === 0`, se trata como conflicto (no como éxito) y se reintenta
el ciclo completo (lectura → comparación de digest → batch) hasta `maxRetries = 3`, luego
de lo cual `ensureAuthorityVersion` lanza `authority_state_conflict`. El caso de primera
escritura (fila `authority_state` inexistente) usa `INSERT` con manejo de la carrera de
inicialización vía `catch` + reintento, no `UPDATE`.

**A confirmar:** el valor de `maxRetries = 3` es arbitrario (no está en el encargo ni en
la nota técnica); ajustar si hay un SLA de latencia esperado para este endpoint bajo
contención. El test `authority.spec.ts` sólo ejercita 2 requests concurrentes — no valida
el comportamiento bajo contención más alta ni el caso de agotar los reintentos.

### 2.3 Vector de prueba cruzado Go/JS para JCS (Nota técnica de riesgos §3)

**No verificado.** `it.todo(...)` en `authority.spec.ts` — no hubo acceso en ninguna
sesión al módulo Go de Nucleus (`internal/authority`, `github.com/gowebpki/jcs`) para
generar un digest de referencia real. Los tests existentes sólo prueban que
`canonicalizeJson`/`digestCanonical` son determinísticos y estables frente al orden de
inserción de claves — **no** prueban compatibilidad byte a byte con Go, que es exactamente
el riesgo que la nota técnica pide no asumir por descontado.

**Acción pendiente antes de dar la Fase 2 por cerrada:** correr el mismo payload lógico
por la implementación Go de Nucleus, pegar el digest resultante como constante en el test,
y promover el `.todo` a un test real. Sin esto, una firma producida por este Worker podría
no verificar contra Nucleus en producción sin que ningún test lo detecte hoy.

### 2.4 Separador de dominio de la firma Ed25519 (`canonical.ts`)

```ts
const DOMAIN_SEPARATOR = "bloom-authority-snapshot-v1"; // TODO: confirmar contra Nucleus internal/authority (Go)
```

Placeholder explícito. El valor real usado por Nucleus (`§8.1` del diseño físico) no
estaba disponible en ninguna sesión de implementación. Si no coincide byte a byte con lo
que Nucleus espera al verificar, **toda firma producida por este Worker será rechazada**
— es la dependencia más frágil de todo lo entregado en esta fase.

### 2.5 Soporte nativo de Ed25519 en el runtime de Workers (`canonical.ts`)

`signDigest`/`verifyDigestSignature` asumen `crypto.subtle` con `{ name: "Ed25519" }` de
forma nativa. Cloudflare lo fue habilitando de forma progresiva según `compatibility_date`.
No se confirmó contra el `compatibility_date` real de `wrangler.jsonc` de este proyecto (no
estaba en los archivos provistos en la sesión donde se escribió `canonical.ts`).

**Fallback documentado si no está soportado:** sumar `@noble/ed25519` (pura JS) manteniendo
la misma firma de función en `canonical.ts`, sin tocar `snapshot.ts` ni `index.ts`.

### 2.6 Dependencia nueva `canonicalize` — falta el `npm install` real

`canonical.ts` depende de `canonicalize` (listada en el Apéndice G de RFC 8785 como
implementación conforme). El `package.json` de `backend/` no formó parte de los archivos
provistos en ninguna sesión, así que el `"canonicalize": "^2.0.0"` **no está agregado
todavía** — sólo documentado como instrucción (`npm install canonicalize --save`) en el
encabezado de `canonical.ts`. Confirmar que se ejecutó antes de `npm run typecheck`.

### 2.7 Columnas `since_version` no listadas literalmente en el encargo (`0001_authority_snapshot.sql`)

El encargo (`§1.1`) menciona explícitamente `visible_from_version` en `revocations`, pero
no una columna equivalente en `principals`/`memberships`/`role_definitions`/
`role_assignments`. Se agregó `since_version` en las cuatro por necesidad funcional: sin
ella, `buildDeltaContent` (`snapshot.ts`) no tiene forma de calcular qué filas son
"nuevas desde `base_version`" para el payload `delta` que el propio encargo pide (`§1.2`).

**A confirmar:** si el diseño físico ya define un mecanismo distinto para deltas (p. ej.
una tabla de eventos/outbox separada en vez de una columna por tabla), esta columna debe
eliminarse o reconciliarse con ese mecanismo.

### 2.8 `role_definitions` no filtra por "última versión vigente" (`snapshot.ts`, `fetchRoleDefinitions`)

Se listan todas las versiones presentes en la tabla para una `key` dada (built-in o
custom), no sólo la más alta o vigente. Si el diseño físico espera que el snapshot emita
únicamente la versión activa por rol, falta un filtro adicional (`§15` del diseño físico,
no disponible en sesión). Marcado en el código como pendiente de confirmación.

### 2.9 Trust bundle sin tabla D1 propia (`snapshot.ts`, `buildTrustBundleFromEnv`)

`0001_authority_snapshot.sql` no define tabla de claves de firma / issuers, y el encargo
tampoco la lista entre los archivos de esta fase. `GET /v1/authority/trust-bundle` arma un
bundle de **una sola clave activa** a partir de bindings de entorno
(`AUTHORITY_TRUST_ISSUER`, `AUTHORITY_SIGNING_KEY_ID`, `AUTHORITY_SIGNING_PUBLIC_KEY_B64`),
sin soporte de rotación ni múltiples claves. Si `§11.1` del diseño físico requiere eso,
hace falta una tabla nueva — fuera del alcance literal de `§1` de este encargo.

### 2.10 Token estático provisorio vía secret binding (`§2` del encargo, riesgo #4)

Implementado como pide la nota técnica: `AUTHORITY_STATIC_TOKEN` se lee de
`context.env` (Workers secret binding, `wrangler secret put`), nunca hardcodeado ni en
`wrangler.jsonc`. Si el binding no está configurado, ambas rutas quedan sin autenticación
estricta — mismo criterio que `/v1/manifest` hoy, explícitamente permitido por el encargo
mientras las 5 decisiones del handshake S2S sigan abiertas.

### 2.11 ETag por combinación completa de query params (riesgo #2)

`authorityEtag()` en `index.ts` hashea `{org, issuer, installation_id, high_water_mark,
capability}` + el cuerpo de la respuesta — no sólo `organization_id` ni el digest de
`authority_state`. Evita que un cliente pidiendo `delta` reciba un `304` validado contra
una respuesta `full` ajena. `issuer` e `installation_id` se incluyen en la clave del ETag
aunque hoy no cambian el contenido del payload (no se usan todavía para filtrar
`resolveAuthoritySnapshot`) — se dejan por si el diseño físico los usa para eso en el
futuro; confirmar si corresponde quitarlos o si de hecho deberían influir el contenido.

---

## 3. Explícitamente NO resuelto en esta fase (recordatorio, no cambia nada del encargo)

- Handshake S2S criptográfico completo (desafío/nonce/firma) — 5 decisiones abiertas de José.
- Cualquier cambio en Batcave o Brain.
- Migración de `manifest.ts`/`index.ts` a Drizzle o a librería de validación.
- Convención de logging.
- Endpoints de escritura para poblar `principals`/`memberships`/`role_assignments` desde
  fuera de esta fase.
- WebSocket de notificación real hacia Batcave — la "notificación" es enteramente
  `ETag`/`If-None-Match` vía polling.

---

## 4. Checklist de cumplimiento de restricciones (`§2` del encargo)

| Restricción | Estado | Nota |
|---|---|---|
| SQL crudo (`db.prepare().bind().all/first/run()`), no Drizzle | ✅ | Todas las queries de `snapshot.ts` son crudas; `db.batch([...])` sólo para el `UPDATE` de `authority_state`. |
| Único directorio nuevo: `backend/src/authority/` | ✅ | `schema.ts`, `canonical.ts`, `snapshot.ts`, y este `README.md`. |
| `index.ts` sin refactor / sin extraer a `routes/`, `middleware/` | ✅ | Sólo 2 rutas nuevas + imports + 3 helpers locales (`checkStaticAuthorityToken`, `authorityEtag`, `decodeBase64ToArrayBuffer`) en el mismo archivo plano. |
| Cero infraestructura de logging nueva | ✅ | No se agregó `console.log` estructurado ni librería. |
| Sin Zod / sin librería de validación en `schema.ts` | ✅ | Interfaces TS puras. |
| Autenticación en pausa (sin resolver las 5 decisiones S2S) | ✅ | Token estático opcional vía secret binding; sin token configurado, rutas abiertas igual que `/v1/manifest`. |
| Token nunca hardcodeado / nunca en `wrangler.jsonc` | ✅ | Leído sólo desde `context.env.AUTHORITY_STATIC_TOKEN` (secret binding). |
| ETag no depende sólo de `organization_id` | ✅ | Ver `§2.11`. |
| Concurrencia optimista explícita en `authority_state` | ✅ | Ver `§2.2`. Único punto abierto: valor de `maxRetries`. |
| Vector cruzado Go/JS para JCS | ⚠️ pendiente | `.todo`, ver `§2.3` — bloqueante para cerrar el riesgo #3 de la nota técnica, no para correr la suite. |
| Test importa desde archivo correcto | ❌ | Import roto a `schema-canonical-shim` — ver `§0`, corregir antes de `npm test`. |
| Dependencia `canonicalize` agregada a `package.json` | ⚠️ pendiente | No se tocó `package.json` en ninguna sesión — ver `§2.6`. |
| Foco láser — ningún archivo fuera de `§1` | ✅ | Ver tabla `§1`. |

**Resumen:** la implementación cumple las restricciones estructurales y de patrón del
encargo (SQL crudo, estructura plana, versionado atómico, ETag compuesto, secret binding
para el token). Quedan tres pendientes concretos antes de un cierre real: corregir el
import roto en el test (`§0`), agregar `canonicalize` a `package.json` (`§2.6`), y — el más
importante en términos de riesgo — reemplazar el `.todo` del vector cruzado Go/JS por un
valor real de Nucleus (`§2.3`), sin el cual no hay evidencia de que las firmas emitidas por
este Worker vayan a verificar contra Nucleus.

---

## 5. Validación

```bash
# 1. corregir el import de test/authority.spec.ts (ver §0)
# 2. agregar la dependencia nueva
npm install canonicalize --save

# 3. aplicar la migración localmente
wrangler d1 migrations apply bloom-backend --local

# 4. correr validación
npm run typecheck
npm test   # vitest run
```

Sin Git ni pipelines, según `§4` del encargo.
