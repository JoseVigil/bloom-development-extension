# shellcheck shell=bash
# lab_env.sh — configuración común del laboratorio LLM local (para usar con `source`).
# No hace nada por sí mismo salvo definir variables y funciones.
# Todo lo pesado (entornos, pesos, cachés, temporales, resultados) vive en TerraBiter.

LAB_EXPECTED_HOST="bell-ubuntu"
LAB_T="${LAB_T:-/mnt/llms}"   # disco "llms" (ex-TerraBiter), reconstruido con llms_disk.sh
LAB="$LAB_T/llm-lab"
LAB_RESULTS="$LAB/results"
LAB_LOGS="$LAB/logs"
LAB_RUN="$LAB/run"
LAB_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Cachés y temporales fuera de /
export HF_HOME="$LAB/hf"
export PIP_CACHE_DIR="$LAB/pip-cache"
export TORCH_HOME="$LAB/torch"
export XDG_CACHE_HOME="$LAB/cache"
export TMPDIR="$LAB/tmp"
export PYTHONDONTWRITEBYTECODE=1
export HF_HUB_DISABLE_TELEMETRY=1

# Ollama: instancia APARTE. BloomNucleus y /usr/local/bin tienen el mismo binario 0.30.7 (sha256 8565…deb5),
# pero la inferencia necesita el ejecutable compañero `llama-server` (junto al binario o en ../lib/ollama).
# Se elige el primer candidato que lo tenga; LAB_OLLAMA_BIN=<ruta> fuerza uno.
LAB_OLLAMA_CANDIDATES=("/home/jose/.local/share/BloomNucleus/bin/ollama/ollama" "/usr/local/bin/ollama")
lab_llama_server_for() {  # imprime la ruta de llama-server que usaría ese binario de ollama
  local d; d=$(dirname "$1")
  local c
  for c in "$d/llama-server" "$d/../lib/ollama/llama-server" "$d/lib/ollama/llama-server"; do
    if [ -x "$c" ]; then readlink -f "$c"; return 0; fi
  done
  return 1
}
if [ -z "${LAB_OLLAMA_BIN:-}" ]; then
  for _b in "${LAB_OLLAMA_CANDIDATES[@]}"; do
    if [ -x "$_b" ] && lab_llama_server_for "$_b" >/dev/null; then LAB_OLLAMA_BIN="$_b"; break; fi
  done
  LAB_OLLAMA_BIN="${LAB_OLLAMA_BIN:-${LAB_OLLAMA_CANDIDATES[0]}}"
  unset _b
fi
LAB_OLLAMA_PORT="11435"
LAB_OLLAMA_ADDR="127.0.0.1:$LAB_OLLAMA_PORT"
LAB_OLLAMA_URL="http://$LAB_OLLAMA_ADDR"
LAB_OLLAMA_MODELS="$LAB/ollama-models"
LAB_OLLAMA_PIDFILE="$LAB_RUN/ollama-$LAB_OLLAMA_PORT.pid"

# Laya
LAB_LAYA_VENV="$LAB/venv-laya"
LAYA_VERSION="${LAYA_VERSION:-0.3.20}"

# Umbrales de protección de /
LAB_ROOT_MIN_FREE_MB="${LAB_ROOT_MIN_FREE_MB:-1200}"   # no arrancar si / tiene menos que esto
# / varía por otros procesos (ClickHouse): se observó -100 MB en 45 s y oscilaciones de 1,9 a 3,6 GB.
# El piso es el corte duro; la caída se tolera más amplia y la atribución se hace listando archivos nuevos.
# Tope de caída: si no se fija, se calcula al iniciar cada etapa como max(500 MB, 25 % del libre inicial).
LAB_ROOT_MAX_DROP_MB_FIXED="${LAB_ROOT_MAX_DROP_MB:-}"

lab_die() { echo "ABORTO: $*" >&2; exit 1; }
lab_ts() { date +%Y%m%dT%H%M%S; }
lab_root_free_mb() { df -Pm / | awk 'NR==2{print $4}'; }

lab_guard() {
  [ "$(hostname)" = "$LAB_EXPECTED_HOST" ] || lab_die "hostname distinto de $LAB_EXPECTED_HOST"
  [ "$(id -u)" != "0" ] || lab_die "no correr como root"
  mountpoint -q "$LAB_T" || lab_die "$LAB_T no está montado; escribir ahí caería en /"
  findmnt -no OPTIONS --target "$LAB_T" | tail -1 | grep -qw rw || lab_die "$LAB_T montado de solo lectura"
  [ "$(stat -c %d "$LAB_T")" != "$(stat -c %d /)" ] || lab_die "$LAB_T está en el mismo dispositivo que /"
  local free; free=$(lab_root_free_mb)
  [ "$free" -ge "$LAB_ROOT_MIN_FREE_MB" ] || lab_die "/ tiene sólo ${free} MB libres (mínimo ${LAB_ROOT_MIN_FREE_MB})"
  mkdir -p "$LAB" "$LAB_RESULTS" "$LAB_LOGS" "$LAB_RUN" "$HF_HOME" "$PIP_CACHE_DIR" "$TORCH_HOME" "$XDG_CACHE_HOME" "$TMPDIR"
  [ "$(stat -c %d "$TMPDIR")" = "$(stat -c %d "$LAB_T")" ] || lab_die "TMPDIR no quedó en TerraBiter"
  LAB_ROOT_BASELINE_MB="$free"
  if [ -n "$LAB_ROOT_MAX_DROP_MB_FIXED" ]; then LAB_ROOT_MAX_DROP_MB="$LAB_ROOT_MAX_DROP_MB_FIXED"
  else LAB_ROOT_MAX_DROP_MB=$(( free / 4 > 500 ? free / 4 : 500 )); fi
  echo "protección de /: libre ${free} MB, piso ${LAB_ROOT_MIN_FREE_MB} MB, caída máxima tolerada ${LAB_ROOT_MAX_DROP_MB} MB"
  LAB_STAGE_MARKER="$LAB_RUN/stage_marker_$$"; touch "$LAB_STAGE_MARKER"
}

# Lista archivos >1 MB escritos en / (home, /tmp, /var/tmp) desde lab_guard, para atribuir escrituras.
lab_root_new_files() {
  [ -n "${LAB_STAGE_MARKER:-}" ] && [ -e "$LAB_STAGE_MARKER" ] || return 0
  echo "archivos >1 MB escritos en / durante la etapa (excluye navegadores y Claude):"
  timeout 180 find "$HOME" /tmp /var/tmp -xdev -newer "$LAB_STAGE_MARKER" -type f -size +1M \
    -not -path '*/.config/google-chrome/*' -not -path '*/.cache/google-chrome/*' -not -path '*/.config/Claude/*' \
    -printf '  %s %p\n' 2>/dev/null | sort -k1 -nr | head -20
}

# Llamar después de cada paso. Con "aviso" (etapas que no descargan) sólo informa; si no, aborta.
lab_check_root() {
  local mode="${1:-cortar}" now drop; now=$(lab_root_free_mb); drop=$(( LAB_ROOT_BASELINE_MB - now ))
  echo "espacio libre en /: antes ${LAB_ROOT_BASELINE_MB} MB, ahora ${now} MB (cambio $(( -drop )) MB; incluye otros procesos)"
  lab_root_new_files
  if [ "$drop" -gt "$LAB_ROOT_MAX_DROP_MB" ] || [ "$now" -lt "$LAB_ROOT_MIN_FREE_MB" ]; then
    if [ "$mode" = "aviso" ]; then
      echo "AVISO: / bajó ${drop} MB o quedó bajo ${LAB_ROOT_MIN_FREE_MB} MB; si la lista de arriba está vacía, no lo escribió el laboratorio"
    else
      lab_die "/ perdió ${drop} MB o quedó con ${now} MB; revisar qué escribió en /"
    fi
  fi
}

# Vigilante continuo de / durante una etapa larga (descarga o instalación).
# Cada 2 s registra el espacio libre; si / baja de LAB_ROOT_MIN_FREE_MB o cae más de
# LAB_ROOT_MAX_DROP_MB respecto de la línea base, termina el proceso vigilado.
lab_watch_root() {  # uso: lab_watch_root <pid> <log>
  local target=$1 log=$2 now drop
  while kill -0 "$target" 2>/dev/null; do
    now=$(lab_root_free_mb); drop=$(( LAB_ROOT_BASELINE_MB - now ))
    printf '%s libre_root_mb=%s caida_mb=%s\n' "$(date +%T)" "$now" "$drop" >> "$log"
    if [ "$now" -lt "$LAB_ROOT_MIN_FREE_MB" ] || [ "$drop" -gt "$LAB_ROOT_MAX_DROP_MB" ]; then
      echo "VIGILANTE: / con ${now} MB libres (caída ${drop} MB); se detiene el pid $target" | tee -a "$log" >&2
      pkill -TERM -P "$target" 2>/dev/null   # hijos directos (p. ej. python bajo /usr/bin/time)
      kill "$target" 2>/dev/null
      return 1
    fi
    sleep 2
  done
}

# Ejecuta un comando bajo el vigilante y devuelve su código de salida.
lab_run_watched() {  # uso: lab_run_watched <log_vigilante> comando args...
  local wlog=$1; shift
  printf '%s + %s\n' "$(date -Is)" "$*" >> "${LAB_CMDLOG:-/dev/null}"
  "$@" &
  local pid=$!
  lab_watch_root "$pid" "$wlog" &
  local wpid=$!
  wait "$pid"; local rc=$?
  kill "$wpid" 2>/dev/null; wait "$wpid" 2>/dev/null
  return "$rc"
}

# Las descargas exigen confirmación explícita de que se leyeron las licencias.
lab_license_gate() {
  [ "${ACEPTO_LICENCIAS:-}" = "1" ] || lab_die "falta ACEPTO_LICENCIAS=1 (leer Gemma Terms of Use y la licencia de Laya antes de descargar)"
}

# Registro de comandos ejecutados
lab_cmdlog_init() { LAB_CMDLOG="$1"; : > "$LAB_CMDLOG"; }
lab_run() { printf '%s + %s\n' "$(date -Is)" "$*" >> "${LAB_CMDLOG:-/dev/null}"; "$@"; }

# Instantánea del estado de la máquina (sin argumentos de procesos ni entorno)
lab_snapshot() {
  echo "fecha: $(date -Is)"
  echo "loadavg: $(cut -d' ' -f1-3 /proc/loadavg)"
  grep -E '^(MemTotal|MemAvailable|SwapTotal|SwapFree)' /proc/meminfo
  echo "--- top CPU (nombre de proceso)"
  ps -eo pid,user,%cpu,rss,comm --sort=-%cpu | head -8
}
