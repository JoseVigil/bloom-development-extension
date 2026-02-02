import json
import zipfile
import logging
from pathlib import Path
from datetime import datetime, UTC
import os

# ------------------------- 
# Rutas base
# ------------------------- 

BUILD_DIR = Path(__file__).resolve().parent                 # cortex/build-cortex
CORTEX_ROOT = BUILD_DIR.parent                              # cortex/
REPO_ROOT = CORTEX_ROOT.parent                              # root/

EXTENSION_DIR = CORTEX_ROOT / "extension"
VERSION_FILE = BUILD_DIR / "VERSION"
BUILD_NUMBER_FILE = BUILD_DIR / "build_number.txt"

OUTPUT_DIR = REPO_ROOT / "native" / "bin" / "cortex"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------- 
# Logging - cortex.build.log
# ------------------------- 

LOG_DIR = Path(os.path.expanduser(r"~\AppData\Local\BloomNucleus\logs\build"))
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOG_FILE = LOG_DIR / "cortex.build.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()   # también muestra en consola
    ]
)

logger = logging.getLogger("cortex-packager")


# ------------------------- 
# Versioning
# ------------------------- 

def read_version() -> str:
    if not VERSION_FILE.exists():
        logger.error(f"Archivo de versión no encontrado: {VERSION_FILE}")
        raise FileNotFoundError(f"VERSION file not found at {VERSION_FILE}")
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def next_build_number() -> int:
    if not BUILD_NUMBER_FILE.exists():
        BUILD_NUMBER_FILE.write_text("0", encoding="utf-8")
    
    build = int(BUILD_NUMBER_FILE.read_text().strip()) + 1
    BUILD_NUMBER_FILE.write_text(str(build), encoding="utf-8")
    return build


# ------------------------- 
# Actualizar telemetry.json
# ------------------------- 

def update_telemetry():
    telemetry_path = Path(os.path.expanduser(
        r"~\AppData\Local\BloomNucleus\logs\telemetry.json"
    ))
    
    if not telemetry_path.exists():
        logger.warning(f"telemetry.json no existe → se creará uno nuevo en {telemetry_path}")
        data = {"active_streams": {}}
    else:
        try:
            data = json.loads(telemetry_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.error(f"Error leyendo telemetry.json: {exc}")
            data = {"active_streams": {}}
    
    # Aseguramos que exista la clave principal
    if "active_streams" not in data:
        data["active_streams"] = {}
    
    now_iso = datetime.now(UTC).isoformat(timespec="microseconds")
    
    entry = {
        "label": "📦 CORTEX BUILD",
        "path": str(LOG_FILE).replace("\\", "/"),
        "priority": 3,
        "last_update": now_iso
    }
    
    data["active_streams"]["cortex_build"] = entry
    
    try:
        telemetry_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
        logger.info(f"telemetry.json actualizado correctamente → cortex_build")
        logger.info(f"  → path: {entry['path']}")
        logger.info(f"  → last_update: {entry['last_update']}")
    except Exception as exc:
        logger.error(f"No se pudo escribir telemetry.json: {exc}")


# ------------------------- 
# Packaging
# ------------------------- 

def deploy_package():
    logger.info("Iniciando empaquetado de Bloom Cortex...")
    
    try:
        version = read_version()
        build = next_build_number()
        full_version = f"{version}+build.{build}"
        
        output_file = OUTPUT_DIR / "bloom-cortex.blx"
        
        logger.info(f"Versión detectada    : {version}")
        logger.info(f"Nuevo build number   : {build}")
        logger.info(f"Archivo de salida    : {output_file}")
        
        with zipfile.ZipFile(output_file, "w", zipfile.ZIP_DEFLATED) as zf:
            file_count = 0
            for path in EXTENSION_DIR.rglob("*"):
                if path.is_file():
                    arcname = path.relative_to(EXTENSION_DIR)
                    zf.write(path, arcname)
                    file_count += 1
                    if file_count % 50 == 0:
                        logger.info(f"  → {file_count} archivos añadidos...")
        
        logger.info(f"✔ Empaquetado finalizado correctamente")
        logger.info(f"  → Archivo   : {output_file}")
        logger.info(f"  → Versión   : {full_version}")
        logger.info(f"  → Archivos  : {file_count}")
        logger.info(f"  → Fecha     : {datetime.now(UTC).isoformat()}")
        
        # Actualizamos telemetry al final (solo si todo salió bien)
        update_telemetry()
        
    except Exception as e:
        logger.error(f"Error durante el empaquetado: {e}", exc_info=True)
        raise


# ------------------------- 
# Entry point
# ------------------------- 

if __name__ == "__main__":
    deploy_package()