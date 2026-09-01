# Mandate Server — Compatibilidad de Gravity (Introducción v0.1)

**Tipo:** Apertura de investigación de frontera — continuación conceptual de `Investigacion_Gravity_Mandate_Compatibility_v0_1.md` (mismo directorio), ahora enmarcada explícitamente como responsabilidad del Mandate Server y delimitada contra el boundary operativo Backend↔Batcave que corre en Codex.
**Estado:** v0.1 — introducción y encuadre. Sin diseño de algoritmo todavía.
**Fecha:** 2026-09-01
**Autor de la introducción:** Jose.
**Corte de alcance:** este tema es explícitamente distinto del handshake Backend↔Batcave (ver `CODEX_Frontera_Backend_Batcave_v0_1.md`, `docs/BACKEND`) — no comparte endpoints, payloads ni ciclo de vida con él, aunque eventualmente pueda reutilizar identidad organizacional y transporte de credenciales del mismo modo que Wisdom lo hace.

> **Nota de terminología en tránsito (2026-09-01):** hay un work específico disparado en Codex para renombrar integralmente `GravityRule` → `GravityPosture` (cambio transversal de nomenclatura, no funcional, con impacto potencial en contratos de backend, Backgate, persistencia y APIs). Jose comunicará el alcance exacto cuando esté validado. Como este documento define la "representación mínima de Gravity" que debería viajar con un Mandate en términos de `gravityRules[]`, el rename impactará directamente su vocabulario cuando se coordine — no se adelanta acá.

---

## 0. Introducción, tal como la planteó Jose

En Cognituum, cada proyecto y cada organización pueden mantener localmente sus propios Mandates y, con ellos, las posturas y postulados de Gravity que gobiernan su ejecución. Esa soberanía local implica una limitación física inevitable: dos repositorios independientes no pueden conocer ni evaluar entre sí sus respectivos criterios. El Mandate Server, por ser el punto central donde los Mandates se publican, reciben, distribuyen y eventualmente reutilizan, debe convertirse también en el lugar donde pueda realizarse la evaluación de compatibilidad entre sus posturas de Gravity antes de que un Mandate atraviese una frontera organizacional o sea adoptado en un contexto distinto del que lo originó. Esto no significa trasladar Gravity ni la autoridad de decisión al servidor: el servidor compara; la organización conserva la soberanía para decidir. El trabajo que necesitamos abrir consiste en modular esa capacidad de comparación: determinar qué representación mínima de Gravity necesita acompañar a un Mandate, cómo se contrastan dos conjuntos de posturas, cómo se expresan compatibilidad, conflicto, precedencia o necesidad de revisión, y qué resultado debe regresar al Nucleus correspondiente para que la decisión final siga ocurriendo bajo su autoridad. La arquitectura debe preservar el boundary ya fijado: Gravity gobierna; GravityGraph preserva el criterio y su linaje; el Mandate Server aporta el espacio de comparación cuando los contextos locales ya no pueden hacerlo por sí mismos.

---

## 1. Qué ya existe — base heredable, sin rediseñar

De `Investigacion_Gravity_Mandate_Compatibility_v0_1.md` (mismo directorio, v0.1 del 2026-08-29):

- El principio *"el servidor es la única autoridad, nunca el cliente"* ya está fijado y repetido en toda la familia Gravity — es exactamente lo que pide esta introducción, sin necesidad de justificarlo de nuevo (investigación §4).
- El patrón de arbitraje de Nucleus (árbitro único + jerarquía prioridad explícita → escalación → pausa conservadora con notificación humana) es un esqueleto algorítmico reutilizable, aunque hoy resuelve colisión de `scope_paths` entre Mandates ya activos, no contenido semántico de posturas de origen independiente (investigación §3, candidato 2).
- La distinción `predicateComputable` de la gramática ya separa qué posturas son mecánicamente comparables (`threshold`/`priority`/`escalation`) de las que exigen siempre juicio humano (`constraint`/`evidence`/`exception`) — aplicable directamente a decidir qué parte de un contraste puede resolverse solo y cuál debe escalar a revisión humana (investigación §7, gap #6).
- El Mandate Package ya transporta `mandate.json` completo al momento de instalar — el sustrato de datos está más cerca de existir que el algoritmo de comparación en sí (investigación, conclusión, punto 4).
- La herencia R-17 a R-21 confirma que el problema de Jose es estructuralmente distinto de la herencia vertical intra-linaje ya resuelta: esa herencia asume un padre único ya conocido en el grafo; este trabajo parte de un Mandate que, al momento de importarse, no tiene ninguna relación de parentesco declarada con la organización compradora (investigación §2).

De `Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md` (`docs/ANAYSIS/GRAVITY/GRAFO`, cierre del 2026-09-01):

- **Gravity** queda fijado como el sistema de gobernanza del criterio en su totalidad — posturas, postulados, `gravityRules[]`, resolución por turno, arbitraje, masa, promoción. Es exactamente lo que el Mandate Server necesita comparar.
- **`GravityGraph`** queda fijado como la estructura persistida que preserva Criterion + el linaje ya ratificado (incluida la arista `PROMOTED_FROM`) — y es local a cada organización/Nucleus. Este cierre no le da ningún mecanismo para cruzar frontera organizacional ni para compararse contra el grafo de otra organización.
- Consecuencia directa para este tema: lo que viaja con un Mandate para comparación **no puede ser el `GravityGraph` completo** — hacerlo rompería la soberanía local que ese mismo cierre acaba de fijar como invariante. Tiene que ser una representación más chica, todavía sin definir, de las posturas/`gravityRules[]` relevantes del Mandate. Esa definición es, con otras palabras, la primera pregunta que abre la introducción de Jose — el cierre de boundary la confirma desde un ángulo distinto e independiente.

## 2. Qué es nuevo — el encuadre que abre Jose

Cuatro preguntas explícitas, sin resolver todavía:

1. **Representación mínima de Gravity.** Qué subconjunto de posturas/`gravityRules[]` de un Mandate necesita viajar para que el servidor pueda compararlo, sin requerir el `GravityGraph` completo de la organización de origen.
2. **Algoritmo de contraste.** Cómo se comparan dos conjuntos de posturas de procedencia independiente — el gap más grande de la investigación previa (§3, gap #3): no existe hoy ni como algoritmo implementado, ni como propuesta sin ratificar, ni siquiera como gap nombrado en las listas de pendientes existentes.
3. **Vocabulario de resultado.** Cómo se expresan compatibilidad, conflicto, precedencia o necesidad de revisión — distinto del vocabulario ya diseñado para resolver un turno de conversación (rechazar/señalar/reinterpretar/escalar/excepción/proponer cambio), que nunca fue pensado para este caso (investigación §7, gap #6).
4. **Contrato de salida hacia Nucleus.** Qué resultado exacto debe recibir el Nucleus correspondiente para que la decisión final de adopción siga ocurriendo bajo su autoridad — el servidor compara, nunca decide.

## 3. Invariante que este trabajo debe preservar

Tal como lo fija Jose: Gravity gobierna; GravityGraph preserva el criterio y su linaje; el Mandate Server aporta el espacio de comparación cuando los contextos locales ya no pueden hacerlo por sí mismos. El servidor compara — la organización conserva la soberanía de decidir. Trasladar Gravity o la autoridad de decisión al servidor está explícitamente descartado.

## 4. Fuera de alcance de este documento y de este tema

- El handshake Backend↔Batcave y sus cinco decisiones abiertas — ver `CODEX_Frontera_Backend_Batcave_v0_1.md`, `docs/BACKEND`.
- El protocolo operativo de actualización (`GET /v1/manifest`, ETag/304, descarga de `ions[]`) — mismo documento de referencia.
- El diseño interno de Wisdom/adopción de Mandate Package — track separado, documentos en `docs/WISDOM/`.
- Los cinco gaps abiertos en `Cierre_Boundary_Gravity_GravityGraph_Semantics_Provenance_v0_1.md` §4 (staging de promoción, shape de `promotedTo`, quién inicia una promoción, etc.) — ese documento se cita acá solo como referencia de nomenclatura ya cerrada, no se reabre.

---

*Próximo paso sugerido, no decidido: encarar en orden los dos primeros puntos de §2 — la representación mínima de Gravity que acompaña a un Mandate, y el vocabulario de resultado del contraste — antes de tocar el algoritmo de comparación en sí, que depende de ambos.*
