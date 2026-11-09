# Traspaso E0 — Preparación (CANCELADA)

## Identificación

| Campo | Valor |
|---|---|
| Etapa | E0, Preparación (plan v0.1) |
| Estado | **Cancelada por José el 2026-11-07:** "Cancelá la etapa E0. No se mide dev como condición previa." |
| Fecha | Del 2026-11-06 al 2026-11-07 |
| Quién lo ejecutó | Cowork "DOC Intent" (pruebas en la nube); José (corrida en la Mac) |
| Máquinas | Contenedor en la nube (Linux, Python 3.13, Go 1.24.7); Mac de José (Darwin) |
| Código | Commit `21a00dc43abfe8f7b241a5644c83c9cb8429f630`, que es `main` = `origin/main` en la Mac, verificado en `.git/refs`. Binario de Brain: `~/Library/BloomNucleus/bin/brain/brain`, `brain release 0.1.8 build 14`. La versión coincide con `brain/VERSION`. **No se confirmó** que el binario se haya compilado desde ese commit |

## Lectura del traspaso anterior

No hay: E0 era la primera etapa.

## Qué se hizo

### 1. PR-0: corrida de referencia de las pruebas que ya existen (nube)

| Corredor | Resultado | Evidencia |
|---|---|---|
| Brain, `pytest brain/tests` | **43 pasan, 2 fallan.** (1) `test_cli_v2_suite::test_suite_commands_follow_unified_template`: a `brain/commands/intent/gen_domain.py` le faltan dos partes de la plantilla de comandos. (2) `test_ing_dis_supply_e2e::test_ing_dis_subprocess_crash_and_re_execute_preserve_contract_d`: termina en `VAULT_ACCESS_DENIED`; necesita la identidad de servicio de AITAP y no se puede evaluar en la nube | `E0_evidencia/pr0_brain_pytest.txt` |
| Nucleus, `go test ./...` | **23 paquetes pasan**, entre ellos `mandatecontract`, `mandatestate`, `watchers`, `temporal`, `temporal/workflows`, `gene` y `authority`. **Fallan 5:** `orchestration/activities` (no compila: el chequeo de printf de `go vet` en Go 1.24); `orchestration/workflows` (compilación rota); `mandatedelivery` (ciclo de imports en las pruebas); `orchestration/acceptance` (usa `syscall.OpenCurrentProcessToken`, que solo existe en Windows); `intelligencesupply` (necesita la CLI de AITAP) | `E0_evidencia/pr0_nucleus_gotest.txt` |
| Impact, `go test ./...` | Pasan `evaluation` y `adapters`. Falla `internal/cli`: "generated txt help is stale". `internal/core` no se puede evaluar en la nube, porque compila Nucleus por su cuenta | `E0_evidencia/pr0_impact_gotest.txt` |
| Parser Gravity | Pasa (salida vacía, código de salida 0) | `E0_evidencia/pr0_gravity_parser.txt` |
| Extensión, `npm test` | No se ejecutó: `test-installation.js` no existe | — |

**Condiciones de la corrida.** Ninguna tocó el repo, y el clon quedó limpio:
- `pytest` se instaló en un entorno aparte (`E0_evidencia/pip_freeze.txt`).
- Brain necesita `PYTHONPATH` con la raíz del repo y `installer/aitap/src`.
- Las dependencias de Go se trajeron de GitHub con un `go.mod` alternativo fuera del repo, porque la nube bloquea el proxy de Go.

### 2. Project de prueba (Mac)

- Ruta: `tests/brain/doc-intent-tests`, excluida con `.git/info/exclude`.
- `git status` no la muestra.
- Contiene `.bloom/` vacío y los cuatro archivos del vertical de Gravity. Sus sha256 coinciden con el commit:

```text
f27697c489a56fea3032ce62a681bf7cef02240838e466cc3bb8c959948d9fe1  installer/nucleus/internal/gravity/structural_projection.go
a5add36e0b7ab750d3e0bdaf6ba64992595b8851a91dbd48c82ea8af22660052  installer/nucleus/internal/gravity/structural_projection_logging.go
61611af827e2ba7e57162f8fa49178f77392ea96c3f18e0cf0389942d9bd0671  installer/nucleus/internal/gravity/structural_projection_logging_test.go
65c74f28f7d6429d1160120ced16d3002f20d6a67ad0806fb0bec9a99d768d39  installer/nucleus/internal/gravity/structural_projection_test.go
```

### 3. Medición de `dev`, interrumpida por la cancelación

| Paso | Resultado |
|---|---|
| `intent create -t dev` | Funcionó. Intent `9f7d9b50-ef61-31d8-b344-79f7090d84c0`, carpeta `.lb0-dev-gravity-9f7d9b50`, con un archivo inicial |
| `intent hydrate --id` | Funcionó. Estado `hydrated`; generó `.codebase.json` y `.codebase_index.json`; contexto de 11.76 KB |
| `intent plan` | Cortó: "No Gemini keys available with sufficient quota". Las fotos S1 (después de `hydrate`) y S2 (después de `plan`) son idénticas: `plan` no escribió nada |

Foto S1 = S2, archivos del intent:

```text
3ae7290236d0828de0db2b27814dfb7e13564f0563f4c19083bd455b105071d8  .bloom/.intents/.dev/.lb0-dev-gravity-9f7d9b50/.briefing/.files/.codebase.json
4c15f1e2461a7a0e75b95397f6b4fe624670ea0b651a4006171b493bec46d697  .bloom/.intents/.dev/.lb0-dev-gravity-9f7d9b50/.briefing/.files/.codebase_index.json
9ccc5ab0963d72766afe8a66378106d9b9560971c92a594370b2f31409b6f2b1  .bloom/.intents/.dev/.lb0-dev-gravity-9f7d9b50/.dev_state.json
```

El intent `dev` sigue en el Project de prueba. Sirve para la verificación R-2 del plan v0.2.

## Qué se decidió

| Decisión | Quién |
|---|---|
| Project de prueba dentro de `tests/brain/`, aislado y fuera de cualquier commit (P42) | José |
| Copiar solo los cuatro archivos del vertical | José |
| `pytest` solo en el entorno de prueba; la forma permanente se decide en la etapa 1 (P43) | José |
| Traspasos en `docs/ANALYSIS/BSIP/DOC/TRASPASOS/` y en el Project (P44) | José |
| Lectura de elias-repos autorizada, solo lectura; no es destino de un merge. No se usó | José |
| Correr con el binario instalado y no con `brain/.venv`, en el que faltaba `typer` (C-7) | José |
| Cancelar E0 | José |

## Hallazgos

| # | Hallazgo | Cita |
|---|---|---|
| H-1 | `create` sugiere `hydrate --intent-id`, pero `hydrate` acepta `--id` / `-i` | Salida de `create`; ayuda de `hydrate` |
| H-2 | `brain/.venv` no es el runtime productivo: en la Mac falla con `No module named 'typer'` | Corrida de José |
| H-3 | El `plan` de Brain lee `gemini-profiles` y después `gemini-key:<perfil>` del vault (`brain/shared/credentials/gemini_manager.py:150-190`). El onboarding de Conductor guarda solo `gemini-key:default` (`installer/conductor/workspace/onboarding/ipc/onboarding-handlers.js:85-110`). Solo `brain gemini keys-add` escribe `gemini-profiles`. Además, `_load_profiles` atrapa cualquier error y devuelve vacío (`gemini_manager.py:386-399`), así que el mensaje es el mismo si no hay perfiles, si se agotó la cuota o si el vault falla. **Causa probable del corte, no comprobada:** no se leyó el vault | Código |
| H-4 | `pytest` no está declarado en Brain. Hay dos antecedentes en el repo: `agentic-harness/requirements-dev.txt` y el grupo `test` de `installer/aitap/pyproject.toml` | Código |
| H-5 | Las pruebas de Brain necesitan un `PYTHONPATH` que el repo no documenta | Corrida PR-0 |

## Inconsistencias

| # | Inconsistencia |
|---|---|
| I-60 | Los archivos del programa están en dos lugares con rutas distintas: en el repo, `docs/ANALYSIS/BSIP/DOC/`; en el Project BTIPS, `ANALYSIS/DOC/` (más los nuevos en `ANALYSIS/BSIP/DOC/`). Hay que decidir si se unifican |

## Evidencia

| Archivo | sha256 |
|---|---|
| `E0_evidencia/pr0_brain_pytest.txt` | `adad0c0d197191ed0f245c7c61dac949a1c00eaac06f8bde505c408b679359db` |
| `E0_evidencia/pr0_nucleus_gotest.txt` | `5e4fbbd8004d6fb63610b4343c8f78b6498b3d104b56c4aae16cef73f3161d59` |
| `E0_evidencia/pr0_impact_gotest.txt` | `8f45b2983f5bb8623fdb8e8065e1022dee53ab853e785171cac0d39e563822bf` |
| `E0_evidencia/pr0_gravity_parser.txt` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (vacío) |
| `E0_evidencia/pip_freeze.txt` | `aaffcea8fa4a2c8a8d21284da2fd28aa62b424206c93f0f3b32f9309e7ccfa2d` |

## Qué necesita el próximo encargo (E1 del plan v0.2)

- Respuestas de José a P1, P3, P4, P5 y P10.
- Una decisión sobre H-3: sin clave utilizable, el `plan` y el `validate` de `doc` cortan igual que los de `dev`.
- Las decisiones de José sobre qué riesgos de §4 del plan v0.2 se miden.
- El Project de prueba ya está listo y no hay que volver a armarlo.
