# Backend Cloudflare — Arranque de Desarrollo (brief para Codex)

**Tipo:** Encargo de implementación — no es un documento de arquitectura nuevo, es el texto que arranca el work de Codex sobre el backend ya diseñado.
**Estado:** v0.1
**Fecha:** 2026-08-29
**Contexto:** a partir de acá, el desarrollo del backend continúa en un work de Codex, mientras este cowork sigue enfocado en requerimientos (rutas de Vercel, roles, decisiones abiertas). Mismo split que ya se usó para Wisdom.

---

Este work implementa el backend nuevo del ecosistema Bloom en Cloudflare: distribución de binarios/manifests hacia Batcave, cuentas de usuario/organización, y la base de datos de Mandates para el futuro Marketplace. Es la contraparte de implementación de un trabajo de arquitectura ya cerrado — no hay que rediseñar nada de lo que sigue, hay que construirlo.

**Documento maestro, léelo primero completo:** `docs/BACKEND/Backend_Cloudflare_Arquitectura_v0_1.md`. Contiene, en orden: qué ya está decidido (§0 — D1 como base de datos, Batcave y no Metamorph habla con el backend, la app vive en `workers/`), dónde encaja en el ecosistema existente (§1), cómo integrarse al repo sin romper el patrón de `build-all.py` (§2), el stack completo con la razón de cada elección (§3 — Workers, Hono, D1, Drizzle, R2, KV, GitHub OAuth), el esquema de datos completo en Drizzle (§4 — `organizations`, `users`, `orgMembers`, `mandates`, `mandateVersions`, `mandateAdoptions`, `releases`, `downloadRules`), por qué el desarrollo local con D1 es completamente viable sin nube (§5), el mecanismo confirmado por el que Batcave obtiene el manifest (§6 — `GET /v1/manifest` con `If-None-Match`/ETag, resuelto directamente sobre `releases`+`downloadRules`, sin inventar un formato nuevo porque ya coincide con lo que Metamorph sabe consumir), la migración de los sitios de Vercel (§7, todavía bloqueada porque falta que Jose consiga las rutas de los dos proyectos — no es tarea de este work), los pendientes (§8), y **los primeros pasos concretos con comandos reales** (§9 — scaffold con `npm create cloudflare@latest`, creación de la D1 con `wrangler d1 create`, Drizzle, `wrangler dev` local, seed de prueba). Arrancá directamente por §9.

**Documento complementario, leelo antes de tocar nada de conectividad en tiempo real:** `docs/BACKEND/Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md`. Diseña el canal push (Batcave mantiene una conexión saliente al backend y recibe avisos livianos de que hay novedades) que complementa al pull autoritativo del §6 de arriba. Este documento tiene un §11 con **5 decisiones explícitamente sin cerrar** (confianza inicial en la clave pública de la organización, targeting por-device, reglas de revocación, TTL de la credencial, WebSocket vs. SSE) — **no las resuelvas por tu cuenta ni asumas una respuesta por default.** Mientras no estén cerradas, el canal push (y la pieza de infraestructura que requiere, Durable Objects con WebSocket Hibernation API, señalada en el §9 de ese mismo documento) queda fuera de este work. Construí primero el pull autoritativo completo — funciona solo, sin el canal push, exactamente como está diseñado en §6 del documento maestro.

**Contexto adicional para no rehacer descubrimientos ya hechos, sin necesidad de releerlos completos salvo que haga falta el detalle:**
- `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` — confirma por qué Batcave (y no Metamorph) es quien habla con este backend nuevo, y de dónde salen `organization_fingerprint`/`key_fingerprint` que ya se reusan como identidad en el schema.
- `docs/METAMORPH/metamorph-ionpump-reference.md` — el formato de manifest (`artifacts[]`) que Metamorph ya sabe interpretar; el manifest que arme el backend tiene que calzar con esto, no inventar uno nuevo.
- `docs/BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md` — contexto general del ecosistema si hace falta ubicar alguna pieza que no aparezca en los dos documentos de arriba.

**Qué queda explícitamente fuera de este work:**
- Todo lo de Wisdom (Mandate Package, Cognitive Evidence Model, marketplace) — es un track separado que ya está corriendo en otro work de Codex, con sus propios documentos en `docs/WISDOM/`. Si algo del schema de acá (`mandates`/`mandateVersions`) roza ese tema, no desarrollarlo — solo dejar los campos ya reservados (`pillar`, `originType`) tal como están en el schema, sin construir lógica sobre ellos.
- El campo de roles en `orgMembers` — se deja como está (`"master" | "architect" | "specialist"`) hasta que Jose dé más información; no rediseñarlo ni completarlo por cuenta propia.
- Cualquier cosa del §7 (migración de Vercel) — todavía no están las rutas de esos proyectos.

**Primer hito a confirmar antes de seguir:** el scaffold local (§9.1 del documento maestro) corriendo, con el servidor local levantado y el endpoint de manifest respondiendo contra la D1 local, antes de avanzar a integrarlo con `build-all.py`.

---

*Fin del brief v0.1. Referencia: `Backend_Cloudflare_Arquitectura_v0_1.md`, `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` (mismo directorio `docs/BACKEND/`).*
