# Laboratorio local: FunctionGemma 270M en CPU (bell-ubuntu)

Evaluación **aislada** de un modelo local para Cognituum. No se modifica Cognituum, AITAP,
el Ollama de BloomNucleus ni el estado de Git (estos scripts son archivos nuevos sin commitear).
Ninguna respuesta de modelo se ejecuta ni adquiere autoridad: FunctionGemma sólo *propone*
llamadas a herramientas ficticias.

## Estado verificado (2026-09-25)

| Dato | Valor | Fuente |
|---|---|---|
| CPU | Ryzen 5 PRO 2400G, 4c/8t, AVX2/FMA/F16C, sin AVX-512 | preflight v2 |
| RAM | 14 GiB total, ~8 GiB disponibles; swap 3,3 de 4 GiB en uso | preflight v2 |
| `/` | ext4 cifrado, 99 % de uso, entre 1,9 y 3,6 GB libres según el momento | preflight v2 / probe |
| TerraBiter | `/dev/sda1` ntfs3 rw, unidad `mnt-terrabiter.mount`, ~846 GB libres | followup |
| Escritura en TerraBiter | archivos, 153 MB/s con fsync, exec, chmod, symlinks, hardlinks, flock, rename, mmap, venv: **todo OK** | probe |
| Python | 3.12.3, venv/ensurepip presentes | preflight v2 |
| Ollama BloomNucleus | 0.30.7 (sha256 `8565…deb5`), `com.bloom.ollama` en 127.0.0.1:11434, sin modelos | preflight v2 |
| `/usr/local/bin/ollama` | **mismo binario** (sha256 idéntico) | followup |
| `ollama.service` (sistema) | **ciclo de reinicios**: 54 220 reinicios, `bind: address already in use` cada 3 s | followup |
| Carga de CPU | ClickHouse ≈ 5,5 núcleos sostenidos; 8 % de CPU ociosa | followup |
| GPU | Raven Ridge `1002:15dd`; `jose` no está en el grupo `render` (no abre `/dev/kfd`) | preflight / followup |

## Rutas (todo en TerraBiter)

```
/mnt/llms/llm-lab/
  ollama-models/   OLLAMA_MODELS de la instancia aislada (puerto 11435)
  pip-cache/ cache/ tmp/   PIP_CACHE_DIR, XDG_CACHE_HOME, TMPDIR
  logs/ run/       logs y pidfile de la instancia aislada
  results/         una carpeta por ejecución: commands.log, raw.jsonl, summary.json, summary.md
```

Guardas en `lab_env.sh` (se aplican a todos los scripts): el host tiene que ser bell-ubuntu y el
usuario no puede ser root; TerraBiter tiene que estar montado en rw sobre otro dispositivo; `/` tiene
que tener al menos 1200 MB libres, y un paso aborta si `/` pierde más de 150 MB. Las descargas
exigen `ACEPTO_LICENCIAS=1`.

## Orden de ejecución

Todos los pasos se corren como `jose`, sin sudo, en una terminal de bell-ubuntu, desde esta carpeta:

```bash
cd ~/repos/bloom-development-extension/scripts/LLM
```

| Paso | Comando | Red / descarga | Qué confirmar antes de seguir |
|---|---|---|---|
| 1 | `bash verify_paths.sh` | no | `RESULTADO: todas las rutas en TerraBiter`, `11435 libre`, `/` con ≥ 1200 MB |
| 2 | `bash prepare_fg.sh` | no | detección de cómputo en el log, `/api/tags` vacío, ningún archivo grande nuevo en `/` |
| 3 | leer la licencia (Gemma Terms of Use) | — | decisión explícita de aceptar la evaluación local |
| 4 | `ACEPTO_LICENCIAS=1 bash fg_ollama_isolated.sh pull` | sí (~300 MB) | digest y licencia del manifiesto en `results/fg_pull_*`; `/` sin caída |
| 5 | `bash fg_ollama_isolated.sh bench --cases cases/fg_cases_en.json` | no | `CPU confirmada: True`; `results/fg_bench_*_en_*` |
| 6 | `bash fg_ollama_isolated.sh bench --cases cases/fg_cases_es.json` | no | resultado multilingüe, aparte del inglés |
| 7 | `bash fg_ollama_isolated.sh stop` | no | la instancia de 11435 detenida |

La descarga (paso 4) corre bajo el **vigilante continuo de `/`**:
cada 2 s se registra el espacio libre en `root_watch*.log`, y la etapa se corta si `/` baja
de 1200 MB o pierde más de 500 MB (ClickHouse mueve `/` por su cuenta; al final de cada etapa se listan los archivos >1 MB escritos en `/` para atribuirlos) (`LAB_ROOT_MIN_FREE_MB`, `LAB_ROOT_MAX_DROP_MB`).

Para una medición con ClickHouse en su carga habitual, dejar `--condition carga_actual`.
Si se decide medir en otra condición, usar otra etiqueta; estos scripts no detienen
ClickHouse ni ningún servicio.

La medición con el modelo residente junto con Cognituum es un paso posterior.

## Qué mide cada benchmark

- **FunctionGemma (`fg_bench.py`)**: descarga el modelo de memoria y hace una solicitud fría
  (`load_duration` y tiempo de pared); después, N repeticiones calientes por caso (20 por
  defecto). Reporta mediana, p95 y peor caso del tiempo de pared y de `total_duration`; pico de
  RSS del servidor y sus procesos hijos; MemAvailable mínimo; `size_vram` en `/api/ps` como
  prueba de CPU. Calidad por separado: herramienta correcta, argumentos correctos, abstención
  (TP/FN/FP/TN de "llamar o no"), herramientas inventadas y consistencia entre repeticiones.
  Opciones: `temperature=0`, `seed=42`, `num_gpu=0`.
- Cada ejecución guarda loadavg y MemAvailable al inicio y al final, y los procesos con mayor
  uso de CPU. La etiqueta `--condition` distingue "carga_actual" de otras
  condiciones (por ejemplo, con ClickHouse detenido).

## Licencias y fuentes verificadas (2026-09-25)

- **Gemma Terms of Use** (modificados el 1 de abril de 2026): permiten el uso local. Al distribuir el modelo o derivados hay que trasladar las restricciones de la sección 3.2, entregar el acuerdo, marcar archivos modificados e incluir un aviso NOTICE. Google no reclama derechos sobre las salidas y se reserva restringir el uso a distancia si hay violación. https://ai.google.dev/gemma/terms
- **FunctionGemma en Ollama**: la página no se pudo leer desde la sesión; el paso 4 guarda la licencia incluida en el manifiesto (`license_from_manifest.txt`).

## Estado del disco TerraBiter (2026-09-25 17:40)

- `/dev/sda` Seagate ST1000DX001 (1 TB, híbrido), 6197 h encendido. SMART: PASSED, pero
  `Current_Pending_Sector=360`, `Offline_Uncorrectable=360`, `Reported_Uncorrect=56`, `Reallocated_Sector_Ct=0`.
- El kernel registró `Medium Error — Unrecovered read error` en los sectores 190604880 y 190605616;
  el modelo descargado (`sha256-415f8f95…`) quedó ilegible a partir de los 29 MiB.
- El montaje de `/mnt/terrabiter` **no está en /etc/fstab** (se montó a mano tras el arranque):
  no persiste al reiniciar. Los guardas de `lab_env.sh` abortan si no está montado.
- Recuperación: `llms_disk.sh` (versión con etiqueta llms; `terrabiter_rebuild.sh` queda sólo por si su borrado estaba en curso) (status → wipe → format → verify). Borra todo el disco y lo
  reconstruye con etiqueta **`llms`**, montado en **`/mnt/llms`** (todos los scripts usan esa ruta vía `LAB_T`).
  Después de reconstruirlo: `verify_paths.sh`, `probe_write_terrabiter.sh` y volver a bajar el modelo.

## Pendientes y límites conocidos

1. **Página de Ollama de FunctionGemma** sin leer (tamaño y versión mínima); la instancia es 0.30.7.
2. **Carga de CPU**: ClickHouse consume entre 4,7 y 5,5 núcleos (loadavg de 8 a 14); las latencias representan esta máquina *cargada*.
3. **`ollama.service` de sistema** en ciclo de reinicios (unos 4 cada 10 s, más de 55 000 en total). Estos scripts no lo tocan.
4. FunctionGemma se evalúa **sin ajuste fino**; un mal resultado sin ajuste no descarta el modelo ajustado.
