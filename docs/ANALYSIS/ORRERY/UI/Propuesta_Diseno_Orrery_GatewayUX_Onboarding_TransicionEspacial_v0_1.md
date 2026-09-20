# Propuesta de Diseño — Mecanismo de Tránsito (Gateway UX) y Onboarding de Orrery bajo Location-First

**Tipo:** Propuesta de diseño de la capa de integración [P]. No es implementación, no modifica código. Es
más concreta que una investigación: fija gestos, secuencias y un contrato de datos de tránsito, pero deja
toda decisión de tecnología/framework a la implementación.
**Estado:** v0.1.
**Fecha:** 2026-09-20.
**Continúa a:** `Investigacion_Orrery_Integracion_UI_Entrada_Salida_v0_3.md` §1 y §4 — es el paso 2 de la
secuencia recomendada en su §7 ("Propuesta de diseño de la capa de integración: gestos de entrada/salida
concretos, forma de conservar contexto de UI de origen"), acotado estrictamente a Gateway UX + Onboarding.
**No reabre:** el contrato `LocationSnapshot v0.1`, ni la corrección Location-first de
`Investigacion_Orrery_LocationFirst_Reorientacion_v0_2.md` §0–§4. Esta propuesta trata ambos como datos
cerrados.
**No resuelve:** la hipótesis de Mandate-como-marcador de objetivo (v0.3 §2.3), qué información transportar
hacia Assembly/ASEM (v0.3 §5.2), ni la definición de Postulate. Esas preguntas siguen abiertas — ver v0.3
§7, preguntas 3, 4 y 6.
**Verificado contra código real:** `installer/conductor/workspace/core/orrery/src/main.ts` (mecanismo de
cámara, selección, foco) y `Cierre_Investigacion_Auditoria_Estado_UI_Puente_CoreUIRedesign_v1_0.md` (estado
confirmado de `MandateTab.svelte`/`mandateStore.ts`, `NucleusPanel`/`ProjectsPanel`).

---

## §0 — Alcance exacto de esta propuesta

Esta propuesta diseña únicamente tres cosas:

1. **El disparador de entrada** — dónde vive el gesto, sobre qué contextos aparece, qué NO lo activa.
2. **La secuencia de tránsito** — qué pasa visualmente y qué contexto se captura al entrar y al salir.
3. **El onboarding** — cómo se enseña a moverse dentro de Orrery sin bloquear ni interpretar propósito.

No diseña qué se ve *dentro* de Orrery más allá de lo ya establecido (v0.2 §3, v0.3 §2): navegación de
scope soberano, anchors, ancestros, relaciones, vecinos de un grado. No diseña la visualización de Mandates
como objetivos — esa hipótesis sigue sin ratificar. No diseña nada de Assembly/ASEM ni Postulate.

---

## §1 — Regla rectora del disparador (invariante, sin cambios)

> El disparador de entrada debe estar asociado a **dónde está parado el usuario**, nunca a una
> interpretación de **qué está pasando ahí**.

Esto ya lo fijó v0.2 §6 y v0.3 §1.2. Esta propuesta lo traduce a reglas de UI concretas en §2.4.

---

## §2 — Puntos de entrada: versión de diseño

### 2.1 Entrada primaria: Project vía `NucleusPanel` / `ProjectsPanel`

Es hoy el único anchor admisible sin ambigüedad bajo `LocationSnapshot` (Project con `ProjectBinding`
resuelto — caso fundacional de `LocationSnapshot` §F.1). El gesto de "elevar perspectiva" se ancla a la fila
o encabezado de un Project ya seleccionado en esos paneles, no a un elemento de navegación global.

**Affordance:** un control secundario, discreto, junto al nombre del Project ya abierto — no un ítem nuevo
en el nav principal, no un FAB flotante permanente en toda la UI. Aparece sólo cuando hay un Project
resuelto en foco; desaparece si no lo hay. Esto evita que el gesto exista "en el aire" sin un anchor
concreto detrás — sería, en sí mismo, una forma de sugerir que siempre hay algo que ir a mirar en Orrery, lo
cual empieza a interpretar relevancia.

### 2.2 Entrada secundaria (condicional): Domain candidato desde el picker de Capa 0 en `MandateTab`

`MandateTab.svelte` expone hoy un picker de Capa 0 (migrado de `docsGate.ts`) que puede detectar un Domain
candidato. Se propone el mismo tipo de affordance que en 2.1, pero **con una marca visual distinta**
(ejemplo: un ícono con un estado "provisional" en vez del estado "resuelto" de 2.1), porque ese Domain no es
todavía canónico bajo `LocationSnapshot` (§1.3 de v0.3). El usuario puede entrar, pero Orrery debe poder
mostrar el estado de resolución real (`unverifiable`/`ambiguous`, ya contemplados en la Sección de estados
de `LocationSnapshot`) en vez de fingir un territorio resuelto.

**Esta entrada queda condicionada** a que José confirme si debe habilitarse ya (pregunta abierta en v0.3
§7.1) — el diseño de su affordance queda listo para cuando se resuelva, pero no se recomienda activarla
antes que 2.1.

### 2.3 Qué NO constituye un punto de entrada en esta propuesta

- `Sidebar.svelte` no ofrece el gesto: da contexto de Organization, no un anchor específico (v0.3 §1.3).
- Ningún estado de ejecución de un Mandate (paso actual, Intent en curso, alerta, conflicto) genera ni
  resalta el gesto. Ver §2.4.

### 2.4 Qué NO dispara el gesto — regla negativa explícita

El gesto de entrada **nunca** aparece, se resalta, ni se sugiere por:

- Actividad o incidencia de un Mandate en ejecución.
- Cantidad de vecinos, relaciones o "algo interesante" detectado en una Location.
- Cualquier forma de notificación, alerta o badge que implique "deberías ir a ver esto".

Esta regla es la que corrige explícitamente el error de v0.1 (v0.2 §6, "antes/ahora"): el trigger no puede
volver a interpretar para qué le serviría al usuario estar ahí.

---

## §3 — Secuencia de tránsito de entrada (el "vuelo")

### 3.1 Captura de contexto de origen, en el instante del gesto

Al activarse el gesto, la capa de integración (no Orrery, no `LocationSnapshot`) registra:

- `origin_panel_id` — qué panel/tab de la UI contenedora lo disparó (`NucleusPanel`, `ProjectsPanel`,
  `MandateTab`, etc.).
- `origin_anchor_ref` — referencia al Project/Domain candidato que originó el gesto.
- `entry_timestamp`.

Este registro es enteramente cliente — no es un campo de `LocationSnapshot`, no se envía como parte de una
captura. Se sostiene en memoria/estado de sesión de la UI, en los términos "cliente-only"/"híbrido" de
`Paladin_Client_Object_Model_v0_1.md` §2 (tratado como antecedente, categorías igual de útiles aquí).

### 3.2 Transición visual: vuelo continuo, no corte abrupto

El prototipo ya tiene el mecanismo correcto y reutilizable, en `main.ts`:

```
const smooth = 1 - Math.exp(-dt * 7);
target.lerp(target, desired, smooth);
distance = pc.math.lerp(distance, desiredDistance, smooth);
```

Se propone usar este mismo mecanismo de interpolación de cámara (`target`/`desired`, `distance`/
`desiredDistance`) como el vuelo de entrada — pero instanciado **directamente sobre el anchor de origen**,
no arrancando desde la vista general (`view: 'all'`, `desiredDistance: 40`) como hace hoy el prototipo al
cargar. Es decir: el primer frame de Orrery ya debe tener `desired` apuntando a la posición del anchor de
origen, con la `desiredDistance` correspondiente a su tipo (mismos valores que ya usa `$('focus').onclick`
hoy: `15` para Domain, `12` para otros tipos de nodo). El usuario ve el mundo aparecer y la cámara
"acercarse" a lo que ya tenía abierto — nunca aparece en un punto neutro y tiene que volver a buscar su
propio contexto en el selector `#objects`.

Esto es, en efecto, invocar automáticamente el equivalente de `select(anchor)` con el anchor de origen ya
resuelto, en el mismo instante en que Orrery termina de montar la escena — no como una acción manual
posterior del usuario.

### 3.3 Aterrizaje con foco: el panel inspector ya no arranca vacío

Hoy el panel derecho arranca con el estado neutro `"Un mundo por recorrer" / "Acercate a un territorio o
seleccioná un elemento..."`. Bajo este Gateway, ese estado neutro sólo debería verse si Orrery se abre sin
ningún anchor de origen resoluble (caso límite, no el camino principal). En el camino principal, el panel
inspector debe mostrar de entrada la información del anchor de origen — el mismo contenido que hoy sólo
aparece después de que el usuario selecciona algo manualmente.

---

## §4 — Onboarding dentro de Orrery

### 4.1 Primera vez vs. uso recurrente

Se distingue por una marca de estado simple (no es parte de `LocationSnapshot`, es preferencia de UI del
Paladín). Sólo en la primera entrada se agrega una capa mínima, no bloqueante, de instrucciones de
interacción — equivalente al texto que hoy vive fijo en el panel izquierdo del prototipo ("Arrastrá para
orbitar. Rueda para acercarte. Shift + arrastrar para desplazar."), pero mostrado como una capa que se
retira sola tras la primera interacción real del usuario (el primer drag, el primer wheel), no como un
modal que hay que cerrar con un botón. En visitas siguientes, ese texto no vuelve a aparecer como capa
propia — puede seguir existiendo como texto de ayuda permanente y discreto en el panel, igual que hoy.

### 4.2 Qué se retira de la superficie del Gateway/Onboarding porque contradice el invariante

El panel inferior actual del prototipo (`"Simulación del trabajo"` — Play/Pausa, timeline de 30s, y el
`marker` que recorre `route` narrando `"Intent 1 · Inspeccionar identidad"` → `"Mandate 2 · Compartir
conocimiento"` → `"Artifact disponible"`) es, literalmente, la narración de un proceso en el tiempo. Esto es
exactamente lo que v0.2 §3 y §4 ya identificaron como fuera del contrato (evaluación/interpretación de
proceso, no observación de posición). Esta propuesta lo hace explícito para el Gateway: esa superficie **no
forma parte** del mecanismo de entrada/onboarding que se está diseñando acá. Si algún día se ratifica la
hipótesis de Mandate-como-marcador estático (v0.3 §2.3, todavía pendiente), sería una capa aparte, dentro de
la experiencia de navegación misma — nunca parte de cómo se recibe o se enseña a usar Orrery.

### 4.3 El onboarding no interpreta propósito

El texto de ayuda enseña a moverse (orbitar, acercarse, desplazar, seleccionar) — nunca sugiere qué mirar,
qué es relevante, ni por qué el usuario debería explorar algo en particular. Esto aplica la misma distinción
de la devolución (§3 de la devolución): Orrery no interpreta el propósito; el onboarding, como parte de
Orrery, tampoco.

---

## §5 — Secuencia de salida: retorno simétrico

### 5.1 El gesto de salida es distinto del botón interno de reseteo de cámara

El prototipo ya tiene un botón `"Volver a la vista general"` (`#focus`) — pero ese botón **resetea la
cámara dentro de Orrery**, no saca al usuario de la experiencia. Bajo este Gateway, se necesita un gesto
explícito y siempre visible, distinto de ese botón, del tipo "Salir de Orrery" — no depende de si hay algo
seleccionado, y no se confunde con "volver a ver todo el territorio".

### 5.2 Qué recupera la UI contenedora al salir — regla mínima propuesta

La pregunta de qué anchor/foco preservar si el usuario cambió de selección varias veces dentro de Orrery
sigue abierta (v0.3 §7, pregunta 5). Mientras no se resuelva, esta propuesta fija una **regla mínima
defendible** para no bloquear el diseño del Gateway:

> Al salir, la UI contenedora restituye siempre `origin_panel_id` y `origin_anchor_ref` — el panel y el
> anchor con los que el usuario **entró** — independientemente de cuántos focos haya visitado dentro de
> Orrery.

Esto es deliberadamente conservador: no intenta adivinar cuál de los focos intermedios "importa más". Si
José prefiere que la salida ofrezca elegir entre los focos visitados, o que se lleve el último foco activo
por defecto, esta regla se reemplaza sin afectar el resto de la propuesta — ver pregunta 1 en §8.

### 5.3 Si hubo una `LocationSnapshot` capturada durante la visita

Se señala su existencia al volver, como un affordance simple (ej. un indicador junto al anchor de origen: "1
territorio capturado durante esta visita") — sin diseñar todavía el objeto ni su destino, que sigue siendo
territorio del diseño del consumidor (v0.2 §7, pregunta 2, todavía fuera de alcance).

### 5.4 Continuidad visual y cognitiva

La transición de salida espeja la de entrada (§3.2): el mismo mecanismo de interpolación de cámara, en
reversa — un "alejamiento" hacia el punto de origen antes de que la UI 2D vuelva a tomar la pantalla, en vez
de un corte abrupto. El objetivo es que el regreso no se sienta como un reinicio de la aplicación.

---

## §6 — Contrato del "contexto de tránsito" (cliente, fuera de `LocationSnapshot`)

| Campo | Origen | Vive en |
|---|---|---|
| `origin_panel_id` | Panel/tab que disparó el gesto | Estado de cliente de la capa de integración |
| `origin_anchor_ref` | Project/Domain candidato de origen | Estado de cliente — referencia, no contenido |
| `entry_timestamp` | Momento del gesto | Estado de cliente |
| `exit_anchor_ref` | Igual a `origin_anchor_ref` bajo la regla de §5.2 (hasta que se resuelva la pregunta 5 de v0.3) | Estado de cliente |
| `capture_ref` (opcional) | Referencia a una `LocationSnapshot` si el usuario capturó una durante la visita | Estado de cliente — apunta a la captura, no la contiene |

Ninguno de estos campos es parte del payload de `LocationSnapshot` ni lo modifica. Son, en términos de
`Paladin_Client_Object_Model_v0_1.md`, objetos cliente-only o híbridos de la capa de integración.

---

## §7 — Qué queda explícitamente fuera de esta propuesta

- La hipótesis de Mandate-como-marcador de objetivo (v0.3 §2.3) — no se ratifica ni se diseña acá.
- Qué información exacta debe sobrevivir hacia Assembly/ASEM (v0.3 §5.2) — sigue pendiente de que
  Assembly/ASEM tenga su propio research (v0.3 §7, pregunta 6).
- La definición de Postulate.
- Cualquier decisión de framework/implementación — esta propuesta describe comportamiento, no código.

---

## §8 — Preguntas puntuales para José

1. **Multiplicidad de foco (§5.2):** ¿la regla mínima —restituir siempre el anchor de *entrada*, no el
   último foco navegado dentro de Orrery— es aceptable como comportamiento por defecto, o preferís que se
   ofrezca elegir entre los focos visitados desde ya?
2. **Panel de simulación del prototipo (§4.2):** ¿confirmás que el panel inferior actual (Play/timeline/
   narración de Intent) debe salir por completo de la superficie de Gateway/Onboarding, quedando pendiente
   de una futura vista de Mandate-como-marcador si esa hipótesis se ratifica?
3. **Alcance del onboarding de primera vez (§4.1):** ¿debe ser una sola vez por Paladín (global), o por tipo
   de anchor (ej. primera vez que entra a un Project, primera vez que entra a un Domain, tratadas por
   separado)?
4. **Entrada secundaria condicional (§2.2):** ¿se habilita ya el gesto sobre Domain candidato del picker de
   Capa 0, marcado como provisional, o se pospone hasta que ese índice tenga productor canónico?

### Secuencia recomendada

1. Resolver 1–4 con José.
2. Con eso fijado, este documento queda en condiciones de pasar a especificación de implementación (todavía
   sin tocar código) — o de servir directamente de referencia si Core UI Redesign ya tiene su propio ciclo
   Investigación → Propuesta → Encargo en curso.
