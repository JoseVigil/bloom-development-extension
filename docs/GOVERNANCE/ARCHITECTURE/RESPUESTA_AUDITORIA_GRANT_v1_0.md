# Respuesta a la Auditoría de `Grant` — Autorización para Implementar

**Estado:** Autorización formal, con correcciones puntuales al criterio de remoción propuesto.
**Referencia:** auditoría de solo-lectura sobre `Grant`, 17 archivos + 1 schema fuera de alcance.
**Autoriza:** José.

---

## 1. Veredicto general

Se aprueba el criterio de remoción y la lista exacta de 17 archivos identificados. La auditoría hizo bien
en:

- No inventar un artefacto de reemplazo textual para `Grant`.
- No renombrar `grant_ref`, `grant://`, ni los contratos derivados — eliminarlos completos.
- No tocar `execution-package.schema.json` (fuera de alcance, se mantiene como deuda documentada).
- Descartar correctamente las coincidencias no arquitectónicas (LICENSE.txt, `icacls /grant`, OAuth
  `grant_type`, etc.).

Se corrige el criterio en un punto: **no todo lugar donde aparece `Grant` es un vacío de diseño.** La
auditoría trató uniformemente cada aparición como "mecanismo pendiente de decisión" — eso es correcto en
algunos casos y una simplificación incorrecta en otros. Hay dos categorías distintas dentro de la lista, y
requieren tratamiento distinto.

---

## 2. Las dos categorías

### Categoría A — Autoridad ya definida en el sistema (corregir la formulación)

En estos casos, `Grant` estaba duplicando algo que **ya existe y está descripto** en la arquitectura: la
firma digital de Nucleus como mecanismo de autorización, los niveles de rol (Master/Architect/Specialist),
y Vault Authority como dueño del ciclo de vida de credenciales. No hay un vacío que llenar — hay un
concepto mal nombrado que debe apuntar a lo que ya existe.

**Regla de reemplazo para todo caso de Categoría A:**

En vez de dejar el texto en *"mecanismo pendiente de decisión"* o *"no está definido"*, usar:

> *"autoridad organizacional de Nucleus, expresada mediante firma digital y nivel de permiso del rol
> (Master/Architect/Specialist); las credenciales se resuelven vía Vault Authority por referencia
> efímera. El mecanismo formal de verificación de esta autoridad está en diseño (ver Módulo de
> Autorización de Nucleus, borrador en curso) y no se fija en este documento."*

Esto reemplaza cualquier redacción que sugiera que la autoridad de Nucleus es un vacío total. No lo es —
lo que está en diseño es su expresión formal y verificable, no su existencia.

**Aplica, como mínimo, a:**
- `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` L189, L190, L196 (la parte de "requisitos", no la de Executor),
  L310.
- `COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md` L61, L121 (acceso a Vault vía identidad/rol).
- `AITAP_ROUTING_MANDATE_GENESIS_CLIS_2026-08-20.md` L117 (autoridad organizacional sobre tools/workspace).
- Cualquier otra línea de la lista original donde `Grant` se refería a autoridad de Nucleus en general, no
  específicamente a la ejecución aislada de Executor.

### Categoría B — Gap real, sin resolver (mantener exactamente como propuso la auditoría)

Todo lo relacionado con **Executor y runtimes externos** (OpenCode, Codex CLI, Claude Code CLI) queda tal
cual la auditoría lo redactó: *"la autoridad de promoción/ejecución deberá definirse por separado"*, sin
inventar mecanismo. Esto no es autoridad ya definida sin nombrar — es un problema real de verificación en
el boundary de proceso aislado, todavía sin decisión de diseño. Aplica a:

- `EXECUTOR_ARCHITECTURE_v1_0.md`, `EXECUTOR_IMPLEMENTATION_SPEC_v1_0.md`,
  `EXECUTOR_E0_DESIGN_PACKAGE_v1_0.md`, `EXECUTOR_E0_ARCHITECTURE_DECISION_PACKAGE_v1_0.md`,
  `EXECUTOR_GENESIS_DEV_INTEGRATION_HANDOFF_2026-08-21.md` — todas las líneas listadas en la auditoría
  original, sin cambios.
- Toda mención a "promoción" en cualquier documento de la lista (`COGNITUUM_EXECUTOR_APPLICATION_DECISION`,
  `COGNITUUM_EXECUTION_RUNTIME_ADAPTERS_NORM`, etc.).
- `installer/execution/AGENTS.md` L26.

No se resuelve este gap en esta respuesta. Sigue abierto y así debe quedar documentado.

---

## 3. Orden de implementación

1. `installer/execution/AGENTS.md` — primero, porque es instrucción activa que agentes cargan
   automáticamente. Aplica corrección de Categoría B (sin cambios respecto a lo propuesto) más el
   guardrail nuevo de §4.
2. `COGNITUUM_RESPONSIBILITY_BOUNDARIES.md` — segundo, es la fuente conceptual que alimenta al resto.
   Aplica mezcla de Categoría A y B según la línea (ver §2).
3. Resto de los 15 documentos, en el orden que ya trae la auditoría.
4. `execution-package.schema.json` — no se toca. Queda documentado como desalineado, deuda técnica fuera
   de alcance.

---

## 4. Guardrail nuevo para `AGENTS.md` (raíz y `installer/execution/`)

Agregar el siguiente párrafo a ambos `AGENTS.md`:

> **Autorización y permisos.** Ningún agente introduce un campo, contrato, artefacto o mecanismo de
> autorización nuevo en ningún documento, schema o código de este repositorio. Toda necesidad de control
> de acceso detectada durante el trabajo —permisos, roles, scopes, autoridad de ejecución— se reporta como
> hallazgo hacia el Módulo de Autorización de Nucleus (documento en diseño), nunca se resuelve localmente
> en el archivo donde se detectó.

---

## 5. Alcance de esta autorización

Se autoriza a implementar exactamente lo anterior: los 17 archivos con las correcciones de §2, el
guardrail de §4, sin tocar el schema JSON ni código. No se autoriza ninguna decisión de diseño sobre el
mecanismo de Executor (Categoría B) ni sobre el Módulo de Autorización de Nucleus — esos siguen en
desarrollo por separado y se comunican cuando estén listos.
