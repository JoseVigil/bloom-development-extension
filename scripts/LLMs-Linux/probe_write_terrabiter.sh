#!/usr/bin/env bash
# probe_write_terrabiter.sh — PRUEBA DE ESCRITURA ACOTADA Y REVERSIBLE (requiere tu aprobación)
#
# Qué escribe: SOLO dentro de un directorio nuevo y único:
#   $LAB_T/llm-lab/_probe_<fecha>_<pid>/   (LAB_T por defecto /mnt/llms)
# y crea $LAB_T/llm-lab/ si no existe (queda vacío, como destino futuro del laboratorio).
# Nada fuera de $LAB_T. No instala ni descarga. No toca Cognituum, AITAP, Ollama ni Git.
# Al final borra SOLO su propio directorio _probe_*, tras verificar la ruta real.
# Para conservarlo como evidencia: KEEP=1 bash probe_write_terrabiter.sh
#
# Correr como jose, sin sudo, en una terminal real de bell-ubuntu:
#   bash probe_write_terrabiter.sh 2>&1 | tee "$HOME/probe_write_$(date +%Y%m%dT%H%M%S).log"

set -u
export LC_ALL=C
T="${LAB_T:-/mnt/llms}"
LAB="$T/llm-lab"
P="$LAB/_probe_$(date +%Y%m%dT%H%M%S)_$$"
SIZE_MB="${SIZE_MB:-1024}"
ok()   { printf '  [OK]    %s\n' "$1"; }
bad()  { printf '  [FALLA] %s\n' "$1"; }
sec()  { printf '\n===== %s =====\n' "$1"; }

sec "Guardas previas"
[ "$(hostname)" = "bell-ubuntu" ] || { echo "ABORTO: no es bell-ubuntu"; exit 2; }
mountpoint -q "$T" || { echo "ABORTO: $T no es un punto de montaje; escribir ahí caería en /"; exit 3; }
FST=$(findmnt -no FSTYPE --target "$T" | tail -1)
echo "sistema de archivos: $FST"
findmnt -no OPTIONS --target "$T" | tail -1 | grep -qw rw || { echo "ABORTO: montado de solo lectura"; exit 4; }
free_mb=$(df -Pm "$T" | awk 'NR==2{print $4}')
[ "$free_mb" -gt $((SIZE_MB * 3)) ] || { echo "ABORTO: espacio libre insuficiente ($free_mb MB)"; exit 5; }
root_before=$(df -Pk / | awk 'NR==2{print $4}')
echo "libre en TerraBiter: ${free_mb} MB | libre en /: $((root_before/1024)) MB"

sec "1. Crear directorio"
mkdir -p "$LAB" && mkdir "$P" && ok "creado $P" || { bad "no se pudo crear $P"; exit 6; }
[ "$(stat -c %d "$P")" = "$(stat -c %d "$T")" ] && [ "$(stat -c %d "$T")" != "$(stat -c %d /)" ] && ok "el directorio está en el FS de TerraBiter" || { bad "el directorio NO está en TerraBiter"; exit 7; }
stat -c '  owner=%U(%u):%G(%g) modo=%a' "$P"

sec "2. Escritura secuencial ${SIZE_MB} MB con fsync"
t0=$(date +%s.%N)
dd if=/dev/zero of="$P/big.bin" bs=1M count="$SIZE_MB" conv=fsync status=none && ok "escritura completa" || bad "escritura"
t1=$(date +%s.%N)
awk -v a="$t0" -v b="$t1" -v s="$SIZE_MB" 'BEGIN{printf "  %.1f s  →  %.1f MB/s\n", b-a, s/(b-a)}'
echo "  (la lectura de pesos real se medirá en frío dentro de cada prueba de modelo)"

sec "3. Permisos: bit de ejecución y chmod"
printf '#!/bin/sh\necho exec-ok\n' > "$P/x.sh"
stat -c '  modo al crear: %a' "$P/x.sh"
chmod 755 "$P/x.sh" && stat -c '  tras chmod 755: %a' "$P/x.sh"
out=$("$P/x.sh" 2>&1) && [ "$out" = "exec-ok" ] && ok "ejecución de script" || bad "ejecución de script: $out"
chmod 600 "$P/x.sh"; m=$(stat -c %a "$P/x.sh"); [ "$m" = "600" ] && ok "chmod respetado (600)" || bad "chmod no respetado (quedó $m)"
cp /bin/true "$P/true.bin" && chmod 755 "$P/true.bin" && "$P/true.bin" && ok "ejecución de binario ELF" || bad "ejecución de binario ELF"

sec "4. Enlaces"
( cd "$P" && ln -s x.sh link_rel ) && [ "$(readlink "$P/link_rel")" = "x.sh" ] && [ -e "$P/link_rel" ] && ok "symlink relativo" || bad "symlink relativo"
ln -s "$P/x.sh" "$P/link_abs" && [ -e "$P/link_abs" ] && ok "symlink absoluto" || bad "symlink absoluto"
mkdir "$P/d1" && ( cd "$P" && ln -s d1 dlink ) && [ -d "$P/dlink" ] && ok "symlink a directorio" || bad "symlink a directorio"
ln "$P/x.sh" "$P/hard" 2>/dev/null && ok "hardlink" || bad "hardlink (no crítico)"

sec "5. Semántica usada por pip / Hugging Face / Ollama"
python3 -B - "$P" <<'PY'
import os, sys, fcntl, mmap
p = sys.argv[1]
def r(ok, msg): print(("  [OK]    " if ok else "  [FALLA] ") + msg)
# flock exclusivo
try:
    with open(os.path.join(p, "lock"), "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB); fcntl.flock(f, fcntl.LOCK_UN)
    r(True, "flock exclusivo")
except Exception as e: r(False, f"flock: {e}")
# rename atómico sobre archivo existente
try:
    a, b = os.path.join(p, "a.tmp"), os.path.join(p, "b.dat")
    open(a, "w").write("1"); open(b, "w").write("0"); os.replace(a, b)
    r(open(b).read() == "1", "os.replace atómico sobre existente")
except Exception as e: r(False, f"os.replace: {e}")
# sensibilidad a mayúsculas
try:
    open(os.path.join(p, "Case"), "w").write("A"); open(os.path.join(p, "case"), "w").write("b")
    r(open(os.path.join(p, "Case")).read() == "A", "nombres sensibles a mayúsculas")
except Exception as e: r(False, f"mayúsculas: {e}")
# nombres con ':' (Ollama usa 'sha256-...'; HF usa nombres largos)
try:
    open(os.path.join(p, "sha256-" + "a"*64), "w").write("x"); r(True, "nombre largo tipo blob")
    open(os.path.join(p, "a:b"), "w").write("x"); r(True, "nombre con ':'")
except Exception as e: r(False, f"nombres: {e}")
# mmap de lectura (llama.cpp mapea pesos)
try:
    with open(os.path.join(p, "big.bin"), "rb") as f:
        m = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ); _ = m[0]; _ = m[len(m)-1]; m.close()
    r(True, "mmap de lectura")
except Exception as e: r(False, f"mmap: {e}")
PY

sec "6. venv real (sin pip, sin red)"
if python3 -m venv --without-pip "$P/venv_symlink" 2>&1; then
  "$P/venv_symlink/bin/python" -B -c 'import sys; print("  python del venv:", sys.executable, sys.version.split()[0])' && ok "venv con symlinks" || bad "venv con symlinks no ejecuta"
else bad "creación de venv con symlinks"; fi
if python3 -m venv --without-pip --copies "$P/venv_copies" 2>&1; then
  "$P/venv_copies/bin/python" -B -c 'print("  ok")' && ok "venv con --copies" || bad "venv con --copies no ejecuta"
else bad "creación de venv con --copies"; fi

sec "7. Efecto sobre /"
root_after=$(df -Pk / | awk 'NR==2{print $4}')
echo "  variación de espacio libre en /: $(( (root_after - root_before) / 1024 )) MB (esperado ≈ 0; otros procesos pueden moverlo)"

sec "8. Limpieza"
if [ "${KEEP:-0}" = "1" ]; then
  echo "  KEEP=1: se conserva $P"
else
  real=$(realpath "$P")
  case "$real" in
    "$LAB"/_probe_*) rm -rf -- "$real" && ok "borrado $real" || bad "no se pudo borrar $real" ;;
    *) bad "ruta inesperada ($real); no se borra nada" ;;
  esac
fi
ls -la "$LAB"

sec "fin"
