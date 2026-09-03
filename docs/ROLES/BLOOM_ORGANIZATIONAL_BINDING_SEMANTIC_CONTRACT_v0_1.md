# BLOOM — Contrato semántico del binding organizacional v0.1

**Work:** ROLES

**Estado:** propuesta documental para revisión

**Fecha:** 2026-09-04
**Alcance:** estados, transiciones, invariantes y evidencia mínima del binding
entre una instalación local y una organización canónica.

## 1. Propósito

Este documento define el contrato semántico mediante el cual una instalación
local puede declarar, verificar, aceptar, conservar y, cuando corresponda,
bloquear su relación con una organización canónica.

El binding responde exclusivamente:

```text
¿A qué organización canónica está vinculada esta instalación,
con qué procedencia y mediante qué evidencia aceptada?
```

No responde:

- qué personas integran la organización;
- qué roles o permisos poseen;
- qué acción concreta está autorizada;
- cómo se transporta o serializa la evidencia;
- cómo se representa el Authority Snapshot.

La identidad organizacional canónica es opaca, estable, inmutable y asignada
por Backend. El slug, el nombre, el directorio local y cualquier locator legado
son atributos auxiliares y nunca sustituyen esa identidad.

## 2. Base aprobada

Este contrato construye sobre los doce principios semánticos aprobados por
José el 2026-09-03:

1. Backend asigna la identidad organizacional canónica.
2. Slug, nombre, directorio y fingerprint no son esa identidad.
3. `org_id` converge semánticamente con la identidad canónica.
4. `organization_fingerprint` pertenece al plano de trust binding solamente
   cuando representa evidencia verificable.
5. `bloom:org:{slug}` es un locator legado.
6. `.ownership.json` conserva autoridad local durante `local_legacy`.
7. En `shadow_remote`, la autoridad productiva sigue siendo legacy; el estado
   remoto se verifica y compara.
8. Tras `remote_enforced`, `.ownership.json` sirve exclusivamente para
   bootstrap y trust binding.
9. La compatibilidad se resuelve mediante normalización temporal estricta.
10. Bootstrap distingue una instalación no vinculada de una vinculada.
11. El cutover requiere identidad canónica y binding aceptados.
12. Ningún rollback puede restaurar autoridad legacy después del cutover.

Los principios anteriores son premisas de este documento y no se reabren.

## 3. Vocabulario semántico

### 3.1 Instalación

Instancia local de Bloom que necesita establecer a qué organización canónica
pertenece. La identidad de instalación es distinta de la identidad de la
organización y no concede autoridad por sí misma.

### 3.2 Organización canónica

Entidad organizacional identificada de manera estable por la fuente remota de
verdad. Su identidad no depende de un nombre, slug, path o usuario externo.

### 3.3 Binding

Relación aceptada entre una instalación determinada y una organización
canónica determinada, respaldada por evidencia verificable de procedencia,
integridad y correspondencia.

### 3.4 Candidato de binding

Relación propuesta pero todavía no aceptada. Puede originarse en un recorrido
Backend-first o local-first. Nunca concede autoridad remota.

### 3.5 Trust binding

Evidencia local que permite verificar qué fuente y qué organización canónica
espera la instalación. No equivale a membership, rol, permiso ni decisión de
autorización.

### 3.6 Locator legado

Nombre, slug, path o valor derivado de ellos que permite localizar estado
histórico. Puede ayudar a encontrar un candidato, pero no prueba identidad ni
equivalencia.

### 3.7 Evidencia aceptada

Conjunto de hechos verificados que permitió aceptar el binding. Debe permitir
reconstruir qué se verificó, contra qué organización, con qué procedencia y en
qué momento, sin depender de una inferencia posterior desde un locator.

### 3.8 Divergencia

Contradicción entre dos o más afirmaciones relevantes para el binding que no
puede resolverse de forma determinística con evidencia aceptada. Una
divergencia nunca se normaliza silenciosamente.

### 3.9 Cutover

Transición explícita e irreversible por medios locales ordinarios mediante la
cual la instalación deja de reconocer autoridad organizacional concedida por
el modelo legacy y pasa a exigir la fuente remota aceptada.

## 4. Dimensiones independientes

El estado del binding y el modo de autoridad son dimensiones relacionadas pero
distintas.

### 4.1 Estado del binding

Describe si la relación instalación-organización está ausente, en evaluación,
aceptada o en conflicto.

### 4.2 Modo de autoridad

Describe qué fuente puede producir decisiones efectivas:

- `local_legacy`;
- `shadow_remote`;
- `remote_enforced`.

Aceptar un binding no cambia automáticamente el modo. Cambiar el modo no puede
fabricar un binding ausente. Esta separación evita que recibir evidencia se
convierta accidentalmente en autorización.

## 5. Estados del binding

Los nombres de esta sección son nombres semánticos estables del contrato. No
prescriben valores serializados, enums de código ni nombres de campos.

### 5.1 UNBOUND

La instalación no posee un binding organizacional aceptado.

Debe poder afirmarse:

- que no existe organización canónica aceptada para la instalación;
- si existe o no identidad local provisional;
- si existen locators legacy disponibles para iniciar descubrimiento.

Autoridad permitida:

- en `local_legacy`, sólo la autoridad local ya caracterizada por ese modo;
- ninguna autoridad remota;
- no puede iniciarse `remote_enforced`.

### 5.2 BINDING_PENDING

Existe un candidato de binding bajo evaluación, pero todavía no fue aceptado.

Debe poder afirmarse:

- qué organización canónica candidata se evalúa;
- qué instalación intenta vincularse;
- cuál es la procedencia declarada;
- qué evidencia fue recibida;
- qué verificaciones están completas y cuáles faltan.

Autoridad permitida:

- la misma que antes de iniciar la evaluación;
- el candidato no concede autoridad adicional;
- una recepción parcial nunca modifica la fuente productiva vigente.

### 5.3 BOUND

El binding fue verificado y aceptado. La instalación reconoce una única
organización canónica y conserva evidencia suficiente para demostrar esa
relación.

Debe poder afirmarse:

- identidad canónica aceptada;
- identidad de la instalación vinculada;
- procedencia aceptada;
- momento y resultado de aceptación;
- evidencia contra la cual se tomó la decisión;
- modo de autoridad vigente por separado.

Autoridad permitida:

- en `local_legacy`, continúa aplicando exclusivamente el modelo legacy;
- en `shadow_remote`, el binding habilita verificación y comparación, no
  enforcement remoto;
- en `remote_enforced`, es precondición necesaria pero no suficiente para una
  decisión efectiva: roles, asignaciones, políticas y límites se evalúan por
  sus contratos propios.

### 5.4 DIVERGENT

Se detectó una contradicción material entre la identidad o procedencia esperada
y la evidencia presentada u observada.

Ejemplos semánticos:

- dos identidades canónicas reclaman la misma instalación;
- la evidencia recibida identifica otra organización;
- locator y binding aceptado apuntan a organizaciones distintas;
- una representación legacy produce más de una interpretación posible;
- la procedencia no coincide con la fuente esperada.

Autoridad permitida:

- ninguna autoridad nueva proveniente del candidato contradictorio;
- en `shadow_remote`, el enforcement legacy puede continuar solamente porque
  el modo aún no cambió, mientras la divergencia se expone y audita;
- en `remote_enforced`, la divergencia bloquea nuevas operaciones que requieran
  autoridad organizacional hasta que exista una resolución autorizada;
- nunca se selecciona automáticamente la alternativa más permisiva.

### 5.5 REMOTE_LOCKED

El binding aceptado ya atravesó el cutover a `remote_enforced`. La instalación
debe conservar la identidad canónica y la evidencia de corte; una edición,
restauración o rollback local ordinario no puede sustituirlas ni reactivar
autoridad legacy.

Autoridad permitida:

- sólo aquella que resulte de una decisión efectiva de Nucleus basada en estado
  remoto verificado y aceptado, junto con políticas y límites locales;
- `.ownership.json`, `.master`, `.specialist`, locators y caches no conceden ni
  restauran privilegios;
- el binding, por sí solo, tampoco concede un rol o permiso.

### 5.6 Estado terminal y ausencia de `UNBOUND` posterior al cutover

`REMOTE_LOCKED` es terminal respecto de operaciones locales ordinarias. El
contrato no admite una transición directa o implícita desde `REMOTE_LOCKED` a
`UNBOUND`, `BINDING_PENDING` o una autoridad `local_legacy`.

Una desvinculación, transferencia o recuperación extraordinaria requeriría un
contrato futuro, explícitamente aprobado y auditable. No se define en esta
ronda.

## 6. Matriz de autoridad por estado y modo

| Estado del binding | `local_legacy` | `shadow_remote` | `remote_enforced` |
|---|---|---|---|
| `UNBOUND` | Puede continuar el enforcement local existente | No reúne precondiciones para comparación remota confiable | Prohibido |
| `BINDING_PENDING` | Sin elevación; continúa el estado local anterior | Puede verificar evidencia incompleta, pero no tratarla como autoridad | Prohibido |
| `BOUND` | Continúa el enforcement legacy | Verifica y compara; divergencias no cambian automáticamente decisiones | Precondición de cutover, todavía no prueba permisos |
| `DIVERGENT` | No acepta autoridad del candidato contradictorio | Expone divergencia; no mezcla resultados | Bloquea nuevas operaciones organizacionales privilegiadas |
| `REMOTE_LOCKED` | Combinación inválida | Combinación inválida | Sólo decisión efectiva de Nucleus sobre estado remoto aceptado |

## 7. Transiciones válidas

### 7.1 UNBOUND → BINDING_PENDING

Disparador semántico:

- inicio explícito de un intento de binding Backend-first; o
- inicio explícito de un intento local-first.

Evidencia mínima para iniciar:

- identidad de la instalación candidata;
- referencia a la organización canónica candidata o información suficiente
  para solicitar su determinación sin inferirla desde el slug;
- procedencia declarada del candidato;
- identificación del recorrido de bootstrap utilizado;
- correlación que permita seguir el mismo intento sin confundirlo con otro.

Postcondición:

- el intento es observable como pendiente;
- el estado de autoridad productiva no cambia;
- cualquier identidad local previa se conserva como provisional, nunca como
  equivalente confirmada.

Evidencia insuficiente o ambigua:

- rechazo explícito del inicio;
- la instalación permanece `UNBOUND`;
- no se crea una equivalencia parcial silenciosa.

### 7.2 BINDING_PENDING → BOUND

Disparador semántico:

- finalización satisfactoria de todas las verificaciones requeridas para
  aceptar la relación instalación-organización.

Evidencia mínima para aceptar:

- identidad canónica inequívoca de la organización;
- correspondencia inequívoca con la instalación candidata;
- procedencia verificada contra la fuente esperada;
- integridad de la evidencia utilizada;
- coherencia entre identidad esperada, identidad recibida y binding local;
- ausencia de una relación aceptada incompatible;
- resultado completo de verificación;
- momento de aceptación;
- identidad o autoridad del proceso que realizó la aceptación, sin inferir de
  ello un rol organizacional.

Postcondición:

- existe exactamente un binding aceptado para la instalación;
- la evidencia aceptada queda disponible para auditoría;
- locators y nombres quedan asociados como atributos, no como identidad;
- el modo de autoridad permanece sin cambios.

Evidencia insuficiente:

- el estado continúa `BINDING_PENDING` sólo si el intento sigue siendo
  inequívoco y puede completarse;
- no se concede autoridad.

Evidencia ambigua o contradictoria:

- transición obligatoria a `DIVERGENT`;
- nunca se elige por coincidencia de slug, path o username.

### 7.3 BINDING_PENDING → DIVERGENT

Disparador semántico:

- detección de contradicción material durante la evaluación.

Evidencia mínima:

- afirmaciones incompatibles observadas;
- fuente de cada afirmación;
- verificación que demostró la incompatibilidad;
- momento de detección;
- candidato afectado.

Postcondición:

- la contradicción queda explícita y consultable;
- no se acepta el candidato;
- no se muta el modo de autoridad;
- no se sobrescribe evidencia previa para ocultar el conflicto.

### 7.4 BINDING_PENDING → UNBOUND

Disparador semántico:

- cancelación explícita del intento antes de la aceptación; o
- rechazo definitivo por evidencia insuficiente que no constituye una
  contradicción de identidad.

Evidencia mínima:

- identificación del intento cancelado o rechazado;
- causa de cierre;
- momento de cierre;
- confirmación de que nunca fue aceptado.

Postcondición:

- no queda binding aceptado;
- la evidencia histórica del intento puede conservarse para auditoría;
- ningún dato del intento concede autoridad.

### 7.5 BOUND → DIVERGENT

Disparador semántico:

- nueva evidencia demuestra que el estado local observado contradice el
  binding aceptado; o
- una fuente presenta una identidad diferente para la misma instalación sin
  una transición autorizada.

Evidencia mínima:

- binding previamente aceptado;
- nueva evidencia incompatible;
- resultado de comparación;
- procedencia y momento de ambas evidencias.

Postcondición:

- el binding aceptado no se reemplaza silenciosamente;
- la divergencia se expone;
- la respuesta operativa depende del modo según la matriz de §6.

### 7.6 DIVERGENT → BOUND

Disparador semántico:

- resolución explícita que confirma el binding previamente aceptado o un
  candidato inequívoco sin efectuar todavía cutover.

Evidencia mínima:

- contradicción original;
- resolución autorizada;
- evidencia que descarta las alternativas incompatibles;
- organización canónica resultante;
- momento y resultado de la nueva aceptación.

Postcondición:

- existe nuevamente un único binding aceptado;
- la divergencia no se borra del historial;
- la resolución no concede roles o permisos.

Este contrato no decide quién puede emitir la resolución ni cómo se transporta.

### 7.7 BOUND + shadow_remote → REMOTE_LOCKED + remote_enforced

Disparador semántico:

- cutover explícito y autorizado.

Precondiciones:

- binding `BOUND` vigente y sin divergencias abiertas;
- identidad canónica aceptada;
- procedencia y trust binding verificados;
- evidencia suficiente para impedir que una restauración local reactive
  autoridad legacy;
- estado remoto inicial aceptado conforme a su futuro contrato;
- capacidad de Nucleus de decidir sin depender de marcadores legacy;
- registro del punto de corte.

Postcondiciones:

- estado del binding `REMOTE_LOCKED`;
- modo `remote_enforced`;
- `.ownership.json`, `.master`, `.specialist` y otros artefactos legacy pierden
  toda capacidad de concesión;
- el punto de corte y su identidad canónica permanecen durables;
- rollback de software no reduce el estado alcanzado.

Evidencia insuficiente, ambigua o contradictoria:

- rechazo explícito del cutover;
- conservación de `BOUND + shadow_remote`;
- prohibición de un estado híbrido parcialmente enforced.

### 7.8 REMOTE_LOCKED → DIVERGENT

Esta transición representa una divergencia operativa detectada después del
cutover, no una reversión del cutover.

Disparador semántico:

- evidencia recibida o estado local contradice la identidad canónica o el trust
  binding bloqueado.

Postcondiciones:

- se expone la divergencia;
- `remote_enforced` permanece vigente;
- la instalación falla cerrado para nuevas operaciones organizacionales
  privilegiadas;
- no se rehabilita `local_legacy`.

La recuperación posterior no se define en este documento.

## 8. Recorridos de bootstrap

### 8.1 Backend-first

```text
organización canónica existente
→ instalación UNBOUND
→ candidato BINDING_PENDING
→ verificación
→ BOUND
→ eventual shadow_remote
→ cutover explícito
→ REMOTE_LOCKED
```

La existencia previa de la organización facilita obtener su identidad
canónica, pero no prueba que la instalación deba vincularse a ella.

### 8.2 Local-first

```text
instalación UNBOUND con identidad local provisional
→ organización canónica creada o localizada
→ candidato BINDING_PENDING
→ reconciliación explícita entre identidad provisional y canónica
→ BOUND
→ eventual shadow_remote
→ cutover explícito
→ REMOTE_LOCKED
```

La identidad provisional puede conservarse como dato histórico o de
correlación, pero nunca se declara equivalente por coincidencia de nombre,
slug, owner o path.

### 8.3 Neutralidad del contrato

Ambos recorridos son válidos semánticamente. Este contrato no decide cuál es el
flujo predeterminado, qué interfaz lo inicia ni qué protocolo intercambia la
evidencia.

## 9. Transiciones prohibidas

Son inválidas:

- `UNBOUND → BOUND` sin evaluación verificable;
- `UNBOUND → REMOTE_LOCKED`;
- `BINDING_PENDING → REMOTE_LOCKED`;
- `DIVERGENT → REMOTE_LOCKED` sin resolución previa y binding aceptado;
- `REMOTE_LOCKED → local_legacy` por edición, restore, reinstalación o rollback;
- sustitución de una organización aceptada por otra mediante cambio de slug,
  nombre, directorio, environment variable o archivo local;
- aceptación basada únicamente en un ID copiado;
- aceptación basada únicamente en coincidencia de locator;
- mezcla de autoridad legacy y remota tomando el resultado más permisivo;
- interpretación de ausencia de evidencia como aprobación;
- interpretación de un error de transporte como pérdida o concesión de
  autoridad;
- reemplazo silencioso del binding aceptado ante evidencia contradictoria.

## 10. Invariantes verificables

### BIND-INV-001 — La instalación no crea autoridad remota

**Precondición:** instalación sin binding aceptado.

**Postcondición:** ninguna edición o creación local puede producir estado
`BOUND` o `REMOTE_LOCKED` sin evidencia verificada y aceptación explícita.

### BIND-INV-002 — El locator no prueba identidad

**Precondición:** existe coincidencia de slug, nombre, path o locator legado.

**Postcondición:** la coincidencia puede localizar un candidato, pero no cambia
el estado del binding ni concede autoridad.

### BIND-INV-003 — Un ID copiado no prueba binding

**Precondición:** una identidad canónica aparece en estado local.

**Postcondición:** sólo se acepta si su procedencia, integridad y correspondencia
con la instalación fueron verificadas.

### BIND-INV-004 — Divergencia fail-closed

**Precondición:** dos afirmaciones verificadas son incompatibles.

**Postcondición:** el estado es `DIVERGENT`; ninguna alternativa se selecciona
silenciosamente ni por ser más permisiva.

### BIND-INV-005 — Un solo binding aceptado

**Precondición:** se intenta aceptar un candidato.

**Postcondición:** la instalación conserva como máximo una organización
canónica aceptada. Un segundo candidato incompatible produce divergencia.

### BIND-INV-006 — El binding no concede roles

**Precondición:** binding aceptado.

**Postcondición:** no se infiere membership, rol, scope, vigencia o permiso de la
mera existencia del binding.

### BIND-INV-007 — El modo cambia por separado

**Precondición:** una transición de binding fue aceptada.

**Postcondición:** el modo de autoridad permanece igual salvo una transición de
modo explícita que cumpla sus propias precondiciones.

### BIND-INV-008 — Shadow no modifica enforcement

**Precondición:** binding `BOUND` bajo `shadow_remote`.

**Postcondición:** el estado remoto sólo se verifica y compara; no eleva, reduce
ni reemplaza silenciosamente la decisión productiva legacy.

### BIND-INV-009 — Cutover sin retorno local ordinario

**Precondición:** cutover aceptado.

**Postcondición:** archivos, marcadores, restores y rollbacks locales no pueden
volver a activar autoridad legacy.

### BIND-INV-010 — Renombrar no recrea la organización

**Precondición:** cambia un slug, nombre o directorio.

**Postcondición:** la identidad canónica y el binding permanecen iguales; si el
cambio contradice el binding, se expone como divergencia.

### BIND-INV-011 — Evidencia incompleta no es evidencia negativa ni positiva

**Precondición:** falta una verificación requerida o una fuente no está
disponible.

**Postcondición:** no se acepta ni rechaza identidad por inferencia; el intento
permanece pendiente sólo si sigue siendo inequívoco, o se rechaza explícitamente.
Nunca concede autoridad.

### BIND-INV-012 — Conservación de procedencia

**Precondición:** binding aceptado o divergencia detectada.

**Postcondición:** puede reconstruirse qué evidencia y procedencia produjeron el
resultado. La normalización no elimina la forma ni la fuente originales.

### BIND-INV-013 — Normalización sin ampliación

**Precondición:** se consume una representación legacy reconocida.

**Postcondición:** la vista normalizada contiene únicamente hechos demostrables
por esa representación; campos ausentes no se rellenan con autoridad inferida.

### BIND-INV-014 — Compatibilidad limitada por modo

**Precondición:** un consumidor intenta interpretar un formato legacy.

**Postcondición:** sólo puede hacerlo durante las fases expresamente compatibles.
Después del cutover, ningún lector legacy puede conceder autoridad.

### BIND-INV-015 — Rollback no reduce el estado de corte

**Precondición:** actualización, restore o rollback técnico.

**Postcondición:** la instalación no pierde el binding bloqueado, el hecho del
cutover ni la prohibición de autoridad legacy.

### BIND-INV-016 — Transporte no equivale a aceptación

**Precondición:** Batcave recibe o cachea evidencia.

**Postcondición:** el binding sólo cambia después de la verificación y aceptación
independientes de Nucleus.

### BIND-INV-017 — Autenticación no equivale a binding

**Precondición:** una sesión o identidad externa fue autenticada.

**Postcondición:** no se infiere que la instalación está vinculada a una
organización ni que el actor posee autoridad dentro de ella.

### BIND-INV-018 — La selección activa no cambia identidad

**Precondición:** cambia la organización activa de la instalación.

**Postcondición:** seleccionar un contexto no crea, sustituye ni acepta un
binding. Cada organización requiere su propia relación verificable.

## 11. Evidencia mínima por estado

| Estado | Preguntas que la evidencia debe responder |
|---|---|
| `UNBOUND` | ¿Qué instalación es? ¿Existe identidad provisional? ¿Se confirmó que no hay binding aceptado? ¿Qué locators sólo sirven para descubrimiento? |
| `BINDING_PENDING` | ¿Cuál es el candidato? ¿De dónde provino? ¿Qué intento lo originó? ¿Qué se verificó? ¿Qué falta? ¿Por qué aún no concede autoridad? |
| `BOUND` | ¿Cuál es la identidad canónica? ¿Qué instalación está vinculada? ¿Qué fuente fue aceptada? ¿Qué evidencia se verificó? ¿Cuándo y con qué resultado? ¿Cuál es el modo separado? |
| `DIVERGENT` | ¿Qué afirmaciones chocan? ¿Cuál era el binding previo? ¿Qué fuentes intervinieron? ¿Cuándo se detectó? ¿Qué operaciones deben fallar cerrado? |
| `REMOTE_LOCKED` | ¿Cuál es el binding aceptado? ¿Cuándo ocurrió el cutover? ¿Qué estado impide reactivar legacy? ¿Cómo se demuestra que restore o rollback no redujeron ese estado? |

## 12. Evidencia mínima transversal

Sin fijar campos ni serialización, el sistema debe poder responder:

1. cuál es la identidad de la instalación;
2. cuál es la identidad organizacional canónica esperada o aceptada;
3. qué locators y nombres están asociados sin ser autoridad;
4. cuál es la procedencia declarada y cuál fue verificada;
5. qué evidencia original se recibió;
6. qué verificaciones se realizaron y cuál fue su resultado;
7. qué contradicciones fueron detectadas;
8. cuándo comenzó y terminó cada intento;
9. cuándo se aceptó el binding;
10. cuál era el modo de autoridad antes y después de cada transición;
11. si ocurrió cutover y por qué no puede revertirse localmente;
12. qué decisión rechazó, canceló o resolvió un intento;
13. cómo se correlacionan reintentos sin confundir intentos distintos;
14. si la evidencia corresponde a la organización activa sin derivar identidad
    desde esa selección;
15. qué representación legacy fue normalizada y qué información no podía
    demostrar.

## 13. Tratamiento de evidencia problemática

### 13.1 Insuficiente

Falta al menos una respuesta necesaria, pero lo observado no se contradice.
Puede mantener un intento inequívoco en `BINDING_PENDING` o causar rechazo
explícito. Nunca permite aceptación parcial.

### 13.2 Ambigua

Admite más de una interpretación organizacional. Se rechaza; si afecta un
binding existente o candidato inequívoco, produce `DIVERGENT`.

### 13.3 Contradictoria

Afirma hechos incompatibles. Produce `DIVERGENT`, conserva ambas procedencias y
no sobrescribe el binding aceptado.

### 13.4 No disponible

Una dependencia no pudo responder. La indisponibilidad no prueba aceptación,
rechazo, desvinculación ni revocación. El efecto operativo depende del estado y
modo ya confirmados, sin elevar autoridad.

### 13.5 Replay

La repetición de la misma evidencia no crea una nueva aceptación ni cambia el
binding. La definición física de igualdad, versión y digest pertenece a una
ronda posterior.

## 14. Compatibilidad con las superficies actuales

Este contrato no declara canónica ninguna forma actual de `.ownership.json`.
Las tres formas ejecutables incompatibles y las representaciones documentales
deben tratarse como entradas legacy sujetas a normalización estricta.

La normalización debe preservar:

- forma de origen;
- componente productor o consumidor;
- identidad que realmente puede demostrar;
- campos ausentes;
- contradicciones;
- nivel de confianza alcanzable.

No puede inferir equivalencia entre:

- Backend `organizations.id`;
- Nucleus `org_id` local;
- Batcave `organization_fingerprint` derivado del slug;
- `org_slug` de configuración de máquina.

La equivalencia sólo nace de un binding aceptado conforme a este contrato.

## 15. Responsabilidades por Work

### ROLES

- custodiar la semántica del binding;
- mantenerla separada de roles, assignments y permisos;
- registrar decisiones todavía abiertas sin resolverlas por inferencia.

### BACKEND

- conservar la identidad organizacional canónica estable;
- aportar la procedencia organizacional necesaria para evaluar un candidato;
- no derivar identidad canónica de slug, nombre o usuario externo.

### BATCAVE

- transportar evidencia y metadatos sin convertir recepción en aceptación;
- conservar tenant context sin fabricar identidad desde paths o variables;
- entregar a Nucleus los bytes y procedencia que éste deba verificar.

### NUCLEUS

- verificar y aceptar o rechazar el binding;
- conservar su estado y evidencia mínima;
- separar binding, modo y decisión efectiva;
- impedir que local state reactive autoridad legacy después del cutover.

### METAMORPH

- preservar el estado durable del binding y del cutover durante lifecycle de
  software;
- no transportar ordinariamente, interpretar ni revertir autoridad.

### CONDUCTOR Y GENESIS

- distinguir slug/nombre elegidos por la persona de identidad canónica;
- exponer honestamente instalación no vinculada, pendiente o divergente;
- no crear roles ni autoridad por completar bootstrap.

### BRAIN Y TEMPORAL

- no participan de la aceptación del binding;
- ejecutan únicamente después de la decisión efectiva de Nucleus conforme a
  contratos posteriores.

## 16. Compatibilidad con decisiones previas

Este contrato preserva:

- Backend como fuente de verdad organizacional;
- Batcave como transporte, sincronización y cache, no decisor;
- Nucleus como punto de verificación y autorización efectiva;
- Gravity como restricción de acciones ya autorizadas;
- Metamorph fuera del transporte ordinario de autoridad;
- `local_legacy → shadow_remote → remote_enforced`;
- la condición de que ningún rollback restaure autoridad revocada o legacy.

No modifica ni resuelve:

- la contradicción documental de `Architect`;
- el catálogo de roles;
- scopes o permisos;
- invitaciones, memberships o revocaciones;
- las decisiones abiertas del contrato Backend↔Batcave;
- la política offline.

## 17. Decisiones todavía abiertas

Este documento no decide:

- representación física de los estados;
- nombres de tablas, columnas, archivos, eventos, endpoints, stores o packages;
- protocolo Backend-first o local-first predeterminado;
- actor autorizado para iniciar, aceptar, resolver o recuperar un binding;
- mecanismo de confianza inicial;
- perfil criptográfico;
- targeting por dispositivo;
- expiración, TTL o rotación;
- transporte push, pull o híbrido;
- procedimiento extraordinario posterior a `REMOTE_LOCKED`;
- Authority Snapshot y su wire schema;
- catálogo de roles, `Architect`, roles personalizados, scopes o permisos;
- revocación de memberships y política offline.

## 18. Criterios de aceptación futura

Una implementación futura sólo será conforme si puede demostrar, mediante
pruebas independientes de su representación física, que:

1. no acepta binding por slug, path o ID copiado;
2. no concede autoridad durante `BINDING_PENDING`;
3. detecta y expone identidades contradictorias;
4. conserva un único binding aceptado;
5. mantiene binding y modo como dimensiones independientes;
6. permite shadow sin alterar enforcement productivo;
7. rechaza cutover sin todas sus precondiciones;
8. después del cutover, un restore local no reactiva `local_legacy`;
9. Batcave no puede convertir transporte en aceptación;
10. el binding no crea memberships, roles o permisos;
11. ambos recorridos de bootstrap pueden alcanzar el mismo estado semántico;
12. la evidencia permite auditar cada transición y cada rechazo.

## 19. Regla de continuidad

Este documento se detiene en el contrato semántico del binding organizacional.

La siguiente ronda requiere aprobación explícita de José. No se autoriza desde
aquí:

- diseño físico del binding;
- Authority Snapshot;
- tablas, endpoints, eventos, wire schemas o stores;
- perfil criptográfico, TTL o política offline;
- migraciones o cambios de código.

Antes de cualquier implementación deberá presentarse la lista exacta de
archivos y cambios y obtenerse autorización puntual conforme a `AGENTS.md`.
