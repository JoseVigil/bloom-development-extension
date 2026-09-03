# BLOOM — Diseño físico de autoridad organizacional remota v0.1

**Work:** ROLES

**Estado:** diseño físico para aprobación; no implementado

**Fecha:** 2026-09-04

## 1. Propósito y límites

Este documento traduce los contratos semánticos aprobados de identidad,
binding y Authority Snapshot a un diseño físico interoperable entre Backend,
Batcave y Nucleus.

Define:

- wire schema JSON;
- canonicalización, digest y firma;
- snapshot completo y delta incremental;
- transporte híbrido;
- persistencia lógica de verificación en Nucleus;
- TTL, freshness y latencia máxima de revocación;
- targeting por instalación;
- confianza inicial;
- catálogo v1 de roles, permisos y scopes;
- resolución de la contradicción `Architect`.

No modifica código, migraciones, configuración, servicios ni contratos
existentes. Los nombres físicos internos de tablas, packages y archivos de
runtime quedan para la ronda de implementación.

## 2. Decisiones cerradas en esta ronda

| ID | Decisión |
|---|---|
| `PHY-DEC-001` | Wire format JSON I-JSON, canonicalizado con JCS RFC 8785 |
| `PHY-DEC-002` | SHA-256 para digest y Ed25519 para firma del payload canónico |
| `PHY-DEC-003` | Transporte híbrido: HTTPS pull autoritativo + WebSocket de notificación; SSE no se adopta |
| `PHY-DEC-004` | Nucleus conserva por organización binding, snapshot aceptado, high-water mark y journal de aceptación separados lógicamente |
| `PHY-DEC-005` | Snapshot TTL 24 h; freshness por clase 5 min/30 min/24 h; revocación E2E máxima 60 s cuando hay conectividad |
| `PHY-DEC-006` | Targeting mediante `installation_id` ligado al binding; la sesión no determina la organización |
| `PHY-DEC-007` | Confianza inicial por root de Backend pinneada y manifiesto de issuer firmado; issuer privado requiere trust anchor explícito fuera de banda |
| `PHY-DEC-008` | Catálogo built-in v1: `master` y `specialist`; `architect` no se incorpora |
| `PHY-DEC-009` | Roles personalizados por organización permitidos, definidos y versionados por Backend |
| `PHY-DEC-010` | Scopes v1: organization, project, mandate, intent, resource y environment, sin herencia implícita |

## 3. Normas técnicas seleccionadas

### 3.1 JSON e I-JSON

El wire format es JSON UTF-8 restringido a I-JSON:

- claves de objeto únicas;
- strings Unicode válidos;
- sin `NaN`, infinitos ni cero negativo;
- enteros que puedan exceder la precisión interoperable de JavaScript se
  serializan como strings decimales;
- timestamps en RFC 3339 UTC con sufijo `Z`;
- identificadores opacos como strings.

### 3.2 Canonicalización

Se adopta JSON Canonicalization Scheme, RFC 8785. La canonicalización:

- ordena propiedades recursivamente;
- preserva el orden de arrays;
- no normaliza Unicode;
- no admite claves duplicadas;
- genera UTF-8 determinista.

Todos los productores deben ordenar arrays semánticamente no ordenados antes de
canonicalizar. El orden definido en §6 es parte del contrato.

### 3.3 Digest

Algoritmo: SHA-256.

Representación: base64url sin padding.

El digest se calcula sobre los bytes JCS del objeto `payload`, sin el objeto
`integrity` exterior.

### 3.4 Firma

Algoritmo: Ed25519 conforme a RFC 8032.

Representación de firma: 64 octetos codificados base64url sin padding.

Input de firma:

```text
UTF8("BLOOM-AUTHORITY-SNAPSHOT-v1")
|| 0x00
|| JCS(payload)
```

El separador de dominio impide reutilizar una firma de este contrato como firma
de otro artefacto Bloom.

### 3.5 Key reference

`key_id` es un identificador opaco y estable dentro del namespace del issuer.
Nunca contiene material privado. El verificador resuelve el material público
exclusivamente desde el trust bundle aceptado para ese issuer.

### 3.6 Envelope

```json
{
  "payload": {},
  "integrity": {
    "canonicalization": "JCS-RFC8785",
    "digest_algorithm": "SHA-256",
    "digest": "BASE64URL_NO_PADDING",
    "signature_algorithm": "Ed25519",
    "key_id": "OPAQUE_KEY_ID",
    "signature": "BASE64URL_NO_PADDING"
  }
}
```

El verificador debe rechazar algoritmos desconocidos. No existe negociación o
downgrade automático de algoritmos en v1.

## 4. Payload común

```json
{
  "schema": "bloom.authority.snapshot",
  "schema_version": "1.0",
  "kind": "full",
  "snapshot_id": "OPAQUE_ID",
  "issuer": "OPAQUE_ISSUER_ID",
  "organization_id": "OPAQUE_CANONICAL_ORG_ID",
  "authority_version": "42",
  "base_authority_version": null,
  "issued_at": "2026-09-04T12:00:00Z",
  "not_before": "2026-09-04T12:00:00Z",
  "expires_at": "2026-09-05T12:00:00Z",
  "audience": {
    "organization_id": "OPAQUE_CANONICAL_ORG_ID",
    "installation_ids": ["OPAQUE_INSTALLATION_ID"]
  },
  "content": {}
}
```

### 4.1 Reglas comunes

- `schema` y `schema_version` son exactos.
- `kind` es `full` o `delta`.
- `snapshot_id` identifica la emisión, no reemplaza `authority_version`.
- `organization_id` coincide exactamente con el binding aceptado.
- `authority_version` es un entero positivo, decimal, sin signo ni ceros a la
  izquierda, serializado como string.
- `base_authority_version` es `null` para `full` y obligatorio para `delta`.
- `issued_at < expires_at`.
- `not_before <= expires_at`.
- `audience.organization_id == organization_id`.
- la instalación receptora debe aparecer en `installation_ids`.
- arrays vacíos se representan como `[]`; no se omiten.
- propiedades desconocidas provocan rechazo en v1.

## 5. Snapshot completo

Para `kind: "full"`, `content` tiene esta forma:

```json
{
  "principals": [],
  "memberships": [],
  "role_definitions": [],
  "role_assignments": [],
  "revocations": []
}
```

### 5.1 Principal

```json
{
  "principal_id": "OPAQUE_PRINCIPAL_ID",
  "principal_type": "human",
  "status": "active",
  "external_identities": [
    {
      "provider": "github",
      "subject": "PROVIDER_STABLE_SUBJECT",
      "display_handle": "NON_AUTHORITATIVE_HANDLE",
      "status": "verified",
      "verified_at": "2026-09-04T10:00:00Z"
    }
  ]
}
```

`principal_type`: `human` o `service`.

`status`: `active`, `suspended` o `retired`.

El `display_handle` nunca identifica establemente al principal.

### 5.2 Membership

```json
{
  "membership_id": "OPAQUE_MEMBERSHIP_ID",
  "principal_id": "OPAQUE_PRINCIPAL_ID",
  "organization_id": "OPAQUE_CANONICAL_ORG_ID",
  "status": "active",
  "valid_from": "2026-09-04T10:00:00Z",
  "valid_until": null,
  "accepted_at": "2026-09-04T10:05:00Z"
}
```

`status`: `pending`, `active`, `suspended`, `expired` o `revoked`.

Sólo `active`, dentro de vigencia, puede sostener una asignación aplicable.

### 5.3 Definición de rol

```json
{
  "role_id": "master",
  "role_version": "1",
  "role_origin": "builtin",
  "display_name": "Master",
  "status": "active",
  "permissions": ["authority.assignment.manage"]
}
```

`role_origin`: `builtin` u `organization`.

`role_version` usa la misma codificación decimal estricta que
`authority_version`.

Una definición custom usa un ID opaco namespaced por la organización; no puede
usar IDs reservados built-in.

### 5.4 Asignación

```json
{
  "assignment_id": "OPAQUE_ASSIGNMENT_ID",
  "membership_id": "OPAQUE_MEMBERSHIP_ID",
  "role_id": "master",
  "role_version": "1",
  "scope": {
    "type": "organization",
    "id": "OPAQUE_CANONICAL_ORG_ID"
  },
  "status": "active",
  "valid_from": "2026-09-04T10:00:00Z",
  "valid_until": null,
  "accepted_at": "2026-09-04T10:05:00Z"
}
```

`status`: `pending`, `active`, `suspended`, `expired` o `revoked`.

No existe scope por omisión. `scope.type` y `scope.id` son obligatorios.

### 5.5 Revocación

```json
{
  "revocation_id": "OPAQUE_REVOCATION_ID",
  "target_type": "role_assignment",
  "target_id": "OPAQUE_ASSIGNMENT_ID",
  "effective_at": "2026-09-04T11:00:00Z",
  "recorded_in_authority_version": "42",
  "reason_code": "SECURITY_RESPONSE"
}
```

`target_type`: `external_identity`, `membership`, `role_definition` o
`role_assignment`.

`reason_code` es auditable pero no se usa para decidir si la revocación aplica.
La presencia de una revocación válida domina el estado histórico del target.

## 6. Orden canónico de arrays

Antes de JCS, el productor ordena:

- `audience.installation_ids` por valor ascendente;
- `principals` por `principal_id`;
- `external_identities` por `(provider, subject)`;
- `memberships` por `membership_id`;
- `role_definitions` por `(role_id, role_version numérica)`;
- `permissions` lexicográficamente y sin duplicados;
- `role_assignments` por `assignment_id`;
- `revocations` por `revocation_id`;
- operaciones delta por `sequence` numérica.

Dos objetos semánticamente iguales deben generar los mismos bytes JCS y el
mismo digest.

## 7. Delta incremental

Para `kind: "delta"`:

```json
{
  "schema": "bloom.authority.snapshot",
  "schema_version": "1.0",
  "kind": "delta",
  "snapshot_id": "OPAQUE_ID",
  "issuer": "OPAQUE_ISSUER_ID",
  "organization_id": "OPAQUE_CANONICAL_ORG_ID",
  "authority_version": "43",
  "base_authority_version": "42",
  "issued_at": "2026-09-04T12:01:00Z",
  "not_before": "2026-09-04T12:01:00Z",
  "expires_at": "2026-09-05T12:01:00Z",
  "audience": {
    "organization_id": "OPAQUE_CANONICAL_ORG_ID",
    "installation_ids": ["OPAQUE_INSTALLATION_ID"]
  },
  "content": {
    "result_digest": "BASE64URL_NO_PADDING",
    "operations": []
  }
}
```

Cada operación:

```json
{
  "sequence": "1",
  "operation": "upsert",
  "collection": "role_assignments",
  "entity_id": "OPAQUE_ASSIGNMENT_ID",
  "value": {}
}
```

`operation`: `upsert` o `remove`.

`collection`: una de las cinco colecciones del full snapshot.

Para `remove`, `value` es `null`. Una remoción de autoridad vigente debe estar
acompañada por la revocación correspondiente dentro del mismo estado resultante;
no puede depender de ausencia silenciosa.

Reglas:

- `base_authority_version` debe igualar el high-water mark local;
- las secuencias comienzan en `1`, son contiguas y únicas;
- las operaciones se aplican en orden;
- el estado resultante se normaliza y ordena como un full snapshot;
- su digest debe coincidir con `content.result_digest`;
- aceptación del delta persiste el estado completo resultante, no sólo un patch;
- cualquier gap o diferencia de digest obliga a obtener un full snapshot.

Así se hace verificable `SNAP-INV-021`: full y deltas que llegan a la misma
versión producen exactamente el mismo digest de estado normalizado.

## 8. Perfil criptográfico

### 8.1 Firma del issuer

Cada envelope tiene exactamente una firma Ed25519 válida de una clave activa del
issuer. Firmas múltiples o quorum quedan fuera de v1.

### 8.2 Verificación obligatoria

Nucleus ejecuta en este orden:

1. límite de tamaño y parseo I-JSON;
2. rechazo de claves duplicadas o propiedades desconocidas;
3. validación estructural v1;
4. binding de organización, issuer e instalación;
5. resolución de `key_id` desde trust bundle aceptado;
6. canonicalización JCS del payload;
7. recomputación SHA-256 y comparación constante con `digest`;
8. verificación Ed25519 sobre el input de dominio;
9. vigencia temporal;
10. comparación monotónica;
11. coherencia referencial y semántica;
12. aplicación/verificación del delta, si corresponde;
13. aceptación atómica del estado resultante y high-water mark.

Fallar cualquier paso impide ejecutar los posteriores que puedan mutar estado.

### 8.3 Rotación

Un trust bundle puede contener claves activas y retiradas para verificar
historia. La incorporación o retiro de claves necesita una cadena verificable
desde un trust anchor ya aceptado. Una clave nueva presentada únicamente dentro
del snapshot que ella misma firma no es confiable.

La mecánica exacta de rotación se diseñará con Backend, pero no puede permitir
autofirma como confianza inicial.

## 9. Transporte Batcave

### 9.1 Decisión

Se adopta transporte híbrido:

```text
WebSocket autenticado → notificación de versión disponible
HTTPS autenticado     → obtención autoritativa de full o delta
HTTPS periódico       → recuperación si WebSocket está caído
```

No se adopta SSE.

### 9.2 Justificación

- HTTPS pull conserva reintentos, cache condicional y recuperación simple.
- WebSocket permite notificación inmediata de revocaciones y acknowledgements
  sin abrir un segundo mecanismo de streaming.
- Batcave ya tiene WebSocket como dirección arquitectónica, aunque el servidor
  aún no esté implementado.
- La notificación no transporta autoridad y puede perderse sin perder verdad:
  el pull periódico recupera.
- SSE sería redundante junto a WebSocket y no cubre el canal bidireccional de
  acknowledgements.

### 9.3 Notificación

La notificación contiene solamente:

- organización;
- nueva versión disponible;
- tipo de urgencia (`routine` o `revocation`);
- correlation ID.

No contiene roles, assignments ni snapshot firmado. Recibirla sólo dispara un
pull.

### 9.4 Pull

El request identifica:

- issuer;
- organización canónica;
- instalación;
- high-water mark observado;
- digest observado;
- capacidad de consumir full/delta;
- correlation ID.

La respuesta entrega un envelope firmado o indica que no hay versión superior.
Los nombres de endpoints se reservan para implementación.

### 9.5 Acknowledgements

Batcave transporta tres resultados separados:

- `received`: bytes recibidos;
- `verified`: verificación criptográfica y semántica completada;
- `accepted`: Nucleus avanzó snapshot y high-water mark.

Sólo `accepted` demuestra adopción local. Batcave no puede fabricarlo.

### 9.6 Orden y replay

Batcave puede entregar duplicados o versiones fuera de orden; Nucleus aplica las
reglas monotónicas. Batcave no descarta silenciosamente una revocación porque
haya observado una versión más nueva sin confirmación de aceptación.

## 10. Targeting por instalación

### 10.1 Identificador

Cada instalación tiene un `installation_id` opaco y estable, creado durante
bootstrap local y registrado durante el binding. No deriva de hostname,
username, path, slug ni hardware serial.

### 10.2 Audience firmada

La audiencia está dentro del payload firmado. Nucleus rechaza un snapshot si su
`installation_id` no aparece expresamente.

Un snapshot puede dirigirse a varias instalaciones de la misma organización,
pero nunca a organizaciones diferentes.

### 10.3 Sesión

La sesión autenticada de Batcave se liga a una instalación, pero no sustituye la
audiencia firmada ni el binding local. Robar o reutilizar una respuesta destinada
a otra instalación no permite aceptación.

## 11. Confianza inicial

### 11.1 Backend Bloom administrado

El instalador incluye un pequeño trust bundle de roots públicas de Backend,
versionado como parte del software firmado. Esas roots verifican un manifiesto
de issuer que liga:

- issuer;
- organización canónica;
- claves de firma autorizadas;
- vigencia del manifiesto;
- instalación candidata cuando corresponda.

Durante `BINDING_PENDING → BOUND`, Nucleus verifica la cadena hasta una root
pinneada y exige confirmación explícita de la organización canónica y la
instalación.

### 11.2 Backend privado o self-hosted

No se aplica trust-on-first-use automático. El trust anchor se incorpora por un
canal fuera de banda y requiere confirmación humana explícita de su fingerprint.
La sola respuesta de red no puede instalar su propia confianza.

### 11.3 GitHub

GitHub puede autenticar una identidad externa durante bootstrap, pero no prueba
la identidad organizacional Bloom, no firma el binding y no concede roles.

## 12. Estado durable de Nucleus

Nucleus mantiene cuatro unidades lógicas separadas:

1. **Binding state:** organización, issuer, instalación y trust anchor aceptados.
2. **Accepted projection:** último estado organizacional completo aceptado.
3. **Monotonic state:** high-water mark, digest aceptado y cutover floor.
4. **Acceptance journal:** recepción, verificación, rechazo, conflicto y
   aceptación con correlation IDs.

No se fijan filenames ni packages.

### 12.1 Transacción de aceptación

La aceptación debe ser crash-consistent:

```text
verificar candidato
→ construir proyección completa resultante
→ preparar journal
→ persistir proyección + high-water mark + digest + journal
→ confirmar accepted
```

Después de un crash, Nucleus debe observar el estado anterior completo o el
nuevo completo, nunca una combinación.

### 12.2 Separación de rollback

El high-water mark y cutover floor viven fuera del conjunto reemplazable por
rollback ordinario de software. Metamorph preserva estas unidades como datos
durables y no interpreta su contenido.

### 12.3 Concurrencia

La aceptación se serializa por organización. Dos candidatos de versiones
distintas se reevalúan contra el high-water mark dentro de la misma sección
crítica. Misma versión con distinto digest siempre produce conflicto.

## 13. TTL, freshness y revocación

### 13.1 TTL del snapshot

TTL máximo: **24 horas** desde `issued_at` hasta `expires_at`.

Backend puede emitir una vigencia menor. Batcave no puede extenderla. Nucleus
rechaza una vigencia superior a 24 horas.

### 13.2 Clases de freshness

| Clase | Umbral máximo desde `issued_at` | Operaciones |
|---|---:|---|
| `critical` | 5 minutos | cambio de autoridad, firma/promoción/instalación de Mandates, acceso o mutación de Vault, Executor con escritura/red, acciones externas |
| `privileged` | 30 minutos | creación o modificación gobernada sin efecto externo inmediato |
| `standard` | 24 horas | operaciones internas no privilegiadas que requieren membership vigente |
| `observation` | hasta expiración y aun después con marca stale | lectura diagnóstica que no crea efectos ni revela secretos |

Una política local puede exigir mayor frescura, nunca menor.

### 13.3 Revocación

Latencia máxima end-to-end con conectividad disponible: **60 segundos** desde
que Backend confirma la revocación hasta que Nucleus la acepta o entra en estado
restringido porque no pudo verificarla.

Implementación esperada:

- notificación WebSocket inmediata;
- pull urgente;
- retry continuo dentro de la ventana;
- si la ventana vence sin aceptación, Nucleus bloquea nuevas operaciones
  `critical` y `privileged` para esa organización hasta reconciliar.

Este valor no convierte Batcave en decisor: sólo obliga a que la falta de
confirmación reduzca capacidad.

### 13.4 Poll de recuperación

Sin notificación WebSocket, Batcave realiza pull condicional al menos cada
**5 minutos**. Esta frecuencia cubre cambios rutinarios, pero no satisface por sí
sola la ventana de revocación; por eso el canal push y el fail-closed son
obligatorios.

### 13.5 Expiración

Al expirar el snapshot:

- `critical`, `privileged` y `standard` fallan cerrado;
- `observation` puede continuar sólo con indicación explícita de estado stale;
- no se reactiva `local_legacy`;
- workflows revalidan antes del siguiente paso privilegiado;
- acciones ya irreversibles no se revierten automáticamente.

## 14. Catálogo de permisos v1

Los permission IDs son estables y lowercase con puntos. No existe wildcard
implícito.

### 14.1 Autoridad organizacional

- `authority.membership.manage`
- `authority.role_definition.manage`
- `authority.assignment.manage`
- `authority.binding.approve`
- `authority.cutover.approve`

### 14.2 Mandates e Intents

- `mandate.create`
- `mandate.sign`
- `mandate.promote`
- `mandate.install`
- `intent.create`
- `intent.cor.merge`

### 14.3 Vault

- `vault.key.read`
- `vault.key.write`
- `vault.key.delete`

### 14.4 Executor

- `executor.command.execute`
- `executor.filesystem.write`
- `executor.network.access`
- `executor.change.promote`

La existencia del permiso no evita políticas, GravityPostures, reglas de Vault,
límites de Executor o restricciones ambientales.

## 15. Catálogo de roles v1

### 15.1 `master`

Rol built-in de administración organizacional. Permisos iniciales:

- todos los permisos `authority.*` enumerados en §14.1;
- `mandate.create`;
- `mandate.sign`;
- `mandate.promote`;
- `mandate.install`;
- `intent.create`;
- `intent.cor.merge`.

`master` no incluye automáticamente permisos de Vault o Executor. Esos permisos
requieren asignación adicional mediante roles organizacionales explícitos y
continúan sujetos a políticas técnicas.

### 15.2 `specialist`

Rol built-in básico para una membership activa. Permiso inicial:

- `intent.create`.

No concede firma, promoción, instalación, Vault, Executor ni administración de
autoridad.

### 15.3 Roles organizacionales personalizados

Se permiten. Deben:

- usar IDs opacos distintos de IDs built-in reservados;
- tener versión monotónica propia;
- enumerar permisos v1 explícitos;
- no definir wildcards;
- no eliminar controles de Nucleus, Gravity, Vault o Executor;
- estar incluidos en el snapshot antes de ser referenciados.

## 16. Scopes v1

Tipos permitidos:

- `organization`;
- `project`;
- `mandate`;
- `intent`;
- `resource`;
- `environment`.

Reglas:

- todo assignment tiene exactamente un scope;
- no existe herencia implícita entre tipos;
- un scope organization no concede acceso automático a datasets, Vault,
  filesystem o environments;
- permisos sobre recursos sensibles deben asignarse al recurso o environment
  correspondiente;
- Nucleus compara tipo e ID exactos durante la decisión;
- composición o herencia futura requiere versión de contrato posterior.

## 17. Resolución de `Architect`

Decisión: **`architect` no se incorpora al catálogo built-in v1**.

Justificación:

- no existe en el enum, marcadores, detección o guards productivos de Nucleus;
- su única presencia material relevante es una configuración hardcodeada sin
  enforcement correspondiente;
- incorporarlo sólo para legitimar ese string convertiría una contradicción en
  arquitectura;
- el permiso que esa configuración intentaba expresar puede representarse de
  forma precisa como `intent.cor.merge`.

Consecuencia de diseño para una implementación posterior:

- `MinRoleForCorMerge: "Architect"` se clasifica como legacy inválido;
- durante migración se traduce a requisito de permiso `intent.cor.merge`;
- `master` posee ese permiso en v1;
- una organización puede asignarlo mediante un rol custom sin crear un rol
  built-in llamado Architect;
- ningún dato histórico con string `Architect` concede autoridad por sí mismo.

Esta sección decide el contrato, pero no autoriza modificar `blueprint.go`.

## 18. Evaluación efectiva en Nucleus

Una decisión efectiva requiere la intersección:

```text
binding REMOTE_LOCKED
∩ snapshot aceptado y vigente
∩ freshness suficiente
∩ principal verificado
∩ membership activa
∩ assignment activa
∩ role definition exacta
∩ permission exacto
∩ scope exacto
∩ Sovereign Policy
∩ GravityPostures
∩ reglas de Vault
∩ límites de Executor
∩ límites técnicos y ambientales
```

Fallar cualquier término produce deny. No existe fallback a markers ni
`team_members[].role` después de cutover.

En `shadow_remote`, se calcula el resultado remoto con esta misma fórmula, pero
se registra únicamente como comparación y no altera enforcement productivo.

## 19. Mapeo a invariantes aprobados

| Contrato | Mecanismo físico |
|---|---|
| `BIND-INV-002/003` | organization ID y audience firmadas; slug e ID local no bastan |
| `BIND-INV-009/015` | cutover floor y high-water mark fuera del rollback ordinario |
| `BIND-INV-016` | Batcave notifica/transporta; Nucleus verifica y acepta |
| `SNAP-INV-001` | comparación decimal estricta contra high-water mark |
| `SNAP-INV-002` | misma versión + mismo SHA-256 = replay idempotente |
| `SNAP-INV-003` | misma versión + digest distinto = integrity conflict |
| `SNAP-INV-005/006` | transacción de aceptación y estado monotónico durable |
| `SNAP-INV-014/016/017` | revocation records + versión monotónica + sin fallback legacy |
| `SNAP-INV-019/020` | base exacta y full reconciliation ante gap |
| `SNAP-INV-021` | `result_digest` del estado normalizado |
| `SNAP-INV-026` | replay no cambia `issued_at` ni `expires_at` |
| `SNAP-INV-028/029` | clases de freshness y deny tras expiración |

## 20. Threat controls del diseño

| Amenaza | Control |
|---|---|
| Snapshot para otra organización | binding exacto + organization ID firmada |
| Snapshot para otro dispositivo | audience firmada con installation ID |
| Replay | authority version + digest + high-water mark |
| Equivocation | misma versión/digest distinto produce incidente |
| Downgrade por restore | high-water mark y cutover floor separados |
| Omisión de revocación en delta | base exacta, secuencia contigua y result digest |
| Clave nueva autofirmada | cadena desde trust anchor previo |
| Batcave comprometido | verificación independiente de Nucleus |
| Username renombrado | principal ID estable, handle no autoritativo |
| Scope ausente | rechazo; no existe organization scope implícito |
| Rol desconocido | rechazo de assignment o definición no reconocida |
| Snapshot vencido | fail-closed según clase de operación |
| WebSocket perdido | poll HTTPS de recuperación |
| Notificación falsificada | sólo dispara pull; no contiene autoridad |

## 21. Criterios de aprobación del diseño

El diseño puede pasar a planificación de implementación sólo si José aprueba
expresamente:

1. wire schema full/delta;
2. JCS + SHA-256 + Ed25519;
3. transporte híbrido HTTPS/WebSocket;
4. audience por installation ID;
5. bootstrap de confianza pinneado/out-of-band;
6. unidades durables de Nucleus;
7. TTL 24 h;
8. freshness 5 min/30 min/24 h;
9. revocación máxima 60 s;
10. catálogo `master`/`specialist` y roles custom;
11. scopes sin herencia implícita;
12. exclusión de `architect` y migración a `intent.cor.merge`.

## 22. Referencias normativas

- RFC 8259 — The JavaScript Object Notation Data Interchange Format.
- RFC 7493 — The I-JSON Message Format.
- RFC 8785 — JSON Canonicalization Scheme.
- RFC 8032 — Edwards-Curve Digital Signature Algorithm.
- RFC 4648 — Base-N Encodings.
- RFC 3339 — Date and Time on the Internet.
- RFC 6455 — The WebSocket Protocol.

## 23. Regla de continuidad

Este documento termina en diseño físico.

No autoriza:

- modificar Backend, Batcave, Nucleus, Brain, Temporal o Metamorph;
- crear migraciones, endpoints, eventos, stores o packages;
- cambiar `.ownership.json`, guards, roles o configuración vigente;
- implementar el schema o perfil criptográfico;
- desplegar infraestructura;
- crear tests de implementación;
- staging, commit o push de código.

La ronda siguiente debe presentar un plan de implementación por Work, con lista
exacta de archivos y autorización puntual conforme a `AGENTS.md`.
