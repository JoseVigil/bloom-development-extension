# Encargo — Diseño de contratos para nacimiento de agente Orbital (Enfoque A) — v0.2

**Reemplaza a:** `Encargo_Diseno_Nacimiento_Agente_Orbital_EnfoqueA_v0_1.md` (2026-09-11).
**Motivo de la revisión:** José aprobó (2026-09-12) el paquete de decisiones derivado de
`Investigacion_Escala_Usuarios_Nomenclatura_AGENT_ISSUER_ROLE_v0_1.md` y
`Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md`. Esta versión reemplaza el símbolo
`AGENT_ISSUER_ROLE` por la decisión resultante. **Sigue sin ser un encargo ejecutable** — los mismos
bloqueantes del §6 original siguen abiertos (ver §6 de este documento), salvo el ítem 1 parcialmente
avanzado (ver changelog).

---

## Changelog v0.1 → v0.2

1. **`AGENT_ISSUER_ROLE` deja de ser un rol aparte.** Pasa a ser el permiso `agent.issuer.designate`
   (el nombre técnico del permiso no cambia — ya estaba fijado en v0.1), empaquetado dentro de roles
   ya existentes o recién aprobados, en vez de vivir en un rol de un solo permiso. Esto **elimina por
   completo la sección "concesión inicial por excepción" de v0.1** (ver punto 3 de este changelog) —
   ya no hace falta, porque no hay un rol nuevo que auto-otorgarse.
2. **Se aprueban dos roles built-in nuevos, nombres no finales:** `delegate` (administración operativa
   acotada, `vault.*`/`executor.*`) y `scoped_admin` (administración de `authority.*` acotada a un
   proyecto). Ambos se arman con permisos que el catálogo v1 ya tiene o que resultan de este mismo
   encargo, sin requerir una reestructuración del sistema de roles.
3. **`agent.issuer.designate` se empaqueta en dos lugares, no en uno — esto es una lectura de la
   investigación aprobada, marcada como asunción explícita, a confirmar:**
   - En el catálogo de **`master`**, para el arquetipo founder solo — sin esto, José (founder solo
     hoy) se queda sin forma de autorizar sus propios agentes hasta que exista un `scoped_admin` en su
     organización, lo cual contradice el caso de uso inmediato que este Encargo existe para resolver.
   - En el catálogo de **`scoped_admin`**, para equipo chico/mediano y organización grande, tal como
     la aprobación indica explícitamente.
   - **Esto no estaba dicho en la aprobación en esos términos exactos** — la aprobación dijo
     "`agent_sponsor` debe vivir dentro del rol `scoped_admin`", sin mencionar `master`. Se asume acá
     la lectura completa de la investigación (§6.5 del doc. del 12/9: *"Solo en founder solo sigue
     viviendo, como todo lo demás, dentro de `master`"*) porque omitirla deja sin resolver el caso de
     uso real. **Confirmar o corregir esta asunción antes de considerar cerrado este punto.**
4. **Consecuencia positiva de este cambio: se simplifica el mecanismo de arranque.** Como
   `agent.issuer.designate` pasa a ser un permiso dentro del catálogo *de definición* de `master`
   (no algo que haya que *asignarle* a `master` después de creado), desaparece el problema de fondo
   que motivaba la "excepción de primera concesión" en v0.1 — no hay ningún momento en que `master`
   necesite auto-otorgarse un rol que todavía no tiene, porque el permiso ya viene incluido en la
   definición del rol desde que la organización nace (mismo mecanismo que ya usa génesis para el resto
   de los permisos de `master`, ver `Encargo_Backend_Genesis_Primera_Emision_v1_0.md`).

---

## §1. El permiso ya tiene ubicación — pendiente de nombre final de `delegate`/`scoped_admin`

`agent.issuer.designate` sigue siendo el nombre técnico fijo del permiso (sin cambios respecto a
v0.1). Lo que se resuelve acá es dónde vive: dentro del catálogo de `master` (founder solo) y dentro
del catálogo de `scoped_admin` (equipo chico/mediano en adelante) — nunca como rol propio.

Los nombres `delegate` y `scoped_admin` son, igual que en las investigaciones que los originan,
**primera pasada, no finales** — quedan sujetos a que José los confirme como nombres de producción
antes de propagarse a cualquier archivo de código.

## §2. Contrato — ya no hace falta `IssuerDesignation` con concesión de rol; la designación sigue,
## la excepción de arranque desaparece

**Qué sigue igual:** el contrato `IssuerDesignation` (afirmación firmada por Backend de que un humano
con sesión válida y el permiso `agent.issuer.designate` autoriza a un proceso Orbital concreto a
solicitar el nacimiento de un principal de servicio efímero) **no cambia de forma** — sigue siendo
exactamente el mismo tipo definido en v0.1:

```ts
type IssuerDesignation = {
  designation_id: string;
  organization_id: string;
  project_id: string;
  issuer_principal_id: string;
  capability_seam: string[];
  session_revision: string;
  issued_at: string;
  expires_at: string;
};
```

**Qué cambia:** cómo `issuer_principal_id` llega a tener el permiso. En v0.1, requería el rol
`AGENT_ISSUER_ROLE` asignado, lo cual exigía la excepción de primera concesión para el caso de
`master`. En v0.2:

- Si `issuer_principal_id` tiene el rol `master`: ya tiene `agent.issuer.designate` desde la
  definición del rol — ninguna asignación ni excepción adicional requerida, mismo mecanismo que
  cualquier otro permiso de `master`.
- Si `issuer_principal_id` tiene el rol `scoped_admin` (acotado a `project_id`): tiene
  `agent.issuer.designate` dentro de ese scope — Backend valida, al resolver la sesión, que el scope
  del `role_assignment` de `scoped_admin` cubra el `project_id` pedido en la `IssuerDesignation`.

**Se elimina de v0.1, completo:** toda la sección "Concesión inicial de `AGENT_ISSUER_ROLE`" y el
patrón de excepción single-use análogo a `initialEmissionEvidence.kind === "canonical"`. Ya no aplica
— no hay una segunda concesión que hacer después de génesis, el permiso viene con la definición del
rol desde el principio.

## §3. `OrbitalExecutionContext`, custodia efímera y firma de Nucleus — sin cambios

Todo el diseño de nacimiento del `OrbitalExecutionContext` (verificación de designación, verificación
de Temporal por `run_id` exacto, generación del par Ed25519 efímero, firma con la clave de
`LocalIdentity` bajo dominio nuevo) **no se toca en esta revisión** — es independiente de cómo se
otorga el permiso de designación. Ver v0.1 §3 para el contrato completo, sin cambios.

La custodia de la clave efímera durante el turno (Nucleus exclusivo vs. entrega puntual a Brain)
**sigue abierta**, sin cambios respecto a v0.1 §8.2.

## §4. Flujo completo, de punta a punta — actualizado en el paso 1

1. Humano con sesión válida y **`agent.issuer.designate`** (heredado de `master` o de `scoped_admin`
   según el arquetipo — ya no de un rol nombrado aparte) pide a Backend una `IssuerDesignation` para
   un proyecto y un capability seam concretos.
2. Sin cambios respecto a v0.1: Backend valida sesión + permiso + revisión de identidad, firma la
   designación, la entrega a Nucleus por el canal S2S ya existente.
3. Sin cambios respecto a v0.1: Brain le pide a Nucleus nacer un actor, adjuntando la designación.
4. Sin cambios respecto a v0.1: Nucleus verifica designación + estado real de Temporal, genera el par
   efímero, arma y firma el `OrbitalExecutionContext`.
5. Sin cambios respecto a v0.1: validación de firma de draft + firma de contexto + vigencia + estado
   activo del `run_id`.
6. Sin cambios respecto a v0.1: invalidación y descarte de clave al cerrar el turno.

## §5. Archivos — mapa de impacto actualizado

| Archivo | Acción | Nota |
|---|---|---|
| `backend/src/authority/agent-issuer.ts` | Nuevo | Sin cambios respecto a v0.1: `IssuerDesignation`, orquestación de emisión. |
| `backend/src/authority/administration.ts` | Modificado | **Cambia respecto a v0.1:** ya no se agrega `agent.issuer.designate` "al catálogo que `master` puede otorgar" (mecanismo de v0.1) — se agrega **a la definición misma de `master`** (permiso incluido de fábrica) y **a la definición nueva de `scoped_admin`** (§1 de este documento). También se agregan las definiciones nuevas de `delegate` y `scoped_admin` en sí, con sus catálogos de permisos (§4.2 y §4.3 de `Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md`). |
| `backend/migrations/000X_authority_role_catalog_delegate_scoped_admin.sql` | **Nuevo (no estaba en v0.1)** | Alta de las definiciones `delegate` y `scoped_admin` en `role_definitions` (built-in, `organization_id IS NULL`, mismo patrón que `master`/`specialist`). |
| `backend/migrations/0011_authority_agent_issuer_designation.sql` | Nuevo | Sin cambios respecto a v0.1: tabla de designaciones (`IssuerDesignation`), evidencia durable. |
| `backend/src/authority/administration-route.ts` | Modificado | Sin cambios respecto a v0.1: nueva ruta `POST /v1/authority/agent-issuer/designate`. |
| `backend/test/agent-issuer.spec.ts` | Nuevo | **Ampliado respecto a v0.1:** además de los casos ya previstos, agregar happy path para `issuer_principal_id` con `scoped_admin` acotado al `project_id` correcto, y rechazo cuando el scope de `scoped_admin` no cubre el `project_id` pedido. |
| `installer/nucleus/internal/governance/orbitalidentity/designation.go` | Nuevo | Sin cambios respecto a v0.1. |
| `installer/nucleus/internal/governance/orbitalidentity/context.go` | Nuevo | Sin cambios respecto a v0.1. |
| `installer/nucleus/internal/governance/orbitalidentity/session.go` | Nuevo | Sin cambios respecto a v0.1 — custodia sigue abierta (§8.2). |
| `installer/nucleus/internal/orchestration/temporal/temporal_client.go` | Modificado | Sin cambios respecto a v0.1. |
| `installer/nucleus/internal/authority/roles.go` | Modificado (a confirmar) | **Cambia respecto a v0.1:** ya no se trata de "dejar de rechazar un identificador de rol nuevo" (`AGENT_ISSUER_ROLE`) — se trata de que el archivo reconozca las definiciones nuevas `delegate`/`scoped_admin` si es que valida catálogos de roles por nombre en algún punto. Sujeto a la re-verificación de este mismo archivo pendiente en §6 — se avanzó parcialmente (ver §6, ítem 1). |

## §6. Antes de que esto sea un encargo ejecutable — estado actualizado

1. **Re-verificar contra el repo real cada archivo citado de segunda mano — parcialmente avanzado.**
   `roles.go` ya fue leído directamente (sesión posterior a v0.1): confirma que `ScopeTypes` incluye
   `"project"` junto a `"organization"` (sin trabajo adicional ahí), pero que `PermissionsV1` es una
   whitelist cerrada que **no tiene hoy** `agent.issuer.designate` ni ningún permiso de `delegate`/
   `scoped_admin` — agregarlos es trabajo pendiente, menor pero real. No se encontró en ese archivo
   ningún struct de `RoleAssignment` ni el enforcement de scope al momento de asignar — probablemente
   vive en otro archivo no revisado todavía. **Siguen sin releerse:** `decision.go`, `snapshot.go`,
   `actor_proof.go`, `identity.go`, `temporal_client.go`, y el archivo (no identificado todavía) que
   contiene `RoleAssignment`/el enforcement de scope en la asignación.
2. Resolver la custodia de la clave efímera (§8.2 de v0.1, sin cambios, sigue abierto).
3. **Confirmar la asunción del changelog, punto 3** (permiso en `master` *y* en `scoped_admin`, no
   solo en `scoped_admin`) — es una lectura razonada de la investigación aprobada, pero no fue dicha
   en esos términos exactos por José y debería confirmarse explícitamente antes de escribir código.
4. Confirmar si `delegate` y `scoped_admin` son los nombres finales o si José quiere iterar sobre
   ellos antes de que lleguen a una migración de producción (la aprobación los acepta como propuesta,
   pero ambas investigaciones los marcaron como "nombres no finales").
5. Recién entonces, convertir esto en un encargo con el mismo estándar que
   `Encargo_Backend_Genesis_Primera_Emision_v1_0.md`.

## §7. Regla de continuidad

Este documento no autoriza escritura de código. Reemplaza el mecanismo de "concesión inicial por
excepción" de v0.1 por la ubicación del permiso en la definición de rol — no reabre ninguna otra
parte del diseño de `OrbitalExecutionContext` (§3-4 de v0.1, sin cambios). No decide los nombres
finales de `delegate`/`scoped_admin` — quedan como primera pasada aprobada, no como nomenclatura de
producción cerrada.
