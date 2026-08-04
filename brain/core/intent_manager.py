"""
Intent management core logic - Pure business logic layer.
Handles intent lifecycle operations without CLI dependencies.
"""

import uuid
import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import socket
import shutil
import hashlib
from brain.core.filesystem.code_compressor import CodeCompressor
from brain.core.intent_types import get_intent_type_spec
from brain.core.intent_state_manager import (
    IntentStateManager,
    IntentStateError,
    InvalidTransitionError,
)

# Tipos de intent gobernados por la gramática BSIP genérica (intent_types.py
# / intent_state_manager.py) — comparten un único motor de fases/turnos.
# 'dev' y 'doc' son anteriores a ese motor y mantienen su propia lógica
# ad-hoc en este archivo (briefing/execution/refinement, context/curation).
_BSIP_INTENT_TYPES = ("ing", "dis")


class IntentManager:
    """
    Manager for intent lifecycle operations in Bloom projects.
    
    This class provides pure business logic for creating, managing,
    and tracking intents (both development and documentation types).
    """
    
    # Namespace UUID for generating deterministic intent IDs
    INTENT_NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')

    # Nombres de archivo de estado conocidos por este runtime, dev/doc
    # hardcodeados (anteriores al motor BSIP) + ing/dis resueltos desde el
    # registro (intent_types.py) para no duplicar el nombre en dos lugares.
    _KNOWN_STATE_FILENAMES = (
        ".dev_state.json",
        ".doc_state.json",
        *(get_intent_type_spec(t).state_filename for t in _BSIP_INTENT_TYPES),
    )
    
    def __init__(self):
        """Initialize the IntentManager."""
        pass
    
    def create_intent(
        self,
        intent_type: str,
        name: str,
        initial_files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None,
        mandate_id: Optional[str] = None,
        domain_baseline: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a new intent with complete directory structure.
        
        This is the first step (CREATE/Genesis) in the Intent lifecycle.
        Creates all necessary directories and the initial state file.
        
        Args:
            intent_type: Type of intent - "dev", "doc", "ing" or "dis"
            name: Human-readable name for the intent
            initial_files: Optional list of file paths to include in initial context
            nucleus_path: Optional explicit path to Bloom project root
            mandate_id: Solo aplica a intents BSIP ('ing'/'dis'). Mandato que
                origina el intent — se guarda en el envelope BSIP
                (`mandate_id` a nivel raíz, ver intent_state_manager.py) y,
                para 'dis', además se agrega a `scope.mandate_ids`. Opcional:
                si se omite, queda como cadena vacía (un intent BSIP puede
                nacer sin mandato explícito, p.ej. un scan ad-hoc).
            domain_baseline: Solo aplica (y es OBLIGATORIO) para intent_type
                'ing'. Debe ser "empty" o "existing" — ING_Intent_Spec_v1_1.md
                §1 no le da default razonable, ya que determina cómo
                .classification/ interpreta los clusters resueltos. Ignorado
                para el resto de los tipos.
            
        Returns:
            Dictionary containing:
                - intent_id: Generated UUID3 for the intent
                - intent_path: Absolute path to intent directory
                - folder_name: Folder name (.{slugified-name}-{uuid3})
                - name: Intent name
                - type: Intent type
                - initial_files: List of initial files (empty if none)
                - project_path: Bloom project root path
                - created_at: ISO timestamp
                - message: Success message
                
        Raises:
            ValueError: If intent_type is invalid, name is empty, or a
                BSIP-specific required field (domain_baseline for 'ing')
                is missing
            FileNotFoundError: If Bloom project not found or initial files don't exist
        """
        # Validate inputs
        if intent_type not in ["dev", "doc", "ing", "dis"]:
            raise ValueError(f"Invalid intent type: {intent_type}")
        
        if not name or not name.strip():
            raise ValueError("Intent name cannot be empty")

        if intent_type == "ing" and not domain_baseline:
            # ING_Intent_Spec_v1_1.md §1: domain_baseline no tiene default
            # razonable — debe fijarse explícitamente en Génesis, a
            # diferencia de thresholds/classification_summary que sí lo
            # tienen (ver intent_types.py::_ING_SPEC.extra_state_fields).
            raise ValueError(
                "domain_baseline is required for 'ing' intents. "
                "Must be 'empty' or 'existing'."
            )
        if intent_type == "ing" and domain_baseline not in ("empty", "existing"):
            raise ValueError(
                f"Invalid domain_baseline '{domain_baseline}'. "
                "Must be 'empty' or 'existing'."
            )
        
        # Find or validate Bloom project
        project_root = self._find_bloom_project(nucleus_path)
        
        # Validate and normalize initial files
        validated_files = []
        if initial_files:
            validated_files = self._validate_initial_files(initial_files, project_root)
        
        # Generate deterministic UUID3 based on intent name
        intent_id = str(uuid.uuid3(self.INTENT_NAMESPACE, name.strip()))
        
        # Generate slugified name for folder
        slug = self._slugify(name)
        folder_name = f".{slug}-{intent_id[:8]}"
        
        # Create directory structure
        intent_path = self._create_directory_structure(
            project_root,
            intent_type,
            folder_name
        )
        
        # Create initial state file
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data = self._create_initial_state(
            intent_id,
            intent_type,
            name,
            timestamp,
            validated_files,
            mandate_id=mandate_id,
            domain_baseline=domain_baseline
        )
        
        if intent_type == "dev":
            state_filename = ".dev_state.json"
        elif intent_type == "doc":
            state_filename = ".doc_state.json"
        else:  # "ing" / "dis" — nombre declarado en el registro BSIP, no
            # se hardcodea acá (ver intent_types.py::IntentTypeSpec.state_filename)
            state_filename = get_intent_type_spec(intent_type).state_filename

        state_file = intent_path / state_filename
        
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # Return structured result
        return {
            "intent_id": intent_id,
            "intent_path": str(intent_path),
            "folder_name": folder_name,
            "name": name,
            "type": intent_type,
            "initial_files": validated_files,
            "project_path": str(project_root),
            "created_at": timestamp,
            "message": f"Intent '{name}' ({intent_type}) created successfully"
        }
    
    def hydrate_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        briefing: str = "",
        files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Populate the intent with files and briefing instructions.
        Generates .codebase.json and .codebase_index.json.
        """
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        intent_type = state_data["type"]

        if intent_type in _BSIP_INTENT_TYPES:
            # .reception/ (ing) y .discovery/ (dis) tienen un contrato
            # completamente distinto al de .briefing/.context (inventario +
            # texto extraído, no briefing/instruction) — ver
            # ING_Intent_Spec_v1_1.md §3 / DIS_Intent_Spec_v1_0.md §3. Ambas
            # son la primera fase (acto único, sin turnos) de la gramática
            # BSIP, así que comparten un único helper en vez de duplicar la
            # lógica por tipo.
            return self._hydrate_bsip_phaseless_act(
                project_root, intent_path, state_data, state_file, files, verbose, intent_type
            )

        if intent_type == "dev":
            content_dir = intent_path / ".briefing"
            content_file = content_dir / ".briefing.json"
            content_key = "instruction"
        else:
            content_dir = intent_path / ".context"
            content_file = content_dir / ".context.json"
            content_key = "instruction"
       
        files_dir = content_dir / ".files"
        files_dir.mkdir(parents=True, exist_ok=True)
        # 3. Process Briefing
        briefing_updated = False
        if briefing:
            briefing_data = {
                content_key: briefing,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            with open(content_file, 'w', encoding="utf-8") as f:
                json.dump(briefing_data, f, indent=2)
            briefing_updated = True
        # 4. Process Files (The Hydration)
        stats = {"total_files": 0, "total_size_kb": 0.0}
       
        # Load existing files from state or args
        files_to_process = set(files) if files else set()
        files_to_process.update(state_data.get("initial_files", []))
       
        if files_to_process:
            compressor = CodeCompressor(preserve_comments=False)
           
            codebase_entries = []
            index_entries = []
           
            for file_path_str in files_to_process:
                full_path = project_root / file_path_str
                if not full_path.exists():
                    if verbose: print(f"⚠️ Warning: File skipped (not found): {file_path_str}")
                    continue
               
                # Determine language (simple extension check)
                ext = full_path.suffix.lower().replace('.', '')
                lang_map = {'py': 'python', 'js': 'javascript', 'ts': 'typescript', 'md': 'markdown'}
                language = lang_map.get(ext, 'text')
                content = full_path.read_text(encoding='utf-8', errors='ignore')
               
                # Compress
                compressed_data = compressor.compress_file(content, language)
               
                # Metadata
                file_hash = hashlib.md5(content.encode()).hexdigest()
               
                # Entry for .codebase.json (Content)
                codebase_entries.append({
                    "path": file_path_str,
                    "content": compressed_data, # {'c': 'gz:...', 'stats': ...}
                    "hash": file_hash
                })
               
                # Entry for .codebase_index.json (Structure/Meta)
                index_entries.append({
                    "path": file_path_str,
                    "hash": file_hash,
                    "size": len(content),
                    "language": language,
                    "tokens_est": len(content) // 4 # Rough estimate
                })
               
                stats["total_files"] += 1
                stats["total_size_kb"] += len(content) / 1024
            # Write .codebase.json
            with open(files_dir / ".codebase.json", 'w', encoding="utf-8") as f:
                json.dump({"files": codebase_entries}, f)
            # Write .codebase_index.json
            with open(files_dir / ".codebase_index.json", 'w', encoding="utf-8") as f:
                json.dump({"index": index_entries}, f, indent=2)
        # 5. Update State
        state_data["status"] = "hydrated" # or "briefing_completed"
        state_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "steps" in state_data:
            state_data["steps"]["hydrate"] = True
        with open(state_file, 'w', encoding="utf-8") as f:
            json.dump(state_data, f, indent=2)
        return {
            "intent_id": state_data.get("uuid"),
            "status": state_data["status"],
            "briefing_updated": briefing_updated,
            "stats": {
                "total_files": stats["total_files"],
                "total_size_kb": round(stats["total_size_kb"], 2)
            }
        }
    
    def _hydrate_bsip_phaseless_act(
        self,
        project_root: Path,
        intent_path: Path,
        state_data: Dict[str, Any],
        state_file: Path,
        files: Optional[List[str]],
        verbose: bool,
        intent_type: str
    ) -> Dict[str, Any]:
        """
        Primera fase (acto único, sin turnos) de la gramática BSIP:
        .reception/ para 'ing', .discovery/ para 'dis'
        (ING_Intent_Spec_v1_1.md §3, DIS_Intent_Spec_v1_0.md §3).

        Generalización de la antigua `_hydrate_ing_reception`, que solo
        cubría 'ing'. La forma del contrato es idéntica entre ambos tipos
        (inventario + texto extraído por archivo), así que el nombre de
        fase y de archivo de salida se resuelven desde el registro
        (`intent_types.py`) en vez de hardcodearse.

        Escribe:
        - .{base_name}.json: inventario (path/type/hash/size/status) por archivo.
        - .{base_name}_index.json: texto extraído + embedding_source_text
          obligatorio por archivo (aplicación directa de la Invariante 1 de BSIP).

        Si algo llega mal formado no se abre un turno parcial — se reintenta
        la fase entera (no hay concepto de turno en esta fase, a diferencia
        de las que siguen: .classification/.mapping y .consolidation/.ratification).
        """
        spec = get_intent_type_spec(intent_type)
        phase_name = spec.phases[0].name  # "reception" | "discovery"
        phase_dir = intent_path / f".{phase_name}"
        files_dir = phase_dir / ".files"
        files_dir.mkdir(parents=True, exist_ok=True)

        files_to_process = set(files) if files else set()
        files_to_process.update(state_data.get("initial_files", []))

        inventory_entries = []
        index_entries = []
        stats = {"total_files": 0, "total_size_kb": 0.0}

        for file_path_str in files_to_process:
            full_path = project_root / file_path_str
            if not full_path.exists():
                if verbose:
                    print(f"⚠️ Warning: File skipped (not found): {file_path_str}")
                continue

            ext = full_path.suffix.lower().replace('.', '')
            lang_map = {'py': 'python', 'js': 'javascript', 'ts': 'typescript', 'md': 'markdown'}
            file_type = lang_map.get(ext, 'text')
            content = full_path.read_text(encoding='utf-8', errors='ignore')
            file_hash = hashlib.md5(content.encode()).hexdigest()
            file_size = len(content)

            # Inventario (.{base_name}.json)
            inventory_entries.append({
                "path": file_path_str,
                "type": file_type,
                "hash": file_hash,
                "size": file_size,
                "status": "received"
            })

            # Texto extraído + embedding_source_text obligatorio por archivo
            # (Invariante 1 de BSIP: texto fuente siempre presente)
            index_entries.append({
                "path": file_path_str,
                "extracted_text": content,
                "embedding_source_text": content
            })

            stats["total_files"] += 1
            stats["total_size_kb"] += file_size / 1024

        # "rawbase" para ing (ING §3), "discoverybase" para dis (DIS §3) —
        # mismo shape de contenido, distinto nombre semántico por spec.
        base_name = "rawbase" if intent_type == "ing" else "discoverybase"

        with open(phase_dir / f".{base_name}.json", 'w', encoding="utf-8") as f:
            json.dump({"files": inventory_entries}, f, indent=2, ensure_ascii=False)

        with open(phase_dir / f".{base_name}_index.json", 'w', encoding="utf-8") as f:
            json.dump({"index": index_entries}, f, indent=2, ensure_ascii=False)

        # Fase de acto único: al completarla, la fase activa avanza a la
        # siguiente declarada en el registro (classification/mapping) —
        # ver ING_Intent_Spec_v1_1.md §1 / DIS_Intent_Spec_v1_0.md §1.
        next_phase = spec.next_phase_name(phase_name)
        state_data["status"] = "hydrated"
        state_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        state_data["phase_active"] = next_phase
        if "steps" in state_data and phase_name in state_data["steps"]:
            state_data["steps"][phase_name] = True
        if next_phase != spec.terminal_phase_name:
            (intent_path / f".{next_phase}").mkdir(parents=True, exist_ok=True)

        with open(state_file, 'w', encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)

        return {
            "intent_id": state_data.get("uuid"),
            "status": state_data["status"],
            "phase_active": state_data["phase_active"],
            "briefing_updated": False,
            "stats": {
                "total_files": stats["total_files"],
                "total_size_kb": round(stats["total_size_kb"], 2)
            }
        }

    def _slugify(self, text: str) -> str:
        """
        Convert text to slug format for folder names.
        
        Args:
            text: Text to slugify
            
        Returns:
            Slugified text (lowercase, hyphens, alphanumeric only)
        """
        # Convert to lowercase
        text = text.lower()
        # Replace spaces and underscores with hyphens
        text = re.sub(r'[\s_]+', '-', text)
        # Remove non-alphanumeric characters (except hyphens)
        text = re.sub(r'[^a-z0-9-]', '', text)
        # Remove multiple consecutive hyphens
        text = re.sub(r'-+', '-', text)
        # Remove leading/trailing hyphens
        text = text.strip('-')
        # Limit length
        if len(text) > 50:
            text = text[:50].rstrip('-')
        
        return text if text else "unnamed"
    
    def _find_bloom_project(self, explicit_path: Optional[Path] = None) -> Path:
        """
        Find the Bloom project root by looking for .bloom directory.
        
        Args:
            explicit_path: Optional explicit path to check first
            
        Returns:
            Path to Bloom project root
            
        Raises:
            FileNotFoundError: If no valid Bloom project found
        """
        if explicit_path:
            bloom_dir = explicit_path / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return explicit_path.resolve()
            raise FileNotFoundError(
                f"No valid Bloom project found at {explicit_path}"
            )
        
        # Search upward from current directory
        current = Path.cwd()
        while current != current.parent:
            bloom_dir = current / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return current.resolve()
            current = current.parent
        
        raise FileNotFoundError(
            "No Bloom project found. Please run this command from within a Bloom project "
            "or specify --nucleus-path"
        )
    
    def _validate_initial_files(
        self,
        file_paths: List[str],
        project_root: Path
    ) -> List[str]:
        """
        Validate that initial files exist and convert to relative paths.
        
        Args:
            file_paths: List of file paths (can be absolute or relative)
            project_root: Bloom project root for relativization
            
        Returns:
            List of validated relative paths
            
        Raises:
            FileNotFoundError: If any file doesn't exist
        """
        validated = []
        
        for file_str in file_paths:
            file_path = Path(file_str)
            
            # Try as absolute path first
            if file_path.is_absolute():
                if not file_path.exists():
                    raise FileNotFoundError(f"File not found: {file_path}")
                # Convert to relative from project root
                try:
                    relative = file_path.relative_to(project_root)
                    validated.append(str(relative))
                except ValueError:
                    # File is outside project, use absolute
                    validated.append(str(file_path))
            else:
                # Try relative to project root
                full_path = project_root / file_path
                if not full_path.exists():
                    # Try relative to cwd
                    cwd_path = Path.cwd() / file_path
                    if not cwd_path.exists():
                        raise FileNotFoundError(f"File not found: {file_str}")
                    # Convert cwd-relative to project-relative
                    try:
                        relative = cwd_path.relative_to(project_root)
                        validated.append(str(relative))
                    except ValueError:
                        validated.append(str(cwd_path))
                else:
                    validated.append(str(file_path))
        
        return validated
    
    def _create_directory_structure(
        self,
        project_root: Path,
        intent_type: str,
        folder_name: str
    ) -> Path:
        """
        Create the complete directory structure for an intent.
        
        Args:
            project_root: Bloom project root
            intent_type: "dev" or "doc"
            folder_name: Folder name (.{slug}-{uuid3})
            
        Returns:
            Path to the created intent directory
        """
        intents_base = project_root / ".bloom" / ".intents"
        intents_base.mkdir(parents=True, exist_ok=True)
        
        type_dir = intents_base / f".{intent_type}"
        type_dir.mkdir(exist_ok=True)
        
        intent_dir = type_dir / folder_name
        intent_dir.mkdir(parents=True, exist_ok=True)
        
        if intent_type == "dev":
            # Development intent structure
            subdirs = [
                ".briefing",
                ".briefing/.files",
                ".execution",
                ".execution/.files",
                ".refinement",
                ".pipeline",
                ".pipeline/.briefing",
                ".pipeline/.briefing/.response",
                ".pipeline/.briefing/.response/.staging",
                ".pipeline/.execution",
                ".pipeline/.execution/.response",
                ".pipeline/.execution/.response/.staging",
                ".pipeline/.refinement"
            ]
        elif intent_type == "doc":
            # Documentation intent structure
            subdirs = [
                ".context",
                ".context/.files",
                ".curation",
                ".pipeline",
                ".pipeline/.context",
                ".pipeline/.context/.response",
                ".pipeline/.context/.response/.staging",
                ".pipeline/.curation"
            ]
        elif intent_type in _BSIP_INTENT_TYPES:
            # Intents BSIP genéricos ("ing" / "dis"). Las fases y su orden
            # vienen del registro declarativo (intent_types.py) en vez de
            # hardcodearse acá — este método no debe conocer los nombres
            # concretos de fase de un intent type particular (ver docstring
            # de intent_types.py, motivo por el cual ese archivo existe).
            # .pipeline/ es el espejo de cada fase, confirmado contra
            # bloom_project_tree.txt y ING_Intent_Spec_v1_1.md §3/§4/§5 /
            # DIS_Intent_Spec_v1_0.md §3/§4/§5.
            spec = get_intent_type_spec(intent_type)
            subdirs = [".pipeline"]
            for phase in spec.phases:
                subdirs.append(f".{phase.name}")
                if not phase.has_turns:
                    # Fase de acto único (reception/discovery): archivos
                    # directos bajo .files/, sin subcarpeta de turno.
                    subdirs.append(f".{phase.name}/.files")
                subdirs.append(f".pipeline/.{phase.name}")
                subdirs.append(f".pipeline/.{phase.name}/.response")
                subdirs.append(f".pipeline/.{phase.name}/.response/.staging")
        else:
            raise ValueError(
                f"Unsupported intent type for directory structure: {intent_type}"
            )
        
        for subdir in subdirs:
            (intent_dir / subdir).mkdir(parents=True, exist_ok=True)
        
        return intent_dir
    
    def _create_initial_state(
        self,
        intent_id: str,
        intent_type: str,
        name: str,
        timestamp: str,
        initial_files: List[str],
        mandate_id: Optional[str] = None,
        domain_baseline: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create the initial state data structure.
        
        Args:
            intent_id: UUID3 of the intent
            intent_type: "dev", "doc", "ing" or "dis"
            name: Human-readable name
            timestamp: ISO timestamp
            initial_files: List of validated file paths
            mandate_id: Solo aplica a 'ing'/'dis' (ver create_intent()).
            domain_baseline: Solo aplica a 'ing', ya validado como
                no-None/no-inválido por create_intent() antes de llegar acá.
            
        Returns:
            Dictionary with initial state structure. Para 'ing'/'dis' el
            dict es un envelope DOBLE a propósito: conserva las claves
            legadas que el resto de IntentManager lee directamente
            (uuid/name/type/status/steps/initial_files/phase_active) Y las
            claves que espera IntentStateManager/intent_types.py
            (intent_id/intent_type/resumable + extra_state_fields), porque
            ambos leen/escriben el MISMO archivo de estado
            (.ing_state.json / .dis_state.json — ver
            IntentTypeSpec.state_filename). `_add_turn_bsip` es quien
            recarga este archivo vía `IntentStateManager.load()` para las
            transiciones de fase/turno; este método solo arma el estado de
            Génesis compatible con ambos lectores.
        """
        if intent_type == "dev":
            return {
                "status": "created",
                "name": name,
                "type": "dev",
                "uuid": intent_id,
                "created_at": timestamp,
                "initial_files": initial_files,
                "steps": {
                    "create": True,
                    "hydrate": False,
                    "plan": False,
                    "build": False,
                    "submit": False,
                    "merge": False
                }
            }
        elif intent_type == "doc":
            return {
                "status": "created",
                "name": name,
                "type": "doc",
                "uuid": intent_id,
                "created_at": timestamp,
                "initial_files": initial_files,
                "steps": {
                    "create": True,
                    "hydrate": False,
                    "curate": False,
                    "publish": False
                }
            }
        else:  # "ing" / "dis" — gramática BSIP genérica (intent_types.py)
            spec = get_intent_type_spec(intent_type)

            # Campos propios del tipo, con sus defaults declarados en el
            # registro (thresholds, classification_summary/mapping_summary,
            # baseline_scope/scope, etc.)
            extra_fields = {
                field_name: factory()
                for field_name, factory in spec.extra_state_fields.items()
            }

            if intent_type == "ing":
                # ING_Intent_Spec_v1_1.md §1: domain_baseline no tiene
                # default razonable — create_intent() ya validó que venga
                # seteado ("empty"/"existing") antes de llegar acá.
                extra_fields["domain_baseline"] = domain_baseline
            elif intent_type == "dis" and mandate_id:
                # DIS_Intent_Spec_v1_0.md §1: scope.mandate_ids acumula los
                # mandatos que este intent de discovery está escaneando.
                extra_fields["scope"]["mandate_ids"] = [mandate_id]

            # steps se deriva de las fases declaradas en el registro (más
            # "create", que es común a todos los tipos) — agregar un
            # octavo tipo de intent BSIP no debería requerir tocar este
            # método (ver docstring de intent_types.py).
            steps = {phase.name: False for phase in spec.phases}
            steps["create"] = True

            return {
                # --- Claves legadas: las lee el resto de IntentManager
                # (list_intents/get_intent/lock/unlock/hydrate/finalize/
                # submit/delete) directamente, sin pasar por
                # IntentStateManager. ---
                "status": "created",
                "name": name,
                "type": intent_type,
                "uuid": intent_id,
                "created_at": timestamp,
                "updated_at": timestamp,
                "initial_files": initial_files,
                "phase_active": spec.phases[0].name,
                "steps": steps,
                # --- Envelope BSIP: las lee/escribe IntentStateManager
                # (intent_state_manager.py) cuando `_add_turn_bsip` hace
                # `IntentStateManager.load()` sobre este mismo archivo. ---
                "intent_id": intent_id,
                "intent_type": intent_type,
                "mandate_id": mandate_id or "",
                "resumable": True,
                **extra_fields,
            }

    def update_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        new_name: Optional[str] = None,
        replace_files: Optional[List[str]] = None,
        add_files: Optional[List[str]] = None,
        remove_files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None,
        # Extended fields for future use:
        user_input: Optional[str] = None,
        api_config: Optional[Dict[str, Any]] = None,
        profile_settings: Optional[Dict[str, Any]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Update an existing intent's properties.
        
        This method handles updating intent metadata, renaming (with folder rename),
        and file list modifications. It's designed to be extensible for future fields.
        
        Args:
            intent_id: UUID of the intent to update
            folder_name: Folder name of the intent (alternative to intent_id)
            new_name: New human-readable name (triggers UUID3 regeneration and folder rename)
            replace_files: Complete replacement list for initial_files
            add_files: Files to add to existing initial_files
            remove_files: Files to remove from initial_files
            nucleus_path: Optional explicit path to Bloom project root
            
            Extended fields (for future implementation):
            user_input: User-provided input content
            api_config: API configuration dictionary
            profile_settings: Profile settings dictionary
            custom_metadata: Custom metadata dictionary
            
        Returns:
            Dictionary containing:
                - intent_id: UUID of the intent (may be new if name changed)
                - intent_path: Absolute path to intent directory
                - folder_name: Current folder name
                - name: Current name
                - type: Intent type
                - initial_files: Current file list
                - project_path: Bloom project root path
                - updated_at: ISO timestamp
                - changes: Dictionary of what changed
                - message: Success message
                
        Raises:
            ValueError: If validation fails or intent not found
            FileNotFoundError: If project or files not found
        """
        # Find Bloom project
        project_root = self._find_bloom_project(nucleus_path)
        
        # Locate the intent
        intent_path, state_data, state_file = self._locate_intent(
            project_root,
            intent_id,
            folder_name
        )
        
        # Track changes for reporting
        changes = {}
        old_intent_id = state_data["uuid"]
        old_name = state_data["name"]
        old_folder = intent_path.name
        
        # Handle name change (requires folder rename due to UUID3)
        if new_name and new_name.strip() != old_name:
            # Generate new UUID3 from new name
            new_intent_id = str(uuid.uuid3(self.INTENT_NAMESPACE, new_name.strip()))
            new_slug = self._slugify(new_name)
            new_folder_name = f".{new_slug}-{new_intent_id[:8]}"
            
            # Rename folder
            new_intent_path = intent_path.parent / new_folder_name
            intent_path.rename(new_intent_path)
            
            # Update state
            state_data["name"] = new_name.strip()
            state_data["uuid"] = new_intent_id
            
            # Track changes
            changes["name_changed"] = True
            changes["old_name"] = old_name
            changes["new_name"] = new_name.strip()
            changes["old_folder"] = old_folder
            changes["new_folder"] = new_folder_name
            changes["old_uuid"] = old_intent_id
            changes["new_uuid"] = new_intent_id
            
            # Update references
            intent_path = new_intent_path
            state_file = intent_path / state_file.name
        
        # Handle file operations
        current_files = state_data.get("initial_files", [])
        
        if replace_files is not None:
            # Validate and replace entire file list
            validated = self._validate_initial_files(replace_files, project_root)
            state_data["initial_files"] = validated
            changes["files_replaced"] = True
        
        elif add_files or remove_files:
            # Modify existing file list
            file_set = set(current_files)
            
            if add_files:
                validated_add = self._validate_initial_files(add_files, project_root)
                added_count = 0
                for f in validated_add:
                    if f not in file_set:
                        file_set.add(f)
                        added_count += 1
                changes["files_added"] = added_count
            
            if remove_files:
                removed_count = 0
                for f in remove_files:
                    # Normalize path for comparison
                    normalized = str(Path(f))
                    if normalized in file_set:
                        file_set.remove(normalized)
                        removed_count += 1
                changes["files_removed"] = removed_count
            
            state_data["initial_files"] = list(file_set)
        
        # Handle extended fields (for future use)
        # These are designed to be easily extended without breaking existing functionality
        if user_input is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["user_input"] = user_input
            changes["user_input_updated"] = True
        
        if api_config is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["api_config"] = api_config
            changes["api_config_updated"] = True
        
        if profile_settings is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["profile_settings"] = profile_settings
            changes["profile_settings_updated"] = True
        
        if custom_metadata is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["custom_metadata"] = custom_metadata
            changes["custom_metadata_updated"] = True
        
        # Update timestamp
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data["updated_at"] = timestamp
        
        # Write updated state
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # Return structured result
        return {
            "intent_id": state_data["uuid"],
            "intent_path": str(intent_path),
            "folder_name": intent_path.name,
            "name": state_data["name"],
            "type": state_data["type"],
            "initial_files": state_data.get("initial_files", []),
            "project_path": str(project_root),
            "updated_at": timestamp,
            "changes": changes,
            "message": f"Intent '{state_data['name']}' updated successfully"
        }


    def _locate_intent(
        self,
        project_root: Path,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None
    ) -> tuple[Path, Dict[str, Any], Path]:
        """
        Locate an intent by ID or folder name.
        
        Args:
            project_root: Bloom project root
            intent_id: Optional UUID to search for
            folder_name: Optional folder name to search for
            
        Returns:
            Tuple of (intent_path, state_data, state_file)
            
        Raises:
            ValueError: If intent not found or multiple matches
        """
        intents_base = project_root / ".bloom" / ".intents"
        
        if not intents_base.exists():
            raise ValueError("No intents directory found in project")
        
        # Search in .dev, .doc, .ing and .dis
        search_dirs = [
            intents_base / ".dev",
            intents_base / ".doc",
            intents_base / ".ing",
            intents_base / ".dis",
        ]
        matches = []
        
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            
            for intent_dir in search_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Check by folder name
                if folder_name and intent_dir.name == folder_name:
                    matches.append(intent_dir)
                    continue
                
                # Check by intent_id
                if intent_id:
                    # Try all known state files
                    for state_name in self._KNOWN_STATE_FILENAMES:
                        state_file = intent_dir / state_name
                        if state_file.exists():
                            try:
                                with open(state_file, "r", encoding="utf-8") as f:
                                    state = json.load(f)
                                if state.get("uuid") == intent_id:
                                    matches.append(intent_dir)
                                    break
                            except (json.JSONDecodeError, IOError):
                                continue
        
        if not matches:
            search_term = folder_name if folder_name else intent_id
            raise ValueError(f"Intent not found: {search_term}")
        
        if len(matches) > 1:
            raise ValueError(f"Multiple intents found matching criteria")
        
        intent_path = matches[0]
        
        # Load state file
        state_file = None
        state_data = None
        
        for state_name in self._KNOWN_STATE_FILENAMES:
            candidate = intent_path / state_name
            if candidate.exists():
                state_file = candidate
                with open(state_file, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                break
        
        if not state_data:
            raise ValueError(f"No valid state file found in {intent_path}")
        
        return intent_path, state_data, state_file        

    def list_intents(
        self,
        nucleus_path: Optional[Path] = None,
        intent_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List all intents in a Bloom project.
       
        Args:
            nucleus_path: Optional path to Bloom project
            intent_type: Optional filter by type ("dev", "doc", or None for all)
           
        Returns:
            Dictionary with list of intents and metadata
           
        Raises:
            FileNotFoundError: If project not found
        """
        project_root = self._find_bloom_project(nucleus_path)
        intents_base = project_root / ".bloom" / ".intents"
       
        if not intents_base.exists():
            return {
                "project_path": str(project_root),
                "intents": [],
                "total": 0
            }
       
        intents = []
       
        # Determinar qué directorios escanear
        scan_dirs = []
        if intent_type is None or intent_type == "dev":
            scan_dirs.append((".dev", "dev"))
        if intent_type is None or intent_type == "doc":
            scan_dirs.append((".doc", "doc"))
        if intent_type is None or intent_type == "ing":
            scan_dirs.append((".ing", "ing"))
        if intent_type is None or intent_type == "dis":
            scan_dirs.append((".dis", "dis"))
       
        for dir_name, type_name in scan_dirs:
            type_dir = intents_base / dir_name
            if not type_dir.exists():
                continue
           
            for intent_dir in type_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
               
                # Leer estado
                state_file_name = f".{type_name}_state.json"
                state_file = intent_dir / state_file_name
               
                if not state_file.exists():
                    continue
               
                try:
                    with open(state_file, "r", encoding="utf-8") as f:
                        state = json.load(f)
                   
                    intents.append({
                        "id": state.get("uuid", ""),
                        "name": state.get("name", ""),
                        "type": state.get("type", type_name),
                        "status": state.get("status", "unknown"),
                        "folder": intent_dir.name,
                        "created_at": state.get("created_at", ""),
                        "updated_at": state.get("updated_at", ""),
                        "locked": state.get("locked", False),
                        "initial_files_count": len(state.get("initial_files", []))
                    })
                except (json.JSONDecodeError, IOError):
                    continue
       
        return {
            "project_path": str(project_root),
            "intents": intents,
            "total": len(intents)
        }
    def get_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Get complete information about a specific intent.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Complete intent information including state, files, turns
           
        Raises:
            ValueError: If intent not found
        """
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Cargar información adicional
        intent_type = state_data.get("type", "dev")
       
        # Contar turns si es dev
        turns_count = 0
        classification_turns_count = 0
        consolidation_turns_count = 0
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            if refinement_dir.exists():
                turns_count = len([d for d in refinement_dir.iterdir() if d.is_dir()])
        elif intent_type == "doc":
            curation_dir = intent_path / ".curation"
            if curation_dir.exists():
                turns_count = len([d for d in curation_dir.iterdir() if d.is_dir()])
        elif intent_type in _BSIP_INTENT_TYPES:
            # "ing" / "dis" — turns viven repartidos entre la fase
            # propositiva (classification/mapping) y la fase de cierre
            # (consolidation/ratification). Los nombres de fase se resuelven
            # desde el registro en vez de hardcodear "classification"/
            # "consolidation" (que solo aplican a 'ing').
            spec = get_intent_type_spec(intent_type)
            proposal_phase = spec.phases[1].name   # classification | mapping
            closing_phase = spec.phases[2].name    # consolidation | ratification

            proposal_dir = intent_path / f".{proposal_phase}"
            if proposal_dir.exists():
                classification_turns_count = len(
                    [d for d in proposal_dir.iterdir() if d.is_dir()]
                )
            closing_dir = intent_path / f".{closing_phase}"
            if closing_dir.exists():
                consolidation_turns_count = len(
                    [d for d in closing_dir.iterdir() if d.is_dir()]
                )
            turns_count = classification_turns_count + consolidation_turns_count
       
        return {
            "id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "type": intent_type,
            "status": state_data.get("status", "unknown"),
            "folder": intent_path.name,
            "path": str(intent_path),
            "created_at": state_data.get("created_at", ""),
            "updated_at": state_data.get("updated_at", ""),
            "locked": state_data.get("locked", False),
            "locked_by": state_data.get("locked_by", ""),
            "locked_at": state_data.get("locked_at", ""),
            "initial_files": state_data.get("initial_files", []),
            "steps": state_data.get("steps", {}),
            "turns_count": turns_count,
            "classification_turns_count": classification_turns_count,
            "consolidation_turns_count": consolidation_turns_count,
            "phase_active": state_data.get("phase_active") if intent_type in _BSIP_INTENT_TYPES else None,
            "project_path": str(project_root),
            "full_state": state_data
        }
    def lock_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Lock an intent to mark it as in-use (determinism P5).
        Only one intent can be active at a time.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Lock status information
           
        Raises:
            ValueError: If intent already locked or not found
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar si ya está locked
        if state_data.get("locked", False):
            locked_by = state_data.get("locked_by", "unknown")
            locked_at = state_data.get("locked_at", "unknown")
            raise ValueError(
                f"Intent is already locked by {locked_by} at {locked_at}"
            )
       
        # Lock the intent
        timestamp = datetime.now(timezone.utc).isoformat()
        hostname = socket.gethostname()
       
        state_data["locked"] = True
        state_data["locked_by"] = f"{hostname}"
        state_data["locked_at"] = timestamp
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        return {
            "locked": True,
            "locked_by": hostname,
            "locked_at": timestamp,
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", "")
        }
    def unlock_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Unlock an intent to free it for use.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
            force: Force unlock even if locked by another host
           
        Returns:
            Unlock status information
           
        Raises:
            ValueError: If intent not found
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Unlock
        state_data["locked"] = False
        state_data["locked_by"] = ""
        state_data["locked_at"] = ""
        state_data["unlocked_at"] = datetime.now(timezone.utc).isoformat()
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        return {
            "locked": False,
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "unlocked_at": state_data["unlocked_at"]
        }
    def add_turn(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        actor: str = "user",
        content: str = "",
        nucleus_path: Optional[Path] = None,
        committed: bool = False,
        reviewed_resolution: Optional[List[Dict[str, Any]]] = None,
        close_phase: bool = False
    ) -> Dict[str, Any]:
        """
        Add a conversation turn to an intent's chat.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            actor: Who is speaking ("user" or "ai")
            content: Content of the message
            nucleus_path: Optional path to Bloom project
            committed: Solo aplica a intents BSIP ('ing'/'dis') cuando la fase
                activa es de cierre (.consolidation/ o .ratification/). Si es
                True, cierra el turno y dispara el "Efecto de committed: true"
                del spec §5 (materialización de genes/delta/semantic-index/docbase
                para 'ing'; de domains/edges para 'dis'). Ignorado para dev/doc
                y para fases propositivas (.classification/, .mapping/), que no
                tienen noción de commit.
            reviewed_resolution: Solo aplica junto con committed=True en una
                fase de cierre. Lista de ítems revisados (clusters para 'ing',
                cambios de dominio para 'dis'), cada uno con shape
                {"cluster_id"|"change_id": str, ..., "human_decision":
                "approved"|"overridden"|"rejected", "content": {...}}.
            close_phase: Solo tiene efecto en fases propositivas (.classification/
                de 'ing', .mapping/ de 'dis' — commit_field=None). Si True,
                además de escribir el turno, fuerza el avance explícito a la
                fase de cierre correspondiente
                (IntentStateManager.advance_after_proposal()) — la propuesta
                se da por terminada y pasa a revisión humana. Ignorado en fases
                de cierre, donde el avance ya lo decide `committed`, y en dev/doc.
           
        Returns:
            Turn information
           
        Raises:
            ValueError: If intent not found or invalid actor
        """
       
        if actor not in ["user", "ai"]:
            raise ValueError(f"Invalid actor '{actor}'. Must be 'user' or 'ai'")
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        intent_type = state_data.get("type", "dev")

        if intent_type in _BSIP_INTENT_TYPES:
            # Las fases con turnos de 'ing'/'dis' (.classification/.mapping,
            # .consolidation/.ratification) tienen una gramática de turno
            # distinta a .refinement/.curation/ (fase activa variable + concepto
            # de `committed` solo en la fase de cierre) — delegada por completo
            # al motor de estado (IntentStateManager) en vez de escribirse a
            # mano acá (ING_Intent_Spec_v1_1.md §4/§5, DIS_Intent_Spec_v1_0.md §4/§5).
            return self._add_turn_bsip(
                project_root, intent_path, state_data, state_file,
                actor, content, committed, reviewed_resolution, close_phase
            )
       
        # Determinar el número del siguiente turn
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            refinement_dir.mkdir(exist_ok=True)
            turn_num = len([d for d in refinement_dir.iterdir() if d.is_dir()]) + 1
            turn_dir = refinement_dir / f".turn_{turn_num}"
        else:
            curation_dir = intent_path / ".curation"
            curation_dir.mkdir(exist_ok=True)
            turn_num = len([d for d in curation_dir.iterdir() if d.is_dir()]) + 1
            turn_dir = curation_dir / f".turn_{turn_num}"
       
        turn_dir.mkdir(exist_ok=True)
        (turn_dir / ".files").mkdir(exist_ok=True)
       
        # Crear turn.json
        timestamp = datetime.now(timezone.utc).isoformat()
        turn_data = {
            "turn_id": turn_num,
            "actor": actor,
            "content": content,
            "timestamp": timestamp
        }
       
        turn_file = turn_dir / ".turn.json"
        with open(turn_file, "w", encoding="utf-8") as f:
            json.dump(turn_data, f, indent=2, ensure_ascii=False)
       
        return {
            "turn_id": turn_num,
            "actor": actor,
            "timestamp": timestamp,
            "turn_path": str(turn_dir),
            "intent_id": state_data.get("uuid", ""),
            "intent_name": state_data.get("name", "")
        }

    def _add_turn_bsip(
        self,
        project_root: Path,
        intent_path: Path,
        state_data: Dict[str, Any],
        state_file: Path,
        actor: str,
        content: str,
        committed: bool,
        reviewed_resolution: Optional[List[Dict[str, Any]]],
        close_phase: bool = False
    ) -> Dict[str, Any]:
        """
        Agrega un turno de negociación humano-IA para intents BSIP
        ('ing'/'dis'), en la fase que esté actualmente activa
        (.classification/.mapping o .consolidation/.ratification —
        ING_Intent_Spec_v1_1.md §4/§5, DIS_Intent_Spec_v1_0.md §4/§5).

        Reemplaza a `_add_turn_ing`, que `add_turn()` invocaba pero que
        nunca llegó a definirse (bug histórico — todo intent 'ing' que
        pasara de .reception/ rompía acá con AttributeError). A diferencia
        de la rama dev/doc de `add_turn()`, este helper NO escribe
        `.turn.json` a mano: delega la apertura/cierre de turno y el
        avance de fase a `IntentStateManager`, que es la única fuente de
        verdad de transiciones (ver intent_state_manager.py, docstring de
        módulo, punto 1 — "motor único para ing/ y dis/"). Este método solo
        arma el `control_payload` de negocio (actor/content/timestamp/
        committed/reviewed_resolution) y sincroniza los espejos de
        bookkeeping legado que el resto de IntentManager sigue leyendo
        directamente del mismo archivo de estado (`steps`, `status`,
        `initial_files`, etc. — ver `_create_initial_state` para el porqué
        de ese envelope doble).

        Args:
            project_root: Bloom project root (sin uso directo acá, se
                mantiene por simetría de firma con el resto de helpers
                privados que reciben el mismo set de argumentos posicionales).
            intent_path: Path al directorio del intent ya localizado.
            state_data: Estado ya cargado por `_locate_intent` (puede
                quedar stale tras `IntentStateManager.close_turn` — no se
                usa para escribir, solo para el mensaje de error de
                intent terminado).
            state_file: Path al `.ing_state.json` / `.dis_state.json`.
            actor: "user" | "ai" (ya validado por `add_turn`).
            content: Contenido del mensaje.
            committed: Ver docstring de `add_turn`.
            reviewed_resolution: Ver docstring de `add_turn`.
            close_phase: Ver docstring de `add_turn`. Solo tiene efecto
                cuando la fase activa es propositiva (commit_field=None) —
                en ese caso, fuerza `IntentStateManager.advance_after_proposal()`
                tras escribir el turno.

        Returns:
            Dict con turn_id/actor/timestamp/turn_path/intent_id/
            intent_name/phase/phase_advanced/phase_advanced_by_proposal/
            new_phase_active.

        Raises:
            ValueError: Si el intent ya está en fase terminal, o si el
                motor de estado rechaza la transición solicitada
                (se traduce cualquier IntentStateError a ValueError para
                mantener el mismo contrato de excepciones que el resto de
                IntentManager, que CreateCommand/otros comandos ya saben
                manejar).
        """
        try:
            mgr = IntentStateManager.load(intent_path)

            if mgr.is_terminated:
                raise ValueError(
                    f"Intent '{state_data.get('name', '?')}' ya está en fase "
                    f"terminal ('{mgr.spec.terminal_phase_name}') — no se "
                    "pueden agregar turnos."
                )

            phase_name = mgr.phase_active
            phase_spec = mgr.spec.phase_spec(phase_name)

            turn = mgr.open_turn(phase_name)

            timestamp = datetime.now(timezone.utc).isoformat()
            control_payload: Dict[str, Any] = {
                "turn_id": turn.turn_number,
                "actor": actor,
                "content": content,
                "timestamp": timestamp,
            }

            if phase_spec.commit_field is not None:
                # Fase de cierre (consolidation/ratification): acá SÍ
                # existe la noción de commit (ING §5, DIS §5).
                control_payload[phase_spec.commit_field] = bool(committed)
                if reviewed_resolution is not None:
                    control_payload["reviewed_resolution"] = reviewed_resolution

            advanced = mgr.close_turn(turn, control_payload)

            phase_advanced_by_proposal = False
            if not advanced and close_phase and phase_spec.commit_field is None:
                # Fase propositiva (classification/mapping): close_turn()
                # nunca avanza por sí sola (siempre devuelve False para
                # estas fases). `close_phase=True` es la señal explícita
                # del caller de que la propuesta está lista para pasar a
                # revisión humana en la fase de cierre.
                mgr.advance_after_proposal()
                phase_advanced_by_proposal = True
                advanced = True

        except IntentStateError as exc:
            raise ValueError(str(exc)) from exc

        # --- Sincronizar el espejo legado. IntentStateManager ya persistió
        # el archivo (vía open_turn/close_turn/_advance -> _persist()), así
        # que releemos en vez de reusar `state_data`, que quedó stale desde
        # antes de abrir el turno. ---
        fresh_state = json.loads(state_file.read_text(encoding="utf-8"))
        if "steps" in fresh_state and phase_name in fresh_state["steps"] and advanced:
            # Se marca "hecho" el paso de la fase que se acaba de cerrar
            # (la que estaba activa al abrir el turno), no la que quedó
            # activa después del avance.
            fresh_state["steps"][phase_name] = True
        fresh_state["status"] = "in_progress"
        fresh_state["updated_at"] = datetime.now(timezone.utc).isoformat()

        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(fresh_state, f, indent=2, ensure_ascii=False)

        return {
            "turn_id": turn.turn_number,
            "actor": actor,
            "timestamp": timestamp,
            "turn_path": str(turn.turn_dir),
            "intent_id": fresh_state.get("uuid", fresh_state.get("intent_id", "")),
            "intent_name": fresh_state.get("name", ""),
            "phase": phase_name,
            "phase_advanced": advanced,
            "phase_advanced_by_proposal": phase_advanced_by_proposal,
            "new_phase_active": fresh_state.get("phase_active"),
        }

    def finalize_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Finalize an intent, marking it as completed.
        This closes the intent and applies changes to the codebase.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Finalization status
           
        Raises:
            ValueError: If intent not found or locked
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar que no esté locked por otro
        if state_data.get("locked", False):
            raise ValueError(
                f"Cannot finalize: Intent is locked by {state_data.get('locked_by', 'unknown')}"
            )
       
        # Marcar como completado
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data["status"] = "completed"
        state_data["finalized_at"] = timestamp
        state_data["locked"] = False

        intent_type = state_data.get("type", "dev")

        # Actualizar steps
        if "steps" in state_data:
            if intent_type == "dev":
                state_data["steps"]["merge"] = True
            elif intent_type == "doc":
                state_data["steps"]["publish"] = True
            elif intent_type in _BSIP_INTENT_TYPES:
                # finalize_intent es un evento de bookkeeping POSTERIOR e
                # INDEPENDIENTE al commit de la fase de cierre
                # (.consolidation/ para 'ing', .ratification/ para 'dis' —
                # `_add_turn_bsip` con committed=True). Ese commit ya
                # materializó genes/.delta_N/.semantic-index.json/.docbase.json
                # (o domains/edges para 'dis'); acá NO se re-ejecuta ninguna
                # escritura de dominio, solo se cierra el ciclo de vida del
                # intent a nivel de estado (ING_Intent_Spec_v1_1.md §5,
                # DIS_Intent_Spec_v1_0.md §5).
                self._finalize_bsip_intent(state_data, intent_type)
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        # Contar archivos modificados (simulado)
        files_modified = len(state_data.get("initial_files", []))

        result = {
            "status": "completed",
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "finalized_at": timestamp,
            "files_modified": files_modified,
            "message": f"Intent '{state_data.get('name', 'unknown')}' finalized successfully"
        }

        # Para 'ing'/'dis' se expone además el estado de la fase de cierre
        # que ya quedó fijado por el commit de turno (`_add_turn_bsip`) —
        # solo lectura, no se recalcula ni se vuelve a escribir nada acá.
        if intent_type in _BSIP_INTENT_TYPES:
            spec = get_intent_type_spec(intent_type)
            last_phase = spec.phases[-1].name  # "consolidation" | "ratification"
            result["closing_phase_committed"] = state_data.get("steps", {}).get(last_phase, False)
            result["phase_active"] = state_data.get("phase_active")

        return result

    def _finalize_bsip_intent(self, state_data: Dict[str, Any], intent_type: str) -> None:
        """
        Bookkeeping de finalización para intents BSIP ('ing'/'dis') —
        generalización de la antigua `_finalize_ing_intent`, que solo
        cubría 'ing', para compartir la misma lógica con 'dis'.

        Este helper NO escribe genes, deltas ni el índice semántico (ni,
        para 'dis', domains/edges): esa responsabilidad es exclusiva del
        commit de turno en la fase de cierre (`committed: true` dentro de
        `_add_turn_bsip`). Acá solo se cierra el ciclo de vida del intent a
        nivel de `.ing_state.json` / `.dis_state.json`:

          - `steps[<última fase>] = True` — "consolidate" para 'ing',
            "ratification" para 'dis', equivalente a `steps["merge"]`
            (dev) / `steps["publish"]` (doc). El nombre de la última fase
            se resuelve desde el registro, no se hardcodea.

        No valida ni bloquea el cierre si esa fase todavía no comiteó:
        `finalize_intent` es, por diseño, un evento de bookkeeping distinto
        y posterior al commit de la fase de cierre (ING_Intent_Spec_v1_1.md
        §5, DIS_Intent_Spec_v1_0.md §5), así que no le corresponde forzar
        esa precondición de negocio acá.

        Args:
            state_data: Diccionario de estado (`.ing_state.json` /
                `.dis_state.json`) ya cargado por `_locate_intent`. Se muta
                in-place; el caller (`finalize_intent`) es responsable de
                persistirlo a disco.
            intent_type: "ing" | "dis" — determina, vía el registro, cuál
                es la última fase a marcar.
        """
        spec = get_intent_type_spec(intent_type)
        last_phase = spec.phases[-1].name
        if last_phase in state_data.get("steps", {}):
            state_data["steps"][last_phase] = True

    def delete_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Delete an intent completely.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
            force: Force deletion without confirmation
           
        Returns:
            Deletion status
           
        Raises:
            ValueError: If intent not found or locked
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar lock
        if not force and state_data.get("locked", False):
            raise ValueError(
                f"Cannot delete: Intent is locked by {state_data.get('locked_by', 'unknown')}. Use --force to override."
            )
       
        # Guardar info antes de borrar
        intent_name = state_data.get("name", "unknown")
        intent_uuid = state_data.get("uuid", "")
       
        # Eliminar directorio completo
        shutil.rmtree(intent_path)
       
        return {
            "deleted": True,
            "intent_id": intent_uuid,
            "name": intent_name,
            "path": str(intent_path),
            "message": f"Intent '{intent_name}' deleted successfully"
        }    
    def submit_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        provider: str = "claude",
        nucleus_path: Optional[Path] = None,
        profile_path: Optional[str] = None,
        host: str = "127.0.0.1",
        port: int = 5678,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Submit an intent payload to AI provider through native host bridge.
        
        This is the SUBMIT step (Step 5) in the Intent lifecycle.
        Reads the built payload and sends it to the native host via TCP.
        
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            provider: AI provider to use ("claude", "gemini", etc.)
            nucleus_path: Optional path to Bloom project
            profile_path: Optional Chrome profile path for the AI provider
            host: Native host IP address (default: 127.0.0.1)
            port: Native host TCP port (default: 5678)
            timeout: Connection timeout in seconds (default: 30)
            
        Returns:
            Dictionary containing:
                - intent_id: Intent UUID
                - intent_name: Intent name
                - provider: AI provider used
                - command_id: Generated command ID for tracking
                - host_response: Response from native host
                - payload_size: Size of payload in bytes
                - submitted_at: ISO timestamp
                
        Raises:
            ValueError: If intent not found or payload files missing
            FileNotFoundError: If payload or index files don't exist
            ConnectionError: If cannot connect to native host
            TimeoutError: If connection times out
        """
        import struct
        import time
        
        # 1. Locate intent
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
        
        intent_type = state_data.get("type", "dev")
        intent_uuid = state_data.get("uuid", "")
        intent_name = state_data.get("name", "unknown")
        
        # 2. Locate payload and index files in .pipeline/.briefing/
        pipeline_dir = intent_path / ".pipeline" / ".briefing"
        
        if not pipeline_dir.exists():
            raise FileNotFoundError(
                f"Pipeline directory not found. Has the payload been built? "
                f"Run 'brain intent build-payload' first."
            )
        
        # Look for payload.json and index.json (or .payload.json and .index.json)
        payload_file = None
        index_file = None
        
        for name in ["payload.json", ".payload.json"]:
            test_path = pipeline_dir / name
            if test_path.exists():
                payload_file = test_path
                break
        
        for name in ["index.json", ".index.json"]:
            test_path = pipeline_dir / name
            if test_path.exists():
                index_file = test_path
                break
        
        if not payload_file:
            raise FileNotFoundError(
                f"Payload file not found in {pipeline_dir}. "
                f"Run 'brain intent build-payload' first."
            )
        
        if not index_file:
            raise FileNotFoundError(
                f"Index file not found in {pipeline_dir}. "
                f"Run 'brain intent build-payload' first."
            )
        
        # 3. Read payload and index
        with open(index_file, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        
        with open(payload_file, "r", encoding="utf-8") as f:
            payload_data = json.load(f)
        
        # 4. Generate command ID (use intent UUID or generate new one)
        command_id = index_data.get("intent_id", intent_uuid)
        if not command_id:
            command_id = str(uuid.uuid4())
        
        # 5. Build message for native host (following protocol from ai_submit_main.py)
        timestamp = time.time()
        message = {
            "id": command_id,
            "command": f"{provider}.submit",  # e.g., "claude.submit"
            "payload": {
                "provider": provider,
                "text": payload_data.get("content", ""),
                "context_files": payload_data.get("context_files", []),
                "parameters": payload_data.get("parameters", {}),
                "profile": profile_path or index_data.get("profile_path", "")
            },
            "timestamp": timestamp
        }
        
        # 6. Send to native host via TCP
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                s.connect((host, port))
                
                # Serialize JSON
                json_str = json.dumps(message)
                json_bytes = json_str.encode('utf-8')
                
                # Create 4-byte header (Little Endian) with size
                header = struct.pack('<I', len(json_bytes))
                
                # Send header + payload
                s.sendall(header + json_bytes)
                
                # Wait for response
                resp_header = s.recv(4)
                if not resp_header:
                    raise ConnectionError("No response header from native host")
                
                resp_len = struct.unpack('<I', resp_header)[0]
                
                # Receive response data
                chunks = []
                bytes_recd = 0
                while bytes_recd < resp_len:
                    chunk = s.recv(min(resp_len - bytes_recd, 4096))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    bytes_recd += len(chunk)
                
                resp_data = b''.join(chunks).decode('utf-8')
                host_response = json.loads(resp_data)
                
        except socket.timeout:
            raise TimeoutError(
                f"Connection to native host timed out after {timeout} seconds. "
                f"Is bloom-host running at {host}:{port}?"
            )
        except ConnectionRefusedError:
            raise ConnectionError(
                f"Could not connect to native host at {host}:{port}. "
                f"Is bloom-host.exe running?"
            )
        except Exception as e:
            raise ConnectionError(f"Communication error with native host: {e}")
        
        # 7. Update intent state
        submitted_at = datetime.now(timezone.utc).isoformat()
        
        if "steps" in state_data:
            state_data["steps"]["submit"] = True
        
        state_data["last_submitted_at"] = submitted_at
        state_data["last_provider"] = provider
        
        # Save state
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # 8. Return structured result
        return {
            "intent_id": intent_uuid,
            "intent_name": intent_name,
            "provider": provider,
            "command_id": command_id,
            "host_response": host_response,
            "payload_size": len(json_bytes),
            "submitted_at": submitted_at,
            "message": f"Intent '{intent_name}' submitted to {provider} successfully"
        }