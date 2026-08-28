# Procedimiento de verificación y actualización de Project Truth y Nucleus Truth

## 1. Propósito

Este procedimiento mantiene sincronizados los graphs estructurales autoritativos de Bloom con el software, los tests y los contratos aprobados:

- `tree/bloom/truth/bloom_project_truth.txt`
- `tree/bloom/truth/bloom_nucleus_truth.txt`

Su objetivo es impedir que decisiones implementadas, contratos futuros y supuestos históricos vuelvan a mezclarse dentro de una misma representación sin indicar su estado real.

José Vigil es la única autoridad para aprobar decisiones, contenido, alcance y escrituras. AGENDA FOLLOWUP coordina la homologación y es el único punto de consolidación de estos archivos. Los Works consultados investigan y proponen; no editan los graphs directamente.

## 2. Naturaleza de cada artefacto

### Maquetas históricas

- `tree/bloom/bloom_project_tree.txt`
- `tree/bloom/bloom_nucleus_tree.txt`

Conservan el diseño de referencia del que partió el sistema. Son antecedentes y material de comparación. No son fuente de verdad vigente.

### Truth graphs

- `tree/bloom/truth/bloom_project_truth.txt`
- `tree/bloom/truth/bloom_nucleus_truth.txt`

Representan conjuntamente el estado estructural verificado y el roadmap aprobado. Cada nodo debe indicar si existe, si está decidido pero no implementado o si conserva otro estado explícito.

Los truth graphs no reemplazan al código. Si un graph contradice el comportamiento material del software, el código gana como evidencia del estado implementado y el graph debe corregirse mediante este procedimiento. Una decisión aprobada pero todavía no implementada permanece visible como contrato futuro, nunca como comportamiento existente.

## 3. Cuándo ejecutar una ronda

Debe iniciarse una ronda cuando ocurra al menos una de estas situaciones:

- un Work implementa, elimina o cambia una estructura representada;
- cambia el ownership entre Project, Nucleus, Brain, Temporal u otra aplicación;
- se aprueba un contrato estructural todavía no implementado;
- una investigación detecta drift, ambigüedad o una referencia incorrecta;
- PALADIN, Gravity u otra línea necesita consumir o extender los graphs;
- antes de presentar los graphs como base de un diseño transversal relevante.

Una actualización de AGENDA o una aprobación conceptual no actualizan automáticamente los graphs. La ronda debe ejecutarse expresamente.

## 4. Participantes

AGENDA FOLLOWUP elige los Works que tienen evidencia directa sobre el área afectada. No existe una lista fija obligatoria para todas las rondas.

Para cambios relacionados con Genesis, intents y gobernanza, la ronda base consulta:

- MANDATE GENESIS;
- AUTHORIZATION;
- Brain.

Se agregan otros Works solamente cuando el cambio toca materialmente su responsabilidad. Ejemplos: PALADIN, Gravity, Executor, AITAP, Core o Metamorph.

Cada Work realiza una auditoría read-only desde su propio contexto. No modifica los truth graphs ni amplía su arquitectura durante la homologación.

## 5. Evidencia admisible

Las afirmaciones deben respaldarse con una o más de estas fuentes:

1. Código vigente, indicando archivo y ubicación.
2. Tests que demuestren el comportamiento afirmado.
3. Artefactos reales producidos por el software.
4. Contratos o decisiones explícitamente aprobados por José.
5. Estado operativo verificable, cuando el graph represente materialización o despliegue real.

No constituyen evidencia suficiente por sí solos:

- una maqueta histórica;
- un documento desactualizado;
- una inferencia editorial;
- una propuesta de un agente;
- una estructura que podría ser conveniente;
- el nombre de una función o archivo sin verificar su participación en el flujo real.

## 6. Clasificación obligatoria

Todo nodo nuevo o modificado debe quedar en una de estas categorías:

- `IMPLEMENTADO`: existe en el software vigente y tiene evidencia material.
- `DECIDIDO — NO IMPLEMENTADO`: fue aprobado, pero todavía no existe materialmente.
- `PENDIENTE`: el trabajo fue identificado, pero aún no está resuelto ni materializado.
- `PLACEHOLDER`: existe preparación de código o scaffold, pero no participa del flujo real.
- `HISTÓRICO/NO VERIFICADO`: proviene de la maqueta o documentación anterior y no fue confirmado.
- `DESALINEACIÓN`: existen dos comportamientos o referencias materiales incompatibles que requieren corrección o decisión.

No se permite usar lenguaje ambiguo para presentar una aspiración como estado actual. Términos como previsto, futuro o debería deben traducirse a una clasificación concreta.

## 7. Procedimiento

### Paso 1 — Definir el alcance

AGENDA FOLLOWUP identifica:

- qué decisión, implementación o hallazgo dispara la ronda;
- qué secciones de Project Truth y Nucleus Truth podrían verse afectadas;
- qué Works poseen evidencia directa;
- qué temas quedan expresamente fuera de alcance.

### Paso 2 — Distribuir el mismo encargo

Todos los Works reciben el mismo prompt base. Sólo cambia, cuando sea necesario, una introducción que delimite su área de responsabilidad.

### Paso 3 — Auditar en modo read-only

Cada Work contrasta ambos graphs contra su código, tests, contratos y artefactos reales. Debe distinguir entre:

- persistencia operativa;
- materialización canónica;
- contrato aprobado;
- runtime externo al filesystem graph;
- comportamiento todavía desconectado del workflow.

### Paso 4 — Devolver evidencia estructurada

Cada devolución utiliza estas columnas:

| Graph afectado | Nodo o sección | Estado representado | Estado verificado | Evidencia | Clasificación | Corrección textual exacta sugerida |
|---|---|---|---|---|---|---|

La devolución termina con dos fragmentos completos propuestos:

- fragmento para `bloom_project_truth.txt`;
- fragmento para `bloom_nucleus_truth.txt`.

Si un Work no posee evidencia para uno de los graphs, debe indicarlo y no completar ese fragmento mediante inferencia.

### Paso 5 — Reconciliar en AGENDA FOLLOWUP

AGENDA FOLLOWUP compara las devoluciones entre sí y contra el código relevante. La coincidencia entre varios Works aumenta la confianza, pero no reemplaza la evidencia.

Ante propuestas incompatibles:

1. se verifica directamente el comportamiento material;
2. se identifica si los Works describen capas diferentes;
3. se distingue ubicación operativa de ownership canónico;
4. se conserva como `DESALINEACIÓN` todo conflicto real que no pueda resolverse sin una decisión o cambio de software.

No se decide arquitectura nueva durante esta reconciliación.

### Paso 6 — Presentar la lista exacta de escritura

Antes de editar, AGENDA FOLLOWUP presenta a José:

- archivos exactos que se modificarán;
- nodos o secciones que cambiarán;
- clasificación resultante;
- contradicciones que permanecerán visibles;
- archivos expresamente no incluidos.

La escritura sólo comienza después de la autorización explícita sobre esa lista.

### Paso 7 — Actualizar los truth graphs

Se aplican exclusivamente los cambios autorizados. Las maquetas históricas no se reescriben para simular que siempre contuvieron la arquitectura actual.

Las estructuras no auditadas pueden conservarse como roadmap únicamente si están marcadas `HISTÓRICO/NO VERIFICADO`. Los contratos aprobados permanecen visibles como `DECIDIDO — NO IMPLEMENTADO`.

### Paso 8 — Verificar la actualización

Después de escribir, se comprueba:

- que ambos archivos siguen siendo legibles como árboles;
- que no se perdieron nodos fuera del alcance autorizado;
- que cada afirmación modificada tiene clasificación;
- que las rutas y nombres coinciden con la evidencia;
- que no se presentan placeholders como materialización real;
- que Project y Nucleus no reclaman ownership contradictorio sin marcarlo;
- que las desalineaciones abiertas continúan visibles;
- que no se modificaron archivos no autorizados.

## 8. Prompt reutilizable para los Works

```text
RONDA DE HOMOLOGACIÓN — PROJECT TRUTH Y NUCLEUS TRUTH

AGENDA FOLLOWUP está verificando los graphs autoritativos:

- tree/bloom/truth/bloom_project_truth.txt
- tree/bloom/truth/bloom_nucleus_truth.txt

Las maquetas históricas son únicamente antecedentes:

- tree/bloom/bloom_project_tree.txt
- tree/bloom/bloom_nucleus_tree.txt

Esta ronda no reabre decisiones, arquitectura ni alcance. Su propósito es trasladar al graph común lo que este Work ya verificó, decidió o implementó.

INSTRUCCIONES

1. Trabajá en modo exclusivamente lectura e investigación.
2. No edites los truth graphs ni ningún otro archivo.
3. Contrastá ambos graphs con el código, tests, contratos y estado vigente de tu área.
4. Identificá únicamente:
   - estructuras confirmadas que deben conservarse;
   - estructuras desactualizadas;
   - estructuras nuevas que faltan;
   - ubicaciones u ownership confirmados por evidencia;
   - diferencias entre persistencia operativa y materialización canónica;
   - puntos realmente pendientes que no deben presentarse como resueltos.
5. Clasificá cada hallazgo como IMPLEMENTADO, DECIDIDO — NO IMPLEMENTADO, PENDIENTE, PLACEHOLDER, HISTÓRICO/NO VERIFICADO o DESALINEACIÓN.
6. No inventes componentes, nombres, rutas ni decisiones.
7. No reabras decisiones funcionales ya aprobadas.
8. Cuando una afirmación provenga del código, indicá archivo y ubicación.
9. Cuando provenga de una decisión aprobada no implementada, identificála como contrato decidido, no como estado material.
10. Si encontrás una contradicción real, reportala sin resolverla unilateralmente.
11. No propongas cambios ajenos a la representación de Project Truth y Nucleus Truth.

DEVOLUCIÓN REQUERIDA

Entregá una tabla con estas columnas:

- Graph afectado: Project, Nucleus o ambos
- Nodo o sección
- Estado actual representado
- Estado verificado
- Evidencia
- Clasificación
- Corrección textual exacta sugerida

Cerrá con dos bloques:

A. Fragmento completo que debería incorporarse a bloom_project_truth.txt.
B. Fragmento completo que debería incorporarse a bloom_nucleus_truth.txt.

No escribas los archivos. AGENDA FOLLOWUP será el único punto de consolidación y escritura.
```

## 9. Devolución a AGENDA FOLLOWUP

La ronda se considera cerrada cuando AGENDA FOLLOWUP puede informar:

- Works consultados;
- evidencia recibida;
- coincidencias consolidadas;
- divergencias resueltas mediante evidencia;
- desalineaciones que permanecen abiertas;
- secciones actualizadas;
- estado de los graphs después de la ronda.

Los hallazgos que impliquen implementación se derivan al Work responsable. Registrar un hallazgo en el graph no autoriza corregir el software.

## 10. Criterio para compartir los graphs

Los graphs pueden compartirse como fuente de verdad vigente y roadmap estructural cuando:

- el área relevante fue homologada por los Works responsables;
- las afirmaciones de implementación tienen evidencia;
- los contratos futuros están marcados como no implementados;
- los placeholders y elementos históricos están identificados;
- las desalineaciones conocidas están visibles;
- no se oculta una brecha para presentar una arquitectura artificialmente completa.

Una desalineación abierta no impide compartir el graph si está descrita con precisión y no altera silenciosamente la interpretación del resto de la estructura.

## 11. Regla de mantenimiento

Ningún Work edita directamente los truth graphs. Cuando un Work complete una implementación o cierre una decisión que afecte su estructura, debe devolver a AGENDA FOLLOWUP:

1. el hecho nuevo;
2. su evidencia;
3. los nodos afectados;
4. la clasificación anterior y la nueva;
5. el fragmento textual exacto sugerido.

AGENDA FOLLOWUP decide cuándo abrir una ronda parcial o completa y solicita autorización antes de escribir.
