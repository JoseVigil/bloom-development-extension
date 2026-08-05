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
from brain.core.intent_state_manager import (
    IntentStateManager,
    IntentStateError,
    InvalidTransitionError,
    PhaseNotActiveError,
    IntentAlreadyTerminatedError,
)
from brain.core.intent_types import get_intent_type_spec


# Tipos que corren sobre el motor genérico BSIP (IntentStateManager +
# intent_types.py) en vez del schema hand-rolled legacy de dev/doc.
# Agregar un octavo tipo acá es, en principio, solo esto + una entrada
# en intent_types.INTENT_TYPE_REGISTRY — ver intent_types.py.
_BSIP_ENGINE_TYPES = ("ing", "dis")


def _uid(state_data: Dict[str, Any]) -> str:
    """ID de un intent, sin importar qué convención de schema usa.

    dev/doc (legacy, hand-rolled) guardan el identificador bajo la key
    'uuid'. ing/dis (delegados a IntentStateManager, spec-compliant)
    lo guardan bajo 'intent_id' — ver ING_Intent_Spec_v1_1.md §1 /
    DIS_Intent_Spec_v1_0.md §1, que definen 'intent_id', no 'uuid'.
    Este helper es el único punto que conoce esa divergencia; todo el
    resto del archivo debería llamar a esto en vez de acceder a
    cualquiera de las dos keys directamente."""
    return state_data.get("uuid") or state_data.get("intent_id", "")


def _itype(state_data: Dict[str, Any]) -> str:
    """Tipo de intent, sin importar la convención de schema — mismo
    motivo que _uid(): legacy usa 'type', IntentStateManager (spec)
    usa 'intent_type' (ING §1 / DIS §1)."""
    return state_data.get("type") or state_data.get("intent_type", "dev")


class IntentManager:
    """
    Manager for intent lifecycle operations in Bloom projects.
    
    This class provides pure business logic for creating, managing,
    and tracking intents (both development and documentation types).
    """
    
    # Namespace UUID for generating deterministic intent IDs
    INTENT_NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    
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
        domain_baseline: Optional[str] = None,
        scope: Optional[Dict[str, Any]] = None,
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
            mandate_id: Obligatorio para intent_type 'ing'/'dis' (ING_Intent_Spec_v1_1.md
                §0 regla 2, DIS_Intent_Spec_v1_0.md regla 2: "siempre corre bajo un
                Mandate, nunca 'suelto'"). No requiere que exista todavía un
                mandate.json *firmado* — ese es precisamente el punto de la capa
                Freeze-to-Mandate (ver freeze_to_mandate()): mandate_id referencia
                el contexto de Mandate en curso, la firma es un paso posterior y
                explícito, no una precondición de arranque. Ignorado para dev/doc.
            domain_baseline: Solo 'ing'. "empty" | "existing" (ING §1). Si se omite,
                queda None hasta que .classification/ lo determine.
            scope: Solo 'dis'. Override de scope.mode/scope.mandate_ids (DIS §1).
                Si se omite, usa el default del registro ("nucleus_wide", []).
            
        Returns:
            Dictionary containing:
                - intent_id, intent_path, folder_name, name, type,
                  initial_files, project_path, created_at, mandate_id,
                  phase_active (None para dev/doc), message
                
        Raises:
            ValueError: If intent_type is invalid, name is empty, or
                mandate_id falta para 'ing'/'dis'
            FileNotFoundError: If Bloom project not found or initial files don't exist
        """
        # Validate inputs
        if intent_type not in ["dev", "doc", "ing", "dis"]:
            raise ValueError(f"Invalid intent type: {intent_type}")
        
        if not name or not name.strip():
            raise ValueError("Intent name cannot be empty")
        
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

        timestamp = datetime.now(timezone.utc).isoformat()
        clean_mandate_id = mandate_id.strip() if mandate_id else None

        if intent_type in _BSIP_ENGINE_TYPES:
            if not clean_mandate_id:
                raise ValueError(
                    f"mandate_id es obligatorio para intents '{intent_type}' "
                    "(ING_Intent_Spec_v1_1.md §0 regla 2 / DIS_Intent_Spec_v1_0.md "
                    "regla 2: 'siempre corre bajo un Mandate, nunca suelto'). No "
                    "hace falta que el Mandate ya esté firmado — ver "
                    "freeze_to_mandate() para cristalizarlo cuando corresponda."
                )

            extra_overrides: Dict[str, Any] = {}
            if intent_type == "ing" and domain_baseline is not None:
                if domain_baseline not in ("empty", "existing"):
                    raise ValueError(
                        "domain_baseline debe ser 'empty' o 'existing' (ING §1)"
                    )
                extra_overrides["domain_baseline"] = domain_baseline
            if intent_type == "dis" and scope is not None:
                extra_overrides["scope"] = scope

            # Resolver el path del intent SIN crearlo todavía —
            # IntentStateManager.create() exige que `intent_root` esté
            # vacío (o no exista), y es quien lo crea (junto con el
            # directorio de la primera fase y el `_state.json`). Si acá
            # ya hubiéramos corrido `_create_directory_structure()`, el
            # directorio habría quedado no-vacío y create() rechazaba
            # SIEMPRE con IntentStateError, sin excepción — bug que
            # bloqueaba por completo la creación de cualquier intent
            # 'ing'/'dis'. `_create_directory_structure()` corre DESPUÉS,
            # y es idempotente (mkdir(..., exist_ok=True) en todos los
            # subdirs) frente al directorio de la primera fase que
            # create() ya dejó armado.
            intents_base = project_root / ".bloom" / ".intents"
            intent_path = intents_base / f".{intent_type}" / folder_name

            state_mgr = IntentStateManager.create(
                intent_root=intent_path,
                intent_type=intent_type,
                mandate_id=clean_mandate_id,
                extra_overrides=extra_overrides or None,
                intent_id=intent_id,
            )
            # 'name' e 'initial_files' no son parte del envelope oficial de
            # ing/dis (ING §1 / DIS §1 no los declaran) — son metadata
            # operativa que hydrate() necesita para saber qué procesar en
            # .reception/ o .discovery/. set_metadata() los adjunta sin
            # tocar el schema validado por spec.
            state_mgr.set_metadata(name=name.strip(), initial_files=validated_files)
            state_data = state_mgr.snapshot()
            phase_active = state_data.get("phase_active")

            # Completa el resto del skeleton (fases restantes + espejo
            # .pipeline/) — la primera fase y el _state.json ya existen,
            # esta llamada solo agrega lo que falta.
            self._create_directory_structure(project_root, intent_type, folder_name)
        else:
            # Create directory structure (skeleton completo, incluido
            # .pipeline/ espejo) — dev/doc no pasan por IntentStateManager,
            # así que no hay conflicto de "directorio no vacío" acá.
            intent_path = self._create_directory_structure(
                project_root,
                intent_type,
                folder_name
            )
            state_data = self._create_initial_state(
                intent_id, intent_type, name, timestamp, validated_files
            )
            state_filename = ".dev_state.json" if intent_type == "dev" else ".doc_state.json"
            state_file = intent_path / state_filename
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump(state_data, f, indent=2, ensure_ascii=False)
            phase_active = None

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
            "mandate_id": clean_mandate_id,
            "phase_active": phase_active,
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
       
        intent_type = _itype(state_data)

        if intent_type in _BSIP_ENGINE_TYPES:
            # .reception/ (ing) y .discovery/ (dis) tienen un contrato
            # completamente distinto al de .briefing/.context (inventario +
            # texto extraído / snapshot de linaje, no briefing/instruction) —
            # ver ING_Intent_Spec_v1_1.md §3 y DIS_Intent_Spec_v1_0.md §3.
            # Ambas son fases sin turnos (acto único), por eso comparten un
            # solo helper genérico en vez de uno por tipo.
            return self._hydrate_bsip_phaseless_act(
                project_root, intent_path, state_data, state_file, files, verbose
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
        verbose: bool
    ) -> Dict[str, Any]:
        """
        Fase sin turnos de 'ing'/'dis': .reception/ (ING §3) o .discovery/
        (DIS §3) — acto único, si algo sale mal se reintenta la fase entera,
        no hay concepto de turno acá.

        Delega el avance de fase en IntentStateManager.close_phaseless_act()
        en vez de escribir 'phase_active' a mano en el dict (como hacía la
        versión anterior, _hydrate_ing_reception) — el avance queda sujeto
        a las mismas validaciones deterministas que el resto del motor.
        """
        intent_type = _itype(state_data)
        mgr = IntentStateManager.load(intent_path)

        if intent_type == "ing":
            content_payload = self._write_ing_reception_content(
                project_root, intent_path, state_data, files, verbose
            )
        else:  # "dis"
            content_payload = self._write_dis_discovery_content(
                project_root, intent_path, state_data, verbose
            )

        try:
            mgr.close_phaseless_act()
        except InvalidTransitionError as exc:
            raise ValueError(str(exc)) from exc

        mgr.set_metadata(status="hydrated")

        return {
            "intent_id": mgr.intent_id,
            "status": "hydrated",
            "phase_active": mgr.phase_active,
            "briefing_updated": False,
            **content_payload,
        }

    def _write_ing_reception_content(
        self,
        project_root: Path,
        intent_path: Path,
        state_data: Dict[str, Any],
        files: Optional[List[str]],
        verbose: bool,
    ) -> Dict[str, Any]:
        """
        Escribe el contenido de .reception/ (ING §3):
        - .rawbase.json: inventario (path/type/hash/size/status) por archivo.
        - .rawbase_index.json: texto extraído + embedding_source_text
          obligatorio por archivo (Invariante 1 de BISP).
        No toca phase_active — eso lo resuelve el caller vía IntentStateManager.
        """
        reception_dir = intent_path / ".reception"
        files_dir = reception_dir / ".files"
        files_dir.mkdir(parents=True, exist_ok=True)

        files_to_process = set(files) if files else set()
        files_to_process.update(state_data.get("initial_files", []))

        rawbase_entries = []
        rawbase_index_entries = []
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

            rawbase_entries.append({
                "path": file_path_str,
                "type": file_type,
                "hash": file_hash,
                "size": file_size,
                "status": "received"
            })
            rawbase_index_entries.append({
                "path": file_path_str,
                "extracted_text": content,
                "embedding_source_text": content
            })

            stats["total_files"] += 1
            stats["total_size_kb"] += file_size / 1024

        with open(reception_dir / ".rawbase.json", 'w', encoding="utf-8") as f:
            json.dump({"files": rawbase_entries}, f, indent=2, ensure_ascii=False)

        with open(reception_dir / ".rawbase_index.json", 'w', encoding="utf-8") as f:
            json.dump({"index": rawbase_index_entries}, f, indent=2, ensure_ascii=False)

        return {
            "stats": {
                "total_files": stats["total_files"],
                "total_size_kb": round(stats["total_size_kb"], 2)
            }
        }

    def _write_dis_discovery_content(
        self,
        project_root: Path,
        intent_path: Path,
        state_data: Dict[str, Any],
        verbose: bool,
    ) -> Dict[str, Any]:
        """
        Escribe el contenido de .discovery/ (DIS §3):
        - .genebase.json: snapshot de linaje de todos los Genes del scope.
        - .domain_graph_snapshot.json: copia de .cache/.semantic-index.json
          al momento de arrancar.

        LÍMITE EXPLÍCITO DE ESTA IMPLEMENTACIÓN: `.mandates/{id}/.genes/` y
        `.cache/.semantic-index.json` viven a nivel Nucleus, no a nivel de
        este proyecto — bloom_project_tree.txt es explícito en que ese árbol
        no forma parte de esta sesión y que su ubicación real no se inventa
        acá. Este método intenta rutas candidatas razonables bajo
        `{project_root}/.bloom/`; si no las encuentra, degrada a un snapshot
        vacío y lo señala en `warnings` en vez de fabricar datos. Reemplazar
        `_candidate_mandates_root()` / `_candidate_semantic_index_path()`
        por las rutas reales de Nucleus es trabajo pendiente explícito, no
        un bug de esta función.
        """
        discovery_dir = intent_path / ".discovery"
        files_dir = discovery_dir / ".files"
        files_dir.mkdir(parents=True, exist_ok=True)

        warnings: List[str] = []
        scope = state_data.get("scope", {"mode": "nucleus_wide", "mandate_ids": []})

        # --- .genebase.json --------------------------------------------
        genes: List[Dict[str, Any]] = []
        mandates_root = project_root / ".bloom" / ".mandates"
        if mandates_root.exists():
            mandate_dirs = (
                [mandates_root / mid for mid in scope.get("mandate_ids", [])]
                if scope.get("mode") == "mandate_scoped" and scope.get("mandate_ids")
                else [d for d in mandates_root.iterdir() if d.is_dir()]
            )
            for mandate_dir in mandate_dirs:
                genes_dir = mandate_dir / ".genes"
                if not genes_dir.exists():
                    continue
                for gene_dir in genes_dir.iterdir():
                    gen_json = gene_dir / "gen.json"
                    if not gen_json.exists():
                        continue
                    try:
                        gene_data = json.loads(gen_json.read_text(encoding="utf-8"))
                        genes.append({
                            "gene_id": gene_data.get("gene_id"),
                            "mandate_id": gene_data.get("mandate_id"),
                            "semantic_function": gene_data.get("semantic_function"),
                            "scope_files": gene_data.get("scope_files", []),
                            "created_by_intent": gene_data.get("created_by_intent"),
                            "created_at": gene_data.get("created_at"),
                        })
                    except (json.JSONDecodeError, IOError) as e:
                        if verbose:
                            print(f"⚠️ Warning: gen.json inválido en {gene_dir}: {e}")
        else:
            warnings.append(
                f"'{mandates_root}' no existe — genebase queda vacío. Ruta "
                "Nucleus-level no confirmada en esta sesión (ver "
                "bloom_project_tree.txt, nota de cabecera)."
            )

        with open(discovery_dir / ".genebase.json", 'w', encoding="utf-8") as f:
            json.dump({"genes": genes}, f, indent=2, ensure_ascii=False)
        # .genebase_index.json queda como índice vacío hasta que exista capa
        # de vectorización real (Ollama/ChromaDB) — degradación graceful
        # documentada en DIS §6, no un placeholder silencioso.
        with open(discovery_dir / ".genebase_index.json", 'w', encoding="utf-8") as f:
            json.dump({"entries": [], "vectorized": False}, f, indent=2, ensure_ascii=False)

        # --- .domain_graph_snapshot.json --------------------------------
        semantic_index_path = project_root / ".bloom" / ".cache" / ".semantic-index.json"
        if semantic_index_path.exists():
            try:
                snapshot = json.loads(semantic_index_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError) as e:
                warnings.append(f"'{semantic_index_path}' no parseable: {e}")
                snapshot = {"updated_at": None, "domains": {}}
        else:
            warnings.append(
                f"'{semantic_index_path}' no existe — snapshot arranca vacío "
                "(ruta Nucleus-level no confirmada en esta sesión)."
            )
            snapshot = {"updated_at": None, "domains": {}}

        with open(discovery_dir / ".domain_graph_snapshot.json", 'w', encoding="utf-8") as f:
            json.dump(snapshot, f, indent=2, ensure_ascii=False)

        return {
            "stats": {"genes_found": len(genes), "domains_in_snapshot": len(snapshot.get("domains", {}))},
            "warnings": warnings,
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
        elif intent_type == "ing":
            # Ingestion intent structure ("ing")
            # Tres fases: .reception/ (acto único), .classification/ (con turnos),
            # .consolidation/ (con turnos) — .pipeline/ espejo de las tres,
            # confirmado contra bloom_project_tree.txt y ING_Intent_Spec_v1_1.md §2.
            subdirs = [
                ".reception",
                ".reception/.files",
                ".classification",
                ".consolidation",
                ".pipeline",
                ".pipeline/.reception",
                ".pipeline/.reception/.response",
                ".pipeline/.reception/.response/.staging",
                ".pipeline/.classification",
                ".pipeline/.classification/.response",
                ".pipeline/.classification/.response/.staging",
                ".pipeline/.consolidation",
                ".pipeline/.consolidation/.response",
                ".pipeline/.consolidation/.response/.staging",
            ]
        else:  # "dis"
            # Discovery intent structure ("dis") — mismo principio de fases +
            # .pipeline/ espejo que 'ing', tres fases propias: .discovery/
            # (acto único), .mapping/ (con turnos), .ratification/ (con turnos).
            # Ver DIS_Intent_Spec_v1_0.md §2 y bloom_project_tree.txt rama .dis/.
            subdirs = [
                ".discovery",
                ".discovery/.files",
                ".mapping",
                ".ratification",
                ".pipeline",
                ".pipeline/.discovery",
                ".pipeline/.discovery/.response",
                ".pipeline/.discovery/.response/.staging",
                ".pipeline/.mapping",
                ".pipeline/.mapping/.response",
                ".pipeline/.mapping/.response/.staging",
                ".pipeline/.ratification",
                ".pipeline/.ratification/.response",
                ".pipeline/.ratification/.response/.staging",
            ]
        
        for subdir in subdirs:
            (intent_dir / subdir).mkdir(parents=True, exist_ok=True)
        
        return intent_dir
    
    def _create_initial_state(
        self,
        intent_id: str,
        intent_type: str,
        name: str,
        timestamp: str,
        initial_files: List[str]
    ) -> Dict[str, Any]:
        """
        Create the initial state data structure.
        
        Args:
            intent_id: UUID3 of the intent
            intent_type: "dev" or "doc"
            name: Human-readable name
            timestamp: ISO timestamp
            initial_files: List of validated file paths
            
        Returns:
            Dictionary with initial state structure
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
        else:  # "ing"
            # Shape según ING_Intent_Spec_v1_0.md §1: phase_active recorre
            # reception -> classification -> consolidation. domain_baseline
            # queda vacío/None en Génesis (poblado luego por .classification/).
            # thresholds y classification_summary son placeholders operativos
            # hasta que .classification/ corra el algoritmo real de clustering.
            return {
                "status": "created",
                "name": name,
                "type": "ing",
                "uuid": intent_id,
                "created_at": timestamp,
                "initial_files": initial_files,
                "phase_active": "reception",
                "domain_baseline": None,
                "thresholds": {
                    "similarity_threshold": 0.85,
                    "confidence_threshold": 0.7
                },
                "classification_summary": {
                    "total_clusters": 0,
                    "resolved_clusters": 0,
                    "pending_clusters": 0
                },
                "consolidation_committed": False,
                "steps": {
                    "create": True,
                    "reception": False,
                    "classification": False,
                    "consolidate": False
                }
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

        if _itype(state_data) in _BSIP_ENGINE_TYPES:
            # update_intent() (rename + reemplazo de archivos) asume el
            # schema legacy de dev/doc (key 'uuid'/'name' obligatorias,
            # rename de carpeta atado a un uuid3 recalculado). ing/dis usan
            # un envelope distinto (IntentStateManager, key 'intent_id', sin
            # campo 'name' oficial en la spec) y ningún spec define qué
            # significa "renombrar" un intent BSIP en curso — no se
            # generaliza acá para no inventar semántica no especificada.
            raise ValueError(
                f"update_intent() todavía no soporta intents '{_itype(state_data)}' "
                "— usar add_turn()/hydrate_intent() para mutar su estado."
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
        state_filenames = [".dev_state.json", ".doc_state.json", ".ing_state.json", ".dis_state.json"]
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
                    for state_name in state_filenames:
                        state_file = intent_dir / state_name
                        if state_file.exists():
                            try:
                                with open(state_file, "r", encoding="utf-8") as f:
                                    state = json.load(f)
                                if _uid(state) == intent_id:
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
        
        for state_name in state_filenames:
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
                        "id": _uid(state),
                        "name": state.get("name", ""),
                        "type": _itype(state) or type_name,
                        # ing/dis (spec) no tienen 'status' — phase_active es
                        # la señal equivalente (ING §1 / DIS §1).
                        "status": state.get("status") or state.get("phase_active", "unknown"),
                        "folder": intent_dir.name,
                        "created_at": state.get("created_at", ""),
                        "updated_at": state.get("updated_at", ""),
                        "locked": state.get("locked", False),
                        "mandate_id": state.get("mandate_id"),
                        "frozen": state.get("frozen", False),
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
        intent_type = _itype(state_data)
       
        # Contar turns — nombres de fase-con-turnos según el tipo. dev/doc
        # conservan su propio nombre de carpeta (.refinement/.curation);
        # ing/dis comparten la forma "primer_fase_con_turnos + segunda" vía
        # intent_types.get_intent_type_spec(), en vez de hardcodear otro
        # par de ifs paralelo al de intent_state_manager.py.
        turns_count = 0
        classification_turns_count = 0  # nombre heredado del campo legacy;
        consolidation_turns_count = 0    # para 'dis' representa mapping/ratification
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            if refinement_dir.exists():
                turns_count = len([d for d in refinement_dir.iterdir() if d.is_dir()])
        elif intent_type == "doc":
            curation_dir = intent_path / ".curation"
            if curation_dir.exists():
                turns_count = len([d for d in curation_dir.iterdir() if d.is_dir()])
        elif intent_type in _BSIP_ENGINE_TYPES:
            spec = get_intent_type_spec(intent_type)
            turn_phases = [p.name for p in spec.phases if p.has_turns]  # 2 fases
            proposal_dir = intent_path / f".{turn_phases[0]}"
            if proposal_dir.exists():
                classification_turns_count = len(
                    [d for d in proposal_dir.iterdir() if d.is_dir()]
                )
            commit_dir = intent_path / f".{turn_phases[1]}"
            if commit_dir.exists():
                consolidation_turns_count = len(
                    [d for d in commit_dir.iterdir() if d.is_dir()]
                )
            turns_count = classification_turns_count + consolidation_turns_count
       
        return {
            "id": _uid(state_data),
            "name": state_data.get("name", ""),
            "type": intent_type,
            "status": state_data.get("status") or state_data.get("phase_active", "unknown"),
            "folder": intent_path.name,
            "path": str(intent_path),
            "created_at": state_data.get("created_at", ""),
            "updated_at": state_data.get("updated_at", ""),
            "locked": state_data.get("locked", False),
            "locked_by": state_data.get("locked_by", ""),
            "locked_at": state_data.get("locked_at", ""),
            "initial_files": state_data.get("initial_files", []),
            "mandate_id": state_data.get("mandate_id"),
            "frozen": state_data.get("frozen", False),
            "steps": state_data.get("steps", {}),
            "turns_count": turns_count,
            "classification_turns_count": classification_turns_count,
            "consolidation_turns_count": consolidation_turns_count,
            "phase_active": state_data.get("phase_active") if intent_type in _BSIP_ENGINE_TYPES else None,
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
            "intent_id": _uid(state_data),
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
            "intent_id": _uid(state_data),
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
        close_phase: bool = False,
        proposal: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Add a conversation turn to an intent's chat.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            actor: Who is speaking ("user" or "ai")
            content: Content of the message
            nucleus_path: Optional path to Bloom project
            close_phase: Solo aplica a 'ing'/'dis'. Su efecto depende de la
                fase activa:
                  - En fase de commit (.consolidation/ o .ratification/):
                    cierra el turno con el campo de commit de la spec en
                    `true` y dispara el "Efecto de committed: true" (ING §5
                    / DIS §5) — avanza `phase_active` vía IntentStateManager.
                  - En fase propositiva (.classification/ o .mapping/, que
                    no tienen concepto de commit): fuerza el avance
                    explícito a la fase de cierre correspondiente
                    (`IntentStateManager.advance_after_proposal()`) después
                    de escribir el turno — es el único mecanismo para salir
                    de estas fases, ya que nunca avanzan solas.
                Reemplaza al parámetro `committed` de la versión anterior
                (mismo significado en la fase de commit; extendido acá para
                cubrir también el cierre de la fase propositiva).
            proposal: Contenido de negocio del turno — para las fases
                propositivas (.classification/.mapping) es la lista de
                clusters/operaciones revisadas; para las fases de commit
                (.consolidation/.ratification) es la lista con
                human_decision final. Este método NO valida su shape de
                negocio (eso es fs_contracts.py, todavía no implementado) —
                solo lo empaqueta junto con actor/content/timestamp y decide
                la transición de fase según `close_phase`.
           
        Returns:
            Turn information
           
        Raises:
            ValueError: If intent not found, invalid actor, or la fase
                activa no acepta turnos
        """
       
        if actor not in ["user", "ai"]:
            raise ValueError(f"Invalid actor '{actor}'. Must be 'user' or 'ai'")
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        intent_type = _itype(state_data)

        if intent_type in _BSIP_ENGINE_TYPES:
            # .classification/.mapping (proponen) y .consolidation/.ratification
            # (comitean) comparten la misma gramática de turno en ambos
            # intents — un solo helper genérico delegando en
            # IntentStateManager, en vez de un _add_turn_ing/_add_turn_dis
            # paralelos y duplicados (ver ING §4/§5, DIS §4/§5).
            return self._add_turn_bsip(
                intent_path, state_data, actor, content, close_phase, proposal
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
            "intent_id": _uid(state_data),
            "intent_name": state_data.get("name", "")
        }

    def _add_turn_bsip(
        self,
        intent_path: Path,
        state_data: Dict[str, Any],
        actor: str,
        content: str,
        close_phase: bool,
        proposal: Optional[List[Dict[str, Any]]],
    ) -> Dict[str, Any]:
        """
        Turno genérico para 'ing' y 'dis' — delega el ciclo de vida
        (numeración de turno, validación de fase activa, escritura
        atómica, transición) en IntentStateManager en vez de reimplementar
        la lógica de directorios a mano, como hacía la versión anterior
        (rota: llamaba a `_add_turn_ing`, que nunca estuvo definida).

        Cubre las cuatro fases-con-turnos de ambos intents:
        classification/mapping (proponen, `commit_field=None` — nunca
        avanzan por sí solas vía `close_turn()`; `close_phase=True` fuerza
        el avance vía `advance_after_proposal()`) y consolidation/
        ratification (comitean, `close_phase=True` setea el commit_field
        de la spec y `close_turn()` avanza — ING §5 / DIS §5).
        """
        mgr = IntentStateManager.load(intent_path)

        try:
            phase_spec = mgr.current_phase_spec()
        except IntentAlreadyTerminatedError as exc:
            raise ValueError(str(exc)) from exc

        if not phase_spec.has_turns:
            raise ValueError(
                f"La fase activa ('{mgr.phase_active}') no acepta turnos — "
                "es un acto único, usar hydrate_intent()."
            )

        try:
            turn = mgr.open_turn(mgr.phase_active)
        except PhaseNotActiveError as exc:
            raise ValueError(str(exc)) from exc

        timestamp = datetime.now(timezone.utc).isoformat()
        control_payload: Dict[str, Any] = {
            "turn": str(turn.turn_number),
            "actor": actor,
            "content": content,
            "proposal": proposal if proposal is not None else [],
            "timestamp": timestamp,
        }
        # El campo de commit (p.ej. 'committed' en .consolidation.json /
        # .ratification.json) solo existe en fases que lo declaran (ING §5,
        # DIS §5) — classification/mapping no tienen concepto de commit,
        # así que no se agrega el campo (mgr.close_turn lo interpreta como
        # "fase propositiva", nunca avanza — ver docstring de close_turn).
        if phase_spec.commit_field is not None:
            control_payload[phase_spec.commit_field] = bool(close_phase)

        advanced = mgr.close_turn(turn, control_payload)

        advanced_by_proposal_close = False
        if not advanced and close_phase and phase_spec.commit_field is None:
            # Fase propositiva (classification/mapping): close_turn() jamás
            # avanza por sí sola en estas fases (ver su docstring — siempre
            # devuelve False cuando commit_field is None). `close_phase=True`
            # es acá la señal explícita de que la propuesta está lista para
            # pasar a revisión humana en la fase de cierre — sin este
            # bloque, no existe NINGÚN camino para salir de classification/
            # mapping, quedan trabadas para siempre (ver
            # advance_after_proposal() en intent_state_manager.py).
            try:
                mgr.advance_after_proposal()
            except InvalidTransitionError as exc:
                raise ValueError(str(exc)) from exc
            advanced = True
            advanced_by_proposal_close = True

        return {
            "intent_id": mgr.intent_id,
            "intent_name": state_data.get("name", ""),
            "phase": turn.phase_name,
            "turn_number": turn.turn_number,
            "turn_path": str(turn.turn_dir),
            "control_file": str(turn.control_file),
            "advanced_phase": advanced,
            "advanced_by_proposal_close": advanced_by_proposal_close,
            "phase_active": mgr.phase_active,
            "is_terminated": mgr.is_terminated,
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
       
        intent_type = _itype(state_data)
        timestamp = datetime.now(timezone.utc).isoformat()

        if intent_type in _BSIP_ENGINE_TYPES:
            # finalize_intent() para ing/dis se apoya en IntentStateManager
            # en vez de mutar el dict a mano: la precondición real de cierre
            # es phase_active == terminal ("done"), no un flag de bookkeeping
            # separado como el 'consolidation_committed' que usaba la versión
            # anterior (que, además, nunca era escrito por nadie). Esto es
            # estrictamente más correcto: no se puede finalizar un intent
            # cuyo último turno de consolidation/ratification sigue con
            # committed: false (ING §5 / DIS §5).
            return self._finalize_bsip_intent(intent_path, state_data, timestamp)

        # Verificar que no esté locked por otro
        if state_data.get("locked", False):
            raise ValueError(
                f"Cannot finalize: Intent is locked by {state_data.get('locked_by', 'unknown')}"
            )
       
        # Marcar como completado
        state_data["status"] = "completed"
        state_data["finalized_at"] = timestamp
        state_data["locked"] = False

        # Actualizar steps
        if "steps" in state_data:
            if intent_type == "dev":
                state_data["steps"]["merge"] = True
            elif intent_type == "doc":
                state_data["steps"]["publish"] = True
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        # Contar archivos modificados (simulado)
        files_modified = len(state_data.get("initial_files", []))

        return {
            "status": "completed",
            "intent_id": _uid(state_data),
            "name": state_data.get("name", ""),
            "finalized_at": timestamp,
            "files_modified": files_modified,
            "message": f"Intent '{state_data.get('name', 'unknown')}' finalized successfully"
        }

    def _finalize_bsip_intent(
        self, intent_path: Path, state_data: Dict[str, Any], timestamp: str
    ) -> Dict[str, Any]:
        """
        Bookkeeping de finalización genérico para 'ing'/'dis'.

        No escribe genes, deltas, ni `.cache/.semantic-index.json` — esa
        responsabilidad ya se ejecutó (o no) en el commit de turno de la
        fase de cierre (`.consolidation/` / `.ratification/`, vía
        `_add_turn_bsip(close_phase=True)`). Este método exige que ese
        commit ya haya avanzado el intent a su fase terminal antes de
        permitir el cierre — a diferencia de la versión anterior, que no
        validaba nada y dejaba `finalize_intent()` cerrar intents cuyo
        último turno seguía abierto.
        """
        mgr = IntentStateManager.load(intent_path)
        if not mgr.is_terminated:
            raise ValueError(
                f"No se puede finalizar: el intent sigue en fase "
                f"'{mgr.phase_active}', no llegó a su fase terminal "
                f"('{mgr.spec.terminal_phase_name}'). El último turno de "
                f"'{mgr.spec.phases[-1].name}' debe cerrar con "
                f"'{mgr.spec.phases[-1].commit_field}: true' primero."
            )

        mgr.set_metadata(status="completed", finalized_at=timestamp)

        return {
            "status": "completed",
            "intent_id": mgr.intent_id,
            "name": state_data.get("name", ""),
            "finalized_at": timestamp,
            "phase_active": mgr.phase_active,
            "is_terminated": True,
            "message": f"Intent '{state_data.get('name', 'unknown')}' finalized successfully",
        }

    @staticmethod
    def _last_turn_dir(phase_dir: Path) -> Optional[Path]:
        """Directorio `.turn_N/` de mayor N dentro de `phase_dir`, o None
        si la fase nunca abrió un turno. Determinista por número, no por
        mtime — mismo criterio que IntentStateManager.open_turn()."""
        if not phase_dir.exists():
            return None
        turn_dirs = [
            d for d in phase_dir.iterdir()
            if d.is_dir() and d.name.startswith(".turn_")
            and d.name.split("_", 1)[1].isdigit()
        ]
        if not turn_dirs:
            return None
        return max(turn_dirs, key=lambda d: int(d.name.split("_", 1)[1]))

    def freeze_to_mandate(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None,
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        Capa de Cristalización (Freeze-to-Mandate). Toma un intent 'ing'/
        'dis' ya convergido (phase_active == fase terminal, commit cerrado
        en .consolidation/ o .ratification/) y sintetiza `mandate.json`: el
        artefacto inmutable de salida del ciclo de trabajo.

        Regla de arquitectura (decisión de implementación, NO una enmienda
        a ING_Intent_Spec_v1_1.md / DIS_Intent_Spec_v1_0.md): mandate_id
        sigue siendo obligatorio como precondición de ARRANQUE de ing/dis
        (ING §0 regla 2 / DIS regla 2, sin cambios) — lo que se desacopla
        es CUÁNDO se exige un mandate.json *firmado*. Antes de este
        método, mandate_id es solo un identificador de contexto de trabajo
        (capa "Unbound"). Este método es el único punto del sistema que
        produce el mandate.json firmado — la firma pasa de precondición de
        entrada a operación de salida/exportación.

        Qué SÍ hace:
          - Exige que el intent haya llegado a su fase terminal — no se
            puede cristalizar con un commit de cierre todavía abierto.
          - Recolecta el resumen convergido (classification_summary /
            mapping_summary, domain_baseline / scope, y el contenido del
            último turno comiteado de la fase de cierre) como evidencia
            de trazabilidad.
          - Sintetiza `mandate.json` con un `content_hash` sha256
            determinista sobre el contenido — es una firma de integridad,
            no una firma criptográfica con clave privada (ese mecanismo no
            está definido en ningún documento fuente disponible; queda
            como pendiente explícito, mismo criterio que otros pendientes
            ya declarados en ambas specs, no se fabrica acá).
          - Marca el intent de origen como `frozen` (idempotente por
            default: una segunda llamada sin `force=True` falla en vez de
            re-cristalizar en silencio).

        Qué NO hace (fuera de alcance, marcado explícitamente en vez de
        inventado):
          - NO sintetiza las Actions de scaffold reales. El Roadmap
            Maestro v3 §2 (fila Fase 4) confirma que el scaffold real
            (`MandateExecutionWorkflow`) "sigue placeholder puro" — no
            existe ninguna spec de la que derivar hoy el algoritmo
            convergencia→Actions. `mandate.json` se escribe con
            `actions: []` y `scaffold_pending: true`, honesto sobre lo que
            falta en vez de simular un scaffold que no está especificado.
          - NO vuelve a escribir `.cache/.semantic-index.json` ni
            `.genes/` — eso ya ocurrió (o no) en el commit de
            `.consolidation/`/`.ratification/`. Esta capa exporta, no
            muta el grafo de Dominios.
          - NO resuelve D-20 (Roadmap §6): la carrera de escritura entre
            una corrida de `ing/` y una de `dis/` sobre el mismo
            `domain_id` sigue sin lock — freeze_to_mandate() lee el
            estado que encuentra al momento de llamarse, nada más.

        Args:
            intent_id / folder_name: localización del intent (ver
                _locate_intent).
            nucleus_path: path explícito al proyecto Bloom, si no se
                infiere del cwd.
            force: permite re-cristalizar un intent ya `frozen` (sobrescribe
                el `mandate.json` anterior con un `content_hash` nuevo).

        Returns:
            status, intent_id, mandate_id, mandate_path, content_hash,
            frozen_at, scaffold_pending, message.

        Raises:
            ValueError: intent no encontrado, tipo no soportado (dev/doc no
                cristalizan — no convergen contra ningún grafo de Dominios),
                fase activa no terminal, o ya frozen sin force=True.
        """
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
        intent_type = _itype(state_data)

        if intent_type not in _BSIP_ENGINE_TYPES:
            raise ValueError(
                f"freeze_to_mandate() solo aplica a intents 'ing'/'dis' "
                f"(convergen contra el grafo de Dominios) — recibido "
                f"'{intent_type}'. dev/doc no tienen capa de cristalización."
            )

        if state_data.get("frozen") and not force:
            raise ValueError(
                f"Intent '{_uid(state_data)}' ya fue cristalizado en "
                f"'{state_data.get('mandate_artifact_path')}' "
                f"(frozen_at={state_data.get('frozen_at')}). "
                "Usar force=True para re-cristalizar."
            )

        mgr = IntentStateManager.load(intent_path)
        if not mgr.is_terminated:
            commit_phase = mgr.spec.phases[-1]
            raise ValueError(
                f"No se puede cristalizar: el intent sigue en fase "
                f"'{mgr.phase_active}' (necesita llegar a "
                f"'{mgr.spec.terminal_phase_name}'). El último turno de "
                f"'{commit_phase.name}' debe cerrar con "
                f"'{commit_phase.commit_field}: true' primero."
            )

        snapshot = mgr.snapshot()
        mandate_id = snapshot["mandate_id"]

        # Evidencia de convergencia: contenido del último turno comiteado
        # de la fase de cierre (.consolidation/ o .ratification/).
        commit_phase_name = mgr.spec.phases[-1].name
        commit_control_filename = (
            ".consolidation.json" if commit_phase_name == "consolidation"
            else ".ratification.json" if commit_phase_name == "ratification"
            else ".turn.json"
        )
        last_turn_dir = self._last_turn_dir(intent_path / f".{commit_phase_name}")
        committed_content = None
        if last_turn_dir is not None:
            control_file = last_turn_dir / commit_control_filename
            if control_file.exists():
                try:
                    committed_content = json.loads(control_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, IOError):
                    committed_content = None

        convergence_summary = {
            "classification_summary": snapshot.get("classification_summary"),
            "mapping_summary": snapshot.get("mapping_summary"),
            "domain_baseline": snapshot.get("domain_baseline"),
            "scope": snapshot.get("scope"),
            "last_committed_turn": committed_content,
        }
        # Descartar None: campos que no aplican al tipo de intent (p.ej.
        # 'mapping_summary' en un 'ing') no deben ensuciar el mandate.json.
        convergence_summary = {k: v for k, v in convergence_summary.items() if v is not None}

        frozen_at = datetime.now(timezone.utc).isoformat()
        mandate_content = {
            "mandate_id": mandate_id,
            "source_intent": {
                "intent_id": mgr.intent_id,
                "intent_type": intent_type,
                "intent_path": str(intent_path),
                "name": snapshot.get("name"),
            },
            "convergence": convergence_summary,
            "actions": [],  # síntesis real de scaffold: pendiente, ver docstring
            "scaffold_pending": True,
            "frozen_at": frozen_at,
        }
        content_hash = hashlib.sha256(
            json.dumps(mandate_content, sort_keys=True, ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        mandate_content["content_hash"] = content_hash

        # Ruta asumida (no confirmada por bloom_project_tree.txt, que
        # explícitamente deja Nucleus-level fuera de esta sesión) — mismo
        # criterio de "candidata razonable, no inventada como definitiva"
        # que _write_dis_discovery_content(). Ajustar si bloom_nucleus_tree.txt
        # define otra convención.
        mandate_dir = project_root / ".bloom" / ".mandates" / mandate_id
        mandate_dir.mkdir(parents=True, exist_ok=True)
        mandate_path = mandate_dir / "mandate.json"
        with open(mandate_path, "w", encoding="utf-8") as f:
            json.dump(mandate_content, f, indent=2, ensure_ascii=False)

        mgr.set_metadata(
            frozen=True,
            frozen_at=frozen_at,
            mandate_artifact_path=str(mandate_path),
        )

        return {
            "status": "frozen",
            "intent_id": mgr.intent_id,
            "mandate_id": mandate_id,
            "mandate_path": str(mandate_path),
            "content_hash": content_hash,
            "frozen_at": frozen_at,
            "scaffold_pending": True,
            "message": (
                f"Intent '{mgr.intent_id}' cristalizado en {mandate_path}. "
                "scaffold_pending=true: la síntesis de Actions reales sigue "
                "siendo trabajo pendiente (Roadmap Maestro v3 §2, Fase 4)."
            ),
        }

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
        intent_uuid = _uid(state_data)
       
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
        intent_uuid = _uid(state_data)
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