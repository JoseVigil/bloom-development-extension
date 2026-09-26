#!/usr/bin/env bash
# laya_bench.sh — corre laya_bench.py bajo /usr/bin/time -v, con guardas de disco y licencias.
#
# Dos modos, elegidos automáticamente según la caché de Hugging Face en TerraBiter:
#   * descarga: el checkpoint todavía no está en HF_HOME. Se corre con REPEATS=1 y
#     CONDITION=descarga; su tiempo de carga INCLUYE la descarga y no es válido como medición.
#   * offline:  el checkpoint ya está en caché. Se fuerza HF_HUB_OFFLINE=1 (prueba que no usa
#     la red) y ésta es la corrida que vale para latencia, memoria y calidad.
# Ambas corridas están bajo el vigilante continuo de / (lab_run_watched).
#
# Uso:
#   ACEPTO_LICENCIAS=1 bash laya_bench.sh cases/laya_cases_en.json    # 1ª vez: descarga
#   ACEPTO_LICENCIAS=1 bash laya_bench.sh cases/laya_cases_en.json    # 2ª vez: medición offline
#   Multilingüe 322M (ficha del modelo: laya.load(repo, subfolder="multilingual")):
#   1ª vez:  ACEPTO_LICENCIAS=1 LAYA_LABEL=322M-multi LAYA_LOAD_KWARGS='{"subfolder": "multilingual"}' LAYA_ALLOW_ONLINE=1 \
#                bash laya_bench.sh cases/laya_cases_es.json
#   2ª vez:  igual pero sin LAYA_ALLOW_ONLINE=1 (medición offline)
# Variables: REPEATS (20), CONDITION (carga_actual), LAYA_REPO, LAYA_LOAD_KWARGS, LAYA_LABEL,
#            THREADS, LAYA_ALLOW_ONLINE=1 (fuerza el modo descarga aunque haya caché).
set -uo pipefail
source "$(dirname "$0")/lab_env.sh"
lab_guard; lab_license_gate
CASES="${1:?falta archivo de casos}"
PY="$LAB_LAYA_VENV/bin/python"
[ -x "$PY" ] || lab_die "falta el venv; correr laya_install.sh"

LANG_CASES=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["language"])' "$CASES")
LABEL="${LAYA_LABEL:-421M-en}"
if [ "$LANG_CASES" != "en" ] && [ "$LABEL" = "421M-en" ]; then
  lab_die "casos en '$LANG_CASES' con el checkpoint inglés: usar el multilingüe (LAYA_LABEL/LAYA_LOAD_KWARGS)"
fi

REPO="${LAYA_REPO:-convaiinnovations/laya}"
CACHE_DIR="$HF_HOME/hub/models--${REPO//\//--}"
if [ "${LAYA_ALLOW_ONLINE:-0}" != "1" ] && [ -d "$CACHE_DIR/snapshots" ] && [ -n "$(ls -A "$CACHE_DIR/snapshots" 2>/dev/null)" ]; then
  HF_MODE="offline"; export HF_HUB_OFFLINE=1
  RUN_REPEATS="${REPEATS:-20}"; RUN_CONDITION="${CONDITION:-carga_actual}"
else
  HF_MODE="descarga"; unset HF_HUB_OFFLINE
  RUN_REPEATS=1; RUN_CONDITION="descarga"
fi
echo "modo Hugging Face: $HF_MODE (caché: $CACHE_DIR)"
[ "$HF_MODE" = "descarga" ] && echo "AVISO: esta corrida descarga pesos; su tiempo de carga no es una medición válida. Repetir después para medir offline."

LK="${LAYA_LOAD_KWARGS:-}"; [ -n "$LK" ] || LK='{}'
OUT="$LAB_RESULTS/laya_run_$(lab_ts)_${LABEL}_${LANG_CASES}_${HF_MODE}"; mkdir -p "$OUT"
lab_cmdlog_init "$OUT/commands.log"
lab_snapshot > "$OUT/machine_before.txt"
lab_run_watched "$OUT/root_watch.log" /usr/bin/time -v -o "$OUT/time_v.txt" "$PY" -B "$LAB_SCRIPTS_DIR/laya_bench.py" \
  --repo "$REPO" \
  --load-kwargs "$LK" \
  --checkpoint-label "$LABEL" \
  --hf-mode "$HF_MODE" \
  --cases "$CASES" --repeats "$RUN_REPEATS" \
  --condition "$RUN_CONDITION" --threads "${THREADS:-0}" \
  --results-root "$LAB_RESULTS"
rc=$?
lab_snapshot > "$OUT/machine_after.txt"
grep -E 'Maximum resident set size|Elapsed \(wall clock\)|Exit status|Major \(requiring I/O\)' "$OUT/time_v.txt"
du -sh "$HF_HOME" | tee "$OUT/hf_du.txt"
lab_check_root
if [ "$rc" != "0" ] && [ "$HF_MODE" = "offline" ]; then
  echo "Si falló por falta de archivos en caché (otro checkpoint/revisión), repetir con LAYA_ALLOW_ONLINE=1."
fi
exit $rc
