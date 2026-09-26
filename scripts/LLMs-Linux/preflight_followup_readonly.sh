#!/usr/bin/env bash
# preflight_followup_readonly.sh — ESTRICTAMENTE DE SOLO LECTURA
# Aclara lo que dejó abierto preflight v2 en bell-ubuntu:
#   A) ¿el ollama.service de sistema está en bucle de reinicios por el puerto 11434?
#   B) ¿qué binario y versión es /usr/local/bin/ollama?
#   C) ¿cómo se monta TerraBiter (no hay entrada en fstab) y hay avisos de ntfs3?
#   D) ¿quién consume CPU? (load average ~8 con 8 hilos)
#   E) ¿el Ollama de BloomNucleus detectó GPU (Vega/ROCm/Vulkan) o corre en CPU?
# No crea, modifica ni borra archivos; no instala ni descarga; no consulta Git;
# no imprime variables de entorno. Los logs se filtran a líneas específicas.
# Correr como jose, sin sudo, en una terminal real de bell-ubuntu:
#   bash preflight_followup_readonly.sh 2>&1 | tee "$HOME/preflight_followup_$(date +%Y%m%dT%H%M%S).log"

set -u
export LC_ALL=C
T="/mnt/terrabiter"
SYS_BIN="/usr/local/bin/ollama"
SAFE_LOG_RE='inference compute|compatible GPU|no compatible|rocm|ROCm|vulkan|Vulkan|amdgpu|gfx[0-9]|library=|total_vram|Listening on|bind|address already in use|error|Error|panic|failed|exited|Main process'
sec() { printf '\n===== %s =====\n' "$1"; }

sec "Identidad"
date -Is; hostname
if [ "$(hostname)" != "bell-ubuntu" ]; then echo "ABORTO: no es bell-ubuntu"; exit 2; fi

sec "A) ollama.service de sistema: política y reinicios"
systemctl show ollama -p ActiveState -p SubState -p Restart -p RestartUSec -p NRestarts \
  -p ExecMainStartTimestamp -p ExecMainStatus -p ExecMainCode 2>&1
echo "--- dos lecturas de ExecMainPID separadas 5 s (si cambia, el proceso se está reiniciando)"
systemctl show ollama -p ExecMainPID --value; sleep 5; systemctl show ollama -p ExecMainPID --value
echo "--- journal del servicio de sistema (últimas 400 líneas, filtradas; puede requerir grupo adm/systemd-journal)"
journalctl -u ollama -n 400 --no-pager -o short-iso 2>&1 | grep -E "$SAFE_LOG_RE" | grep -v 'server config' | tail -40

sec "B) Binario de sistema $SYS_BIN"
if [ -e "$SYS_BIN" ]; then
  ls -l "$SYS_BIN"; readlink -f "$SYS_BIN"
  stat -c 'tamaño=%s bytes owner=%U mtime=%y' "$(readlink -f "$SYS_BIN")"
  sha256sum "$(readlink -f "$SYS_BIN")"
  # --version consulta el servidor en 11434 (BloomNucleus); la línea del cliente es la que interesa.
  "$SYS_BIN" --version 2>&1
else
  echo "no existe"
fi

sec "C) Montaje de TerraBiter"
printf 'mountpoint: '; mountpoint "$T" 2>&1
findmnt -no SOURCE,FSTYPE,OPTIONS --target "$T" | tail -1
systemctl list-units --type=mount --all --no-legend 2>/dev/null | grep -i terrabiter || echo "sin unidad .mount de systemd"
systemctl list-units --type=automount --all --no-legend 2>/dev/null | grep -i terrabiter || echo "sin automount"
lsblk -o NAME,FSTYPE,LABEL,SIZE,MOUNTPOINTS /dev/sda 2>&1
echo "--- avisos ntfs3 del kernel (puede requerir permisos para leer el journal del kernel)"
journalctl -k -b --no-pager 2>&1 | grep -iE 'ntfs3|sda1' | tail -20

sec "D) CPU: procesos con mayor uso (instantánea, solo nombre)"
top -b -n 1 -o %CPU 2>/dev/null | sed -n '1,5p'
ps -eo pid,user,%cpu,rss,comm --sort=-%cpu | head -15
echo "--- promedio de 5 s por proceso (pidstat si existe)"
if command -v pidstat >/dev/null; then S_TIME_FORMAT=ISO pidstat -u 5 1 2>/dev/null | grep -v Average | sort -k8 -nr | head -12; else echo "pidstat no instalado (sysstat); se omite"; fi

sec "E) Ollama de BloomNucleus: detección de GPU en su log"
systemctl --user show com.bloom.ollama.service -p ActiveState -p NRestarts -p ExecMainStartTimestamp 2>&1
journalctl --user -u com.bloom.ollama.service --no-pager -o short-iso 2>&1 | grep -E "$SAFE_LOG_RE" | grep -v 'server config' | tail -30
echo "--- permisos de dispositivos GPU"
ls -l /dev/kfd /dev/dri/renderD128 2>&1
id -nG

sec "fin"
