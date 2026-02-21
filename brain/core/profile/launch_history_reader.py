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
from brain.core.profile.path_resolver import PathResolver


class LaunchHistoryReader:
    """
    Lee y reconstruye el historial de lanzamientos de perfiles Chrome.

    Los lanzamientos se almacenan como archivos NDJSON diarios. Esta clase
    consolida las líneas de eventos por launch_id para representar el estado
    final de cada sesión, mostrando el evento más reciente (generalmente
    "closed" con result y duration_seconds, o "opened" si sigue activo).
    """

    LAUNCHES_SUBDIR = Path("history/profiles")

    def __init__(self, paths: Optional[PathResolver] = None):
        """
        Inicializa el lector con un PathResolver.

        Args:
            paths: PathResolver opcional. Si no se provee, se instancia uno nuevo.
        """
        self.paths = paths or PathResolver()

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
        """
        Resuelve el directorio de lanzamientos para un perfil dado.

        Args:
            profile_id: Identificador del perfil.

        Returns:
            Path al directorio de lanzamientos.

        Raises:
            FileNotFoundError: Si el directorio no existe.
        """
        launches_dir = self.paths.base_dir / self.LAUNCHES_SUBDIR / profile_id / "launches"

        if not launches_dir.exists():
            raise FileNotFoundError(
                f"Directorio de historial no encontrado: {launches_dir}\n"
                f"Asegúrese de que el perfil '{profile_id}' existe y ha tenido lanzamientos."
            )

        return launches_dir

    def _get_file_for_date(self, launches_dir: Path, date: str) -> List[Path]:
        """
        Obtiene el archivo NDJSON para una fecha específica.

        Args:
            launches_dir: Directorio donde se almacenan los archivos.
            date: Fecha en formato YYYYMMDD.

        Returns:
            Lista con el archivo encontrado (vacía si no existe).
        """
        target = launches_dir / f"{date}.ndjson"
        return [target] if target.exists() else []

    def _get_all_files_sorted(self, launches_dir: Path) -> List[Path]:
        """
        Obtiene todos los archivos NDJSON del directorio ordenados cronológicamente
        (el nombre de archivo YYYYMMDD garantiza el orden lexicográfico correcto).

        Args:
            launches_dir: Directorio donde se almacenan los archivos.

        Returns:
            Lista de Paths ordenada de más antiguo a más reciente.
        """
        files = sorted(launches_dir.glob("*.ndjson"))
        return files

    # -------------------------------------------------------------------------
    # Métodos privados — lectura y reconstrucción
    # -------------------------------------------------------------------------

    def _read_and_reconstruct(self, ndjson_files: List[Path]) -> List[Dict[str, Any]]:
        """
        Lee múltiples archivos NDJSON y reconstruye el estado final de cada
        lanzamiento agrupando las líneas por launch_id.

        La estrategia consiste en acumular todas las líneas de todos los archivos
        y, para cada launch_id, quedarse con la línea más reciente (la última
        por orden de aparición, que generalmente será el evento "closed").

        Args:
            ndjson_files: Lista de archivos NDJSON a procesar.

        Returns:
            Lista de diccionarios con el estado final de cada lanzamiento,
            ordenados por timestamp de apertura (ts del primer evento).
        """
        # Acumulador: launch_id → línea más reciente
        latest_by_id: Dict[str, Dict[str, Any]] = {}
        # Timestamp del primer evento por launch_id (para ordenar el resultado)
        first_ts_by_id: Dict[str, str] = {}

        for filepath in ndjson_files:
            lines = self._parse_ndjson_file(filepath)
            for entry in lines:
                launch_id = entry.get("launch_id")
                if not launch_id:
                    continue

                # Registrar el primer timestamp que veamos para este launch_id
                if launch_id not in first_ts_by_id:
                    first_ts_by_id[launch_id] = entry.get("ts", "")

                # Siempre sobreescribir con la línea más reciente del archivo
                latest_by_id[launch_id] = entry

        # Marcar como "open" los lanzamientos que solo tienen evento "opened"
        for launch_id, entry in latest_by_id.items():
            if entry.get("event") == "opened":
                entry["_status"] = "open"
            else:
                entry["_status"] = "closed"

        # Ordenar por primer timestamp conocido
        sorted_launches = sorted(
            latest_by_id.values(),
            key=lambda e: first_ts_by_id.get(e.get("launch_id", ""), "")
        )

        return sorted_launches

    def _parse_ndjson_file(self, filepath: Path) -> List[Dict[str, Any]]:
        """
        Parsea un archivo NDJSON línea a línea, ignorando líneas vacías o
        malformadas sin interrumpir la lectura.

        Args:
            filepath: Path al archivo .ndjson.

        Returns:
            Lista de diccionarios parseados exitosamente.
        """
        entries: List[Dict[str, Any]] = []

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line_number, raw_line in enumerate(f, start=1):
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                        entries.append(entry)
                    except json.JSONDecodeError:
                        # Línea malformada: ignorar sin romper el proceso
                        pass
        except OSError:
            # Archivo no legible: retornar vacío
            pass

        return entries

    # -------------------------------------------------------------------------
    # Métodos privados — validación
    # -------------------------------------------------------------------------

    @staticmethod
    def _validate_date(date: str) -> None:
        """
        Valida que la fecha tenga el formato YYYYMMDD correcto.

        Args:
            date: String de fecha a validar.

        Raises:
            ValueError: Si el formato es incorrecto.
        """
        if len(date) != 8 or not date.isdigit():
            raise ValueError(
                f"Formato de fecha inválido: '{date}'. Use YYYYMMDD (ej: 20240115)."
            )
        year = int(date[:4])
        month = int(date[4:6])
        day = int(date[6:])
        if not (1 <= month <= 12) or not (1 <= day <= 31) or year < 2000:
            raise ValueError(
                f"Fecha fuera de rango: '{date}'. Use YYYYMMDD con valores válidos."
            )