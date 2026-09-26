#!/usr/bin/env bash
# laya_install.sh — crea el venv de Laya en TerraBiter con PyTorch CPU (sin CUDA) y laya fijado.
#
# - venv, caché de pip y temporales en /mnt/terrabiter/llm-lab (nada grande en /).
# - PyTorch se instala primero desde el índice CPU oficial; luego laya con una restricción
#   que obliga a conservar ese torch (+cpu). Si aparece cualquier paquete nvidia-* o un torch
#   sin "+cpu", el script lo informa como FALLA.
# - No descarga pesos: eso ocurre en la primera carga dentro de laya_bench.sh.
# - Cada pip install corre bajo el vigilante continuo de / (lab_run_watched).
# Requiere ACEPTO_LICENCIAS=1. Variables opcionales: LAYA_VERSION (por defecto 0.3.20),
# TORCH_VERSION (recomendado fijarla para reproducir; si se omite, se registra la instalada).
set -uo pipefail
source "$(dirname "$0")/lab_env.sh"
lab_guard; lab_license_gate

OUT="$LAB_RESULTS/laya_install_$(lab_ts)"; mkdir -p "$OUT"
lab_cmdlog_init "$OUT/commands.log"
lab_snapshot > "$OUT/machine_before.txt"
PY="$LAB_LAYA_VENV/bin/python"
TORCH_CPU_INDEX="https://download.pytorch.org/whl/cpu"

if [ ! -x "$PY" ]; then
  lab_run python3 -m venv "$LAB_LAYA_VENV" || lab_die "no se pudo crear el venv"
fi
[ "$(stat -c %d "$LAB_LAYA_VENV")" = "$(stat -c %d "$LAB_T")" ] || lab_die "el venv no quedó en TerraBiter"
lab_run "$PY" -m pip --version | tee "$OUT/pip_version.txt"

echo "== 1/2 torch CPU"
torch_spec="torch${TORCH_VERSION:+==$TORCH_VERSION}"
lab_run_watched "$OUT/root_watch_torch.log" "$PY" -m pip install --index-url "$TORCH_CPU_INDEX" "$torch_spec" > "$OUT/pip_torch.log" 2>&1
rc=$?
tail -3 "$OUT/pip_torch.log"
lab_check_root
[ "$rc" = "0" ] || lab_die "pip falló instalando torch (rc=$rc; ver $OUT/pip_torch.log y $OUT/root_watch_torch.log)"
TV=$("$PY" -c 'import torch; print(torch.__version__)') || lab_die "torch no importa"
echo "torch instalado: $TV"
case "$TV" in *+cpu) ;; *) lab_die "torch no es la variante CPU ($TV)";; esac
echo "torch==$TV" > "$OUT/constraints.txt"

echo "== 2/2 laya==$LAYA_VERSION"
lab_run_watched "$OUT/root_watch_laya.log" "$PY" -m pip install --extra-index-url "$TORCH_CPU_INDEX" \
  -c "$OUT/constraints.txt" "laya==$LAYA_VERSION" > "$OUT/pip_laya.log" 2>&1
rc=$?
tail -5 "$OUT/pip_laya.log"
lab_check_root
[ "$rc" = "0" ] || lab_die "pip falló instalando laya==$LAYA_VERSION (ver $OUT/pip_laya.log; ¿existe esa versión?)"

echo "== verificación"
"$PY" -m pip freeze > "$OUT/pip_freeze.txt"
if grep -qiE '^nvidia-|^triton' "$OUT/pip_freeze.txt"; then
  echo "FALLA: se instalaron paquetes CUDA:"; grep -iE '^nvidia-|^triton' "$OUT/pip_freeze.txt"; exit 1
fi
"$PY" -I -c 'import laya, torch; print("laya", getattr(laya, "__version__", "?"), "| torch", torch.__version__, "| cuda disponible:", torch.cuda.is_available())' \
  | tee "$OUT/versions.txt"
"$PY" -m pip show laya | grep -iE '^(Name|Version|License|Requires|Home-page)' | tee "$OUT/laya_pip_show.txt"
du -sh "$LAB_LAYA_VENV" "$PIP_CACHE_DIR" | tee "$OUT/du.txt"
echo "evidencia en $OUT"
