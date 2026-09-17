# AGENDA FOLLOWUP — Tablero operativo transversal

**Fecha de apertura:** 2026-09-17  
**Autoridad final:** José Vigil  
**Estado del tablero:** activo

## 1. Propósito y frontera

`AGENDA FOLLOWUP` es el punto durable de seguimiento operativo y daily transversal de Cognituum. Registra evidencia reciente, estado efectivo de los Works, actividad en curso, bloqueos reales, dependencias comprobadas y la siguiente acción concreta.

No reemplaza a `docs/CONTROL/AGENDA_MAESTRA.md` ni modifica por sí mismo prioridades, dependencias estructurales o el roadmap maestro.

La división de responsabilidades es:

- **AGENDA FOLLOWUP:** daily, evidencia, estado operativo, bloqueos y siguiente acción.
- **AGENDA_MAESTRA.md:** prioridades, dependencias estructurales y roadmap maestro.

Cuando un avance cambie el mapa estratégico, este tablero lo registra como **REQUIERE ACTUALIZACIÓN EN AGENDA**. Esa marca no autoriza editar `AGENDA_MAESTRA.md`.

Este archivo tampoco autoriza implementación, cambios documentales en otros Works, operaciones Git, pipelines, despliegues ni acciones externas. Toda escritura posterior requiere alcance y lista literal de archivos aprobados por José conforme a `AGENTS.md`.

## 2. Taxonomía de estados

Cada Work debe tener un único estado principal:

| Estado | Significado operativo |
|---|---|
| `INVESTIGACIÓN` | Se relevan hechos, alternativas y límites. No implica contrato aprobado ni implementación. |
| `DEFINICIÓN CONTRACTUAL` | Existen contratos, ADR, specs o fronteras suficientemente concretas para revisión. No implica autorización de implementación. |
| `AUTORIZADO` | José aprobó un alcance concreto, incluidos los archivos o acciones permitidos. Aún puede no haber comenzado la ejecución. |
| `EN IMPLEMENTACIÓN` | El alcance autorizado se está materializando. No implica verificación ni cierre. |
| `VERIFICACIÓN` | Existe implementación material y se está comprobando contra contratos y criterios de aceptación. |
| `BLOQUEADO` | No puede continuarse el siguiente paso sin una decisión, evidencia, dependencia o acceso externo identificado. |
| `PAUSADO` | El Work conserva continuidad, pero no tiene ejecución activa por decisión explícita. |
| `CERRADO` | El alcance definido del Work fue completado y verificado. No significa que todo el sistema relacionado esté terminado. |

`BLOQUEADO PARA RECONCILIACIÓN` y `BLOQUEADO PARA RECONCILIACIÓN DE IDENTIDAD` son condiciones específicas del tablero bajo el estado principal `BLOQUEADO`. Indican que AGENDA FOLLOWUP no puede consolidar responsablemente el estado por falta de identificación o evidencia accesible. No afirman que el desarrollo técnico del Work esté bloqueado.

## 3. Reglas de evidencia y actualización

1. **Evidencia comprobada:** código, tests, logs, commits, archivos materiales o resultados directamente inspeccionados. Debe citarse su fuente.
2. **Decisión cerrada:** determinación expresa de José. No equivale a autorización de escritura.
3. **Autorización:** permiso puntual para ejecutar una acción o modificar una lista concreta de archivos.
4. **Implementación:** cambio material existente. Debe distinguirse si vive sólo en el working tree, si está comiteado, si llegó a `main` y si fue desplegado.
5. **Verificación:** pruebas o inspecciones ejecutadas. Documentación, diseño o compilación aislada no sustituyen una validación end-to-end.
6. No declarar implementado lo que sólo fue investigado, propuesto, documentado o autorizado.
7. No reconstruir un Work sólo por su título. Deben conservarse su nombre literal, entorno y evidencia propia.
8. No fusionar Works homónimos de Codex y Claude Cowork sin reconciliar primero su identidad.
9. No convertir dependencias conceptuales en bloqueantes técnicos sin evidencia material.
10. Los daily son append-only: una entrada nueva puede corregir el estado vigente, pero no se borra ni reescribe el historial anterior.

## 4. Fronteras funcionales fijadas para el seguimiento

### Orrery, Location, ASM y Postulate

El flujo canónico para este tablero es:

```text
Orrery
  captura la posición cognitiva
        ↓
LocationRef
        ↓
ASM
  resuelve referencias, adquiere evidencia
  y prepara contexto
        ↓
AssemblyResult / contexto preparado
        ↓
proceso soberano posterior
        ↓
PostulateProposal
```

ASM no crea, ratifica ni autoriza Postulates. Su frontera termina en `AssemblyResult` y el contexto preparado. Cualquier formulación, adopción, ratificación o autorización de un `PostulateProposal` pertenece a un proceso soberano posterior.

### Impact y Monitor

- **Impact** es una capacidad analítica invocable: evalúa una pregunta delimitada sobre contexto y evidencia suministrados.
- **Monitor** observa actividad runtime, selecciona situaciones evaluables e invoca evaluadores. No sustituye a Impact ni gobierna la ejecución.

## 5. Daily vigente — 2026-09-17

| Work | Entorno | Propósito | Último avance comprobado | Estado vigente | Trabajo en curso | Bloqueo operativo | Dependencias reales | Siguiente acción | Evidencia | Escalamiento a Agenda |
|---|---|---|---|---|---|---|---|---|---|---|
| `CODEX` | Codex, identidad pendiente | No determinado: no debe inferirse por el nombre ni confundirse con la herramienta Codex. | No se localizó inequívocamente un Work literal `CODEX` entre las tareas recientes o archivadas accesibles. | `BLOQUEADO PARA RECONCILIACIÓN` | Ninguno registrable hasta identificar el Work. | Falta identidad inequívoca y acceso a su estado vigente. Esta condición no afirma bloqueo técnico. | Título/ID exacto, propósito declarado y última devolución del propio Work. | Obtener identificación y reporte vigente; recién entonces clasificarlo. | Inventario de tareas accesible al 2026-09-17. | Pendiente: no escalar contenido funcional desconocido. |
| `GENES` | Codex | Convertir Gene en entidad durable, Project-scoped y materialmente verificable. | G1 fue materializado en el working tree: store canónico Nucleus-level, objetos inmutables, `head.json`, JCS/NFC, SHA-256, locking/CAS, publicación durable multiplataforma, recovery, fixture autorizado y tests. Las pruebas nativas del paquete y la compilación cruzada Windows/Linux/macOS fueron reportadas en verde. | `VERIFICACIÓN` | Revisión final de los 15 archivos autorizados y consolidación de evidencia de G1. | G1 aún vive en el working tree. No existe caller productivo, RatificationEnvelope ni primer Gene real. | Contratos Gene v3.0 y G1; filesystem Nucleus; Project/Repository reales para G2; autoridad y ratificación productivas posteriores. | Verificar alcance exacto de G1 y preparar su cierre sin iniciar G2. | `docs/GENES/COGNITUUM_GENE_CONCEPT_v3_0.md`; `docs/GENES/COGNITUUM_GENE_CANONICAL_PERSISTENCE_MATERIALIZATION_CONTRACT_v0_1.md`; `installer/nucleus/internal/gene/`; Work `GENES`. | **REQUIERE ACTUALIZACIÓN EN AGENDA:** incorporar la secuencia G1 → G2 → G3 y distinguir store verificado de primer Gene productivo. |
| `ASM` | Codex | Resolver `LocationRef`, adquirir evidencia y producir `AssemblyResult` / contexto preparado para un proceso soberano posterior. | Research v0.2, ADR pre-Mandate y roadmap I3–I7 disponibles. Se fijaron contratos candidatos, estados degradados, trazabilidad, readiness y límites con Gravity e Impact. | `DEFINICIÓN CONTRACTUAL` | Reconciliación de los contratos propuestos y preparación de encargos físicos candidatos. | La integración ASM–Location no está autorizada. Los schemas físicos, lifecycle, consultas normativas y adquisición continúan pendientes. | Location productiva; fuentes canónicas; eventos/lifecycle; Gravity normativo; Impact como evaluador; mecanismo BISP para contexto. | Revisar y aprobar o corregir el ADR y el orden I3–I7 antes de cualquier implementación. | `docs/ANALYSIS/BSIP/ASM/ASM_Location_Research_v0_2.md`; `ASM_PRE_MANDATE_EXECUTION_ADR_v0_1.md`; `ASM_PRE_MANDATE_EXECUTION_ROADMAP_I3_I7_v0_1.md`; Work `ASM`. | **REQUIERE ACTUALIZACIÓN EN AGENDA:** incorporar ASM como frontera entre Location y el proceso soberano posterior, sin atribuirle creación de Postulates. |
| `IMPACT` | Codex | Evaluar consecuencias, compatibilidad, preservación o cumplimiento sobre evidencia y preguntas delimitadas. | Existe una aplicación Go material en `installer/impact`: contrato `impact/1`, motor determinista, evaluadores `coexistence`, `preservation` y `compliance`, adapters local/server, CLI, ayuda, logging, telemetría, build multiplataforma y rollout Metamorph. Integrada mediante commits `4362cf80` y `e2ae2f94`. | `VERIFICACIÓN` | Validar consumidores e integración real sin ampliar la frontera del motor. | No hay consumidores productivos acreditados. Impact no adquiere evidencia, resuelve Location/Gravity, monitorea ni gobierna ejecución. | Contexto preparado por callers; Gravity pública para criterios ya situados; futura invocación desde ASM, Monitor u otros consumidores autorizados. | Definir y verificar el primer consumidor real conservando la paridad local/server y la naturaleza stateless. | `installer/impact/README.md`; `installer/impact/AGENTS.md`; código y tests bajo `installer/impact/`; commits citados. | **REQUIERE ACTUALIZACIÓN EN AGENDA:** Impact ya es aplicación material; debe separarse de Monitor y de cualquier ownership de ejecución. |
| `MONITOR` | Codex | Infraestructura runtime persistente de observación, selección de situaciones evaluables e invocación de evaluadores. | Research de lectura concluyó que la aplicación es viable y que Nucleus podría supervisar su proceso sin poseer sus criterios. Se falsó WebSocket sin replay como fuente suficiente. | `INVESTIGACIÓN` | Ninguna implementación material registrada. | Falta un contrato uniforme de eventos recuperables con secuencia/generación, cursor, replay y detección explícita de huecos. Tampoco existe aplicación Monitor. | Productores runtime; eventos recuperables; estado durable propio; contrato idempotente con Impact; política de supervisión/reinicio. | Diseñar el contrato mínimo de eventos y recuperación antes de proponer archivos de implementación. | Work `MONITOR`; código inspeccionado de Nucleus supervisor, Brain EventBus, bootstrap/WebSocket y Execution Event schema. | **REQUIERE ACTUALIZACIÓN EN AGENDA:** abrir Monitor como Work separado de Impact y fuera del loop obligatorio de Intents. |
| `ORRERY` | Codex | Espacio navegable de Cognituum y productor futuro de una captura durable de posición cognitiva. | El Research de Location quedó cerrado. El soporte material end-to-end permanece `NOT_SUPPORTED`. Existe un prototipo visual PlayCanvas, pero no una captura durable ni `LocationRef` productiva. Se definieron ocho estados por referencia, incluido `unverifiable`, y gaps A1–A5, B1–B3 y C1–C3. | `DEFINICIÓN CONTRACTUAL` | Preparación del primer vertical read-only posterior al cierre del research. | Faltan schema/productor de captura, persistencia recuperable, resolución por referencia, reapertura y cadena canónica Domain/Gene. | Organization/Project coherentes; fuentes Domain/Gene; atribución/autorización; resolver por referencia; entrega validable a ASM. | Decidir y autorizar el primer encargo read-only, sin presentar el prototipo como soporte productivo. | `docs/ANALYSIS/ORRERY/LOCATION/ORRERY_LOCATION_MATERIAL_CLOSURE_v1_1.md`; prototipo en `installer/conductor/workspace/core/orrery/`; Works `ORRERY` y `ORRERY LOCATION MATERIAL CLOSURE`. | **REQUIERE ACTUALIZACIÓN EN AGENDA:** research cerrado no equivale a implementación; Location sigue `NOT_SUPPORTED` end-to-end. |
| `GENESIS CONTROL` | Claude Cowork, acceso pendiente | Control y continuidad del desarrollo productivo de Genesis. | No se pudo acceder al reporte vigente del Work literal. La información histórica de Agenda no basta para reconstruir su ejecución actual. | `BLOQUEADO PARA RECONCILIACIÓN` | No registrable desde este tablero hasta recibir el reporte vigente. | Falta acceso o devolución actual. Esta condición no afirma que Genesis esté técnicamente bloqueado. | Identidad del Work, hitos recientes, ejecución actual, blockers reales y siguiente acción. | Obtener reporte de continuidad del propio Work y contrastarlo con código/evidencia antes de actualizar. | Referencia declarada por José; Work no accesible desde el inventario actual. | Pendiente. No modificar prioridades de Genesis hasta reconciliar el reporte vigente. |
| `BACKEND` | Identidad de entorno en conflicto: tarea Codex accesible y Work Claude Cowork declarado | Backend de Cognituum; el alcance vigente debe obtenerse del Work correcto, sin inferir fronteras por asociación. | La tarea Codex `BACKEND` y el repositorio muestran avances materiales de Authority, Initial Authority Emission y contratos relacionados. No se confirmó que esa tarea sea el mismo Work de Claude Cowork pedido para el daily. | `BLOQUEADO PARA RECONCILIACIÓN DE IDENTIDAD` | No fusionar estados de ambos entornos. | Falta identificar el Work Claude Cowork vigente y determinar qué evidencia comparte con la tarea Codex. Esta condición no afirma bloqueo técnico. | Título/ID o devolución de Cowork; alcance literal; commits/archivos atribuibles; bloqueos y siguiente paso propios. | Recibir el reporte vigente de Cowork y comparar su evidencia con la tarea Codex y el repositorio. | Tarea Codex `BACKEND`; código bajo `backend/`; referencia declarada a Cowork. | **REQUIERE ACTUALIZACIÓN EN AGENDA** una vez reconciliada la identidad: Authority/Backend avanzó más que el estado maestro actualmente resumido. |

## 6. Asuntos abiertos de reconciliación

### CODEX

Se necesita:

1. ID o enlace de la tarea literal `CODEX`.
2. Entorno y repositorio asociados.
3. Propósito declarado por José.
4. Último resultado o devolución del Work.
5. Archivos, commits, pruebas o documentos producidos.
6. Trabajo actual, bloqueos y próxima acción.

### GENESIS CONTROL

Se necesita:

1. Enlace, ID o exportación del Work de Claude Cowork.
2. Fecha del último corte.
3. Hitos terminados con evidencia.
4. Ejecución actualmente en curso.
5. Blockers técnicos reales, diferenciados de investigaciones paralelas.
6. Dependencias materiales comprobadas.
7. Próxima acción concreta.
8. Cambios que deban escalarse a la Agenda Maestra.

### BACKEND

Se necesita:

1. Enlace, ID o exportación del Work `BACKEND` de Claude Cowork.
2. Confirmación de si comparte continuidad con la tarea Codex `BACKEND`.
3. Alcance literal vigente y fronteras excluidas.
4. Entregables y commits atribuibles a cada entorno.
5. Pruebas, despliegues y estado material efectivo.
6. Decisiones cerradas, pendientes de José y bloqueos reales.
7. Próximo paso propio del Work.
8. Elementos que requieren actualizar Agenda Maestra.

## 7. Asuntos que requieren actualización posterior de Agenda

Esta cola no modifica `AGENDA_MAESTRA.md`. Requiere una autorización separada:

1. Incorporar GENES y el orden G1 → G2 → G3.
2. Incorporar ASM y fijar que su output es `AssemblyResult / contexto preparado`, no `PostulateProposal`.
3. Registrar IMPACT como aplicación material separada de Monitor.
4. Abrir MONITOR como infraestructura runtime todavía en investigación.
5. Registrar el cierre del research Orrery/Location sin presentar Location como soportada.
6. Reconciliar `GENESIS CONTROL` antes de cambiar estado, prioridad o dependencias de Genesis.
7. Reconciliar los dos BACKEND antes de consolidar sus avances en el roadmap maestro.
8. Identificar el Work `CODEX` antes de asignarle propósito o impacto estratégico.

## 8. Historial de daily

Las entradas se agregan en orden cronológico y no se sobrescriben.

### 2026-09-17 — Apertura del tablero durable

- Se creó AGENDA FOLLOWUP como tablero operativo separado de Agenda Maestra.
- Se registraron los ocho Works iniciales.
- GENES quedó en `VERIFICACIÓN`, limitado a G1 en el working tree.
- ASM quedó en `DEFINICIÓN CONTRACTUAL`, con frontera corregida: termina en contexto preparado.
- IMPACT quedó en `VERIFICACIÓN` como aplicación material con consumidores reales pendientes.
- MONITOR quedó en `INVESTIGACIÓN`, sin aplicación material.
- ORRERY quedó en `DEFINICIÓN CONTRACTUAL`: research cerrado y soporte Location end-to-end `NOT_SUPPORTED`.
- CODEX, GENESIS CONTROL y BACKEND quedaron bloqueados únicamente para reconciliación del tablero.
- Se abrió la cola de asuntos que podrían requerir una actualización posterior de Agenda Maestra.

