#!/usr/bin/env bash
# prepare_fg.sh — PASO 2. Prepara la instancia aislada de Ollama para FunctionGemma, SIN descargar.
#
# Arranca `ollama serve` (binario de BloomNucleus) en 127.0.0.1:11435 con OLLAMA_MODELS en
# TerraBiter, GPU desactivada, y la deja corriendo sin modelos. No toca com.bloom.ollama (11434)
# ni ollama.service. Registra qué se escribió en / durante el arranque.
# Para detenerla: bash fg_ollama_isolated.sh stop
set -uo pipefail
DIR="$(dirname "$0")"
source "$DIR/lab_env.sh"
lab_guard
LOG="$LAB_RESULTS/prepare_fg_$(lab_ts).log"
M="$LAB_RUN/marker_$(lab_ts)"; touch "$M"
R0=$(lab_root_free_mb)
{
  bash "$DIR/fg_ollama_isolated.sh" start || exit 1
  bash "$DIR/fg_ollama_isolated.sh" status
  pid=$(cat "$LAB_OLLAMA_PIDFILE")
  echo "RSS de la instancia en reposo: $(ps -o rss= -p "$pid" | tr -d ' ') KiB"
  echo "binario efectivo: $(readlink "/proc/$pid/exe")"
  echo "/ libre: antes ${R0} MB, ahora $(lab_root_free_mb) MB"
  echo "== archivos >100 KB escritos en / desde el arranque (excluye navegadores y Claude; puede tardar ~1 min)"
  find "$HOME" /tmp /var/tmp -xdev -newer "$M" -type f -size +100k \
    -not -path '*/.config/google-chrome/*' -not -path '*/.cache/google-chrome/*' -not -path '*/.config/Claude/*' \
    -printf '%s %p\n' 2>/dev/null | sort -nr | head -20
  echo "== ~/.ollama (la instancia puede crear aquí su clave id_ed25519 si no existía)"
  ls -la "$HOME/.ollama" 2>&1
  echo "== llm-lab"
  du -sh "$LAB"/* 2>/dev/null
} 2>&1 | tee "$LOG"
echo "log: $LOG"
echo "La instancia queda corriendo. Para detenerla: bash $DIR/fg_ollama_isolated.sh stop"
