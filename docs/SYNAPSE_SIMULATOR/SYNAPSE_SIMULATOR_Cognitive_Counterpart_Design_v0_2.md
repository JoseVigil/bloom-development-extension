# Synapse Simulator — Cognitive Counterpart Design v0.2

**Estado:** supersedido para el primer intercambio cognitivo por `SYNAPSE_SIMULATOR_ING_Classification_Contract_v0_3.md`; conserva la corrección de arquitectura distribuida y del rename. El gate de implementación continúa cerrado.  
**Base:** reemplaza las conclusiones conceptuales de la v0.1 archivada en `BACKUP/`; conserva sus contratos neutrales, fault model e idempotencia salvo donde esta revisión indique lo contrario.

## 1. Corrección central

Synapse Simulator no es la página Cortex ni una UI periférica. Es un entorno distribuido de simulación segura con dos superficies coordinadas:

1. **Workspace Synapse Simulator**, hoy en `installer/conductor/workspace/shared/debug.html`.
2. **Cortex Synapse Simulator**, desplegado desde `brain/core/profile/web/templates/synapse-simulator/` dentro de la extensión.

La autopista integrada vigente es:

```text
Workspace
→ SynapseBridge / Control Plane
→ Brain gobernado por Nucleus/Sentinel
→ bloom-host / Native Messaging
→ Cortex background.js
→ páginas y schemas de la extensión
→ retorno por el mismo sistema
```

Evidencia de Workspace: `debug.html` abre `ws://localhost:4124`, consulta health por bridge/IPC o REST, recibe `SYNAPSE_RAW_EVENT`/`SYNAPSE_EVENT` e inyecta simulaciones por `POST /api/internal/system-event` con fallback `postMessage`. `ipc-bridge.js`, `tab-system.js` y `workspace-synapse-handlers.js` coordinan el feed y retorno.

## 2. Recomendación revisada

El fixture engine headless transport-neutral sigue recomendado como núcleo determinístico, pero **no constituye por sí solo el Synapse Simulator ni reemplaza sus superficies existentes**.

La arquitectura objetivo tiene dos modos obligatoriamente compatibles:

- **Modo headless:** contratos, matching, fault model, replay e idempotencia sin Chrome; apropiado para unit/contract tests.
- **Modo integrado Synapse:** Workspace origina/observa, el request cruza Brain y Native Messaging, Cortex lo recibe/presenta, la respuesta vuelve por Synapse y Brain la hace durable.

La aceptación final requiere evidencia en ambos modos. Los fallos lógicos pueden probarse headless; framing, ACK, desconexión y correlación end-to-end deben probarse sobre la autopista real.

## 3. Flujo cognitivo objetivo

```text
Workspace Core crea o solicita submit
→ Brain construye y persiste BISP real
→ request contractual cruza Synapse
→ Cortex Simulator recibe y presenta
→ fixture u operador produce respuesta
→ respuesta regresa por Synapse
→ Brain correlaciona, valida y persiste
→ Brain procesa el response solicitado
→ Workspace recupera resultado durable
```

Brain continúa siendo dueño del intent, la correlación, la persistencia y el avance lógico. Cortex no aplica filesystem ni decide workflow. Workspace no convierte un ACK en completion. El fixture seleccionado sigue fuera del contenido cognitivo del BISP.

## 4. Relación con Mandate Genesis

Antes de cerrar la cadencia del Simulator, el Work de Mandate Genesis debe aportar:

- primer intent que requiere inferencia externa;
- aparición y orden real de `ing/` y `dis/`;
- intent siguiente;
- artefactos reales producidos por Brain en cada etapa;
- punto durable de espera del workflow;
- resultado que Workspace debe recuperar.

Estos datos son inputs de consumidor. El Work del Simulator los convierte en request/response y capacidades reusables; no incorpora fases, Domains, Genes ni reglas específicas de Genesis.

## 5. Rename propuesto de la superficie Workspace

Rename semántico recomendado para una futura etapa aprobada:

```text
installer/conductor/workspace/shared/debug.html
→ installer/conductor/workspace/shared/synapse-simulator.html
```

Referencia funcional al filename verificada:

- `installer/conductor/workspace/onboarding/onboarding.html`: `src="../shared/debug.html"`.

Rename de identidad coordinado:

```text
debug-frame → synapse-simulator-frame
```

Consumidores funcionales verificados:

- `onboarding/onboarding.html` (CSS, id y `src`);
- `onboarding/renderer/core/ipc-bridge.js`;
- `onboarding/renderer/core/tab-system.js`.

Los términos `debug`, `raw event` y `debug feed` se conservan cuando nombran capacidades internas. Comentarios en `main_conductor.js`, `workspace-synapse-handlers.js`, `preload_onboarding.js`, `background.js` y documentación se actualizan sólo cuando confunden identidad con capacidad.

## 6. Impacto en alternativas y plan de archivos

La alternativa “engine dentro de UI Cortex” continúa rechazada, pero ya no porque Cortex sea irrelevante: se rechaza porque una de las dos superficies no debe poseer el engine común. El núcleo neutral se conecta mediante adapters a Workspace/Brain/Cortex.

El plan futuro agrega, además de los contratos y engine propuestos en v0.1:

1. adapter de transporte Synapse en Brain;
2. representación request/response en schemas consumibles por Cortex;
3. panel de presentación/respuesta en Cortex Simulator;
4. controles y resultado durable en Workspace Simulator;
5. tests headless y tests integrados de ida y vuelta;
6. rename Workspace anterior como corte mecánico separado.

## 7. Gate revisado

Antes de implementar se requiere aprobación explícita de:

1. arquitectura de dos superficies más núcleo headless común;
2. obligatoriedad de aceptación headless **e** integrada;
3. consulta previa al Work de Mandate Genesis para fijar la primera cadencia real;
4. rename `debug.html`/`debug-frame` en un corte separado;
5. conservación de términos de debugging cuando describen capacidades;
6. contratos neutrales de la v0.1, revisados contra la cadencia aportada por Genesis;
7. ownership: Brain durable, Workspace/Cortex superficies, Simulator sin reglas Genesis;
8. prohibición de reutilizar el submit legacy hasta resolver D-18 con prueba ejecutada.

**No se implementó ni se ejecutó el rename.** Esta revisión actualiza diseño y documentación; la implementación permanece detenida en el gate.
