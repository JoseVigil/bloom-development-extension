# Propuesta de Diseño — Modelo de Interacción de la UI Contenedora de Orrery e Integración Formal con el Core (v0.2)

**Tipo:** [D] Diseño de UX / modelo de interacción / contrato de integración. No implementa código.
**Fecha:** 2026-09-20
**Estado:** v0.1 aprobada por José en sus líneas generales. Este documento es un addendum que formaliza dos ajustes aprobados explícitamente; no repite el contenido de v0.1, lo extiende. v0.1 sigue vigente en todo lo no tocado aquí.
**Aprobación de referencia (verbatim):** "Aprobamos la propuesta de diseño en sus líneas generales. Consideramos correcto que el visor 3D de Orrery ocupe la pantalla completa en su régimen espacial y que, para la aplicación, se integre mediante una estructura de árbol de objetos jerárquicos que evite redundancias innecesarias. Avancemos sobre estas bases manteniendo las salvedades y los ajustes que venimos discutiendo para los puntos de entrada y el contrato de frontera."

---

## 1. Ajuste confirmado sin cambios: régimen espacial en pantalla completa

v0.1 §2.1 ya proponía el régimen Espacial como "Orrery en pantalla completa (o en el contenedor dominante de la ventana)". José confirma la opción sin ambigüedad: **pantalla completa**, no contenedor dominante con margen para otros elementos persistentes. Se elimina la alternativa parentética de v0.1 §2.1; queda:

> El régimen Espacial ocupa el 100% del viewport de la aplicación. El único contenido que se admite superpuesto es el HUD de orientación ya definido en v0.1 §2.2 (breadcrumb, retorno, foco) — nunca un layout compartido con paneles del régimen Panel.

Esto no cambia ninguna otra sección de v0.1; las refuerza.

---

## 2. Ajuste nuevo: integración mediante árbol de objetos jerárquicos, sin redundancia

### 2.1 El problema que resuelve

v0.1 §4.4 dejaba fijado *qué* cruza la frontera (una LocationSnapshot o su proyección mínima) pero no *cómo se estructura* esa información una vez del lado de Orrery, ni cómo se relaciona con las estructuras de datos que ya existen del lado de la UI contenedora (los objetos `Nucleus`, `Project` de `NucleusPanel.svelte`/`ProjectsPanel.svelte`). José pide ahora que esa relación se resuelva como **un único árbol de objetos jerárquicos**, evitando que Orrery mantenga su propia representación paralela y potencialmente divergente de la misma jerarquía soberana.

### 2.2 Regla de diseño: un solo árbol, una sola fuente de forma

LocationSnapshot ya captura la jerarquía soberana en términos de **anchors, ancestros estructurales y vecinos directos** (LocationSnapshot §C, con las categorías de proveniencia `user_anchor`, `structural_ancestor`, `direct_relation`). Esta jerarquía **es** el árbol de objetos; no hace falta — y se descarta explícitamente — que Orrery construya una segunda jerarquía de escena independiente que luego haya que mantener sincronizada con la snapshot.

Se fija la regla:

> El árbol de objetos jerárquicos que Orrery renderiza es una proyección 1:1, sin transformación de forma, de la estructura de ancestros/anchors/vecinos de la LocationSnapshot recibida. Cada nodo del árbol de escena corresponde exactamente a un nodo de la snapshot (mismo id, misma posición jerárquica); Orrery no reordena, no aplana, ni re-anida la jerarquía para conveniencia visual. Si una necesidad de presentación (por ejemplo, agrupar visualmente vecinos lejanos) exige una forma distinta, esa forma se logra con una capa de *layout* sobre el árbol — nunca reconstruyendo el árbol mismo.

Esto mantiene el invariante de frontera de v0.1 §0: la forma de la jerarquía sigue siendo responsabilidad exclusiva de lo que LocationSnapshot ya define (territorio soberano), no algo que Orrery decide por su cuenta.

### 2.3 Qué evita esta regla, concretamente

| Redundancia que se evita | Cómo |
|---|---|
| Orrery manteniendo su propio grafo de Tenant→Organization→Project además del que ya existe en `NucleusPanel`/`ProjectsPanel` | El árbol de escena de Orrery se deriva directamente de la snapshot recibida; no hay una segunda fuente de verdad de la jerarquía soberana del lado del cliente espacial |
| Doble mantenimiento al cambiar la forma de la jerarquía soberana en el core | Un cambio en cómo el core arma anchors/ancestros se refleja automáticamente en el árbol de Orrery, porque es la misma estructura, no una traducción manual |
| Nodos "huérfanos" o inconsistentes entre lo que el usuario ve en modo Panel (p. ej. la lista de Projects de una Organization) y lo que ve en modo Espacial | Ambos regímenes leen, en última instancia, la misma forma jerárquica — el Panel la lista, Orrery la despliega espacialmente, pero ninguno la reinventa |

### 2.4 Relación con el contrato de frontera de v0.1 §4

Esto no reabre §4.1-4.4 de v0.1; los precisa:

- §4.1 (evidencia de `ProjectBinding` en cliente) — la proyección cliente que ahí se pedía como mínimo (`tenantId`, `organizationId`, estado de resolución) es, bajo esta regla, un **nodo más del mismo árbol**, no un dato aparte que viaja por su cuenta. El Project que dispara la entrada tipo B (v0.1 §3.1.B) ya es, él mismo, un nodo de la jerarquía — su binding es la evidencia de su posición en el árbol, no un artefacto separado.
- §4.3 (punto de montaje del shell) — el contenedor de régimen espacial monta un único árbol de escena por sesión activa; no hay remontaje parcial de subárboles al cambiar de foco dentro de Orrery (eso es navegación dentro del mismo árbol, no una nueva integración).
- §4.4 (tabla de qué cruza la frontera) — se mantiene sin cambios; esta sección solo formaliza la *forma* de lo que ya se dijo que cruza.

---

## 3. Fuera de alcance (sin cambios respecto a v0.1 §5)

Este addendum no especifica la implementación del árbol (estructura de datos en PlayCanvas, formato de serialización, mecanismo de diffing ante actualizaciones) — eso pertenece a la spec de implementación ya anticipada en v0.1 §6, a la que este documento agrega un cuarto insumo: la regla de proyección 1:1 de §2.2.

---

## 4. Continuidad

Insumos acumulados para la futura spec de implementación (v0.1 §6 + este addendum):
1. Contrato de evidencia de `ProjectBinding` en cliente (v0.1 §4.1), ahora entendido como nodo del árbol (§2.4).
2. Estructura de montaje del contenedor de régimen espacial, pantalla completa (v0.1 §4.3 + §1 de este documento).
3. Regla de foco inicial determinística (v0.1 §3.3).
4. Regla de proyección 1:1 del árbol de objetos jerárquicos, sin redundancia con el modelo de datos del core (§2.2 de este documento).

Quedan pendientes, tal como ya estaba señalado, las salvedades y ajustes de puntos de entrada y contrato de frontera que José menciona como "venimos discutiendo" — a la espera de que los precise para incorporarlos.
