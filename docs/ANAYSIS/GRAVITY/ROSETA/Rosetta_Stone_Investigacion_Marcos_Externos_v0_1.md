# Rosetta Stone — Investigación de Marcos Multidisciplinarios

## Insumo para la matriz de traducción entre marcos conceptuales externos y el vocabulario Gravity/Orbital

**Tipo:** Documento de investigación (preliminar a la matriz de traducción)
**Estado:** Borrador v0.1 — insumo, no normativo
**Fecha:** 2026-08-28
**Fuentes canónicas del vocabulario destino:** `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md`; `Corolario — La persona como fuente de Gravity.md`; `Orbital_Gravity_Implementation_Spec_v0_1.md`

---

## 0. Encuadre y método

Este documento investiga cuatro marcos conceptuales externos — **teoría de mediación**, **teoría de ecosistemas**, **teoría de juegos** y **dinámicas de enjambre (swarm intelligence)** — como candidatos a alimentar una futura matriz Rosetta Stone hacia el vocabulario ya fijado de Gravity: **Postura, Masa, Gravity, gravityPosture, autoridad, jerarquía**.

Cada sección responde cuatro preguntas, en este orden:

1. **Definición breve** del marco, en su propio vocabulario, sin traducir.
2. **Tipo de coordinación que asume originalmente** el marco: coordinación entre pares (negociación horizontal, sin autoridad común obligatoria) o coordinación jerárquica (con una autoridad que decide). Esta pregunta es central porque el sistema descrito en los documentos adjuntos prohíbe explícitamente que dos unidades de trabajo sin relación de jerarquía resuelvan un conflicto entre sí mismas.
3. **Conceptos con traducción tentativa** — 2-3 conceptos del marco traducidos, con nivel de fidelidad indicado.
4. **Incompatibilidades explícitas** — qué parte del marco no puede traducirse sin violar la autoridad central de NUCLEUS, y debe descartarse, no forzarse.

### La restricción que gobierna toda traducción

`Orbital_Gravity_Implementation_Spec_v0_1.md` §0 y §3.2 fijan la restricción de diseño contra la cual se evalúa cada marco:

> **INVARIANT-ARB-001:** ningún conflicto de superposición se resuelve por negociación entre los Agent Loops o Mandates involucrados. La resolución es exclusivamente de Nucleus.
>
> **INVARIANT-ARB-002:** el árbitro es siempre la autoridad común más cercana en el grafo — el padre común si existe, escalando hasta Nucleus si no hay autoridad común más específica disponible.
>
> **INVARIANT-ARB-003:** el resultado de un arbitraje nunca modifica `gravityPostures[]` de ningún Mandate ya firmado — es una resolución de secuencia/prioridad, no una reescritura de contrato.

Y, en palabras del Implementation Spec: *"la autoridad nunca se distribuye, aunque el acceso sí"*. Ningún marco de los cuatro fue diseñado originalmente con esa restricción en mente — los cuatro nacen, en mayor o menor medida, para describir o producir coordinación **sin** una autoridad central obligatoria. Esa tensión es precisamente lo que cada sección debe hacer explícito, no disolver.

### Nota metodológica sobre las fuentes

Las fuentes citadas por marco son obras u autores estándar reconocibles dentro de cada disciplina, referenciados por el concepto que fijaron, no reproducidos textualmente — el objetivo es identificar el origen conceptual, no comentar el texto.

---

## 1. Teoría de mediación

### 1.1 Definición breve

La teoría de mediación estudia cómo un tercero **sin poder de decisión vinculante** puede facilitar que dos partes en conflicto lleguen, por sí mismas, a un acuerdo que ambas acepten voluntariamente. El mediador no impone una solución: administra el proceso, reformula posiciones, identifica intereses subyacentes y ayuda a las partes a encontrar una zona de acuerdo mutuamente aceptable. La autoridad de decidir permanece siempre en las partes, nunca migra al mediador — esto es lo que distingue a la mediación del arbitraje.

### 1.2 Tipo de coordinación que asume

**Coordinación entre pares (negociación horizontal), con facilitación no vinculante.** La mediación clásica presupone dos partes sin relación jerárquica entre sí, que retienen la autoridad completa sobre el resultado. El mediador no tiene poder de imponer nada — su función es explícitamente **no autoritativa**. Esto la ubica en el extremo opuesto de INVARIANT-ARB-001: la mediación es, por diseño, el mecanismo de resolución de conflicto que ese invariante prohíbe (negociación entre pares), salvo que se lea como su variante más débil, ya que ni siquiera hay negociación asistida por una autoridad decisoria.

### 1.3 Conceptos con traducción tentativa

| Concepto (vocabulario propio) | Traducción tentativa a Gravity | Fidelidad |
|---|---|---|
| **Posiciones vs. intereses** — lo que cada parte dice que quiere, frente a la necesidad real que subyace | El **conflicto de `scope_paths`** declarado (posición) frente al objetivo/Mandate que ese scope pretende servir (interés) — Nucleus, al arbitrar, podría en principio distinguir ambos niveles | Parcial — Gravity no tiene hoy un primitivo que separe "lo que el Mandate pide" de "para qué lo pide"; la analogía es sugerente pero no hay campo equivalente |
| **BATNA** (mejor alternativa a un acuerdo negociado) — qué le conviene a cada parte si no hay acuerdo | La resolución **default** de §3.3.3 del Implementation Spec (pausar y notificar) funciona, en efecto, como la "alternativa" que corre si no hay `priority rule` ni `escalation rule` aplicable | Parcial — en mediación el BATNA lo calcula y usa cada parte para negociar mejor; en Gravity el "default" no es una alternativa que un Mandate pueda invocar a su favor, es lo que Nucleus aplica unilateralmente |
| **Mediador / neutralidad** — tercero que no decide, solo facilita | *No se traduce* (ver incompatibilidad) | — |

### 1.4 Incompatibilidades explícitas

El núcleo de la teoría de mediación — que la autoridad de decidir permanece en las partes y el tercero jamás impone un resultado — es **directamente incompatible** con el rol de NUCLEUS tal como lo fija INVARIANT-ARB-001 y 003: NUCLEUS no facilita, **resuelve**, y su resolución es vinculante y no negociable por los Mandates involucrados ("ninguno de los dos Agent Loops negoció nada entre sí", Implementation Spec §4). Un mediador que solo puede sugerir, mientras las partes retienen veto, no tiene equivalente posible dentro de Gravity sin violar la naturaleza vinculante del arbitraje. Igualmente, el principio de **autodeterminación de las partes** (piedra angular de la mediación desde Fisher & Ury) — que el acuerdo debe ser mutuamente aceptado, no impuesto — debe descartarse explícitamente: en Gravity, `resolution: mandate_a_proceeds | mandate_b_proceeds | both_paused | rejected` no requiere ni busca la aceptación de ambos Mandates. Forzar el concepto de "consenso mutuamente aceptable" hacia el vocabulario Gravity produciría la falsa impresión de que los Mandates conservan poder de veto que INVARIANT-ARB-001 les niega explícitamente.

### 1.5 Fuentes

- Roger Fisher & William Ury, *Getting to Yes* (1981) — distinción posiciones/intereses, BATNA.
- Christopher W. Moore, *The Mediation Process* (1986) — estructura y fases del proceso de mediación.
- Lon L. Fuller, "Mediation: Its Forms and Functions" (*Southern California Law Review*, 1971) — distinción formal entre mediación y adjudicación/arbitraje.

---

## 2. Teoría de ecosistemas

### 2.1 Definición breve

La teoría de ecosistemas describe cómo organismos (o, en su extensión a negocios, organizaciones) coexisten dentro de una red de relaciones interdependientes — depredación, competencia, mutualismo, simbiosis — sin que ningún nodo de la red posea autoridad formal sobre los demás. El orden observado (nichos ocupados, sucesión, resiliencia) emerge de la interacción local repetida, no de un diseño centralizado. Su extensión a negocios (James F. Moore) introduce la figura del "keystone" — una empresa cuya influencia estructural es desproporcionada — pero esa influencia se gana por el valor que provee a la red, no por mandato.

### 2.2 Tipo de coordinación que asume

**Coordinación entre pares, descentralizada y emergente — sin autoridad formal en ningún nodo.** Este es el marco de los cuatro más alejado de una jerarquía explícita: ni siquiera existe la figura de un árbitro nominal. La influencia (de una especie clave, de una empresa keystone) es estructural y emergente, nunca delegada ni asignada. No hay equivalente ecológico de "escalar a una autoridad común": si dos especies compiten por el mismo nicho, no existe un tercer organismo cuya función sea resolver el conflicto — el resultado emerge de la dinámica misma (exclusión competitiva, coexistencia, etc.).

### 2.3 Conceptos con traducción tentativa

| Concepto (vocabulario propio) | Traducción tentativa a Gravity | Fidelidad |
|---|---|---|
| **Nicho ecológico** — el conjunto de recursos/condiciones que una especie ocupa y explota | El `scope_paths` que un Mandate reclama como territorio propio — el "nicho" de trabajo de ese Mandate dentro del grafo | Buena — ambos describen un territorio delimitado que un actor ocupa y del cual depende su actividad |
| **Especie clave / keystone** — un actor cuyo efecto sobre el sistema es desproporcionado respecto de su abundancia | *Tentador pero engañoso* mapear a NUCLEUS o a una Postura de alta Masa (ver incompatibilidad) | Baja — el origen de la influencia es opuesto en cada marco |
| **Interdependencia / red trófica** — relaciones de dependencia entre múltiples actores sin nodo raíz | El grafo de aristas `PARENT_OF` / `INHERITS_FROM` del Implementation Spec — pero como **árbol con raíz única** (NUCLEUS), no como red sin raíz | Parcial — la forma visual (grafo de relaciones) es análoga; la topología (árbol con raíz absoluta vs. red sin centro) no lo es |

### 2.4 Incompatibilidades explícitas

La traducción más riesgosa de este marco es equiparar **especie clave (keystone)** con **NUCLEUS** o con una Postura de Masa alta, porque el parecido superficial ("un nodo con influencia desproporcionada") oculta una diferencia estructural que debe descartarse explícitamente: el estatus de keystone en ecología es **emergente y contingente** — surge de la dinámica del sistema, puede desplazarse a otra especie si las condiciones cambian, y ninguna especie lo posee por diseño o nombramiento. NUCLEUS, en cambio, es *"singleton, raíz absoluta. Uno por instalación"* (Implementation Spec §1.2) — su autoridad es constitutiva, no ganada, y no puede desplazarse a otro nodo por dinámica alguna. Tratar a NUCLEUS como "la especie clave del ecosistema Gravity" sugeriría, incorrectamente, que su rol podría en principio ser ocupado por otro nodo si acumulara suficiente Masa — exactamente lo que la Corolario descarta al distinguir Masa (computable, relativa) de autoridad estructural. Del mismo modo, la ausencia total de un árbitro en la dinámica ecológica (nada resuelve la competencia entre dos especies por el mismo nicho salvo la dinámica misma) es incompatible con INVARIANT-ARB-002, que exige siempre una autoridad común nombrable — no hay "exclusión competitiva por dinámica del sistema" permitida como mecanismo de resolución entre Mandates.

### 2.5 Fuentes

- Arthur G. Tansley, "The Use and Abuse of Vegetational Concepts and Terms" (*Ecology*, 1935) — origen del concepto de ecosistema.
- C. S. Holling, "Resilience and Stability of Ecological Systems" (*Annual Review of Ecology and Systematics*, 1973) — resiliencia como capacidad de absorber disturbio sin perder estructura.
- James F. Moore, "Predators and Prey: A New Ecology of Competition" (*Harvard Business Review*, 1993) — extensión del marco ecológico a ecosistemas de negocio y la figura del keystone.

---

## 3. Teoría de juegos

### 3.1 Definición breve

La teoría de juegos analiza cómo agentes racionales e independientes eligen estrategias en función de los pagos que esperan obtener, dado lo que anticipan que harán los demás. Su resultado central, el **equilibrio de Nash**, describe un estado en el que ningún jugador puede mejorar su resultado cambiando unilateralmente de estrategia — un equilibrio que se sostiene **sin que nadie lo imponga**. Su rama cooperativa admite acuerdos vinculantes entre jugadores (habilitados por un mecanismo externo de cumplimiento); su rama de diseño de mecanismos invierte la pregunta: dado un resultado deseado, ¿qué reglas del juego deben fijarse de antemano para que jugadores racionales lo produzcan por sí mismos?

### 3.2 Tipo de coordinación que asume

**Predominantemente coordinación entre pares, autoejecutable (self-enforcing).** La potencia explicativa de la teoría de juegos no-cooperativa reside precisamente en describir equilibrios que emergen **sin** autoridad central: cada jugador optimiza su propia estrategia anticipando la del otro. Hay dos excepciones parciales dentro del propio marco que sí introducen una figura jerárquica: la teoría de juegos cooperativa (acuerdos vinculantes con cumplimiento externo) y el **diseño de mecanismos**, donde un diseñador fija las reglas ex-ante — más cercano en espíritu a una autoridad que gobierna el campo sin intervenir jugada a jugada.

### 3.3 Conceptos con traducción tentativa

| Concepto (vocabulario propio) | Traducción tentativa a Gravity | Fidelidad |
|---|---|---|
| **Diseño de mecanismos** — fijar reglas ex-ante para que la conducta racional converja al resultado deseado sin intervención caso a caso | La `gravityPosture` de primitivo **`priority`** declarada de antemano en el ancestro común (Implementation Spec §3.3.1) — exactamente el mismo movimiento: NUCLEUS fija la regla antes del conflicto para no tener que arbitrar cada caso | Buena — es la traducción más fiel de las tres; ambos mecanismos buscan reducir la necesidad de intervención puntual mediante reglas previas |
| **Árbitro / esquema de arbitraje** (p. ej. solución de negociación de Nash) — tercero que impone una división cuando las partes no acuerdan | El rol de NUCLEUS al resolver por `default_pause_and_notify` (§3.3.3) | Parcial — el esquema de arbitraje de Nash optimiza un axioma de equidad fijado a priori (simetría, Pareto-optimalidad); NUCLEUS explícitamente rehúsa optimizar "quién es más importante" sin regla o humano — es un arbitraje deliberadamente *no* optimizador |
| **Punto focal / equilibrio de Schelling** — solución a la que convergen las partes sin comunicarse, por convención compartida | *No se traduce* (ver incompatibilidad) | — |

### 3.4 Incompatibilidades explícitas

El corazón de la teoría de juegos no-cooperativa — que jugadores racionales e independientes pueden alcanzar un **equilibrio estable sin que nadie lo imponga**, anticipando correctamente la estrategia del otro — es exactamente la clase de resolución que INVARIANT-ARB-001 prohíbe entre Mandates: *"ningún conflicto de superposición se resuelve por negociación entre los Agent Loops o Mandates involucrados"*. Aunque dos Mandates en conflicto pudieran, en teoría, "razonar" hacia un equilibrio de Nash mutuamente óptimo sin intervención (por ejemplo, uno cede el territorio disputado porque anticipa que ceder es su mejor respuesta), Gravity descarta esa posibilidad por diseño — no importa si el resultado sería eficiente o estable, la vía está cerrada porque la autoridad nunca puede emerger del cálculo de los pares, solo puede residir en Nucleus. De la misma manera, el **punto focal de Schelling** — la idea de que los pares pueden converger a una solución compartida sin comunicación explícita, por convención o saliencia — es explícitamente rechazado en el Implementation Spec §3.3.3: la resolución por defecto **no** elige "el más importante" ni ninguna convención implícita; exige una regla nombrada o intervención humana. Cualquier traducción que sugiera que Gravity podría beneficiarse de que los Mandates "converjan solos" a un óptimo compartido debe descartarse: eso es, precisamente, la negociación entre pares que el sistema prohíbe.

### 3.5 Fuentes

- John von Neumann & Oskar Morgenstern, *Theory of Games and Economic Behavior* (1944) — fundación del campo.
- John Nash, "The Bargaining Problem" (*Econometrica*, 1950) — equilibrio de Nash, solución de negociación con árbitro.
- Thomas C. Schelling, *The Strategy of Conflict* (1960) — puntos focales, coordinación sin comunicación.
- Leonid Hurwicz / Roger Myerson (Nobel 2007, diseño de mecanismos) — reglas ex-ante para inducir el resultado deseado.

---

## 4. Dinámicas de enjambre (swarm intelligence)

### 4.1 Definición breve

Las dinámicas de enjambre estudian cómo un comportamiento global coherente y robusto puede emerger de muchos agentes simples que siguen **reglas puramente locales**, sin ningún agente con visión global ni autoridad sobre los demás — bandadas de aves, colonias de hormigas, colmenas. Un mecanismo clave es la **estigmergia**: los agentes coordinan indirectamente modificando un entorno compartido (rastro de feromona) que otros agentes leen y a su vez modifican, sin comunicación directa ni jerarquía.

### 4.2 Tipo de coordinación que asume

**Coordinación entre pares, descentralizada al extremo — más débil incluso que la negociación, porque no hay negociación en absoluto.** Es, de los cuatro marcos, el que asume de manera más radical la ausencia de autoridad: ningún agente individual conoce el estado global, ninguno decide por los demás, y la robustez del sistema se atribuye explícitamente a la **ausencia** de un punto único de control — un enjambre sin líder no tiene punto único de falla. Esto lo coloca en el extremo diametralmente opuesto de un sistema centrado en NUCLEUS.

### 4.3 Conceptos con traducción tentativa

| Concepto (vocabulario propio) | Traducción tentativa a Gravity | Fidelidad |
|---|---|---|
| **Reglas locales simples** — cada agente actúa solo en función de su entorno inmediato | Las `gravityPostures[]` propias de un Mandate/Session — el criterio bajo el cual **ese** nodo opera localmente | Buena, pero solo a nivel de un único Mandate — no escala a coordinación *entre* Mandates (ver incompatibilidad) |
| **Estigmergia** — coordinación indirecta vía modificación de un entorno compartido y persistente | El grafo de Gravity como sustrato compartido que Orbital consulta en cada turno (`resolve_active_gravity`) | Parcial y solo en el lado de **lectura**: los Mandates sí leen un entorno persistente compartido, como en la estigmergia — pero no pueden **escribirlo** libremente (ver incompatibilidad) |
| **Robustez sin punto único de falla** — la ausencia de un controlador central es la fuente de resiliencia del sistema | *No se traduce* (ver incompatibilidad) | — |

### 4.4 Incompatibilidades explícitas

La estigmergia es el concepto de swarm intelligence que más tienta a una traducción directa — y el que exige la advertencia más explícita. En la estigmergia biológica, cualquier hormiga puede depositar feromona y así **modificar unilateralmente** el entorno compartido que gobierna la conducta futura de sus pares; no existe firma, autorización ni autoridad que valide ese depósito. En Gravity, en cambio, toda escritura persistente sobre el grafo requiere una autoridad nombrada — `signedBy` en cada nodo, `promotedBy: "human_operator" // nunca 'agent'` en cada promoción (Implementation Spec §1.5), y `resolvedBy: nucleus_automatic | human_operator // nunca 'agent'` en cada arbitraje. Un Mandate puede *leer* el campo Gravity resuelto como una hormiga lee feromona, pero **no puede escribirlo por su cuenta** para señalizar a sus pares — eso sería exactamente la "negociación entre Agent Loops" que INVARIANT-ARB-001 prohíbe, aunque ocurriera de forma indirecta y no verbal. Más radicalmente: la tesis central de swarm intelligence — que la **ausencia** de un nodo central es la fuente de robustez del sistema (sin punto único de falla) — es lo inverso exacto de la arquitectura Gravity, donde NUCLEUS es *"singleton, raíz absoluta"* y toda la robustez del arbitraje depende de que exista siempre una autoridad común identificable (INVARIANT-ARB-002). Cualquier propuesta de resolver colisiones de `scope_paths` entre Mandates mediante "reglas locales que converjan solas" — el mecanismo constitutivo de un enjambre — debe descartarse explícitamente, no atenuarse con un supervisor nominal: el Implementation Spec ya lo prueba con el ejemplo de §4, donde *"ninguno de los dos Agent Loops negoció nada entre sí. Ninguno supo siquiera que el otro existía"* — el enjambre, por contraste, depende exactamente de que los agentes sí perciban y reaccionen entre sí sin mediación.

### 4.5 Fuentes

- Craig W. Reynolds, "Flocks, Herds, and Schools: A Distributed Behavioral Model" (*SIGGRAPH*, 1987) — el modelo "boids", reglas locales → comportamiento emergente.
- Eric Bonabeau, Marco Dorigo & Guy Theraulaz, *Swarm Intelligence: From Natural to Artificial Systems* (1999) — estigmergia, optimización por colonia de hormigas.
- Thomas D. Seeley, *Honeybee Democracy* (2010) — consenso descentralizado sin autoridad central en la selección de nido.

---

## 5. Síntesis transversal

Un patrón recorre los cuatro marcos y conviene dejarlo explícito antes de construir la matriz: en su formulación más potente y reconocible, **los cuatro fueron diseñados para explicar o producir coordinación que funciona precisamente porque prescinde de una autoridad central obligatoria** — ya sea porque el poder de decidir permanece en las partes (mediación), porque el orden emerge sin diseño (ecosistemas), porque el equilibrio se autoimpone sin árbitro (teoría de juegos no-cooperativa), o porque la ausencia de líder es la fuente misma de robustez (enjambres). Ninguno de los cuatro es "neutral" respecto de la restricción de diseño de Orbital/Gravity — los cuatro empujan, por construcción, en la dirección contraria a INVARIANT-ARB-001/002/003.

Esto no invalida su valor como fuente de vocabulario: cada uno aporta 1-2 conceptos que sí traducen razonablemente bien **dentro** del límite de un único Mandate o como metáfora de estructura (nicho, reglas locales, diseño de mecanismos ex-ante, distinción posición/interés). Pero la matriz Rosetta Stone que se construya a partir de este documento debería marcar, para cada concepto trasladado, si su traducción preserva o descarta la pieza de autoridad distribuida que el marco original asumía — el riesgo identificado en cada sección es que una traducción demasiado fluida importe, sin que nadie lo note, la premisa de resolución entre pares que el propio Implementation Spec fue escrito para excluir.

---

*Fin del documento de investigación — insumo para la matriz de traducción Rosetta Stone.*
