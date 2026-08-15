# Mandate Genesis — Plan de finalización del mandate real (`2d2d1fe3-...`)

**Objetivo de este documento:** instrucciones exactas y evidencia de estado real para llevar el mandate genesis existente (`sample_project`) desde `building/ingest` hasta completar su ciclo, y corregir de paso TD-001 con un hallazgo que cambia dónde va el fix. Pensado para ejecutarse tal cual, en esta sesión o en una sesión de Claude Code aparte.

---

## 1. Estado real confirmado (evidencia en vivo)

Mandate inspeccionado directamente en disco:

```
/home/jose/repos/elias-repos/.bloom/.nucleus-elias-repos/.mandates/2d2d1fe3-ee2d-4bf3-9bab-95ffc36f1e4f/mandate_state.json
```

Contenido (hoy, 2026-08-15 — creado 2026-08-11T22:25:25, mtime del archivo idéntico a `createdAt`, cero escrituras posteriores):

```json
{
  "status": "building",
  "currentPhase": "ingest",
  "phases": { "ingest": {"status": "pending"}, "cluster": {"status": "pending"}, "validate": {"status": "pending", "humanSync": {"candidateDomains": []}} },
  "project": "sample_project",
  "source": "/home/jose/repos/elias-repos/sample_project"
}
```

Esto es exactamente la condición que `mandate_watcher.go:271` (`onMandateStateWritten`) busca para disparar el workflow (`ms.Status == "building" && ms.CurrentPhase == "ingest" && ms.Phases.Ingest.Status == "pending"`), y **nunca se disparó** — 4 días frozen, cero progreso. Confirma en vivo, con un caso real, la hipótesis de TD-001: nada está escuchando `.mandates/`.

Workspace root real: `/home/jose/repos/elias-repos` (NO `sample_project` — ese es el path del *proyecto individual dentro* del workspace, ver `nucleus-config.json`: `organization.slug: "elias-repos"`, `nucleus.rootPath: "/home/jose/repos/elias-repos"`).

---

## 2. Corrección a TD-001: el fix no va en `dev_start.go`

TD-001 (registrado la sesión anterior) proponía instanciar `watchers.NewMandateWatcher` dentro de `dev_start.go`, replicando el bloque de `service.go:2091-2140`. **Confirmado contra el código real: eso no funciona.**

- `nucleus dev-start` (`dev_start.go:59-122`, `Run` del cobra command) llama `executeBootSequence(...)`, imprime el resultado (JSON o texto) y **retorna** — no hay ningún `select{}` ni espera bloqueante al final. El proceso `dev-start` **termina** apenas el boot completa. Es exactamente lo que `bootServices()` en `main_conductor.js` espera (awaitea la salida del subproceso y parsea su stdout).
- `MandateWatcher.Start(ctx)` (`mandate_watcher.go:132`) es un loop bloqueante (`for { select { ... } }`) que necesita vivir en un proceso que **no muera** después del boot. Bajo `service start` esto funciona porque `service start` **es** el daemon persistente (`sup.supervisorCtx = context.Background()`, sin timeout, diseñado para no terminar nunca). Bajo `dev-start` no hay ningún proceso equivalente — insertar el bloque ahí lo mataría en cuanto el CLI de `dev-start` retorne, a los pocos milisegundos.

**Dónde va entonces:** `installer/nucleus/internal/orchestration/temporal/worker.go`, función `workerStartCmd` (comando `nucleus worker start`, registrado línea 188-196). Evidencia de por qué es el lugar correcto:

- Es un proceso **persistente**, spawneado como hijo detached (`exec.Command` sin contexto, mismo patrón que Control Plane/Brain) desde `startWorkerManager()` (`service.go:685`) — y esa función **sí corre bajo `dev-start`** (Fase 2 de `executeBootSequence`, confirmado en la auditoría anterior) además de bajo `service start`.
- Ya abre un `temporalClient` propio (`worker.go:269`, `NewClient(ctx, &c.Paths, false)`) — el mismo tipo (`*temporal.Client`) que `MandateWatcher` necesita como segundo argumento.
- Ya construye y arranca un worker dedicado a la task queue `mandate-orchestration` (`worker.go:363-391`) con `MandateGenesisBuildWorkflow`/`MandateExecutionWorkflow` registrados — es decir, **el lado de ejecución del workflow ya corre bajo `dev-start` hoy**. Lo único que falta es quién lo *arranca*.
- Arreglar acá resuelve `dev-start` y `service start` en un solo lugar, porque ambos comandos spawnean `nucleus worker start` de la misma forma. El bloque separado que ya existe en `service.go:2091-2140` puede quedar como está (es inocuo — dos watchers corriendo en paralelo bajo `service start` sólo generan un segundo intento de `StartWorkflow` que Temporal rechaza vía `WorkflowExecutionAlreadyStarted`, ya manejado por `IsAlreadyStarted`) o eliminarse en un paso de limpieza aparte; no es necesario tocarlo para que esto funcione.

### Cambio exacto propuesto en `worker.go`

Insertar después de la línea 391 (`// ── fin worker mandate-orchestration ──────────────────────────────`), reusando el `temporalClient` ya creado en la línea 269 y el `c.Paths`/`c.IsJSON` ya disponibles en el scope del `Run`:

```go
// ── Mandate Watcher (TD-001 corregido) ───────────────────────────────
// Vive acá y no en dev_start.go: éste es el único proceso persistente
// que corre tanto bajo `nucleus dev-start` como bajo `nucleus service
// start` (spawneado por startWorkerManager en ambos), y ya tiene un
// temporalClient vivo. dev_start.go no sirve como host: el proceso
// `dev-start` termina apenas el boot completa (ver Mandate_Genesis_
// Completion_Plan_v1.md §2), MandateWatcher.Start(ctx) necesita un
// proceso que no muera.
mandatesRoot, mandatesRootErr := mandatesRootForServiceLike(&c.Paths)
if mandatesRootErr != nil {
    logger.Warning("⚠️  Mandate watcher no arrancó — no encontré workspace: %v", mandatesRootErr)
} else {
    mandateWatcher, mwErr := watchers.NewMandateWatcher(mandatesRoot, temporalClient, &c.Paths, false)
    if mwErr != nil {
        logger.Warning("⚠️  Mandate watcher no arrancó — logger: %v", mwErr)
    } else {
        go func() {
            if err := mandateWatcher.Start(ctx); err != nil {
                logger.Warning("⚠️  Mandate watcher terminó con error: %v", err)
            }
        }()
        logger.Success("✅ Mandate watcher iniciado — vigilando %s", mandatesRoot)
    }
}
// ── fin Mandate Watcher ────────────────────────────────────────────
```

Notas de implementación:

- `mandatesRootForServiceLike` no existe todavía — el resolver real que hace falta es `mandatesRootForService()` (`internal/supervisor/service.go:96`), pero está en el paquete `supervisor` y `worker.go` está en el paquete `temporal` (`internal/orchestration/temporal`). Importar `supervisor` desde `temporal` puede crear un ciclo de imports si `supervisor` ya importa `temporal` en algún punto (lo hace: `service.go` importa `nucleus/internal/orchestration/temporal`). **Antes de escribir el import, confirmar con `go build`/`go vet` si el ciclo existe.** Si existe, replicar acá la misma lógica de `resolveMandatesRootForActiveOrg()` (`internal/governance/org_switch_guard.go:238`, que ya resuelve exactamente este problema para el paquete `governance` por la misma razón de ciclo de imports: `core.ResolveNucleusRoot("") + filepath.Join(..., ".mandates")`) en vez de importar `supervisor`.
- `watchers.NewMandateWatcher` requiere importar `nucleus/internal/orchestration/watchers` en `worker.go` — no está importado hoy (ver imports actuales, línea 1-26 del archivo).
- Usar el `ctx` que el comando ya tiene en scope (`ctx, cancel := context.WithCancel(context.Background())`, línea 266) — no crear uno nuevo. Este `ctx` se cancela en el `defer cancel()` de la línea 267, así que el watcher muere ordenadamente cuando el proceso `worker start` termine.

---

## 3. Segundo gap, no documentado en TD-001: activities faltantes para Fase 3

`MandateGenesisBuildWorkflow` (`mandate_genesis_build_workflow.go`) invoca, en orden:

1. `IngestReceptionActivity` (línea 111) — registrada en `mandateWorker` ✓ (`worker.go:384`).
2. `PublishMandateEventActivity` (línea 120, y de nuevo 169 y 276) — registrada ✓ (`worker.go:374`).
3. `ScaffoldDomainActivity` (línea 134, dry-run de Fase 2/cluster) — registrada ✓ (`worker.go:373`).
4. Espera bloqueante de `workflow.GetSignalChannel(ctx, "mandate:genesis:validate")` (línea 164) — Fase 3, punto de sincronización humana.
5. `PersistHumanSyncActivity` (línea 202) — **NO registrada en `mandateWorker`.**
6. `SignMandateActivity` (línea 217) — **NO registrada en `mandateWorker`.**
7. `ExecuteChildWorkflow(MandateExecutionWorkflow, ...)` (línea 267) — workflow registrado ✓ (`worker.go:372`); el workflow en sí es un placeholder puro (confirmado en `BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md:224`: "MandateExecutionWorkflow (P4 real) sigue placeholder puro" — estado documentado y aceptado, no un bug a resolver acá).

El propio código ya deja esto señalado (`worker.go:375-383`, comentario existente): *"SignMandateActivity/PersistHumanSyncActivity... que el workflow también invoca (fases sign/validate) pero que NO están registradas acá — gap preexistente"*. Sin agregarlas, el mandate real, incluso después del fix del watcher, va a avanzar por Fase 1 y Fase 2 correctamente, pero **al llegar a Fase 3 (después de que alguien confirme los dominios) el workflow va a fallar en runtime con "unable to find activity type"**.

Fix: agregar, junto al bloque de `worker.go:373-384`:

```go
mandateWorker.RegisterActivity(activities.PersistHumanSyncActivity)
mandateWorker.RegisterActivity(activities.SignMandateActivity)
```

(Confirmar los nombres exactos de función exportada en `internal/orchestration/activities/mandate_genesis_activities.go` antes de escribir esto — no los leí en este turno, solo confirmé sus call sites en el workflow.)

---

## 4. El disparo de la Fase 3 (Signal) ya está resuelto — no hace falta tocarlo

`BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md:223` documenta: *"3 — validate: Espera Signal `mandate:genesis:validate`; CLI (`domains confirm`) y Signal ya señalizan correctamente... Sin cambios de esta migración."* — es decir, ya existe un comando CLI (`nucleus mandate genesis domains confirm`, ver `mandate_genesis_domains_cmd.go`) que manda la signal real. No hace falta construir nada nuevo para desbloquear Fase 3 una vez que las activities de arriba estén registradas — solo correr ese comando cuando el mandate llegue a `domains_proposed`.

---

## 5. Checklist de ejecución (para la sesión que implemente esto)

1. Confirmar nombres exactos de `PersistHumanSyncActivity`/`SignMandateActivity` en `mandate_genesis_activities.go`.
2. Confirmar si importar `nucleus/internal/supervisor` desde `nucleus/internal/orchestration/temporal` genera ciclo (`go build ./...` tras el import, o `go list -deps` cruzado). Si hay ciclo, replicar `resolveMandatesRootForActiveOrg()` localmente en vez de importar.
3. Editar `worker.go`: import de `watchers`, registro de las 2 activities faltantes, bloque de arranque del watcher (sección 2 de este documento).
4. `go build ./...` sobre `installer/nucleus` — cero errores.
5. Reiniciar el stack (`nucleus dev-start`, o cerrar/reabrir Core si Electron lo dispara) y confirmar en el log de `nucleus_worker_*.log` la línea `✅ Mandate watcher iniciado — vigilando ...`.
6. Confirmar que `mandate_state.json` del mandate real (`2d2d1fe3-...`) cambia de `currentPhase: ingest / status: pending` a algo distinto dentro de los primeros segundos (el `watchExistingMandateDirs()` de `Start()` procesa mandates preexistentes al arrancar, no hace falta tocar el archivo a mano).
7. Seguir el mandate hasta que llegue a `validate` / `domains_proposed` (vía evento `mandate:genesis:domains_proposed` en el WS, ya cableado del lado de Core — ver implementación de la sesión anterior) y correr `nucleus mandate genesis domains confirm --mandate-id 2d2d1fe3-ee2d-4bf3-9bab-95ffc36f1e4f` (confirmar flags exactos del comando real) para mandar la signal.
8. Confirmar que el mandate llega a `status: completed` (o al punto máximo que permite el placeholder de `MandateExecutionWorkflow`, per §3 punto 7).

No implementado en este turno — este documento es el insumo para decidir si se ejecuta ahora mismo en esta sesión o se pasa a una sesión de Claude Code, como se discutió.
