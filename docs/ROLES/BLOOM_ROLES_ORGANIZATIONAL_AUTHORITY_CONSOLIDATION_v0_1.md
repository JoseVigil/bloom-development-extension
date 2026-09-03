# BLOOM — Consolidación de autoridad organizacional y roles v0.1

**Work:** ROLES  
**Estado:** consolidación documental para coordinación; no constituye un schema ni una autorización de implementación  
**Fecha:** 2026-09-02  
**Autoridad de diseño:** José Vigil

## 1. Propósito

Este documento consolida el estado alcanzado por el Work ROLES y las
contribuciones coordinadas de BACKEND, BATCAVE, NUCLEUS y METAMORPH sobre la
evolución de la autoridad organizacional de Bloom.

Su finalidad es ofrecer una referencia común para Genesis Control, AGENDA y
AGENDA FOLLOWUP sin obligarlos a reconstruir el estado desde documentos
separados.

Esta consolidación:

- distingue el comportamiento material vigente de la dirección arquitectónica;
- registra las responsabilidades acordadas entre Works;
- identifica las contradicciones preservadas durante la migración;
- enumera las decisiones que continúan abiertas;
- no aprueba tablas, endpoints, eventos, wire schemas, stores, paquetes, TTL,
  perfil criptográfico ni cambios de implementación.

## 2. Documentos intervinientes

### 2.1 Documentos del Work ROLES

1. `docs/ROLES/BLOOM_ROLES_DISCOVERY_BASE_v0_1.md`

   Base verificable del modelo material actual. Documenta los roles reconocidos
   por Nucleus, onboarding, ownership, administración local de miembros y los
   vacíos de identidad, invitación, asignación, revocación y enforcement.

2. `docs/ROLES/BLOOM_GUIDE_ROLE_DESIGN_AND_CREATION_v0_1.md`

   Guía metodológica para descubrir responsabilidades y operaciones antes de
   definir roles. Separa identidad, membership, rol, scope, permiso, política y
   límites técnicos. Sus ejemplos no constituyen roles aprobados.

3. `docs/ROLES/BLOOM_REMOTE_ORGANIZATIONAL_ROLE_AUTHORITY_REQUIREMENT_v0_1.md`

   Requerimiento transversal que fija la dirección de autoridad organizacional
   remota y las fronteras entre Backend, Batcave, Nucleus, Brain, Temporal y
   Metamorph.

### 2.2 Documentos actualizados coordinadamente

4. `docs/BATCAVE/BATCAVE_ARCHITECTURE.md`

   Conserva las premisas de BATCAVE v1.2 como comportamiento legado, documenta
   sus contradicciones con el modelo objetivo y formaliza la migración
   `local_legacy → shadow_remote → remote_enforced`.

5. `docs/GOVERNANCE/AUTHORIZATION/NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md`

   Antecedente del Work AUTHORIZATION, actualmente incorporado al contexto de
   ROLES. Caracteriza el modelo local anterior como `local_legacy` y registra la
   metodología objetivo de verificación, aceptación monotónica y decisión
   efectiva de Nucleus.

## 3. Verdad material vigente

La implementación actual de Nucleus reconoce:

- `Master`;
- `Specialist`;
- `Unknown`.

Los marcadores locales `.master` y `.specialist` participan de la detección del
rol. La ausencia de una identidad reconocida produce `Unknown`; la detección es
fail-closed.

`Architect` aparece en documentación histórica y borradores, pero no existe en
el enum, los marcadores, la detección, la asignación ni los guards vigentes. No
es un rol aprobado.

El onboarding actual obtiene una identidad GitHub y crea el Master inicial. Esa
prueba de identidad externa no equivale a un contrato corporativo completo de
membership o asignación de rol.

`team_members[].role` es actualmente una declaración administrativa local. No
implementa por sí misma invitación, aceptación, prueba de identidad, vigencia,
revocación ni materialización del rol efectivo.

`.ownership.json`, `.master`, `.specialist`, `GetUserRole()` y los guards
Master-only constituyen superficies del modelo local vigente. Permanecen
operativos durante `local_legacy`, pero no son el destino del modelo
organizacional corporativo.

## 4. Principio rector

> The remote backend preserves the organizational source of identities,
> memberships, roles, and assignments. Nucleus consumes verifiable, versioned,
> and revocable state and remains the local point that decides and applies
> effective authorization together with current policies, Gravity, and technical
> limits.

Un rol no es una propiedad global de una persona ni de su computadora. Es una
relación entre:

```text
actor + organización + scope + rol + vigencia
```

Identidad, membership, definición de rol, asignación y permiso deben permanecer
separados. Una jerarquía organizacional tampoco concede automáticamente acceso
a datasets, credenciales, entornos o recursos.

## 5. Recorrido arquitectónico acordado

```text
Backend organizational truth
        ↓
Batcave transport / synchronization / cache
        ↓
Nucleus verification and effective authorization
        ↓
Brain / Temporal bounded execution
```

Metamorph no integra el recorrido ordinario de propagación de autoridad. Su
responsabilidad permanece limitada al lifecycle del software participante y a
preservar el estado durable durante instalaciones, actualizaciones y rollbacks.

## 6. Responsabilidades por Work

### 6.1 BACKEND

Backend conserva la fuente de verdad de:

- principals internos estables;
- identidades externas vinculadas;
- memberships;
- definiciones versionadas de roles;
- asignaciones scoped;
- vigencias, suspensiones y revocaciones;
- historial de auditoría;
- versión monotónica de autoridad por organización;
- producción canónica del Authority Snapshot.

El schema actual es preliminar e insuficiente como modelo corporativo final:

- `users.id` depende actualmente de GitHub;
- `organizations.masterGithubUsername` mezcla identidad externa y autoridad;
- `orgMembers.role` colapsa membership, definición y asignación en un string.

D1, `organization_fingerprint` y el pull condicional son precedentes
reutilizables. Los contratos de releases, downloads, R2 y ETag no son contratos
de autoridad. ETag puede optimizar la transferencia, pero no reemplaza firma,
digest, vigencia, versión monotónica ni protección contra replay.

### 6.2 BATCAVE

Batcave:

- autentica la sesión remota;
- aplica controles de transporte;
- transporta, sincroniza y cachea el Authority Snapshot por organización;
- entrega a Nucleus los bytes y metadatos exactos.

Batcave no:

- crea ni asigna roles;
- concede permisos;
- evalúa Gravity;
- convierte falta de conectividad en autorización;
- reemplaza la verificación independiente de Nucleus.

BlindJudge conserva temporalmente su comportamiento legado. En el estado
objetivo actúa como gate de sesión, envelope y transporte, no como decisor final
de roles o permisos.

### 6.3 NUCLEUS

Nucleus:

- verifica la organización y el tenant binding;
- verifica procedencia, integridad, digest y firma;
- valida vigencia y versión monotónica;
- mantiene un high-water mark durable separado del snapshot;
- rechaza downgrade, replay inválido y conflictos de digest;
- acepta o rechaza el Authority Snapshot;
- calcula autorización efectiva según el contexto;
- registra qué versión de autoridad respaldó cada decisión.

La autorización efectiva combina:

```text
Authority Snapshot verificado y aceptado
∩ Sovereign Policy
∩ GravityPostures
∩ reglas de Vault
∩ límites de Executor
∩ límites técnicos y ambientales
```

Gravity restringe una acción ya autorizada. Nunca crea roles ni concede
permisos.

### 6.4 BRAIN Y TEMPORAL

Brain y Temporal ejecutan únicamente la operación autorizada. No son fuente de
identidades, memberships, roles o asignaciones y no deben reconstruir autoridad
desde archivos locales o datos parciales.

Los workflows en curso deben revalidar autoridad antes de cada paso
privilegiado cuando el contrato definitivo así lo requiera.

### 6.5 METAMORPH

Metamorph conserva su responsabilidad sobre:

- instalación y actualización del software;
- verificación de artefactos;
- rollout y rollback técnico;
- preservación de estado durable durante cambios de versión.

Metamorph no es:

- fuente de verdad organizacional;
- transporte ordinario del Authority Snapshot;
- decisor de autorización;
- mecanismo de revocación;
- mecanismo de rollback de autoridad mutable.

Un rollback técnico no puede disminuir el high-water mark ni restaurar una
membership, asignación o autorización revocada.

## 7. Migración controlada

### 7.1 `local_legacy`

Caracteriza y conserva temporalmente el comportamiento actual:

- `.ownership.json` como registro administrativo local;
- marcadores `.master` y `.specialist`;
- `GetUserRole()`;
- `team_members[].role`;
- guards locales Master-only;
- BlindJudge resolviendo autoridad mediante archivos locales.

### 7.2 `shadow_remote`

Nucleus recibe y verifica Authority Snapshots, mantiene su high-water mark y
registra divergencias entre la decisión legacy y la decisión remota candidata,
sin modificar todavía el enforcement productivo.

Esta etapa requiere un snapshot inicial válido y una transición controlada. No
puede mezclar selectivamente privilegios de ambos modelos.

### 7.3 `remote_enforced`

Nucleus aplica exclusivamente autoridad remota aceptada y vigente.

Después del cutover:

- `.ownership.json` queda limitado a bootstrap y trust binding;
- `.master`, `.specialist` y ediciones locales no pueden elevar privilegios;
- una versión inferior al high-water mark se rechaza;
- una revocación no puede deshacerse mediante archivos locales;
- restore y rollback no pueden restaurar autoridad anterior.

## 8. Protecciones acordadas

- Versión inferior al high-water mark: rechazo por downgrade.
- Misma versión y mismo digest: replay idempotente.
- Misma versión y digest diferente: incidente de integridad o equivocación.
- Versión superior: candidata únicamente después de verificación completa.
- Recibir, transportar o cachear un snapshot no concede autoridad.
- Sólo un snapshot verificado y aceptado participa de la decisión efectiva.
- Un snapshot aceptado y todavía vigente puede utilizarse según la política
  offline que finalmente se apruebe.
- Una vez expirado, Nucleus entra en modo restringido fail-closed para nuevas
  operaciones que requieran autoridad organizacional.
- Elevaciones, nuevas firmas de Mandates y nuevas actuaciones externas
  privilegiadas quedan bloqueadas sin autoridad vigente.
- Un rollback de aplicaciones nunca puede restaurar permisos revocados ni
  reducir el high-water mark.

## 9. Diferencia entre el estado actual y el objetivo

| Superficie | Estado material actual | Dirección objetivo |
|---|---|---|
| Identidad | GitHub y estado local | Principal interno estable con identidades externas vinculadas |
| Membership | Entrada local en `.ownership.json` | Membership organizacional remota y revocable |
| Rol | Enum local y strings administrativos | Definición versionada separada de su asignación |
| Asignación | `team_members[].role` | Asignación scoped, vigente, auditable y revocable |
| Fuente organizacional | Archivos y marcadores locales | Backend |
| Transporte | Sin recorrido productivo completo | Batcave |
| Decisión efectiva | Guards locales y BlindJudge legacy | Nucleus |
| Estado offline | Sin contrato corporativo completo | Operación restringida fail-closed tras expiración |
| Revocación | Sin propagación integral | Remota, monotónica y no reversible localmente |
| Rollback | Puede restaurar archivos antiguos | No puede restaurar autoridad revocada |

## 10. Impacto para Genesis Control

Genesis Control debe registrar estas restricciones de coordinación:

1. Autenticación de sesión no equivale a autorización.
2. Antes de crear, firmar, promover, integrar o instalar un Mandate real debe
   existir una decisión efectiva vigente de Nucleus.
3. Una autorización no debe inferirse de `.ownership.json`, `.master`,
   `.specialist`, `team_members[].role` o un rol declarado por el cliente una
   vez alcanzado `remote_enforced`.
4. Los pasos privilegiados de un workflow en curso deben contemplar
   revalidación de autoridad antes de ejecutar el efecto.
5. Gravity puede restringir la operación autorizada; nunca puede crear la
   autoridad faltante.
6. Brain y Temporal sólo deben recibir la operación y los límites que hayan
   superado la decisión de Nucleus.
7. Un rollback o restore no puede resucitar una membership, asignación o permiso
   revocado.
8. El modelo remoto todavía no está implementado. Los gates locales existentes
   continúan siendo el enforcement material durante `local_legacy`.

Este documento no modifica las decisiones ya cerradas de Mandate Genesis ni
autoriza cambios sobre sus workflows.

## 11. Información para AGENDA y AGENDA FOLLOWUP

### Estado alcanzado

- Base material de roles relevada.
- Metodología corporativa de descubrimiento documentada.
- Fuente organizacional remota asignada a Backend.
- Transporte y caché delimitados para Batcave.
- Verificación y autorización efectiva asignadas a Nucleus.
- Brain y Temporal limitados a ejecución autorizada.
- Metamorph excluido del transporte ordinario y del rollback de autoridad.
- Migración en tres etapas formalizada.
- Anti-downgrade, replay, conflicto de digest y offline fail-closed definidos
  como requisitos.

### Estado no alcanzado

- No existe todavía un modelo remoto productivo de roles.
- No existe un Authority Snapshot implementado.
- No existe sincronización Backend → Batcave → Nucleus implementada para roles.
- No existe todavía enforcement `shadow_remote` o `remote_enforced`.
- El contrato de `.ownership.json` continúa pendiente de reconciliación.
- La revocación corporativa extremo a extremo no está implementada.

### Hitos recomendados

1. Aprobar el modelo conceptual de identidad, membership, definición y
   asignación.
2. Resolver las decisiones abiertas de roles, scopes y separación de funciones.
3. Diseñar coordinadamente el Authority Snapshot sin anticipar su wire schema.
4. Diseñar la producción y versionado monotónico en Backend.
5. Diseñar el transporte y caché en Batcave.
6. Diseñar verificación, persistencia, high-water mark y resolución efectiva en
   Nucleus.
7. Diseñar revocación, freshness, operación offline y revalidación de pasos
   privilegiados.
8. Definir criterios de entrada y salida de `shadow_remote` y
   `remote_enforced`.

## 12. Decisiones abiertas

Continúan sin aprobación:

- catálogo built-in de roles;
- existencia de `Architect`;
- roles personalizados por organización;
- vocabulario final de permisos;
- herencia de scopes;
- múltiples Masters;
- separación de funciones obligatoria;
- contrato definitivo de invitación, aceptación, suspensión y revocación;
- nombres de tablas, endpoints y eventos;
- wire schema del Authority Snapshot;
- stores, archivos y paquetes locales;
- perfil criptográfico y rotación de claves;
- TTL, freshness e intervalos de sincronización;
- latencia máxima de revocación;
- snapshots completos frente a cambios incrementales;
- acknowledgements de recibido, verificado y aceptado;
- resolución de gaps y snapshots corruptos;
- cambios concretos de implementación.

## 13. Conclusión

El Work ROLES estableció una dirección compartida y consistente:

```text
Backend organizational truth
→ Batcave transport/cache
→ Nucleus verification and effective authorization
→ Brain/Temporal bounded execution
```

Metamorph protege el lifecycle del software y la continuidad del estado
durable, pero no transporta ni decide autoridad organizacional.

El paso siguiente es someter a aprobación las superficies concretas dentro de
la frontera de cada Work. Este documento permite que Genesis Control, AGENDA y
AGENDA FOLLOWUP registren el estado sin presentar como implementado aquello que
todavía es dirección arquitectónica o decisión pendiente.
