# MANDATE — Fuente rectora canónica del programa v0.1

**Estado:** Fase 0 aprobada; fuente de coordinación y cierre de decisiones.  
**Autoridad:** José Vigil.  
**Alcance:** arquitectura y secuencia del programa MANDATE. No autoriza implementación ni modifica por sí misma contratos históricos.

## 1. Propósito

Este documento conserva la continuidad durable del programa MANDATE y evita que creación, ejecución, portabilidad, evidencia y Wisdom evolucionen como recorridos incompatibles.

`docs/CONTROL/AGENDA_MAESTRA.md` sigue siendo la fuente de estado, prioridades y coordinación. Este documento es la fuente rectora del contrato conceptual, sus invariantes, decisiones pendientes y fases de materialización.

Mandate Genesis es el primer vertical local del programa, no la definición completa de MANDATE. Su estado vigente permanece: **implementación completada y validada de forma controlada; aceptación E2E bloqueada**.

## 2. Definición canónica propuesta para aprobación

Un Mandate es un contrato gobernado, versionado y verificable que expresa:

- un objetivo;
- un plan autorizado;
- límites de actuación;
- criterios de cumplimiento;
- y la evidencia necesaria para determinar su resultado.

Esta definición guía el cierre contractual de la Fase 1. No reemplaza todavía el Universal Schema ni constituye por sí sola un wire schema.

## 3. Invariante rector M-1

> Toda ejecución de un Mandate debe reconstruirse exclusivamente desde la versión adoptada y firmada de su contrato, identificada por versión y digest. Ninguna señal, estructura en memoria ni fuente auxiliar mutable puede ampliar, sustituir o contradecir el plan firmado.

La Fase 1 debe ratificar este invariante y precisar su aplicación a creación, adopción, ejecución, reanudación y replay.

## 4. Objetos que deben permanecer separados

El programa debe distinguir, como mínimo:

1. **Contrato de origen:** definición gobernada producida por su autoridad de origen.
2. **Proyección portable:** representación sanitizada y verificable destinada a distribución.
3. **Adopción local:** decisión del Nucleus receptor, con binding, rearraigo y autoridad propios.
4. **Estado y journal de ejecución:** progreso mutable, eventos, intentos, efectos, evidencia y recovery.
5. **Candidato a Wisdom:** experiencia derivada y sanitizada que todavía no fue ratificada.
6. **Wisdom ratificada:** conocimiento promovido bajo reglas de autoridad que aún deben decidirse.

Separar estos objetos no define todavía sus schemas finales. En particular, Mandate Package, evidencia cognitiva y Wisdom no son equivalentes.

## 5. Máquinas de estado separadas

La Fase 1 debe especificar por separado:

- estado del contrato y sus versiones;
- estado de adopción local;
- estado de ejecución y recovery;
- estado de promoción de evidencia o experiencia.

Un cambio en una máquina no debe inferir silenciosamente un cambio en otra. Descargar no equivale a adoptar; adoptar no equivale a activar; completar una ejecución no equivale a ratificar Wisdom.

## 6. Estado material vigente

### 6.1 Implementado y validado de forma controlada

- lifecycle durable de `ing`;
- canal Brain ↔ AITAP para propuestas `dis.mapping`;
- persistencia;
- reinicio;
- replay sin duplicación.

### 6.2 Pendiente de aceptación del primer vertical

- E2E real aislado con Anthropic;
- resolución productiva de la credencial Anthropic mediante Nucleus Vault;
- aceptación funcional completa del primer Mandate Genesis.

El bloqueador vigente es determinar el mecanismo o estado legítimo de autoridad Master que permita a Nucleus Vault autorizar la resolución de la referencia solicitada por AITAP. Pertenece a GENESIS CONTROL y no constituye una regresión del lifecycle durable ni del canal Brain ↔ AITAP.

### 6.3 Contradicciones que debe cerrar la Fase 1

- La creación local, la publicación/distribución y la especificación de paquete todavía no forman un único contrato end-to-end.
- El contrato mínimo ejecutado por Genesis no expresa todavía toda la identidad, versión, firma, objetivo, fulfillment y referencias de Gravity requeridas por la arquitectura completa.
- `signedAt` no sustituye una firma criptográfica verificable.
- La instalación de un artefacto recibido no equivale todavía a adopción, rearraigo, firma local ni activación.
- La ejecución no debe depender de planes en memoria o fuentes auxiliares capaces de apartarse del contrato firmado.
- `run_intent` no debe presentarse como ejecución productiva completa hasta que exista un Action Contract y efectos gobernados verificables.
- Gravity e Impact tienen integraciones parciales; no deben recibir responsabilidades nuevas por inferencia.
- El modelo de evidencia existe como especificación, pero no constituye por sí mismo Wisdom ratificada.

## 7. Decisiones indispensables de Fase 1

José debe aprobar expresamente, antes de modificar contratos o implementación:

1. la definición canónica de Mandate y el invariante M-1;
2. la identidad estable del Mandate y de cada versión;
3. qué bytes se firman, quién firma y cómo se verifica versión y digest;
4. la separación y relación entre contrato de origen, proyección portable, adopción local y journal de ejecución;
5. las máquinas de estado de contrato, adopción y ejecución;
6. el contenido mínimo del Mandate Executable Contract;
7. el Action Contract para Intents, efectos, idempotencia, evidencia y reanudación;
8. cómo se expresan objetivo y criterios de fulfillment;
9. cómo se vinculan Gravity y sus revisiones al contrato firmado;
10. qué evidencia produce Impact y qué autoridad determina cumplimiento;
11. qué operaciones requieren autorización inicial y revalidación durante la ejecución;
12. el criterio mínimo de aceptación del primer vertical local.

Wisdom, Marketplace, Wisdom Score, atribución del Paladín y portabilidad completa no son bloqueantes automáticos del primer vertical. Sólo podrán bloquearlo si una decisión o evidencia concreta demuestra que son necesarias para su recorrido mínimo.

## 8. Secuencia coordinada

### Fase 0 — Control durable

Crear esta fuente rectora, vincularla desde Agenda y conservar estado, contradicciones, decisiones y gates sin modificar contratos históricos.

### Fase 1 — Contrato canónico en papel

Cerrar las decisiones de la sección 7 y producir una propuesta contractual coherente. La salida debe incluir criterios de aceptación y una lista literal de archivos para una autorización posterior.

### Fase 2 — Primer vertical local real

Materializar un contrato local firmado; reconstruir desde él la ejecución; ejecutar al menos un Intent real con efectos gobernados; producir evidencia; evaluar fulfillment; reiniciar servicios y comprobar continuidad sin pérdida ni duplicación.

### Fase 3 — Gobernanza local

Completar autorización, revalidación, revocación, idempotencia y recovery del recorrido local.

### Fase 4 — Portabilidad

Definir y materializar proyección sanitizada, firma, instalación, rearraigo y adopción local independiente.

### Fase 5 — Backend y Wisdom

Coordinar publicación, descubrimiento y distribución, y definir la promoción gobernada de experiencia a Wisdom sin transferir silenciosamente autoridad u ownership.

### Fase 6 — Onboarding y Core

Exponer estados y acciones verificadas una vez que existan contratos y recorridos materiales confiables. Core no inventa autoridad ni estados.

### Fase 7 — Experiencia a Wisdom

Resolver ratificación, score, atribución, revocación y reutilización interorganizacional.

## 9. Congelamiento hasta cerrar Fase 1

No se debe, como consecuencia de esta fuente:

- activar automáticamente Mandates descargados;
- ampliar delivery o Marketplace;
- definir schemas finales de Wisdom o Wisdom Score;
- conectar onboarding con autoejecución;
- presentar scaffolds como ejecución real de Intents;
- implementar arbitraje o atribución del Paladín;
- editar contratos históricos antes de aprobar la reconciliación;
- permitir que estado en memoria o fuentes auxiliares sustituyan el contrato firmado.

## 10. Criterio rector del primer Mandate real

El primer vertical se acepta cuando un Mandate real puede crearse o adoptarse bajo autoridad válida, verificarse, ejecutarse desde su contrato persistido, producir evidencia y alcanzar una determinación de cumplimiento; tras reiniciar los servicios, debe continuar o concluir sin pérdida de estado, ampliación no autorizada ni duplicación de Intents o efectos.

## 11. Fuentes vigentes y relación documental

- `docs/CONTROL/AGENDA_MAESTRA.md`: estado, coordinación, prioridades y cola de trabajo.
- `docs/MANDATE/BLOOM_Mandate_Universal_Schema_v1_2_0.md`: contrato histórico sujeto a homologación posterior.
- `docs/WISDOM/BLOOM_Mandate_Package_Spec_v1_0_0.md`: mecanismo especificado de portabilidad; no equivale al programa completo ni a Wisdom.
- `docs/ANALYSIS/WISDOM/WISDOM_DEVELOPMENT_SCOPE_v0_1.md`: continuidad del Work WISDOM.
- `docs/WISDOM/BLOOM_Wisdom_Handshake_Investigacion_v0_1.md`: investigación del handshake y distribución.
- `docs/WISDOM/BLOOM_Cognitive_Evidence_Model_v1_0_0.md`: modelo de evidencia separado del contrato firmado.
- Resultados completos de los Works MANDATE CREATION, MANDATE EXECUTION y MANDATE, consolidados en la apertura aprobada de este programa.

Ante una contradicción con código material verificado, el código define el estado existente; la contradicción se registra aquí o en Agenda y no se convierte silenciosamente en decisión arquitectónica.

## 12. Próxima acción

Preparar, sin modificar código ni contratos históricos, el paquete de decisiones de Fase 1 para aprobación de José. Debe responder los doce puntos de la sección 7, separar hechos de propuestas y terminar con criterios de aceptación y lista exacta de archivos que requerirían una autorización posterior.
