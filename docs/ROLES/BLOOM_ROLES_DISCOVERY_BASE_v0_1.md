# BLOOM — Base de descubrimiento de roles v0.1

**Work:** ROLES  
**Estado:** descubrimiento verificable; no constituye todavía una especificación completa de autorización  
**Fecha:** 2026-09-02  
**Autoridad de diseño:** José Vigil

## 1. Propósito

Este documento reúne la evidencia actualmente dispersa sobre roles humanos,
ownership organizacional e incorporación de participantes en BTIPS/Bloom.

Su objetivo inicial es establecer una base común para continuar el descubrimiento
de asignación de roles sin confundir:

- conceptos presentes en documentación histórica;
- decisiones o borradores todavía no aprobados;
- estructuras que existen realmente en el código;
- declaraciones administrativas almacenadas en archivos;
- autoridad efectiva aplicada durante la ejecución.

Este documento no decide todavía:

- el catálogo definitivo de roles;
- si `Architect` debe existir;
- una jerarquía nueva;
- el protocolo futuro de invitación;
- permisos relacionados con Gravity;
- la matriz completa de autorización del sistema.

Ninguna ausencia detectada autoriza a inventar un mecanismo local.

## 2. Resumen ejecutivo

La implementación material vigente de Nucleus reconoce solamente tres estados:

| Estado o rol | Significado material actual | Evidencia de detección |
|---|---|---|
| `Master` | Owner con autoridad total en los gates actualmente implementados | marcador `.master` |
| `Specialist` | Miembro con ejecución limitada | marcador `.specialist` |
| `Unknown` | No existe evidencia local de un rol reconocido | ausencia de marcador válido |

`Architect` aparece en documentación histórica, de producto y de diseño, pero no
existe en el enum vigente, en la detección de rol ni en un marcador material.
Tampoco existe un proceso implementado para asignarlo.

El onboarding actual sí contiene un camino concreto para establecer al Master
inicial: después de obtener una identidad GitHub, Conductor invoca
`nucleus init --github-id <handle> --master`. Nucleus crea el registro de
ownership y escribe el marcador `.master` en la organización activa.

La incorporación posterior de personas está incompleta. `nucleus team add`
agrega un registro declarativo a `team_members[]`, pero no implementa una
invitación aceptable por la contraparte, no vincula la identidad invitada con una
instalación y no crea el marcador que `GetUserRole()` usa para autorizar.

Por lo tanto, hoy existen dos planos desacoplados:

```text
team_members[].role       declaración administrativa de membership
.master / .specialist     evidencia local usada como rol efectivo
```

No existe todavía una cadena completa y verificable entre ambos.

## 3. Fuente material de roles en Nucleus

### 3.1 Catálogo reconocido

La definición material se encuentra en:

`installer/nucleus/internal/core/metadata.go`, líneas 30–37.

El enum declara:

```text
RoleUnknown
RoleMaster
RoleSpecialist
```

No declara `RoleArchitect` ni un rol equivalente.

### 3.2 Detección efectiva

`detectUserRole()` se encuentra en:

`installer/nucleus/internal/core/metadata.go`, líneas 63–96.

La función:

1. resuelve el Nucleus activo mediante `ResolveNucleusRoot("")`;
2. busca `.master`;
3. si no existe, busca `.specialist`;
4. si no encuentra un marcador reconocido, devuelve `RoleUnknown`.

La detección es fail-closed: la ausencia de información no concede autoridad.

### 3.3 Escritura de marcadores

El mismo archivo implementa:

- `SetMasterRole()`, líneas 116–134, que escribe `.master`;
- `SetSpecialistRole()`, líneas 136–149, que escribe `.specialist`.

Ambos marcadores se escriben bajo el Nucleus organizacional activo.

Se encontró un camino productivo que llama `SetMasterRole()`. No se encontró un
call site productivo equivalente que invoque `SetSpecialistRole()` como resultado
de una invitación o incorporación de equipo.

## 4. Definiciones documentales encontradas

### 4.1 README de Nucleus

`installer/nucleus/README.md`, sección «Sistema de Roles», líneas 74–81,
describe dos niveles:

- Master (Owner);
- Specialist.

El README coincide con los roles positivos del enum, aunque su referencia a la
ruta legacy `~/.bloom/.nucleus/` no representa correctamente la resolución
multi-organización vigente.

### 4.2 BTIPS v7.1.1

`docs/BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md`, alrededor de la línea
296, menciona una jerarquía conceptual:

```text
Master / Architect / Specialist
```

El mismo documento, alrededor de la línea 1429, atribuye ejemplos de capacidad:

- Specialist puede crear ciertos Intents;
- sólo Master puede crear Mandates o aprobar Intents `dev` en producción.

La mención de `Architect` en BTIPS no está respaldada por una implementación
equivalente en Nucleus.

### 4.3 Especificación histórica de ownership

`docs/GOVERNANCE/GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`, sección §3, incluye un
mapa `roles` con:

- `master`;
- `architect`;
- `specialist`.

La especificación consolidó esquemas divergentes y conserva afirmaciones que
quedaron parcialmente desactualizadas por cambios posteriores del onboarding y
de los guards. Su reconciliación permanece pendiente bajo `AUTH-OWNERSHIP-01`.

En consecuencia, no debe usarse de forma aislada como prueba de que Architect
es un rol vigente.

### 4.4 Borrador del módulo de autorización

`docs/GOVERNANCE/AUTHORIZATION/NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md`
está marcado expresamente como borrador y propuesta, no como contrato aprobado.

En sus líneas 13–23 registra que:

- Master y Specialist tenían respaldo en las fuentes examinadas;
- Architect era una propuesta del propio borrador;
- no existía una fuente confirmada que lo respaldara materialmente.

El documento no autoriza la implementación de Architect ni de la interfaz de
autorización que propone.

### 4.5 Project/Nucleus Truth

`tree/bloom/truth/bloom_nucleus_truth.txt`, líneas 20–23, representa la verdad
material reconciliada:

- `.master` implementado;
- `.specialist` implementado;
- ausencia o marcador no reconocido igual a `RoleUnknown`;
- Architect no existe en el modelo vigente.

## 5. Cómo se establece el Master inicial

### 5.1 Secuencia de onboarding

El flujo vigente se encuentra en:

`installer/conductor/workspace/onboarding/milestone-reactor.js`.

Cuando se procesa la identidad GitHub, el reactor:

1. intenta resolver un GitHub handle real;
2. evita inventar una identidad si no existe evidencia;
3. resuelve el workspace activo;
4. invoca:

```text
nucleus init --github-id <handle> --master
```

La decisión de invocar `--master` no surge actualmente de una elección de rol
del usuario. Es una conducta fija del onboarding para establecer al owner inicial.

Referencias relevantes:

- hook posterior a identidad GitHub: líneas 216–229;
- resolución segura del handle: líneas 233–260;
- guard de inicialización de ownership: líneas 314–360;
- invocación efectiva de Nucleus: líneas 376–383.

### 5.2 Comando receptor

El comando `nucleus init` se implementa en:

`installer/nucleus/internal/governance/ownership.go`, líneas 172–236.

Su secuencia material es:

1. rechazar una organización ya inicializada;
2. exigir `--github-id`;
3. crear `.ownership.json` mediante `CreateInitialOwnership()`;
4. crear `.nucleus-governance.json`;
5. si se recibió `--master`, llamar `core.SetMasterRole()`.

Por este camino, la misma identidad queda representada en dos formas:

- como owner dentro de `.ownership.json`;
- como autoridad efectiva local mediante `.master`.

### 5.3 Condiciones de fallo y honestidad de identidad

Si el onboarding no puede obtener un GitHub handle real, no ejecuta
`nucleus init` con un fallback inventado. Esto evita registrar permanentemente
una identidad falsa en un comando que rechaza una segunda inicialización.

El flujo conserva `ownership_init_status` para distinguir intentos en progreso,
completados o fallidos.

## 6. Incorporación posterior de miembros

### 6.1 Superficie existente

Nucleus implementa:

```text
nucleus team add <github-id> --name <name> --role <role>
nucleus team list
nucleus team remove <github-id>
```

Los comandos se encuentran en
`installer/nucleus/internal/governance/ownership.go`, desde la línea 238.

`team add` y `team remove` exigen `RoleMaster`. Si `--role` no se especifica,
`team add` usa `specialist`.

### 6.2 Qué persiste realmente `team add`

`AddTeamMember()` agrega a `.ownership.json` una entrada con:

```text
id
name
role
added_at
active
```

La estructura se encuentra en `ownership.go`, líneas 18–35 y 117–129.

El campo `role` es actualmente un string declarativo. No se valida contra un
catálogo cerrado de roles.

### 6.3 Qué no implementa

No se encontró un flujo material completo para:

- emitir una invitación;
- autenticar al destinatario de la invitación;
- permitir aceptación o rechazo;
- vincular la aceptación con una organización concreta;
- demostrar que el actor invitado controla la identidad declarada;
- instalar o materializar `.specialist` en el contexto del participante;
- sincronizar cambios entre `team_members[].role` y el rol efectivo;
- expirar una invitación;
- revocar credenciales o sesiones al remover un miembro;
- auditar asignaciones y transiciones de rol;
- impedir que `--role` almacene un nombre desconocido.

`team remove` marca al miembro como inactivo, pero este acto declarativo no
demuestra por sí solo la revocación del marcador local o de otras capacidades.

## 7. Diferencia entre membership y autoridad efectiva

El estado actual contiene dos representaciones que no forman una cadena única:

### Plano A — Registro organizacional

```text
.ownership.json
└── team_members[]
    ├── id
    ├── role
    └── active
```

Este plano expresa que el owner declaró a una persona como miembro.

### Plano B — Rol efectivo local

```text
.nucleus-{organization}/
├── .master
└── .specialist
```

`GetUserRole()` consulta este segundo plano para autorizar.

No se encontró un mecanismo que pruebe que:

```text
team_members[id=X, role=specialist, active=true]
                         ↓
identidad autenticada X controla esta instalación
                         ↓
marcador .specialist legítimamente materializado
                         ↓
autorización efectiva y revocable
```

Éste es uno de los principales problemas que el Work ROLES deberá investigar.

## 8. Situación específica de Architect

Architect aparece en:

- BTIPS v7.1.1;
- documentos históricos de seguridad;
- diseños de interfaz de Mandate/Conductor;
- el esquema histórico propuesto para `.ownership.json`;
- borradores del módulo de autorización.

Sin embargo, no se encontró:

- `RoleArchitect` en el enum de Nucleus;
- `.architect` como marcador vigente;
- detección de Architect;
- setter de Architect;
- proceso de onboarding para Architect;
- invitación y aceptación como Architect;
- guard material que aplique un nivel Architect;
- matriz aprobada que diferencie sus permisos.

Además, `RequireAtLeast()` aplica actualmente una política provisional
Master-only y no implementa una jerarquía Master > Architect > Specialist.

Conclusión: Architect es un concepto documental no materializado. Este Work no
presupone si debe implementarse, redefinirse o descartarse.

## 9. Perfil Synapse y autoridad organizacional

Existe otra superficie:

```text
nucleus synapse seed <alias> --master
```

Se implementa en
`installer/nucleus/internal/orchestration/commands/synapse.go`, líneas 120–208.

El flag pasa un booleano `isMaster` al workflow de perfil persistente. El comando
declara que no requiere un rol especial.

No se encontró evidencia de que este booleano sea la fuente consultada por
`GetUserRole()` ni de que esté criptográfica o administrativamente conectado con
el owner de `.ownership.json`.

Por ahora deben mantenerse separados:

```text
Synapse profile isMaster    atributo del perfil/workflow Synapse
Nucleus .master             autoridad efectiva organizacional
```

La coincidencia de nombres no demuestra equivalencia semántica.

## 10. Relación pendiente con Gravity

La incorporación de Gravity vuelve más urgente resolver la cadena de identidad,
rol y autoridad. Gravity puede requerir decisiones jerárquicas sobre acciones
como crear, adoptar, modificar, exceptuar, promover, aplicar o revocar criterio.

No se encontró todavía una matriz aprobada que asigne esas operaciones a Master,
Specialist, Architect u otra figura.

Por lo tanto:

- Gravity no redefine automáticamente los roles existentes;
- no se debe inferir que Master puede realizar toda operación Gravity;
- no se debe introducir Architect para cubrir Gravity sin decisión explícita;
- no se debe usar `team_members[].role` como autorización efectiva mientras no
  exista una cadena verificable de identidad y aceptación;
- las preguntas de Genesis deberán aportar requisitos, no nombres de roles
  inventados de antemano.

## 11. Vacíos confirmados

1. No existe una fuente autoritativa única y vigente para el catálogo de roles.
2. La documentación de tres roles contradice la implementación de dos roles
   positivos más `Unknown`.
3. Architect no está aprobado ni implementado materialmente.
4. El onboarding establece al Master inicial mediante una conducta fija.
5. No existe selección explícita de rol durante el onboarding inicial.
6. No existe un protocolo completo de invitación y aceptación.
7. `team_members[].role` no determina el rol efectivo.
8. El vocabulario de `team add --role` no está cerrado ni validado.
9. `SetSpecialistRole()` existe, pero no se encontró su integración productiva.
10. Remover un miembro no demuestra revocación completa de autoridad.
11. El atributo Master de Synapse no está formalmente vinculado con Master de
    Nucleus.
12. El contrato de `.ownership.json` necesita reconciliación.
13. No existe una matriz aprobada de operaciones Gravity por rol.
14. El módulo completo y único de autorización de Nucleus permanece pendiente.

## 12. Preguntas para la siguiente ronda de descubrimiento

### Identidad y organización

1. ¿Qué prueba convierte a una identidad externa en actor de una organización?
2. ¿Una persona puede pertenecer a varias organizaciones con roles diferentes?
3. ¿El rol pertenece a la persona, a la relación persona-organización o a una
   instalación/dispositivo?
4. ¿Qué identidad firma la aceptación de una invitación?

### Asignación y transición

5. ¿Quién puede asignar cada rol?
6. ¿La primera persona de una organización siempre debe ser Master?
7. ¿Puede existir más de un Master?
8. ¿Cómo se promueve, degrada, suspende o revoca un rol?
9. ¿Qué ocurre con la organización si su único Master deja de estar disponible?

### Membership e invitaciones

10. ¿Qué estados debe tener una invitación: creada, enviada, aceptada, rechazada,
    expirada, revocada?
11. ¿Qué artefacto durable registra esos estados y quién es su owner?
12. ¿Qué parte permanece local y qué parte requiere coordinación remota?
13. ¿Cómo se impide que un actor se autoatribuya un marcador?

### Capacidades y Gravity

14. ¿Qué operaciones requieren rol organizacional y cuáles requieren autoridad
    contextual adicional?
15. ¿Quién puede crear, aprobar, adoptar, exceptuar, promover o revocar Gravity?
16. ¿Cómo se resuelve un conflicto entre Gravity heredada y autoridad local?
17. ¿Las decisiones Gravity requieren firma individual, organizacional o ambas?

### Genesis

18. ¿Qué preguntas de Genesis determinan ownership y distribución inicial de
    responsabilidades?
19. ¿Genesis sólo registra respuestas o también materializa roles?
20. ¿Qué debe quedar firmado antes de que una asignación tenga efectos?

## 13. Fuentes de evidencia

| Fuente | Aporte verificable | Estado de confianza |
|---|---|---|
| `installer/nucleus/internal/core/metadata.go` | Enum, detección y marcadores efectivos | implementación vigente |
| `installer/nucleus/internal/governance/ownership.go` | Ownership, `nucleus init`, `team add/list/remove` | implementación vigente |
| `installer/conductor/workspace/onboarding/milestone-reactor.js` | Hook real de onboarding hacia `nucleus init --master` | implementación vigente |
| `installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js` | Reenganche del milestone de identidad | implementación vigente |
| `installer/nucleus/internal/orchestration/commands/synapse.go` | Perfil Synapse y flag `--master` | implementación vigente; vínculo con autoridad no confirmado |
| `installer/nucleus/README.md` | Modelo declarado Master/Specialist | documentación parcialmente desactualizada en paths |
| `docs/BTIPS_Bloom_Technical_Intent_Package_v7_1_1.md` | Jerarquía conceptual y ejemplos de permisos | contrato conceptual; contradice implementación en Architect |
| `docs/GOVERNANCE/GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` | Esquema histórico consolidado de ownership | parcialmente obsoleto; reconciliación pendiente |
| `docs/GOVERNANCE/AUTHORIZATION/NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md` | Registro explícito de que Architect era propuesta | borrador no aprobado |
| `tree/bloom/truth/bloom_nucleus_truth.txt` | Verdad material reconciliada de marcadores | graph autoritativo vigente |

## 14. Regla de continuidad del Work ROLES

Toda investigación posterior deberá clasificar cada hallazgo como uno de estos:

- **implementado:** existe en código y tiene efectos materiales verificables;
- **documentado vigente:** existe una decisión aprobada, aunque no esté
  implementada;
- **histórico u obsoleto:** describe un modelo anterior o contradice la verdad
  material actual;
- **borrador:** es una propuesta sin autoridad de diseño;
- **pendiente:** la necesidad está confirmada, pero no existe una decisión;
- **contradicción:** dos fuentes reclaman verdades incompatibles y José todavía
  no resolvió cuál debe prevalecer.

El Work ROLES no convertirá una pregunta abierta en arquitectura por inferencia.
Las siguientes decisiones deberán construirse a partir de las necesidades reales
de Genesis, Gravity, ownership y convivencia jerárquica, bajo aprobación explícita
de José Vigil.
