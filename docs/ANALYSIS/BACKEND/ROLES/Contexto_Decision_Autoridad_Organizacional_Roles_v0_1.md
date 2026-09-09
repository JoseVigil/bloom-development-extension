> **Nota de este cowork:** documento de contexto compartido por Jose, guardado verbatim como fundamento de la decisión de arquitectura. Complementa a `BACKEND_Requerimiento_Autoridad_Organizacional_Roles_v0_1.md` (mismo directorio), que es el encargo formal de investigación para este cowork.

# Contexto de decisión — Por qué la autoridad organizacional de Roles debe residir en Backend

## 1. Origen de la decisión
La arquitectura inicial de Bloom nació alrededor de una instalación local soberana. En ese contexto, archivos como `.ownership.json`, `.master` y `.specialist` permitían identificar una organización y representar algunas relaciones de autoridad dentro de una máquina.
Ese modelo resultaba útil para:
- inicializar una instalación;
- asociarla con una organización;
- reconocer una autoridad local inicial;
- mantener la operación independiente de servicios externos;
- proteger la soberanía de Nucleus sobre la ejecución local.
Sin embargo, al avanzar hacia una plataforma corporativa, multiusuario, multidispositivo y multiorganización, se hizo evidente que esos archivos no podían continuar siendo la fuente definitiva de identidades, memberships y roles.
El problema no era solamente dónde guardar un campo `role`. El problema era determinar quién conserva la verdad organizacional y cómo esa verdad llega de manera verificable a cada instalación.

## 2. Por qué un archivo local resulta insuficiente
Una persona no posee necesariamente un único rol global. Puede mantener relaciones completamente diferentes con distintas organizaciones:
```text
Persona
├── Organización Alpha → una responsabilidad
├── Organización Beta  → otra responsabilidad
└── Organización Gamma → varias asignaciones limitadas a proyectos concretos
```
Por lo tanto, identidad, membership, rol, asignación y scope son conceptos separados.
Una fuente exclusivamente local no puede resolver adecuadamente:
- múltiples administradores;
- múltiples usuarios;
- múltiples dispositivos e instalaciones;
- invitaciones y aceptación;
- cambios de responsabilidad;
- asignaciones simultáneas;
- scopes organizacionales o específicos;
- suspensiones;
- expiraciones;
- revocaciones;
- propagación consistente;
- auditoría corporativa;
- recuperación después de una desconexión;
- prevención de replay o downgrade;
- coordinación entre instalaciones de una misma organización.
Además, editar o restaurar un archivo local no puede ser suficiente para conceder o recuperar privilegios corporativos. De lo contrario, una copia antigua, un backup o un rollback de software podría restaurar una autoridad que ya fue revocada remotamente.

## 3. La autoridad organizacional necesita una fuente remota
La evolución acordada establece que Backend conserva la fuente de verdad de:
- principals;
- identidades externas vinculadas;
- organizaciones;
- memberships;
- definiciones versionadas de roles;
- asignaciones;
- scopes;
- vigencias;
- invitaciones y aceptación;
- suspensiones;
- revocaciones;
- versiones de autoridad;
- auditoría.
Backend es el lugar apropiado porque puede proporcionar una visión común y administrable para todas las personas, dispositivos e instalaciones de una organización.
También puede sostener propiedades que una colección de archivos independientes no puede garantizar fácilmente:
- aislamiento entre tenants;
- transacciones;
- consistencia;
- versiones monotónicas;
- historial durable;
- concurrencia entre administradores;
- revocación central;
- reconciliación;
- trazabilidad;
- administración multiusuario.
Esta decisión no significa que Backend controle la máquina local ni que decida qué operación puede ejecutarse dentro de ella. Significa que Backend conserva los hechos organizacionales compartidos.

## 4. Diferencia entre verdad organizacional y autorización efectiva
La autoridad organizacional remota responde preguntas como:
- ¿Quién es esta persona?
- ¿A qué organización pertenece?
- ¿Qué asignaciones mantiene?
- ¿Dentro de qué scope?
- ¿Durante qué período?
- ¿La asignación sigue activa?
- ¿Fue suspendida o revocada?
- ¿Qué versión de la definición de rol corresponde?
La autorización efectiva requiere además información que solamente existe o puede evaluarse localmente:
- organización activa;
- acción solicitada;
- recurso concreto;
- estado del entorno;
- Sovereign Policy;
- GravityPostures aplicables;
- reglas de Vault;
- límites de Executor;
- restricciones del filesystem y la red;
- estado operativo de la instalación.
Por ese motivo, el modelo acordado es:
```text
Estado organizacional remoto
∩ contexto local
∩ Sovereign Policy
∩ GravityPostures
∩ Vault
∩ Executor
∩ límites técnicos y ambientales
= decisión efectiva de Nucleus
```
Backend aporta la verdad organizacional. Nucleus continúa siendo el punto local de decisión y enforcement.
Ninguno reemplaza al otro.

## 5. Por qué Nucleus conserva la decisión final
La soberanía local es una propiedad central de Bloom.
Backend no debe:
- ejecutar operaciones locales;
- acceder directamente al filesystem;
- usar credenciales del Vault;
- ordenar cambios a Executor;
- interpretar el estado ambiental de la máquina;
- decidir si una operación específica puede ejecutarse localmente.
Nucleus sí conoce esas fronteras y puede combinar la autoridad organizacional remota con el contexto real de ejecución.
Esto permite que la organización administre centralmente sus identidades y responsabilidades sin convertir el Backend en un controlador remoto de las instalaciones.

## 6. El Authority Snapshot como proyección verificable
Nucleus no debe consultar tablas remotas durante cada decisión local. Necesita consumir una representación verificable de la autoridad organizacional vigente.
Por eso se adoptó como dirección inicial el concepto de **Authority Snapshot**: una proyección completa, versionada y ligada a una organización.
Semánticamente deberá representar:
- organización;
- fuente;
- versión de autoridad;
- principals;
- memberships;
- definiciones de roles;
- asignaciones;
- scopes;
- vigencias;
- revocaciones;
- digest;
- referencia de clave;
- firma;
- emisión y expiración.
El formato concreto todavía no está aprobado.
Backend producirá la representación canónica. Batcave podrá transportarla y cachearla. Nucleus deberá verificarla independientemente antes de aceptarla.
La copia local será:
```text
una proyección verificada de la verdad remota
```
No será:
```text
una segunda fuente independiente de autoridad
```

## 7. Versionado y prevención de downgrade
Una revocación no sirve si una instalación puede restaurar después un snapshot anterior.
Por eso Nucleus deberá mantener un high-water mark monotónico por organización:
```text
versión recibida menor que la aceptada
→ rechazo por downgrade
misma versión y mismo digest
→ replay idempotente
misma versión y digest diferente
→ conflicto de integridad o equivocation
versión superior
→ candidata a aceptación después de verificación completa
```
Este marcador debe permanecer separado de los artefactos reemplazables y sobrevivir actualizaciones o rollbacks del software.
Un rollback técnico puede restaurar un binario. No puede restaurar autoridad revocada.

## 8. Papel de Batcave
Batcave representa la frontera de comunicación soberana entre Backend y la instalación organizacional.
Su función será:
- autenticar sesiones;
- iniciar conexiones salientes;
- mantener aislamiento por organización;
- transportar Authority Snapshots;
- cachear bytes y metadata;
- aplicar controles estructurales tempranos;
- administrar reintentos y sincronización;
- entregar el estado recibido hacia Nucleus por el contrato aprobado.
Batcave no debe:
- definir roles;
- asignar responsabilidades;
- interpretar permisos;
- evaluar Gravity;
- decidir autorización efectiva;
- considerar su propia validación como concesión de autoridad.
La verificación de Batcave es defensa de transporte. La aceptación de autoridad pertenece a Nucleus.

## 9. Por qué Metamorph queda fuera del recorrido ordinario
Metamorph administra el lifecycle del software:
- instalación;
- actualización;
- staging;
- verificación de artefactos;
- reemplazo atómico;
- rollback;
- recuperación de servicios.
Esas capacidades son apropiadas para binarios y paquetes versionados, pero no para autoridad mutable y sensible a revocación.
Usar Metamorph como transporte ordinario de Roles produciría riesgos:
- confundir hashes de artefactos con autoridad;
- restaurar estado revocado durante un rollback;
- acoplar revocaciones urgentes al ciclo de actualización de software;
- asignarle interpretación de un dominio que no le pertenece.
Metamorph debe preservar el estado durable de Batcave y Nucleus mientras actualiza sus aplicaciones, pero no debe interpretar, transportar ordinariamente ni revertir Authority Snapshots.

## 10. Relación con Gravity
Roles y Gravity responden preguntas diferentes:
```text
Roles
→ quién puede actuar, en qué capacidad y dentro de qué scope
Gravity
→ qué criterios restringen la acción
Gravity collision
→ qué GravityPostures aplicables entran en conflicto
```
Una GravityPosture nunca concede un permiso ausente.
Del mismo modo, poseer un rol no elimina una GravityPosture aplicable. Las excepciones deberán ser explícitas, autorizadas, scoped y auditables.
Backend puede compartir infraestructura de identidad, tenancy y auditoría con Gravity, pero no debe colapsar ambos dominios.

## 11. Relación con Genesis y Wisdom
Genesis necesita establecer:
- la primera organización;
- sus principals iniciales;
- los vínculos de identidad;
- las autoridades iniciales;
- el trust binding de la instalación.
Ese proceso no puede terminar creando una fuente local paralela que posteriormente compita con Backend.
Wisdom también puede reutilizar la identidad organizacional y el transporte autenticado, pero sus operaciones son distintas:
- publicar;
- descubrir;
- adoptar;
- registrar procedencia.
La actualización operativa, la autoridad organizacional y Wisdom pueden compartir fundamentos de identidad y transporte, pero no deben compartir automáticamente:
- endpoints;
- payloads;
- scopes;
- estados;
- reglas de negocio;
- persistencia;
- ciclos de vida.

## 12. Transición desde el modelo legado
El comportamiento existente no se reinterpreta silenciosamente. La transición prevista es:
```text
local_legacy → shadow_remote → remote_enforced
```
### `local_legacy`
El sistema conserva el comportamiento actual mientras se caracteriza y se preparan identidades, contratos y migraciones.
### `shadow_remote`
Backend produce autoridad remota y Nucleus la verifica, pero todavía no cambia las decisiones productivas. Se comparan resultados y se registran divergencias.
Esta etapa permite descubrir:
- identidades sin correspondencia;
- memberships inconsistentes;
- asignaciones ambiguas;
- diferencias entre autoridad local y remota;
- problemas de vigencia o scope;
- errores de sincronización.
### `remote_enforced`
Nucleus utiliza la proyección remota verificada como base organizacional para sus decisiones.
A partir de ese cutover:
- `.ownership.json` funciona como bootstrap y trust binding;
- `.master`, `.specialist` y otros marcadores locales no conceden autoridad;
- editar archivos locales no restaura privilegios;
- no se combina autoridad local y remota escogiendo el resultado más permisivo;
- volver al modo anterior requiere un mecanismo de gobernanza explícito, no un rollback ordinario.

## 13. Política offline
Bloom necesita conservar capacidad local sin transformar una desconexión en permiso indefinido.
La dirección acordada es:
- un snapshot aceptado y vigente puede continuar utilizándose durante una interrupción;
- al expirar, Nucleus entra en modo restringido fail-closed;
- nuevas elevaciones quedan bloqueadas;
- la firma de nuevos Mandates queda bloqueada;
- las nuevas actuaciones externas privilegiadas quedan bloqueadas;
- los workflows en curso deben revalidar antes de pasos privilegiados;
- operaciones de observación, diagnóstico o reducción de riesgo podrán continuar solamente según una política aprobada.
TTL, freshness y latencia máxima de revocación todavía requieren decisión de José.

## 14. Por qué el schema actual no es definitivo
El backend preliminar ya separa `users`, `organizations` y `orgMembers`, pero no representa todavía el dominio corporativo requerido.
Entre sus limitaciones:
- `users.id` está ligado directamente a GitHub;
- `masterGithubUsername` mezcla identidad externa y autoridad;
- `orgMembers.role` colapsa membership, definición y asignación;
- no existen múltiples asignaciones;
- no existen scopes;
- no existen versiones de definición;
- no existen vigencias completas;
- no existen suspensiones o revocaciones;
- no existe una versión monotónica de autoridad;
- no existe auditoría suficiente;
- no existe producción de Authority Snapshots.
Ese schema fue útil para iniciar el backend y reservar conceptos. No debe ampliarse como modelo corporativo mediante agregados oportunistas.

## 15. Motivo de la delegación al cowork BACKEND
La gestión remota de Roles constituye un dominio propio y suficientemente profundo como para requerir investigación y diseño especializados.
El cowork BACKEND deberá concentrarse en:
- persistencia autoritativa;
- identidad interna;
- tenancy;
- modelos de membership;
- definiciones y asignaciones;
- scopes;
- lifecycle;
- revocación;
- versionado;
- concurrencia;
- snapshots;
- auditoría;
- seguridad y privacidad;
- migración.
Los works consumidores podrán concentrarse en sus fronteras:
- BACKEND de Codex: interacción con el servicio remoto;
- BATCAVE: transporte y cache;
- NUCLEUS: verificación y autorización;
- METAMORPH: preservación durante lifecycle;
- GRAVITY: restricciones posteriores a la autoridad;
- Brain y Temporal: ejecución autorizada;
- Genesis: bootstrap gobernado.
Esta separación evita que un work consumidor invente parcialmente el modelo remoto que después todos deban soportar.

## 16. Decisiones que todavía no están aprobadas
La dirección arquitectónica no aprueba todavía:
- tablas;
- columnas;
- índices;
- endpoints;
- eventos;
- schemas;
- formato wire del Authority Snapshot;
- perfil criptográfico;
- TTL;
- latencia máxima de revocación;
- estrategia push, pull o híbrida;
- catálogo de permisos;
- catálogo de roles;
- tipos definitivos de scope;
- reglas de delegación;
- aprobación múltiple;
- trust bootstrap;
- rotación de claves;
- comportamiento break-glass.
Tampoco aprueba `Architect` ni ningún otro ejemplo como rol productivo.
No debe reintroducirse `Grant` ni un mecanismo equivalente con otro nombre.

## 17. Resultado esperado
El objetivo del cowork no es confirmar una solución previamente imaginada. Es producir la evidencia y el diseño necesarios para que José pueda decidir conscientemente:
- el modelo de identidad;
- el modelo organizacional;
- los invariantes multi-tenant;
- el lifecycle de autoridad;
- la representación del snapshot;
- el mecanismo de sincronización;
- las garantías de revocación;
- la política offline;
- la estrategia de migración;
- el vertical mínimo implementable.
Solo después de aprobar esos contratos se podrá autorizar una implementación.

## 18. Síntesis
La decisión de ubicar la autoridad organizacional en Backend no busca centralizar la ejecución ni disminuir la soberanía local.
Busca combinar dos necesidades:
```text
La organización necesita una verdad compartida,
administrable, sincronizable, auditable y revocable.
La instalación necesita decidir localmente,
con contexto real y límites soberanos.
```
Backend conserva los hechos organizacionales.
Batcave los transporta sin interpretarlos.
Nucleus los verifica y decide.
Gravity restringe sin conceder.
Brain y Temporal ejecutan sin ampliar autoridad.
Metamorph actualiza el software sin modificar la verdad organizacional.
Ese reparto permite que Bloom evolucione desde una instalación local hacia un sistema corporativo sin convertir archivos locales en autoridad global ni transformar el Backend en un ejecutor remoto.
