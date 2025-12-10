#!/usr/bin/env python3
"""
Empaqueta Intent DEV - Fase Briefing
Genera payload.json e index.json para enviar a AI
v3.0 - Estructura unificada con .files/
"""

import json
import sys
import base64
from pathlib import Path
from datetime import datetime
from compression_metrics import CompressionCalculator


def process_files_directory(files_dir: Path, compressor: CompressionCalculator, phase_name: str):
    """
    Procesa todos los archivos en .files/ y retorna payload + metadata
    
    Args:
        files_dir: Path a la carpeta .files/
        compressor: CompressionCalculator instance
        phase_name: Nombre de la fase para labels (ej: "briefing")
    
    Returns:
        (files_payload, files_metadata)
    """
    files_payload = {}
    files_metadata = []
    
    if not files_dir.exists() or not files_dir.is_dir():
        return files_payload, files_metadata
    
    # Extensiones de texto que se comprimen con gzip
    TEXT_EXTENSIONS = {
        '.txt', '.md', '.bl', '.js', '.jsx', '.ts', '.tsx', 
        '.py', '.php', '.java', '.c', '.cpp', '.h', '.hpp',
        '.css', '.scss', '.sass', '.less', '.html', '.htm',
        '.json', '.xml', '.yml', '.yaml', '.toml', '.ini',
        '.sql', '.sh', '.bash', '.zsh', '.env', '.conf',
        '.log', '.csv', '.tsv', '.rst', '.tex'
    }
    
    for filepath in sorted(files_dir.rglob("*")):
        if not filepath.is_file():
            continue
        
        relative_path = str(filepath.relative_to(files_dir))
        file_extension = filepath.suffix.lower()
        
        # Determinar si es texto o binario
        is_text = file_extension in TEXT_EXTENSIONS
        
        if is_text:
            # Archivo de texto: comprimir con gzip
            try:
                compressed_str, orig_size, comp_size = compressor.read_and_compress(
                    filepath, 
                    label=f"{phase_name}.files.{relative_path}"
                )
                files_payload[relative_path] = {
                    "type": "text",
                    "encoding": "gzip",
                    "content": compressed_str
                }
                
                files_metadata.append({
                    "path": relative_path,
                    "type": "text",
                    "original_size": orig_size,
                    "compressed_size": comp_size,
                    "compression_ratio": round(comp_size / orig_size, 4) if orig_size > 0 else 0
                })
                
            except Exception as e:
                print(f"   ⚠️  Error procesando {relative_path}: {e}")
                continue
        else:
            # Archivo binario: base64 sin gzip adicional
            try:
                content = filepath.read_bytes()
                encoded = base64.b64encode(content).decode('utf-8')
                
                files_payload[relative_path] = {
                    "type": "binary",
                    "encoding": "base64",
                    "content": encoded,
                    "extension": file_extension
                }
                
                files_metadata.append({
                    "path": relative_path,
                    "type": "binary",
                    "size": len(content),
                    "extension": file_extension
                })
                
            except Exception as e:
                print(f"   ⚠️  Error procesando {relative_path}: {e}")
                continue
    
    return files_payload, files_metadata


def pack_briefing(intent_name: str, project_dir: str = "."):
    """Empaqueta intent DEV briefing con estructura unificada"""
    project_path = Path(project_dir).resolve()
    bloom_path = project_path / ".bloom"
    intent_path = bloom_path / ".intents" / ".dev" / intent_name
    briefing_source_path = intent_path / ".briefing"
    
    # Validar estructura básica
    if not intent_path.exists():
        print(f"❌ Intent no existe: {intent_name}")
        sys.exit(1)
    
    # Verificar archivos requeridos
    briefing_intent = briefing_source_path / ".intent.bl"
    files_dir = briefing_source_path / ".files"
    
    if not briefing_intent.exists():
        print(f"❌ Falta: {briefing_intent}")
        sys.exit(1)
    
    if not files_dir.exists():
        print(f"❌ Falta: {files_dir}/")
        print(f"   Debe crear la carpeta .files/ con al menos .codebase.bl")
        sys.exit(1)
    
    codebase_file = files_dir / ".codebase.bl"
    if not codebase_file.exists():
        print(f"❌ Falta: {codebase_file}")
        print(f"   .codebase.bl es obligatorio en .files/")
        sys.exit(1)
    
    print(f"📦 Empaquetando briefing para: {intent_name}\n")
    
    # Inicializar calculadora de compresión
    compressor = CompressionCalculator()
    
    # Crear estructura de salida
    pipeline_path = intent_path / ".pipeline"
    output_path = pipeline_path / ".briefing"
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"📁 Estructura de salida: {output_path.relative_to(project_path)}\n")
    
    # ===== CARGAR Y COMPRIMIR BASE FIJA =====
    print("🔄 Comprimiendo archivos base...")
    
    base_files = {
        "dev_instructions": bloom_path / ".core" / ".dev.instructions.bl",
        "dev_rules": bloom_path / ".core" / ".dev.rules.bl",
        "dev_strategy_standards": bloom_path / ".project" / ".dev.strategy.standards.bl",
        "dev_strategy_context": bloom_path / ".project" / ".dev.strategy.context.bl",
        "doc_app_architecture": bloom_path / ".project" / ".doc.app.architecture.bl",
        "doc_app_workflow": bloom_path / ".project" / ".doc.app.workflow.bl",
        "doc_app_implementation": bloom_path / ".project" / ".doc.app.implementation.bl",
        "tree": bloom_path / ".project" / ".tree.bl"
    }
    
    base = {}
    for key, filepath in base_files.items():
        compressed_str, _, _ = compressor.read_and_compress(filepath, label=f"base.{key}")
        base[key] = compressed_str
        print(f"   ✓ {key}")
    
    # ===== CARGAR Y COMPRIMIR INTENT =====
    print("\n🔄 Comprimiendo intent...")
    intent_bl, _, _ = compressor.read_and_compress(briefing_intent, label="briefing.intent_bl")
    print(f"   ✓ .intent.bl")
    
    # ===== PROCESAR CARPETA .files/ =====
    print("\n🔄 Procesando archivos en .files/...")
    files_payload, files_metadata = process_files_directory(files_dir, compressor, "briefing")
    
    if not files_payload:
        print(f"   ⚠️  No se encontraron archivos válidos en .files/")
        sys.exit(1)
    
    # Imprimir resumen de archivos procesados
    for fm in files_metadata:
        if fm["type"] == "text":
            ratio = fm["compression_ratio"]
            print(f"   ✓ {fm['path']} (text, {compressor.format_bytes(fm['original_size'])} → {compressor.format_bytes(fm['compressed_size'])}, {ratio:.1%})")
        else:
            print(f"   ✓ {fm['path']} (binary, {compressor.format_bytes(fm['size'])})")
    
    # ===== CONSTRUIR PAYLOAD.JSON =====
    timestamp = datetime.now().isoformat()
    
    payload_json = {
        "type": "dev",
        "phase": "briefing",
        "intent_name": intent_name,
        "generated_at": timestamp,
        "base": base,
        "payload": {
            "intent_bl": intent_bl,
            "files": files_payload
        }
    }
    
    # ===== CONSTRUIR INDEX.JSON =====
    index_json = {
        "intent_name": intent_name,
        "type": "dev",
        "phase": "briefing",
        "generated_at": timestamp,
        "workflow": {
            "current_turn": 1,
            "expects_from_ai": "5_clarifying_questions",
            "response_format": "list[5]"
        },
        "reading_order": [
            "base.dev_instructions",
            "base.dev_rules",
            "base.dev_strategy_standards",
            "base.dev_strategy_context",
            "payload.intent_bl",
            "payload.files",
            "base.tree"
        ],
        "instructions": """
Lee los archivos en el orden especificado.

El payload contiene:
- intent_bl: Descripción del intent/tarea a realizar
- files: Archivos del proyecto (incluye .codebase.bl con el código y otros archivos de contexto)

Analiza el intent y los archivos proporcionados.
Genera exactamente 5 preguntas clarificadoras para entender mejor:
- Requisitos específicos
- Restricciones técnicas
- Casos edge
- Preferencias de implementación
- Dependencias o impactos

Formato de respuesta:
1. [Pregunta sobre X]
2. [Pregunta sobre Y]
3. [Pregunta sobre Z]
4. [Pregunta sobre W]
5. [Pregunta sobre Q]
        """.strip()
    }
    
    # ===== GUARDAR ARCHIVOS =====
    payload_output = output_path / ".payload.json"
    index_output = output_path / ".index.json"
    
    payload_output.write_text(json.dumps(payload_json, indent=2, ensure_ascii=False), encoding='utf-8')
    index_output.write_text(json.dumps(index_json, indent=2, ensure_ascii=False), encoding='utf-8')
    
    print(f"\n✅ {payload_output.relative_to(project_path)}")
    print(f"✅ {index_output.relative_to(project_path)}")
    
    # ===== OBTENER MÉTRICAS DE COMPRESIÓN =====
    metrics = compressor.get_metrics()
    
    # ===== ACTUALIZAR SESSION STATE =====
    print("\n🔄 Actualizando session_state.json...")
    
    session_state_path = intent_path / ".session_state.json"
    
    # Cargar session state existente o crear nuevo
    if session_state_path.exists():
        session_state = json.loads(session_state_path.read_text(encoding='utf-8'))
    else:
        session_state = {
            "intent_name": intent_name,
            "current_phase": "briefing",
            "current_turn": 1,
            "last_updated": timestamp
        }
    
    # Agregar información de pipeline
    if "pipeline" not in session_state:
        session_state["pipeline"] = {}
    
    session_state["pipeline"]["briefing"] = {
        "status": "packed",
        "timestamp": timestamp,
        "output_path": str(output_path.relative_to(intent_path)),
        "files_generated": [
            ".payload.json",
            ".index.json"
        ],
        "source_files": [
            str(briefing_intent.relative_to(intent_path))
        ] + [f".briefing/.files/{fm['path']}" for fm in files_metadata],
        "files_in_payload": len(files_metadata),
        "files_metadata": files_metadata,
        "compression": {
            "total_files_processed": metrics.file_count,
            "total_original_bytes": metrics.total_original_bytes,
            "total_compressed_bytes": metrics.total_compressed_bytes,
            "compression_ratio": metrics.compression_ratio,
            "space_saved_bytes": metrics.space_saved_bytes,
            "space_saved_percent": metrics.space_saved_percent
        }
    }
    
    # Actualizar campos de control
    session_state["last_updated"] = timestamp
    session_state["current_phase"] = "briefing"
    
    session_state_path.write_text(json.dumps(session_state, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"✅ {session_state_path.relative_to(project_path)}")
    
    # ===== IMPRIMIR RESUMEN =====
    compressor.print_summary()
    
    print(f"\n📋 Archivos listos para subir a AI:")
    print(f"   1. {index_output.name}")
    print(f"   2. {payload_output.name}")
    print(f"\n✨ Empaquetado completado exitosamente")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("""
╔═══════════════════════════════════════════════════════════════════════════╗
║               EMPAQUETADOR DE INTENT DEV - FASE BRIEFING v3.0             ║
╚═══════════════════════════════════════════════════════════════════════════╝

Uso: python pack_intent_dev_briefing.py <intent-name> [project-dir]

Argumentos:
  <intent-name>   Nombre del intent (ej: ui-refactory-uuid)
  [project-dir]   Ruta a la raíz del proyecto (donde está .bloom/)
                  Por defecto: directorio actual

Ejemplos:
  # Desde la raíz del proyecto:
  python pack_intent_dev_briefing.py ui-refactory-uuid
  
  # Desde otro directorio:
  python pack_intent_dev_briefing.py ui-refactory-uuid /home/user/mi-proyecto

Prerequisitos:
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.briefing/.intent.bl
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.briefing/.files/
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.briefing/.files/.codebase.bl

Genera:
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.briefing/.payload.json
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.briefing/.index.json
  → Actualiza .session_state.json con métricas de compresión

Novedades v3.0:
  • Estructura unificada: Todo va en .files/ (incluido .codebase.bl)
  • Soporte automático para cualquier tipo de archivo
  • Archivos de texto (.bl, .md, .js, etc.): comprimidos con gzip
  • Archivos binarios (.png, .pdf, .doc): codificados en base64
  • Métricas detalladas por cada archivo
  • Renombrado: .intent.json → .payload.json

Estructura esperada:
  .briefing/
  ├── .intent.bl
  └── .files/
      ├── .codebase.bl        (obligatorio)
      ├── design.png          (opcional)
      └── requirements.pdf    (opcional)
        """)
        sys.exit(1)
    
    intent_name = sys.argv[1]
    project_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    
    try:
        pack_briefing(intent_name, project_dir)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)