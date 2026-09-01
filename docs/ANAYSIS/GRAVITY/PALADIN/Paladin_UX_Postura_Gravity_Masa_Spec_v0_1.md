# Especificación UX/UI — Postura, Gravity Activa y Masa en Paladin

**Tipo:** Especificación de experiencia de usuario (UX/UI) — primera pieza de diseño de interfaz
**Estado:** Borrador v0.1 — responde cuatro preguntas puntuales, no cierra el resto de la superficie de Paladin
**Fecha:** 2026-08-28
**Dominio:** Paladin · Gravity · Orbital
**Fuentes normativas (las tres citadas en cada decisión de este documento):**
- `Corolario — La persona como fuente de Gravity.md` (**Cor**)
- `Orbital — Fundamentos de Coordinación, Gravity e Interacción Gobernada.md` (**Orb**)
- `Orbital_Gravity_Implementation_Spec_v0_1.md` (**Impl**)

**Encuadre:** Orb §34 deja explícitamente sin fijar "la UI de Paladin" y remite a una pregunta previa: *"¿Cómo se siente desarrollar cuando cada palabra que decimos puede apoyarse sobre un criterio que ya fue decidido, preservado y jerárquicamente aplicado?"* (Orb §34). Impl §5 confirma que "la representación de Paladin de 'bajo qué Gravity estoy trabajando ahora' … no se aborda — es UI, no persistencia ni arbitraje, y queda fuera de este documento por diseño." Este documento ocupa exactamente ese hueco, para las cuatro preguntas planteadas, sin reabrir gramática de Gravity, persistencia en grafo ni arbitraje — eso ya está resuelto en Impl.

---

## 1. El gesto de postulación de una Postura

### 1.1 El problema de diseño

Cor §"Paladin como espacio para tomar posición" (líneas 63–99) describe el momento de postular no como una decisión que precede al pensamiento, sino como un **reconocimiento durante o después de él**:

> "Cuando algo que está pensando deja de ser solamente parte de la conversación y pasa a representar cómo considera que el trabajo debe ser realizado, puede postular una postura." (Cor)

El verbo es "deja de ser" — un cambio de estatus de algo que ya existía como conversación, no la apertura de un canal distinto desde cero. Esto es lo primero que cualquier gesto de interfaz debe respetar: la postulación no es necesariamente premeditada.

### 1.2 Dos alternativas evaluadas

**Alternativa A — Control retroactivo ("promover a Postura").**
El ingeniero escribe con normalidad. Sobre cualquier mensaje ya enviado (propio) aparece, al pasar el cursor, un control ("Postular esto"). Al activarlo, ese mensaje —o una selección dentro de él— se convierte en el contenido inicial de una Postura, editable antes de confirmar.

**Alternativa B — Modo de escritura distinto, activado antes de escribir.**
Un selector (similar a un toggle de "modo") que el ingeniero activa *antes* de teclear. Mientras está activo, el campo de entrada cambia de apariencia (por ejemplo, un borde o fondo distintivo) y lo que se envíe se trata directamente como Postura, no como mensaje conversacional.

| | Alternativa A (retroactiva) | Alternativa B (modo previo) |
|---|---|---|
| Fricción en la conversación ordinaria | Ninguna — el control es invisible hasta que se necesita | Cada mensaje requiere decidir de antemano en qué modo está el compositor |
| Encaje con Cor líneas 81–91 (el reconocimiento ocurre *durante* el pensar) | Alto — permite postular exactamente en el instante en que el ingeniero nota el cambio de estatus | Bajo — obliga a anticipar ese reconocimiento antes de que ocurra |
| Riesgo de "falsos negativos" (pensamientos que merecían ser Postura y no lo fueron) | Mitigable: el control queda disponible indefinidamente sobre el historial de la sesión | Alto: si el ingeniero no activó el modo a tiempo, debe reescribir el pensamiento desde cero en el modo correcto |
| Riesgo de sobre-formalización | Bajo — postular sigue siendo un acto explícito y ocasional | Alto — un modo persistente tienta a dejarlo "encendido" por precaución, acercando la conversación entera al régimen de Postura |
| Compatibilidad con Orb Principio IV, §28 ("el usuario no debe formalizar cada interacción para trabajar con rigor") | Alta | Baja — introduce una formalización previa a cada intercambio |
| Compatibilidad con Orb §15 ("no significa que cada frase necesite autorización") | Alta | Media — un modo activo constante empuja hacia la autorización previa que ese párrafo descarta |

### 1.3 Decisión: Alternativa A (control retroactivo)

Se elige el control retroactivo. La razón central no es de conveniencia de interfaz sino de fidelidad al texto fundacional: Cor describe la postulación como un acto de **reconocimiento**, no de **anticipación**, y Orb fija como principio (§28-IV) que el lenguaje natural conserva estatus de primera clase precisamente porque el ingeniero no tiene que decidir de antemano el registro en el que va a hablar. Un modo previo invierte esa relación: exige clasificar el pensamiento antes de tenerlo completo.

**Mecanismo de sesión (Impl §1.3, fila `SESSION`):** *"Se captura en vivo, durante la conversación, sin firma formal previa."* Esto es exactamente lo que permite que el control retroactivo no necesite ninguna infraestructura previa: postular a nivel de sesión no requiere una firma anticipada, así que no hay ningún costo de "preparación" que el modo B estuviera evitando. La firma formal solo aparece si el ingeniero intenta que la Postura tenga alcance de Mandate, Project u Organization — y ahí sí la interfaz debe pedir explícitamente esa autoridad (ver 1.4).

**Atajo secundario (no reemplaza a A):** para el ingeniero que ya sabe, antes de escribir, que va a postular, un comando ligero (por ejemplo `/postular` al inicio del mensaje) reutiliza el mismo objeto y el mismo flujo de confirmación — no abre un modo de composición distinto. Es un acceso directo al mismo acto, no una segunda mecánica.

### 1.4 Especificación del control

1. **Affordance:** ícono discreto (sugerido: un blasón o balanza — coherente con "Paladin") visible al pasar el cursor sobre cualquier mensaje propio ya enviado, o sobre una porción de texto seleccionada dentro de él.
2. **Al activarse**, se abre un panel inline (no un modal de pantalla completa — la conversación permanece visible detrás, porque la Postura nace de ella):
   - **Criterio:** el texto del mensaje, pre-cargado y editable (el ingeniero puede depurar la frase antes de que quede fijada como posición).
   - **Alcance propuesto:** Sesión (default, sin fricción — Impl §1.3), Mandate, Project u Organization. Solo se ofrecen los niveles para los que el ingeniero posee autoridad de firma (Impl §1.3, columna "Quién firma"); Organization aparece deshabilitado con la leyenda "requiere `cor`" si el ingeniero no tiene ese canal (Impl §1.3: *"`cor` sigue siendo, sin excepción, el único camino hacia `ORGANIZATION` y `NUCLEUS`"*).
   - **Confirmar postulación.**
3. **Tras confirmar**, el mensaje original queda re-renderizado con un tratamiento visual distinto y permanente (borde/ícono de Postura) que lo separa del resto de la conversación — visualizando la distinción explícita de Cor: *"La conversación permite creatividad. La postura preserva criterio."* Ese tratamiento no desaparece al hacer scroll ni al reabrir la sesión.
4. **Nunca se postula por omisión.** Ningún mensaje se convierte en Postura sin este acto explícito — coherente con Orb Principio XI (§28): "No toda conversación se convierte en Gravity."

---

## 2. Breadcrumb de autoridad — Gravity activa por turno

### 2.1 Fundamento

Orb §14 formula la pregunta que este patrón resuelve: *"¿Bajo qué Gravity estoy trabajando ahora?"* Impl §2.1–§2.4 ya especifica, a nivel de datos, exactamente lo que hay que mostrar: `resolve_active_gravity(session_id)` recorre `NUCLEUS → ORGANIZATION → PROJECT → MANDATE → SESSION` y devuelve, para cada turno, solo las reglas cuyo `appliesTo` coincide con el intent de ese turno (Impl §2.1); Impl §2.4 aclara que al modelo *"se le muestra … solo el subconjunto de Resolved Active Gravity relevante al intent que está por proponer, nunca la totalidad del grafo"*. El breadcrumb debe mostrarle lo mismo al ingeniero: el subconjunto resuelto y relevante de ese turno, no el grafo completo.

### 2.2 Patrón compacto (estado por defecto)

Una sola línea, encima del campo de entrada, con un chip por nivel — solo para los niveles que aportaron al menos una regla activa relevante al turno actual (los niveles sin reglas aplicables no ocupan espacio):

```text
⚙ Org·1   📁 Proy·2   🗂 Mandate·1   💬 Sesión·1
```

El orden reproduce el orden de resolución fijado en Impl §2.1 ("orden: NUCLEUS primero, SESSION último"), de mayor a menor autoridad, de izquierda a derecha. El número es la cantidad de reglas de ese nivel que participaron en la interpretación de *este* turno — no el total de reglas que existen en ese nivel del grafo. Esto es lo que evita mostrar el grafo completo permanentemente: el breadcrumb es una proyección turno a turno, igual que el `gravity_context_injected` de Impl §2.3, no una vista del árbol entero.

### 2.3 Patrón expandido

Al hacer clic en un chip se despliega, inline, la lista de reglas de ese nivel que aplicaron a este turno:

```text
📁 Proyecto · 2 reglas activas en este turno
├─ grv_proj_0012 — "BSIP es normativo sobre implementación"        [origin: project]  ⚖︎⚖︎
└─ grv_proj_0031 — "no introducir segunda fuente de verdad"        [origin: project]  ⚖︎⚖︎⚖︎
```

Cada línea muestra: id abreviado, texto breve de la regla, `origin` (tomado literalmente del enum de Impl §2.2: `nucleus | organization | project | mandate_own | mandate_inherited | session`) y el ícono de masa (ver sección 4). Un enlace aparte, "Ver grafo completo", lleva a una vista separada y deliberada — nunca la vista por defecto — para quien quiera examinar niveles o reglas que no aplicaron a este turno puntual.

### 2.4 Persistencia por turno

Cada turno conserva su propio breadcrumb tal como se resolvió en ese momento (igual que la traza de Impl §2.3), de modo que desplazarse hacia atrás en la conversación muestra qué Gravity gobernaba cada intercambio pasado, no la Gravity actual retroaplicada. Esto es lo que Orb Principio XV exige: *"La gravedad debe ser trazable… debe ser posible determinar qué reglas gobernaban una acción y una interpretación."*

---

## 3. Señales para las respuestas del sistema ante un conflicto con Gravity

### Nota sobre el conteo

Orb §15 enumera, en el bloque de "El sistema puede entonces", **seis** respuestas, no cinco: *"rechazar la acción; señalar el conflicto; reinterpretar una alternativa compatible; solicitar elevación; permitir una excepción si existe autoridad; proponer modificar Gravity si corresponde."* Esta especificación diseña una señal distinta para cada una de las seis, para no dejar sin tratamiento visual la que quedaría excluida si se tomaran solo cinco.

### 3.1 El eje que gobierna todo lo demás

Antes de diferenciar las seis, hay un eje binario que debe ser inconfundible en cada una: **¿el sistema ejecutó algo, o no ejecutó nada?** De las seis, solo dos ejecutan (reinterpretación y excepción) — y son precisamente las dos que el ingeniero podría confundir con "hizo lo que pedí". Por eso llevan, además de su ícono propio, un tratamiento que nunca coincide con el de una ejecución ordinaria sin conflicto (ver 3.3).

### 3.2 Tabla de señales

| # | Respuesta (Orb §15) | Ícono | Etiqueta fija | ¿Ejecuta? | Comportamiento de interfaz |
|---|---|---|---|---|---|
| 1 | **Rechazar la acción** | ⛔ | "Rechazado por Gravity" | No | Detiene, cita la regla exacta que bloquea (id + texto + `origin`), no ofrece alternativa ejecutada — solo indica qué caminos quedan abiertos (pedir excepción, escalar, proponer cambio). Color reservado, no compartido con ningún otro caso. |
| 2 | **Señalar el conflicto** | ⚠️ | "Conflicto detectado — sin ejecutar" | No | Describe la tensión entre el pedido y la(s) regla(s) en juego sin tomar partido; el turno queda abierto, a la espera de que el ingeniero elija entre las opciones 3–6. Es el único caso "neutral": no rechaza ni actúa. |
| 3 | **Reinterpretar con alternativa compatible** | 🔁 | "Reinterpretado — no es tu pedido literal" | **Sí** (alternativa) | Bloque de dos líneas, siempre visible (no colapsable): **"Pediste:"** cita textual del pedido → **"Hice:"** la alternativa efectivamente ejecutada, con la regla que motivó el cambio. Este es el caso con mayor riesgo de confusión señalado en el pedido original, así que es el único con formato de doble línea obligatorio. |
| 4 | **Solicitar elevación a autoridad mayor** | ⬆️ | "Requiere autoridad superior" | No | No ejecuta nada. Indica el nivel de autoridad necesario según Impl §1.3 (Project/Organization, con nota "vía `cor`" si aplica a Organization) y ofrece un control para iniciar esa solicitud humana — nunca un botón que la AI pueda resolver por sí misma (Orb §21: *"Una AI puede identificar Gravity. No puede otorgarse a sí misma autoridad sobre la gravedad que la gobierna."*). |
| 5 | **Permitir una excepción, si existe autoridad** | 🔓 | "Ejecutado como excepción — autoridad: [nombre]" | **Sí** (literal) | Ejecuta el pedido tal como fue formulado, pero con un marcado permanente distinto al de una ejecución ordinaria (por ejemplo, borde dorado en vez del verde de éxito estándar) y nombra explícitamente qué autoridad habilitó la excepción. Nunca se renderiza igual que un turno sin conflicto — de lo contrario la excepción quedaría invisible en el historial. |
| 6 | **Proponer modificar la Gravity vigente** | 📝 | "Propuesta de cambio — pendiente de promulgación" | No | No ejecuta el pedido original ni modifica ninguna regla. Abre el mismo flujo de postulación de la sección 1 (reutiliza el control "Postular"), pre-cargado con la regla candidata a modificar, dejando explícito que postular ≠ promulgar (Orb §21: *"La postulación significa: Esto parece una regla valiosa. No significa: Esta regla gobierna ahora la organización."*). |

### 3.3 Por qué la reinterpretación (3) y la excepción (5) nunca comparten estilo

Son las dos únicas ejecuciones. Si compartieran ícono, color o disposición, un ingeniero que revisa el historial rápidamente podría leer "esto se ejecutó" sin saber si se ejecutó *lo que pidió* o *una alternativa*. Por diseño: 3 usa azul/🔁 con el formato obligatorio de dos líneas; 5 usa dorado/🔓 con el nombre de la autoridad siempre visible en la etiqueta misma (no en un tooltip). Ninguna de las dos usa el color verde reservado para ejecuciones sin conflicto de Gravity.

---

## 4. Métrica de masa

### 4.1 Fundamento y restricción

Cor línea 19 fija la lista completa de factores de los que la masa "podrá depender": **autoridad, jerarquía, alcance, evidencia, precedencia, persistencia y contexto.** El pedido de esta sección pide operacionalizar exactamente tres de esos siete —jerarquía del nivel de origen, verificabilidad, historial de promoción— sin inventar factores nuevos. Impl ya define los tres campos concretos que permiten calcular esto sin inventar nada:

| Factor pedido | Campo ya definido en Impl | Factor de Cor al que corresponde |
|---|---|---|
| Jerarquía del nivel de origen | `origin` (Impl §2.2): `nucleus \| organization \| project \| mandate_own \| mandate_inherited \| session` | jerarquía |
| Si la regla es verificable | `verifiable` (Impl §3.3.1: *"Si existe y es `verifiable`, se aplica automáticamente"*) | evidencia |
| Historial de promoción | arista `PROMOTED_FROM` (Impl §1.4–§1.5): presencia de al menos una arista que registre que esta regla se originó como postulación en un nivel inferior | precedencia / persistencia |

Los otros cuatro factores de Cor (autoridad, alcance, persistencia más allá de la promoción, contexto) no tienen todavía un campo computable equivalente en Impl — Impl §5 lo deja explícito como pendiente ("la gramática formal de `gravityPostures[].expression` sigue sin fijarse"). Esta especificación no los estima ni los aproxima: el ícono de masa solo refleja lo que hoy es calculable a partir de datos ya definidos.

### 4.2 Cálculo (determinista, en tres niveles)

```text
nivel_base(origin):
    session, mandate_own, mandate_inherited  → 1
    project                                   → 2
    organization, nucleus                     → 3

masa = nivel_base(origin)
masa = min(masa + 1, 3)  si rule.verifiable == true
masa = min(masa + 1, 3)  si existe arista PROMOTED_FROM con toPostureId == rule.postureId
```

Una regla de sesión (`origin: session`) que es `verifiable` y que ya fue promovida una vez puede alcanzar masa 3 aunque su nivel de origen sea el más bajo — reflejando exactamente lo que Cor señala: la jerarquía es un factor entre varios, no el único determinante de influencia efectiva.

### 4.3 Ícono

Peso/plomada con relleno de 1 a 3 segmentos (⚖ con 1, 2 o 3 marcas), mostrado junto a cada `postureId` en el breadcrumb expandido (2.3) y junto a la regla citada en cualquiera de las seis señales de conflicto (3.2). Al pasar el cursor, un tooltip desglosa los tres factores con su estado (✓/—): origen, verificable, promovida — nunca un número sin explicación, porque el objetivo (Impl, en espíritu de trazabilidad) es que el ingeniero entienda *por qué* pesa lo que pesa, no solo cuánto.

---

## 5. Flujo de estados de interfaz

```text
┌─────────────────────────┐
│   CONVERSACIÓN NORMAL    │◄──────────────────────────────┐
│  (breadcrumb colapsado,  │                                │
│   §2.2, actualiza cada   │                                │
│   turno)                 │                                │
└───────────┬──────────────┘                                │
            │                                                │
            │ engineer envía mensaje                         │
            ▼                                                │
   resolve_active_gravity (Impl §2.1)                        │
            │                                                │
   ┌────────┴────────┐                                       │
   │  ¿conflicto con  │                                       │
   │  Gravity activa? │                                       │
   └────────┬────────┘                                       │
       no   │   sí                                           │
   ┌────────┘   └─────────────────────┐                      │
   ▼                                  ▼                      │
respuesta normal              CONFLICTO DETECTADO             │
breadcrumb se actualiza       (§3) — el sistema elige UNA     │
silenciosamente               de las seis señales:            │
   │                                                          │
   │                          1 ⛔ Rechazado         ┐         │
   │                          2 ⚠️  Señalado         │         │
   │                          3 🔁 Reinterpretado     ├─► cada │
   │                          4 ⬆️  Elevación pedida  │   una  │
   │                          5 🔓 Excepción          │  vuelve│
   │                          6 📝 Propuesta de cambio┘  aquí  │
   │                                                          │
   └──────────────────────────────────────────────────────────┘

   En cualquier momento, sobre cualquier mensaje propio ya
   enviado (de cualquiera de los estados anteriores):

┌─────────────────────────┐
│   POSTULACIÓN ACTIVA     │   (panel inline, §1.4)
│  criterio · alcance ·    │──► confirmar ──► el mensaje queda
│  confirmar               │    marcado permanentemente como
└─────────────────────────┘    Postura; retorna a conversación
                                normal con ese mensaje ya
                                visualmente distinto (§1.4.3)

   GRAVITY VISIBLE (breadcrumb, §2) no es un estado más: es
   una capa persistente sobre los tres estados anteriores,
   recalculada en cada turno.
```

**Notas sobre el flujo:**
- La rama 6 (proponer modificar Gravity) reingresa al flujo de Postulación Activa con la regla candidata precargada — no es un sexto estado nuevo, reutiliza el de la sección 1, como se especifica en 3.2.
- Ningún estado de conflicto (1–6) es terminal por sí mismo salvo el rechazo (1): las ramas 2, 4 y 6 dejan el turno abierto a una decisión posterior del ingeniero, que puede a su vez derivar en cualquiera de las otras cinco.
- El breadcrumb (§2) no aparece como nodo en el diagrama porque no es un estado transicional — es contexto persistente, coherente con Orb §11: *"La sesión no contiene el contexto. La sesión ocurre dentro del contexto."*

---

## 6. Fuera de alcance de este documento

Siguiendo la misma disciplina que Orb §34 e Impl §5 aplican sobre sí mismos:

- Tokens visuales definitivos (paleta de color exacta, tipografía, tamaños) — aquí solo se fijan íconos, etiquetas y la lógica que los distingue.
- La vista de "grafo completo" mencionada en 2.3 — se establece que debe existir como vista separada y deliberada, no se diseña su interior.
- El mecanismo exacto de firma para Postura de alcance `PROJECT` — Impl §5 ya lo deja pendiente ("qué rol organizacional concreto, qué flujo de UI... no se especifica"); esta especificación solo asume que el selector de alcance en 1.4 debe deshabilitar los niveles para los que el ingeniero no tenga esa autoridad, sin fijar cómo se verifica esa autoridad en la interfaz.
- Cómo se resuelve visualmente un `ArbitrationEvent` (Impl §3.4) entre dos Mandates simultáneos — es un caso distinto del conflicto humano-Gravity tratado en la sección 3 (ahí el conflicto es entre pares de Mandates, arbitrado por Nucleus sin intervención directa del ingeniero en el momento del turno) y merece su propia especificación.

---

*Fin de la especificación v0.1.*
