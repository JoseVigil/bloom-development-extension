# Nota Técnica — Análisis Fase 4: Puntos de Escritura y Bootstrap del Primer Principal

**Fecha:** 2026-09-05
**Emisor:** cowork BACKEND (Cloud)
**Destinatario:** Génesis Control
**Referencia:** comunicación "Hola equipo de Backend" (2026-09-04/05) — estado verificado de Batcave (Fase 3, cerrado), Backend (Fase 2 + parte de Fase 3, dos cabos sueltos) y Nucleus (Fase 3, sin arrancar), más dos preguntas de diseño para destrabar los encargos de escritura de Fase 4.
**Estado:** Lectura técnica de este cowork sobre qué es más simple y más seguro de construir dado lo que ya existe en `backend/src/authority/` e `installer/batcave/src/server/`. No es la decisión final — queda sujeta a aprobación de Génesis Control, mismo criterio usado en toda la Fase 3.

---

## 0. Verificación independiente del estado reportado

Antes de responder, confirmamos directamente contra el repo (no solo contra lo reportado):

- `backend/migrations/0002_installation_identities.sql` sigue presente junto a la migración real `0002_authority_security.sql` (que crea `installation_keys`, no `installation_identities`) — confirmado, Wrangler intentaría aplicar ambas.
- `backend/test/authority.spec.additions.ts` no matchea el include `test/**/*.spec.ts` de `vitest.config.mts` (el archivo termina en `.additions.ts`, no en `.spec.ts`) — confirmado: cobertura real cero para la integridad referencial de `role_definitions` y la cadena de rotación de `issuer_signing_keys`, pese a estar bien implementadas.
- Ningún archivo del encargo de identidad local de Nucleus (`identity.go`, `request_signing.go`, `binding.go`, `pinned_roots.go`) existe en `installer/nucleus` — confirmado, Nucleus Fase 3 no arrancó.

## 1. Bootstrap del primer principal

El schema real (`backend/migrations/0001_authority_snapshot.sql`) tiene `role_assignments` con FK `NOT NULL` a `principal_id`, `membership_id` y `role_definition_id` — no existe ninguna columna de "quién autorizó esta fila" en ninguna tabla; esa autorización, si existe, vive en código de aplicación, no en el schema. Los `role_definitions` built-in (`master`/`specialist`, `organization_id NULL`) ya existen globalmente antes de que se cree cualquier organización nueva — lo único que falta al nacer una organización es el `principal` + `membership` + `role_assignment` que la ligan a una persona concreta.

Con esa forma de schema, un acto administrativo separado (insertar después de que la organización ya existe) deja una ventana real: la organización existe con cero principals válidos, y no hay ningún camino de autorización normal (`role_assignments` no puede tener una fila válida todavía) para salir de ese estado sin, de nuevo, un insert fuera de banda sin traza de autorización.

**Recomendación:** una única transacción atómica (`db.batch()`) que cree `organizations` + `principals` + `memberships` + `role_assignments` (rol master, contra el `role_definition` built-in ya existente) + `authority_state` en versión 1, todo junto, gateada por el mismo evento de establecimiento de confianza inicial (§11.1 del diseño físico — binding, root pinneada) y no por el camino normal de `role_assignments` (que todavía no puede existir para una organización nueva). Es el mismo principio ya aplicado para el high-water mark de `authority_state`: evitar un estado intermedio inconsistente con una escritura atómica, no con un patrón de dos pasos separados.

## 2. Puntos de entrada de escritura y qué identidad firma

Revisamos `backend/src/authority/identity.ts` directamente. La firma S2S de instalación que existe hoy cubre `{installation_id, organization_id, method, path, timestamp}` — **no el body de la request**. Esto no se nota hoy porque las únicas rutas que la verifican son de lectura (`snapshot`, `trust-bundle`, sin body), y `register` ni siquiera verifica firma — está gateado por un token de servicio estático provisorio.

**Consecuencia directa:** tal como está implementada hoy, esa firma no alcanza para autorizar ninguna mutación — de instalación o de una identidad de admin nueva, da igual quién firme. La firma ata identidad + momento + ruta, pero no ata la firma a *qué* se está mutando. Un relay comprometido, o con un bug, podría alterar el body sin invalidar la firma. Este es un prerequisito de diseño independiente de la pregunta de "qué identidad firma": antes de que cualquier escritura de Fase 4 pueda depender de una firma, el esquema de canonicalización (`canonical.ts`) tiene que incorporar un digest del body dentro de lo firmado.

Resuelto ese prerequisito, sobre qué identidad debería firmar: la clave de instalación prueba "esta instalación de Nucleus", no "esta persona". Fase 4 trata específicamente sobre quién tiene qué rol — atar la autorización de esas mutaciones solo a la instalación mezcla "qué máquina" con "qué persona autorizada" (si se compromete el dispositivo del master de una organización, la clave de instalación no distingue eso de una acción legítima de esa persona).

**Recomendación:** una identidad de firma separada, ligada a un `principal` (no a una instalación), en capas sobre la actual — la firma de instalación sigue probando el transporte (relay genuino vía Batcave), y una firma de principal, atada al digest del body, prueba que una persona autorizada aprobó esa mutación puntual. Esto es consistente con el propio modelo: `principals` ya es la unidad de responsabilidad que el schema usa para todo lo demás.

**Sobre el punto de entrada:** el proxy de autoridad de Batcave (`installer/batcave/src/server/routes/authority-proxy.ts`) ya reenvía método, headers S2S y body tal cual sin interpretarlos — 5 tests en verde, incluido uno que verifica explícitamente que Batcave nunca reconstruye ni entiende la firma. Extender ese proxy para llevar escrituras es transporte ya probado, barato de construir. Lo difícil no es el transporte — es la capa de firma con body-binding descripta arriba, que hay que construir de todos modos exista o no el camino de Nucleus. Conviene resolverla una sola vez en `identity.ts`/`canonical.ts`, para que sirva tanto a una superficie administrativa central en Backend como a un comando local de Nucleus relayado por Batcave.

---

*Esta nota no fija ninguna decisión de Fase 4 — es la lectura técnica de este cowork sobre qué es más simple y más seguro de construir dado el código y el schema reales existentes hoy. Queda sujeta a revisión y aprobación de Génesis Control antes de encargarse a Codex.*
