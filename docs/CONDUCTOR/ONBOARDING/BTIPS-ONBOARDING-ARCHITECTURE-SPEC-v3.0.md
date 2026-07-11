# BTIPS-ONBOARDING-ARCHITECTURE-SPEC-v3.0

**Versión:** v3.0.0
**Fecha:** 10 de julio de 2026
**Estado:** SSOT documental vigente del módulo de Onboarding — BTIPS

---

> ## ⚠️ Este documento reemplaza y da por obsoletos de forma definitiva a:
> - `Guia-Maestra-Stepper-Onboarding-v2_2.md` (7 de julio de 2026)
> - `BLOOM_ONBOARDING_WORKFLOW_SPEC_v2_3.md` (29 de junio de 2026)
>
> Ambos documentos quedan retirados y **no deben consultarse** a partir de esta fecha. Ninguno de los dos reflejaba la migración a GitHub App/Device Flow, lo cual generó un bug bloqueante silencioso en producción (ver §1.3). Este documento es la única fuente de verdad documental del onboarding de aquí en adelante.

**Origen:** consolidación de la auditoría de código del 10/07/2026 + la migración a GitHub App/Device Flow implementada en la misma fecha sobre `onboarding_steps.json` y `onboarding-handlers.js`.

**Convención de este documento:** cada afirmación está marcada como **✅ Verificado en código** (se leyó el archivo fuente línea por línea) o **🔲 Pendiente de auditar** (se infiere de otro archivo o de un comentario, pero el archivo que lo confirmaría no fue provisto todavía). Esta distinción explícita es la que faltaba en los dos documentos que este archivo reemplaza — mezclar ambas categorías sin marcarlas fue la causa raíz de que el drift de Device Flow pasara desapercibido.

---

## 1. Arquitectura e hilo conductor

### 1.1 — Orden real de los steps

```
nucleus_create → vault_init → github_app_auth → google_auth → ai_provider_setup → project_create
                                                  (no bloqueante)  (no bloqueante)
```

✅ **Verificado en código** — `onboarding_steps.json` v3.0.0 y el fallback hardcoded de `milestone-registry.js` (`FALLBACK_STEPS`) coinciden en este orden y en los `requires` de cada step.

| # | Step ID | Requires | Produces | Bloqueante |
|---|---|---|---|---|
| 1 | `nucleus_create` | — | `workspace_path` | Sí |
| 2 | `vault_init` | `workspace_path` | `vault_initialized` | Sí |
| 3 | `github_app_auth` | `vault_initialized` | `github_app_token` | Sí |
| 4 | `google_auth` | `vault_initialized` | `google_account` | No |
| 5 | `ai_provider_setup` | `vault_initialized` | `ai_provider_key` | No |
| 6 | `project_create` | `vault_initialized`, `github_app_token` | `project_mandate` | Sí |

### 1.2 — Por qué el Vault va antes que GitHub (y no al revés, como en el esquema viejo)

✅ **Verificado en código** — este es el cambio de orden más importante respecto a la arquitectura vieja (PAT), donde `github_auth` era el primer step real después de `nucleus_create`.

La razón es un requisito de integridad, no de conveniencia: el token que produce la GitHub App (Device Flow, scopes Contents/Administration/Members) se guarda **dentro del Vault cifrado**, no en texto plano en `nucleus.json`. Guardar un secreto con permisos de push/create-repo requiere que el Vault ya exista y esté inicializado — Nucleus debe completar su `Authorize()` antes de poder tocar el Keyring real. Si `github_app_auth` corriera antes que `vault_init` (como en el esquema PAT viejo), no habría dónde persistir el token de forma segura.

Esto está documentado explícitamente en el comentario de `milestone-registry.js` (líneas 83–96 del archivo auditado) y es consistente con `BTIPS-VAULT-MULTIKEY-ANALYSIS.md v1.1` (🔲 **Pendiente de auditar** — este documento de Vault no fue leído en esta sesión, se cita porque `milestone-registry.js` lo referencia como fuente).

Consecuencia directa en `onboarding-handlers.js`: el flag `--override-step` que lanza Chrome vía Discovery ahora arranca en `github_app_auth`, no en `github_auth` — es el primer step de la secuencia que efectivamente necesita el navegador (`nucleus_create` y `vault_init` son locales, sin Chrome de por medio).

### 1.3 — Por qué `github_auth` (PAT) no es una variante de `github_app_auth`, es un step distinto y retirado

✅ **Verificado en código.** No se trata de un rename cosmético: el step viejo verificaba contra tres campos (`github_token_fingerprint`, `github_token_stored`, `vault_github_stored`) y escuchaba los eventos `GITHUB_PAT_DETECTED` / `GITHUB_TOKEN_STORED`. Ninguno de esos campos ni eventos existe en el flujo actual. `github_app_auth` es un step nuevo con su propio `produces` (`github_app_token`) y su propio evento (`GITHUB_APP_AUTHORIZED`) — no hay migración de datos entre uno y otro, son artefactos distintos.

### 1.4 — Por qué `google_auth` y `ai_provider_setup` no son bloqueantes

✅ **Verificado en código** — ambos tienen `blocking: false` en `onboarding_steps.json`. El único requisito real de ambos es `vault_initialized`; no dependen entre sí ni de `github_app_auth`. Esto permite que el usuario complete el onboarding "mínimo" (workspace + vault + GitHub + proyecto) sin necesariamente conectar Google o configurar un proveedor de IA en la primera sesión.

### 1.5 — Mapeo stepper (UI) vs. steps canónicos

🔲 **Pendiente de auditar contra `step-vault.js`** (no provisto). Lo que sí está confirmado: `onboarding.html` define 5 nodos de navegación (`sn-workspace`, `sn-identity`, `sn-providers`, `sn-project`, `sn-mandate`) para 6 step IDs — la explicación es que `vault_init` se intercala dentro del wizard de Identity por `stepId`, no por índice del array de nodos. Esto es consistente con lo que muestra `step-identity.js` (el sub-wizard de Identity conduce de GitHub a `vault_init` y de ahí a `project_create` — ver `advanceIdentityWizard()`), pero la pieza que efectivamente renderiza la pantalla de Vault (`step-vault.js`) no fue auditada todavía.

---

## 2. Mapeo técnico actualizado — eventos Cortex → step ID

✅ **Verificado en código** (`onboarding_steps.json` v3.0.0 + `milestone-registry.js`), salvo donde se indica lo contrario.

| Step ID | Evento(s) Cortex canónico(s) | Campo de verificación | Método |
|---|---|---|---|
| `nucleus_create` | *(ninguno — lo marca el handler IPC local al exit 0 de `nucleus create`, sin pasar por Synapse)* | `onboarding.workspace_path` + marker `.nucleus` | `fs_marker` |
| `vault_init` | `VAULT_INITIALIZED`, `VAULT_INIT` | `onboarding.vault_initialized` | `json_field` |
| `github_app_auth` | **`GITHUB_APP_AUTHORIZED`** (Device Flow) | `onboarding.github_app_token` | `json_field` |
| `google_auth` | `ACCOUNT_REGISTERED:google` (discriminado por campo `service` del payload) | `onboarding.google_account` | `json_field` |
| `ai_provider_setup` | `AI_PROVIDER_CONFIGURED` | `onboarding.ai_provider_key` | `json_field` |
| `project_create` | `PROJECT_CREATED`, `DISCOVERY_COMPLETE` | `onboarding.project_path` + marker `genesis.mandate` | `fs_marker` |

**Puntos a tener presentes sobre esta tabla:**

- **La convención `onboarding.<produces>`** (ej. `github_app_auth` produce `github_app_token` → se verifica en `onboarding.github_app_token`) es la que se aplicó de forma consistente al migrar `onboarding_steps.json` y `onboarding-handlers.js`. **🔲 Pendiente de auditar**: esta convención no fue confirmada contra `milestone-reactor.js` ni `step-verifiers.js` (ninguno de los dos fue provisto todavía) — son los archivos que efectivamente escriben ese campo en `nucleus.json` cuando llega el milestone. Si al auditarlos aparece que el campo real tiene otro nombre, hay que corregir `onboarding_steps.json` y `onboarding-handlers.js` en el mismo commit.
- **`ACCOUNT_REGISTERED:google`** usa la sintaxis `EVENTO:service` que `MilestoneRegistry` interpreta como discriminación por el campo `service` del payload — no es un evento distinto, es el mismo `ACCOUNT_REGISTERED` genérico filtrado por servicio. Esto reemplaza a `GOOGLE_AUTH_COMPLETE`, que según el propio changelog de `synapse-bridge.js` nunca llegó a implementarse.
- **`nucleus_create` es el único step sin evento Cortex** — se completa enteramente en el main process de Electron al recibir exit code 0 del proceso `nucleus create`. Esto es una decisión de diseño confirmada en tres fuentes (código + ambos documentos viejos coincidían en esto, y sigue vigente sin cambios).

---

## 3. Estado de verificación — por step

✅ = confirmado leyendo el código fuente en esta sesión o en la sesión de migración inmediatamente anterior.
🔲 = depende de un archivo no provisto todavía; lo que se afirma es la mejor inferencia disponible, no un hecho verificado.

| Step ID | Estado | Detalle |
|---|---|---|
| `nucleus_create` | ✅ Verificado en código | Marcado por `onboarding:init-nucleus` al exit 0, sin evento Cortex. Sin cambios en esta migración. |
| `vault_init` | ✅ Verificado en código | Confirmado en `synapse-bridge.js` (`VAULT_INITIALIZED`/`VAULT_INIT`) y en el nuevo `onboarding_steps.json`. Requires actualizado (ya no depende de `github_token`, que no existe más). |
| `github_app_auth` | ✅ Verificado en código — esquema | 🔲 Pendiente de auditar — verificación real | `ONBOARDING_STEP_IDS`, `poll-identity` y `onboarding_steps.json` ya están sincronizados al esquema Device Flow. Lo que falta confirmar es si `onboarding.github_app_token` es efectivamente el campo que `milestone-reactor.js`/`step-verifiers.js` escriben — ver §2. |
| `google_auth` | 🔲 Pendiente de auditar | El mapeo a `ACCOUNT_REGISTERED:google` está en `onboarding_steps.json` y en el fallback de `milestone-registry.js`, pero no hay confirmación de que Cortex efectivamente emita ese payload discriminado con `service: "google"` en producción hoy. |
| `ai_provider_setup` | 🔲 Pendiente de auditar | Sin cambios de esquema detectados, pero depende de `step-identity.js` (✅ auditado) y de `milestone-reactor.js` (🔲 no provisto) para confirmar cómo se persiste `ai_provider_key`. |
| `project_create` | ✅ Verificado en código | `onboarding:create-mandate` + evento `PROJECT_CREATED`, sin cambios. `requires` actualizado de `github_token` a `github_app_token` en la migración. |

### 3.1 — Archivos que sustentan lo marcado ✅ en esta sesión

- `synapse-bridge.js` — completo
- `onboarding-handlers.js` — completo, y migrado en esta sesión (v3.0.0)
- `milestone-registry.js` — completo (incluye `FALLBACK_STEPS` ya migrado)
- `step-identity.js` — completo
- `onboarding_steps.json` — completo, y migrado en esta sesión (v3.0.0)
- `workspace-synapse-handlers.js`, `onboarding.html`, `onboarding.js` — auditados en la sesión previa, sin cambios de esquema que los afecten

### 3.2 — Archivos que siguen sin auditar (gap heredado de la sesión anterior, todavía vigente)

Estos son los que hay que conseguir antes de dar el onboarding por cerrado end-to-end:

**Backend de milestones (`onboarding/`):**
- `milestone-reactor.js` — persiste steps completados, dispara `_onOnboardingSuccess()`. **Es el archivo que confirma o refuta la convención `onboarding.<produces>` de la sección 2.**
- `step-verifiers.js` — implementación real de `json_field` / `json_field_any` / `fs_marker`.
- `resolution-engine.js` — calcula el punto de entrada al reanudar sesión (se referencia en `onboarding-handlers.js` vía `resolveEntryPoint`, pero el archivo en sí no fue auditado).

**Steps del renderer (`onboarding/renderer/steps/`):**
- `step-vault.js` — necesario para cerrar el punto §1.5 (mapeo stepper vs. steps canónicos).
- `step-workspace.js`, `step-project.js`, `step-milestone.js`.

**Core del renderer (`onboarding/renderer/core/`):**
- `navigation.js`, `ipc-bridge.js`, `ui-stepper.js`, `notifications.js`, `shared-state.js`, `tab-system.js`.

**Otros:**
- `preload_onboarding.js`, `main_conductor.js`, `core/preload_core.js`, `core/ipc/health-handlers.js`, `core/ipc/profiles-handlers.js`.

---

## 4. Próximos pasos recomendados (orden de bloqueo)

1. **Conseguir `milestone-reactor.js` y `step-verifiers.js`** para confirmar el nombre real del campo que verifica `github_app_auth` (asumido como `onboarding.github_app_token`, ver §2). Es el único punto que quedó como asunción no verificada en la migración de código de esta sesión.
2. **Confirmar `google_auth` contra el evento real que emite Cortex hoy** — ver si `ACCOUNT_REGISTERED:google` efectivamente llega con ese payload en producción, no solo en el código declarado.
3. **Auditar `step-vault.js`** para cerrar §1.5 y confirmar que el mapeo UI (5 nodos) vs. SSOT (6 steps) sigue siendo válido tras el reordenamiento de `vault_init`.
4. **Correr un onboarding real de punta a punta** con una cuenta de GitHub nueva y confirmar en logs que `GITHUB_APP_AUTHORIZED` efectivamente llega, que se escribe `onboarding.github_app_token`, y que el botón "Validate" de `screen-identity` se destraba sin quedar esperando el campo viejo.

---

## 5. Nota sobre `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`

Este documento **no se toca** — es arquitectura general del ecosistema, no específico del onboarding, y no se detectó nada en él que contradiga el código auditado ni la migración de esta sesión.
