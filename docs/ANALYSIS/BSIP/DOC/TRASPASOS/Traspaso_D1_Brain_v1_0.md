# Traspaso D1 — `doc` de punta a punta e idempotente (Brain)

## Identificación

| Campo | Valor |
|---|---|
| Etapa | D1 del encargo rector `Encargo_Doc_Intent_Actualizacion_Viva_v1_0.md` §7 |
| Estado | **Implementada y probada en la nube. La compuerta oficial (Mac, binario compilado por el flujo oficial) está pendiente: la corre José** |
| Fecha | 2026-11-10 |
| Quién | Cowork "intent DOC" (Claude), con las decisiones de José del 2026-11-10 |
| Commit base | `520445022f089b1f506e95c9e340add0e124841e` (`main` en la Mac y en GitHub). Antes de escribir se comprobó que las copias de la Mac de los siete archivos modificados eran idénticas a ese commit |
| Máquina de las pruebas | Contenedor en la nube (Linux, Python 3.13), clon público. `pytest` en un entorno aparte (`D1_evidencia/pip_freeze.txt`); `PYTHONPATH` con la raíz del repo e `installer/aitap/src` (H-5) |
| Git | Ninguna acción. Commit y push los hace José |

## Lectura del traspaso anterior

`TRASPASOS/Traspaso_P0_Estado_Partida_v1_0.md`: compuerta pasada en `5204450`; las 14 anclas siguen. D1 parte de ese estado.

## Decisiones aplicadas (José, 2026-11-10)

| # | Decisión | Dónde quedó en el código |
|---|---|---|
| P1 | Forma 3. Comparación, digests y detección de corrida vacía son mecánicos y no usan inteligencia. El contenido llega por archivo de respuesta. Si falta una respuesta necesaria, `doc` queda pendiente y no puede finalizar. `plan` y `validate` no llaman a Gemini en este recorrido. `download` se repara solo para admitir la respuesta de `doc` | `doc_run.compare`; `intent_manager._run_doc_comparison`; `download_manager.validate_protocol` (etapa `context` solo para `doc`); `validation_manager._validate_doc`; guarda en `plan.py` |
| P48/P34 | Se compara por hash toda la documentación registrada dentro del alcance declarado. Se sanea lo que difiere y corresponde al intent disparador. Los cambios externos se marcan como anomalías y no se sanean | `doc_run.compare`: `attribution` `trigger` / `external`; `anomalies` |
| P5 | `finalize` exige un registro verificable de corrida vacía o un borrador con contrato validado, archivos y digests coincidentes, y nada pendiente | `doc_run.verify`; rama `doc` de `finalize_intent` |
| P3 | Docbase existente de `FilesCompressor`; SHA-256 aparte para el contrato | `_run_doc_comparison` (modo `docbase`); `doc_run.sha256_file` |
| P4 | Se conservan los nombres del código; `.docbase.json` y `.docbase_index.json`; artefactos nuevos `.doc_contract.json` y `.doc_run.json` | `.context/.files/.docbase*.json`; `<intent>/.doc_run.json`; `.pipeline/.context/.response/.staging/.doc_contract.json`; el pedido de contenido usa el nombre existente `.pipeline/.context/.payload.json` |
| P10 | Se repara el motor actual de `doc`, sin migrar a `IntentStateManager` | Estados nuevos en `.doc_state.json`: `pending_response`, `empty_run`, `draft_ready`, `anomalies` |

## Recorrido implementado

| # (encargo §12) | Comando | Qué hace |
|---|---|---|
| 3 | `brain intent create -t doc … --doc-document <ruta> [--doc-level …] [--doc-ref …] [--trigger-intent …] [--trigger-file …]` | Guarda el alcance (DJ-1) y el disparador. Sin `--trigger-intent`, la corrida es manual y las rutas cambiadas las declara una persona. Con `--trigger-intent`, en D1 solo se acepta un `dev` finalizado (DJ-29, DJ-19); `doc` no dispara `doc` (DJ-24); `tst`, `exp` y `asm` se rechazan |
| 4-6 | `brain intent hydrate` | Codebase (estado real), docbase y comparación mecánica. Escribe `.doc_run.json` con `intelligence_calls: 0`. Resultado: `empty`, `pending_response` (con pedido en `.pipeline/.context/.payload.json`) o `anomalies` |
| 7 | `brain intent download --input-file` | Recibe la respuesta por archivo, etapa `context` |
| 7, 9 | `brain intent stage` | Solo acepta documentos pendientes de saneo en esta corrida. Rechaza si los insumos cambiaron desde la comparación. Escribe el borrador en `.staging/` y `.doc_contract.json` |
| 8 | `brain intent validate` | Validación mecánica del contrato; no llama a Gemini |
| 10 | `brain intent finalize` | Precondición de P5 |

**Línea base en D1.** La "documentación registrada" es la del último contrato finalizado para el mismo alcance (nivel + id), verificado por su digest, más los documentos declarados en la corrida. Una corrida vacía no crea línea base nueva: apunta al contrato contra el que comparó. El registro gobernado (DJ-13) llega en D2.

**El borrador no se aplica al Project** (DJ-2, DJ-4): queda en el intent.

## Archivos

| Archivo | Cambio |
|---|---|
| `brain/core/intent/doc_run.py` | **Nuevo.** Comparación, pedido, contrato y verificación. Sin red ni clientes de inteligencia |
| `brain/core/intent_manager.py` | `create_intent`: alcance y disparador para `doc`. `hydrate_intent`: llama a la comparación. `finalize_intent`: precondición de P5 solo para `doc`. Se conservaron los finales de línea mixtos del archivo (CRLF/LF) |
| `brain/core/intent/staging_manager.py` | Para `doc`: detecta la etapa `context` (GAP #4), restringe los destinos de la respuesta y escribe `.doc_contract.json` |
| `brain/core/intent/validation_manager.py` | Para `doc`: validación mecánica, sin Gemini (evita GAP #5 en este recorrido) |
| `brain/core/download_manager.py` | Para `doc`: acepta solo la etapa `context` |
| `brain/commands/intent/download.py` | **Pieza mínima que impedía D1:** importaba `brain.core.intent.download_manager`, que no existe; el módulo está en `brain/core/download_manager.py`. El comando fallaba para cualquier tipo de intent |
| `brain/commands/intent/create.py` | Opciones `--doc-level`, `--doc-ref`, `--doc-document`, `--trigger-intent`, `--trigger-file` |
| `brain/commands/intent/plan.py` | `--type doc` se rechaza: el recorrido de `doc` no usa `plan` ni Gemini |
| `brain/tests/intent/test_doc_d1.py` | **Nuevo.** 16 pruebas |

`brain/build_deploy/brain.spec` no se tocó: `build_main.py` corre `update_spec_hiddenimports.py`, y se comprobó en el clon que agrega `brain.core.intent.doc_run` solo.

## Pruebas (nube)

| Corrida | Resultado |
|---|---|
| `brain/tests/intent/test_doc_d1.py` | **16 pasan** |
| `brain/tests` completo | **60 pasan, 2 fallan.** Las dos fallas son anteriores y no cambiaron: `test_cli_v2_suite` (por `gen_domain.py`, igual que en E0) y `test_ing_dis_supply_e2e::test_ing_dis_subprocess_http_crash_and_replay` (`SEMANTIC_PARSE_FAILED`). Antes de los cambios: 44 pasan, las mismas 2 fallan |

Qué cubren las pruebas nuevas:
- Compuerta (a): borrador con contrato; finalizar antes de la respuesta falla por "pendiente de respuesta".
- Compuerta (b): segunda corrida vacía, sin escritura fuera del intent nuevo, digests iguales, sin llamada a inteligencia (los clientes de Gemini se reemplazan por objetos que hacen fallar la prueba si se tocan).
- Compuerta (c): cambio atribuido al disparador → detecta, pide respuesta y escribe.
- Compuerta (d): `domain` y `gene` → "declarado, no verificado"; exigen `--doc-ref`.
- Cambio externo de un insumo y edición de un documento fuera del sistema → anomalías, sin saneo.
- Respuesta fuera de los pendientes, insumos cambiados entre comparación y respuesta, y borrador alterado → bloqueo.
- `doc` no dispara `doc`; un `dev` sin finalizar no dispara.
- `download` rechaza etapas de `dev` en un `doc`; el comando `download` ya importa su módulo.
- `plan --type doc` se rechaza.
- `finalize` de `dev` sin cambios.

Además se corrió por la CLI real (`python -m brain`) la misma secuencia de la compuerta de la Mac, sobre una réplica del Project de prueba: `D1_evidencia/simulacion_compuerta_nube.txt`.

## Compuerta oficial de D1 (pendiente)

| Campo | Valor |
|---|---|
| Quién | José |
| Máquina | Mac, en `tests/brain/doc-intent-tests`, desde la raíz del repo |
| Antes | Compilar e instalar Brain por el flujo oficial (`brain/build_deploy/build_main.py`), para que el binario `~/Library/BloomNucleus/bin/brain/brain` incluya estos cambios |
| Comandos | `D1_evidencia/comandos_compuerta_mac.txt`, de a uno. Los nombres de carpeta son deterministas (`uuid3` del nombre), así que no hace falta copiar ids |
| Respuesta por archivo | `D1_evidencia/respuesta_compuerta.json` |
| Qué tiene que salir | 1) `hydrate` de "a": `"result": "pending_response"`. 2) El primer `finalize` de "a" falla con "pendiente de respuesta". 3) `finalize` de "a": `"basis": "contract"`. 4) `hydrate` de "b": `"result": "empty"` y `"intelligence_calls": 0`. 5) `finalize` de "b": `"basis": "empty_run"`. 6) `hydrate` de "c": `"result": "pending_response"`. 7) `finalize` de "c": `"basis": "contract"`. 8) `hydrate` de "d gene": `"verification": "declarado, no verificado"` |
| Evidencia | La salida de cada comando, pegada en `Traspaso_D1_Compuerta_Mac_v1_0.md`, con el sha256 del binario |
| Nota | El comando de "c" agrega una línea a `structural_projection.go` del Project de prueba (excluido de git). Para repetir la compuerta desde cero, José decide si restaura ese archivo y borra los intents `d1-compuerta-*` |

## Lo que sigue pendiente

| # | Pendiente | Dueño |
|---|---|---|
| D1-1 | Correr la compuerta oficial en la Mac | José |
| D1-2 | **Corrida con solo anomalías.** P5, aplicada tal cual, no deja finalizar una corrida que encontró solo cambios externos: no es vacía ni dejó borrador. Dentro de un Mandate, el intent siguiente queda esperando hasta que alguien declare la anomalía. Falta definir cómo se declara o se cierra (DJ-16; registro de D2) | José |
| D1-3 | **Relación código → documento (DC-5).** No existe. Si cambia un insumo atribuido al disparador, se piden todos los documentos del alcance | José; Brain |
| D1-4 | Los intents `doc` creados antes de D1 no tienen alcance: no corren la comparación y `finalize` los rechaza. La extensión llama `intent finalize` (`src/api/adapters/BrainApiAdapter.ts:186`) y recibe ese error | José decide si se migran o se descartan |
| D1-5 | Disparo desde `ing`, `dis` y `mrg`, y señal hacia Nucleus | D3-D5; P49 |
| D1-6 | Reanudación del `doc` (DJ-36, P50) | Su etapa |
| D1-7 | Piezas del pipeline de `doc` fuera de este recorrido, sin tocar: `submit` (GAP #3), `merge` y `parse` para `doc`, turnos de `curation` (GAP #6, #8), `.doc.json` frente a `.context.json` (queda el del código, P4) | Brain, cuando una etapa las necesite |
| D1-8 | DOC spec y árbol de referencia no describen todavía este recorrido (P9) | Brain |
| D1-9 | Registro gobernado de documentos; reemplaza la línea base por contrato | D2 (P27-P31) |
| D1-10 | Persistir el borrador en su ubicación final | Dependencia externa (DJ-4) |

## Qué no se hizo

No se tocó Nucleus, Genes, Authority, AITAP ni el contrato del Mandate. No se editó el contrato Genesis 1.2.0 ni se ejecutó su grafo. No se usó Gemini ni ninguna inteligencia. No se tocó `~/Library/BloomNucleus`.

## Mensaje de commit propuesto

```
Repair the doc intent path for stage D1: mechanical comparison by SHA-256 before any intelligence call, empty runs recorded in .doc_run.json, content by response file, draft contract in .doc_contract.json, and a finalize precondition that requires a verifiable empty run or a validated draft with nothing pending. Domain and gene scopes are marked declared, not verified. External changes are recorded as anomalies and never sanitized. Fix the download command import and accept only the context stage for doc. Validate doc mechanically without Gemini and refuse plan for doc. Adds brain/core/intent/doc_run.py and brain/tests/intent/test_doc_d1.py, plus the D1 handoff record and evidence.
```

## Evidencia

| Archivo (`TRASPASOS/D1_evidencia/`) | sha256 |
|---|---|
| `pytest_d1.txt` | `6e19033ca9e7ea5e47b8998750ca7440cc0d7ddbe20fd5df48d5ce8325acf3e1` |
| `simulacion_compuerta_nube.txt` | `ef545d5db791c6ef5895485298969efab69e8d2c7dab44f9d64c714e1a0e3e70` |
| `comandos_compuerta_mac.txt` | `320e72b5e31df568a2503a9d3994bcacb81968beca43c0529d8f7343b0cb8f18` |
| `respuesta_compuerta.json` | `d36f329ae4972667056465bb66761af46543a4b6e3dfe4fc7fb1bdd1f2794828` |
| `d1_cambios.patch` | `2e4590758d1b328c05538f9e6f50632de5a97cc1face7fd793d32abb6f779954` |
| `pip_freeze.txt` | `6a7bed981c0e71d8e8c98b0b9daf2640b73eb213d0fb0445d4e4e2bd3108f42e` |
