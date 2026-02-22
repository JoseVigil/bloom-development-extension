"""
Lógica de negocio pura para leer y reconstruir el historial de lanzamientos
de perfiles de Chrome Worker.

Lee archivos YYYYMMDD.ndjson del directorio:
    AppDataDir/history/profiles/{profileID}/launches/

Cada línea es un JSON independiente con los campos:
    launch_id, ts, event, mode, chrome_pid, result, duration_seconds

La reconstrucción agrupa las líneas por launch_id y se queda con la última
para representar el estado final de cada lanzamiento.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from brain.shared.paths import Paths


class LaunchHistoryReader:
    """
    Lee y reconstruye el historial de lanzamientos de perfiles Chrome.

    Los lanzamientos se almacenan como archivos NDJSON diarios. Esta clase
    consolida las líneas de eventos por launch_id para representar el estado
    final de cada sesión, mostrando el evento más reciente (generalmente
    "closed" con result y duration_seconds, o "opened" si sigue activo).
    """

    LAUNCHES_SUBDIR = Path("history/profiles")

    def __init__(self, paths: Optional[Paths] = None):
        """
        Inicializa el lector con un Paths.

        Args:
            paths: Paths opcional. Si no se provee, se instancia el singleton.
        """
        self.paths = paths or Paths()

    # -------------------------------------------------------------------------
    # Método público principal
    # -------------------------------------------------------------------------

    def get_launches(
        self,
        profile_id: str,
        date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Obtiene el historial de lanzamientos de un perfil, reconstruyendo el
        estado final de cada sesión a partir de los eventos NDJSON.

        Args:
            profile_id: Identificador del perfil.
            date: Fecha en formato YYYYMMDD para filtrar. Si es None, se leen
                  todos los archivos del directorio en orden cronológico.

        Returns:
            Diccionario estructurado con:
                - profile_id (str)
                - date_filter (str | None)
                - files_read (List[str])
                - launches (List[Dict])  — estado final por launch_id
                - total (int)

        Raises:
            FileNotFoundError: Si el directorio de historial no existe.
            ValueError: Si el formato de la fecha es inválido.
        """
        if date is not None:
            self._validate_date(date)

        launches_dir = self._resolve_launches_dir(profile_id)

        if date:
            ndjson_files = self._get_file_for_date(launches_dir, date)
        else:
            ndjson_files = self._get_all_files_sorted(launches_dir)

        launches = self._read_and_reconstruct(ndjson_files)

        return {
            "profile_id": profile_id,
            "date_filter": date,
            "files_read": [f.name for f in ndjson_files],
            "launches": launches,
            "total": len(launches),
        }

    # -------------------------------------------------------------------------
    # Métodos privados — resolución de rutas y archivos
    # -------------------------------------------------------------------------

    def _resolve_launches_dir(self, profile_id: str) -> Path:
        launches_dir = self.paths.base_dir / self.LAUNCHES_SUBDIR / profile_id / "launches"

        if not launches_dir.exists():
            raise FileNotFoundError(
                f"Directorio de historial no encontrado: {launches_dir}\n"
                f"Asegúrese de que el perfil '{profile_id}' existe y ha tenido lanzamientos."
            )

        return launches_dir

    def _get_file_for_date(self, launches_dir: Path, date: str) -> List[Path]:
        target = launches_dir / f"{date}.ndjson"
        return [target] if target.exists() else []

    def _get_all_files_sorted(self, launches_dir: Path) -> List[Path]:
        return sorted(launches_dir.glob("*.ndjson"))

    # -------------------------------------------------------------------------
    # Métodos privados — lectura y reconstrucción
    # -------------------------------------------------------------------------

    def _read_and_reconstruct(self, ndjson_files: List[Path]) -> List[Dict[str, Any]]:
        latest_by_id: Dict[str, Dict[str, Any]] = {}
        first_ts_by_id: Dict[str, str] = {}

        for filepath in ndjson_files:
            lines = self._parse_ndjson_file(filepath)
            for entry in lines:
                launch_id = entry.get("launch_id")
                if not launch_id:
                    continue

                if launch_id not in first_ts_by_id:
                    first_ts_by_id[launch_id] = entry.get("ts", "")

                latest_by_id[launch_id] = entry

        for entry in latest_by_id.values():
            entry["_status"] = "open" if entry.get("event") == "opened" else "closed"

        return sorted(
            latest_by_id.values(),
            key=lambda e: first_ts_by_id.get(e.get("launch_id", ""), "")
        )

    def _parse_ndjson_file(self, filepath: Path) -> List[Dict[str, Any]]:
        entries: List[Dict[str, Any]] = []

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for raw_line in f:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        entries.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
        except OSError:
            pass

        return entries

    # -------------------------------------------------------------------------
    # Métodos privados — validación
    # -------------------------------------------------------------------------

    @staticmethod
    def _validate_date(date: str) -> None:
        if len(date) != 8 or not date.isdigit():
            raise ValueError(
                f"Formato de fecha inválido: '{date}'. Use YYYYMMDD (ej: 20240115)."
            )
        year, month, day = int(date[:4]), int(date[4:6]), int(date[6:])
        if not (1 <= month <= 12) or not (1 <= day <= 31) or year < 2000:
            raise ValueError(
                f"Fecha fuera de rango: '{date}'. Use YYYYMMDD con valores válidos."
            )