# Cognituum Enterprise — Fundamentos Teóricos y Comerciales

**Documento de continuidad.** Asume cerradas la tesis técnica (persistencia del criterio técnico a través de proveedores de IA) y la estrategia de venta (secuencia CTO → CEO). Este documento responde una pregunta distinta: **qué significa, en términos de producto, marca y modelo comercial, que Cognituum sea software enterprise — y qué deja de ser posible una vez que se asume esto.**

---

## 1. Por qué es enterprise, no "empresas que pueden pagar más"

Esta distinción es la base de todo lo que sigue, y hay que sostenerla con precisión porque es fácil confundirla con una decisión de pricing.

**Enterprise no es un nivel de precio. Es una categoría de requisitos.** Un software es enterprise cuando el comprador necesita, antes de firmar, poder responder que sí a preguntas que nunca le haría un usuario individual:

- ¿Quién dentro de mi organización tiene acceso a qué, y cómo lo controlo?
- ¿Cómo audito lo que este sistema hizo, no solo lo que dice haber hecho?
- ¿Qué pasa con mis datos si dejo de pagar, o si el proveedor desaparece?
- ¿Cumple con los estándares de seguridad y compliance que ya me exigen a mí mis propios clientes o reguladores?
- ¿Puedo integrarlo con mi infraestructura de identidad y control de acceso existente (SSO, SCIM)?
- ¿Quién en mi organización responde si esto falla en producción — hay un SLA real?

Cognituum, por la naturaleza misma de su tesis —"la organización es dueña de su criterio técnico"— **convoca estas preguntas por diseño, no por accidente.** Un protocolo que promete preservar y transferir el activo más sensible de una organización (el porqué de sus decisiones técnicas) no puede presentarse como una herramienta liviana de productividad individual. Si lo hiciera, estaría contradiciendo su propia tesis: no se puede prometer propiedad organizacional del criterio técnico y al mismo tiempo venderse sin los controles que una organización necesita para confiar esa propiedad a un tercero.

**Conclusión:** no elegimos que Cognituum sea enterprise por ambición comercial. Es una consecuencia obligada de qué es lo que el protocolo promete guardar.

---

## 2. Qué cambia en el producto (no solo en el mensaje)

Esto es lo más importante de este documento, y lo más fácil de saltear: ser enterprise no es un cambio de logo y de precio. Es una lista de requisitos de producto que, si faltan, hacen que ningún CTO serio pueda llevar esto a su CEO, sin importar cuán buena sea la tesis técnica.

### Requisitos no negociables antes de vender a este comprador

| Categoría | Qué exige el comprador enterprise |
|---|---|
| **Identidad y acceso** | SSO (SAML/OIDC), SCIM para aprovisionamiento automático, roles y permisos granulares por Mandate/Intent, no solo por usuario. |
| **Auditoría del propio sistema** | No alcanza con que Cognituum audite decisiones técnicas — Cognituum mismo tiene que ser auditable: quién accedió a qué Intent, cuándo, y qué cambió. Meta-evidencia, no solo Evidence. |
| **Seguridad y compliance** | Certificaciones esperables según sector (SOC 2 Tipo II como mínimo; ISO 27001 según vertical; HIPAA si el cliente es salud). No es opcional para el ICP definido en la Sección 1 de la estrategia de venta — es la condición de entrada. |
| **Residencia y soberanía de datos** | Dónde vive físicamente el Intent, el BISP, la Evidence — con opción de despliegue en la región o infraestructura del cliente si el sector lo exige (gobierno, banca). |
| **Portabilidad garantizada de los propios artefactos** | Ya lo identificamos en la objeción del CFO: si Cognituum desaparece, el cliente tiene que poder llevarse sus Intents en formato abierto. Esto no es solo un argumento de venta — tiene que ser una capacidad de producto verificable, exportación real, no una promesa en el contrato. |
| **SLA y soporte dedicado** | Contrato de nivel de servicio, tiempos de respuesta garantizados, un punto de contacto humano — no solo documentación y foro comunitario. |
| **Gestión centralizada multi-equipo** | Un CTO no compra para un desarrollador, compra para toda la organización. Necesita panel de administración, políticas centralizadas, visibilidad agregada — no una instancia por usuario. |

**Ninguno de estos siete puntos es opcional si el comprador es el que definimos en la estrategia de venta.** Faltar en cualquiera de ellos no reduce la venta — la anula, porque el proceso de procurement de una organización de ese tamaño los va a exigir antes de llegar a la firma.

---

## 3. Qué cambia en la marca

Si el producto tiene que sostener estos requisitos, la identidad de marca tiene que comunicar la misma seriedad *antes* de que el prospecto llegue a leer la letra chica del contrato. Esto no es estética por estética — es señal de confianza para un comprador que está evaluando si le va a confiar el activo más sensible de su ingeniería.

### Principios de identidad visual y de tono

- **Autoridad, no simpatía.** El registro tiene que sonar más cerca de infraestructura crítica (Datadog, Palantir, HashiCorp) que de herramientas de productividad individual (Notion, Linear). No hay lugar para el tono lúdico o casual — el comprador enterprise lee informalidad como falta de seriedad institucional, incluso si el producto es técnicamente sólido.
- **Precisión antes que calidez.** El nombre "Cognituum" ya tiene esto a favor — es una palabra seria, sin gancho de consumo, que no promete simpatía sino exactitud. Eso hay que sostenerlo en tipografía, paleta y lenguaje: nada de ilustraciones amigables o mascotas, sí diagramas técnicos precisos, tipografía sobria, paleta reducida y de alto contraste.
- **El logo tiene que comunicar continuidad y estructura, no innovación disruptiva.** Un símbolo que sugiera cadena, nodo persistente o continuidad entre estados —algo cercano a un grafo o a un enlace que atraviesa nodos— comunica mejor la tesis ("persiste a través de") que un símbolo abstracto de "IA" genérico (cerebros, chips, circuitos) que hoy usa cualquier producto de IA sin distinción.
- **El vocabulario público tiene que evitar la palabra "IA" como protagonista.** Es contraintuitivo pero importante: la marca no vende "una herramienta de IA" — vende gobierno organizacional de un activo, donde la IA es la variable que cambia, no el centro del mensaje. Un comprador enterprise de seguridad y continuidad de negocio confía más en "protocolo de propiedad de decisiones técnicas" que en "plataforma de IA" — esta última categoría está saturada de ruido y desconfianza regulatoria en 2026.

### Lo que hay que evitar activamente

- Cualquier comparación con "Copilot para X" — posiciona a Cognituum como asistente, no como infraestructura de propiedad organizacional.
- Lenguaje de crecimiento viral o adopción bottom-up ("empezá gratis", "invitá a tu equipo") — ese lenguaje es de producto self-serve, y contradice el modelo de venta consultiva que ya definimos.
- Sobre-prometer con superlativos ("revolucionario", "el futuro de..."). El comprador enterprise de este perfil premia el lenguaje mesurado y verificable — "protocolo verificado con evidencia" pesa más que "solución revolucionaria" para este interlocutor específico.

---

## 4. Qué cambia en el modelo comercial

### Pricing

- **No hay tier gratuito ni self-serve real.** Puede existir un "pilot program" acotado en tiempo y alcance (ver Sección 5), pero no una versión gratuita persistente — un producto enterprise que se regala gratis señala que no está diseñado para este comprador.
- **Precio por contrato anual (ACV), no por asiento mensual.** El valor no escala con cuántas personas lo usan, escala con cuánto criterio técnico organizacional está en juego — puede cobrarse por volumen de Intents gobernados, por número de equipos, o por nivel de garantías (SLA, soporte, compliance) contratado.
- **Múltiples niveles de contrato**, típico de enterprise: un tier de "adopción inicial" (un equipo, alcance acotado, sin todos los siete requisitos de la Sección 2 activos) y un tier "organización completa" (todos los requisitos, todos los equipos, SLA completo).

### Motion de venta

- **Land-and-expand dentro de la organización, no entre organizaciones.** No se entra vendiendo a toda la empresa de una vez — se entra con un piloto acotado a un equipo de ingeniería (el que ya sintió la cicatriz, Sección 1 de la estrategia de venta), se corre EXC-007/008 contra su caso real, y desde ahí se expande a otros equipos con el CTO como sponsor interno.
- **Ciclo de venta largo, esperable entre 3 y 9 meses**, con procurement, revisión de seguridad y aprobación de comité — no hay forma de acortar esto artificialmente sin sacrificar exactamente los siete requisitos de la Sección 2 que hacen que la venta sea posible.

---

## 5. El riesgo que esta decisión introduce (y que no hay que ignorar)

Ser enterprise resuelve el problema de "a quién vender" pero abre uno nuevo: **el costo de construir los siete requisitos de la Sección 2 es alto, y ninguno de ellos valida ni refuta la tesis central.** SSO, SOC 2, portabilidad de datos — son condiciones de entrada al mercado, no evidencia de que el protocolo funciona.

Por eso el orden de trabajo no cambia por este documento: la prueba EXC-007/008 sigue siendo la prioridad técnica inmediata, sin ella no hay nada que llevarle a un piloto de un solo equipo, mucho menos a un comprador enterprise completo. Lo que este documento agrega es la hoja de ruta de **qué hace falta construir después de que la tesis esté validada**, para que la validación técnica pueda convertirse en un contrato real. Construir la capa enterprise antes de validar la tesis sería repetir, en un plano distinto, el mismo error que ya frenamos dos veces en esta conversación: invertir en infraestructura antes de tener la evidencia que la justifica.

---

## 6. Resumen ejecutivo

- Cognituum es enterprise por la naturaleza de lo que promete guardar (el criterio técnico de una organización), no por una decisión de pricing.
- Ser enterprise implica siete requisitos de producto no negociables: identidad y acceso, auditoría del propio sistema, seguridad/compliance, soberanía de datos, portabilidad garantizada, SLA, y administración centralizada.
- La marca tiene que comunicar autoridad institucional, no simpatía de producto de consumo — desde el nombre (que ya está bien encaminado) hasta el logo, la tipografía y el vocabulario público.
- El modelo comercial es de contrato anual y venta consultiva de ciclo largo, con land-and-expand dentro de la organización, no crecimiento viral entre organizaciones.
- Ninguno de estos cambios se implementa antes de cerrar la validación técnica (EXC-007/008) — es la hoja de ruta de lo que sigue después, no un desvío del camino actual.
