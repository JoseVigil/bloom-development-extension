# Nota Técnica — Análisis Fase 4: Puntos de Escritura y Onboarding del Primer Principal

**Fecha:** 2026-09-05 (v0.1) — actualizado 2026-09-09 (v0.2)
**Emisor:** cowork BACKEND (Cloud)
**Destinatario:** Génesis Control
**Referencia:** comunicación "Hola equipo de Backend" (2026-09-04/05), estado Batcave Fase 3 cerrado, Backend Fase 2 completo + parte de Fase 3, Nucleus Fase 3 no iniciado.
**Estado:** Lectura técnica de BACKEND sobre los dos temas planteados para Fase 4. No es la decisión final — esa corresponde a Génesis Control.

**Nota de terminología (v0.2):** en esta versión, "bootstrap del primer principal" se reemplaza por *onboarding*. "Bootstrap" ya está en uso, y queda reservado exclusivamente para el arranque de un servidor local (Nucleus/Batcave). El evento de negocio en el que una persona o empresa se da de alta y obtiene su primer principal/organización se llama de aquí en adelante *onboarding*. Es un cambio de nombre puro — no implica ningún cambio de diseño respecto a v0.1.

## 0. Verificación independiente del estado reportado

- `backend/migrations/0002_installation_identities.sql` sigue presente en el árbol junto a la migración real `0002_authority_security.sql`; es una tabla distinta (`installation_identities`, columnas distintas) y está obsoleta — confirmado por lectura directa de ambos archivos.
- `backend/test/authority.spec.additions.ts` no coincide con el patrón de inclusión de `vitest.config.mts` (`test/**/*.spec.ts` — el archivo termina en `.additions.ts`, no en `.spec.ts`). No hay cobertura real de tests para la integridad referencial de `role_definitions` ni para la cadena de rotación de `issuer_signing_keys`, pese a estar implementadas.
- No se encontraron archivos de Nucleus Fase 3 en el árbol del repositorio al momento de esta verificación.

## 1. Onboarding del primer principal

El esquema actual (`principals`, `memberships`, `role_assignments` con FKs `NOT NULL`) no permite crear una organización sin al menos un principal, una membership y un role_assignment ya resueltos — no existe una columna "quién autorizó" en ninguna tabla. Esto significa que el primer alta de una organización necesita, en una sola operación atómica, insertar las cuatro filas (organización, principal, membership, role_assignment con rol `master`) más la fila inicial de `authority_state` (high-water mark en versión 0).

D1 no soporta transacciones interactivas; el patrón correcto es un único `db.batch([...])` con todas las sentencias preparadas, de modo que el alta completa se confirme o falle como una sola unidad — nunca una secuencia de escrituras independientes que puedan dejar el esquema en un estado a medias (organización sin principal, o principal sin `role_assignment`).

### 1.1 Nueva variable pendiente: Tenant

El documento "Gravity ABM — Editor de Posturas y Postulados en Tenant, Organización y Proyecto" introduce el concepto de *Sovereign Tenant*: una instancia de Sovereign que cada cliente adquiere y que puede contener múltiples organizaciones internas de Bloom. Esta variable no estaba presente en v0.1 de esta nota y no forma parte de ningún esquema ni migración de Backend verificado hasta la fecha.

Su existencia tiene una consecuencia directa sobre el punto anterior: si el onboarding del primer principal ocurre "dentro de" un tenant ya existente (en lugar de crear una organización aislada), la transacción atómica descrita arriba tendría que incluir también la relación organización↔tenant, y el alcance del high-water mark de `authority_state` (¿es por organización, como hoy, o pasa a ser por tenant?) queda abierto. Esta nota no resuelve esa pregunta — se deja constancia de que Fase 4 no puede cerrarse sin una definición fundacional de Tenant que hoy BACKEND no tiene localizada en el repositorio ni en el proyecto.

## 2. Puntos de entrada de escritura y qué identidad firma

La verificación directa de `backend/src/authority/identity.ts` confirma que la firma S2S de instalación (`verifyInstallationSignature`, dominio `BLOOM-INSTALLATION-AUTH-v1`) cubre únicamente `{installation_id, organization_id, method, path, timestamp}` — **no cubre el cuerpo de la solicitud**. Esto significa que, tal como está hoy, cualquier endpoint de escritura que dependa solo de esta firma no tiene garantía criptográfica de que el body recibido sea el que el firmante originalmente envió; un atacante con acceso a la capa de transporte (o un proxy comprometido) podría alterar el payload sin invalidar la firma.

Se recomienda que los puntos de escritura de Fase 4 (onboarding, y cualquier mutación posterior de rol/membership) firmen con una identidad ligada al principal actuante — no solo a la instalación — y que esa firma incluya un digest del cuerpo, siguiendo el mismo patrón de dominio de firma ya usado en Authority Snapshot (JCS + SHA-256 + Ed25519 con separación de dominio). El proxy S2S de Batcave (`authority-proxy.ts`), que hoy reenvía las tres cabeceras fijas de forma transparente sin verificar ni reconstruir nada, podría reutilizarse sin cambios para estos nuevos endpoints si se mantiene el mismo contrato de cabeceras.

**Nota de consistencia con §1.1:** si el onboarding termina ocurriendo a nivel Tenant y no solo a nivel Organización, la pregunta de qué identidad firma la operación de alta (¿la del tenant, la del futuro principal, ambas?) queda condicionada a la misma definición pendiente de Sovereign Tenant señalada arriba. No se fija ninguna posición al respecto en esta nota.

---
*Esta nota no fija ninguna decisión de Fase 4. Es un insumo técnico de BACKEND para que Génesis Control defina el diseño formal, considerando en particular la transacción atómica en D1, la variable pendiente de Tenant, y el alcance de la firma en los puntos de escritura.*
