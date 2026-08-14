# Technical Debt TD-001: Encendido de MandateWatcher bajo `dev-start`

## Contexto

El flujo de creación de Mandates vía CLI (`nucleus mandate genesis ...` / Camino 1) depende de `watchers.NewMandateWatcher` para:

1. Detectar la creación de `mandate_state.json` mediante `fsnotify`.
2. Disparar el workflow de Temporal `StartMandateGenesisBuildWorkflow`.
3. Emitir eventos a la UI a través de `PublishMandateEventActivity`.

## Problema Actual

Actualmente, el único lugar donde se instancia `watchers.NewMandateWatcher` es en `service.go:2123` (comando `service start`). Durante la ejecución bajo `nucleus dev-start` (el comando usado por Electron), el watcher no se ejecuta. Por ende, cualquier Mandate creado desde el CLI queda "huérfano" en disco sin progresar en Temporal ni notificar a la UI.

## Tarea Pendiente (Post-Genesis UI Unblock)

1. Modificar `installer/nucleus/dev_start.go` para instanciar e iniciar `watchers.NewMandateWatcher` dentro de la secuencia de arranque de desarrollo.
2. Probar y validar que la creación por CLI (Camino 1) emita eventos hacia `:48215/internal/mandate-event` y mueva las actividades de Temporal correctamente.

## Referencias

- `Mandate_Event_Mechanism_Auditoria_v1.md` (`docs/MANDATE/`) — confirma con evidencia de archivo/línea que `StartMandateGenesisBuildWorkflow` tiene un único call site en todo el repo (`mandate_watcher.go:295`), y que ni Camino 1 (`mandate.go:createGenesisMandate`) ni Camino 2 (`create-mandate.handler.ts`) lo llaman directamente — ambos dependen del watcher.
- `Core_Mandate_No_Aparece_Auditoria_v1.md` (`docs/MANDATE/`) — confirma que `watchers.NewMandateWatcher` tiene un único call site en todo `installer/nucleus`: `service.go:2123`, dentro de `createServiceStartCmd` (comando `service start`), y que `executeBootSequence()` (`dev_start.go:152`) no lo menciona en ninguna de sus fases.

## Estado

No implementado. Registrado para abordarlo inmediatamente después de desbloquear Mandate Genesis en la UI (implementación en curso al momento de este registro — ver `docs/MANDATE/Mandate_Event_Mechanism_Auditoria_v1.md`).
