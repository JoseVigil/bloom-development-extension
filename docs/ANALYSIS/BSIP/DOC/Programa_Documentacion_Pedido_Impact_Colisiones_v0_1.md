# Pedido a Impact — Colisiones de escritura entre documentaciones

**Para:** la sesión de trabajo de Impact (`installer/impact/`).
**De:** programa de documentación, con autoridad de José Vigil.
**Fecha:** 2026-11-05
**Naturaleza:** siete preguntas para contestar directamente. **No es un pedido de implementación.** No cambies código ni el contrato `impact/1`. Respetá la frontera de `README.md` y `AGENTS.md`.

---

## 1. Contexto

- José fijó que cada intent deja detrás un intent `doc` que sanea lo que ese intent hizo.
- Cada `doc` documenta solo lo que cambió el intent anterior.
- Hoy los intents no corren en paralelo. José decidió que, si algún día corren en paralelo, **Impact verifica las colisiones de escritura entre documentaciones**: dos `doc` que escriben o mueven los mismos documentos.
- Ese día todavía no llegó. Las respuestas sirven para saber qué haría falta, y de quién.

Lo que el programa relevó de Impact (corregilo si algo está mal):

| Hecho | Cita |
|---|---|
| "Impact evaluates supplied facts and criterion. It does not acquire facts, resolve Gravity, establish authority, execute actions, maintain caller state, monitor, or start a server loop" | `README.md` |
| "Do not implement Monitor, Winston, authority, scheduling or execution here" | `AGENTS.md` |
| Tres evaluadores: `coexistence`, `preservation` y `compliance`, sobre `gravity-criterion/1` y `gravity-expr/0.1` | `internal/evaluation/evaluate.go:38` |
| Un tipo o versión de pregunta desconocido devuelve una evaluación indeterminada | `evaluate.go:76-80` |
| Los tres evaluadores rechazan `payload` y `parameters` | `evaluate.go:103-105` |
| Los hechos son numéricos: `Fact{ref, metric, unit, value float64, observedAt}` | `internal/contracts/contract.go:27-33` |
| El contexto lleva un solo `scope`, como texto | `contract.go:15-21` |
| Impact no lee archivos ni descubre Mandates activos | `README.md` |
| La colisión de `scope_paths` entre Mandates sin ancestría la resuelve solo Nucleus (INVARIANT-ARB-001) | `NUCLEUS_API_Contracts_Consolidado_v0_1.md` §4.2 (Project BTIPS) |

## 2. Preguntas

Para cada una: respuesta directa; cita de código o de documento; y, si algo no está definido, "no definido" con el dueño probable. **No propongas diseño.** Si la respuesta es "eso no le corresponde a Impact", decilo y explicá por qué según su frontera.

1. **Frontera.** Verificar si dos documentaciones escriben los mismos documentos, ¿cabe en un tipo de pregunta de Impact, o queda fuera de "evalúa hechos y criterios que le dan"?
2. **Forma de los hechos.** Hoy los hechos son números y los evaluadores no aceptan `payload`. Para esta pregunta harían falta conjuntos de documentos o de rutas. ¿El contrato `impact/1` admite eso? Si no lo admite, ¿hace falta una versión nueva del contrato o alcanza con un evaluador nuevo?
3. **Identidad del documento.** ¿Con qué identidad trabajaría Impact: la ruta, el `asset_id` de Genes o la identidad del registro documental gobernado aparte (que José eligió como base y todavía no existe)? ¿Qué pasa si dos corridas nombran el mismo documento con identidades distintas, por ejemplo, antes y después de un renombre?
4. **Momento.** ¿La colisión se evaluaría sobre lo que cada `doc` **planea** escribir, sobre lo que **escribió**, o sobre las dos cosas? ¿Cambia la respuesta de Impact según el momento?
5. **Datos faltantes.** Si falta el dato de una de las corridas (no se sabe qué documentos toca), ¿Impact devuelve indeterminado, como hoy con un tipo desconocido, o hace otra cosa? ¿Cómo lo reflejan `coverage` e `indeterminacy`?
6. **Relación con el arbitraje.** Si Impact encuentra una colisión, ¿qué es su salida: evidencia para que otro resuelva, o algo más? ¿Cómo se relaciona con el arbitraje que INVARIANT-ARB-001 reserva a Nucleus?
7. **Quién pide la evaluación.** ¿Quién arma la pregunta y le pasa los hechos: el Mandate, Nucleus o el propio `doc`? Impact no descubre corridas activas ni guarda estado. ¿Qué tendría que saber y aportar quien llama?

## 3. Formato de la respuesta

Un documento con las siete respuestas numeradas. Al final, una tabla de dos columnas:
- lo que tendría que aportar Impact;
- lo que tendría que aportar quien llama.

Cada fila con su cita o con "no definido".
