# Investigación — Catálogo Completo de Roles Organizacionales

**Fecha:** 2026-09-12
**Origen:** `Requerimiento_Investigacion_Catalogo_Completo_Roles_Organizacionales_v1_0.md` (2026-09-12) y
`Encargo_Investigacion_Catalogo_Completo_Roles_Organizacionales_v1_0.md` (2026-09-12, versión "para
ejecutar" del mismo requerimiento).
**Insumo, no repetido ni descartado:** `Investigacion_Escala_Usuarios_Nomenclatura_AGENT_ISSUER_ROLE_v0_1.md`
(2026-09-11).
**Estado:** Primera pasada. Investigación y recomendación — no autoriza ningún cambio de catálogo real
de roles ni de código. Todo nombre nuevo propuesto acá queda sujeto a validación de José antes de
propagarse a cualquier archivo de producción, exactamente con el mismo criterio que se usó para
`agent_sponsor`.
**Fuera de alcance (recordatorio):** el capability seam de agentes en sí, cualquier contrato ya
definido en el Encargo de Orbital (`OrbitalExecutionContext`, `IssuerDesignation`), la decisión ya
tomada sobre el nombre `agent_sponsor`, y cualquier cambio de código o de catálogo real de roles en el
sistema. Esta sesión no tocó ni necesitó tocar el repo.

---

## Resumen ejecutivo

El catálogo v1 aprobado el 2026-09-04 (`BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` §14-§17) tiene
dos roles built-in — `master` (toda la autoridad organizacional más creación/firma/promoción/
instalación de mandates e intents) y `specialist` (solo `intent.create`) — sobre un catálogo de
permisos ya organizado en cuatro dominios (`authority.*`, `mandate.*`/`intent.*`, `vault.*`,
`executor.*`) y un modelo de scopes (organización, proyecto, mandate, intent, recurso, environment) que
ya permite roles personalizados por organización.

Esta investigación concluye tres cosas:

1. **La arquitectura ya elegida (permisos enumerables + scope por asignación + roles personalizados)
   es exactamente el patrón que usan los sistemas análogos maduros** (Kubernetes RBAC, roles
   personalizados de GitHub y Google Workspace, System Roles de Slack) para resolver el mismo problema
   — no hace falta repensarla.
2. **El catálogo *nombrado* de solo dos roles es insuficiente a partir de equipo chico/mediano.** Todas
   las plataformas relevadas, aun las que permiten total personalización, envían de fábrica entre 4 y 7
   roles nombrados — nunca solo uno raíz y nada más. Falta al menos un escalón intermedio de
   administración acotada y un escalón de solo lectura/auditoría.
3. **`agent_sponsor` no es un caso especial: es una instancia del patrón general.** En todo sistema
   relevado, "quién puede crear una identidad nueva" es un permiso empaquetable, atado a un objeto con
   scope (blueprint, cuenta de servicio, namespace, proyecto) — nunca un rol nombrado aparte al mismo
   nivel que `master`/`Owner`/`cluster-admin`. Esto confirma, con evidencia ampliada, la misma hipótesis
   que ya dejó abierta la investigación del 2026-09-11.

---

## 1. Arquetipos organizacionales (reutilizados, no rehechos)

Se reutilizan sin cambios los tres arquetipos validados en
`Investigacion_Escala_Usuarios_Nomenclatura_AGENT_ISSUER_ROLE_v0_1.md` §1:

- **Founder solo** — un único humano es `master`; todos los roles del sistema colapsan en esa persona.
- **Equipo chico/mediano** — `master` empieza a delegar funciones operativas concretas (típicamente
  infraestructura/integraciones) a una segunda persona, de forma específica y angosta.
- **Organización grande** — aparecen equipos/departamentos con autoridad ya delegada por otros medios,
  múltiples titulares simultáneos de un mismo rol, alcance por proyecto en vez de por organización
  completa, y separación entre quien otorga un permiso y quien audita su uso.

Esta investigación no vuelve a describir estos arquetipos: los usa como eje para mapear el catálogo
completo, no solo el rol de agentes.

---

## 2. Relevamiento de industria — catálogos completos de roles humanos

### 2.1 Verificación y profundización del punto de partida (§3.1 del encargo)

Se verificó con fuentes 2026 cada plataforma del punto de partida. El resumen previo era correcto en
sus grandes líneas; se corrige y amplía donde la fuente primaria da más detalle.

| Plataforma | Catálogo verificado (2026) | Corrección/ampliación sobre el punto de partida |
|---|---|---|
| **GitHub** | `Owner` (control total) → `Member` (acceso estándar) → roles intermedios nombrados: `Moderator` (modera discusiones/contenido), `Billing Manager` (solo facturación), `Security Manager` (alertas y configuración de seguridad de toda la org), `CI/CD Admin` (políticas y runners de Actions), `App Manager` (gestión de GitHub Apps) — 7 roles de organización predefinidos en total, más 5 roles de repositorio (read/triage/write/maintain/admin) y roles personalizados de organización y de repositorio. | El punto de partida solo mencionaba `Organization owner`/`Billing manager`/`Member` + roles personalizados. La lista real de roles predefinidos es más larga de lo que se había relevado: GitHub ya nombra explícitamente varios roles de administración *acotada* (seguridad, CI/CD, apps) que no son ni `Owner` ni un rol personalizado — son un escalón intermedio con nombre propio. |
| **Google Workspace** | `Super Admin` (techo, control total) más **otros 11 roles de administrador prediseñados** (`Groups Admin`, `User Management Admin` — administra usuarios no-admin —, `Help Desk Admin` — solo reset de password y perfiles —, `Services Admin`, `Multi-party Approval Admin`, `Mobile Admin`, `Storage Admin`, `Google Voice Admin`, `Directory Sync Admin`, `Reseller Admin`, `Indirect Reseller Admin`) — 12 roles prediseñados en total — más roles personalizados (hasta 750 por organización), acotables a una unidad organizativa (OU) específica. | El punto de partida decía "roles de administrador delegado prediseñados" en genérico; la lista real es mucho más granular de lo esperado — 11 roles nombrados además de `Super Admin`, cada uno del tamaño de una sola función operativa, no de un departamento. Confirma con más fuerza el patrón de "muchos roles angostos con nombre, no pocos roles anchos". |
| **Slack** | `Primary Owner` (único, borra/transfiere el workspace) → `Owners` (mismos poderes salvo borrar/transferir) → `Admins` (gestión de miembros, sin acceso a facturación) → `Members` → `Guests` (multi-channel / single-channel) → `Channel Managers` (admin acotado a los canales asignados) → en Enterprise Grid, jerarquía paralela `Org Primary Owner`/`Org Owners`/`Org Admins`, más **18+ System Roles** (Analytics Admin, Security Admin, Workflow Admin, Compliance Admin, etc.) que empaquetan permisos granulares sin volver admin completo a nadie. | Confirma el punto de partida casi exactamente; agrega el detalle de `Channel Managers` como rol de administración acotada a un objeto (el canal), que es la misma forma que `Team Owner` en Linear o un rol personalizado acotado a una OU en Google Workspace. |
| **Notion** | `Workspace Owner` (control total, ≥1 obligatorio) → `Membership Admin` (solo Enterprise; alta/baja de miembros, no toca configuración) → `Member` → `Restricted Member` (visibilidad acotada a teamspaces/páginas asignadas explícitamente) → `Guest` (externo, por página) → `Temporary Member` (consultores de marketplace, acceso con vencimiento automático, no consume seat) → `Organization Owner` (por encima de `Workspace Owner`, gestiona múltiples workspaces a la vez). | Confirma el punto de partida y agrega dos matices no relevados antes: `Restricted Member` (un nivel de privilegio *entre* `Member` y `Guest`, acotado por objeto en vez de por identidad externa) y `Temporary Member` (acceso con vencimiento automático — un patrón temporal, no solo jerárquico). |
| **Linear** (y Plane como referencia) | `Workspace Owner` (Enterprise; billing, seguridad, audit logs, exports, aprobación de OAuth apps) → `Admin` (todos por defecto en plan Free; operación rutinaria) → `Member` (sin acceso a páginas de administración) → `Guest` (Business/Enterprise; acotado a los equipos donde fue agregado explícitamente) → **`Team Owner`** (rol delegado, existe solo dentro de una team puntual; único que puede borrar esa team o cambiar su privacidad). Linear confirma explícitamente que **no ofrece roles personalizados**. | Confirma el punto de partida. La confirmación de que Linear *no* tiene roles personalizados, ni siquiera en Enterprise, es un dato importante: es la única plataforma relevada donde la austeridad deliberada no se compensa con personalización — y sigue necesitando igual un rol delegado acotado a objeto (`Team Owner`) para cubrir el caso de administración parcial. |

### 2.2 Casos adicionales (ampliación pedida en §5 del encargo)

Se agregaron dos casos fuera de la lista original de SaaS B2B, elegidos por agregar señal nueva sobre
los **niveles de permiso naturales** que pide el §2 del encargo (administración total, gestión
parcial/por área, ejecución acotada, solo lectura/auditoría) — algo que ninguna de las cinco
plataformas anteriores nombra de forma tan limpia y explícita:

**Kubernetes RBAC.** El modelo separa la *definición* de un rol (`Role`, acotado a un namespace, o
`ClusterRole`, válido en todo el cluster) de su *asignación* (`RoleBinding` / `ClusterRoleBinding`) — y
permite tomar un `ClusterRole` ya definido y asignarlo, vía `RoleBinding`, acotado a un solo namespace.
Es la prueba técnica más limpia de que **el scope es una propiedad de la asignación, no del nombre del
rol** — el mismo hallazgo al que había llegado la investigación del 2026-09-11 por otro camino (objeto
que acota, no segundo nombre de rol). Además, los cuatro roles built-in orientados a usuario forman una
escalera de privilegio que corresponde casi literalmente a los cuatro niveles que pide el §2 del
encargo:

| Rol built-in de Kubernetes | Nivel de permiso (§2 del encargo) | Autoridad |
|---|---|---|
| `cluster-admin` | Administración total | Todos los verbos sobre todos los recursos, en todo el cluster. |
| `admin` | Gestión parcial/por área | CRUD completo dentro de un scope (namespace) y puede administrar RBAC *dentro de ese mismo scope* — es decir, puede sub-delegar sin tocar el scope superior. |
| `edit` | Ejecución acotada | CRUD sobre recursos de aplicación (pods, deployments, servicios) dentro del scope; no puede tocar RBAC ni ver secretos. |
| `view` | Solo lectura/auditoría | Get/list sobre casi todo, sin escritura y sin ver secretos. |

**GitHub Apps / installation tokens.** Confirma, del lado de identidades de servicio en vez de humanas,
el mismo patrón que ya había relevado la investigación del 2026-09-11 para Entra/GCP/AWS: el permiso de
"quién puede instalar o administrar una GitHub App" vive en el rol `App Manager` (uno de los 7 roles de
organización de §2.1), separado de `Owner` — es decir, ni siquiera GitHub trata la administración de
identidades de servicio/apps como parte automática del rol raíz.

---

## 3. Patrones que emergen (a nivel de catálogo completo, no solo de agentes)

1. **Ningún sistema maduro relevado tiene menos de 4 roles nombrados**, ni siquiera los más austeros
   deliberadamente (Linear: 4 roles de workspace + 1 rol delegado de team). El catálogo v1 de BLOOM
   (`master`/`specialist`, 2 roles) está por debajo del piso que cualquier plataforma comparable
   considera suficiente para representar una organización real — aunque sea perfectamente suficiente
   para el arquetipo founder solo.
2. **El escalón que falta con más consistencia es la administración acotada a un objeto** (proyecto,
   team, canal, namespace, OU) — GitHub (`CI/CD Admin`, `Security Manager`, roles de repositorio),
   Slack (`Channel Managers`, System Roles), Notion (`Restricted Member`), Linear (`Team Owner`),
   Google Workspace (roles acotados a OU), Kubernetes (`admin` con `RoleBinding` namespaced). Es
   exactamente el hueco que la investigación del 2026-09-11 ya había detectado para el caso puntual de
   agentes (necesidad de alcance por proyecto) — acá se confirma que es un patrón general del catálogo
   completo, no una particularidad de `agent_sponsor`.
3. **El segundo escalón que falta es el de solo lectura/auditoría como rol con nombre propio.** Ninguna
   de las cinco plataformas SaaS B2B relevadas tiene, a nivel de workspace, un rol universal
   "auditor/viewer" con ese nombre — se resuelve de forma indirecta (roles de seguridad/compliance que
   incluyen lectura junto con algunas acciones puntuales) o no se resuelve en absoluto. Kubernetes sí lo
   nombra de forma explícita y separada (`view`). Esto sugiere que, si BLOOM quiere este nivel, tiene
   que decidirlo explícitamente — no hay un nombre de la industria que copiar sin ambigüedad.
4. **La separación entre "quién administra" y "quién factura/paga" es casi universal** (GitHub
   `Billing Manager`; Slack: solo `Owners` ven facturación, no `Admins`; Google Workspace: `Reseller
   Admin`/`Indirect Reseller Admin` separados de administración técnica). El catálogo de permisos v1 de
   BLOOM (`authority.*`/`mandate.*`/`vault.*`/`executor.*`) no tiene ningún dominio de facturación hoy
   — esto es coherente con el alcance actual del sistema y no amerita ningún rol nuevo todavía, pero se
   señala como algo a tener en cuenta el día que exista medición de uso o facturación: la industria no
   la empaqueta junto con administración técnica por default.
5. **Cuando una plataforma sí ofrece roles personalizados, igual sigue enviando roles nombrados de
   fábrica** (Google Workspace: 12 roles prediseñados *y* hasta 750 personalizados; GitHub: 7 roles de
   organización *y* roles personalizados). Ninguna reemplaza el catálogo nombrado por personalización
   pura. Esto es evidencia directa para la pregunta 4 del encargo: tener el mecanismo de roles
   personalizados (que BLOOM ya tiene, §15.3) no exime de nombrar un puñado de roles de partida — son
   complementarios, no sustitutos.
6. **El patrón "alcance, no jerarquía de poder" se sostiene y se generaliza.** Se confirma con evidencia
   nueva (Kubernetes RBAC, roles acotados a OU en Google Workspace, `Team Owner` de Linear, `Channel
   Managers` de Slack) que ningún sistema relevado resuelve "más escala" duplicando el nombre de un rol
   con un adjetivo de jerarquía (`admin senior`, `admin junior`) — lo resuelve variando **cuántos
   titulares** tiene un rol y **sobre qué objeto** aplica su asignación. Esto es exactamente lo que el
   modelo de scopes de BLOOM (§16 del diseño físico) ya permite estructuralmente: un mismo `role_id`
   puede tener múltiples `assignment`s activos, cada uno con su propio `scope.type`/`scope.id` — el
   catálogo v1 ya no necesita ningún cambio de arquitectura para soportar "varios titulares del mismo
   rol, cada uno acotado a su propio proyecto". El hueco no está en el modelo de asignación: está en que
   hoy no hay ningún rol built-in pensado para vivir en un scope distinto de `organization`.

---

## 4. Catálogo propuesto de roles humanos (primera pasada — no final)

Igual que con `agent_sponsor`, esto es una propuesta de **primera pasada**: identifica los escalones de
privilegio que la evidencia muestra como necesarios y da un nombre candidato a cada uno, pero ningún
nombre acá está decidido. Se mantienen los dos roles ya aprobados sin cambios y se agregan tres
candidatos a rol built-in adicional, ordenados de mayor a menor jerarquía.

### 4.1 `master` (existente, sin cambios)

Máxima autoridad organizacional. Todos los permisos `authority.*`, más
`mandate.create`/`sign`/`promote`/`install`, `intent.create`, `intent.cor.merge`. **No** incluye Vault
ni Executor por defecto — deben asignarse aparte, incluso para quien ya es `master` (esto vale también
para el founder solo: ver nota en §6.1). Puede tener uno o varios titulares simultáneos; nada en el
diseño físico actual impide más de uno.

### 4.2 `delegate` (candidato nuevo — nombre no final)

**Necesidad que lo justifica:** la delegación operativa "específica y angosta" que la investigación del
2026-09-11 §1.2 ya identificó para equipo chico/mediano — típicamente infraestructura/integraciones —
requiere permisos de `vault.*` y/o `executor.*`, que hoy **no** vienen empaquetados en ningún rol
built-in. Sin este rol, la única forma de delegar eso hoy es (a) dar `master` completo, que es de más, o
(b) construir un rol personalizado desde cero para cada organización, reinventando lo mismo cada vez —
exactamente el problema que el patrón de industria (§3, punto 5) muestra que ningún sistema maduro
acepta resolver solo con roles personalizados.

**Autoridad candidata:** subconjunto de `vault.*` y `executor.*` (a definir cuáles exactamente es
decisión técnica, fuera de esta investigación), sin ningún permiso de `authority.*`. No administra
membership ni otros roles.

**Análogo de industria más cercano:** GitHub `CI/CD Admin` / Google Workspace `Services Admin` /
Kubernetes `edit` — administración operativa de una función específica, sin autoridad organizacional.

### 4.3 `scoped_admin` (candidato nuevo — nombre no final; alias posible: `project_admin`)

**Necesidad que lo justifica:** la organización grande necesita "alcance por proyecto" (investigación
2026-09-11 §1.3) y separación entre quien otorga y quien audita. Hoy el modelo de scopes (§16 del diseño
físico) ya soporta que un `assignment` tenga `scope.type: "project"` — pero no hay ningún rol built-in
pensado para vivir ahí; solo `master` tiene los permisos de `authority.*` necesarios para administrar
membership/asignaciones, y `master` no está diseñado para acotarse a un proyecto (su catálogo de
permisos es el mismo que el de organización completa).

**Autoridad candidata:** subconjunto de `authority.*` (probablemente
`authority.assignment.manage`/`authority.membership.manage`, no `authority.cutover.approve` ni
`authority.binding.approve`, que son decisiones de nivel organización completa) — cuando se asigna con
`scope.type: "project"`, queda acotado a ese proyecto sin tocar el resto de la organización. Puede tener
múltiples titulares simultáneos, uno por proyecto o varios en el mismo proyecto.

**Análogo de industria más cercano:** Linear `Team Owner` / Slack `Channel Managers` / Google Workspace
rol acotado a OU / Kubernetes `admin` con `RoleBinding` namespaced — en los cuatro casos, la misma forma
de autoridad que el rol raíz, pero con el scope de la asignación (no del rol) recortado a un objeto.

### 4.4 `specialist` (existente, sin cambios)

Rol built-in básico de ejecución. Solo `intent.create`. Cubre ya, en los tres arquetipos, el nivel de
"ejecución acotada" del §2 del encargo — equivalente a `edit` en Kubernetes o `Member` en las cinco
plataformas SaaS relevadas. No requiere cambios.

### 4.5 `auditor` (candidato nuevo — nombre no final; menor confianza que 4.2 y 4.3)

**Necesidad que lo justifica:** el §2 del encargo pide explícitamente mapear el nivel "solo
lectura/auditoría", y la investigación del 2026-09-11 §1.3 señala la separación entre quien otorga un
rol y quien audita su uso como algo esperable en organización grande.

**Por qué la confianza es menor:** a diferencia de `delegate` y `scoped_admin`, ningún sistema SaaS B2B
relevado nombra este nivel de forma limpia (§3, punto 3) — Kubernetes sí lo hace (`view`), pero es un
sistema de infraestructura, no de colaboración organizacional. Además, el catálogo de permisos v1 de
BLOOM (§14 del diseño físico) **no tiene, hoy, ningún permiso de lectura fuera de `vault.key.read`** —
no existe un `authority.assignment.read` o `mandate.read` separado de la capacidad de crear/firmar/
promover. Esto significa que construir este rol no es solo una decisión de catálogo de roles: primero
requeriría ampliar el catálogo de permisos v1 con verbos de lectura, que es una decisión técnica fuera
del alcance de esta investigación. Se señala como hallazgo, no como recomendación lista para adoptar.

---

## 5. Matriz — arquetipo organizacional × catálogo completo de roles

| Rol | Founder solo | Equipo chico/mediano | Organización grande |
|---|---|---|---|
| `master` | Imprescindible desde el día uno. Un solo titular (el propio founder). | Imprescindible. Sigue siendo la máxima autoridad; ya no es necesariamente el único humano con algún rol. | Imprescindible. Puede tener más de un titular (igual que `Owner` en GitHub/Notion o `Owners` en Slack), aunque el diseño físico no fija un mínimo ni un máximo. |
| `delegate` | No aparece — no hay a quién delegar. | Aparece acá por primera vez: dispara la necesidad la delegación de infraestructura/integraciones sin entregar autoridad organizacional completa. | Sigue existiendo, típicamente con varios titulares (uno por función operativa, como `Services Admin`/`Mobile Admin`/`Storage Admin` en Google Workspace). |
| `scoped_admin` | No aparece — no hay proyectos separados que administrar por separado del resto de la organización. | Generalmente no todavía — con uno o dos proyectos, el alcance de organización completa alcanza (coincide con la lectura de la investigación 2026-09-11 §4: "probablemente no todavía"). | Aparece acá por primera vez: necesidad de alcance por proyecto y de múltiples titulares simultáneos, cada uno acotado a su propio proyecto/equipo. |
| `specialist` | Puede no aparecer si el founder solo es el único usuario del sistema; aparece en cuanto se suma cualquier segundo humano que solo necesita ejecutar. | Imprescindible en cuanto el equipo crece más allá de quienes administran — es el rol por defecto de cualquier persona que solo opera. | Imprescindible — es, con distancia, el rol con más titulares en esta escala (equivalente a `Member` en cualquier plataforma relevada). |
| `auditor` | No aparece. | Generalmente no todavía. | Aparece acá por primera vez, junto con `scoped_admin` — motivado por la misma necesidad de separar quien otorga de quien audita. Depende de que el catálogo de permisos v1 se amplíe primero (§4.5). |

**Lectura de la matriz:** el mismo patrón "alcance, no jerarquía" que ya se había confirmado para
`agent_sponsor` se sostiene para el catálogo completo — lo que cambia entre arquetipos no es que
aparezcan roles "más poderosos", sino que aparecen roles con **autoridad más angosta y más acotada por
objeto**, y que un mismo rol pasa de tener un titular a tener varios. `delegate` y `scoped_admin` son
ambos subconjuntos de la autoridad que `master` ya tiene hoy (en dominios distintos: operación técnica
vs. administración de proyecto) — ninguno de los dos necesita un permiso que no exista ya en el catálogo
v1, salvo `auditor`, que sí lo necesita.

---

## 6. Respuestas explícitas a las preguntas del §4 del encargo

### 6.1 ¿Qué rol o roles mínimos necesita un founder solo?

Se confirma la hipótesis de partida: solo `master`. Con un matiz que vale la pena señalar porque afecta
el día uno: como `master` **no** incluye Vault ni Executor por defecto (§15.1 del diseño físico), un
founder solo que quiera usar esas capacidades necesita, desde el día uno, una segunda asignación (a sí
mismo) además de `master` — no un segundo rol nuevo, pero sí una fricción real de "día 1" que ningún
arquetipo evita. No es un hallazgo que pida agregar un rol; es una nota sobre cómo se vive la regla ya
existente en la práctica.

### 6.2 ¿Qué roles adicionales aparecen en equipo chico/mediano y qué dispara su aparición?

`delegate` (§4.2). Lo dispara específicamente la necesidad de delegar administración operativa
(infraestructura/integraciones, permisos de `vault.*`/`executor.*`) sin entregar autoridad
organizacional (`authority.*`). No aparece todavía la necesidad de acotar por proyecto (`scoped_admin`)
ni la de solo lectura (`auditor`) — ambas esperan a organización grande.

### 6.3 ¿Qué roles adicionales aparecen solo en organización grande?

`scoped_admin` (administración acotada por proyecto/equipo, con múltiples titulares simultáneos) y,
con menor confianza y sujeto a que se amplíe primero el catálogo de permisos v1, `auditor` (solo
lectura/separación entre quien otorga y quien audita). Ver §4.3 y §4.5 para el detalle y las
condiciones de cada uno.

### 6.4 ¿El catálogo v1 (`master`/`specialist`) alcanza como base, o hace falta repensar la estructura?

**La estructura no necesita repensarse — el catálogo nombrado sí necesita crecer.** La arquitectura
elegida (permisos enumerables por dominio + scope por asignación, no por rol + roles personalizados
permitidos) es el mismo patrón que usan todos los sistemas maduros relevados, incluido el más reciente y
más cercano en intención (Kubernetes RBAC). El propio modelo de scopes (§16) ya soporta, sin ningún
cambio, que un mismo rol tenga múltiples titulares acotados cada uno a su propio proyecto — eso ya
funciona. Lo que falta es que existan, de fábrica, uno o dos roles built-in pensados para vivir en un
scope distinto de `organization` (hoy solo `master` y `specialist` existen, y ambos están implícitamente
pensados para scope de organización completa aunque el modelo no se lo exija). Ninguna plataforma
relevada resuelve esto dejando que cada organización invente sus propios roles intermedios desde cero
— todas, incluidas las que sí permiten personalización total, envían un catálogo nombrado de partida más
grande que dos roles.

### 6.5 ¿Dónde encaja `agent_sponsor` en este catálogo completo?

Converge hacia ser **un permiso**, no un rol aparte — confirmando con más evidencia la misma hipótesis
que la investigación del 2026-09-11 ya dejaba abierta en su §2, punto 2 ("Owner" es el término más
repetido para el humano responsable de una identidad de agente, ligado a un objeto — blueprint, cuenta
de servicio — no a un rol jerárquico aparte). Con el catálogo completo mapeado, el permiso que hoy
`agent_sponsor` representaría encaja naturalmente como parte de la autoridad de `scoped_admin` (§4.3):
en equipo chico/mediano, la delegación "específica y angosta" que la investigación anterior describía en
su §1.2 es exactamente el tipo de permiso angosto que `scoped_admin` (o incluso `delegate`, si se
decide que autorizar agentes es más operativo que administrativo) empaquetaría; en organización grande,
es uno de los permisos que un `scoped_admin` de proyecto tendría de forma natural, sin que haga falta un
rol de un solo permiso. Solo en founder solo sigue viviendo, como todo lo demás, dentro de `master`.

Esto no reabre ni cuestiona el nombre `agent_sponsor` — señala únicamente su ubicación relativa dentro
del catálogo completo, tal como pedía el §2 del encargo.

---

## 7. Recomendación

1. **No repensar la arquitectura de roles/permisos/scopes.** Está validada por el patrón de industria
   más consistente de todo este relevamiento.
2. **Evaluar agregar `delegate` y `scoped_admin` como roles built-in** (nombres no finales) — ambos se
   arman con permisos que el catálogo v1 ya tiene, sin requerir ningún permiso nuevo. Son los dos
   escalones que la evidencia de industria muestra como los que ninguna organización real evita
   necesitar más allá del arquetipo founder solo.
3. **Tratar `auditor` como una decisión en dos pasos, no una:** primero, si BLOOM quiere en algún
   momento un nivel de solo lectura/auditoría (decisión de producto); si la respuesta es sí, recién ahí
   hace falta la decisión técnica, separada, de qué verbos de lectura le faltan al catálogo de permisos
   v1 para poder expresarlo.
4. **No tratar la ubicación de `agent_sponsor` como una decisión aislada.** Si José decide avanzar con
   `scoped_admin`, tiene sentido resolver en el mismo momento si el permiso de `agent_sponsor` se
   empaqueta ahí de entrada, en vez de mantenerlo como caso especial de un solo permiso.
5. **Nota de alcance, para no repetir la confusión de rondas anteriores:** ninguna de estas
   recomendaciones autoriza tocar `roles.go` ni ningún otro archivo de código. Son candidatos a decisión
   de producto para que José evalúe; su traducción a catálogo real y a contrato de permisos es trabajo
   de otro hilo, técnico y separado.

---

### Fuentes consultadas

- GitHub Docs — [Permissions of predefined organization roles](https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/permissions-of-predefined-organization-roles)
- Google Workspace — [Create, edit, and delete custom admin roles](https://knowledge.workspace.google.com/admin/users/create-edit-and-delete-custom-admin-roles)
- Google Workspace — [Prebuilt administrator roles](https://knowledge.workspace.google.com/admin/users/prebuilt-administrator-roles)
- Slack — [Types of roles in Slack](https://slack.com/help/articles/360018112273-Types-of-roles-in-Slack)
- Slack — [Understand the Primary Owner role](https://slack.com/help/articles/360038161033-Understand-the-Primary-Owner-role)
- Slack — [Create custom roles on Enterprise Grid](https://slack.com/help/articles/29800891169939-Create-custom-roles-on-Enterprise-Grid)
- Notion — [Who's who in a workspace](https://www.notion.com/help/whos-who-in-a-workspace)
- Notion — [Manage members, admins & guests in Notion](https://www.notion.com/help/add-members-admins-guests-and-groups)
- Linear Docs — [Members and roles](https://linear.app/docs/members-roles)
- Kubernetes — [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- GitHub Docs — [Reviewing and modifying installed GitHub Apps](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps)
- `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` §14-§17 (documento interno del proyecto BTIPS).
- `Investigacion_Escala_Usuarios_Nomenclatura_AGENT_ISSUER_ROLE_v0_1.md` (2026-09-11, documento interno,
  insumo de esta investigación).
