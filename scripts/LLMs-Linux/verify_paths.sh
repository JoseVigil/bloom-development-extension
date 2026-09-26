#!/usr/bin/env bash
# verify_paths.sh — PASO 1. Evidencia actual, sin red ni descargas.
#
# Comprueba en bell-ubuntu que entorno Python, PyTorch, pesos, cachés, temporales y resultados
# apuntan a TerraBiter; registra el espacio de /, la carga de ClickHouse y los reinicios de
# ollama.service. No detiene ni modifica ningún servicio.
# Escribe sólo: las carpetas de $LAB_T/llm-lab (por defecto /mnt/llms) y un log en llm-lab/results.
set -uo pipefail
source "$(dirname "$0")/lab_env.sh"
lab_guard
LOG="$LAB_RESULTS/verify_paths_$(lab_ts).log"
{
  date -Is
  echo "== montaje"
  findmnt -no SOURCE,FSTYPE,OPTIONS --target "$LAB_T" | tail -1
  printf 'persistente en /etc/fstab: '; grep -q "[[:space:]]${LAB_T}[[:space:]]" /etc/fstab && echo sí || echo no
  echo "== espacio (MB)"
  df -Pm / "$LAB_T"
  echo "== dispositivo de / = $(stat -c %d /) | de $LAB_T = $(stat -c %d "$LAB_T")"
  bad=0
  for v in HF_HOME PIP_CACHE_DIR TORCH_HOME XDG_CACHE_HOME TMPDIR LAB_OLLAMA_MODELS LAB_LAYA_VENV LAB_RESULTS LAB_LOGS LAB_RUN; do
    p="${!v}"; t="$p"; [ -e "$t" ] || t="$(dirname "$p")"
    d=$(stat -c %d "$t")
    if [ "$d" = "$(stat -c %d "$LAB_T")" ]; then ok="OK"; else ok="FUERA DE $LAB_T"; bad=1; fi
    printf '%-18s %-42s dev=%-6s %s\n' "$v" "$p" "$d" "$ok"
  done
  printf 'tempfile.gettempdir(): '; python3 -B -c 'import tempfile; print(tempfile.gettempdir())'
  printf 'pip cache dir:         '; python3 -m pip cache dir 2>&1
  echo "== ClickHouse (promedio de 5 s)"
  if command -v pidstat >/dev/null; then S_TIME_FORMAT=ISO pidstat -u -C clickhouse 5 1 | grep -v Average
  else ps -C clickhouse-server -o pid,%cpu,rss,etime,comm; fi
  echo "== loadavg"; cat /proc/loadavg
  echo "== ollama.service (sistema): dos lecturas separadas 10 s"
  systemctl show ollama -p NRestarts -p ActiveState -p SubState
  sleep 10
  systemctl show ollama -p NRestarts -p SubState
  echo "== com.bloom.ollama (usuario)"
  systemctl --user show com.bloom.ollama.service -p ActiveState -p NRestarts -p MainPID
  echo "== binarios de Ollama y su llama-server (necesario para inferencia en 0.30.x)"
  for c in "${LAB_OLLAMA_CANDIDATES[@]}"; do
    printf '  %s -> llama-server: %s\n' "$c" "$(lab_llama_server_for "$c" || echo 'NO ENCONTRADO')"
  done
  echo "  elegido para el laboratorio: $LAB_OLLAMA_BIN"
  echo "== puertos 11434 / 11435"
  ss -ltn '( sport = :11434 or sport = :11435 )'
  if ss -ltn 'sport = :11435' | grep -q LISTEN; then echo "11435 OCUPADO"; else echo "11435 libre"; fi
  [ "$bad" = "0" ] && echo "RESULTADO: todas las rutas en $LAB_T" || echo "RESULTADO: HAY RUTAS FUERA DE $LAB_T — no continuar"
} 2>&1 | tee "$LOG"
echo "log: $LOG"
