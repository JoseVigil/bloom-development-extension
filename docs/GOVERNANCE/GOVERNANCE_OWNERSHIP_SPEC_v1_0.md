# GOVERNANCE_OWNERSHIP_SPEC.md

> Fuente de verdad sobre gobernanza de identidad, propiedad (`ownership`) y
> roles del ecosistema Cognituum/Bloom. Nace como primer documento de la
> categoría **Governance**, separada de BTIPS (intención/arquitectura de
> producto) y de `AUTHORITY_BOUNDARY.md` (límite de autoridad sobre
> credenciales de terceros). Este documento cubre la capa que ninguno de los
> dos cubre: **quién es dueño de qué organización, con qué esquema se
> registra, dónde vive ese registro, y qué evidencia real del código
> respalda cada afirmación.**

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-08-07 | Primera versión. Consolida el hallazgo de que `.ownership.json` no se genera en ningún flujo automático (confirmado contra `nucleus/internal/governance/ownership.go`, `nucleus/internal/supervisor/onboarding_synapse_simulator.go`, `milestone-registry.js` y `nucleus.json` real post-onboarding). Define el esquema canónico único, el path canónico único, y dos invariantes nuevas de Alfred. **Pendiente de reconciliar contra `nucleus/docs/GOVERNANCE.md` y `nucleus-governance.json`**, cuyo contenido todavía no fue revisado en este proceso — ver §7. |

---

## §0. Precedencia

Este documento es la fuente de verdad para todo lo relativo a: esquema de `.ownership.json`, su ubicación canónica, quién y cuándo lo escribe, y el modelo de roles (Master/Architect/Specialist) a nivel de organización.

- Tiene precedencia sobre las secciones de `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`, `BTIPS-VAULT-MULTIKEY-ANALYSIS.md`, `VAULT_SYSTEM_TECHNICAL_SPECIFICATION.md` y `BATCAVE_ARCHITECTURE.md` que describan un esquema o ubicación de `.ownership.json` distinto al fijado en §2 y §3.
- **No** tiene precedencia sobre `AUTHORITY_BOUNDARY.md` en materia de captura/almacenamiento de credenciales de terceros — ese límite sigue siendo autoridad exclusiva de ese documento.
- Queda explícitamente **subordinado a revisión** frente a `nucleus/docs/GOVERNANCE.md` y `nucleus-governance.json`, ambos existentes en el repo pero no leídos todavía en el proceso que produjo esta v1.0 (ver §7, Nota de honestidad).

---

## §1. Scope — qué va en `nucleus.json` y qué va en `.ownership.json`

| | `nucleus.json` | `.ownership.json` |
|---|---|---|
| **Qué describe** | El instalador: una máquina, sus binarios, sus rutas, el progreso de onboarding | La identidad soberana: quién es dueño de qué organización, con qué credenciales y roles |
| **Alcance** | Por máquina (una instalación de BloomNucleus) | Por organización (`.nucleus-{organization}/.ownership.json`) |
| **Existe desde** | Antes de que haya ninguna organización onboardeada | Recién cuando el onboarding de *esa* organización cierra |
| **Quién debería escribirlo** | El instalador / Nucleus CLI | Nucleus (`internal/governance/ownership.go`), no Brain — ver §6 |
| **Multi-organización** | Necesita `organizations[]`: mínimo por-org (`workspace_org`, `workspace_path`, `project_path`) + puntero a su `.ownership.json` | Un archivo por organización, nunca un array — cada organización tiene el suyo, físicamente separado |

`nucleus.json` no es, y nunca debió ser, la fuente de identidad. Es el índice de qué organizaciones existen y dónde están. `.ownership.json` es la autoridad real.

---

## §2. Ubicación canónica

```
<nucleusRepoRoot>/.bloom/.nucleus-{organization}/.ownership.json
```

Esta es la ruta que usan, de forma independiente y coincidente, tanto `onboarding_synapse_simulator.go` (`getOwnershipPath()`, modo `GOVERNANCE`) como `BATCAVE_ARCHITECTURE.md` (§3/§4.1). Es la única ruta con dos fuentes independientes de acuerdo — por eso se fija como canónica.

**Ruta que se descarta explícitamente:** `$HOME/.bloom/.nucleus/ownership.json` (sin guion, sin organización, sin punto inicial), que es la que hoy escribe `GetOwnershipPath()` en `ownership.go`. Esta ruta es incompatible con multi-organización por diseño (no hay lugar para distinguir de qué organización es) y no es la que lee SynapseSimulator. `ownership.go` debe migrar a la ruta canónica — ver §6.1.

**Simulación:** `getOwnershipPath(simulation=true, ...)` apunta a `installer/nucleus/scripts/simulation_env/.bloom/.ownership.json`, un fixture estático del repo. Esta ruta es válida *únicamente* en modo `SIMULATION` explícito y nunca debe ser alcanzable desde un flujo real ni desde el arranque por defecto de ningún componente (ver invariante GOV-INV-004 en §5).

---

## §3. Esquema canónico

Consolidado a partir de los **cuatro** esquemas reales encontrados en el proceso de auditoría (dos en documentos de diseño, dos en código Go real — `ownership.go` y el validador de `onboarding_synapse_simulator.go`), ninguno de los cuales coincidía con otro:

```json
{
  "version": "2.0",
  "organization_fingerprint": "bloom:org:acme",
  "organization_name": "acme",
  "owner": {
    "id": "github_username_o_email",
    "name": "Nombre para mostrar"
  },
  "key_fingerprint": "sha256:...",
  "public_key": "{...jwk...}",
  "created_at": "2026-08-07T00:00:00Z",
  "github_app_installation_id": "987654",
  "roles": {
    "master": ["owner_id"],
    "architect": [],
    "specialist": []
  },
  "team_members": [
    {
      "id": "github_id",
      "name": "Nombre",
      "role": "specialist",
      "added_at": "2026-08-07T00:00:00Z",
      "active": true
    }
  ],
  "api_keys_registry": {
    "fingerprint_sha256": {
      "provider": "gemini",
      "registered_at": "2026-08-07T00:00:00Z",
      "registered_by": "owner_id"
    }
  },
  "sovereignty_metadata": {
    "sovereign_machine_id": "",
    "authority_chain": []
  }
}
```

Notas de fusión:
- `owner` (objeto) reemplaza a `owner_id`/`owner_name` sueltos de `ownership.go` **y** satisface el campo plano `"owner"` que `validateOwnershipFile()` exige en `onboarding_synapse_simulator.go` — se resuelve dando `owner` como objeto pero garantizando que la clave de primer nivel se llame exactamente `owner` (no `owner_id`), que es lo único que el validador de SynapseSimulator realmente chequea hoy (`owner`, `created_at`).
- `created_at` pasa de `time.Time` (formato Go) a ISO-8601 string explícito, para que sea legible cross-lenguaje (Go, Python, JS) sin depender de un unmarshaller específico.
- `team_members` viene de `ownership.go` (`AddTeamMember`/`Member`).
- `roles` viene de la v6.0 original de BTIPS.
- `api_keys_registry` viene de `BTIPS-VAULT-MULTIKEY-ANALYSIS.md`.
- `organization_fingerprint`, `organization_name`, `github_app_installation_id`, `sovereignty_metadata` vienen de `BATCAVE_ARCHITECTURE.md`.
- `SignedHash` de `ownership.go` se retira del nivel raíz: hoy se genera vacío (`""`) y nunca se completa en ningún punto del código visto — es una promesa sin implementación. Si se recupera, debe ir en `sovereignty_metadata`, no en el nivel raíz, y su generación debe documentarse en una futura revisión de este documento antes de reactivarse.

---

## §4. Causa raíz confirmada — por qué `.ownership.json` no existe hoy

Evidencia, no hipótesis, cruzando tres archivos reales:

1. **`ownership.go`** solo escribe el archivo a través de `SaveOwnership()`, invocado exclusivamente por el comando CLI manual `nucleus init --github-id X --master` (bloque `init()` → `core.RegisterCommand("GOVERNANCE", ...)`). No existe ningún listener de eventos, ningún hook de onboarding, ninguna llamada automática hacia esta función desde Conductor, Cortex o Brain.
2. **`milestone-registry.js`** marca el step `vault_init` como completo (`verify: "json_field"` sobre `onboarding.vault_initialized`) apenas llega el evento `VAULT_INITIALIZED`/`VAULT_INIT` desde Cortex. Este flujo nunca toca Go y nunca toca `ownership.go`.
3. **Resultado**: dos sistemas — "onboarding cree que terminó" y "identidad de organización registrada" — corren en paralelo sin cruzarse jamás. Un onboarding puede completar el 100% de sus steps sin que `nucleus init` se haya ejecutado ni una sola vez.

Esto es la misma clase de bug, documentada por segunda vez en este ecosistema, que el ya confirmado en `project_create`/`genesis.mandate` ("el binario Go nunca escribía [el marcador] — causa raíz confirmada con `find` real contra el filesystem", comentario en `milestone-registry.js`).

**Fix pendiente (no incluido en el alcance de esta semana):** enganchar `SaveOwnership()`/`CreateInitialOwnership()` como reacción real al evento `VAULT_INITIALIZED` recibido por Nucleus, en vez de depender de invocación manual del CLI.

---

## §5. Invariantes

| ID | Invariante | Evidencia / motivo |
|---|---|---|
| GOV-INV-001 | `.ownership.json` es un archivo por organización; nunca un array ni un registro global en `$HOME` | §2 — incompatibilidad de la ruta legacy de `ownership.go` con multi-org |
| GOV-INV-002 | Ningún milestone de onboarding puede marcarse `completed` verificando solo un campo booleano en `nucleus.json`; todo artefacto de gobernanza declarado como `produces` debe verificarse con `fs_marker` real contra el archivo en disco | §4 — precedente doble: `genesis.mandate` y `.ownership.json` |
| GOV-INV-003 | Una instalación de GitHub App por organización, sin instalaciones compartidas (heredado, ver `BATCAVE_ARCHITECTURE.md` `INVARIANT-ORG-008`) | Confirmado por el usuario como la única excepción a recursos reusables entre organizaciones |
| GOV-INV-004 | Ningún componente que audite o apruebe intents (Alfred u otro) puede arrancar contra `simulation_env`/fixtures sin una bandera explícita y visible en su salida de arranque | `alfred.go::NewAlfred()` cae a `scripts/simulation_env/.bloom/.nucleus-bloom-labs` en silencio si `BLOOM_NUCLEUS_ROOT` no está seteada |
| GOV-INV-005 | Los roles (`master`/`architect`/`specialist`) declarados en `.ownership.json` deben ser la fuente real de autorización de cualquier acción administrativa; una función de verificación de rol que retorna éxito incondicional es una brecha de gobernanza, no un placeholder aceptable en producción | `RequireAtLeast()`/`RequireMaster()` en `alfred_server.go` son stubs (`return nil`) sin conexión a `.ownership.json` |

---

## §6. Brechas conocidas — no se resuelven en esta versión, quedan documentadas a propósito

1. **`nucleus init` es manual, no reactivo.** Ver §4. Se agenda para después del MVP de Alfred de esta semana.
2. **`ownership.go` escribe en la ruta legacy, no en la canónica de §2.** Requiere migración de `GetOwnershipPath()`.
3. **El esquema de `ownership.go` (`OwnershipRecord`) no coincide con el validador de `onboarding_synapse_simulator.go` (`validateOwnershipFile`)** — ni siquiera en el caso feliz de ejecución manual, el archivo resultante pasaría la validación de SynapseSimulator tal como está hoy. Se resuelve migrando `ownership.go` al esquema de §3.
4. **Roles no conectados a autorización real** — GOV-INV-005 arriba. `alfred.go` autoriza hoy únicamente por posesión de la "constitución" (`.rules.bl` + `.ai_bot.sovereign.bl`) y un `golden_key`/`extension_id` de `nucleus-governance.json` (el "blueprint" — un tercer archivo, distinto de `.ownership.json` y no cubierto todavía por este documento).
5. **`SignedHash` en `ownership.go` nunca se completa** — ver nota en §3.

Ninguna de estas cinco bloquea el demo de Alfred de esta semana (que audita intents contra la constitución, no contra `.ownership.json`). Se listan para que no se pierdan de vista una vez que el demo esté listo.

---

## §7. Nota de honestidad sobre el alcance de esta versión

Esta v1.0 se escribió **sin haber leído todavía** `nucleus/docs/GOVERNANCE.md`, `nucleus/docs/EXECUTIVE_SUMMARY.md`, `nucleus/docs/NUCLEUS_README.md` ni `nucleus-governance.json` (el "blueprint" que carga `alfred.go` vía `loadGovernanceConfig()`). Estos archivos existen en el repo y es posible que alguno de ellos ya pretenda ser la fuente de verdad de gobernanza, con contenido que se solape o contradiga lo fijado acá.

Este documento debe tratarse como v1.0 provisional hasta que esa lectura ocurra. Cuando se haga, corresponde una v1.1 que declare explícitamente cómo se reconcilia (o cuál reemplaza a cuál) — no una fusión silenciosa.

---

## §8. Próxima revisión — condiciones de disparo

Se agenda v1.1 cuando ocurra cualquiera de:
- Se lea `nucleus/docs/GOVERNANCE.md` / `nucleus-governance.json` (ver §7).
- Se implemente el fix de §4 (enganche automático de `SaveOwnership()`).
- Se defina el addendum de Device Flow pendiente en `AUTHORITY_BOUNDARY.md` (afecta indirectamente a `github_app_installation_id` en el esquema de §3).
- Se decida la estrategia real de `organizations[]` en `nucleus.json` para multi-organización (este documento fija el esquema de destino, no la migración).
