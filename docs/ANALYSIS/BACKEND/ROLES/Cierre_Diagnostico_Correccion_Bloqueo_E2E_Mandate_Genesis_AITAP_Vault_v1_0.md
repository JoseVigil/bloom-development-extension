# Cierre de Diagnóstico e Implementación — Bloqueo E2E de Mandate Genesis (AITAP → Nucleus Vault → autoridad Master local) v1.0

**Basado en:** handoff directo de José, "Estado real de Mandate Genesis" — diagnóstico de sólo lectura primero,
implementación recién autorizada tras revisar el hallazgo.
**Implementado por:** Control, directamente, sobre el dispositivo real, a pedido explícito de José tras
aprobar el diagnóstico.
**Verificado por:** Control (código real contra el dispositivo, no el reporte), `go build`/`go vet` corridos
por José en su entorno local, y corrida E2E real (Mandate Genesis contra Anthropic + reinicio de servicios a
mitad de la corrida) ejecutada y reportada por José.

---

## §0 — Qué se cerró

El único bloqueador registrado para aceptar el primer Mandate Genesis real: AITAP no podía resolver la
referencia de credencial Anthropic vía Nucleus Vault porque el proceso Brain — y todo lo que Brain shellea
después (AITAP, y el `nucleus vault request` que AITAP invoca) — nunca heredaba el entorno necesario para que
Nucleus resolviera su propio workspace y reconociera al dueño real de la máquina como Master. No se creó
ningún mecanismo nuevo de autoridad ("Bootstrap" u otro) — se corrigió la propagación de un mecanismo ya
existente (`BLOOM_NUCLEUS_PATH` + marcador local `.master`) hacia el único punto donde nunca llegaba.

## §1 — Diagnóstico, código real trazado de punta a punta

- **AITAP nunca resuelve credenciales por su cuenta.** `installer/aitap/src/aitap/vault/client.py::VaultClient.resolve()`
  sólo acepta `credential-ref://anthropic/default` y ejecuta `nucleus --json vault request anthropic-key:default`
  como subproceso, sin `env=` explícito (hereda el entorno del proceso que lo invoca).
- **Brain nunca toca credenciales.** `brain/core/intelligence_supply.py::IntelligenceSupplyClient.obtain()`
  shellea `aitap --json route supply --request <path>`, tampoco con `env=` explícito.
- **El gate de Vault es `core.RoleMaster`.** `installer/nucleus/internal/vault/vault.go::createVaultRequestCommand`
  exige `core.GetUserRole() == core.RoleMaster`; si no, imprime `"vault access denied - requires master role"`
  y sale con código 1 — que `VaultClient.resolve()` traduce a `SupplyError("VAULT_ACCESS_DENIED", "vault")`.
- **`core.GetUserRole()` es un chequeo puramente local.** `internal/core/metadata.go::detectUserRole()` llama
  `ResolveNucleusRoot("")` y busca un archivo marcador `.master` dentro de la raíz resuelta; si `ResolveNucleusRoot`
  no puede resolver ningún workspace, cae cerrado a `RoleUnknown` — mismo mensaje de error que un rechazo real.
- **El marcador `.master` sí se crea correctamente.** `nucleus create --master` → `initializeOrganization()` →
  `activateMasterMarkerAndOwnership()` (`internal/governance/ownership.go`) lo escribe en el workspace real del
  usuario durante el onboarding. Esta mitad del mecanismo nunca fue el problema.
- **El punto material de ruptura: `startBrainServer()`** (`internal/supervisor/service.go`). Brain corre como
  servicio TCP persistente (`installer/nucleus/internal/orchestration/activities/brain_poller.go` confirma que
  escucha en `127.0.0.1:5678`, arrancado una sola vez). El spawn original:

  ```go
  cmd := exec.Command(brainBin, "service", "start")
  cmd.Stdout = logFile
  cmd.Stderr = logFile
  cmd.Dir = filepath.Dir(brainBin)
  setSvelteProcAttr(cmd)
  ```

  nunca fijaba `cmd.Env` — Brain heredaba el entorno del proceso Nucleus que lo lanza (típicamente sin
  `BLOOM_NUCLEUS_PATH` bajo systemd/NSSM), y `cmd.Dir` apuntaba al directorio del binario, no al workspace.
  Todo lo que Brain shellea después hereda ese mismo entorno vacío. El resultado: el `nucleus vault request`
  que AITAP invoca nunca podía resolver el `.bloom/.nucleus-{slug}/` real, `detectUserRole()` caía a
  `RoleUnknown`, y Vault rechazaba al dueño legítimo de la máquina con el mismo mensaje que un rechazo real.
- **Mismo patrón, ya diagnosticado y corregido dos veces en el mismo archivo, nunca aplicado acá:**
  `CheckVaultStatus()` (línea ~1000) y el spawn de `bundle.js`/API (línea ~1670) ya fijan explícitamente
  `cmd.Env = append(os.Environ(), "BLOOM_NUCLEUS_PATH="+getWorkspacePath())`, con comentarios propios fechados
  2026-08-12 describiendo exactamente este mismo mecanismo de falla. `getWorkspacePath()`
  (`internal/supervisor/dev_start.go`) ya existe, sin argumentos, en el mismo paquete.

José confirmó el diagnóstico y autorizó la implementación de la corrección mínima resultante.

## §2 — Implementación, tal como quedó en el repo real

`internal/supervisor/service.go`, `startBrainServer()` — una línea, mismo patrón ya probado en el archivo:

```go
cmd.Dir = filepath.Dir(brainBin)
cmd.Env = append(os.Environ(), "BLOOM_NUCLEUS_PATH="+getWorkspacePath())
setSvelteProcAttr(cmd) // detach del grupo de procesos del padre
```

Ningún otro archivo tocado — confirmado por mtime en el dispositivo real antes y después del commit. `gofmt`
no señaló ningún problema nuevo introducido por este cambio (las diferencias de formato preexistentes en el
archivo, ninguna cerca de esta función, no se tocaron).

## §3 — Validación final

```
go build ./internal/supervisor/... && go vet ./internal/supervisor/...
```

Verde, corrido por José en su entorno local tras el commit.

**Criterio de Aceptación E2E** (definido por José, cumplido en este orden — reinicio primero, para que Brain
levantara ya con el entorno corregido):

1. Reinicio completo de servicios (Brain incluido) con `BLOOM_NUCLEUS_PATH` ya seteado en su spawn.
2. Creación de un Mandate Genesis real contra Anthropic — corrida aislada.
3. Nucleus Vault autorizó la resolución de la credencial Anthropic solicitada por AITAP.
4. Reinicio de servicios a mitad de la corrida — continuidad verificada sin pérdida de estado ni duplicación
   de operaciones.

José declaró la prueba E2E de Mandate Genesis **ACEPTADA**.

## §4 — Alcance y no-alcance

Este cierre resuelve exclusivamente el gate **local** `core.RoleMaster` de Vault (marcador `.master` +
resolución de workspace vía `BLOOM_NUCLEUS_PATH`/`ResolveNucleusRoot`) para el proceso Brain y todo lo que
Brain shellea. Es un mecanismo enteramente distinto y sin relación con `AuthorityMode`/`remote_enforced`
(Sovereign Tenant, §Z.15–§Z.23 del Tablero) — no se tocó `internal/authority`, `internal/governance/decision`
ni ningún camino de `AuthorizeGravityNodeCreation`. Ese invariante sigue intacto: `remote_enforced` sigue sin
ser un valor alcanzable de `AuthorityMode`, y esta corrida E2E no autoriza cutover, despliegue general ni
gating remoto de ningún tipo. No se creó, ni se propuso, ningún mecanismo nuevo llamado "Bootstrap" — se
corrigió la propagación de un mecanismo local ya existente.

## §5 — Efecto neto

Mandate Genesis real, contra Anthropic, queda operativo de punta a punta: lifecycle durable de `ing`, canal
Brain↔AITAP para `dis.mapping`, persistencia, reinicio y replay sin duplicación (ya validados en rondas
controladas previas) más, ahora, la resolución productiva de la credencial Anthropic vía Nucleus Vault y la
aceptación funcional completa de una corrida real aislada. El primer Mandate Genesis puede declararse cerrado
según el criterio que José fijó para esta etapa.
