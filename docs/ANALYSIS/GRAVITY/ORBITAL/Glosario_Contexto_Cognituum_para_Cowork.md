# Glosario de Contexto — Cognituum / Paladín (para uso de Cowork)

**Propósito:** este documento no es parte de la investigación en sí. Es el contexto mínimo para
que quien ejecute la búsqueda entienda los términos usados en `Orrery_Research_Brief_Interfaz_
Principal_v0_1.md` sin tener que inferirlos. Léelo primero, entero, antes de empezar a buscar.

---

## 1. Términos del sistema, una línea cada uno

- **Nucleus** — el núcleo de autoridad del sistema. Es quien firma y valida toda acción; ningún
  otro componente puede autorizar por sí mismo.
- **Gravity** — el sistema de gobernanza de criterio de la organización: reglas y criterio que
  persisten y se aplican automáticamente en cada turno de trabajo, no un prompt que hay que
  repetir.
- **Postura** — la unidad de criterio dentro de Gravity. Puede ser una regla dura (enforceable) o
  criterio informativo (sin enforcement automático).
- **Masa** — el peso relativo de una Postura (de dónde viene, cuánto se usó), útil para que el
  humano entienda por qué algo pesa lo que pesa — nunca decide un conflicto por sí sola.
- **Mandate** — la unidad de trabajo que un agente ejecuta: un objetivo acotado, con límites
  (Capability Seam) sobre qué puede tocar y hasta dónde puede avanzar sin intervención humana.
- **Orbital** — el ciclo de ejecución agéntica *dentro* de un Mandate: un agente propone, ejecuta
  y encadena Intents (unidades de trabajo turno a turno), siempre bajo validación de Nucleus.
- **Constellation** — la capa que coordina *varios* Mandates entre sí: qué Mandate se activa
  cuándo, qué depende de qué, qué corre en paralelo. Es un nivel jerárquico por encima de Orbital.
- **Capability Seam** — el límite técnico que acota qué puede tocar un agente (rutas de archivo,
  cantidad de turnos, reglas de escalación) antes de requerir intervención humana.
- **Wisdom** — el criterio humano acumulado que demostró valor con el tiempo (se reutilizó, se
  transfirió a otros proyectos, produjo resultados) — no es una biblioteca de snippets ni un score
  único de reputación.
- **Paladín** — la persona, el usuario humano del sistema. Es quien conserva control, agencia y
  autoridad sobre el criterio en todo momento; la IA ejecuta, el Paladín gobierna.
- **Orrery** — la interfaz visual/operativa donde el Paladín observa e interviene sobre todo lo
  anterior. Es el objeto de este research: cómo debe verse y comportarse.

## 2. Principios de diseño ya fijados (no se re-discuten, se los toma como restricción)

- **Fail-closed por defecto**: ante cualquier ambigüedad, el sistema bloquea, nunca asume permiso.
- **Nucleus es el único firmante**: ninguna interfaz puede sugerir que otro componente autoriza.
- **La complejidad existe pero no se impone**: el usuario común entiende de un vistazo; el
  ingeniero puede entrar al detalle; ninguno de los dos recibe una interfaz equivocada.
- **El Paladín es protagonista, no espectador**: la interfaz no es un panel que se mira desde
  afuera — es un instrumento que se opera desde adentro.
- **Continuidad por sobre el modelo/ejecutor**: el proyecto es el contenedor; los modelos de IA
  (Claude, Codex, Gemini, etc.) entran y salen de esa continuidad sin romperla.
- **Wisdom no es gamificación**: nunca reducir criterio acumulado a un solo número o ranking.
- **Tres niveles jerárquicos, no dos**: Constellation (entre Mandates) → Orbital (dentro de un
  Mandate) → Gravity (capa normativa transversal a ambos, no un tercer nivel aparte sino un
  overlay).

## 3. Las tres preguntas abiertas que más necesitan evidencia externa

Estas son, en orden de prioridad, las preguntas que el research tiene que ayudar a responder con
casos reales — no son retóricas, se espera una posición con evidencia:

1. **¿Constellation, Orbital y Gravity se navegan como una sola vista continua con zoom semántico,
   o como vistas separadas que el usuario cambia explícitamente?**
2. **¿Orrery es una sola metáfora visual (por ejemplo, astronómica: órbitas, masa, cuerpos
   celestes) o un contenedor de varias vistas con distinta geometría cada una (una orbital, una
   tipo timeline/multipista, otra para reputación)?**
3. **¿Gravity se muestra de forma literal (líneas de fuerza, masa visual) o se traduce a lenguaje
   humano sin geometría propia ("esto queda", "esto gobierna")?**

## 4. Qué NO se espera de esta investigación

No se espera una recomendación de librería, framework o vendor. No se espera un mockup. Se espera
evidencia de la industria (productos reales, patrones documentados, literatura de UX/HCI) que
permita inclinar la balanza en las tres preguntas de la sección 3, organizada según las líneas de
investigación del research brief adjunto.
