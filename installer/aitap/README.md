# AITap

Router centralizado de acceso a proveedores de IA (Gemini, Claude, OpenAI, xAI)
para todos los clientes del ecosistema Bloom (Brain, Alfred, y los que vengan).

## Estado

Scaffold v0.1. Sin motor de ruteo ni conexion real a Nucleus Vault todavia.
Los comandos (`aitap keys list`, `aitap route status`) son placeholders que
lo dejan explicito. Se implementa cuando encaremos el primer intent real.

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

**Gap real que AITap resuelve (y que hoy no existe en ningun lado):** ruteo
*entre* proveedores. Hoy la rotacion (`GeminiKeyManager`) solo pasa dentro de
un proveedor. Si Gemini se queda sin cuota, nada hace fallback automatico a
Claude. Ese es el motivo de existir de AITap, no solo envolver el vault.

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

**Pendiente a proposito:** el volcado a `installer/help/aitap_help.{json,txt}`
(el directorio compartido con nucleus/sentinel/metamorph/sensor) todavia NO
esta activo. `scripts/generate_help.py` escribe local, en
`installer/aitap/help/` (gitignored), hasta que se decida como/cuando aitap
entra al pipeline de build compartido. Es una buena idea, no una decision
tomada — no la anticipes en el codigo hasta confirmarla.

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
aitap route status            # placeholder

python scripts/generate_help.py   # regenera installer/aitap/help/aitap_help.{json,txt} (LOCAL, no installer/help/)
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

## Pendiente (no implementado en este scaffold)

- Conexion real a Nucleus Vault (`VaultClient`, subprocess `nucleus vault`)
  para `aitap keys add/list/delete`.
- Motor de ruteo inter-proveedor con circuit breaker anticipatorio (leer
  cuota restante antes de fallar, no solo reaccionar a 3 errores consecutivos
  como hace `GeminiKeyManager` hoy).
- Normalizacion de request/response entre las 4 APIs de proveedores.
- Bug de `nucleus health` reportando vault como fallo — pendiente, tema
  separado de este scaffold.
