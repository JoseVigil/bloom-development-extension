# Executor E0 — Decision Package para Architecture

**Estado:** SOLICITA DECISIONES — no autoriza implementación  
**Fecha:** 2026-08-20  
**Owner solicitante:** EXECUTOR  
**Aprobadores requeridos:** Architecture y José

## 0. Decisiones canónicas nuevas ya incorporadas

- Mandate Genesis se compone de `ing → dis → doc → exp → [dev] → exp` y sólo
  completa con los estados canónicos definidos por el dominio Mandate.
- `exp/` es evaluación; no se crea un intent `evaluation`.
- CLI Nucleus/Brain es el primer canal, pero no cambia contratos ni ownership.
- Synapse/Synapse Simulator no bloquean el primer vertical.
- `action_id` se incorpora a la correlación Execution.
- AITAP sigue seleccionando runtime abstracto; Executor sólo resuelve la
  instalación compatible del target ya seleccionado.

Estas decisiones no se someten nuevamente a D01-D12. Las preguntas siguientes
se limitan a mecanismos que continúan abiertos.

## 1. Decisiones solicitadas

### E0-D01 — Aprobar el paquete E0

- **Pregunta:** ¿el conjunto E0 es suficiente para iniciar migración y E1?
- **Contexto:** ownership está cerrado; implementación sigue `NOT_RUN`.
- **Opciones:** aprobar; aprobar con condiciones; rechazar y devolver gaps.
- **Recomendación:** aprobar con las condiciones de `CAF-032` y decisiones
  siguientes explícitamente abiertas.
- **Riesgos:** una aprobación ambigua podría interpretarse como Gate de runtimes.
- **Impacto contractual:** habilita materializar schemas/DTOs, no aprobarlos.
- **Impacto seguridad:** ninguno si se preservan gates.
- **Decisión solicitada:** estado de `EXEC-G0-DESIGN`.
- **Blocker:** E1.
- **CAF:** `CAF-051`; cierre propuesto con links E0.

### E0-D02 — Normalizar nombres de gates

- **Pregunta:** ¿se adoptan IDs `EXEC-G0..G6` independientes de letras legacy?
- **Contexto:** Application/Implementation y Runtime Adapters asignan letras
  diferentes a contratos, contención, promoción y conformidad.
- **Opciones:** IDs estables propuestos; renumerar toda norma; conservar drift.
- **Recomendación:** IDs estables y aliases documentales; no reescribir historia.
- **Riesgos:** automation y handoffs pueden saltar un gate por nombre ambiguo.
- **Impacto contractual:** añade `gate_id` estable a manifests/reports futuros.
- **Impacto seguridad:** alto para containment/promotion.
- **Decisión solicitada:** aprobar tabla §3.
- **Blocker:** E1 pipeline y E3+.
- **CAF:** propuesta nueva posterior a `CAF-052` si Architecture la acepta.

### E0-D03 — Ownership de `service install/uninstall`

- **Pregunta:** ¿Executor ejecuta estas mutaciones o las delega?
- **Contexto:** árbol solicitado las incluye; Setup posee instalación/ACL/service.
- **Opciones:** Executor instala; delega a Setup; quitar comandos.
- **Recomendación:** conservar superficie catalogada y delegar a Setup mediante
  contrato autenticado; hasta existir, responder `OPERATION_DELEGATED`.
- **Riesgos:** autoelevación y duplicación de installers.
- **Impacto contractual:** Delegation Result y operación Setup futura.
- **Impacto seguridad:** crítico por privilegios de SCM/ACL.
- **Decisión solicitada:** confirmar delegación.
- **Blocker:** implementación SERVICE E1/E8.
- **CAF:** propuesta nueva.

### E0-D04 — Store de journal/CAS/fencing

- **Pregunta:** ¿qué backend durable se aprueba para v1?
- **Contexto:** requiere CAS, transacciones, restart recovery y monotonic fence.
- **Opciones:** SQLite embebido; append log + lock protocol; store Nucleus remoto.
- **Recomendación:** SQLite local endurecido, single-writer y migraciones
  versionadas; Nucleus conserva authority, no lifecycle técnico.
- **Riesgos:** corrupción, locks, split brain, dependencia indebida de Nucleus.
- **Impacto contractual:** repository interno; no cambia contratos externos.
- **Impacto seguridad:** fence durability y idempotencia.
- **Decisión solicitada:** autorizar PoC fake/store en E2.
- **Blocker:** state/journal E2 y promotion.
- **CAF:** propuesta nueva.

### E0-D05 — Bridge Nucleus Grant → Executor

- **Pregunta:** ¿cómo verifica Executor autenticidad, scope, expiry y revocación?
- **Contexto:** ownership está cerrado, mecanismo no.
- **Opciones:** JWT/COSE firmado; IPC online; referencia + fetch autenticado.
- **Recomendación:** referencia opaca + fetch autenticado y documento firmado
  verificable/cachable hasta expiry; revocación online antes de promotion.
- **Riesgos:** replay, offline stale grant, Nucleus convertido en scheduler.
- **Impacto contractual:** Grant Verification Request/Result fuera de Execution.
- **Impacto seguridad:** crítico.
- **Decisión solicitada:** Architecture/Security define formato y trust roots.
- **Blocker:** submit real, credentials y promotion.
- **CAF:** enlaza `CAF-010`, `CAF-032`; propuesta nueva específica.

### E0-D06 — Credential proxy y password OpenCode

- **Pregunta:** ¿quién emite token proxy y password efímero del worker?
- **Contexto:** Vault custodia; Executor materializa attempt; global `:4096` es
  inseguro y corre como `LocalSystem`.
- **Opciones:** Vault emite ambos; Executor genera worker password y Vault token;
  Setup mantiene password global.
- **Recomendación:** Executor genera auth efímera local del worker; Vault emite
  credential handle/token por audience attempt. Ningún password global.
- **Riesgos:** leakage, reuse cross-attempt, logs.
- **Impacto contractual:** Credential Handle y redaction report.
- **Impacto seguridad:** crítico.
- **Decisión solicitada:** Security/Vault approval.
- **Blocker:** adapter OpenCode E4.
- **CAF:** `CAF-041` y decisión pendiente OpenCode.

### E0-D07 — Rol de Synapse Simulator

- **Pregunta:** ¿Runtime Port fake o Cognitive Counterpart exclusivamente?
- **Contexto:** fuentes lo ubican de ambas maneras en recovery.
- **Opciones:** adapter fake formal; counterpart; dos artefactos explícitos.
- **Recomendación:** no usar el producto Synapse Simulator como runtime; crear
  `fake_runtime` interno de conformance. Si se desea integración Synapse, work y
  contrato separados.
- **Riesgos:** excepción contractual y falsa conformidad.
- **Impacto contractual:** matriz EXC usa fake port, no identidad Synapse.
- **Impacto seguridad:** evita bypass de containment.
- **Decisión solicitada:** Architecture.
- **Blocker:** fixture EXC-007/008.
- **CAF:** `CAF-038`; propuesta de aclaración.

### E0-D08 — Cierre secuencial de CAF-032

- **Pregunta:** ¿qué mappings debe cerrar Brain antes de Package v2 final?
- **Contexto:** drift `.raw_output.txt/.json` y pipeline E2E incompleto.
- **Opciones:** cerrar todo antes de E1; permitir shell/fake con campos
  condicionados; inferir equivalencias.
- **Recomendación:** permitir E1 shell y E2 core fake; bloquear aprobación final
  del Package/Projection y runtimes reales hasta matriz `dev/ing/dis/doc` y flujo
  probado. Nunca inferir equivalencias.
- **Riesgos:** diseñar contrato que obligue a deformar Brain.
- **Impacto contractual:** campos semánticos Package/Projection condicionados.
- **Impacto seguridad:** acceptance/scope incorrectos.
- **Decisión solicitada:** confirmar gate parcial.
- **Blocker:** Gate contratos completo/runtimes.
- **CAF:** `CAF-032`, `CAF-034`, `CAF-036`, `CAF-037`.

### E0-D09 — URI registry para schema refs

- **Pregunta:** ¿cómo se resuelven `schema://executor/...`?
- **Contexto:** CLI y contratos necesitan refs estables sin paths locales.
- **Opciones:** URI custom + manifest; `$id` HTTPS; embedded registry.
- **Recomendación:** `$id` estable de namespace Cognituum más registry embebido y
  manifest; `schema://` sólo alias interno documentado si se aprueba.
- **Riesgos:** refs rotas y catálogos no portables.
- **Impacto contractual:** todos los schemas/CLI metadata.
- **Impacto seguridad:** validación debe impedir schema substitution.
- **Decisión solicitada:** Architecture/Contracts.
- **Blocker:** schemas v2 y help catalog final.
- **CAF:** propuesta nueva.

### E0-D10 — Backend de promoción atómica

- **Pregunta:** ¿estrategia Windows/Linux/macOS para atomic apply/rollback?
- **Contexto:** múltiples archivos no tienen transacción filesystem universal.
- **Opciones:** staged tree + atomic root swap; per-file journal/rollback;
  worktree/commit controlado.
- **Recomendación:** E2 fake y E3 PoC Windows comparan staged tree swap cuando el
  root lo permita versus journal per-file; no decidir por conveniencia.
- **Riesgos:** estado parcialmente aplicado y carrera con usuario.
- **Impacto contractual:** Promotion Result/rollback refs.
- **Impacto seguridad:** crítico.
- **Decisión solicitada:** aprobar experimento y criterio, no backend todavía.
- **Blocker:** `EXEC-G4-PROMOTION`.
- **CAF:** `CAF-045`; propuesta nueva de implementación.

### E0-D11 — Source of truth del catálogo CLI

- **Pregunta:** ¿se versionan los artefactos generados y quién actualiza?
- **Contexto:** norma BTIPS exige `installer/help/executor_help.{txt,json}`.
- **Opciones:** sólo CI artifact; archivos versionados; generación en build local.
- **Recomendación:** archivos versionados, generados desde binario compilado en
  build script; CI regenera en temp y falla por diff. Nunca edición manual.
- **Riesgos:** drift o builds que modifican worktree inesperadamente.
- **Impacto contractual:** catálogo `cognituum.cli.catalog/v1`.
- **Impacto seguridad:** comandos ocultos/mutaciones no catalogadas.
- **Decisión solicitada:** Setup/Architecture.
- **Blocker:** E1 acceptance.
- **CAF:** propuesta nueva.

### E0-D12 — Frontera Action → Executor por tipo de Intent

- **Pregunta:** ¿qué escrituras/checks de `ing`, `doc` y `exp` son persistencia
  interna Brain y cuáles son actuación local delegable?
- **Contexto:** el action graph Genesis ya está cerrado; el primer milestone es
  `ing`, pero no todo artefacto BISP debe pasar por Executor.
- **Opciones:** todo filesystem por Executor; sólo remediación `dev`; matriz
  explícita por operación y capability.
- **Recomendación:** matriz explícita basada en productores/call sites reales;
  `dev` es el caso principal, otros intents delegan únicamente efectos externos
  aprobados. No inferir desde extensión o path.
- **Riesgos:** Executor absorbe lifecycle Brain o Brain evita governance para
  efectos reales.
- **Impacto contractual:** `action_id`, operation class y capability mapping.
- **Impacto seguridad:** scope/authority incorrectos.
- **Decisión solicitada:** cerrar como parte secuencial de `CAF-032`.
- **Blocker:** integración real del primer vertical con Executor.
- **CAF:** `CAF-032` y propuesta de finding específico si surge contradicción.

## 2. Blockers consolidados

| ID | Blocker | Bloquea | Owner de resolución |
|---|---|---|---|
| B-01 | E0 sin aprobación | migración/E1 | José + Architecture |
| B-02 | `CAF-032` incompleto | Package/Projection final y runtimes | Brain/Architecture |
| B-03 | gates con letras en drift | pipeline seguro | Architecture |
| B-04 | Grant bridge no definido | submit/promotion | Nucleus/Security |
| B-05 | store CAS/fence no aprobado | E2 recovery | Executor/Architecture |
| B-06 | credential proxy/auth worker | OpenCode E4 | Vault/Security/Executor |
| B-07 | containment no probado | repos reales | Executor/Security |
| B-08 | promotion backend no probado | canonical writes | Executor/Architecture |
| B-09 | OpenCode source path roto | rollout E2E | Metamorph |
| B-10 | Synapse/fake role abierto | EXC recovery fixture | Architecture |
| B-11 | schema URI registry abierto | v2/help final | Architecture |
| B-12 | ningún runtime conforme | producción runtime | Executor/Architecture |
| B-13 | frontera Action→Executor no probada por intent | integración Genesis real | Brain/Architecture/Executor |

## 3. Gates normalizados propuestos

| Gate | Precondiciones | Pruebas obligatorias | Evidence | Ejecuta | Aprueba | Prohibido antes del cierre |
|---|---|---|---|---|---|---|
| `EXEC-G0-DESIGN` | fuentes leídas, ownership cerrado | revisión E0, links, cobertura, stop conditions | paquete documental y diff | Executor | José + Architecture | migrar, crear Go, runtimes |
| `EXEC-G1-DEPLOYMENT` | G0; work packages | review Setup/Metamorph, identity/paths/rollback design | approvals y manifests candidatos | Setup/Metamorph | Architecture | registrar servicio real |
| `EXEC-G2-CONTRACTS` | G0; decisiones D04/D05/D09; CAF-032 scope acordado | schemas/goldens/Go validation/fake port/backwards rejection | test reports y schema hashes | Executor + Brain/Temporal/AITAP/Nucleus por frontera | Architecture | runtimes reales |
| `EXEC-G3-CONTAINMENT` | G2; fake lifecycle | traversal/link/hardlink/process/network/home/temp/secret/IPC tests | Evidence firmada de fixture | Executor/Security | Security + Architecture | repos reales |
| `EXEC-G4-PROMOTION` | G3; Grant/fence/preconditions | conflict/race/atomicity/rollback/late result/scope violation | snapshots, hashes, rollback report | Executor | Architecture + Nucleus/Security | escritura canónica |
| `EXEC-G5-RUNTIMES` | G2-G4 según fixture; drivers aprobados | probe/trust/events/cancel/cleanup por adapter en fixture | manifests y adapter reports | Executor | Architecture | Intent gobernado con runtime |
| `EXEC-G6-CONFORMANCE` | G5; CAF-032 cerrado; fixtures aprobados | EXC-001..010, tres corridas por runtime/par | matriz, Results, Evidence | Executor | Architecture | estado `CONFORMANT` |

## 4. Lista exacta de archivos nuevos que E1 crearía

La migración aprobada ocurre en commit previo y no cuenta como creación E1. E1
crearía únicamente el shell siguiente; no crea adapters/brokers funcionales:

```text
installer/executor/go.mod
installer/executor/go.sum
installer/executor/cmd/executor/main.go
installer/executor/internal/app/app.go
installer/executor/internal/app/wiring.go
installer/executor/internal/cli/config.go
installer/executor/internal/cli/help_renderer.go
installer/executor/internal/cli/catalog.go
installer/executor/internal/cli/registry.go
installer/executor/internal/cli/output.go
installer/executor/internal/cli/errors.go
installer/executor/internal/cli/root.go
installer/executor/internal/cli/system_commands.go
installer/executor/internal/cli/service_commands.go
installer/executor/internal/cli/runtime_commands.go
installer/executor/internal/cli/execution_commands.go
installer/executor/internal/cli/evidence_commands.go
installer/executor/internal/cli/conformance_commands.go
installer/executor/internal/config/config.go
installer/executor/internal/config/load.go
installer/executor/internal/config/validate.go
installer/executor/internal/service/service.go
installer/executor/internal/service/health.go
installer/executor/internal/ipc/server.go
installer/executor/internal/ipc/transport.go
installer/executor/internal/ipc/limits.go
installer/executor/internal/auth/caller.go
installer/executor/internal/auth/authorizer.go
installer/executor/internal/telemetry/events.go
installer/executor/internal/telemetry/redaction.go
installer/executor/platform/windows/service.go
installer/executor/platform/linux/service.go
installer/executor/platform/darwin/service.go
installer/executor/scripts/build.ps1
installer/executor/scripts/build.sh
installer/executor/scripts/generate-help.ps1
installer/executor/scripts/generate-help.sh
installer/executor/scripts/verify-help.ps1
installer/executor/scripts/verify-help.sh
installer/executor/internal/cli/catalog_test.go
installer/executor/internal/cli/help_renderer_test.go
installer/executor/internal/cli/output_test.go
installer/executor/internal/config/config_test.go
installer/executor/internal/service/health_test.go
installer/executor/internal/ipc/server_test.go
```

E1 además generaría, nunca escribiría manualmente:

```text
installer/help/executor_help.txt
installer/help/executor_help.json
```

Los command handlers de E1 devolverán estados `TARGET/NOT_RUN` o información
real del shell; no simularán ejecución, runtime health o conformidad.

## 5. Solicitud formal

Se solicita a Architecture revisar D01-D11 y a José aprobar, condicionar o
rechazar `EXEC-G0-DESIGN`. Ninguna decisión de este documento se considera
cerrada por haber sido recomendada.
