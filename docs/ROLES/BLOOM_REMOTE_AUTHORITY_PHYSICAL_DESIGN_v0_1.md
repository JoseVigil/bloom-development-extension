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
- schema canónico transitorio, compatibilidad y migración de `.ownership.json`.

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
| `PHY-DEC-011` | `.ownership.json` adopta un único schema canónico v1 con owner legacy como objeto único y binding separado |
| `PHY-DEC-012` | Los formatos ownership legacy se normalizan y migran una sola vez, con rechazo de ambigüedad y pérdida de autoridad local tras cutover |

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

## 20. Contrato físico canónico de `.ownership.json`

### 20.1 Decisión normativa

Se adopta un único schema canónico de transición para `.ownership.json`.

El archivo representa:

- identidad y locator de la organización local;
- identidad de la instalación;
- estado del binding;
- referencia al issuer y trust binding;
- modo de autoridad;
- datos administrativos legacy únicamente mientras ese modo los admite;
- evidencia de la migración desde una forma anterior.

No representa el Authority Snapshot, la accepted projection ni el high-water
mark. Esas unidades permanecen separadas conforme a §12.

### 20.2 Schema canónico completo

```json
{
  "schema": "bloom.organization.ownership",
  "schema_version": "1.0",
  "authority_mode": "local_legacy",
  "organization": {
    "canonical_id": null,
    "legacy_org_id": "org_1788537600",
    "legacy_locator": "bloom:org:acme",
    "slug": "acme",
    "display_name": "Acme"
  },
  "installation": {
    "installation_id": "01991d44-95c0-7a85-bda7-4fd149dd9611"
  },
  "binding": {
    "state": "UNBOUND",
    "issuer_id": null,
    "accepted_at": null,
    "remote_locked_at": null
  },
  "trust_binding": null,
  "legacy_authority": {
    "owner": {
      "source": "github_handle",
      "subject": "josev",
      "display_name": "José Vigil"
    },
    "team_members": [],
    "effective_markers": ["master"]
  },
  "migration": {
    "source_format": "nucleus_go_v0",
    "source_digest_sha256": "BASE64URL_NO_PADDING",
    "migrated_at": "2026-09-04T12:00:00Z",
    "migration_id": "OPAQUE_MIGRATION_ID"
  },
  "created_at": "2026-09-04T10:00:00Z",
  "updated_at": "2026-09-04T12:00:00Z"
}
```

### 20.3 Tipos y obligatoriedad

| Path | Tipo | Obligatorio | Regla |
|---|---|---:|---|
| `schema` | string | sí | Valor exacto `bloom.organization.ownership` |
| `schema_version` | string | sí | Valor exacto `1.0` para este contrato |
| `authority_mode` | string enum | sí | `local_legacy`, `shadow_remote` o `remote_enforced` |
| `organization` | object | sí | Identidad y atributos organizacionales separados |
| `organization.canonical_id` | string o null | sí | Null sólo antes de aceptar binding; nunca se deriva del slug |
| `organization.legacy_org_id` | string o null | sí | Valor histórico de Nucleus; nunca canónico por inferencia |
| `organization.legacy_locator` | string o null | sí | Locator histórico; `bloom:org:{slug}` no prueba identidad |
| `organization.slug` | string o null | sí | Etiqueta de routing/UX, no autoridad |
| `organization.display_name` | string o null | sí | Presentación humana, no identidad |
| `installation` | object | sí | Instalación local vinculable |
| `installation.installation_id` | string | sí | ID opaco estable; no deriva de usuario, host, path o slug |
| `binding` | object | sí | Estado separado del modo de autoridad |
| `binding.state` | string enum | sí | `UNBOUND`, `BINDING_PENDING`, `BOUND`, `DIVERGENT` o `REMOTE_LOCKED` |
| `binding.issuer_id` | string o null | sí | Obligatorio desde `BOUND`; null antes de aceptación |
| `binding.accepted_at` | RFC 3339 UTC o null | sí | Obligatorio desde `BOUND` |
| `binding.remote_locked_at` | RFC 3339 UTC o null | sí | Obligatorio sólo en `REMOTE_LOCKED` |
| `trust_binding` | object o null | sí | Null antes de disponer de evidencia confiada |
| `legacy_authority` | object o null | sí | Objeto sólo en modos que admiten lectura legacy; null en `remote_enforced` |
| `legacy_authority.owner` | object | condicional | Obligatorio en `local_legacy`; forma única del owner |
| `legacy_authority.team_members` | array | condicional | Administrativos legacy, no principals remotos |
| `legacy_authority.effective_markers` | array | condicional | Sólo `master` o `specialist`; registro de estado observado |
| `migration` | object o null | sí | Obligatorio si el archivo proviene de un formato legacy |
| `created_at` | RFC 3339 UTC | sí | Conserva el instante original cuando puede demostrarse |
| `updated_at` | RFC 3339 UTC | sí | Instante de la última escritura canónica |

No se permiten propiedades desconocidas en schema v1.

### 20.4 Forma única del owner legacy

La única forma canónica es:

```json
"owner": {
  "source": "github_handle",
  "subject": "josev",
  "display_name": "José Vigil"
}
```

Reglas:

- no existen `owner_id`, `owner_name` ni `master_user` como aliases top-level;
- `source` describe la clase del identificador histórico;
- `subject` conserva exactamente el valor legacy sin afirmar que es un
  `principal_id` remoto;
- `display_name` es informativo y puede ser null;
- el owner legacy no se convierte en principal, membership o assignment por
  normalización;
- en `remote_enforced`, `legacy_authority` es null y este owner no participa en
  autorización efectiva.

Esto resuelve la contradicción entre `owner` y `owner_id`/`owner_name` sin
mantener dos formas canónicas.

### 20.5 Trust binding físico

Cuando existe, `trust_binding` tiene esta forma:

```json
{
  "issuer_id": "OPAQUE_ISSUER_ID",
  "trust_anchor_id": "OPAQUE_TRUST_ANCHOR_ID",
  "trust_anchor_fingerprint_sha256": "BASE64URL_NO_PADDING",
  "bound_organization_id": "OPAQUE_CANONICAL_ORG_ID",
  "bound_installation_id": "OPAQUE_INSTALLATION_ID",
  "accepted_at": "2026-09-04T12:00:00Z"
}
```

Validaciones:

- `issuer_id == binding.issuer_id`;
- `bound_organization_id == organization.canonical_id`;
- `bound_installation_id == installation.installation_id`;
- el fingerprint se verifica contra el trust anchor aceptado y no contra el
  locator legado;
- ningún valor se deriva de `slug`, path o `legacy_locator`;
- desde `BOUND`, `trust_binding` es obligatorio;
- una edición local que cambie cualquiera de estos valores produce
  `DIVERGENT`, no un binding nuevo.

### 20.6 Matriz válida de modo y binding

| `authority_mode` | Binding permitido | `legacy_authority` |
|---|---|---|
| `local_legacy` | `UNBOUND`, `BINDING_PENDING`, `BOUND` o `DIVERGENT` | Objeto requerido; fuente local productiva vigente |
| `shadow_remote` | `BOUND` o `DIVERGENT` | Objeto requerido para comparación; sigue siendo productivo |
| `remote_enforced` | `REMOTE_LOCKED` o `DIVERGENT` posterior al cutover | Debe ser null; archivos y markers legacy no autorizan |

Combinaciones fuera de esta matriz son inválidas y fallan cerrado.

### 20.7 Contenido por etapa

#### `local_legacy`

- `canonical_id` puede ser null si todavía no existe binding;
- `legacy_org_id` conserva el identificador local histórico;
- owner, miembros y markers legacy pueden sostener únicamente el enforcement
  local ya caracterizado;
- ningún campo afirma autoridad remota;
- accepted projection y high-water mark todavía no se infieren.

#### `shadow_remote`

- `canonical_id`, issuer, installation ID y trust binding son obligatorios;
- binding debe haber sido aceptado o estar en divergencia explícita;
- owner, miembros y markers se conservan para comparar decisiones legacy;
- Authority Snapshot y accepted projection viven fuera de `.ownership.json`;
- una diferencia se audita y nunca elige automáticamente el resultado remoto o
  local más permisivo;
- editar ownership no modifica accepted projection ni high-water mark.

#### `remote_enforced`

- binding válido es `REMOTE_LOCKED`;
- `canonical_id`, issuer, installation ID y trust binding son obligatorios;
- `legacy_authority` debe ser null;
- `legacy_org_id`, locator, slug y display name pueden persistir únicamente para
  compatibilidad, UX y auditoría;
- `.master`, `.specialist`, owner y team members no conceden autoridad;
- accepted projection, high-water mark y cutover floor permanecen separados;
- restaurar una copia anterior del archivo no reduce el modo ni el cutover floor.

### 20.8 Formatos legacy reconocidos

La detección ocurre sólo cuando falta `schema`.

#### `nucleus_go_v0`

Firma inequívoca:

- `org_id` string no vacío;
- `owner_id` string no vacío;
- `created_at` parseable;
- ausencia de `organization_fingerprint`, `master_user` y `owner`.

Mapeo:

- `org_id → organization.legacy_org_id`;
- `owner_id → legacy_authority.owner.subject`;
- `owner_name → legacy_authority.owner.display_name`;
- owner source `github_handle`, salvo evidencia explícita distinta;
- `team_members → legacy_authority.team_members` preservando valores;
- `signed_hash` se conserva sólo en evidencia de migración; no se trata como
  firma válida.

#### `batcave_typescript_v0`

Firma inequívoca:

- `organization_fingerprint`, `organization_name`, `master_user`,
  `key_fingerprint` y `created_at` presentes;
- ausencia de `org_id`, `owner_id` y `owner`.

Mapeo:

- `organization_fingerprint → organization.legacy_locator`;
- nombre derivable sólo como slug/display, nunca canonical ID;
- `master_user → legacy_authority.owner.subject`;
- `key_fingerprint` se conserva como evidencia histórica; no instala un trust
  anchor sin verificación separada.

#### `supervisor_owner_v0`

Firma inequívoca:

- `owner` y `created_at` presentes;
- ausencia de las firmas completas de Nucleus Go y Batcave TypeScript.

El formato sólo es migrable si `owner` permite obtener inequívocamente
`source`, `subject` y display name opcional. Como el validador actual acepta
cualquier valor bajo `owner`, una forma escalar u objeto incompleto se rechaza
por insuficiente y no se completa por inferencia.

#### `governance_spec_v2_documented`

Firma inequívoca:

- `version == "2.0"`;
- `organization_fingerprint`, `owner`, `roles` y `team_members` presentes;
- ausencia de `schema` canónico.

El owner se normaliza sólo si contiene ID no vacío. `roles.architect` y cualquier
otro rol documental se conservan como evidencia histórica y no conceden
autoridad. Fingerprints y public keys no se aceptan como trust binding sin el
proceso de §11.

#### `batcave_architecture_documented_v1`

Firma inequívoca:

- `organization_fingerprint` y `key_fingerprint` presentes;
- puede incluir `sovereignty_metadata`;
- no satisface la firma completa de `batcave_typescript_v0`.

Esta forma documental no contiene owner suficiente. Sólo puede aportar locator
y evidencia histórica; no puede producir un ownership canónico productivo sin
otra fuente coherente.

### 20.9 Ambigüedad y contradicción

Se rechaza sin escritura cuando:

- un objeto satisface más de una firma legacy;
- contiene `schema` desconocido o versión no soportada;
- mezcla `owner` con `owner_id`/`owner_name` y no son demostrablemente
  equivalentes;
- `master_user` contradice el owner de otra fuente;
- `org_id`, fingerprint, slug o path se presentan como equivalentes sin binding;
- `organization_fingerprint` no coincide con el locator esperado;
- canonical ID, issuer o installation ID contradicen un binding aceptado;
- falta información obligatoria y completarla exigiría inferencia;
- timestamps son inválidos;
- el formato contiene roles o markers desconocidos que se pretenden usar para
  autorización.

Si ya existe binding aceptado, una contradicción produce estado `DIVERGENT` y no
sobrescribe el archivo canónico válido.

### 20.10 Procedimiento durable de migración

```text
1. adquirir lock exclusivo de migración
2. leer bytes originales una sola vez
3. calcular SHA-256 de origen
4. clasificar exactamente un formato
5. normalizar sólo hechos demostrables
6. verificar coherencia con config, blueprint y binding existente
7. construir objeto canónico completo
8. validar schema y matriz modo/binding
9. escribir archivo temporal en el mismo filesystem
10. sincronizar archivo temporal
11. reemplazar atómicamente .ownership.json
12. sincronizar directorio cuando la plataforma lo permita
13. releer y validar bytes persistidos
14. registrar source format, digest y migration ID
15. liberar lock
```

Ante cualquier error antes del reemplazo, el original permanece intacto. Ante
error posterior, el archivo se considera no verificado y falla cerrado; no se
continúa usando una mezcla en memoria.

La migración es idempotente:

- un archivo canónico válido no se reescribe;
- repetir el mismo origen produce el mismo objeto normalizado salvo timestamps
  de operación, que se conservan desde el primer éxito;
- un mismo migration ID con distinto source digest es conflicto;
- no existe downgrade automático a un formato legacy.

La evidencia original debe conservarse en un registro de migración separado del
archivo operativo. Esta ronda no fija el filename o store de ese registro.

### 20.11 Matriz de consumidores

| Consumidor | Forma actual | Comportamiento transitorio | Comportamiento final |
|---|---|---|---|
| Nucleus ownership | `org_id`, `owner_id`, `owner_name`, `team_members[]` | Clasifica `nucleus_go_v0`, migra y usa `legacy_authority` sólo según modo | Lee sólo schema canónico; en remote no usa legacy para autorizar |
| Nucleus guards | `.master`/`.specialist` y `GetUserRole()` | Continúan únicamente en local/shadow productivo | Consultan decisión efectiva; markers no conceden autoridad |
| Nucleus blueprint | `org_identity.org_id`, owner GitHub y `Architect` legacy | Verifica coherencia; `org_id` queda como legacy hasta binding; Architect no concede | Referencia canonical ID/binding; permiso exacto reemplaza rol hardcodeado |
| Supervisor/SynapseSimulator | exige `owner` + `created_at` | Usa el owner canónico dentro de `legacy_authority` | Valida schema/binding; no interpreta owner como autoridad |
| Batcave resolver | fingerprint, nombre, master y key fingerprint | Migra `batcave_typescript_v0`; usa locator sólo para discovery | Transporta según canonical ID + installation ID; no decide roles |
| Batcave bootstrap | escribe schema propio | Deja de crear una segunda forma; produce candidato para migración/binding | No escribe autoridad; participa sólo en transporte de binding |
| Metamorph rollout | valida subset Go | Acepta canónico validando estructura e identidad sin interpretarla | Preserva ownership/binding/cutover como durable state |
| Conductor/onboarding | usa slug, workspace y GitHub | Slug continúa como UX; no se convierte en canonical ID | Registra selección y estado de binding; no concede autoridad |

### 20.12 Impacto sobre otras unidades físicas

#### Binding state

`.ownership.json` proyecta el estado necesario para bootstrap, pero la decisión
durable de binding sigue perteneciendo a Nucleus. Una edición manual que no
coincide con esa decisión produce divergencia.

#### Installation ID y targeting

`installation.installation_id` debe coincidir con el binding y con la audience
firmada del snapshot. Cambiarlo localmente no redirige autoridad.

#### Issuer y confianza inicial

`binding.issuer_id` y `trust_binding` sólo se completan después del proceso de
confianza de §11. Migrar `key_fingerprint` legacy nunca equivale a aceptar un
issuer.

#### Accepted projection

No se almacena dentro de `.ownership.json`. El archivo puede referenciar la
organización vinculada, pero no copiar memberships, roles o assignments remotos.

#### High-water mark

No se almacena dentro de `.ownership.json`. Debe sobrevivir aunque este archivo
sea restaurado o eliminado.

#### Cutover floor

El modo visible y `remote_locked_at` deben concordar con el cutover floor durable
de Nucleus. Si ownership declara una etapa inferior, prevalece el floor y se
reporta manipulación/downgrade.

### 20.13 Invariantes de ownership

#### OWN-INV-001 — Una forma canónica

Después de migrar, sólo `schema=bloom.organization.ownership` versión `1.0` es
válido como ownership operativo.

#### OWN-INV-002 — Slug y locator no identifican

Ninguna coincidencia de slug, path o `bloom:org:{slug}` completa
`canonical_id` ni acepta binding.

#### OWN-INV-003 — Owner legacy no es principal remoto

Normalizar owner conserva identidad histórica; no crea principal, membership,
assignment o permiso.

#### OWN-INV-004 — Binding resistente a edición

Modificar canonical ID, installation ID, issuer o trust binding localmente
produce divergencia y no cambia el binding aceptado.

#### OWN-INV-005 — Sin autoridad legacy post-cutover

En `remote_enforced`, owner, members, roles, `.master`, `.specialist` y cualquier
lector legacy carecen de capacidad de concesión.

#### OWN-INV-006 — Rollback no reduce autoridad mode

Restaurar ownership anterior no reduce cutover floor, high-water mark o estado
`REMOTE_LOCKED`.

#### OWN-INV-007 — Ambigüedad fail-closed

Un formato que satisface cero o múltiples firmas se rechaza sin mutación.

#### OWN-INV-008 — Migración idempotente

Repetir una migración confirmada no altera identidad, binding, authority mode o
evidencia original.

#### OWN-INV-009 — Visión organizacional consistente

Después de normalizar, Nucleus, Supervisor, Batcave, Metamorph y Conductor
observan el mismo canonical ID y distinguen los mismos locators legacy.

#### OWN-INV-010 — Separación de estado

Ownership no contiene accepted projection, high-water mark ni decisión efectiva.

#### OWN-INV-011 — Source evidence preservada

La migración conserva formato y digest de origen; nunca atribuye al archivo
legacy evidencia que no contenía.

#### OWN-INV-012 — Modo y binding no se colapsan

`REMOTE_LOCKED` sigue siendo estado de binding y `remote_enforced` modo de
autoridad. Ambos deben formar una combinación válida sin convertirse en un solo
flag.

### 20.14 Criterios futuros de prueba

La implementación deberá incluir, como mínimo:

1. fixture Nucleus Go válido;
2. fixture Batcave TypeScript válido;
3. fixture Supervisor owner estructurado válido;
4. fixture Governance Spec v2 documental;
5. fixture Batcave Architecture documental;
6. rechazo de formato desconocido;
7. rechazo de objeto que satisface dos firmas;
8. rechazo de owner y owner_id divergentes;
9. rechazo de canonical ID contrario al binding;
10. rechazo de locator tratado como canonical ID;
11. migración exitosa de cada formato con información suficiente;
12. rechazo sin mutación de formatos insuficientes;
13. reejecución idempotente;
14. crash antes del rename conserva original;
15. crash después del rename detecta estado no verificado;
16. verificación posterior de bytes persistidos;
17. source digest y migration ID preservados;
18. todos los consumidores resuelven el mismo canonical ID;
19. marker Master funciona únicamente en `local_legacy`/shadow productivo;
20. marker, owner y team member no elevan autoridad en `remote_enforced`;
21. restore legacy no reduce cutover floor;
22. editar installation ID o issuer produce divergencia;
23. ownership no modifica accepted projection ni high-water mark;
24. `REMOTE_LOCKED + remote_enforced` es la única combinación de cutover
    saludable.

## 21. Threat controls del diseño

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

## 22. Criterios de aprobación del diseño

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
13. schema canónico de `.ownership.json` y owner legacy único.
14. normalización temporal estricta de los cinco formatos relevantes.
15. prohibición post-cutover de toda autoridad ownership/marker legacy.
16. separación durable de ownership, accepted projection, high-water mark y
    cutover floor.

## 23. Referencias normativas

- RFC 8259 — The JavaScript Object Notation Data Interchange Format.
- RFC 7493 — The I-JSON Message Format.
- RFC 8785 — JSON Canonicalization Scheme.
- RFC 8032 — Edwards-Curve Digital Signature Algorithm.
- RFC 4648 — Base-N Encodings.
- RFC 3339 — Date and Time on the Internet.
- RFC 6455 — The WebSocket Protocol.

## 24. Regla de continuidad

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
