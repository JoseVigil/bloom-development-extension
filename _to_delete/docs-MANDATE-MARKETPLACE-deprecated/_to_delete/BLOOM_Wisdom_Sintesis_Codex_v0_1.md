# Wisdom — Handshake y Síntesis (aporte de Codex, v0.1)

**Tipo:** Material de referencia — producido en el work de Codex que continúa la investigación de Wisdom, guardado acá como contexto para el track de Backend en este cowork.
**Estado:** Snapshot de lo compartido por Jose el 2026-08-29. No se edita ni se amplía desde este cowork — el desarrollo de Wisdom sigue en Codex.
**Relación con el documento previo:** complementa y profundiza `BLOOM_Wisdom_Handshake_Investigacion_v0_1.md` (mismo directorio) — aquel dejaba registrados los gaps sin resolver; este documento es la primera interpretación más completa de Codex sobre esos mismos gaps, y define además, por primera vez, un flujo de handshake concreto (aunque todavía no artefacto/schema formal).

---

## Cómo funcionaría el handshake (nota de Jose, 2026-08-29)

> El handshake de Wisdom con el backend debería ser un intercambio gobernado y verificable: el Nucleus prepara un Mandate Package sanitizado junto con evidencia agregada de su utilidad, el backend valida identidad del publisher, firma, integridad, versión, permisos y protección contra replay, y registra únicamente el artefacto publicable y su procedencia, nunca el estado ni la evidencia cruda local. Al adoptarlo, el Nucleus receptor descarga el paquete, verifica nuevamente su procedencia, lo rearraiga con identidades y capacidades propias y lo firma bajo su autoridad; el backend facilita descubrimiento y distribución, pero no se convierte en dueño de la Wisdom ni decide por sí mismo su promoción.

**Por qué esto importa para el track de Backend (sin decidir nada de Wisdom acá):** confirma que el rol del backend de Cloudflare frente a Wisdom es siempre el mismo que ya le dimos frente a Metamorph/Batcave — **verificador y distribuidor, nunca dueño ni quien decide promoción**. Es exactamente la misma razón por la que `Backend_Cloudflare_Arquitectura_v0_1.md` y `BLOOM_Wisdom_Handshake_Investigacion_v0_1.md` (§6) ya proponían reservar, sin implementar todavía, una columna `originType` y un prefijo `wisdom/` separado en R2: el backend registra el artefacto publicable y su procedencia, no la evidencia cruda ni el estado local — esta nota lo confirma en lugar de contradecirlo.

---

## Síntesis completa (Codex) — "Wisdom — síntesis y lineamiento para continuar la investigación"

Este work continúa directamente la investigación inicial de Wisdom. El objetivo ya no es volver a demostrar que Wisdom está conceptualmente abierta, sino profundizar sobre tres preguntas concretas:

1. ¿Cómo se levantan los datos que podrían convertirse en Wisdom?
2. ¿Qué información específica se captura, conserva, sanitiza y comparte?
3. ¿Cómo se empaqueta y adopta un Mandate entre organizaciones?

### Conclusión principal

La documentación existente define con bastante precisión dos mecanismos importantes:

- El **Mandate Package**, que permite exportar e instalar un Mandate entre organizaciones.
- El **Cognitive Evidence Model**, que define una representación federada, sanitizada y agregada de la experiencia producida por múltiples Nucleus.

Sin embargo, todavía no está definido el puente completo:

```text
mandate_state.json + orbital_agentic_state.json
        ↓
evidencia derivada
        ↓
Gravity reutilizable
        ↓
Wisdom
```

La principal grieta ya no es "qué podría contener la evidencia", porque el Cognitive Evidence Model ofrece una taxonomía bastante concreta. La grieta real es cómo se deriva esa evidencia desde la ejecución local, quién valida esa derivación y qué criterio permite promoverla primero a Gravity reutilizable y finalmente a Wisdom.

Wisdom no debe tratarse como otro nombre para:

- el historial de ejecución;
- `mandate_state.json`;
- `orbital_agentic_state.json`;
- `cognitive_evidence`;
- un Mandate Package;
- ni un catálogo de archivos.

Son piezas relacionadas, pero conceptualmente diferentes.

### Cadena conceptual confirmada

La cadena fundacional continúa siendo:

```text
Persona
  ↓
Experiencia
  ↓
Criterio
  ↓
Postura
  ↓
Gravity
  ↓
Aplicación repetida + evidencia
  ↓
Gravity reutilizable
  ↓
Wisdom
```

La postura es la posición cognitiva de una persona frente a una situación. Gravity permite que ese criterio tenga consecuencias operacionales. Wisdom aparece después de que ese criterio fue aplicado, produjo evidencia y demostró capacidad de reutilización.

Por lo tanto, Wisdom no nace automáticamente de la telemetría ni de la repetición. La documentación todavía no define:

- cuánta evidencia es suficiente;
- qué tipo de reutilización cuenta;
- quién propone la promoción;
- quién la aprueba;
- quién la firma;
- ni qué autoridad conserva el originador.

El principio rector que debe mantenerse es:

> La sabiduría pertenece a quien la produce.

Esto obliga a resolver ownership antes de cerrar un schema definitivo.

### Qué es el Mandate Package

El Mandate Package es el mecanismo técnico ya especificado para distribuir un Mandate entre organizaciones.

No es un nuevo tipo de Mandate y tampoco es Wisdom. Es una proyección portable del Mandate local, desacoplada de la identidad y los recursos propietarios de la organización de origen.

Su estructura definida es:

```text
{slug}-{version}.mandate-package/
├── manifest.json
├── mandate.json
├── compliance.linter.json
├── cognitive_assets/
│   ├── embeddings.json
│   └── gene_blueprints/*.json
└── integrity/
    ├── checksum.sha256
    └── signature.json
```

Durante la exportación:

- se eliminan los identificadores locales;
- se reemplazan `projectId`, `organizationId` y `mandateId` por tokens de despliegue;
- no viaja el estado operacional;
- no viajan credenciales, paths absolutos ni referencias locales a Genes;
- los Genes se convierten en blueprints semánticos;
- cada embedding viaja con su texto fuente y el modelo utilizado;
- se ejecuta un linter bloqueante;
- se calcula un checksum;
- el paquete completo se firma para acreditar integridad y procedencia.

Durante la instalación, la organización receptora:

- verifica checksum y firma;
- comprueba compatibilidad;
- genera identidades locales nuevas;
- rearraiga el Mandate en su proyecto y organización;
- reusa embeddings compatibles o los vuelve a generar;
- resuelve los Gene Blueprints contra sus capacidades locales;
- ejecuta su validación cognitiva;
- y firma localmente el Mandate bajo su propia autoridad.

La adopción no transfiere la autoridad contractual del publicador. Transfiere conocimiento portable para que el comprador lo verifique, lo rearraigue y lo adopte bajo su propio Nucleus.

La fórmula es:

```text
procedencia verificable
→ desacople de identidad
→ rearraigo local
→ validación local
→ firma local
```

### Qué datos cognitivos ya están modelados

El Cognitive Evidence Model define las siguientes categorías:

- decisiones tomadas;
- alternativas rechazadas;
- trade-offs;
- supuestos;
- hipótesis y resultados;
- fallos y causas raíz;
- remediaciones;
- historial de reutilización;
- evolución entre versiones.

La evidencia compartida debe usar:

- taxonomías cerradas y versionadas;
- tags conceptuales;
- magnitudes y tiempos convertidos en buckets;
- contexto generalizado;
- narrativas breves, generadas por paráfrasis y sometidas a un Evidence Linter;
- agregación estadística;
- k-anonimato;
- privacidad diferencial;
- y confianza global visible.

No pueden salir de la organización:

- código o diffs;
- texto crudo de intents;
- razonamiento original copiado;
- identificadores locales;
- secretos;
- nombres internos sensibles;
- timestamps o magnitudes exactas;
- embeddings individuales;
- `mandate_state.json` completo;
- ni `orbital_agentic_state.json` crudo.

El modelo federado trabaja con contribuciones sanitizadas de muchos Nucleus. El agregador produce clústeres y centroides; el comprador descarga el epoch agregado y realiza búsquedas localmente. Esto protege también la privacidad del patrón de consultas del comprador.

Pero `cognitive_evidence` no debe declararse equivalente a Wisdom. Es infraestructura de evidencia que Wisdom probablemente utilizará.

### La pregunta crítica: cómo se levantan los datos

Actualmente existen dos fuentes locales distintas:

- `mandate_state.json`, que conserva el estado operacional del workflow.
- `orbital_agentic_state.json`, que documenta turnos, propuestas, rechazos, reglas Gravity aplicadas, decisiones de Nucleus y consumo del loop.

No está definido el proceso que transforma esas fuentes en evidencia cognitiva.

El nuevo work debe investigar:

1. Qué eventos se observan.
2. Cómo se correlacionan Mandate, acción, intent, turno y regla Gravity.
3. Qué evidencia se deriva automáticamente.
4. Qué información requiere interpretación humana.
5. Quién genera los `narrativeDigest`.
6. Quién verifica que la síntesis representa correctamente la experiencia.
7. En qué momento se ejecuta el Evidence Linter.
8. Qué queda exclusivamente en el Nucleus.
9. Qué puede salir hacia el agregador.
10. Qué consentimiento o autoridad habilita esa salida.
11. Cómo se conserva la relación con la postura humana originaria sin exponer identidad sensible.
12. Qué resultado pasa a ser candidato a Gravity reutilizable.

Este proceso debe definirse antes de diseñar un paquete propio de Wisdom.

### Qué debe resolver Wisdom y qué no debe inventarse todavía

El work de Wisdom debe avanzar sobre:

- el pipeline de levantamiento y derivación;
- la clasificación de datos locales, exportables y agregables;
- la relación entre evidencia, Gravity reutilizable y Wisdom;
- el contenido mínimo necesario para explicar por qué un Mandate merece ser adoptado;
- la procedencia y trazabilidad;
- el modelo de adopción interorganizacional;
- y los bloqueadores de gobernanza que impiden cerrar el handshake.

No debe asumir todavía:

- un schema definitivo de Wisdom;
- un umbral automático de promoción;
- un endpoint de promoción;
- un registry centralizado de publishers;
- un modelo comercial;
- un mecanismo definitivo de revocación;
- ni una asignación de ownership no decidida.

### Bloqueadores que deben quedar visibles

1. **Criterio de promoción:** no está definido cuándo la evidencia es suficiente para producir Gravity reutilizable o Wisdom.
2. **Ownership:** no está resuelta la relación entre persona, organización, publisher y organización adoptante.
3. **`publisherKeyRef`:** falta definir cómo se identifican, distribuyen y verifican las claves públicas de los publishers.
4. **Consentimiento y autoridad:** no está definido quién autoriza la derivación y publicación de evidencia.
5. **Trust y lifecycle:** faltan anti-replay, expiración, revocación, retiro y disputa.
6. **Gobierno de taxonomías:** falta definir quién administra `evidenceTaxonomy.json`.
7. **Auditoría de privacidad:** falta validar que el Evidence Linter realmente evita reidentificación.
8. **Adopción de Gravity:** falta establecer cómo una organización evalúa una Gravity externa frente a su propia jerarquía.
9. **Pillars:** Wisdom aparece en Conductor clasificado por Security, Infrastructure y Governance, pero el campo todavía no está confirmado en el schema.
10. **Artefacto propio:** no existe todavía un schema o paquete denominado formalmente Wisdom.

### Lineamiento propuesto para la continuación

El desarrollo debería organizarse en este orden:

**Eje 1 — Levantamiento:** definir las fuentes locales y el proceso que produce evidencia derivada, sin publicar todavía nada.

**Eje 2 — Clasificación de datos:** separar con precisión:

```text
dato crudo local
→ evidencia derivada local
→ evidencia sanitizada exportable
→ evidencia agregada federada
→ Gravity reutilizable candidata
→ Wisdom promovida
```

**Eje 3 — Empaquetado:** tomar el Mandate Package como vehículo técnico existente y determinar qué información adicional de procedencia, evidencia o promoción necesitaría acompañar a un Mandate adoptable desde Wisdom. No se debe modificar prematuramente el Mandate Package ni declarar que ya es un Wisdom Package.

**Eje 4 — Adopción:** definir qué significa adoptar: instalar técnicamente; validar compatibilidad; evaluar evidencia; aceptar o adaptar Gravity; rearraigar localmente; firmar bajo autoridad propia; conservar atribución y procedencia sin transferir silenciosamente ownership.

**Eje 5 — Gobernanza:** elevar para decisión explícita: ownership; promoción; publisher identity; trust model; revocación; retención; licenciamiento o derechos de uso; y conflicto entre Gravity importada y Gravity local.

### Resultado esperado del próximo tramo

El próximo documento no debería intentar cerrar Wisdom por completo. Debería producir:

1. Un mapa verificable de fuentes de datos.
2. Un pipeline de levantamiento con puntos de intervención humana.
3. Una matriz de datos: local, derivado, exportable, agregado y publicable.
4. La relación exacta entre Mandate Package y Wisdom.
5. Un modelo de adopción interorganizacional.
6. Una lista reducida de decisiones de gobernanza que José debe cerrar.
7. Una separación explícita entre decisiones existentes, propuestas y asuntos todavía abiertos.

Ese resultado permitirá continuar la aventura de Wisdom dentro del repo sin perder el trabajo conceptual del cowork cloud y sin convertir hipótesis en arquitectura decidida.

---

*Fin del snapshot. Origen: work de Codex, compartido por Jose el 2026-08-29. El desarrollo activo de Wisdom continúa en ese work; este cowork queda enfocado en el track de Backend.*
