# Ficha de interfaz — Nucleus lanza `doc` (Brain, D1)

**Fecha:** 2026-11-10 · **Base:** código de Brain de D1 (10 archivos; probado en Linux; aún no compilado ni probado como binario en macOS) · **Regla de disparo:** DJ-29

## 1. Cuándo lanzar (DJ-29)

| Intent que terminó | Estado terminal | ¿Lanza `doc`? |
|---|---|---|
| `dev` | `finalize` → `.dev_state.json` `status: completed` | Sí. **Brain ya lo acepta** |
| `dis` | `phase_active: done` (el motor exige `committed: true` para llegar) | Sí, según DJ-29. **Brain todavía no lo acepta** (§5) |
| `ing` | `phase_active: done` después de la publicación canónica del Gene (DJ-31) | Sí, según DJ-29. **Bloqueado:** la publicación no existe |
| `mrg` | `merged` o `aborted` | Sí, según DJ-29. **Sin código** |
| `tst`, `exp`, `asm`, `doc` | — | **No.** Brain rechaza `exp`, `tst` y `asm` como disparador, y rechaza que un `doc` dispare otro |
| Cualquier intent que falló o se canceló | — | **No** (DJ-19). Brain rechaza un `dev` que no llegó a `completed` |

## 2. Entrada (CLI de Brain, salida con `--json`)

```
brain --json intent create -t doc -n <nombre> -p <project> --trigger-intent <id del dev>
brain --json intent hydrate --folder <folder_name> -p <project>
```

| Dato | Obligatorio | Qué es |
|---|---|---|
| `-t doc`, `-n <nombre>` | Sí | La identidad del `doc` sale del nombre: `uuid3(nombre)`. **El mismo nombre es el mismo `doc`**: eso permite reanudar (§4). Sugerido: un nombre derivado del id del disparador |
| `-p <project>` | Sí | Raíz del Project (contiene `.bloom/.intents/`) |
| `--trigger-intent <id>` | Sí, para un disparo de Nucleus | `uuid` del `dev` terminado. Brain toma de su manifiesto de staging (`.pipeline/**/.staging/.staging_manifest.json`) los archivos que tocó |
| `--trigger-file <ruta>` | No | Rutas extra declaradas como cambiadas por el disparador (se pueden repetir) |
| `--doc-level` | No (por defecto `project`) | `project`, `domain`, `gene`, `organization`, `tenant`. `domain` y `gene` salen marcados "declarado, no verificado" |
| `--doc-ref` | Sí, si el nivel es `domain` o `gene` | Id declarado |
| `--doc-document`, `-f` | No, si el Project ya tiene línea base | Sin ellos, Brain reutiliza los documentos e insumos del último contrato finalizado del mismo alcance. **Sin línea base, `hydrate` falla** con "el alcance no tiene documentación registrada" |

## 3. Salida y estados

`hydrate` devuelve `data.doc_run.result` y deja `.doc_state.json` `status`:

| Resultado | `status` | Qué hace Nucleus | Cierre |
|---|---|---|---|
| `empty` | `empty_run` | Nada que sanear | `brain --json intent finalize --folder <f> -p <project>` → `doc_finalize.basis: empty_run` |
| `pending_response` | `pending_response` | Esperar el contenido. El pedido está en `.pipeline/.context/.payload.json`. La respuesta entra con `intent download --folder <f> --input-file <respuesta.json>` y después `intent stage` → `status: draft_ready` | `finalize` → `basis: contract`. Mientras falte contenido, `finalize` falla |
| `anomalies` | `anomalies` | Solo hubo cambios externos: no se sanean | `finalize --declare-anomalies` (una persona los declara y pasan a ser línea base) |
| completado | `completed` | El intent siguiente del Mandate puede arrancar (DJ-20) | — |
| fallo | sin cambio; queda el último `status` | La CLI sale con código ≠ 0 y JSON `"status": "error"`. **El formato del error no es uniforme:** `create` devuelve `error.code`/`error.message`; `finalize` devuelve `message` | Reanudar (§4) |

**Evidencia** (rutas relativas al intent; digests `sha256:<hex>`):

| Archivo | Contenido | Digest registrado en `.doc_state.json` |
|---|---|---|
| `.doc_run.json` | Alcance, disparador, línea base, insumos observados, cambios con atribución (`trigger`/`external`), anomalías, pendientes, `intelligence_calls: 0` | `doc_run.sha256` |
| `.pipeline/.context/.response/.staging/.doc_contract.json` | Documentos con su `draft_ref` y su digest, insumos, nivel, verificación, disparador, modelo, `pending` | `doc_contract.sha256` |
| `.doc_state.json` → `doc_finalize` | `basis`, `finalized_at`, `run_sha256`, `contract_ref`, `contract_sha256`, `baseline` | — |

`finalize` vuelve a comprobar todos los digests. Si un archivo o un insumo cambió, rechaza el cierre.

## 4. Reanudar el mismo `doc` sin repetir el intent anterior (DJ-36)

1. Volver a llamar `intent create` con **el mismo nombre**. Brain devuelve el `doc` existente sin tocarlo (`"resumed": true` y su `status`). No toca el `dev`.
2. Seguir según el `status`: `created` → `hydrate`; `pending_response` → `download` + `stage`; `draft_ready` o `empty_run` → `finalize`; `anomalies` → `finalize --declare-anomalies`; `completed` → nada.
3. Volver a correr `hydrate` siempre es seguro: repite la comparación, es idempotente (DJ-30) y descarta un contrato anterior de esa corrida.

## 5. Brain: qué funciona y qué falta

| Ya funciona (probado en Linux) | Falta en Brain |
|---|---|
| Disparo desde un `dev` finalizado, solo con `--trigger-intent` | Aceptar `dis` como disparador: los `dis` viven en el Nucleus y `download`, `stage` y `validate` solo encuentran intents en `<project>/.bloom/.intents` |
| Comparación por SHA-256 sin inteligencia; `empty`, `pending_response`, `anomalies` | `ing` (espera la publicación del Gene) y `mrg` (sin código) |
| Respuesta por archivo, borrador y contrato; `validate` sin Gemini | Emitir una señal de estado terminal: Brain hoy no avisa a nadie |
| `finalize` con precondición; `--declare-anomalies` | Un formato de error uniforme entre comandos |
| Reanudación por nombre | Compilación con `build-all.py --only brain` y prueba como binario en macOS |
