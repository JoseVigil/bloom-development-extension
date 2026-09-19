# AITap

Router centralizado de acceso a proveedores de IA (Gemini, Claude, OpenAI, xAI)
para todos los clientes del ecosistema Bloom (Brain, Alfred, y los que vengan).

## Estado

Primer vertical reconciliado de routing determinístico. Incluye contratos
v2, registry fixture y la policy experimental
`genesis-runtime-intelligence/v2`. La conexión real a providers, Nucleus Vault y
la integración con Executor continúa pendiente. Intelligence Supply dispone de
un piloto directo Anthropic con Vault, journal y contabilidad; su aceptación
real sigue pendiente del E2E autorizado descrito al final.

> **Auditoría completada:** clasificación y estado en
> `../../docs/AITAP/AITAP_ROUTING_RECONCILIATION_REPORT_2026-08-20.md`.

## Decisiones ya tomadas (no re-discutir sin evidencia nueva)

**Lenguaje: Python.** Reutiliza directamente la logica de rotacion ya
construida y testeada en `brain/shared/credentials/` (`BaseKeyManager`,
`GeminiKeyManager` con sus 4 estrategias de seleccion: GREEDY, ROUND_ROBIN,
PRIORITY_FIRST, RESERVE_LAST). El limite con Nucleus (Go) no se resiente por
esto: aitap habla con Nucleus por el mismo subprocess `nucleus vault --json`
que ya usa `brain/shared/credentials/vault.py`.

**AITap no es dueno del vault.** Nucleus lo es
(`installer/nucleus/internal/vault/vault.go`, respaldado por el Keyring del
SO via `zalando/go-keyring`). AITap guarda unicamente:
- referencias a keys (`key_id`, ej. `gemini-key:profile1`) — nunca el valor real
- politica de ruteo/prioridad entre proveedores
- estado operativo no secreto (cuota estimada, contador de errores, circuit breaker)

Ver la investigacion **"Vault - AiTap"** (sesion previa) para el mapeo completo
de vaults existentes en el repo y por que esta es la unica arquitectura que no
duplica la fuente de verdad de credenciales.

**Gap real que AITap resuelve:** decisión de grifo reproducible. Incluye
ruteo entre providers de Intelligence y selección abstracta de Execution
Provider. La invocación de runtimes de ejecución sigue fuera de AITAP.

## Norma de CLI del ecosistema (por que esta estructura)

Todo servicio del ecosistema Bloom expone su propio CLI con `--help` (humano)
y una variante JSON machine-readable, capturada por build scripts hacia un
directorio compartido `installer/help/`. Confirmado en:
- Apps Go (`nucleus`, `sentinel`, `metamorph`, `sensor`): cobra +
  `ModernHelpRenderer`, flag `--json-help`, `installer/*/scripts/build-*.sh`
  vuelca a `installer/help/<app>_help.json` y `.txt`.
- `brain` (Python): typer + `CommandRegistry`/`BaseCommand`/`CommandCategory`
  + `render_help()` con modos texto/JSON/AI-native
  (`brain/cli/help_renderer.py`, `brain/core/system/help_docs_manager.py`).

AITap sigue el patron de `brain` (mismo lenguaje, mismo contrato
`CommandMetadata`/`BaseCommand`/`CommandRegistry`). `--json-help` es alias de
`--help --ai --full`.

AITAP participa del pipeline compartido mediante `build-all.py --only aitap`.
Se empaqueta como aplicación Python standalone para Windows, Linux y Darwin;
el artefacto recién creado genera `aitap_help.{json,txt}` tanto junto al
binario como en `installer/help/`. Un error de empaquetado o de cualquiera de
las dos ayudas falla el build.

```
src/aitap/
  __main__.py           entry point (typer + intercept de --help/--json-help)
  cli/
    base.py              CommandMetadata + BaseCommand (mismo contrato que brain)
    categories.py         CommandCategory: SYSTEM, KEYS, ROUTE, HEALTH
    registry.py            CommandRegistry
    help_renderer.py        render_help(): texto (rich) + JSON AI-native
  commands/
    system/  (version, status)
    keys/    (list — placeholder, no toca Nucleus Vault todavia)
    route/   (status — placeholder, sin motor de ruteo todavia)
  core/
    context.py            GlobalContext (json_mode, verbose)
scripts/
  generate_help.py        vuelca a installer/help/aitap_help.{json,txt}
```

## Uso

```bash
cd installer/aitap
pip install -e . --break-system-packages   # o dentro de un venv

aitap --help                 # ayuda humana
aitap --json-help            # referencia completa en JSON (AI-native)
aitap system version
aitap system status
aitap keys list               # placeholder
aitap route status
aitap route decide --request examples/genesis-ing-request-v2.json

python scripts/generate_help.py   # regenera installer/help/aitap_help.{json,txt}
python ../../build-all.py --only aitap  # empaqueta AITAP y genera ambas ayudas
```

## Fuera de alcance, a propósito

AITap es grifo (Gateway + Vault + Contabilidad), no implementador y no
orquestador. Nunca va a tener tools de bash/edit/write, nunca administra
sesiones de ejecución (ej. OpenCode headless), nunca aplica diffs sobre un
codebase, y **nunca parsea ni valida el `BSIP-Response`** — devuelve la
respuesta cruda del modelo, el parseo es 100% del orquestador consumidor
(Brain, Alfred). Ver `AGENTS.md` (guardrail operativo con tripwires
explícitos), `../../docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
(razonamiento original, resuelto 2026-08-12) y
`../../docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md` (v1.1,
vocabulario preciso de los tres pilares y quién parsea qué).

## Routing determinístico materializado

- Contratos vigentes JSON Schema bajo `contracts/v2/`; V1 está supersedido.
- Policy `genesis-runtime-intelligence/v2` bajo `policies/`.
- Snapshot simulado del piloto bajo `registry/`; no representa health real.
- OpenCode se registra una sola vez como `first_party_runtime`. Provider/backend
  provider/backend, modelo, Credential Reference y Accounting se seleccionan y
  auditan como dimensiones separadas. OpenCode nunca es provider.
- `aitap route decide --request <json>` devuelve una decisión estable y no
  ejecuta el target seleccionado.
- Las pruebas unitarias no requieren CLIs reales.

## Pendiente

- Conexion real a Nucleus Vault (`VaultClient`, subprocess `nucleus vault`)
  para `aitap keys add/list/delete`.
- Health dinámico y circuit breaker anticipatorio (leer
  cuota restante antes de fallar, no solo reaccionar a 3 errores consecutivos
  como hace `GeminiKeyManager` hoy).
- Normalizacion de request/response entre las 4 APIs de proveedores.
- Bug de `nucleus health` reportando vault como fallo — pendiente, tema
  separado de este scaffold.

## Intelligence Supply — piloto ING/DIS

Esta frontera no habilita el vertical Mandate Genesis. No modifica Nucleus,
Temporal, Gravity ni `mandate.json`; tampoco materializa Gene Revisions.

```text
brain --json intent supply --intent-root <ing> --semantic-index <index>
brain --json intent supply --intent-root <ing> --semantic-index <index> --decisions <json>
brain --json intent supply --intent-root <dis> --semantic-index <index> --ing-result <ing>/ing_result.json
aitap --json route supply --request <request.json> --state-dir <external-directory>
```

`<index>` es la ruta explícita al índice transitorio `.semantic-index.json`.
Debe existir, aun si contiene `{"domains": {}}`. No se infieren organización,
ProjectID, Mandate ni ubicación del índice. ING debe haber sido creado e
hidratado por las superficies existentes; DIS puede empezar en discovery, que
Supply hidrata con el resultado ING verificado y el snapshot explícito.

La primera ejecución ING conserva la clasificación y se detiene para revisión.
`--decisions` recibe un array de objetos con `cluster_id` y `human_decision`:
`approved`, `rejected` u `overridden`. Para `overridden`, `override` contiene el
cluster completo revisado, que vuelve a validarse. Se pueden entregar decisiones
parciales; no hay efectos hasta resolver todos los clusters. Una decisión ya
persistida no se reemplaza silenciosamente. Los turnos de Supply se continúan
con `intent supply`; `add-turn` no puede saltarse esta verificación.

El cierre usa las primitivas de turnos del state manager y el effect ledger,
con commit y avance separados. Las obligaciones lógicas son ratificar
Contributions, verificar el índice transitorio y registrar materialización
pendiente. Los ledgers físicos antiguos no se reinterpretan ni migran. La
evidencia del ledger se relee y contrasta con sus digests antes del cierre.
DIS persiste `.mapping/.turn_N/.files/.mapping_proposal.json`, mantiene
`human_decision: null` y permanece en mapping. Una propuesta vacía válida usa
`operations: []`.

### Transporte y evidencia

Configurar `AITAP_BIN` si el CLI no está en PATH, `NUCLEUS_BIN` para Nucleus y
`AITAP_STATE_DIR` para un directorio externo a repositorios/proyectos. AITAP no
usa variables de entorno como fallback de credenciales. La única referencia
del piloto es `credential-ref://anthropic/default` → `anthropic-key:default`,
resuelta mediante `nucleus --json vault request`.

La policy `intelligence_supply` selecciona directamente Anthropic, sin runtime
de ejecución. El modelo viene del registry. `supply_enabled` expresa autorización
del piloto, no un health probe: los runtimes mantienen health desconocido.
Los límites son 2 intentos, 4096 tokens de salida y 131072 bytes de payload por
inferencia; los tests reales requieren presupuesto explícito adicional.
El registry contiene la tarifa de referencia del modelo; la contabilidad
conserva tokens efectivos, latencia, resultado y costo calculado por intento.
No equivale a una conciliación de factura del proveedor.

AITAP valida únicamente el envelope y el protocolo Anthropic, nunca la semántica
BISP. Brain envía un payload con contexto e instrucciones y el schema del cuerpo
esperado (`clusters` u `operations`). Brain construye la envoltura canónica con
correlación y digests propios; el modelo no concede identidad ni autoridad.

Cada turno guarda `.request.json`, `.routing_decision.json`, `.raw_response.txt`,
`.supply_result.json`, `.parsed_result.json` y `.report.json`. La respuesta cruda
se conserva antes del parsing. Los errores no avanzan la fase. Los checkpoints
usan flush, fsync y reemplazo atómico; los locks del sistema operativo se liberan
al morir el proceso. El índice se bloquea durante snapshot/inferencia/aplicación
para evitar carreras entre coordinadores de este piloto. Escritores externos
deben respetar el mismo lock; no se promete coordinación con consumidores legacy.

AITAP conserva un journal JSON atómico por `logical_inference_id`, con digest de
integridad, intentos, routing y respuesta. Un resultado completado se reproduce
sin Vault ni otra inferencia. Un request distinto bajo la misma identidad falla.
Auth, credenciales, contrato y estado no se reintentan. Rate limit o rechazo
temporal inequívoco permiten retry/failover acotado por policy; el piloto no
configura otro backend de fallback.

**Límite de recuperación remoto:** una caída entre aceptación del provider y
persistencia local deja `in_flight`; un timeout también puede ser ambiguo. Al no
contar con garantía de idempotencia remota, esos casos fallan cerrados y requieren
conciliación externa. No se reinvoca automáticamente ni se afirma exactly-once
remoto. Una respuesta ya persistida sí se recupera y parsea sin otra inferencia.

### Verificación y estado de aceptación

```text
python -m pytest -p no:cacheprovider brain/tests/intent/test_ing_lifecycle.py brain/tests/intent/test_dis_mapping_supply.py brain/tests/intent/test_intelligence_supply.py brain/tests/intent/test_ing_dis_supply_e2e.py installer/aitap/tests
```

Agregar la raíz del repositorio e `installer/aitap/src` al PYTHONPATH. El E2E
controlado usa procesos distintos, protocolo HTTP Messages y un Vault CLI de
fixture: termina Brain después de guardar raw, reinicia, completa ING, produce
una operación DIS y comprueba exactamente dos inferencias y replay idéntico.
Es evidencia controlada, **no** evidencia Anthropic.

`test_real_provider_opt_in.py` está deshabilitado salvo
`AITAP_REAL_PROVIDER_OPT_IN=1`; exige `AITAP_REAL_TEST_STATE_DIR` y
`AITAP_REAL_TEST_MAX_OUTPUT_TOKENS` (1–256). Es solo smoke/replay del transporte,
no cierra el Work. El E2E real completo requiere además Mandate ID, lote, índice,
decisiones humanas revisadas y presupuesto autorizados. Hasta ejecutarlo con
evidencia durable, Mandate Genesis continúa bloqueado.

Referencias de protocolo y tarifa:
[Messages API](https://platform.claude.com/docs/en/api/messages/create) y
[tarifa Sonnet 4](https://www.anthropic.com/news/claude-sonnet-4-5).
