# Cierre — Investigación de Auditoría de Estado de UI, puente hacia el cowork de Core UI Redesign v1.0

**Basado en:** `Encargo_Investigacion_Auditoria_Estado_UI_Puente_CoreUIRedesign_v0_1.md` (`docs/ANALYSIS/UI/`).
**Entregable:** `Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` (`docs/ANALYSIS/UI/`).
**Ejecutado por:** cowork de investigación de sólo lectura, 2026-09-20.
**Verificado:** lectura directa del repositorio real (`/home/jose/repos/bloom-development-extension`) vía
herramientas de dispositivo remoto (`device_list_dir`, `device_stage_files`). La shell remota
(`device_bash`) no llegó a inicializar durante toda la sesión, así que no se pudo confirmar el HEAD exacto de
git ni correr `grep` recursivo sobre el repo completo — la cobertura de código se limitó a los directorios que
el encargo señala explícitamente (`src/ui`, `webview/app`) más los archivos que esos mismos llevaron a
inspeccionar por referencia cruzada (imports, comentarios). No se detectó ningún indicio, en lo relevado, de
que exista otro componente `GenesisTab`/`StandardMandateTab`/`MandateTab` fuera de los ya citados.

---

## §0 — Qué se pidió y qué se entregó

El encargo pedía un documento único de auditoría que respondiera, con evidencia archivo+símbolo y sin resolver
nada de diseño: qué vistas de UI existen y en qué estado, qué decisiones están ratificadas vs. abiertas, qué
componentes son reutilizables vs. datos simulados, qué dependencias de backend no están resueltas, y el estado
real de D-25 (el único punto sin documento previo, a relevar directamente en código).

Se entregó `Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md`, con las cinco secciones pedidas por §2 del
encargo, más dos hallazgos que el encargo no anticipaba y que condicionan cómo debe leerse el resto del
documento:

1. **D-25 ya no es una pregunta abierta.** El código (`MandateTab.svelte`, `mandateStore.ts`, comentarios de
   cabecera en ambos) muestra que la unificación Genesis/StandardMandate en un único `MandateTab` orientado
   por `mandateType` ya está implementada y en producción — sin que exista ningún Investigación/Propuesta/
   Encargo/Cierre que la respalde formalmente; vive enteramente como comentarios de código.
2. **El hilo Location/Domain/Gene que cita el encargo (§1.2, basado en `v0_3_Addendum`) está superado.** En el
   repo real no existen los tres documentos que el encargo nombra (`v0_1_PARCIAL`, `v0_2_Continuacion`,
   `v0_3_Addendum`) — existe en su lugar `ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`, fechado un día después,
   ya cerrado y aprobado por José, que caracteriza el gap de `ProjectID` de forma distinta (no es ausencia de
   productor, es falta de correspondencia/continuidad entre representaciones ya existentes).

Ambos hallazgos están documentados con evidencia y trazabilidad completa en el cuerpo del entregable (§0, §3 y
§5 de ese documento) — no se resolvieron ni se corrigieron por cuenta propia, solo se señalan, tal como pide
el encargo (§3, fuera de alcance).

## §1 — Qué NO se hizo (cumplimiento del §3 del encargo)

- Cero cambios de código. Ningún archivo del repositorio fue modificado.
- Ninguna de las tres tensiones del Research Brief de Orrery (metáfora única vs. contenedor de vistas; Gravity
  literal vs. lenguaje humano; vista continua vs. vistas separadas) fue resuelta por esta auditoría — quedan
  registradas como abiertas en el entregable §2.2, con la posición (no ratificada) que toma el research citado
  como evidencia adjunta, no como resolución.
- El gap de `ProjectID`/Location y el resto de los gaps de backend encontrados (coherencia de Organization,
  identidad humana de captura, contrato físico de Location, rol `Architect` faltante) quedan registrados como
  dependencias fuera de alcance de UI (§4 del entregable) — ninguno se tocó ni se intentó resolver.
- Ninguna decisión ya ratificada del corpus (SESSION como corrida de `MandateExecutionWorkflow`, Alternativa A
  de postulación de Postura, etc.) fue reabierta.

## §2 — Estado del corpus después de esta auditoría

El corpus original del encargo (§1) queda relevado en su totalidad, con dos correcciones de ubicación/vigencia
documental registradas en el entregable (§3): los tres documentos de Location citados por el encargo fueron
reemplazados en el repo por su cierre consolidado (`v1.1`), y no existía ningún documento previo para D-25 —
tal como el propio encargo anticipaba — por lo que esa sección se generó enteramente por relevamiento de
código, según pedía §2.5 del encargo.

## §3 — Continuidad

Con `Investigacion_Auditoria_Estado_UI_Consolidada_v0_1.md` en mano, el cowork de Core UI Redesign puede
arrancar su propio ciclo Investigación → Propuesta → Encargo → Implementación → Cierre, heredando:

- D-25 como decisión ya tomada e implementada (con los gaps puntuales de §5.3 de la auditoría), no como
  pregunta a resolver.
- Las tres tensiones de Orrery como preguntas genuinamente abiertas, con la posición del research disponible
  como insumo, no como respuesta.
- El estado real (vigente al 2026-09-15, `v1.1`) del gap de Location/`ProjectID`, en vez del resumen desactualizado
  que circulaba en el encargo.
- Un inventario completo de qué es patrón reutilizable y qué es dato simulado, para no arrastrar el prototipo
  de Orrery como si sus datos fueran reales.

No se abre ningún nuevo cowork desde este documento — eso queda a criterio de José.
