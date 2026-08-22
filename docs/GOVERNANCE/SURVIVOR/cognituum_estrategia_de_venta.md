# Cognituum — Estrategia de Venta

**Documento de continuidad de la tesis estratégica.** No redefine qué es Cognituum — asume la tesis angosta ya cerrada: *persistencia del criterio técnico de una organización, a pesar del proveedor de IA que lo ejecutó.* Este documento traduce esa tesis en una secuencia de venta concreta.

---

## 1. Perfil de cliente ideal (ICP)

No es cualquier empresa que usa IA. Es una empresa donde **ya existe la cicatriz**, no solo el riesgo teórico.

### Señales de que una organización es candidata real

- Ya migró de un proveedor de IA a otro al menos una vez (Copilot → Cursor, GPT → Claude, etc.) y sintió la pérdida de contexto acumulado.
- Usa más de un proveedor de IA en paralelo, por decisión estratégica de riesgo, no por indecisión.
- Tiene equipos de ingeniería medianos a grandes (20+ ingenieros) donde la rotación de personal ya diluyó el "por qué" de decisiones técnicas pasadas.
- Opera en un sector regulado o auditado (fintech, salud, infraestructura crítica, gobierno) donde el criterio técnico tiene que sobrevivir revisiones externas.
- Tiene, o está por tener, una política explícita de "no lock-in de proveedor" a nivel de infraestructura — Cognituum extiende esa política al plano cognitivo.

### Señales de descarte (no vale la pena perseguir todavía)

- Equipos de 1-10 personas usando un solo proveedor de IA sin fricción percibida.
- Empresas donde la decisión de herramientas de IA la toma un individuo sin proceso de evaluación (venta imposible de escalar más allá de ese individuo).
- Startups en modo de supervivencia donde cualquier gasto no ligado a revenue inmediato es inviable — son early adopters ideales *después*, no ahora.

---

## 2. La secuencia de compra — nunca simultánea

```
CTO / VP Engineering          →         CEO / CFO / Chief Risk Officer
(evalúa, valida, piloto)                (aprueba presupuesto, firma)
        │                                         │
   Lenguaje de                              Lenguaje de
   arquitectura                             continuidad de negocio
```

**Regla dura: nunca se entra por el CEO primero.** Un pitch de continuidad de negocio sin validación técnica previa suena a seguro que nadie pidió. El CTO tiene que llegar al CEO ya convencido — la propuesta entra como algo que su propio equipo técnico está pidiendo, no como algo que un vendor externo empuja.

---

## 3. Mensaje por interlocutor

### Al CTO / VP Engineering

**Gancho de apertura:** *"¿Qué pasa con el criterio técnico de tu equipo el día que cambian de proveedor de IA?"*

No se abre con arquitectura. Se abre con la pregunta que ya sintió y no tuvo nombre hasta ahora. Recién después de que asienta, se entra en:

- Lock-in de contexto vs. lock-in de modelo — la distinción que la mayoría no ha articulado todavía, aunque ya la vivió.
- Cómo Cognituum cambia la unidad de auditoría de "sesión" a "intención" — algo que ningún proveedor individual puede ofrecerle, porque estructuralmente no tiene visibilidad fuera de su propia sesión.
- El piloto concreto: continuidad de un Intent interrumpido, retomado por un proveedor distinto sin pérdida de decisión ni evidencia — no una demo, una prueba que él mismo puede correr y verificar.

**Lo que el CTO necesita ver, no que le cuenten:** el resultado de EXC-007/008 corriendo contra su propio caso de uso, no un caso de uso genérico. Esto es determinante — la credibilidad técnica se gana con una corrida real, no con un deck.

### Al CEO / CFO / Chief Risk Officer

**Gancho de apertura:** *"¿Qué pasa si mañana el proveedor de IA del que dependen sube el precio 5x, cambia los términos, o directamente discontinúa el servicio?"*

Este interlocutor no necesita entender Execution Layer ni Contrato D. Necesita entender una sola cosa: **la organización posee su criterio técnico, revocable y portable, independientemente de qué le pase a cualquier proveedor externo.** Es lenguaje de seguro de continuidad de negocio, no de infraestructura.

**Frase de cierre para este nivel:** *"Cognituum — persistence of technical decisions across AI."* O su variante más directa: *"No dependas de que tu proveedor de IA recuerde por qué construiste lo que construiste."*

---

## 4. Los tres activos que hacen falta antes de vender en serio

No se vende esto con un deck. Se vende con evidencia. En orden de prioridad:

1. **El resultado de EXC-007/008 corriendo de verdad**, con las tres corridas consecutivas por par de swap que ya definimos, documentado con el mismo rigor que se le exigió a Codex — sin inflar resultados parciales como si fueran validación completa.
2. **Un caso de uso propio, documentado como historia**, no como especificación técnica: "nuestro propio equipo interrumpió un Intent en Codex, lo retomamos en Claude, y esto es exactamente lo que se preservó." La historia de origen (quedarse sin tokens a mitad de sesión) es un activo de venta legítimo si se cuenta bien — es prueba de que el problema es real porque nació de sentirlo, no de leerlo en un reporte de mercado.
3. **Un ROI cuantificable de lo que cuesta hoy no tener esto** — horas de ingeniero reconstruyendo contexto perdido tras un cambio de proveedor, tiempo de onboarding de un ingeniero nuevo sin historial de decisiones accesible. No hace falta un número perfecto; hace falta un número defendible.

Sin el punto 1, no hay nada que vender — solo hay una tesis, y ya aprendimos en esta misma sesión lo que pasa cuando una tesis se presenta como si fuera evidencia.

---

## 5. Objeciones esperables y cómo responderlas

| Objeción | De quién viene | Respuesta |
|---|---|---|
| "Ya tenemos memoria/logs con nuestro proveedor actual" | CTO | Esa memoria es *provider-scoped*. El día que cambien de proveedor, se queda con el proveedor anterior. Cognituum es lo que sobrevive ese cambio, no lo que reemplaza esa memoria mientras están con un solo proveedor. |
| "Esto agrega fricción a un flujo que ya funciona" | CTO / ingenieros | Cierto riesgo real, no una objeción a descartar. Responder con datos de fricción medida en el piloto, no con promesas. Si la fricción es alta, el producto tiene que resolver eso antes de escalar la venta — no es un problema de mensaje, es un problema de producto (ver Sección 8 de la tesis estratégica). |
| "¿Por qué no construimos esto internamente?" | CTO | Es exactamente lo que haría sentido si el costo de construirlo fuera bajo. No lo es — es la razón por la que sigue sin existir en el mercado a pesar de ser un problema evidente para cualquiera que usó más de un proveedor de IA. |
| "¿Qué pasa si Cognituum mismo desaparece?" | CEO / CFO | La pregunta correcta, y hay que responderla con honestidad, no con evasión: los artefactos (Intents, BISP, Evidence) tienen que ser exportables en formato abierto, no propietario cerrado — si Cognituum no garantiza portabilidad de sí mismo, contradice su propia tesis. |

---

## 6. Qué no hacer

- **No vender la versión amplia.** Ni memoria, ni auditoría, ni gobernanza genérica — cualquier vendedor tentado a ampliar el pitch para sonar más completo está repitiendo el error que la interpelación original identificó en el proyecto. El pitch angosto es más difícil de vender rápido, pero es el único defendible a diez años.
- **No liderar con arquitectura ante el CEO**, ni con continuidad de negocio ante el CTO — cada uno necesita el lenguaje del otro para desconfiar del vendedor.
- **No prometer el piloto antes de tenerlo corriendo de verdad.** Vender con `NOT_RUN` disfrazado de resultado es el error exacto que casi se comete dentro de este mismo proyecto — no hay razón para repetirlo hacia afuera.

---

## 7. Resumen ejecutivo de la secuencia

1. Identificar organizaciones con la cicatriz real, no el riesgo teórico (Sección 1).
2. Entrar siempre por el CTO, con el gancho de la pregunta que ya sintió, no con arquitectura de entrada (Sección 3).
3. Demostrar, no describir — EXC-007/008 corriendo contra su propio caso, no un demo genérico (Sección 4).
4. Dejar que el CTO lleve la propuesta al CEO, con el mensaje de continuidad de negocio, no de ingeniería (Sección 3).
5. Cerrar con el activo de portabilidad: incluso si Cognituum desapareciera, lo que preservó queda con la organización (Sección 5).
