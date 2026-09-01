# Status — Backend Cloudflare ↔ Batcave (carril operativo en Codex)

**Tipo:** Status de coordinación — separa el carril operativo ya asignado a los works de Codex (BACKEND, BATCAVE) del espacio conceptual que queda libre para este cowork.
**Estado:** v0.1
**Fecha:** 2026-08-29
**Autor:** Jose, compartido para registrar el corte de alcance entre Codex y este cowork.

---

En los works de Codex BACKEND y BATCAVE vamos a cerrar exclusivamente la interacción operativa mínima viable para la actualización del ecosistema Bloom.

## Alcance del work BACKEND

- Mantener el Worker de Cloudflare con Hono, D1 y R2.
- Resolver `GET /v1/manifest?org=...&channel=...` desde `releases` y `downloadRules`.
- Servir el único contrato que Metamorph consume realmente hoy: `{schema_version, generated_at, ions[]}` para ion recipes.
- Implementar ETag e `If-None-Match`, con respuestas `200` y `304`.
- Servir la descarga del objeto correspondiente desde R2.
- Automatizar un entorno local reproducible con D1/R2 locales, migraciones, seed y objeto de prueba.
- Documentar y validar el camino equivalente en Cloudflare real: D1/R2 remotos, migraciones `--remote`, deploy y URL `workers.dev` o dominio propio.

## Alcance del work BATCAVE

- Incorporar una URL configurable mediante `BLOOM_BACKEND_URL`.
- Consultar el manifest por organización y canal.
- Persistir el último ETag y reenviarlo en el siguiente poll.
- Manejar explícitamente respuestas `200`, `304` y errores.
- Descargar los ion recipes indicados por el manifest.
- Mantener a Batcave como único cliente de internet y relay organizacional; Metamorph continúa sin conectarse directamente al backend.
- Participar en una prueba full-loop con Backend y Batcave ejecutándose como procesos separados.

## Validación conjunta prevista

1. Backend arranca con D1 y R2 locales.
2. Batcave realiza el primer poll.
3. Backend responde `200`, manifest y ETag.
4. Batcave persiste el ETag y descarga el objeto desde R2.
5. Batcave repite el poll con `If-None-Match`.
6. Backend responde `304` sin retransmitir el manifest.
7. El mismo circuito podrá repetirse posteriormente contra el Worker desplegado.

Este primer entorno usa dos procesos y dos puertos en una misma máquina; no requiere dos IP. Una red aislada de contenedores puede agregarse después como variante de pruebas, no como requisito del desarrollo inicial.

## Fuera de estos works

- Canal push.
- Durable Objects.
- WebSocket o SSE.
- Enrolamiento y credenciales Backend ↔ Batcave.
- Targeting por dispositivo.
- Revocación y rotación de credenciales.
- Las cinco decisiones abiertas del documento de identidad/comunicación.
- Diseño o implementación interna de Wisdom.
- Marketplace y lógica de Mandates.
- Distribución de componentes binarios como Brain, Host o Sentinel, porque Metamorph todavía no tiene un consumidor real para ese tipo de manifest.

## Qué queda libre para este cowork

El cowork de Cloud queda liberado para avanzar conceptualmente sobre otras etapas del backend y del negocio de distribución, sin ocuparse de reconstruir este loop mínimo. Ejemplos: modelos futuros de publicación y distribución, catálogo, canales, audiencias, políticas comerciales, administración de releases, retención, observabilidad, lifecycle de artefactos, Marketplace y consumo de Wisdom.

**Única precaución:** no cerrar desde acá contratos que interfieran con las cinco decisiones todavía abiertas de identidad/push, ni inventar un manifest de binarios antes de que exista un consumidor real del lado de Metamorph. Si aparece una propuesta que afecte el contrato operativo ya descripto, se coordina con los works BACKEND y BATCAVE antes de incorporarla.

---

*Referencia cruzada: `Backend_Cloudflare_Arquitectura_v0_1.md` §9 (primeros pasos — ahora en ejecución por el work BACKEND de Codex), `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md` §11 (las cinco decisiones abiertas mencionadas arriba), `CODEX_Backend_Kickoff_v0_1.md` (brief original que dio origen a estos dos works).*
