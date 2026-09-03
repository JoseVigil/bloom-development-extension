# BLOOM — Contrato semántico del Authority Snapshot v0.1

**Work:** ROLES

**Estado:** propuesta documental para revisión

**Fecha:** 2026-09-04

**Alcance:** contenido semántico, versionado, anti-downgrade, revocación,
reconciliación y freshness del Authority Snapshot.

## 1. Propósito

Este documento define qué hechos organizacionales debe poder representar un
Authority Snapshot y qué condiciones lógicas debe satisfacer antes de que
Nucleus pueda aceptarlo.

El Authority Snapshot es:

```text
una afirmación completa, versionada y verificable de la autoridad
organizacional vigente para una organización canónica
```

No es:

- una decisión efectiva sobre una acción concreta;
- un binding entre instalación y organización;
- una sesión autenticada;
- un permiso creado por Batcave;
- una política local de Nucleus;
- una GravityPosture;
- un mecanismo de ejecución para Brain o Temporal;
- un artefacto administrado ordinariamente por Metamorph.

Backend conserva los hechos organizacionales. Batcave puede transportar y
cachear la representación recibida. Nucleus debe verificarla y aceptarla de
manera independiente antes de utilizarla como entrada de una decisión efectiva.

## 2. Dependencias semánticas aprobadas

Este contrato depende de:

- los doce principios de identidad organizacional aprobados;
- `BLOOM_ORGANIZATIONAL_BINDING_SEMANTIC_CONTRACT_v0_1.md`;
- la separación entre binding, modo de autoridad y decisión efectiva;
- la transición `local_legacy → shadow_remote → remote_enforced`;
- Backend como fuente de verdad organizacional;
- Nucleus como punto local de verificación, aceptación y decisión efectiva;
- la política aprobada de anti-downgrade y operación offline fail-closed.

No reabre estados, transiciones ni invariantes del binding.

## 3. Vocabulario semántico

### 3.1 Authority Snapshot

Representación completa de los hechos de autoridad de una organización en una
versión determinada. Debe poder evaluarse como una unidad coherente.

### 3.2 Organización sujeto

Organización canónica cuyos principals, memberships, definiciones,
asignaciones y revocaciones representa el snapshot.

### 3.3 Fuente organizacional

Autoridad remota responsable de producir la afirmación organizacional. Su
identificación y procedencia deben poder verificarse sin inferirlas desde la
ruta de transporte.

### 3.4 Versión de autoridad

Posición monotónica de una afirmación organizacional dentro de la secuencia de
estado de una organización. Ordena snapshots de la misma organización y fuente;
no expresa por sí misma tiempo, vigencia ni confianza.

### 3.5 Digest de contenido

Referencia que permite determinar si dos representaciones atribuidas a la misma
versión afirman exactamente el mismo contenido protegido. Este documento no
define algoritmo ni formato.

### 3.6 Referencia de clave

Identificación de la autoridad verificadora esperada para la afirmación. No es
la clave misma ni define su formato o rotación.

### 3.7 Referencia de firma

Evidencia de que la afirmación fue emitida bajo la autoridad correspondiente.
Su presencia no equivale a verificación exitosa.

### 3.8 Principal

Identidad interna estable de una persona, servicio u otro actor reconocido por
la organización. Una identidad externa vinculada es evidencia o atributo del
principal, no su definición completa.

### 3.9 Membership

Relación entre un principal y una organización. Expresa pertenencia y estado de
esa pertenencia; no asigna por sí sola capacidades.

### 3.10 Definición de rol

Definición organizacional versionada de una capacidad o conjunto de
responsabilidades. El snapshot debe poder identificar qué versión de una
definición corresponde a cada asignación, sin que este documento apruebe ningún
rol concreto.

### 3.11 Asignación

Relación que asocia un principal o membership con una definición de rol dentro
de un alcance y una vigencia determinados.

### 3.12 Scope

Límite organizacional al que se aplica una asignación. Este documento exige que
el alcance sea explícito, pero no define su catálogo ni herencia.

### 3.13 Vigencia

Condiciones temporales y de estado que determinan si una membership, definición
o asignación puede considerarse aplicable. No se fijan duraciones.

### 3.14 Revocación

Hecho organizacional que invalida una relación o autoridad previamente vigente
y que no puede deshacerse mediante replay, restore o rollback de una versión
anterior.

### 3.15 Emisión

Momento lógico en que la fuente organizacional produce la afirmación.

### 3.16 Expiración

Límite tras el cual el snapshot deja de ser suficientemente vigente para
autorizar nuevas operaciones organizacionales conforme a la política
fail-closed. Este documento no fija su duración.

### 3.17 Snapshot aceptado

Snapshot que Nucleus verificó completamente, comparó contra su estado monotónico
y persistió como versión organizacional vigente para la instalación vinculada.

### 3.18 Candidato

Snapshot recibido pero todavía no aceptado. Puede ser rechazado, reconocido
como replay, marcado como conflicto o aceptado después de verificación completa.

### 3.19 High-water mark

Mayor versión de autoridad aceptada por Nucleus para una organización y fuente
determinadas. Es estado durable separado del snapshot reemplazable.

### 3.20 Cambio incremental

Afirmación que describe una transición desde una versión base conocida hacia
otra versión. No sustituye la capacidad de reconciliar mediante un snapshot
completo.

## 4. Estructura semántica

El Authority Snapshot debe poder representar cinco planos relacionados.

### 4.1 Plano de identidad de la afirmación

Debe identificar inequívocamente:

- organización sujeto;
- fuente organizacional;
- versión de autoridad;
- emisión;
- inicio de aplicabilidad, cuando corresponda;
- expiración;
- digest de contenido;
- referencia de clave;
- referencia de firma.

Estos elementos describen la afirmación. No prueban por sí solos que Nucleus la
haya verificado o aceptado.

### 4.2 Plano de principals e identidades vinculadas

Debe poder representar:

- cada principal estable relevante para la organización;
- sus identidades externas vinculadas;
- estado de cada vínculo;
- evidencia semántica de que el vínculo pertenece al principal indicado;
- ausencia, suspensión o sustitución de un vínculo sin cambiar implícitamente
  la identidad estable del principal.

Una identidad externa no debe convertirse automáticamente en membership o rol.

### 4.3 Plano de memberships

Cada membership debe poder relacionar:

- exactamente un principal;
- exactamente una organización sujeto;
- estado de membership;
- inicio y fin de vigencia cuando apliquen;
- evidencia de aceptación cuando el contrato futuro la requiera;
- referencia a su revocación o suspensión, si existe.

La membership no contiene implícitamente una definición de rol ni una decisión
de permiso.

### 4.4 Plano de definiciones y asignaciones

Cada definición de rol debe poder:

- identificarse establemente dentro de la organización;
- distinguir su versión;
- indicar su estado de vigencia;
- ser referenciada sin depender de un título humano mutable.

Cada asignación debe poder relacionar:

- principal o membership destinataria;
- definición y versión aplicable;
- organización sujeto;
- scope explícito;
- inicio y fin de vigencia cuando apliquen;
- estado de aceptación, si corresponde;
- estado de suspensión o revocación;
- procedencia administrativa suficiente para auditoría.

El snapshot no necesita convertir definiciones en decisiones concretas. Nucleus
debe evaluar la acción solicitada contra todas las fronteras locales aplicables.

### 4.5 Plano de revocaciones

Debe poder demostrar:

- qué relación o autoridad fue revocada;
- a qué organización y versión pertenece;
- desde qué punto deja de ser vigente;
- que la revocación fue incluida en la secuencia monotónica;
- que una versión anterior no puede restaurar el elemento revocado;
- si la entidad continúa representada como histórica/no vigente o si su ausencia
  está acompañada por evidencia suficiente para distinguirla de pérdida de datos.

## 5. Relaciones y restricciones semánticas

### 5.1 Tenant binding

Todo elemento organizacional del snapshot pertenece a la organización sujeto o
está referenciado explícitamente bajo un contrato que permita verificar esa
relación. No se admiten referencias ambiguas entre organizaciones.

### 5.2 Principal antes que autoridad

Una membership o asignación no puede apuntar a una identidad externa suelta. El
destinatario debe ser un principal estable o una membership inequívocamente
ligada a él.

### 5.3 Membership antes que asignación aplicable

Una asignación no puede considerarse aplicable si la membership necesaria está
ausente, suspendida, vencida o revocada. Que la asignación exista no repara una
membership inválida.

### 5.4 Definición versionada

Una asignación debe referenciar una definición identificable y una versión
determinada. La definición más nueva no sustituye silenciosamente la versión
asignada.

### 5.5 Scope explícito

Una asignación sin scope interpretable no adquiere por defecto scope
organizacional total. La ausencia o ambigüedad falla cerrado.

### 5.6 Vigencia conjuntiva

Para que una asignación sea candidata a una decisión efectiva deben resultar
vigentes, al menos:

```text
snapshot
∩ principal/identity binding aplicable
∩ membership
∩ definición referenciada
∩ asignación
∩ scope
```

La invalidez de cualquier término no se compensa con otro término más
permisivo.

### 5.7 Revocación dominante

Una revocación aplicable prevalece sobre la presencia histórica de la entidad
revocada. Un dato antiguo, cache, replay o rollback no puede volverla vigente.

### 5.8 Completitud evaluable

Un snapshot completo debe permitir distinguir entre:

- entidad existente y vigente;
- entidad existente pero no vigente;
- entidad revocada;
- entidad inexistente en esa versión;
- dato que no puede determinarse por evidencia incompleta.

No puede utilizar ausencia ambigua como evidencia de vigencia o revocación.

## 6. Estados de procesamiento del snapshot

Estos estados describen el procesamiento local de una afirmación, no nombres de
archivo, enums o eventos.

### 6.1 RECEIVED

La representación llegó a la frontera local. No fue verificada ni aceptada y no
concede autoridad.

### 6.2 VERIFYING

Nucleus evalúa organización, binding, fuente, integridad, firma, versión,
coherencia, vigencia y completitud. La autoridad productiva no cambia.

### 6.3 REPLAY_CONFIRMED

La versión coincide con el high-water mark y el digest coincide con el snapshot
ya aceptado. El resultado es idempotente: no crea una nueva aceptación ni
modifica autoridad.

### 6.4 REJECTED_DOWNGRADE

La versión recibida es inferior al high-water mark. Se rechaza antes de que
pueda sustituir estado aceptado.

### 6.5 INTEGRITY_CONFLICT

La versión coincide con el high-water mark pero el digest difiere. El conflicto
se conserva como incidente verificable; ninguna de las representaciones se
elige automáticamente.

### 6.6 REJECTED_INVALID

La afirmación no supera alguna verificación obligatoria distinta de downgrade o
conflicto de misma versión: organización, binding, procedencia, integridad,
firma, coherencia, vigencia o completitud.

### 6.7 ACCEPTED_CURRENT

Nucleus verificó y aceptó una versión superior. El snapshot pasa a ser la
proyección organizacional vigente y el high-water mark avanza conjuntamente.

### 6.8 EXPIRED

El snapshot previamente aceptado superó su vigencia. No se borra ni se trata
como nunca aceptado; deja de habilitar nuevas operaciones que requieran
autoridad organizacional y activa el comportamiento restringido aprobado.

## 7. Versionado y anti-downgrade

La comparación sólo es válida dentro del mismo binding de organización y fuente.
Una organización o fuente diferente no es una versión competidora: es evidencia
inválida o divergente respecto del binding.

### SNAP-INV-001 — Versión inferior se rechaza

**Precondición:** existe high-water mark aceptado y la versión candidata es
inferior.

**Postcondición:** estado `REJECTED_DOWNGRADE`; no cambia snapshot aceptado,
high-water mark, binding ni modo de autoridad.

### SNAP-INV-002 — Replay idéntico es idempotente

**Precondición:** versión candidata igual al high-water mark y digest igual al
contenido aceptado.

**Postcondición:** estado `REPLAY_CONFIRMED`; no se crea una versión nueva, no se
renueva vigencia por mera recepción y no cambia autoridad.

### SNAP-INV-003 — Misma versión con digest diferente es conflicto

**Precondición:** versión candidata igual al high-water mark y digest distinto.

**Postcondición:** estado `INTEGRITY_CONFLICT`; el snapshot aceptado no se
reemplaza, el high-water mark no cambia y el incidente queda expuesto.

### SNAP-INV-004 — Versión superior sólo es candidata

**Precondición:** versión candidata superior al high-water mark.

**Postcondición:** no se acepta hasta completar todas las verificaciones. Ser
más nueva no compensa firma, binding, coherencia, vigencia o completitud
inválidas.

### SNAP-INV-005 — Aceptación y high-water mark son atómicos semánticamente

**Precondición:** un candidato superior superó todas las verificaciones.

**Postcondición:** la proyección aceptada y el high-water mark representan la
misma versión. No existe un estado observable donde la nueva proyección autorice
pero el high-water mark antiguo permita downgrade, ni el inverso.

### SNAP-INV-006 — El high-water mark no disminuye

**Precondición:** cualquier restore, rollback, reinstalación, replay o
reconciliación.

**Postcondición:** el high-water mark es igual o superior al previamente
aceptado. Si no puede demostrarse, nuevas operaciones organizacionales fallan
cerrado.

### SNAP-INV-007 — La versión está ligada a organización y fuente

**Precondición:** se compara un candidato con estado aceptado.

**Postcondición:** sólo se comparan versiones pertenecientes a la misma
organización canónica y fuente aceptada. Una diferencia produce rechazo o
divergencia de binding, no una comparación ordinal.

### SNAP-INV-008 — Versión no equivale a emisión o freshness

**Precondición:** una versión es superior o igual a la aceptada.

**Postcondición:** vigencia y freshness se verifican independientemente. Una
versión más alta puede estar fuera de vigencia o ser incoherente.

### SNAP-INV-009 — Rechazo no altera estado productivo

**Precondición:** un candidato resulta downgrade, conflicto o inválido.

**Postcondición:** conserva el último snapshot aceptado y su high-water mark. El
comportamiento posterior depende de si ese snapshot continúa vigente, nunca del
candidato rechazado.

### SNAP-INV-010 — No hay force-downgrade ordinario

**Precondición:** un operador o componente solicita aceptar una versión inferior.

**Postcondición:** rechazo. Cualquier recuperación extraordinaria requeriría un
contrato posterior, separado y explícitamente aprobado.

## 8. Relación con estados de binding y modos

### 8.1 `UNBOUND`

Ningún snapshot puede ser aceptado. La organización sujeto no tiene binding
local confirmado. La recepción puede aportar un candidato de binding, pero debe
seguir el contrato de binding y no este contrato de aceptación.

### 8.2 `BINDING_PENDING`

Un snapshot puede aportar evidencia al proceso de binding, pero no convertirse
en proyección organizacional aceptada ni conceder autoridad.

### 8.3 `BOUND + local_legacy`

El binding permite comprobar organización y procedencia, pero el modelo remoto
no gobierna decisiones productivas. La aceptación operativa del snapshot como
fuente de autorización todavía no está habilitada.

### 8.4 `BOUND + shadow_remote`

Nucleus puede verificar, aceptar monotónicamente y conservar snapshots para
comparación. Debe registrar diferencias respecto de decisiones legacy sin
alterar el resultado productivo.

Invariante:

> Un snapshot aceptado en shadow demuestra que la cadena de verificación y
> estado monotónico funciona; no demuestra que la autoridad remota ya gobierna
> la ejecución.

### 8.5 Precondición de cutover

Para transicionar a `REMOTE_LOCKED + remote_enforced` debe existir:

- binding `BOUND` sin divergencias abiertas;
- al menos un snapshot `ACCEPTED_CURRENT` y vigente;
- high-water mark durable correspondiente a esa misma versión;
- capacidad comprobada de rechazar downgrade y conflicto;
- ausencia de dependencia productiva de marcadores legacy para la decisión
  remota inicial.

### 8.6 `REMOTE_LOCKED + remote_enforced`

Sólo un snapshot `ACCEPTED_CURRENT` y vigente puede aportar hechos
organizacionales a nuevas decisiones efectivas. El binding bloqueado impide que
otra organización o una edición local sustituya la organización sujeto.

Un snapshot vencido no reactiva `local_legacy`.

### SNAP-INV-011 — Shadow no autoriza

**Precondición:** snapshot aceptado bajo `BOUND + shadow_remote`.

**Postcondición:** puede compararse y auditarse, pero no modificar la decisión
productiva legacy.

### SNAP-INV-012 — Cutover requiere estado remoto aceptado

**Precondición:** solicitud de transición a `REMOTE_LOCKED`.

**Postcondición:** se rechaza salvo que exista snapshot vigente aceptado y
high-water mark coherente con el binding.

### SNAP-INV-013 — Expiración no revierte binding ni modo

**Precondición:** snapshot aceptado expira bajo `REMOTE_LOCKED`.

**Postcondición:** binding y modo permanecen; nuevas operaciones privilegiadas
fallan cerrado y nunca reaparece autoridad legacy.

## 9. Revocación

### 9.1 Semántica mínima

Una revocación debe permitir determinar inequívocamente:

- entidad o relación afectada;
- organización sujeto;
- versión en la que la revocación resulta visible;
- punto desde el cual deja de considerarse vigente;
- si afecta membership, asignación, definición u otro hecho autorizado por un
  contrato posterior;
- relación con versiones previas en las que el elemento era vigente.

### 9.2 Representación positiva o ausencia demostrable

El snapshot puede representar la revocación mediante una afirmación positiva de
no vigencia o mediante una ausencia respaldada por completitud y continuidad
monotónica suficientes.

La ausencia sola no alcanza cuando también podría significar:

- sincronización incompleta;
- gap incremental;
- filtrado inesperado;
- corrupción;
- scope no incluido;
- pérdida de datos.

Nucleus debe poder distinguir revocación de desincronización antes de usarla en
una decisión.

### 9.3 Efecto local

Una vez aceptada una versión que demuestra revocación:

- la entidad revocada deja de ser candidata para nuevas decisiones;
- una versión anterior no puede restaurarla;
- caches o proyecciones derivadas deben quedar subordinadas a la versión
  aceptada;
- la continuidad de trabajo en curso requiere revalidación conforme a contratos
  posteriores;
- no se habilita rollback hacia autoridad legacy.

### SNAP-INV-014 — Revocación domina historia

**Precondición:** snapshot aceptado demuestra que una entidad fue revocada.

**Postcondición:** ninguna versión inferior, cache, restore o replay puede volver
a tratarla como vigente.

### SNAP-INV-015 — Ausencia ambigua no prueba revocación

**Precondición:** una entidad previamente conocida falta en un candidato.

**Postcondición:** sólo se considera revocada si la completitud y continuidad de
la afirmación permiten distinguir revocación de pérdida o gap. En caso contrario
el candidato no puede aceptarse como base suficiente para esa conclusión.

### SNAP-INV-016 — Revocación no reduce el high-water mark

**Precondición:** se acepta una versión que contiene o demuestra revocaciones.

**Postcondición:** el high-water mark avanza con esa versión y sobrevive a
rollback, preservando `BIND-INV-015`.

### SNAP-INV-017 — Cutover impide fallback revocatorio

**Precondición:** una autoridad remota fue revocada bajo `REMOTE_LOCKED`.

**Postcondición:** marcadores o ownership legacy no pueden sustituir la autoridad
revocada, preservando `BIND-INV-009`.

### SNAP-INV-018 — Reaparición requiere evidencia superior coherente

**Precondición:** una entidad revocada aparece como vigente en un candidato
posterior.

**Postcondición:** no se acepta por mera presencia. Debe existir una transición
organizacional posterior, explícita y coherente con la semántica que finalmente
se apruebe. Este documento no define rehabilitación ni reasignación.

## 10. Snapshot completo

Un snapshot completo afirma el conjunto evaluable de hechos organizacionales
para una versión y scope de completitud declarados.

Debe permitir:

- reconstruir la autoridad organizacional vigente sin depender de incrementos
  anteriores;
- distinguir vigente, no vigente, revocado, inexistente e indeterminado;
- detectar referencias huérfanas;
- comprobar coherencia interna;
- recuperar tras gaps incrementales;
- reconciliar la proyección local.

"Completo" no significa necesariamente que exponga datos ajenos al tenant o
fuera del alcance autorizado. Significa que su frontera de completitud está
declarada y es suficiente para las decisiones que pretende sustentar.

## 11. Sincronización incremental

Un cambio incremental describe una transición ordenada entre una versión base y
una versión resultante.

Debe permitir determinar:

- organización y fuente;
- versión base esperada;
- versión resultante;
- cambios afirmados;
- continuidad sin gaps;
- resultado de aplicar el cambio sobre una base conocida;
- digest o evidencia equivalente del estado resultante;
- revocaciones incluidas;
- si requiere reconciliación completa.

No puede aplicarse cuando:

- la base local no coincide con la base declarada;
- existe un gap;
- la organización o fuente difiere;
- el cambio produce referencias incoherentes;
- la evidencia no permite verificar el estado resultante;
- existe conflicto con el high-water mark.

### SNAP-INV-019 — Incremental requiere base exacta

**Precondición:** se recibe un cambio incremental.

**Postcondición:** sólo puede producir un candidato si la versión y estado base
local coinciden inequívocamente con los declarados.

### SNAP-INV-020 — Gap obliga a reconciliación

**Precondición:** falta una versión o no puede demostrarse continuidad.

**Postcondición:** no se aplican cambios posteriores por aproximación; se requiere
una reconciliación completa.

### SNAP-INV-021 — Incremental y completo convergen

**Precondición:** una secuencia incremental válida y un snapshot completo
representan la misma versión organizacional.

**Postcondición:** deben producir el mismo estado semántico y digest verificable.
Una diferencia es conflicto, no preferencia silenciosa.

### SNAP-INV-022 — Incremental no debilita revocación

**Precondición:** la secuencia contiene una revocación.

**Postcondición:** gaps, reordenamiento o replay no pueden omitirla y aun así
producir una versión aceptada.

## 12. Reconciliación

La reconciliación compara el estado local aceptado con una afirmación completa
válida de la misma organización y fuente.

Resultados semánticos posibles:

- equivalencia confirmada;
- avance monotónico candidato;
- replay confirmado;
- downgrade rechazado;
- conflicto de integridad;
- gap recuperado mediante estado completo;
- inconsistencia que impide aceptación;
- imposibilidad de determinar por evidencia insuficiente.

La reconciliación no:

- concede permisos por sí misma;
- selecciona el estado más permisivo;
- reduce el high-water mark;
- reactiva datos revocados;
- modifica el binding;
- cambia de modo automáticamente;
- transforma indisponibilidad en aceptación o revocación.

### SNAP-INV-023 — Reconciliación preserva monotonicidad

**Precondición:** se reconcilia contra cualquier afirmación remota.

**Postcondición:** el resultado aceptado nunca queda por debajo del high-water
mark.

### SNAP-INV-024 — Reconciliación no resuelve binding

**Precondición:** organización o fuente contradice el binding.

**Postcondición:** se deriva al estado de divergencia del contrato de binding;
no se sustituye la identidad vinculada desde el contenido del snapshot.

### SNAP-INV-025 — Inconsistencia se expone

**Precondición:** una reconciliación no puede producir un estado coherente.

**Postcondición:** el conflicto queda explícito y el último estado aceptado no se
sobrescribe silenciosamente.

## 13. Vigencia, freshness y expiración

### 13.1 Vigente

Un snapshot es semánticamente vigente cuando:

- fue aceptado;
- corresponde al binding activo;
- no alcanzó su expiración;
- no existe evidencia aceptada posterior que lo sustituya;
- su integridad y procedencia continúan siendo evaluables;
- satisface cualquier requisito de freshness aplicable a la clase de operación,
  cuando ese contrato sea aprobado.

### 13.2 Expirado

Un snapshot está expirado cuando superó el límite de vigencia afirmado y
aceptado. La expiración:

- no borra la historia;
- no reduce el high-water mark;
- no deshace el binding;
- no revierte `remote_enforced`;
- no restaura archivos o roles legacy;
- bloquea nuevas operaciones que requieren autoridad organizacional vigente;
- permite únicamente las clases restringidas que apruebe la política offline.

### 13.3 Freshness

Freshness expresa cuán reciente debe ser la confirmación organizacional para
una operación. Es distinta de:

- versión;
- emisión;
- expiración;
- conectividad actual;
- hora de recepción local.

Este contrato no fija umbrales ni clases de operación.

### 13.4 Indisponibilidad

No poder contactar Backend o Batcave no cambia por sí solo la vigencia de un
snapshot aceptado. Mientras siga vigente, puede utilizarse conforme a la
política aprobada. Una vez expirado, la indisponibilidad no extiende su vigencia.

### SNAP-INV-026 — Recepción no renueva vigencia

**Precondición:** se recibe replay de un snapshot ya aceptado.

**Postcondición:** la mera recepción no cambia emisión, expiración ni freshness.

### SNAP-INV-027 — Conectividad no equivale a vigencia

**Precondición:** Backend o Batcave está disponible o indisponible.

**Postcondición:** la vigencia se determina desde la afirmación aceptada y la
política aplicable, no desde el estado de la conexión.

### SNAP-INV-028 — Expiración falla cerrado

**Precondición:** snapshot aceptado expirado bajo `remote_enforced`.

**Postcondición:** se bloquean nuevas operaciones que requieran autoridad
organizacional vigente; no se usa `local_legacy` como fallback.

### SNAP-INV-029 — Freshness no se infiere

**Precondición:** una operación requiere evidencia más reciente que la vigencia
general.

**Postcondición:** si no puede demostrarse el requisito, la operación falla
cerrado. No se infiere freshness desde versión alta o conexión disponible.

## 14. Verificación mínima antes de aceptación

Antes de aceptar un candidato, Nucleus debe poder responder afirmativamente:

1. ¿La organización sujeto coincide con el binding aceptado?
2. ¿La fuente coincide con la procedencia confiada por el binding?
3. ¿La integridad del contenido fue verificada?
4. ¿La firma o evidencia de emisión fue verificada?
5. ¿La versión fue comparada contra el high-water mark correcto?
6. ¿El candidato no es downgrade ni conflicto de misma versión?
7. ¿La afirmación está dentro de su vigencia?
8. ¿La estructura semántica es completa para su alcance declarado?
9. ¿Principals, memberships, definiciones y asignaciones no contienen
   referencias ambiguas o huérfanas?
10. ¿Scopes y vigencias necesarios son explícitos y evaluables?
11. ¿Las revocaciones pueden distinguirse de gaps o datos ausentes?
12. ¿La aceptación y el avance monotónico pueden persistirse conjuntamente?
13. ¿El modo actual permite aceptar para shadow o enforcement sin mezclar sus
   efectos?

Una respuesta negativa o indeterminada impide aceptación.

## 15. Evidencia mínima conservada por Nucleus

Sin fijar campos o stores, Nucleus debe poder demostrar:

- organización y fuente verificadas;
- binding utilizado;
- versión candidata y versión previamente aceptada;
- digest candidato y digest aceptado comparable;
- resultado de integridad y procedencia;
- resultado de cada verificación obligatoria;
- estado final de procesamiento;
- motivo de rechazo o conflicto;
- momento de recepción, verificación y aceptación;
- high-water mark antes y después;
- si se procesó snapshot completo o cambio incremental;
- continuidad o gap detectado;
- revocaciones incorporadas;
- vigencia y estado de expiración;
- modo de autoridad bajo el que ocurrió el procesamiento;
- correlación idempotente de reintentos;
- evidencia original suficiente para auditoría.

La evidencia de decisión efectiva sobre una acción concreta pertenece a un
contrato posterior y no se confunde con la aceptación del snapshot.

## 16. Responsabilidades por Work

### ROLES

- custodiar la semántica de principals, memberships, definiciones,
  asignaciones, scopes, vigencias y revocaciones;
- mantener el snapshot separado de la decisión efectiva;
- no aprobar por inferencia un catálogo de roles.

### BACKEND

- producir una afirmación completa y monotónica por organización;
- conservar relaciones y revocaciones coherentes;
- evitar reutilizar una versión para contenidos diferentes;
- permitir reconciliación completa después de gaps.

### BATCAVE

- transportar y cachear bytes y metadatos sin interpretarlos como autoridad;
- preservar organización, procedencia, versión y orden de transporte;
- no extender vigencia ni resolver conflictos de aceptación;
- permitir recuperación sin omitir revocaciones.

### NUCLEUS

- verificar organización, binding, procedencia, integridad, firma, versión,
  vigencia y coherencia;
- aceptar o rechazar candidatos;
- conservar snapshot aceptado y high-water mark durable separado;
- resolver hechos organizacionales como entrada de decisiones efectivas;
- fallar cerrado ante expiración, gaps o conflictos relevantes.

### METAMORPH

- preservar snapshot aceptado, high-water mark, binding y cutover durante
  lifecycle de software;
- no transportar, interpretar ni revertir autoridad organizacional.

### BRAIN Y TEMPORAL

- ejecutar únicamente operaciones que ya atravesaron la decisión efectiva de
  Nucleus;
- revalidar antes de pasos privilegiados conforme a contratos posteriores;
- no consumir el snapshot como fuente paralela de autorización.

## 17. Invariantes consolidados

El contrato fija veintinueve invariantes:

- `SNAP-INV-001` a `010`: versionado, replay y anti-downgrade;
- `SNAP-INV-011` a `013`: binding, shadow y cutover;
- `SNAP-INV-014` a `018`: revocación;
- `SNAP-INV-019` a `022`: sincronización incremental;
- `SNAP-INV-023` a `025`: reconciliación;
- `SNAP-INV-026` a `029`: vigencia, freshness y expiración.

Todos son independientes de representación física y deben poder probarse en
cualquier implementación posterior.

## 18. Decisiones todavía abiertas

Este documento no decide:

- wire schema o serialización;
- tablas, columnas, endpoints, eventos, stores, packages o archivos;
- algoritmo o formato de digest;
- algoritmo o formato de firma;
- contenido y rotación del trust bundle;
- TTL o umbral numérico de freshness;
- latencia máxima de revocación;
- transporte push, pull o híbrido;
- acknowledgements físicos;
- catálogo de roles;
- existencia de `Architect`;
- scopes concretos o reglas de herencia;
- permisos;
- protocolo de invitación, aceptación o rehabilitación;
- política detallada para trabajo en curso;
- procedimiento extraordinario de recuperación o downgrade;
- cambios de código o migraciones.

## 19. Criterios de conformidad futura

Una implementación futura sólo será conforme si demuestra que:

1. un snapshot recibido no autoriza antes de aceptación;
2. organización y fuente están ligadas al binding correcto;
3. downgrade siempre se rechaza;
4. replay idéntico es idempotente y no renueva vigencia;
5. misma versión con contenido distinto produce conflicto;
6. versión superior no evita verificaciones;
7. aceptación y high-water mark no divergen;
8. rollback no reduce estado monotónico;
9. shadow no cambia enforcement productivo;
10. cutover exige snapshot inicial aceptado y vigente;
11. expiración no reactiva legacy;
12. revocación no puede perderse por ausencia ambigua;
13. cambios incrementales requieren base exacta;
14. gaps obligan a reconciliación completa;
15. snapshot completo e incrementales convergen al mismo estado;
16. Batcave no decide aceptación;
17. Nucleus conserva evidencia verificable de cada resultado;
18. el snapshot no concede por sí solo una autorización efectiva.

## 20. Regla de continuidad

Este documento se detiene en la definición semántica del Authority Snapshot.

No autoriza:

- diseño físico;
- wire schema;
- modelo de persistencia;
- APIs o eventos;
- protocolo criptográfico;
- TTL o intervalos;
- implementación, migraciones o pruebas de código.

La siguiente ronda requiere aprobación explícita y una lista exacta de archivos
y cambios conforme a `AGENTS.md`.
