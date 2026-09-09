# Nota técnica — Riesgos de ejecución, Encargo Fase 2 Backend (Autoridad Remota)

**Fecha:** 2026-09-04
**Emisor:** cowork BACKEND (Cloud)
**Destinatario:** Génesis Control
**Referencia:** "Encargo — Implementación física de la autoridad remota, Fase 2 (Backend)", 2026-09-04, para ejecución en el Work ROLES de Codex.
**Estado:** No reabre el diseño físico (`BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md`) ni ninguna decisión `PHY-DEC-*`/`SNAP-INV-*` ya fijada. Son 4 riesgos de ejecución dentro del alcance ya autorizado, a resolver antes de que Codex arranque la Fase 2.

---

## 1. "Misma transacción D1" (§1.1, tabla `authority_state`) necesita precisión

D1 no soporta transacciones interactivas del tipo `BEGIN ... lógica con lecturas intermedias ... COMMIT` dentro de un mismo request de Worker. Lo que sí existe es `db.batch([...])`: ejecuta un array de prepared statements de forma atómica, todo o nada, pero sin poder decidir el contenido de una statement en base al resultado de otra dentro del mismo batch.

Si `snapshot.ts` necesita incrementar el high-water mark y escribir contenido nuevo de forma atómica, el patrón correcto es un único `UPDATE authority_state SET current_version = ?, current_digest = ? WHERE organization_id = ? AND current_version = ?` (concurrencia optimista — el `WHERE` verifica que nadie movió la versión entre la lectura y la escritura) incluido en el mismo `batch()` que las escrituras de contenido. No un patrón de dos pasos separados (leer, después escribir), que D1 no garantiza atómico entre sí.

**Recomendación:** dejar este patrón explícito en el encargo o en la revisión de diseño de `snapshot.ts`, para que Codex no intente un enfoque que D1 no soporta.

## 2. El ETag de `GET /v1/authority/snapshot` no puede calcularse solo "por organización"

A diferencia de `/v1/manifest` (una sola representación por org/canal), este endpoint responde payloads distintos según `capability` (`full`/`delta`) y `high_water_mark` del cliente. Si el ETag se calcula solo sobre el estado de la organización, un cliente pidiendo `delta` podría recibir un `304` validado contra una respuesta `full` de otro cliente (o viceversa).

**Recomendación:** el ETag debe derivarse de la combinación completa de query params relevantes (`org`, `issuer`, `installation_id`, `high_water_mark`, `capability`), no solo de `organization_id`.

## 3. JCS (RFC 8785) no garantiza compatibilidad byte-a-byte entre implementaciones distintas del spec

Nucleus firma con `github.com/gowebpki/jcs` (Go). Lo que Codex implemente en el Worker (JS) debe producir el mismo digest SHA-256 para el mismo JSON lógico — cumplir el mismo RFC en dos lenguajes distintos no garantiza por sí solo que el output canonicalizado sea idéntico byte a byte en casos límite (orden de claves Unicode, números, escapes).

**Recomendación:** el test de cierre (`backend/test/authority.spec.ts`) debe incluir al menos un vector de prueba cruzado: mismo payload canonicalizado por la implementación Go de Nucleus y por la implementación JS de Backend, verificando digest idéntico — no asumir que "ambos cumplen el RFC" alcanza.

## 4. El "token estático provisorio" (§2 del encargo) no debe vivir hardcodeado en un archivo commiteado

Aunque sea de pruebas y de vida corta hasta la Fase 3 de seguridad, un valor de autenticación literal en código o en `wrangler.jsonc` queda commiteado en el historial de git de forma permanente.

**Recomendación:** usar `wrangler secret put` (Workers secret binding) desde el inicio, incluso para el token provisorio, para que no quede un secreto real expuesto en el repo cuando la Fase 3 lo reemplace.

---

*Esta nota no modifica el encargo ni el diseño físico — es información técnica de ejecución para que Génesis la incorpore donde corresponda antes de autorizar el arranque de Codex en la Fase 2.*
