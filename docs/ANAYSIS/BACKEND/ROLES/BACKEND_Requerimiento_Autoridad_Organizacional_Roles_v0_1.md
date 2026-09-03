> **Nota de este cowork:** encargo formal recibido de Jose el 2026-09-01, guardado verbatim. Complementa a `Contexto_Decision_Autoridad_Organizacional_Roles_v0_1.md` (mismo directorio). Define el alcance, las fronteras con otros Works y las restricciones de esta primera ronda de investigación — ver §17 y §18 antes de tocar código, schemas o documentación fuera de este track.

# BACKEND — Requerimiento para la Autoridad Organizacional Remota de Roles

**Tipo:** Encargo de investigación, diseño y futuro desarrollo para el cowork BACKEND
**Autoridad de diseño:** José Vigil
**Estado:** Requerimiento activo; contratos e implementación pendientes de aprobación
**Sistema:** BTIPS / Bloom

## 1. Propósito del encargo
El cowork BACKEND será responsable de investigar, diseñar y, una vez obtenidas las aprobaciones correspondientes, desarrollar las capacidades propias del Backend remoto para administrar la autoridad organizacional de Roles.
Esto comprende la fuente de verdad remota de:
- principals e identidades internas;
- identidades externas vinculadas;
- organizaciones y tenancy;
- memberships;
- definiciones versionadas de roles;
- asignaciones de roles;
- scopes;
- vigencias;
- invitaciones y aceptación;
- suspensiones;
- revocaciones;
- versiones de autoridad;
- auditoría;
- producción de Authority Snapshots.
Este encargo separa dos responsabilidades:
```text
Cowork BACKEND
└── Diseña e implementa la gestión remota de autoridad organizacional.
Work BACKEND de Codex
└── Diseña e implementa la interacción de Bloom con ese Backend:
    transporte, sincronización, consumo y pruebas de integración.
```
El work BACKEND de Codex no será dueño del modelo corporativo de Roles, sus tablas, administración, lifecycle interno ni lógica de negocio remota.

## 2. Dirección arquitectónica vigente
La frontera acordada es:
```text
Backend organizational truth
        ↓
Batcave authenticated transport, synchronization and cache
        ↓
Nucleus cryptographic verification and effective authorization
        ↓
Brain / Temporal bounded execution
```
Responsabilidades:
- Backend conserva la fuente organizacional de principals, memberships, definiciones y asignaciones de roles, scopes, vigencias, revocaciones y auditoría.
- Batcave autentica sesiones y transporta, sincroniza o cachea el estado recibido. No asigna roles, concede permisos ni determina autoridad efectiva.
- Nucleus verifica organización, procedencia, integridad, firma, vigencia, versión monotónica y digest.
- Nucleus determina la autorización efectiva combinando el estado organizacional con Sovereign Policy, GravityPostures, Vault, Executor y límites técnicos o ambientales.
- Gravity restringe acciones ya autorizadas; nunca crea permisos.
- Brain y Temporal ejecutan exclusivamente operaciones autorizadas.
- Metamorph permanece limitado al lifecycle del software. No transporta ordinariamente autoridad mutable y sus mecanismos de rollback no pueden restaurar autoridad revocada.

## 3. Principio rector
> El Backend remoto conserva la verdad organizacional. Nucleus consume una proyección verificable, versionada y revocable y continúa siendo el punto local que decide y aplica la autorización efectiva.
La pertenencia, el rol y el permiso no deben colapsarse.
Una misma persona puede:
- pertenecer a múltiples organizaciones;
- tener responsabilidades diferentes en cada una;
- mantener varias asignaciones simultáneas;
- operar bajo scopes diferentes;
- perder una asignación sin perder el membership;
- cambiar de rol sin cambiar de identidad;
- quedar suspendida, expirada o revocada;
- trabajar en dominios no limitados al desarrollo de software.

## 4. Estado actual que debe investigarse
El cowork debe reconstruir con evidencia verificable:
- motor de base de datos y mecanismo de migraciones;
- tablas actuales de usuarios, organizaciones y memberships;
- claves, relaciones, índices y restricciones;
- significado material de `users.id`;
- vínculo actual con GitHub;
- uso de `organizations.masterGithubUsername`;
- estructura y consumidores de `orgMembers.role`;
- endpoints y queries existentes;
- autenticación y sesiones;
- uso de `organization_fingerprint`;
- timestamps, auditoría, versionado, soft delete y revocación;
- capacidades reales de D1, R2, ETag y Workers;
- diferencias entre documentación y código ejecutable.
Cada hallazgo deberá clasificarse como:
- `IMPLEMENTADO`;
- `DECIDIDO — NO IMPLEMENTADO`;
- `CANDIDATO`;
- `DECISIÓN ABIERTA`.
Toda afirmación sobre el estado material deberá incluir archivo y ubicación.

## 5. Incompatibilidades conocidas que deben preservarse
El cowork no debe asumir que el schema actual es el modelo corporativo final.
Actualmente existen incompatibilidades preliminares:
- `users.id` está asociado directamente a GitHub.
- `githubUsername` aparece como identidad visible privilegiada.
- `organizations.masterGithubUsername` mezcla identidad externa y autoridad organizacional.
- `orgMembers.role` colapsa membership, definición de rol y asignación.
- No están representados múltiples roles, scopes, versiones, vigencias, suspensiones, revocaciones ni auditoría completa.
- El parámetro `org` del endpoint operativo no demuestra tenancy autenticada.
- ETag no constituye firma, versión monotónica ni protección anti-downgrade.
Estas observaciones son puntos de investigación, no autorización para cambiar el schema.

## 6. Dominio lógico que debe diseñarse
El cowork debe proponer, sin aprobar nombres físicos prematuramente, una separación conceptual entre:
1. Principal interno estable.
2. Identidad externa vinculada.
3. Organización o tenant.
4. Membership.
5. Definición versionada de rol.
6. Asignación de rol.
7. Scope.
8. Permiso.
9. Invitación y aceptación.
10. Vigencia temporal.
11. Suspensión.
12. Revocación.
13. Versión monotónica de autoridad.
14. Historial y auditoría.
15. Authority Snapshot.
Para cada entidad candidata deberá especificar:
- finalidad;
- datos mínimos;
- relaciones y cardinalidad;
- invariantes;
- unicidad;
- lifecycle;
- conservación histórica;
- aislamiento multi-tenant;
- información sensible;
- consultas críticas.
No se aprobarán todavía nombres definitivos de tablas o columnas.

## 7. Scopes y permisos
La investigación deberá contemplar asignaciones limitadas a:
- organización;
- dominio;
- proyecto;
- Mandate;
- Intent o Action;
- recurso;
- entorno.
Deberá responder:
- cómo se representa el scope;
- cómo se impide que alcance otro tenant;
- cómo se representan múltiples scopes;
- cómo se evita inferir acceso a partir de una jerarquía;
- dónde vive el vocabulario de permisos;
- cómo se versionan definiciones sin alterar retrospectivamente asignaciones;
- cómo se expresa default-deny;
- qué información necesita Nucleus para decidir localmente.
No se aprobará todavía un catálogo de roles o permisos.
`Architect`, CTO, Analyst, Dataset Custodian, Methodological Reviewer, Publisher o cualquier otra denominación solo podrán utilizarse como ejemplos de análisis. No son roles aprobados.
No debe reintroducirse `Grant` ni un mecanismo equivalente bajo otro nombre.

## 8. Lifecycle organizacional
El diseño deberá reconstruir:
```text
Invitación
→ vinculación de identidad
→ aceptación
→ activación de membership
→ asignación
→ modificación o expiración
→ suspensión
→ revocación
→ propagación
→ recepción por Batcave
→ verificación y aceptación por Nucleus
```
Para cada transición se deberá determinar:
- actor autorizado;
- precondiciones;
- idempotencia;
- separación de funciones;
- posible aprobación múltiple;
- prevención de invitaciones robadas o reutilizadas;
- historial conservado;
- diferencia entre revocar una asignación, suspender un membership y desactivar un principal.

## 9. Versionado y anti-downgrade
La autoridad deberá tener una versión monotónica por organización o un mecanismo equivalente aprobado.
Debe preservarse:
```text
receivedVersion < acceptedVersion
→ downgrade rechazado
receivedVersion = acceptedVersion
and receivedDigest = acceptedDigest
→ replay idempotente
receivedVersion = acceptedVersion
and receivedDigest ≠ acceptedDigest
→ incidente de integridad o equivocation
receivedVersion > acceptedVersion
→ candidato sujeto a verificación completa
```
La investigación deberá cubrir:
- concurrencia;
- transacciones;
- optimistic concurrency;
- gaps;
- snapshot completo frente a delta;
- restores y backups;
- consistencia de lectura;
- múltiples writers o regiones;
- persistencia del high-water mark.
Un rollback técnico o restore de software no puede reducir la versión de autoridad ni restaurar privilegios revocados.

## 10. Authority Snapshot
El Backend deberá poder producir una representación canónica y coherente de la autoridad organizacional.
Su contenido semántico mínimo candidato incluye:
- organización;
- issuer;
- versión de autoridad;
- versión base cuando corresponda;
- principals;
- memberships;
- definiciones versionadas;
- asignaciones;
- scopes;
- vigencias;
- revocaciones;
- `issuedAt`;
- `validFrom`;
- `expiresAt`;
- digest;
- key reference;
- firma;
- versión del formato;
- correlation ID.
El cowork deberá distinguir:
```text
Producción canónica → Backend
Transporte y caché  → Batcave
Verificación        → Nucleus
Decisión efectiva   → Nucleus
Ejecución           → Brain / Temporal
```
No debe fijar el wire schema ni el perfil criptográfico sin aprobación.

## 11. Sincronización y APIs
El cowork deberá proponer superficies por responsabilidad para:
- bootstrap organizacional;
- obtención de snapshot completo;
- consulta de versión y freshness;
- sincronización incremental;
- recuperación ante gaps;
- acknowledgement de recepción;
- acknowledgement de verificación;
- acknowledgement de aceptación por Nucleus;
- revocación urgente;
- cambio o rotación del trust binding.
Para cada superficie deberá indicar:
- actor llamador;
- autenticación;
- tenant binding;
- autorización;
- idempotencia;
- respuesta;
- errores;
- caché;
- auditoría.
No se aprobarán todavía nombres de endpoints, payloads, eventos o intervalos.
ETag puede optimizar transporte y caché, pero no sustituye:
- versión monotónica;
- digest;
- firma;
- vigencia;
- tenant binding;
- protección anti-replay.

## 12. Operación offline y revocación
La política arquitectónica vigente es:
- un snapshot aceptado y vigente puede utilizarse durante una interrupción;
- después de expirar, Nucleus entra en modo restringido fail-closed;
- nuevas elevaciones, firmas de Mandates y actuaciones externas quedan bloqueadas;
- workflows en curso revalidan autoridad antes de pasos privilegiados;
- operaciones de observación o reducción de riesgo podrán continuar únicamente según política aprobada.
El cowork deberá determinar qué información produce Backend para sostener esta política y qué parámetros requieren decisión de José, especialmente:
- TTL;
- freshness;
- latencia máxima de revocación;
- tratamiento de Batcaves desconectadas;
- evidencia de entrega;
- evidencia de aceptación por Nucleus;
- rotación y compromiso de claves.

## 13. Migración
La transición prevista es:
```text
local_legacy → shadow_remote → remote_enforced
```
El diseño deberá cubrir:
- mapeo de identidades existentes;
- GitHub identities;
- `masterGithubUsername`;
- `orgMembers.role`;
- bootstrap de organizaciones;
- tratamiento de `.ownership.json`, `.master` y `.specialist`;
- comparación shadow;
- métricas de divergencia;
- cutover;
- revocaciones durante la transición;
- compatibilidad de clientes;
- rollback técnico sin rollback de autoridad;
- criterios de entrada y salida por etapa.
Después de `remote_enforced`, los archivos locales solo podrán actuar como bootstrap o trust binding. Editarlos no podrá conceder ni restaurar autoridad.
No se debe combinar autoridad local y remota eligiendo el resultado más permisivo.

## 14. Threat model requerido
El informe deberá analizar al menos:
- escalación horizontal y vertical;
- acceso cross-tenant;
- fraude en identity linking;
- invitación robada o reutilizada;
- replay;
- downgrade;
- digest conflict o equivocation;
- snapshot falsificado;
- clave comprometida;
- revocación demorada;
- operación offline;
- rollback de base de datos;
- restore de backup;
- insider administrativo;
- manipulación de auditoría;
- enumeración de usuarios;
- exposición de información personal.
Para cada amenaza deberá registrar:
- mitigación candidata;
- evidencia necesaria;
- dependencia externa;
- riesgo residual;
- decisión pendiente.

## 15. Frontera con otros Works
### BACKEND de Codex
Recibe del cowork BACKEND contratos aprobados para:
- autenticarse;
- consultar versiones;
- obtener Authority Snapshots;
- confirmar recepción;
- reportar verificación o aceptación;
- probar integración.
No define el modelo corporativo interno ni administra directamente sus datos.
### BATCAVE
Transporta y cachea bytes organizacionalmente aislados. Puede rechazar envelopes estructuralmente inválidos como defensa temprana, pero no interpreta roles ni concede autoridad.
### NUCLEUS
Verifica criptográficamente el snapshot, mantiene el high-water mark y decide la autorización efectiva. Es dueño de la proyección local consumida y del registro de decisión.
### GRAVITY
Aporta GravityPostures aplicables como restricciones sobre una acción ya autorizada. No concede permisos.
### METAMORPH
Instala y actualiza el software participante. Preserva el estado durable de Batcave y Nucleus, pero no transporta ni revierte autoridad organizacional mutable.
### Brain y Temporal
Ejecutan operaciones ya autorizadas. No asignan roles ni amplían scopes.
### Genesis Control
Necesitará contratos para establecer la primera organización, vincular identidades y formar las autoridades iniciales sin introducir una vía local paralela de privilegios.

## 16. Entregable requerido
El cowork BACKEND deberá entregar un informe verificable con:
1. Resumen ejecutivo.
2. Estado material actual.
3. Inventario de tablas, columnas, relaciones, índices y consumidores.
4. Contradicciones con el modelo objetivo.
5. Modelo lógico candidato.
6. Diagrama ER textual.
7. Invariantes transaccionales y multi-tenant.
8. Lifecycle de memberships y asignaciones.
9. Authority Snapshot semántico candidato.
10. Versionado, anti-downgrade y concurrencia.
11. Superficies/API candidatas sin nombres aprobados.
12. Threat model.
13. Migración por etapas.
14. Dependencias entre Works.
15. Decisiones requeridas de José.
16. Riesgos y preguntas abiertas.
17. Lista exacta de archivos que una implementación posterior podría modificar.
18. Plan de pruebas unitarias, integración, migración, concurrencia, seguridad, replay, downgrade y end-to-end.
Al finalizar deberá responder claramente:
- cuál es la fuente material actual;
- por qué el schema existente no es definitivo;
- cuál debería ser la identidad interna estable;
- cómo se separan membership, role definition y role assignment;
- cómo se representa y valida el scope;
- cómo se garantiza el aislamiento entre tenants;
- cómo se impide restaurar autoridad mediante replay, restore o rollback;
- qué versión observa Nucleus;
- cómo se genera un snapshot consistente;
- qué transporta Batcave sin interpretar;
- qué decide exclusivamente Nucleus;
- qué decisiones requieren aprobación;
- qué bloquea una implementación segura;
- cuál sería el vertical mínimo posterior a la aprobación.

## 17. Restricciones
Durante esta primera ronda:
- No implementar.
- No crear ni editar schemas o migraciones.
- No alterar datos.
- No desplegar infraestructura.
- No aprobar roles.
- No reintroducir `Grant`.
- No convertir propuestas en decisiones.
- No transformar Batcave, Metamorph, Gravity, Brain o Temporal en decisores de Roles.
- No usar ETag como firma o anti-downgrade.
- No usar `.ownership.json` como fuente corporativa final.
- No seleccionar TTL, intervalos o perfiles criptográficos sin José.
- No modificar código ni documentación antes de presentar una lista exacta de archivos y recibir aprobación puntual.

## 18. Regla de continuidad
El cowork deberá detenerse después del informe de investigación y esperar revisión de José.
Cualquier implementación posterior necesitará:
1. contratos aprobados;
2. lista exacta de archivos;
3. aprobación puntual;
4. pruebas y criterios de aceptación;
5. coordinación con los Works consumidores.
La regla central es:
> El cowork BACKEND desarrolla la autoridad organizacional remota. Los Works consumidores desarrollan exclusivamente su interacción con esa autoridad, sin duplicarla ni sustituirla.
