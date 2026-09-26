#!/usr/bin/env bash
# llms_disk.sh — BORRA Y RECONSTRUYE el disco ex-TerraBiter (/dev/sda) como "llms" en /mnt/llms.
#
# ¡DESTRUCTIVO! Borra TODO el contenido de /dev/sda (incluido backup-home-20260910).
# Autorizado por el dueño del equipo; igual exige confirmación escrita con el número de serie.
#
# Por qué sirve: SMART informa 360 sectores "pendientes" (ilegibles) y 0 reasignados.
# Al ESCRIBIR sobre un sector pendiente, el disco lo reescribe o lo reemplaza por uno de reserva.
# Una pasada completa de ceros fuerza eso en todo el disco. Después se decide con SMART si el
# disco queda utilizable (para datos descartables, como modelos que se pueden volver a bajar).
#
# Fases (correr en orden, revisando la salida de cada una; todas registran en ~/terrabiter_rebuild/):
#   bash llms_disk.sh status          # solo lectura: identifica el disco y su estado
#   bash llms_disk.sh wipe            # desmonta y escribe ceros en TODO el disco (2-3 h)
#   bash llms_disk.sh format ext4     # particiona, formatea, monta en /mnt/llms (o: ntfs)
#   bash llms_disk.sh verify          # compara SMART y lanza la prueba larga del disco
#   PERSIST=1 bash llms_disk.sh format ext4   # además agrega una línea a /etc/fstab (con copia)
#   BADBLOCKS=1 PERSIST=1 bash llms_disk.sh format ext4   # además lee todo el disco y excluye los bloques ilegibles
set -uo pipefail

DEV="/dev/sda"
EXPECT_MODEL="ST1000DX001"
EXPECT_BYTES="1000204886016"
MNT="/mnt/llms"            # nuevo punto de montaje
OLD_MNT="/mnt/terrabiter"  # montaje anterior (se desmonta si sigue activo)
LABEL="llms"
OWNER="jose"
LOGDIR="$HOME/terrabiter_rebuild"   # mismo directorio que la versión anterior (compara SMART)
mkdir -p "$LOGDIR"
TS=$(date +%Y%m%dT%H%M%S)
die() { echo "ABORTO: $*" >&2; exit 1; }
sec() { printf '\n===== %s =====\n' "$1"; }

identify() {
  [ -b "$DEV" ] || die "$DEV no existe"
  MODEL=$(lsblk -dno MODEL "$DEV" | xargs)
  SERIAL=$(lsblk -dno SERIAL "$DEV" | xargs)
  BYTES=$(lsblk -bdno SIZE "$DEV")
  ROTA=$(lsblk -dno ROTA "$DEV" | xargs)
  echo "dispositivo: $DEV  modelo: $MODEL  serie: $SERIAL  bytes: $BYTES  rotacional: $ROTA"
  [[ "$MODEL" == *"$EXPECT_MODEL"* ]] || die "el modelo no es $EXPECT_MODEL"
  [ "$BYTES" = "$EXPECT_BYTES" ] || die "el tamaño no es $EXPECT_BYTES bytes"
  [ -n "$SERIAL" ] || die "no se pudo leer el número de serie"
  # / y la swap no pueden depender de este disco
  local rootsrc; rootsrc=$(findmnt -no SOURCE /)
  if lsblk -rs -no NAME "$rootsrc" 2>/dev/null | grep -qx "$(basename "$DEV")"; then die "/ depende de $DEV"; fi
  while read -r sw _; do
    [ "$sw" = "Filename" ] && continue
    if [ -b "$sw" ] && lsblk -rs -no NAME "$sw" | grep -qx "$(basename "$DEV")"; then die "hay swap en $DEV"; fi
  done < /proc/swaps
  # Ningún montaje de este disco fuera de $MNT
  local other; other=$(lsblk -nro MOUNTPOINTS "$DEV" | grep -v -x -e '' -e "$MNT" -e "$OLD_MNT" || true)
  [ -z "$other" ] || die "$DEV tiene otros montajes: $other"
  echo "/ está en: $rootsrc (no depende de $DEV)"
}

smart_snapshot() {  # $1 = etiqueta
  sudo smartctl -H -A "$DEV" | tee "$LOGDIR/smart_${1}_$TS.txt" \
    | grep -E 'overall|Reallocated_Sector|Current_Pending|Offline_Uncorrectable|Reported_Uncorrect|Power_On_Hours|UDMA_CRC'
}

confirm() {
  echo
  echo "Esto BORRA TODO $DEV ($MODEL, serie $SERIAL). No se puede deshacer."
  read -r -p "Para continuar escribí exactamente:  BORRAR $SERIAL  > " ans
  [ "$ans" = "BORRAR $SERIAL" ] || die "confirmación incorrecta; no se hizo nada"
}

release_mount() {
  if [ -f "$(dirname "$0")/fg_ollama_isolated.sh" ]; then bash "$(dirname "$0")/fg_ollama_isolated.sh" stop || true; fi
  local m
  for m in "$OLD_MNT" "$MNT"; do
    if mountpoint -q "$m"; then
      echo "procesos usando $m:"; sudo fuser -vm "$m" 2>&1 | tail -n +2 || true
      sudo umount "$m" || die "no se pudo desmontar $m (cerrar lo que lo use, p. ej. nautilus -q, y reintentar)"
    fi
    mountpoint -q "$m" && die "$m sigue montado"
  done
  echo "$DEV sin montajes"
}

cmd_status() {
  sec "identificación"; identify
  sec "particiones y montajes"; lsblk -o NAME,FSTYPE,LABEL,SIZE,MOUNTPOINTS "$DEV"
  sec "cómo se monta $MNT"
  for u in mnt-terrabiter.mount mnt-llms.mount; do systemctl show "$u" -p Id -p FragmentPath -p What -p Type -p Options 2>/dev/null; done
  grep -n "terrabiter\|llms\|$(basename "$DEV")" /etc/fstab || echo "(sin entrada en /etc/fstab: el montaje no persiste al reiniciar)"
  sec "SMART"; smart_snapshot antes
  sec "errores del kernel en este arranque"
  journalctl -k -b --no-pager 2>/dev/null | grep -cE "I/O error, dev $(basename "$DEV")" | sed 's/^/errores de E\/S registrados: /'
}

cmd_wipe() {
  sec "identificación"; identify
  sec "SMART antes"; smart_snapshot antes
  confirm
  sec "liberar el montaje"; release_mount
  sec "escritura de ceros en todo $DEV (tarda 2-3 horas; se puede seguir el avance)"
  local start; start=$(date +%s)
  sudo dd if=/dev/zero of="$DEV" bs=16M oflag=direct status=progress 2>&1 | tee "$LOGDIR/wipe_dd_$TS.log"
  local rc=${PIPESTATUS[0]}
  sync
  local written; written=$(tr '\r' '\n' < "$LOGDIR/wipe_dd_$TS.log" | grep -oE '^[0-9]+ bytes' | tail -1 | cut -d' ' -f1)
  echo "dd terminó con código $rc tras $(( $(date +%s) - start )) s; bytes escritos: ${written:-?} de $EXPECT_BYTES"
  if [ "${written:-0}" = "$EXPECT_BYTES" ]; then
    echo "RESULTADO: todo el disco se escribió (el 'No space left on device' final de dd es normal)"
  else
    echo "RESULTADO: la escritura NO cubrió todo el disco; revisar $LOGDIR/wipe_dd_$TS.log y errores del kernel"
  fi
  journalctl -k --since "@$start" --no-pager 2>/dev/null | grep -E "$(basename "$DEV")" | grep -iE 'error|fail' | tail -10
  sec "SMART después de escribir"; smart_snapshot despues_wipe
}

cmd_format() {
  local fs="${1:-}"
  case "$fs" in ext4|ntfs) ;; *) die "indicar sistema de archivos: format ext4 | format ntfs";; esac
  sec "identificación"; identify
  { mountpoint -q "$MNT" || mountpoint -q "$OLD_MNT"; } && die "el disco sigue montado; correr wipe primero"
  confirm
  sec "tabla de particiones GPT y partición única"
  sudo parted -s "$DEV" mklabel gpt mkpart "$LABEL" 1MiB 100% || die "parted falló"
  sudo partprobe "$DEV"; sleep 2
  local part="${DEV}1"
  [ -b "$part" ] || die "no apareció $part"
  sec "formato $fs"
  if [ "$fs" = "ext4" ]; then
    local bb=()
    if [ "${BADBLOCKS:-0}" = "1" ]; then
      echo "BADBLOCKS=1: se lee toda la partición antes de formatear (2-3 h) y los bloques ilegibles quedan fuera del sistema de archivos"
      bb=(-c)
    fi
    sudo mkfs.ext4 -F "${bb[@]}" -L "$LABEL" -m 0 "$part" || die "mkfs.ext4 falló"
    if [ "${BADBLOCKS:-0}" = "1" ]; then
      echo "bloques marcados como defectuosos en el sistema de archivos:"; sudo dumpe2fs -b "$part" 2>/dev/null | wc -l
    fi
  else
    sudo mkfs.ntfs -F -f -L "$LABEL" "$part" || die "mkfs.ntfs falló (¿está instalado ntfs-3g?)"
  fi
  local uuid; uuid=$(sudo blkid -s UUID -o value "$part")
  sec "montaje en $MNT"
  sudo mkdir -p "$MNT"
  if [ "$fs" = "ext4" ]; then
    sudo mount -o defaults,noatime "$part" "$MNT" || die "no se pudo montar"
    sudo chown "$OWNER:$OWNER" "$MNT"
  else
    sudo mount -t ntfs3 -o "uid=$(id -u "$OWNER"),gid=$(id -g "$OWNER"),umask=022,noatime" "$part" "$MNT" || die "no se pudo montar"
  fi
  findmnt "$MNT"; df -h "$MNT"
  if [ "${PERSIST:-0}" = "1" ]; then
    sec "persistencia en /etc/fstab"
    sudo cp /etc/fstab "$LOGDIR/fstab.backup_$TS"
    local opts; [ "$fs" = "ext4" ] && opts="defaults,noatime,nofail,x-systemd.device-timeout=10s" \
      || opts="uid=$(id -u "$OWNER"),gid=$(id -g "$OWNER"),umask=022,noatime,nofail,x-systemd.device-timeout=10s"
    local fstype; [ "$fs" = "ext4" ] && fstype=ext4 || fstype=ntfs3
    sudo sed -i -e "\#[[:space:]]${MNT}[[:space:]]#d" -e "\#[[:space:]]${OLD_MNT}[[:space:]]#d" /etc/fstab
    echo "UUID=$uuid $MNT $fstype $opts 0 2" | sudo tee -a /etc/fstab
    sudo findmnt --verify --tab-file /etc/fstab 2>&1 | tail -5
    sudo systemctl daemon-reload
    echo "copia del fstab anterior: $LOGDIR/fstab.backup_$TS"
  else
    echo "Montaje NO persistente (igual que antes). Para persistirlo: PERSIST=1 bash $0 format $fs"
  fi
}

cmd_verify() {
  sec "identificación"; identify
  sec "SMART actual"; smart_snapshot verify
  sec "comparación con la primera instantánea"
  local first; first=$(ls -1 "$LOGDIR"/smart_antes_*.txt 2>/dev/null | head -1)
  if [ -n "$first" ]; then
    for a in Reallocated_Sector_Ct Current_Pending_Sector Offline_Uncorrectable Reported_Uncorrect; do
      printf '%-24s antes=%-6s ahora=%s\n' "$a" "$(awk -v a="$a" '$2==a{print $10}' "$first")" \
        "$(awk -v a="$a" '$2==a{print $10}' "$LOGDIR/smart_verify_$TS.txt")"
    done
  fi
  sec "prueba larga de SMART (corre dentro del disco, 2-3 h; se puede seguir usando el equipo)"
  sudo smartctl -t long "$DEV" | grep -iE 'test will complete|Please wait|started' || true
  echo "Ver el resultado más tarde con:  sudo smartctl -l selftest $DEV"
  cat <<'TXT'

Cómo decidir:
  * Current_Pending_Sector = 0, prueba larga "Completed without error" y Reallocated bajo (decenas):
      el disco sirve para datos DESCARTABLES (modelos que se pueden volver a bajar, cachés, resultados
      copiados en otro lado). Volver a correr verify en unos días: si Reallocated sigue subiendo, reemplazarlo.
  * Pending > 0, errores de escritura en wipe, o la prueba larga falla ("read failure"):
      el disco se está degradando; no usarlo para el laboratorio.
TXT
}

case "${1:-}" in
  status) cmd_status ;;
  wipe) cmd_wipe ;;
  format) cmd_format "${2:-}" ;;
  verify) cmd_verify ;;
  *) echo "uso: $0 {status|wipe|format ext4|format ntfs|verify}"; exit 2 ;;
esac
