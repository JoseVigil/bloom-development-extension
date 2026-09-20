# Propuesta de Diseño — Ledger Panel: Definición Conceptual y Funcional de la Capa de Auditoría y Trazabilidad (v0.1)

**Tipo:** [D] Diseño conceptual/funcional. No implementa código. No reabre LocationSnapshot v0.1 ni el modelo de interacción/integración ya aprobado en `Propuesta_Diseno_Orrery_UIContenedora_ModeloInteraccion_IntegracionFormal_v0_1.md`/`v0_2.md`; se apoya en ellos.
**Fecha:** 2026-09-20
**Encargado por:** José, mensaje directo, como formalización del reencuadre acordado en la respuesta anterior de este cowork (separar estructura de secuencia / persistencia-auditoría / integración visual, con la auditoría fuera del contrato base de Orrery).
**Evidencia de partida:** `webview/app/src/lib/components/LedgerPanel.svelte` ya existe en código real, con un panel de observabilidad y una nota explícita en línea 57: "Datos de ejemplo (placeholder) — solo observabilidad, sin acciones desde este panel." Este documento formaliza qué es ese componente conceptualmente y funcionalmente, no lo modifica.

---

## 0. El invariante que sigue gobernando este documento

Se mantiene sin excepción la regla de frontera fijada en `v0.1 §0` y `§4.4` de la propuesta anterior: Orrery no reporta intención, solo posición; una capa consumidora solo puede decirle a Orrery *dónde* dibujar algo, nunca *qué significa*. Ledger Panel es, precisamente, una de esas capas consumidoras — nunca una extensión del contrato base de Orrery. Todo lo que sigue es una consecuencia directa de esa regla, no una excepción a ella.

---

## 1. Qué es Ledger Panel — definición conceptual

Ledger Panel es la **capa de observabilidad de sistema**: el lugar donde se registra, de forma append-only y no interpretativa, qué ocurrió — qué recorridos de territorio se hicieron, qué eventos de mandato se dispararon, qué cambios de estado soberano se produjeron — para que ese historial sea consultable y auditable después, sin que ninguna otra capa (Orrery incluida) necesite cargar con esa responsabilidad.

Es, en términos de la taxonomía ya usada en este cowork, una capa consumidora más, del mismo tipo que la hipótesis de "mandato como marcador visualizado" (`v0.1 §2.2`): recibe datos de otras capas, los persiste con su propio criterio, y opcionalmente los proyecta hacia otras superficies (incluida Orrery, como overlay). No es la fuente de verdad de ninguno de esos datos — la fuente de verdad de una Location sigue siendo LocationSnapshot; la fuente de verdad de un evento de mandato sigue siendo `mandateStore.ts`. Ledger Panel es la memoria de que esas cosas pasaron, no el lugar donde se decide qué son.

## 2. Alcance — observabilidad sin acciones

Esto ya está fijado en el código real (`LedgerPanel.svelte` línea 57) y este documento lo formaliza como principio de diseño, no como detalle de implementación:

- **Ledger Panel solo lee y muestra.** No expone ninguna acción que modifique estado de otra capa (no se cancela un mandato desde ahí, no se reescribe una Location, no se dispara una transición de Orrery).
- **Ledger Panel no decide qué es auditable.** Cada capa productora (secuencias de navegación, eventos de mandato, cambios de scope soberano) decide qué de lo suyo emite hacia el ledger. Ledger Panel no tiene lógica propia de "esto es interesante, esto no" — es un receptor, no un filtro con criterio de negocio.
- **Ledger Panel no interpreta.** Puede agrupar, ordenar y filtrar por metadatos estructurales (tiempo, tipo de evento, scope), pero no genera narrativa ("el usuario abandonó su tarea", "hubo un patrón sospechoso") — eso, si llega a existir, es una capa distinta, consumidora del ledger, nunca el ledger mismo.

Esta última regla es la que impide que Ledger Panel se convierta, con el tiempo, en un lugar donde se acumule lógica de evaluación de gravity o de intent por conveniencia — el mismo riesgo que ya se cuidó para Orrery se cuida acá simétricamente.

## 3. Cómo se integra — consumidor puro de secuencias de otras capas

### 3.1 Qué emite hacia Ledger Panel

| Capa productora | Qué emite | Forma del dato |
|---|---|---|
| Secuencia de navegación (del estudio de "recorridos" reencuadrado en la respuesta anterior) | Cadena de Locations visitadas, con timestamp por salto | Lista ordenada de `{locationId, timestamp}`, derivada de LocationSnapshots ya emitidas — Ledger Panel no vuelve a resolver la Location, solo referencia su id |
| `mandateStore.ts` (eventos ya existentes en código real: `mandate:build:initiated`, `mandate:draft:created`, `mandate:build:signed`, etc.) | El mismo evento que ya circula por el store, sin transformación | Evento tal cual lo define el store |
| Cambios de scope soberano (Tenant/Organization/Project, ya cubiertos por el árbol jerárquico de `v0_2 §2`) | Notificación de cambio de binding, no el binding completo | Referencia al nodo del árbol que cambió |

En los tres casos, la regla es la misma: Ledger Panel recibe una **referencia** al evento/estado, no una copia interpretada de él. Esto evita la redundancia de datos que ya se descartó explícitamente para la integración de Orrery en `v0.2 §2.3` — el mismo criterio aplica acá: no se duplica la forma de los datos, se referencia.

### 3.2 Qué Ledger Panel nunca consume directamente

Ledger Panel no se conecta a las fuentes primarias de Panel/Orrery (no lee `ProjectsPanel` ni el motor de cámara de Orrery directamente). Solo recibe lo que cada capa productora decide emitirle explícitamente. Esto mantiene a Ledger Panel desacoplado — puede caerse o quedar temporalmente desincronizado sin que ninguna otra capa deje de funcionar, exactamente como ya ocurre hoy en código (el WebSocket de reconciliación de mandatos sigue activo aunque el panel esté cerrado, según ya se documentó en `v0.1 §2.3` de la propuesta de interacción).

## 4. Mecanismo de persistencia y trazabilidad (conceptual, no de implementación)

Se fijan tres propiedades que cualquier implementación futura debe cumplir, sin especificar aquí el mecanismo concreto (base de datos, formato de storage):

1. **Append-only.** Una entrada de ledger, una vez escrita, no se modifica ni se borra por una acción de UI. Esto es lo que hace que sea "auditable" en sentido literal — un registro que se pudiera editar no sirve como evidencia de lo que pasó.
2. **Con procedencia explícita.** Cada entrada declara de qué capa productora vino y en qué momento se emitió — nunca una entrada "huérfana" sin origen declarado, análogo a las categorías de proveniencia que ya usa LocationSnapshot (`user_anchor`, `structural_ancestor`, `direct_relation`) para sus propios nodos.
3. **Consultable por rango temporal y por scope soberano.** La trazabilidad "a lo largo del tiempo" que pide José implica que el ledger se puede acotar por ventana de tiempo y por Tenant/Organization/Project — reutilizando el mismo árbol jerárquico de `v0.2 §2.2` como criterio de filtrado, no como una segunda jerarquía propia del ledger.

Estas tres propiedades no dictan tecnología; dictan comportamiento observable, que es lo que corresponde a esta etapa de diseño conceptual.

## 5. Dónde se ubica en la arquitectura

### 5.1 Régimen de UI

Ledger Panel vive exclusivamente en el **régimen Panel** (`v0.1 §2.1`), nunca en el régimen Espacial. Es, por naturaleza, un panel transaccional de consulta — abrir el ledger no es "ir a algún territorio", es revisar un registro. Esto es consistente con que ya existe hoy como un panel más, al mismo nivel que `NucleusPanel`/`ProjectsPanel`.

### 5.2 Relación con Orrery: overlay, nunca fuente

Cuando Ledger Panel decide proyectar una secuencia de navegación como capa visual sobre Orrery (el tercer punto del estudio original de José), lo hace exactamente bajo la regla ya fijada en `v0.1 §2.2` y `§4.4` para el marcador de mandato: Ledger Panel le entrega a Orrery una lista de coordenadas/ids de Location a conectar visualmente (un camino), y Orrery las dibuja como anotación — sin saber que es "una auditoría", sin saber de quién es, sin decidir si mostrarla por defecto o no. La decisión de qué recorrido mostrar, a quién pertenece y si es apropiado mostrarlo (cuestión de acceso/sensibilidad) se resuelve *antes* de que el dato cruce la frontera hacia Orrery — nunca del lado de Orrery.

### 5.3 Por qué esta ubicación protege el invariante de Orrery

Si Ledger Panel viviera parcialmente dentro de Orrery (por ejemplo, si el motor espacial tuviera que consultar el ledger para decidir qué mostrar), Orrery dejaría de limitarse a "territorio soberano, scopes, anchors, ancestros y vecinos" y empezaría a tomar decisiones basadas en historial de comportamiento — la misma clase de violación que ya se descartó para mandatos y gravity. Mantener a Ledger Panel enteramente en el régimen Panel, con Orrery como receptor pasivo de coordenadas ya decididas, es lo que preserva la frontera.

## 6. Fuera de alcance de este documento

- No se especifica el schema exacto de una entrada de ledger, ni el motor de persistencia — eso pertenece a una spec de implementación posterior, igual que los insumos ya listados en `v0.2 §4`.
- No se diseña el control de acceso/sensibilidad de qué recorridos son visibles para quién — se señala en `§5.2` que esa decisión debe resolverse antes de que el dato cruce hacia Orrery, pero el mecanismo de esa decisión (roles, scopes de autoridad) no se especifica aquí.
- No se resuelve si Ledger Panel también audita eventos que hoy no emite ningún componente (por ejemplo, acciones puramente de Panel sin relación con Orrery) — se documenta el patrón de integración, no el catálogo completo de eventos a futuro.
- No se modifica `LedgerPanel.svelte` ni se reemplazan sus datos placeholder — este documento es conceptual/funcional, no una tarea de implementación.

## 7. Continuidad

Este documento añade un quinto insumo a la lista de `v0.2 §4` para una futura spec de implementación: el contrato de entrada de ledger (procedencia + referencia, nunca copia interpretada) y su regla de proyección hacia Orrery como overlay de coordenadas puras. Junto con los cuatro insumos previos, esto deja completo el marco conceptual de las tres partes que José pidió en el estudio de recorridos: estructura de secuencia (`§3.1`, apoyada en LocationSnapshot), persistencia/auditoría (`§4`, con dueño propio en Ledger Panel), e integración visual en Orrery (`§5.2`, como overlay puro).
