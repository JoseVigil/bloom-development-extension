# AITAP — handoff de integración real para Mandate Genesis

**Fecha:** 2026-08-21  
**Base:** código local inspeccionado y pruebas ejecutadas  
**Alcance:** AITAP/Brain; no diseña el workflow ni interpreta BISP

## 1. Conclusión ejecutiva

AITAP **no puede atender hoy un request cognitivo real de Genesis**. Existe un
motor Python puro que selecciona, desde fixtures JSON, un par runtime + backend/
model y genera un fingerprint determinístico. No existe Intelligence Supply:
no hay adapters de providers, request de prompt/input, respuesta cruda, Vault
client, medición de tokens/costo/latencia, Accounting store ni integración
Brain → AITAP.

La CLI está codificada, pero no está operativa en el entorno verificado:

- `aitap` no existe en PATH;
- no existe binario AITAP desplegado en `BloomNucleus/bin`;
- `python -m aitap ...` falla porque el runtime disponible no tiene `typer`;
- el motor puro sí pasó 11 tests.

Por tanto, Genesis no tiene hoy un comando válido para pedir inteligencia. El
primer punto de integración viable debe implementar primero Supply Request/
Result y una superficie instalada; `route decide` sólo resuelve routing.

## 2. Superficie existente

### CLI declarada

Comandos registrados por `src/aitap/commands/__init__.py`:

```text
aitap system version
aitap system status
aitap keys list
aitap route status
aitap route decide --request <json> [--policy <json>] [--registry <json>]
```

Estado:

| Superficie | Estado real |
|---|---|
| `system version` | código presente; CLI E2E `NOT_RUN` por dependencia ausente |
| `system status` | mensaje estático |
| `keys list` | placeholder explícito; no llama Vault |
| `route status` | mensaje estático |
| `route decide` | wrapper presente; motor subyacente probado |
| `--help` / `--json-help` | implementación presente; no ejecutada en este runtime |

### Interfaz programática

La única API funcional es interna a Python:

```python
from aitap.routing import RoutingEngine

engine = RoutingEngine.from_files(policy_path, registry_path)
decision = engine.decide(request_dict)
```

Es una función pura sobre archivos cargados por el caller. No es servicio, IPC,
HTTP, SDK público versionado ni Activity Temporal. Lee policy/registry desde el
filesystem de instalación al componer el objeto; no toca workspaces de usuario.

## 3. Cómo Brain invoca AITAP hoy

No lo invoca. La búsqueda completa bajo `brain/` e `installer/nucleus/` no
encontró import, subprocess, comando, HTTP client, `AitapCounterpart` ni uso de
`cognituum.routing`.

Brain conserva acceso directo a providers/credenciales en caminos legacy. No
existe productor del Routing Request V2 ni consumidor de Routing Decision o
Supply Result.

## 4. Request actual completo

Fixture realmente aceptado por el motor:

```json
{
  "schema_version": "cognituum.routing/v2",
  "routing_request_id": "rr-genesis-ing-v2-001",
  "logical_inference_id": "li-genesis-ing-001",
  "intent_id": "intent-ing-001",
  "stage": "ing",
  "turn_id": "turn-001",
  "routing_mode": "policy",
  "policy_version": "genesis-runtime-intelligence/v2",
  "runtime": {
    "required_capabilities": ["filesystem.patch"],
    "forced_runtime_id": null,
    "previous_runtime_id": null,
    "excluded_runtime_ids": []
  },
  "intelligence": {
    "required_capabilities": ["text.generate"],
    "privacy": "approved_cloud",
    "forced_backend_id": null,
    "forced_model": null,
    "previous_backend_id": null,
    "excluded_backend_ids": []
  },
  "sticky_decision_id": null,
  "override_ref": null
}
```

### Campos solicitados versus actuales

| Dato requerido | Representación actual |
|---|---|
| consumidor | **ausente** |
| organization | **ausente** |
| `mandate_id` | **ausente** |
| `action_id` | **ausente** |
| `intent_id` | presente |
| turn | `turn_id` presente |
| `correlation_id` | no genérico; existen request/logical/intent/turn IDs |
| runtime solicitado | `forced_runtime_id`, previous/excluded o policy |
| provider solicitado | `forced_backend_id` o policy |
| model solicitado | `forced_model`; policy/registry fija model por backend |
| automático | `routing_mode=policy` |
| fallback | arrays `runtime_fallback`/`intelligence_fallback` en policy, no request |
| policy | `policy_version`, no `policy_ref` firmado |
| grant | **ausente** |
| input/prompt cognitivo | **ausente** |

El schema V2 sólo admite `ing`, `dis`, `doc`, `dev`; omite `exp`. Además exige
runtime e intelligence simultáneamente, aunque `dis/doc/exp` puedan requerir
Supply sin Execution.

## 5. Response actual completo observado

Salida del motor para el fixture anterior:

```json
{
  "schema_version": "cognituum.routing/v2",
  "routing_decision_id": "rd-6fff89b624a69fbd6d1cc434d447181a",
  "routing_request_id": "rr-genesis-ing-v2-001",
  "logical_inference_id": "li-genesis-ing-001",
  "intent_id": "intent-ing-001",
  "stage": "ing",
  "turn_id": "turn-001",
  "policy_version": "genesis-runtime-intelligence/v2",
  "registry_snapshot_id": "genesis-pilot/v2",
  "runtime": {
    "runtime_id": "codex_cli",
    "runtime_kind": "external_runtime",
    "health": "unknown"
  },
  "effective_intelligence": {
    "backend_id": "openai_api",
    "provider": "openai",
    "model": "gpt-4",
    "credential_ref": "credential-ref://openai/default",
    "health": "unknown",
    "accounting_ref": "accounting://backend/openai_api"
  },
  "runtime_candidates": [
    {"runtime_id": "codex_cli", "eligible": true, "reason_codes": ["POLICY_MATCH"]},
    {"runtime_id": "opencode", "eligible": true, "reason_codes": []}
  ],
  "intelligence_candidates": [
    {"backend_id": "openai_api", "eligible": true, "reason_codes": ["POLICY_MATCH"]}
  ],
  "fallback": {"runtime_ids": ["opencode"], "backend_ids": []},
  "override_ref": null,
  "accounting": {
    "routing_accounting_ref": "accounting://routing/rd-6fff89b624a69fbd6d1cc434d447181a",
    "inference_accounting_ref": "accounting://backend/openai_api",
    "runtime_id": "codex_cli",
    "provider": "openai",
    "model": "gpt-4"
  },
  "fingerprint": "sha256:6fff89b624a69fbd6d1cc434d447181a6d1703b63439a727408d7d6ba8492ef0"
}
```

Esto es una **Routing Decision de fixture**, no una respuesta de IA.

| Salida requerida | Estado actual |
|---|---|
| respuesta cruda | ausente |
| runtime efectivo | presente, seleccionado desde fixture |
| provider/model efectivo | presente, seleccionado desde fixture |
| tokens | ausente |
| costo | ausente |
| latencia | ausente |
| errores normalizados | parcial: `RoutingError`; CLI intenta `{"status":"error","message":...}` |
| audit reference | URI calculada, **no persistida**; no prueba auditoría real |

Los valores `health=unknown`, `conformance=NOT_RUN` y modelos del registry no
son observación productiva.

## 6. Credenciales y `key_id`

No existe acceso real. `aitap keys list` imprime que la integración con
`VaultClient`/`nucleus vault` está pendiente. El engine sólo devuelve una URI
estática `credential-ref://...` tomada del fixture.

Contrato objetivo mínimo:

```text
AITAP selecciona key_id/Credential Reference
→ solicita a Nucleus Vault un handle efímero audience/request-scoped
→ Provider Backend o Credential Broker consume el handle
→ Brain/Temporal/logs reciben únicamente refs y nunca plaintext
```

Faltan cliente, autenticación, Grant, audience, TTL, revocación, redacción y
pruebas de no exposición. Hoy no puede afirmarse que el secreto no llega al
caller porque ningún secreto se resuelve todavía.

## 7. Soporte real por Action

| Intent | Soporte real hoy |
|---|---|
| `ing` | routing determinístico de fixture probado; sin inferencia |
| `dis` | regla de policy evaluable por motor; sin inferencia ni fast-path |
| `doc` | regla de policy evaluable; sin inferencia ni producción documental |
| `exp` | **no soportado** por schema/policy actual |
| `dev` | routing/recovery de fixture; sin planificación cognitiva ni Executor |

AITAP no soporta ningún Intent end-to-end. No interpreta
`no_changes_required`, `remediation_required`, findings o `ready`.

## 8. Faltantes para el primer request cognitivo real

1. Versionar un Supply Request separado de Execution Routing o hacer runtime
   opcional sin alterar V2.
2. Agregar `consumer_id`, organization ref, mandate/action/intent/turn y
   correlation IDs.
3. Soportar `exp` y la secuencia canónica sin codificar el workflow en AITAP.
4. Implementar Provider Backend real con request opaco y respuesta cruda.
5. Implementar selección provider/model sin modelos fixture presentados como
   disponibilidad real.
6. Integrar Nucleus Vault mediante `key_id`/Credential Reference y handle
   efímero, nunca plaintext al caller.
7. Implementar Accounting persistido: tokens input/output, costo, latencia,
   outcome, consumidor, organization y correlación.
8. Definir Error Envelope machine-readable estable.
9. Instalar/empaquetar AITAP y sus dependencias; generar help verificable.
10. Crear puerto consumible por Brain —subprocess JSON inicial o API/IPC— y su
    Activity Temporal correspondiente.
11. Persistir request/decision/raw response antes de avanzar el workflow.
12. Agregar tests provider fake, Vault fake, Accounting store, retry,
    idempotencia, redacción y Brain integration.

## 9. Pruebas ejecutadas

El 2026-08-21:

- `python -m unittest discover -s installer/aitap/tests -v`: **11/11 PASS**;
- cubren policy, forced, sticky, failover, escalation, recovery, idempotencia,
  independencia runtime/backend health, OpenCode no-provider y fingerprints;
- carga JSON de artifacts: realizada previamente, válida;
- `python -m aitap route decide ...`: **FAIL**, `ModuleNotFoundError: typer`;
- `Get-Command aitap`: **NOT FOUND**;
- búsqueda en deployment BloomNucleus/bin: **AITAP NOT FOUND**;
- búsqueda Brain/Nucleus → AITAP: **cero call sites**.

No existen pruebas de provider, Vault, tokens, costo, latencia, raw response,
Accounting persistido o integración Genesis.

## 10. Comando exacto e interfaz de integración

### Comando declarado, no operativo en el entorno actual

```powershell
aitap route decide --request installer/aitap/examples/genesis-ing-request-v2.json
```

Desde source, una vez instaladas dependencias:

```powershell
python -m aitap route decide --request installer/aitap/examples/genesis-ing-request-v2.json
```

Ese comando sólo devuelve routing y **no sirve como request cognitivo**.

### Interfaz que Brain necesita

Primer contrato viable recomendado para el canal CLI controlado:

```text
brain → aitap supply request --request <supply-request.json>
      ← Supply Result con raw_response + provider/model + usage/accounting refs
```

El nombre `supply request` es propuesta, no comando existente. Brain debe ser
el caller; Nucleus CLI no debe saltarlo. El transporte puede comenzar como
subprocess JSON si garantiza stdout limpio, stderr para logs, timeout,
idempotencia y persistencia durable, y luego conservar el mismo contrato al
migrar a IPC/API.

## AGENDA FOLLOWUP

### Capacidad disponible

- RoutingEngine V2 puro y determinístico sobre policy/registry fixtures.
- Selección separada runtime/backend/model y fingerprint reproducible.
- 11 tests unitarios verdes.

### Gaps

- cero Intelligence Supply, Vault, Accounting persistido o Brain integration;
- CLI no instalada/no ejecutable en el runtime verificado;
- campos Genesis/organization/consumer incompletos;
- `exp` ausente;
- runtime obligatorio incluso para Supply sin Execution;
- referencias contables sintéticas no auditables.

### Contrato propuesto

- Supply Request/Result separado de Routing Decision;
- correlación `consumer → organization → mandate → action → intent → turn`;
- raw response opaca para Brain;
- provider/model/credential/usage/accounting explícitos;
- Execution Routing sólo cuando Temporal/Brain ya determinaron actuación.

### Primer punto de integración viable

Implementar y probar `aitap supply request` con un Provider Backend fake y
Vault/Accounting fakes; luego conectar Brain mediante un único adapter de
subprocess JSON. Recién después sustituir el provider fake por uno real bajo
Credential Reference. `route decide` puede reutilizarse internamente, pero no
es por sí solo el punto cognitivo.

### Milestones técnicos, sin fechas

1. **M0 — Contract gap closure:** Supply Request/Result, correlación Genesis,
   `exp`, errores y versionado aprobado.
2. **M1 — Executable surface:** entorno reproducible, CLI/help JSON y smoke
   tests desde clean checkout.
3. **M2 — Fake vertical:** routing + provider fake + Vault fake + Accounting
   persistido + raw response, con idempotencia/redacción.
4. **M3 — Brain integration:** producer/consumer real y persistencia durable;
   retry sin duplicación.
5. **M4 — First real provider:** `key_id`/handle efímero, usage/costo/latencia y
   error normalization.
6. **M5 — Genesis `ing`:** primer request cognitivo real por canal CLI, restart
   recovery y estado observable.
7. **M6 — `dis/doc/exp`:** mismo contrato, policies por Action y sin semántica
   de resultados dentro de AITAP.
8. **M7 — Execution handoff:** Routing Decision correlacionada hacia Executor
   sólo para Actions que requieren actuación autorizada.

