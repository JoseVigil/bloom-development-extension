# Cognituum — Documento de Visión Institucional

**La promesa de diez años**

---

## 0. Qué es este documento y qué no es

Este documento no explica cómo funciona Cognituum. Para eso existen las especificaciones técnicas (BTIPS, Execution Layer, Mandates Agénticos). Este documento explica **por qué existe Cognituum, a quién le pertenece la promesa que hace, y por qué esa promesa solo tiene sentido si se sostiene diez años, no diez meses.**

No es un pitch de producto. Es la constitución que toda decisión de producto, marca y venta tiene que poder trazar hasta acá sin contradicción.

---

## 1. La tesis, en una frase

> El criterio técnico de una organización —por qué se construyó lo que se construyó, qué se descartó y por qué, qué se aprobó bajo qué condición— le pertenece a la organización, no al proveedor de inteligencia artificial que participó en construirlo.

Todo lo demás en este documento es consecuencia de esa frase.

---

## 2. Por qué diez años, y no "lo más rápido posible"

La mayoría del software se mide en velocidad de entrega. Cognituum se mide en algo distinto: **si dentro de diez años, una organización puede cambiar tres veces de proveedor de inteligencia artificial sin perder el porqué de ninguna decisión técnica que tomó en el camino.**

Esto no es una aspiración de marketing. Es la única unidad de medida coherente con lo que el producto promete guardar. Un sistema de gobierno de decisiones que se mide en trimestres no es un sistema de gobierno — es una herramienta de productividad con lenguaje prestado. La organización que confía su criterio técnico a Cognituum lo hace bajo el supuesto de que va a seguir existiendo cuando el proveedor de IA que usa hoy ya no exista, haya cambiado de términos, o haya sido reemplazado por otro mejor. Esa es la apuesta, y hay que nombrarla así de directo.

---

## 3. Los dos pilares — ninguno sustituye al otro

### Pilar 1 — Persistencia a través de proveedores

Un Intent —una decisión técnica con su razón, su contexto y su evidencia— sobrevive el cambio de motor de inteligencia artificial que lo ejecuta. No porque el nuevo motor "herede" la sesión anterior, sino porque la decisión nunca vivió adentro de esa sesión en primer lugar. Vivía en un protocolo neutral, afuera de cualquier proveedor.

**Estado:** tesis definida con precisión, validación empírica en curso. No se declara cerrada hasta que la evidencia lo confirme.

### Pilar 2 — Gobierno de la autonomía

A medida que la ejecución de código se vuelve más autónoma —agentes que deciden su propio siguiente paso, no solo ejecutan instrucciones fijas— la autoridad humana sobre esas decisiones no se diluye. Cada paso, sin importar cuán autónomo, sigue siendo trazable a una autorización humana verificable.

**Estado:** diseño formal completo (Mandates Agénticos, Capability Seam, firma individual de cada intent sin excepción).

**El paradigma que lo sostiene:** Cognituum no gobierna la autonomía adaptando el modelo de *"Agent Loop"* que domina hoy la industria — Pensar, Actuar, Evaluar, Repetir, con el agente viviendo dentro del propio plano de ejecución. Gobierna con un modelo donde la inteligencia artificial nunca ejecuta directamente: solo propone, dentro de un radio acotado por una autoridad humana firmada, y cada propuesta se valida de forma determinista antes de tocar el sistema. El detalle arquitectónico de cómo se implementa esto —Mandate, Nucleus, Intents— vive en las especificaciones técnicas (BTIPS, Mandates Agénticos); acá lo único que importa es la consecuencia institucional: la autonomía puede crecer sin que la autoridad humana se diluya un solo paso, consistente con el estado real de este pilar — diseño formal completo, validación de producción todavía en curso.

### Por qué estos dos, y no uno solo

Un sistema que resuelve portabilidad pero no gobierno de autonomía es frágil ante la próxima generación de herramientas —donde la IA no solo escribe código sino que decide qué escribir. Un sistema que gobierna la autonomía pero queda atrapado en un solo proveedor no resuelve el problema que le dio origen a Cognituum. La promesa de diez años exige los dos, sostenidos al mismo tiempo, sin que ninguno se presente como sustituto del otro mientras el otro sigue sin validar.

---

## 4. Por qué es infraestructura institucional, no un utilitario

Un utilitario se elige. Se prueba gratis, se adopta si conviene, se abandona sin costo si aparece algo mejor. Cognituum no puede ser eso, por la naturaleza misma de lo que guarda: si el criterio técnico de una organización se pudiera perder sin fricción al cambiar de herramienta, no habría diferencia entre usar Cognituum y no usarlo.

La prueba de que algo es infraestructura, y no utilitario, es esta: **¿qué le pasa a la organización el día que decide dejar de usarlo?** Un utilitario se desinstala. Infraestructura institucional deja un vacío — porque algo que dependía de ella deja de tener dónde vivir. Cognituum tiene que aspirar deliberadamente a ese segundo lugar, con una condición no negociable que lo distingue de un lock-in disfrazado de infraestructura: **lo que se pierde al dejar de usar Cognituum no debe ser el criterio técnico en sí —eso siempre exportable, siempre propiedad de la organización— sino la comodidad de tenerlo gobernado, correlacionado y accesible en un solo lugar.**

Esa distinción es la que separa a Cognituum de exactamente el problema que busca resolver: un proveedor que atrapa lo que promete liberar.

---

## 5. A quién le pertenece esta promesa

No a un desarrollador individual evaluando herramientas para su flujo personal. A una organización — representada, en la práctica, por quien responde cuando algo sale mal: un CTO que tiene que poder explicar por qué se tomó una decisión técnica meses después de que la sesión que la originó ya no existe; un CEO o CFO que necesita que la continuidad del negocio no dependa de la salud financiera o la política de un proveedor externo de IA; un equipo de seguridad o compliance que necesita auditar no solo qué código se escribió, sino bajo qué autorización y con qué criterio.

Esta promesa no está dirigida a quien quiere ir más rápido hoy. Está dirigida a quien va a tener que responder, dentro de un año, por qué se hizo lo que se hizo.

---

## 6. Lo que Cognituum no es — con la misma firmeza que lo que es

- No es una capa de memoria o auditoría que cualquier proveedor de IA de frontera pueda replicar como feature. Si lo fuera, perdería en un mercado donde esos proveedores tienen recursos que Cognituum nunca va a igualar.
- No es un wrapper que traduce instrucciones para distintos CLIs. Eso es integración, no protocolo — absorbible por cualquiera de esos CLIs en su próxima versión.
- No es una promesa de velocidad de desarrollo. Si gobernar una decisión cuesta más que el valor de no perderla, el producto falló en su propósito, sin importar cuán elegante sea su arquitectura.
- No es gratuito, ni self-serve, ni de adopción viral — no porque eso sea inalcanzable, sino porque contradice lo que promete guardar. Una organización no le confía su criterio técnico a algo que se regala sin fricción a cualquiera.

---

## 7. El compromiso que sostiene todo lo anterior

Toda decisión de producto, de arquitectura o de venta que se tome de acá en adelante tiene que poder responder, sin evasión, a esta pregunta: **¿esto acerca o aleja a Cognituum de que una organización pueda cambiar de proveedor de IA tres veces en diez años sin perder el porqué de ninguna decisión técnica?**

Si la respuesta no es clara, la decisión no está lista — sin importar cuán urgente parezca, cuán atractiva sea la demo, o cuán rápido prometa acelerar una venta.

---

## 8. Estado actual, dicho con la misma honestidad con la que se pide en todo lo demás

- El Pilar 1 (persistencia a través de proveedores) tiene su prueba definida y **todavía no corrida de punta a punta**.
- El Pilar 2 (gobierno de la autonomía) tiene diseño formal completo, sin implementación de producción todavía verificada en las cuatro fases de su roadmap.
- La capa enterprise (seguridad, compliance, portabilidad garantizada, SLA) está identificada como requisito, no construida.

Esta sección no se borra cuando cada punto se resuelva. Se actualiza. Un documento de visión institucional que nunca muestra su propio estado de avance deja de ser honesto con la misma organización a la que le pide que confíe su criterio técnico por diez años.
