# REVISIÓN-DA-001 — Auditoría de consistencia: WBS-DA-001 vs RFC-DA-001

| Campo | Valor |
|---|---|
| **Alcance** | Revisión cruzada de `WBS-DA-001-Plan-de-Trabajo.md` y `RFC-DA-001-DebuggerAdapter.md` (v0.1) |
| **Fecha** | 2026-09-20 |
| **Tipo** | Revisión de consistencia interna — no evalúa corrección técnica de las APIs CDP citadas (ya vienen marcadas `[V]/[I]/[PoC]` por el propio RFC) |
| **Estado** | Para discusión — no bloquea el inicio de Fase 0 |
| **Documentos revisados** | `RFC-DA-001-DebuggerAdapter.md`, `WBS-DA-001-Plan-de-Trabajo.md` |

## 0. Resumen

Ambos documentos son consistentes en lo grueso: los 43 tickets del WBS suman exactamente los subtotales por fase (13 + 35 + 24 + 46 + 10 = 128 d-p) y las referencias cruzadas `§n`/`DA-n`/`H-n`/`R-n` en general apuntan al lugar correcto. Esta revisión no encontró errores que invaliden el diseño, pero sí seis puntos de secuenciación, cobertura de gates y prioridad que conviene resolver antes de convertir el WBS en tickets ejecutables, más dos observaciones menores.

## 1. Hallazgos

### R1 — El diagrama de dependencias (WBS §2) omite enlaces que los propios tickets declaran

DA-1-07 y DA-3-15 listan `DA-0-05` como dependencia en su campo "Depende de", pero el diagrama ASCII de §2 solo dibuja la flecha `DA-0-05 → DA-1-08`. Un lector que planifique mirando solo el diagrama puede subestimar cuánto repercute un hallazgo tardío de DA-0-05 (autenticación de `:5678`, semántica de `ACTUATOR_READY`, enrutamiento de `SIGNAL`/`PAGE_CHANGED`) sobre Fase 3C.

**Sugerencia:** actualizar el diagrama de §2 para incluir las flechas `DA-0-05 → DA-1-07` y `DA-0-05 → DA-3-15`, o agregar una nota aclarando que el diagrama es de grano grueso y no reemplaza el campo "Depende de" de cada ticket.

### R2 — Un supuesto de seguridad central de `DOM_WATCH` se valida después del gate de seguridad, no antes

La leyenda del RFC define `[PoC]` como "hipótesis que debe validarse empíricamente en la Fase 0 antes de comprometer el diseño". Sin embargo, RFC §8.4 marca como `[PoC]` el supuesto de que el binding de `Runtime.addBinding` queda acotado al mundo aislado ("*Acotado a mundo aislado: [PoC] en DA-3-13*"), y esa validación ocurre en DA-3-13 (Fase 3C) — después de que DA-2-07 (el gate de seguridad, Fase 2) ya fue aprobado. DA-2-07 dice explícitamente que recorre T1–T8 incluyendo "spoof del binding de `SIGNAL`", pero el mecanismo de watch/binding todavía no existe como implementación productiva en ese momento.

**Pregunta abierta para el equipo:** ¿contra qué exactamente prueba DA-2-07 el spoofing de binding si `DOM_WATCH` no está implementado hasta DA-3-13? Si es un prototipo/harness ad-hoc, documentarlo; si no existe, considerar que DA-3-13 requiera sign-off explícito de `SEC` sobre T3 (no solo la revisión de código genérica de la Definición de Hecho).

### R3 — Ola 3C no tiene ticket de gate propio, a diferencia de 3A y 3B

DA-3-06 cierra la ola 3A y DA-3-11 cierra la 3B, cada uno con criterios de salida explícitos (canary, shadow limpio, cero violaciones). No existe un ticket equivalente para 3C (`DOM_UPLOAD`, `DOM_WATCH`, `DOM_WATCH_URL`, `SIGNAL`/`PAGE_CHANGED`) — la ola con mayor superficie de riesgo (T5 lectura de archivos locales, T3 spoof de binding). A nivel de dependencias formales, DA-4-01 (rollout) solo depende de `DA-3-06`, por lo que el grafo de dependencias tal como está escrito no impide que el trabajo de rollout de Fase 4 arranque sin que 3B/3C estén terminadas; DA-4-02 se apoya únicamente en la referencia informal a "criterios de retiro (RFC §11)".

**Sugerencia:** agregar un ticket "Gate de la ola 3C" (análogo a DA-3-06/DA-3-11) y hacer que DA-4-02 dependa explícitamente de él.

### R4 — `deny_and_allow` (DA-2-08) queda fuera del gate de seguridad pese a que el RFC lo recomienda como modo de producción

RFC §7.2 recomienda `deny_and_allow` en producción porque "una denylist nunca podrá enumerar todas las herramientas de IA", y el riesgo R-03 ("Denylist incompleta") está calificado Alta probabilidad / Alto impacto, con mitigación explícita "Modo `deny_and_allow` en producción". Sin embargo, DA-2-08 es P1 (no P0) y DA-2-07 —el gate que habilita Fase 3— solo depende de DA-2-03 y DA-2-05, no de DA-2-08. Tal como está escrito el plan, se podría cruzar el gate de seguridad y empezar a migrar comandos a producción sin la allowlist que el propio RFC considera necesaria para mitigar su riesgo más probable y más grave.

**Sugerencia:** o se sube DA-2-08 a P0 y se agrega como dependencia de DA-2-07, o se documenta explícitamente por qué `deny_only` es aceptable durante la migración inicial (p. ej. si el canary de Fase 3 solo corre en hosts ya cubiertos por la denylist).

### R5 — DA-0-06 depende formalmente de los cinco PoC de Fase 0, pero sus criterios de aceptación solo usan tres

El Go/No-Go de DA-0-06 se basa en ADR-S, ADR-U y ADR-D, que mapean a DA-0-01, DA-0-02 y DA-0-03. DA-0-04 (frames/OOPIF, P1, "adicional") y DA-0-05 (auditoría de canal, P0) no están atados a ningún ADR ni criterio de Go/No-Go explícito, pero el campo "Depende de" de DA-0-06 dice `DA-0-01…05` sin excepción. Si DA-0-04 se atrasa —tiene prioridad menor que los otros tres PoC— bloquea formalmente la decisión de Fase 0 aunque su resultado no figure entre los criterios de salida.

**Sugerencia:** aclarar si DA-0-04 es realmente bloqueante del Go/No-Go o si puede completarse en paralelo con el arranque de Fase 1 (su output solo condiciona el alcance de `FrameResolver` en DA-3-02, no las tres decisiones ADR).

### R6 — La estrategia S4 aparece en el RFC pero desaparece del plan de trabajo

RFC §8.3 define cuatro estrategias para el conflicto slave-mode/trusted-input (S1–S4, incluyendo S4 "attended mode" sin bloqueo del usuario), pero la matriz de PoC-1 (DA-0-01) solo prueba Base/S1/S2/S3, y el criterio de No-Go de DA-0-06 solo contempla "si ninguna estrategia S1–S3 permite clic trusted... y S3 no cubre los flujos requeridos". S4 no se prueba ni se descarta explícitamente en ningún ticket.

**Sugerencia:** decidir si S4 es una red de contención real (y entonces agregarla a la matriz de DA-0-01 y al criterio de Go/No-Go de DA-0-06) o si se descarta de antemano por algún motivo que valga la pena dejar escrito en el RFC.

## 2. Observaciones menores

- **DA-3-03/04/05 no repiten `DA-2-07`** en su propio campo "Depende de", aunque la prosa de apertura de Fase 3 lo establece como prerrequisito general de toda la fase. Alguien que lea un ticket suelto (en lugar del encabezado de fase) puede no notar que también necesita el gate de seguridad aprobado.
- **Las decisiones de Gobernanza del Anexo B** (Q1, Q6, Q7, Q9) no están modeladas como dependencias duras de ningún ticket — son prerrequisitos "blandos" documentados solo en prosa. Una herramienta de gestión que arme el cronograma únicamente a partir del grafo de dependencias no impediría, por ejemplo, que DA-2-02 arranque antes de que Gobernanza resuelva Q1 sobre el contenido de Tier B/C, con el consiguiente riesgo de rehacer trabajo.

## 3. Lo que se verificó y cerró bien

- Conteo de tickets por fase (6+10+8+15+4 = 43) y esfuerzo por fase (13/35/24/46/10 = 128 d-p): correcto en ambos casos.
- Límites de tamaño de Native Messaging (1 MB host→Chrome, 64 MiB Chrome→host) citados de forma consistente en RFC §5.2/§14 y en DA-1-02/DA-0-02/DA-3-10.
- Mapeo `[PoC]` → ticket de Fase 0 para los puntos de fricción explícitamente etiquetados en §6.2, §6.2(4), §8.2(4) y la mayoría de §8.3: todos tienen su contraparte en DA-0-01/02/03/04 (con la excepción de R2 arriba).
- Encabezados de ambos documentos (versión v0.1, fecha 2026-09-19, referencia cruzada al "documento hermano"): consistentes.

---
*Generado a pedido de José Vigil como insumo de discusión antes de iniciar la Fase 0. No reemplaza la sesión de estimación conjunta ni el sign-off de Gobernanza/SEC previstos en el propio WBS.*
