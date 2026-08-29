# WISDOM — Scope de Desarrollo y Continuidad

**Estado:** Work de arquitectura e investigación. No autoriza implementación ni resuelve pendientes de gobernanza por inferencia.

**Propósito:** conservar el contexto, alcance, decisiones existentes, hipótesis y bloqueadores del Work WISDOM para avanzar de forma acumulativa sin confundir estado operacional, evidencia, Gravity, Wisdom y distribución entre organizaciones.

## Punto de partida

La investigación obligatoria de referencia es:

- `docs/WISDOM/BLOOM_Wisdom_Handshake_Investigacion_v0_1.md`
- `docs/WISDOM/BLOOM_Wisdom_Sintesis_Codex_v0_1.md`
- `docs/MANDATE/MARKETPLACE/BLOOM_Mandate_Package_Spec_v1_0_0.md`
- `docs/MANDATE/MARKETPLACE/BLOOM_Cognitive_Evidence_Model_v1_0_0.md`

La cadena bajo investigación es:

```text
mandate_state.json + orbital_agentic_state.json
        ↓
evidencia derivada
        ↓
Gravity reutilizable
        ↓
Wisdom
        ↓
publicación, distribución y adopción gobernada
```

## Decisiones ya tomadas

- Wisdom no es el historial de ejecución, `mandate_state.json`, `orbital_agentic_state.json`, `cognitive_evidence` ni un Mandate Package.
- La evidencia cruda, el estado operacional y los registros locales permanecen en el Nucleus de origen.
- El Mandate Package es el mecanismo técnico existente de portabilidad: sanitiza identidades y dependencias locales, verifica integridad/procedencia y permite rearraigo y firma local en el Nucleus adoptante.
- El Cognitive Evidence Model es la base existente para clasificar y federar evidencia; no equivale por sí mismo a Wisdom.
- El backend puede validar, registrar, descubrir y distribuir artefactos publicables, pero no se convierte automáticamente en dueño de Wisdom ni decide su promoción.
- La adopción interorganizacional conserva autoridad local: verificar, descargar, rearraigar, adaptar y firmar bajo el Nucleus receptor.

## Mecanismos existentes

| Mecanismo | Rol confirmado | Límite |
|---|---|---|
| Mandate Package | Portabilidad técnica de Mandates entre organizaciones | No es Wisdom ni transfiere estado operacional o autoridad contractual. |
| Cognitive Evidence Model | Clasificación, sanitización y agregación federada de evidencia | No define promoción a Gravity reutilizable o Wisdom. |
| `mandate_state.json` | Estado operacional local del Mandate | No viaja en paquetes ni debe publicarse crudo. |
| `orbital_agentic_state.json` | Registro durable de ejecución agéntica | No equivale a evidencia publicable ni a Wisdom. |
| Nucleus | Autoridad local de identidad, validación, rearraigo y firma | No existe todavía un contrato de Wisdom que implemente estos actos. |

## Hipótesis de trabajo

- La evidencia derivada deberá distinguirse del dato crudo local antes de cualquier publicación.
- Gravity reutilizable y Wisdom serán etapas posteriores a evidencia validada; su criterio de promoción todavía no está definido.
- Cualquier artefacto distribuible deberá conservar procedencia verificable sin transferir silenciosamente identidad, ownership o autoridad.
- El flujo futuro deberá respetar la progresión: experiencia → Gravity → aplicación repetida → evidencia → Gravity reutilizable → Wisdom.

## Alcance del desarrollo

1. Fuentes y levantamiento de datos locales.
2. Evidencia derivada y puntos de validación humana.
3. Clasificación entre dato local, exportable, agregado y publicable.
4. Relación entre evidencia, Gravity reutilizable y Wisdom.
5. Empaquetado mediante Mandate Package.
6. Handshake con el backend.
7. Adopción y rearraigo interorganizacional.
8. Ownership, promoción, firma, revocación y trust.
9. Integración futura con Conductor y clasificación por Pillars.

## Relaciones con otros sistemas

- **Mandates:** origen de estado operacional y vehículo técnico existente de portabilidad.
- **Gravity / Orbital:** contexto de ejecución, posturas y evidencia de aplicación repetida; no debe confundirse con Wisdom promovida.
- **Nucleus:** autoridad local para validación, rearraigo, firma e identidad.
- **PALADIN:** relación futura de producto, composición y propiedad entre individuo y organización.
- **Conductor:** superficie futura de exploración/clasificación de Wisdom; el campo Pillar no está confirmado.
- **Backend / Marketplace:** validación de publisher, permisos, firma, integridad, versión y anti-replay; almacenamiento del artefacto distribuible y metadata de descubrimiento, no del estado crudo.

## Entregables previstos del próximo tramo

1. Mapa verificable de fuentes de datos.
2. Pipeline de levantamiento con puntos de intervención humana.
3. Matriz de datos: local, derivado, exportable, agregado y publicable.
4. Relación exacta entre Mandate Package y Wisdom.
5. Modelo de adopción interorganizacional.
6. Lista reducida de decisiones de gobernanza que requieren autoridad explícita de José.
7. Separación explícita entre decisiones existentes, hipótesis y asuntos abiertos.

## Bloqueadores de gobernanza

- Schema o artefacto propio de Wisdom.
- Criterio de promoción Gravity → Wisdom.
- Ownership entre persona, organización, publisher y organización adoptante.
- Formato y resolución de `publisherKeyRef`.
- Autorización para derivar y publicar evidencia.
- Anti-replay, expiración, revocación, retiro y disputa.
- Gobierno de `evidenceTaxonomy.json`.
- Tratamiento de conflictos entre Gravity externa y Gravity local.
- Existencia formal y fuente de verdad del campo Pillar.

## Fuera de alcance por ahora

- Definir un schema definitivo de Wisdom.
- Definir umbrales automáticos de promoción.
- Crear un endpoint de promoción o un registry centralizado de publishers.
- Alterar el Mandate Package o declarar que ya es un Wisdom Package.
- Resolver ownership, licenciamiento o revocación sin una decisión explícita de José.

## Regla de continuidad

Toda propuesta futura debe declarar si es una decisión existente, una hipótesis de trabajo o un asunto que requiere decisión explícita de José. Ningún pendiente de gobernanza se convierte en una decisión técnica implícita.
