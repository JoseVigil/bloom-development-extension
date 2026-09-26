#!/usr/bin/env bash
# fg_ollama_isolated.sh — instancia de Ollama AISLADA para evaluar FunctionGemma en CPU.
#
# - Usa un binario 0.30.7 existente (el primero que tenga llama-server; ver lab_env.sh) sin
#   modificarlo, en el puerto 11435.
# - Pesos en /mnt/terrabiter/llm-lab/ollama-models. No toca com.bloom.ollama (11434)
#   ni ollama.service de sistema, ni el almacén de modelos de BloomNucleus.
# - GPU desactivada por entorno; además cada solicitud del benchmark pide num_gpu=0
#   y se verifica size_vram=0 en /api/ps.
#
# Subcomandos:
#   start            arranca la instancia en segundo plano (log en llm-lab/logs)
#   status           versión, modelos presentes y cargados
#   pull             descarga functiongemma:270m (requiere ACEPTO_LICENCIAS=1)
#   bench [args]     corre fg_bench.py contra esta instancia (args extra pasan al .py)
#   raw [args]       corre fg_raw_bench.py: plantilla oficial del GGUF, sin la plantilla de Ollama
#   stop             detiene SOLO la instancia iniciada por este script
set -uo pipefail
source "$(dirname "$0")/lab_env.sh"
FG_MODEL="${FG_MODEL:-functiongemma:270m}"

api() { curl -fsS --max-time "${2:-5}" "$LAB_OLLAMA_URL$1"; }

our_pid() {
  [ -f "$LAB_OLLAMA_PIDFILE" ] || return 1
  local pid; pid=$(cat "$LAB_OLLAMA_PIDFILE")
  [ -d "/proc/$pid" ] || return 1
  local exe ok=1 c; exe=$(readlink "/proc/$pid/exe")
  for c in "${LAB_OLLAMA_CANDIDATES[@]}"; do [ "$exe" = "$(readlink -f "$c")" ] && ok=0; done
  [ "$ok" = "0" ] || return 1
  tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q ' serve' || return 1
  echo "$pid"
}

cmd_start() {
  lab_guard
  [ -x "$LAB_OLLAMA_BIN" ] || lab_die "no existe $LAB_OLLAMA_BIN"
  local ls_bin
  if ! ls_bin=$(lab_llama_server_for "$LAB_OLLAMA_BIN"); then
    echo "Candidatos revisados:"
    for c in "${LAB_OLLAMA_CANDIDATES[@]}"; do printf '  %s -> llama-server: %s\n' "$c" "$(lab_llama_server_for "$c" || echo 'NO')"; done
    lab_die "no hay llama-server junto a $LAB_OLLAMA_BIN; sin él Ollama 0.30.x no puede cargar modelos (HTTP 500)"
  fi
  echo "ollama:       $LAB_OLLAMA_BIN ($(sha256sum "$LAB_OLLAMA_BIN" | cut -c1-12), $("$LAB_OLLAMA_BIN" --version 2>/dev/null | tail -1))"
  echo "llama-server: $ls_bin ($(sha256sum "$ls_bin" | cut -c1-12))"
  if pid=$(our_pid); then echo "ya está corriendo (pid $pid)"; return 0; fi
  if ss -ltn "sport = :$LAB_OLLAMA_PORT" | grep -q LISTEN; then lab_die "el puerto $LAB_OLLAMA_PORT está ocupado por otro proceso"; fi
  mkdir -p "$LAB_OLLAMA_MODELS"
  local log="$LAB_LOGS/ollama-$LAB_OLLAMA_PORT-$(lab_ts).log"
  env \
    OLLAMA_HOST="$LAB_OLLAMA_ADDR" \
    OLLAMA_MODELS="$LAB_OLLAMA_MODELS" \
    OLLAMA_NUM_PARALLEL=1 \
    OLLAMA_MAX_LOADED_MODELS=1 \
    OLLAMA_KEEP_ALIVE=10m \
    OLLAMA_VULKAN=0 \
    CUDA_VISIBLE_DEVICES=-1 \
    HIP_VISIBLE_DEVICES=-1 \
    ROCR_VISIBLE_DEVICES=-1 \
    GPU_DEVICE_ORDINAL=-1 \
    GGML_VK_VISIBLE_DEVICES=-1 \
    TMPDIR="$TMPDIR" \
    nohup "$LAB_OLLAMA_BIN" serve > "$log" 2>&1 &
  echo $! > "$LAB_OLLAMA_PIDFILE"
  for _ in $(seq 1 30); do api /api/version >/dev/null 2>&1 && break; sleep 0.5; done
  api /api/version || { tail -20 "$log"; lab_die "la instancia no respondió"; }
  echo
  echo "pid $(cat "$LAB_OLLAMA_PIDFILE"), log: $log"
  echo "--- detección de cómputo en el log:"
  grep -iE 'inference compute|compatible GPU|library=|total_vram|vulkan|rocm' "$log" | grep -v 'server config' || echo "(sin líneas de detección todavía)"
}

cmd_status() {
  if pid=$(our_pid); then echo "instancia aislada: pid $pid"; else echo "instancia aislada: detenida"; fi
  echo "--- /api/version"; api /api/version; echo
  echo "--- /api/tags";    api /api/tags; echo
  echo "--- /api/ps";      api /api/ps; echo
}

cmd_pull() {
  lab_guard; lab_license_gate
  our_pid >/dev/null || lab_die "primero: $0 start"
  local out="$LAB_RESULTS/fg_pull_$(lab_ts)"; mkdir -p "$out"
  lab_cmdlog_init "$out/commands.log"
  lab_snapshot > "$out/machine_before.txt"
  local rc
  lab_run_watched "$out/root_watch.log" env OLLAMA_HOST="$LAB_OLLAMA_ADDR" "$LAB_OLLAMA_BIN" pull "$FG_MODEL" > "$out/pull.log" 2>&1
  rc=$?
  tr '\r' '\n' < "$out/pull.log" | grep -v '^$' | tail -5
  lab_check_root
  [ "$rc" = "0" ] || lab_die "ollama pull falló (rc=$rc); ver $out/pull.log y $out/root_watch.log"
  api /api/tags > "$out/tags.json"
  curl -fsS "$LAB_OLLAMA_URL/api/show" -H 'Content-Type: application/json' \
       -d "{\"model\":\"$FG_MODEL\"}" > "$out/show.json"
  du -sh "$LAB_OLLAMA_MODELS" | tee "$out/models_du.txt"
  python3 - "$out" "$FG_MODEL" <<'PY'
import json, sys
out, model = sys.argv[1], sys.argv[2]
tags = json.load(open(f"{out}/tags.json"))
show = json.load(open(f"{out}/show.json"))
m = next((x for x in tags.get("models", []) if x.get("name") == model or x.get("model") == model), {})
print("modelo:", model)
print("digest:", m.get("digest"))
print("tamaño bytes:", m.get("size"))
print("detalles:", json.dumps(show.get("details", {}), ensure_ascii=False))
lic = show.get("license") or ""
print("licencia incluida en el manifiesto:", (lic[:200].replace("\n", " ") + "...") if lic else "(ninguna)")
open(f"{out}/license_from_manifest.txt", "w").write(lic)
PY
  echo "evidencia en $out"
}

cmd_bench() {
  lab_guard
  our_pid >/dev/null || lab_die "primero: $0 start"
  python3 -B "$LAB_SCRIPTS_DIR/fg_bench.py" \
    --url "$LAB_OLLAMA_URL" --model "$FG_MODEL" \
    --server-pid "$(cat "$LAB_OLLAMA_PIDFILE")" \
    --results-root "$LAB_RESULTS" "$@"
  local rc=$?
  lab_check_root aviso   # el benchmark sólo escribe resultados en TerraBiter
  return $rc
}

cmd_raw() {
  lab_guard
  our_pid >/dev/null || lab_die "primero: $0 start"
  python3 -B "$LAB_SCRIPTS_DIR/fg_raw_bench.py" \
    --url "$LAB_OLLAMA_URL" --model "$FG_MODEL" --models-dir "$LAB_OLLAMA_MODELS" \
    --results-root "$LAB_RESULTS" "$@"
  local rc=$?
  lab_check_root aviso
  return $rc
}

cmd_stop() {
  if pid=$(our_pid); then
    kill "$pid" && echo "detenido pid $pid"
    for _ in $(seq 1 20); do [ -d "/proc/$pid" ] || break; sleep 0.5; done
    rm -f "$LAB_OLLAMA_PIDFILE"
  else
    echo "no hay instancia aislada iniciada por este script"
  fi
}

case "${1:-}" in
  start) cmd_start ;;
  status) cmd_status ;;
  pull) cmd_pull ;;
  bench) shift; cmd_bench "$@" ;;
  raw) shift; cmd_raw "$@" ;;
  stop) cmd_stop ;;
  *) echo "uso: $0 {start|status|pull|bench [args]|raw [args]|stop}"; exit 2 ;;
esac
