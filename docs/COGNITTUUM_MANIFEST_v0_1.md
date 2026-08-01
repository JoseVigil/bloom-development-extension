# 🧬 Cognittuum Manifest — v0.1 (borrador)

> *Antes conocido como BTIP (Bloom Technical Intent Package). Cognittuum no es un rebranding cosmético: es el nombre que corresponde a lo que el sistema siempre quiso ser — un tejido (continuum) de cognición compartida entre ingenieros y máquinas, donde la máquina ejecuta y el humano decide.*

---

## Preámbulo

Todo sistema que declara automatizar el desarrollo de software tarde o temprano enfrenta la misma pregunta: **¿quién es la fuente?**

La respuesta que domina la industria hoy es el agente. Loops autónomos, ejércitos de agentes, orquestas de modelos decidiendo por sí mismos qué construir, cómo y cuándo. Cognittuum responde distinto. No porque desconfíe de la IA, sino porque entiende con precisión **qué puede hacer la IA y qué no puede hacer todavía, ni con más cómputo, ni con más loops, ni con más agentes**: no puede tener experiencia. No puede haber vivido el error que enseña. No puede sentir el peso de una decisión de arquitectura tomada bajo presión de producción real. Eso es exclusivamente humano, y es exactamente lo que este sistema existe para capturar, preservar y multiplicar.

Cognittuum no es un framework de agentes. Es la infraestructura que lleva la ingeniería de software al límite **usando IA como instrumento**, mientras mantiene al ingeniero como el único origen legítimo de la decisión cognitiva, experimentada y creativa.

---

## 1. Principio fundacional — El humano como fuente

> **El ser humano es la única mente creativa de la Tierra. Cognittuum no reemplaza esa mente: la instrumenta.**

Esto no es una frase decorativa — es una restricción de diseño que ya vive en la arquitectura:

- **Nucleus firma, pero no decide por nadie.** Es árbitro de identidad y gobernanza, no autor de intención (`§2.2 Nucleus Governance Layer`).
- **El Companion da segunda opinión, nunca primera.** Por diseño, vive en un panel lateral aparte de la sesión principal del ingeniero — «Principio de Sesión Prístina» — precisamente para no contaminar ni sustituir el criterio del ingeniero con ruido de gobernanza automatizada (`§2.3 Companion`).
- **El Conductor convierte conflicto técnico en decisión asistida, no en decisión automática.** El merge cognitivo consulta al modelo, pero es el ingeniero quien fuerza la reconciliación a través de un intent `cor` (`§2.4`).
- **La autoridad nunca se distribuye, aunque el acceso sí** — invariante ya explícito para Alfred y la app mobile (`§10.5`), y que Cognittuum eleva a ley general del sistema: ningún canal remoto, ningún agente, ningún loop autónomo adquiere autoridad. Solo la ejerce quien la tiene: el humano, a través de Nucleus.

Los agentes, los loops y lo que venga como "ejército de harness cognitivos" no son la fuente de desarrollo. Son **superficie de ejecución**, subordinada siempre a la intención firmada por un humano.

---

## 2. Los Intents como protocolo agnóstico de intercambio

Un Intent no es un prompt ni un log. Es la **unidad mínima de verdad técnica**: qué se decidió, con qué contexto, con qué entradas, con qué efecto en el sistema.

Cognittuum declara al Intent como **moneda de intercambio agnóstica** entre:

- humano ↔ humano (transferencia de conocimiento entre ingenieros),
- humano ↔ máquina (instrucción gobernada, nunca ambigua),
- organización ↔ organización (a través de Mandates, ver §3).

Agnóstica significa que no depende de qué modelo, qué proveedor de IA, ni qué herramienta la ejecutó. El Intent sobrevive al modelo que lo originó. Esto es lo que le da al sistema **gobernanza** (todo queda firmado y trazable por Nucleus) y **continuidad** (el conocimiento no vive en memoria volátil de un modelo ni en un prompt efímero — vive en el filesystem, versionado, reconstruible).

Los cinco tipos existentes (`dev`, `doc`, `exp`, `inf`, `cor`) no son categorías técnicas arbitrarias: son los cinco modos en que una decisión humana puede manifestarse en trabajo de ingeniería. Cognittuum no necesita inventar una sexta forma de expresar intención — necesita profundizar la fidelidad con la que estas cinco capturan **cómo piensa realmente un ingeniero experimentado**.

---

## 3. El Mandate como cúspide — memoria acumulable y aprendiz de la experiencia

Si el Intent es la unidad atómica de decisión, el **Mandate es la síntesis**: la suma gobernada de intents que, una vez agrupada, deja de ser solo automatización y se convierte en **conocimiento operativo codificado** — la experiencia de haber resuelto un problema, con la firma de quién lo resolvió y bajo qué criterio.

Esto es lo que ya está diseñado en el marketplace horizontal (`§7`): un Mandate publicado no es código genérico, es la huella de una decisión humana experta, empaquetada para que otra organización la adopte sin heredar ambigüedad.

Cognittuum lleva esta idea un paso más allá de lo que hoy está escrito en el BTIP:

> **El Mandate no es solo el artefacto que se transfiere. Es el punto donde el sistema aprende.**

Cada Mandate ejecutado, pausado, corregido o abandonado es una señal sobre cómo decide un ingeniero con experiencia real frente a un problema real. Acumulado a través de la organización — y eventualmente del ecosistema horizontal completo — ese cuerpo de Mandates se convierte en la fuente de conocimiento compartido más valiosa de Cognittuum: no un modelo entrenado sobre texto genérico de internet, sino un cuerpo vivo de **decisiones de ingenieros reales, validadas en producción real**, gobernado, versionado y trazable.

Esto exige una precisión importante, no negociable: **el Mandate aprende de las decisiones humanas — no las sustituye.** El aprendizaje acumulado sirve para dar mejor contexto, mejores sugerencias, mejores segundas opiniones (Companion) al próximo ingeniero. Nunca para que el sistema decida en su lugar. Cognittuum es, en esto, exactamente lo opuesto a un modelo que se auto-mejora ejecutando sus propios loops: es un sistema que se mejora **absorbiendo criterio humano**, uno decisión firmada a la vez.

```
Intent  → hecho técnico individual, atómico, firmado
Action  → agrupación semántica dentro de un objetivo
Mandate → contrato estratégico firmado, transferible, y ahora también:
          UNIDAD DE APRENDIZAJE ORGANIZACIONAL ACUMULABLE
```

---

## 4. Invariantes de Cognittuum

Estos son los límites que ninguna versión futura del sistema — ni la presión de escalar agentes, ni la conveniencia de automatizar más — puede cruzar:

1. **Ningún agente ni loop autónomo posee autoridad.** Solo la ejerce, y siempre, un Nucleus firmando en nombre de un humano identificado.
2. **Todo Intent y todo Mandate es trazable a la decisión que lo originó.** No hay conocimiento anónimo en el sistema.
3. **La IA amplía la capacidad de decidir del ingeniero; nunca la reemplaza.** Companion, Conductor y Plugin son instrumentos de segunda opinión y ejecución — jamás de primera decisión.
4. **El conocimiento acumulado en Mandates se comparte gobernado, no se impone.** El marketplace horizontal transfiere experiencia entre organizaciones; nunca autoridad sobre cómo cada una decide usarla.
5. **La autoridad es siempre local a quien la ejerce.** El acceso puede volverse remoto, distribuido, móvil — la autoridad, nunca.

---

## 5. Cierre

Cognittuum no promete reemplazar al ingeniero. Promete lo contrario: que la experiencia de ese ingeniero — su criterio, sus errores aprendidos, sus decisiones bajo presión real — deje de perderse en prompts efímeros y se convierta en la infraestructura misma sobre la que la próxima decisión, propia o ajena, se apoya.

La IA ejecuta. El humano decide. El Intent lo registra. El Mandate lo recuerda.

---

*Este es un borrador v0.1 pensado para discutirse y refinarse. Puntos abiertos sugeridos para la próxima iteración: (a) mecanismo concreto de "aprendizaje acumulable" de Mandates — ¿qué se persiste exactamente y dónde vive?; (b) cómo se relaciona esto con `Bloom Sensor` / `energy_index` como señal de presencia cognitiva; (c) versión corta ("elevator pitch") de este manifiesto para pitch deck / landing.*
