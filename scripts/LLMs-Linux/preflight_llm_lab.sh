#!/usr/bin/env bash
# preflight_llm_lab.sh — v2, ESTRICTAMENTE DE SOLO LECTURA
#
# Propósito: relevar bell-ubuntu antes de probar FunctionGemma 270M (Ollama) y Laya en CPU.
# Ejecutar en una terminal real de bell-ubuntu, como usuario jose, SIN sudo.
# No usar la VM aislada de Cowork: sus mediciones no representan esta máquina.
#
# Este script NO crea, modifica ni borra archivos; no instala ni descarga nada;
# no consulta Git; no imprime variables de entorno ni /proc/*/environ.
# Las únicas llamadas de red son GET a la API local de Ollama en 127.0.0.1.
#
# Uso sugerido (la única escritura es el log que vos elijas guardar con tee):
#   bash preflight_llm_lab.sh 2>&1 | tee "$HOME/preflight_llm_lab_$(date +%Y%m%dT%H%M%S).log"

set -u
export LC_ALL=C

EXPECTED_HOST="bell-ubuntu"
T="/mnt/terrabiter"
OLLAMA_BIN="/home/jose/.local/share/BloomNucleus/bin/ollama/ollama"
OLLAMA_API="http://127.0.0.1:11434"

sec() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

sec "Identidad del entorno"
date -Is
printf 'hostname: %s\n' "$(hostname)"
printf 'usuario:  %s\n' "$(id -un)"
uname -srmo
grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
if have systemd-detect-virt; then printf 'virtualización: %s\n' "$(systemd-detect-virt 2>/dev/null || echo none)"; fi
if [ "$(hostname)" != "$EXPECTED_HOST" ]; then
  echo "ABORTO: hostname distinto de $EXPECTED_HOST. Este relevamiento debe correr en la máquina real."
  exit 2
fi

sec "Carga actual"
uptime

sec "CPU"
lscpu | grep -E '^(Architecture|Model name|CPU\(s\)|Thread\(s\) per core|Core\(s\) per socket|Socket\(s\)|CPU max MHz)'
printf 'flags relevantes: '
grep -o -w -E 'avx|avx2|fma|f16c|avx512f|avx512_vnni|avx_vnni' /proc/cpuinfo | sort -u | tr '\n' ' '
echo

sec "GPU (solo identificación; la prueba se fija en CPU)"
if have lspci; then lspci -nn | grep -iE 'vga|display|3d' || echo "sin dispositivos de video listados"; else echo "lspci no disponible"; fi
ls -1 /dev/dri 2>/dev/null || echo "/dev/dri no presente"
ls -1 /dev/kfd 2>/dev/null || echo "/dev/kfd no presente (sin ROCm/KFD expuesto)"

sec "RAM y swap"
free -h
grep -E '^(MemTotal|MemAvailable|Buffers|Cached|Shmem|SwapTotal|SwapFree)' /proc/meminfo
if have swapon; then swapon --show 2>/dev/null || true; fi
cat /proc/sys/vm/swappiness 2>/dev/null | sed 's/^/vm.swappiness=/'

sec "Procesos con mayor memoria residente (solo nombre; sin argumentos)"
ps -eo pid,user,rss,comm --sort=-rss | head -15

sec "Espacio y montajes"
df -hT / /home /tmp "$T" 2>&1
df -i / "$T" 2>&1

sec "TerraBiter: montaje y permisos (solo consulta)"
if [ -d "$T" ]; then
  findmnt -no SOURCE,FSTYPE,OPTIONS --target "$T" 2>&1
  echo "--- entrada fstab (claves sensibles ocultas):"
  findmnt --fstab -no SOURCE,FSTYPE,OPTIONS --target "$T" 2>/dev/null \
    | sed -E 's/(password|pass|credentials|cred)=[^,[:space:]]*/\1=<oculto>/g' \
    || echo "(sin entrada en fstab)"
  stat -c 'raíz: owner=%U(%u):%G(%g) modo=%a' "$T"
  if [ -w "$T" ]; then echo "access(W_OK) para $(id -un): sí (declarativo; no prueba escritura real)"; else echo "access(W_OK) para $(id -un): NO"; fi
  if [ -x "$T" ]; then echo "access(X_OK) sobre el directorio: sí"; else echo "access(X_OK) sobre el directorio: NO"; fi
  findmnt -no OPTIONS --target "$T" | tr ',' '\n' | grep -E '^(ro|rw|noexec|nosuid|nodev|uid=|gid=|umask=|fmask=|dmask=|permissions|windows_names|big_writes|prealloc|acl)' || true
  if id ollama >/dev/null 2>&1; then
    echo "usuario ollama: $(id ollama)"
  else
    echo "usuario de sistema 'ollama': no existe"
  fi
else
  echo "$T no existe o no está montado"
fi

sec "Python"
for p in python3 python3.10 python3.11 python3.12 python3.13; do
  if have "$p"; then printf '%-11s %s -> %s\n' "$p" "$(command -v "$p")" "$("$p" -B --version 2>&1)"; fi
done
python3 -B -c 'import venv, ensurepip; print("módulos venv y ensurepip: presentes")' 2>&1
python3 -B -m pip --version 2>&1 | head -1

sec "Herramientas de medición"
for c in curl /usr/bin/time ss sha256sum file; do
  printf '%-14s ' "$c"; command -v "$c" || echo "NO"
done

sec "Ollama: ejecutable esperado de BloomNucleus"
printf 'ruta: %s\n' "$OLLAMA_BIN"
if [ -e "$OLLAMA_BIN" ]; then
  stat -c 'tamaño=%s bytes  modo=%a  owner=%U  mtime=%y' "$OLLAMA_BIN"
  if have file; then file -b "$OLLAMA_BIN"; fi
  if have sha256sum; then sha256sum "$OLLAMA_BIN"; fi
  if [ -x "$OLLAMA_BIN" ]; then
    echo "--- versión (cliente y, si responde, servidor):"
    "$OLLAMA_BIN" --version 2>&1
  else
    echo "existe pero no es ejecutable por $(id -un)"
  fi
else
  echo "NO existe un archivo en la ruta esperada"
fi
printf 'ollama en PATH (solo informativo): '; command -v ollama || echo "no"

sec "Ollama: servicio configurado (system y user)"
if have systemctl; then
  for scope in "" "--user"; do
    label=${scope:-"--system"}
    units=$(systemctl $scope list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -i ollama)
    if [ -z "$units" ]; then echo "[$label] sin unidades *ollama*"; continue; fi
    for u in $units; do
      echo "[$label] unidad: $u"
      printf '  activo: '; systemctl $scope is-active "$u" 2>&1 || true
      printf '  habilitado: '; systemctl $scope is-enabled "$u" 2>&1 || true
      systemctl $scope show "$u" -p User -p FragmentPath -p ExecStart 2>/dev/null | sed 's/^/  /'
      # Solo claves específicas de Ollama; no se imprime el resto del entorno del servicio.
      systemctl $scope show "$u" -p Environment 2>/dev/null \
        | grep -o -E 'OLLAMA_(MODELS|HOST|KEEP_ALIVE|NUM_PARALLEL|MAX_LOADED_MODELS)=[^ ]*' | sed 's/^/  /' || true
    done
  done
else
  echo "systemctl no disponible"
fi

sec "Ollama: procesos en ejecución y binario efectivo"
pids=$(pgrep -x ollama 2>/dev/null; pgrep -f 'ollama (serve|runner)' 2>/dev/null)
pids=$(printf '%s\n' $pids | sort -un)
if [ -z "$pids" ]; then
  echo "sin procesos ollama"
else
  for pid in $pids; do
    exe=$(readlink "/proc/$pid/exe" 2>/dev/null || echo "<no legible sin privilegios>")
    ps -o pid=,user=,rss=,etime=,comm= -p "$pid" | sed 's/^/proceso: /'
    printf '  exe: %s\n' "$exe"
    if [ "$exe" = "$OLLAMA_BIN" ]; then echo "  coincide con el ejecutable esperado"; fi
  done
fi
if have ss; then
  echo "--- escucha en :11434"
  ss -ltnp 'sport = :11434' 2>/dev/null || true
fi

sec "Ollama: API local (solo GET)"
if have curl; then
  for ep in version tags ps; do
    echo "--- GET $OLLAMA_API/api/$ep"
    curl -fsS --max-time 3 "$OLLAMA_API/api/$ep" 2>&1 | head -c 4000
    echo
  done
else
  echo "curl no disponible"
fi
if [ -x "$OLLAMA_BIN" ]; then
  echo "--- $OLLAMA_BIN list"
  "$OLLAMA_BIN" list 2>&1
fi

sec "Tamaño de cachés existentes en / (solo lectura)"
for d in "$HOME/.cache/pip" "$HOME/.cache/huggingface" "$HOME/.cache/torch" "$HOME/.ollama/models" /usr/share/ollama/.ollama/models; do
  if [ -e "$d" ]; then du -sh "$d" 2>/dev/null; else echo "no existe: $d"; fi
done

sec "fin"
