# Gravity — Investigación de Compatibilidad de Mandates al Instalar (v0.1)

**Tipo:** Investigación pura (no propone implementación) — insumo conceptual para el cowork Cloud, separado de los works operativos BACKEND/BATCAVE que corren en Codex.
**Estado:** Borrador v0.1. Actualizado 2026-09-01: terminología migrada a Posture y párrafos de "estado real" corregidos contra la primera implementación real de Gravity (ver notas al pie del encabezado).
**Fecha:** 2026-08-29
**Encargo explícito de Jose:** *"Eso impone un conjunto de reglas por cada mandate que deben ser compatibilizadas cada vez que uno importa e instala un mandate. Esa compatibilidad tiene que chequearse al momento de hacer la instalación de un mandate y no puede hacerse local. Tendría que haber un mecanismo en el servidor que haga ese match para saber si un mandate es compatible con mis posturas, con las de un CTO. [...] Si yo voy a instalar un mandate, tiene que estar contemplado que en mi postura como CTO de una empresa están todas contempladas en el mandate. Si hay una postura que va en contra de mis principios debería informarme. [...] Porque si no se hace en el servidor hay que bajar cada mandate al disco, verificar si es compatible, y eso va a ser un overhead para el ingeniero que no quiero."*
**Método:** agente de investigación con lectura completa de 7 documentos núcleo de Gravity/Orbital/Mandate y consulta dirigida sobre 5 documentos adicionales (incluyendo, por hallazgo propio del agente, el Mandate Package Spec y el Governance Ownership Spec, decisivos para responder). Cero implementación propuesta; toda afirmación citada contra archivo y sección.

> **Nota de terminología (migrada, 2026-09-01):** el rename transversal `GravityRule` → `GravityPosture` (y derivados: `gravityRules[]`→`gravityPostures[]`, `ruleId`→`postureId`, `inheritedGravityRules[]`→`inheritedGravityPostures[]`) ya está validado e implementado end-to-end en Go/TypeScript — confirmado por Codex el 2026-09-01. Este documento fue actualizado para usar exclusivamente `GravityPosture`/`gravityPostures[]`. Las citas de sección de los documentos fuente originales pueden seguir usando `Rule` en su propio texto; esta investigación adopta la nomenclatura vigente sin reescribir las fuentes citadas.
>
> **Nota de estado (2026-09-01):** Gravity dejó de ser únicamente diseño documental — existe una primera implementación real en Go bajo `installer/nucleus/internal/gravity/`. Los párrafos de "Estado real" de este documento fueron actualizados donde correspondía; el resto de la investigación (qué mecanismos existen o no para el matching cross-organizacional que pide Jose) sigue vigente sin cambios, porque nada de lo implementado hasta ahora resuelve ese problema todavía.

---

## 1. Modelo de datos de una Postura/Gravity Rule

✅ **Confirmado, documentado en capas sucesivas.** Cada `gravityPostures[]` tiene `postureId`, `primitive`, `expression`, `appliesTo[]`, `authoredBy`, `verifiable`, `promotable`, `promotedTo`, `status` (Mandate Universal Schema v1.2.0 §2/§5). El nodo contenedor (`GravityNode`) tiene `nodeType: NUCLEUS|ORGANIZATION|PROJECT|MANDATE|SESSION` — la jerarquía de 5 niveles ya conocida. `signedBy` es un objeto estructurado `{actorId, role, roleBasis}`. La gramática (EBNF, 6 primitivos: `constraint`, `threshold`, `evidence`, `priority`, `escalation`, `exception`) define un AST tipado con la propiedad `predicateComputable` — solo `threshold`/`priority`/`escalation` son mecánicamente evaluables; `constraint`/`evidence`/`exception` exigen siempre juicio humano por diseño, nunca se aplanan a "si A entonces B".

**Estado real (actualizado 2026-09-01):** dejó de ser solo diseño. Existe implementación real en Go bajo `installer/nucleus/internal/gravity/`: persistencia filesystem del `GravityGraph` (`.bloom/.nucleus-{organization}/.gravity/`, nodos JSON, escritura atómica, control CAS vía `nodeVersion`), `ResolveActive` con caché exclusivamente estructural de la espina, y `Parse(expression string) (GravityExpressionAST, error)` ya implementado en Go con parser advisory equivalente en TypeScript, ambos generados desde una única gramática ANTLR4 (`.g4`). Lo que sigue sin conectar: la validación de firma descrita en §6.4 sigue siendo contrato documental (no hay flujo productivo de firma de nodos Gravity todavía), y `Store.CreateNode` falla cerrado para nodos `ORGANIZATION`/`NUCLEUS` hasta que estén conectados `cor` y el módulo de Authorization — confirmación por código real, no ya por inferencia (actualización transversal de Codex, 2026-09-01).

---

## 2. Herencia R-17 a R-21 — ¿es la misma "compatibilidad" que pide Jose?

🟡 **Parcial — mismo vocabulario, problema estructuralmente distinto.**

R-17 a R-21 resuelven herencia **vertical, dentro de un mismo linaje ya conocido en el momento de creación del sub-Mandate**: hay exactamente un padre (o abuelo, profundidad máxima 2), `inheritedGravityPostures[]` se puebla automáticamente, y la validación de no-contradicción (R-18) compara contra ese único padre ya conocido.

Lo que pide Jose es distinto en un punto estructural: el Mandate a instalar **no tiene, en el momento del import, ninguna relación de parentesco declarada** con la organización compradora. El propio corpus de Gravity excluye explícitamente "cualquier forma de coordinación horizontal entre Mandates sin relación de parentesco" del mecanismo ya resuelto — pero ese mecanismo excluido asume Mandates que ya coexisten en el mismo grafo, no uno que todavía no forma parte de él. **R-17..R-21 no es el mecanismo que Jose pide**, aunque es el más cercano en espíritu.

---

## 3. ¿Existe ya un algoritmo de matching/detección de conflicto entre dos conjuntos de reglas de origen independiente?

❌ **No existe — y está explícitamente diferido en cada documento que roza el tema.**

Se descartaron cuatro candidatos:
1. **R-18** — ya cubierto en §2, opera sobre padre único conocido.
2. **Arbitraje de Nucleus** (`ArbitrationEvent`) — el mecanismo de "conflicto" más sofisticado que existe, pero resuelve **superposición de `scope_paths` (territorio de archivos) entre Mandates ya activos en el mismo grafo**, nunca contenido semántico de posturas de un Mandate recién importado. Sí fija un patrón reutilizable: "Nucleus como árbitro único, nunca los pares".
3. **La gramática/AST de Gravity** — diseñada para ser consumida por un futuro comparador (campos `collisionClass`/`triggerClass` existen "precisamente para ese consumo"), pero el propio documento aclara que el algoritmo comparador en sí "queda fuera" de su alcance.
4. **El flujo real de instalación (`nucleus mandate install`, Mandate Package Spec §9)** — hallazgo más concluyente: tiene 7 pasos documentados con detalle operativo (verificación de integridad, `requiredIntentTypes`, rebind de identidad, hidratación cognitiva, Gene Blueprints, dependencias, firma final) y **en ninguno de ellos se lee, compara o valida `governance.gravityRules[]` contra las posturas del comprador.**

**Conclusión:** el mecanismo que Jose describe no existe en ningún documento del proyecto, ni como algoritmo, ni como paso de flujo, ni como propuesta sin ratificar. Es terreno de diseño completamente nuevo.

---

## 4. ¿Está definido DÓNDE corre la validación (cliente vs. servidor)?

✅ **Confirmado como principio arquitectónico general — reutilizable, pero hoy resuelve un problema más chico que el de Jose.**

El corpus fija, repetida y explícitamente, que **Nucleus (servidor) es la única autoridad de parseo/validación de Gravity, nunca el cliente**: "ningún `GravityNode.gravityRules[]` persistido puede contener una `expression` que no parsee según el parser autoritativo de Nucleus" (invariante formal); el parser de Conductor Workspace Core es "advisory, nunca autoridad"; "ningún conflicto de superposición se resuelve por negociación entre pares — la resolución es exclusivamente de Nucleus"; principio rector citado en cascada: **"la autoridad nunca se distribuye, aunque el acceso sí."**

**Esto significa que el requisito de Jose ("la comparativa tiene que hacerse en el servidor") ya es, de hecho, un principio arquitectónico ya establecido en toda la familia Gravity** — no hay que convencer al sistema de que la validación debe vivir en Nucleus.

**Lo que no está resuelto:** todo lo anterior aplica a validar **una postura contra su propio nodo/turno**, nunca a comparar **dos grafos de posturas de origen independiente en el momento de instalar un Mandate**. Y aunque el parser (`gravity.Parse`) ya existe en código real (actualización 2026-09-01), el mecanismo completo de parsear + validar + firmar una postura todavía no está conectado en producción: la Activity de Temporal que resuelve Gravity por turno (`resolveActiveGravityActivity`) está implementada y registrada en el worker de Mandates, pero `MandateExecutionWorkflow` todavía no la invoca — la capacidad existe, pero no cambia todavía el comportamiento productivo por turno.

---

## 5. Nucleus API Contracts — ¿hay un endpoint de compatibilidad ya definido?

❌ **No existe. Ninguno de los endpoints documentados cumple esa función.**

| Endpoint/bloque | Qué hace | ¿Es lo que pide Jose? |
|---|---|---|
| `validate_and_sign` | Firma/rechaza un turno dentro de un Mandate **ya instalado** | No |
| `resolve_active_gravity` | Devuelve reglas vigentes relevantes al turno actual (nunca el grafo completo) | No |
| `ArbitrationEvent` | Conflicto de territorio (`scope_paths`) entre Mandates **ya activos** | No |
| "Matriz de compatibilidad" del catálogo | Compatibilidad de **versión de schema/API** (BTIPS≥v6.1, MANDATE≥v1.2.0, etc.) | No — es un eje de versionado, nombrado "compatibilidad" pero de naturaleza distinta; vale la pena no confundirlo como evidencia de que el mecanismo ya existe |

La propia auditoría contra código real confirma que incluso los endpoints documentados que **no** resuelven el problema de Jose todavía no existen en código ("el grafo no tiene ningún correlato real"; "Gravity en su totalidad no tiene persistencia hoy"). El gap de "endpoint de compatibilidad de instalación" **no aparece nombrado en ninguna lista de pendientes** — no es que esté reconocido y pospuesto, es que nadie lo identificó todavía como gap.

---

## 6. Masa como factor de desempate en un conflicto

🟡 **Parcial — Masa existe como métrica de trazabilidad/UI, explícitamente descartada como criterio automático de desempate.**

Masa se calcula por nivel base + verificable + promovida (tope 3) y su función es mostrarle al ingeniero *por qué* pesa lo que pesa (tooltip), no decidir automáticamente. El orden real de resolución de un conflicto arbitrado es: (1) regla de `priority` ya declarada explícitamente y verificable → se aplica; (2) regla de `escalation` → intervención humana; (3) default: pausa conservadora + notificación humana. Texto explícito: **"nunca elige el más importante sin una regla o un humano que lo determine."**

---

## 7. Rol del "CTO" en Gravity

🟡 **Parcial — el rol análogo existe, pero "CTO" no es un término del sistema, y su verificación en código está confirmada como no-implementada.**

El modelo de roles vigente es `master`/`architect`/`specialist` (`.ownership.json`), con `architect` **no existente en el modelo real hoy** (solo `master`/`specialist` implementados). Gravity mapea su autoridad de firma sobre ese mismo modelo: nivel `ORGANIZATION` solo vía `cor` por operador humano con autoridad organizacional; nivel `PROJECT` hoy solo `master`. El análogo funcional más cercano a "postura del CTO" sería una postura de nivel `ORGANIZATION` firmada por `master`.

**Hallazgo crítico de brecha:** la verificación de rol en código real (`RequireAtLeast()`/`RequireMaster()`) está confirmada como **stub que retorna éxito incondicional**, sin conexión real a `.ownership.json`. Incluso el mecanismo de autorización por rol que sí está diseñado no se verifica de verdad en producción hoy.

---

## 8. Grafo de Gravity — ¿sirve para este match?

❌ **Es de otro propósito — diseñado explícitamente para tres cosas que no incluyen comparar un Mandate externo contra el grafo propio.**

El grafo modela: el árbol de 5 niveles de una misma organización/Nucleus, las aristas de herencia vertical intra-linaje, y el linaje de promoción. Sus únicos usos declarados son: resolución de gravity activa por turno, trazabilidad de promoción, y arbitraje territorial entre Mandates ya activos en el mismo grafo. **No hay ningún tipo de arista ni algoritmo de recorrido definido para comparar el grafo propio contra las posturas de un Mandate que todavía no forma parte de él** — el propio documento de persistencia del grafo evaluó explícitamente qué recorridos necesitaba soportar, y este caso nunca fue parte del encuadre, porque todos estos documentos parten de "un Mandate ya firmado y ya dentro del grafo".

---

## Conclusión

### ¿El "servidor de compatibilidad de Mandates" que pide Jose ya tiene alguna base real, o es enteramente nuevo?

**Es un mecanismo enteramente nuevo — pero no parte de cero.** Cuatro piezas ya existentes le dan una base real y reutilizable:

1. **El principio "el servidor es la única autoridad, nunca el cliente"** ya está fijado y repetido en toda la familia Gravity — heredable directamente, sin necesidad de justificarlo de nuevo.
2. **El patrón de arbitraje de Nucleus** (árbitro único + jerarquía de resolución: prioridad explícita → escalación → pausa conservadora con notificación humana) es un esqueleto algorítmico reutilizable, aunque hoy resuelve colisión de paths, no de contenido semántico.
3. **La distinción `predicateComputable`** de la gramática ya separa qué posturas son mecánicamente comparables (`threshold`/`priority`/`escalation`) de las que exigen juicio humano (`constraint`/`evidence`/`exception`) — aplicable directamente a decidir qué parte de un match puede automatizarse y cuál debe generar alerta para revisión humana.
4. **El transporte de datos ya existe en parte:** el Mandate Package ya transporta `mandate.json` completo al instalar — el sustrato de datos está más cerca de existir que el algoritmo mismo.

Pero **el algoritmo de comparación, el endpoint que lo expone, la definición de "incompatible" entre posturas de origen independiente, y el paso correspondiente en el flujo de instalación no existen en ningún documento** — ni como diseño, ni como propuesta sin ratificar, ni siquiera como gap nombrado en las listas de pendientes existentes.

### Tabla de gaps y bloqueadores

| # | Gap | Qué falta definir | Evidencia |
|---|---|---|---|
| 1 | Trigger de instalación | Un paso en `nucleus mandate install` que lea `governance.gravityPostures[]` del paquete entrante — hoy ninguno de los 7 pasos lo hace | Mandate Package Spec §9 |
| 2 | Definición de "incompatible" | Qué constituye contradicción entre postura ajena y propia — hoy solo existe la definición intra-linaje (R-18), que asume un padre único conocido | Mandate Universal Schema v1.2.0 §2.1 |
| 3 | Algoritmo de matching cross-origen | Cómo comparar dos conjuntos de posturas sin relación de herencia previa — el Grafo de Gravedad no tiene arista ni recorrido para esto | Persistencia del Grafo §2.1.3; Grammar §8 |
| 4 | Endpoint de API | Un contrato tipo `precheck-compatibility` que reciba el Mandate candidato y devuelva veredicto/conflictos — no existe ni como propuesta, ni está en la tabla de gaps del catálogo de API | Nucleus API Contracts Consolidado §3-§6 |
| 5 | Autoridad real detrás de "la postura del CTO" | Confirmar que la postura de nivel `ORGANIZATION` es realmente la del máximo responsable — depende de que `RequireMaster()` deje de ser un stub | Governance Ownership Spec, invariante GOV-INV-005 |
| 6 | Vocabulario de resolución para instalación | Las señales de conflicto ya diseñadas (rechazar/señalar/reinterpretar/escalar/excepción/proponer cambio) son para un turno de conversación — decidir si aplican igual a instalación de Mandate o necesitan vocabulario propio | Paladin UX Postura/Gravity/Masa §3 |
| 7 | Masa como desempate | Si el diseño futuro quisiera usarla para resolver empates automáticos, hoy está explícitamente descartada como mecanismo de decisión | Orbital Gravity Implementation Spec §3.3 |
| 8 | Transporte confirmado del bloque `governance` | Confirmar que `governance.gravityPostures[]`/`inheritedGravityPostures[]` efectivamente viaja en el paquete — la spec no lo excluye pero tampoco lo confirma con ese detalle | Mandate Package Spec §1, §11 |
| 9 | Estado de implementación de base | Actualizado 2026-09-01: la persistencia filesystem del `GravityGraph` y `gravity.Parse()` ya existen en código real; sigue faltando wirear la Activity al Workflow y conectar el flujo productivo de firma de nodos | Grammar §3.3.1; Persistencia §0.2; actualización transversal de Codex 2026-09-01 |

---

*Fin de la investigación v0.1. No propone implementación — insumo para decidir cómo diseñar, en una etapa siguiente, el mecanismo de compatibilidad servidor-side que pide Jose.*
