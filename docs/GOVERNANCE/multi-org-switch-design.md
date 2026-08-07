# Bloom — Diseño: Switch de Organización con Single-Org Activa

**Estado:** Borrador de diseño, pendiente de verificación contra código real.
**Alcance:** Nucleus (Go) y Conductor (Electron). Sentinel/Brain/Metamorph quedan fuera de este documento hasta auditar Nucleus primero.
**Última actualización:** sesión de auditoría multi-org, continuación del trabajo sobre `nucleus.json` (onboarding).

---

## 1. Decisión de diseño aceptada

El sistema **no soporta multi-tenant concurrente en memoria**. En cambio:

1. **Switch bloqueado por procesos activos** — no se permite cambiar `active_org_slug` mientras existan Mandates, workflows de Temporal, o intents in-flight de la organización actual.
2. **Drenado e inmutabilidad** — para cambiar de org, todo lo que esté en curso debe terminar limpio y quedar persistido en `.bloom/.nucleus-{org}/` antes de autorizar el switch.
3. **Single-org por instancia** — mientras una org está activa, ningún proceso mezcla contexto ni credenciales con otra. El aislamiento de *datos* ya existe por diseño (carpetas separadas por org); lo que falta es el aislamiento de *transición* — el momento del switch en sí.

Esta regla resuelve el problema de concurrencia en memoria sin reescribir Brain/Sentinel/Temporal como multi-tenant. El costo que asumimos: el sistema no puede tener dos Mandates de dos orgs distintas corriendo *simultáneamente*— sí puede alternar entre orgs, pero de a una por vez, con drenado real entre medio.

---

## 2. Las 8 guardas (G1–G8)

### Nucleus

**G1 — Fuente de verdad del "in-flight".**
¿El estado de ejecución vivo se consulta desde Temporal en tiempo real (`ListOpenWorkflowExecutions` o equivalente), o Nucleus mantiene su propio índice local en `.bloom/.nucleus-{org}/`? Esto determina si el chequeo de drenado puede ser un simple `fs.exists` o necesita ser una query activa contra el cliente de Temporal.

**G2 — Endpoint explícito `can-switch-org`.**
Una función/query que devuelva `{ blocked: bool, reasons: [...] }`, nunca inferida implícitamente por el caller. Nucleus es quien tiene autoridad sobre esto — el Conductor no debe "adivinar" sumando estados por su cuenta.

**G3 — Qué cuenta como "in-flight".**
Mínimo: Mandates en Temporal sin estado terminal, intents con `INTENT_STARTED` sin `INTENT_COMPLETED`/`INTENT_FAILED` correspondiente, conexiones activas de `IntentExecutor` sobre esa org. Riesgo abierto: si algo de esto vive solo en memoria de un proceso (no persistido), un crash puede dejar el sistema creyendo "sigue in-flight" para siempre — necesita timeout/heartbeat, no un bloqueo indefinido.

**G4 — Lock durante el drenado, no solo antes.**
Entre "empezó a drenar" y "terminó de drenar" tiene que existir un estado explícito y persistido (ej. `draining: true`) que rechace nuevos intents/Mandates para esa org. Sin esto, alguien puede disparar un Mandate nuevo *durante* la ventana de drenado y la condición de carrera reaparece.

**G5 — Vault scope.**
`VAULT_GET_KEY` debe validar la org contra la org efectivamente activa **en el momento del request**, no contra un valor cacheado al boot del proceso que la solicita. Con single-org-por-instancia esto debería ser trivial — pero es el punto donde una violación de la regla de drenado se convierte en **fuga de credenciales entre orgs**, no solo en un bug de estado. Prioridad alta.

### Conductor

**G6 — Punto de entrada único del switch.**
El futuro selector "cambiar de organización" debe llamar a G2 **antes** de tocar `nucleus.json`, y mostrarle al usuario el motivo si está bloqueado (no un "no se puede ahora" genérico).

**G7 — `getOrCreateOrg` nunca se invoca directo desde un flujo de switch.**
Solo debe llamarse dentro de un wrapper (`switchActiveOrg()`) que primero consulte G2, y recién si `blocked: false` proceda a escribir `active_org_slug`. Hay que confirmar que no exista un segundo camino que la sortee (ej. algo que escriba `nucleus.json` a mano).

**G8 — Auditoría del intento bloqueado.**
Un intento de switch bloqueado debe quedar registrado igual que uno exitoso — si no, no hay forma de diagnosticar un reclamo de "quise cambiar de org y no me dejó".

---

## 3. Hallazgo ya confirmado en código (sesión anterior)

`getOrCreateOrg()` en `shared/onboarding-schema.js` escribe `active_org_slug` sin ninguna condición:

```js
onboarding.active_org_slug = orgSlug;
```

Hoy es inofensivo — solo se llama durante `nucleus_create` / `use-existing-workspace`, momento en que no puede haber nada in-flight (es la primera org que se crea). Pero es la función que un futuro selector de org va a reusar. **La guarda (G6/G7) tiene que envolver esta función, nunca vivir dentro de ella** — `getOrCreateOrg` debe seguir siendo un primitivo "tonto" de persistencia.

---

## 4. Mapeo de candidatos — inferido de `nucleus_tree.txt`

⚠️ **Esto es un mapeo por nombre de archivo, no una confirmación.** El propósito es decidir qué pedir primero, no asumir que el código ya implementa la guarda.

| Guarda | Archivo candidato | Por qué (señal del nombre) |
|---|---|---|
| G1 | `internal/orchestration/temporal/temporal_client.go` | Cliente de Temporal — si existe una query de workflows abiertos, vive acá |
| G1 / G3 | `internal/orchestration/watchers/mandate_watcher.go` | "watcher" sugiere observación de estado en curso — podría ser la fuente de verdad in-memory (riesgo si no persiste) |
| G1 / G3 | `internal/orchestration/queries/status.go` | Único archivo bajo `queries/` — candidato natural para exponer estado consultable |
| G2 | `internal/orchestration/workflows/system_gate.go` | El nombre es casi literal a lo que buscamos — "gate" = compuerta/guarda. **Prioridad #1 para pedir.** |
| G3 | `internal/orchestration/temporal/workflows/mandate_execution_workflow.go` | Workflow de ejecución de Mandates — acá vive el estado que define "in-flight" |
| G3 | `internal/orchestration/temporal/workflows/mandate_genesis_build_workflow.go` | Idem, para el flujo de genesis de Mandate |
| G3 | `internal/mandates/mandate_runner.go`, `mandate_types.go` | Definición de estados/tipos de Mandate — de acá sale qué es "estado terminal" |
| G4 | `internal/orchestration/workflows/recovery_flow.go` | "recovery" sugiere manejo de reanudación/drenado tras interrupción |
| G4 | `internal/supervisor/supervisor.go`, `service.go`, `workers.go` | Supervisor de procesos — probable dueño del lifecycle de workers, candidato para el lock de drenado |
| G4 | `internal/orchestration/temporal/bootstrap/lifecycle.go`, `force_stop.go`, `cleanup.go` | Lifecycle explícito de arranque/parada de Temporal — clave para saber si hay un "drain" real o solo un kill |
| G5 | `internal/vault/vault.go`, `vault_test.go` | Vault Authority — **prioridad alta**, ver si el request de key lleva org_id o confía en estado del proceso |
| G5 / G7 | `internal/governance/ownership.go` + `.ownership.json` (fixture en `simulation_env/`) | BTIPS §8.6: `INVARIANT-ORG-007: .ownership.json es la fuente de verdad de identidad` — este es probablemente donde vive "cuál es la org" a nivel de disco |
| G7 | `internal/core/paths.go` | Resolución de `.nucleus-{org}/` — si construye el path desde un valor cacheado vs. un parámetro explícito, ahí está el patrón de estado global a evitar |
| G7 | `internal/core/registry.go` | Nombre sugiere un registro — ¿de orgs? ¿de qué está corriendo? Ambiguo, hay que abrirlo |
| G7 | `internal/core/settings.go` | Candidato para dónde vive "la org activa" como config del proceso |
| G6 | `internal/cli/config.go` | Si el CLI acepta `--org` o similar, es el punto de entrada humano al switch |
| G8 | `internal/governance/audit.go` | Módulo de auditoría explícito — confirmar si ya registra decisiones bloqueadas o solo acciones exitosas |
| G8 | `internal/analytics/heartbeat.go` | Posible mecanismo de heartbeat que también sirva para el timeout de G3 (proceso zombie) |
| — contexto | `nucleus-governance.json` | Config de gobernanza a nivel de instalación — ver si tiene alguna noción de org ya |
| — contexto | `internal/governance/create.go` | Probable análogo Go de nuestro `getOrCreateOrg` — comparar si tiene la misma falta de guarda |

---

## 5. Próximos pasos de auditoría

1. Pedir contenido real de: `system_gate.go`, `vault.go`, `ownership.go`, `paths.go`, `registry.go` — son los 5 que más probablemente contengan (o deberían contener) G1, G2, G5, G7.
2. Con eso, confirmar o refutar cada fila de la tabla — actualizar este documento con hallazgos reales, no solo hipótesis por nombre.
3. Recién después, decidir si `system_gate.go` ya es el lugar correcto para implementar G2, o si hay que crear un módulo nuevo.
4. Repetir el mismo ejercicio de árbol → candidatos para Sentinel, Brain y Metamorph antes de tocar código en ninguno.

---

## 6. Preguntas abiertas (a resolver con código, no por diseño)

- ¿El estado de "Mandate in-flight" persiste en disco (`.bloom/.nucleus-{org}/`) o solo vive en la memoria del worker de Temporal?
- ¿Existe ya algún concepto de heartbeat/timeout para detectar un proceso zombie que nunca reporta `INTENT_COMPLETED`?
- ¿`VAULT_GET_KEY` recibe el org_id como parámetro explícito en el mensaje, o el Vault infiere la org de algún estado del proceso que lo llama?
