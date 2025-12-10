#!/usr/bin/env python3
"""
Empaqueta Intent DEV - Fase Execution
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
        phase_name: Nombre de la fase para labels (ej: "execution")
    
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


def pack_execution(intent_name: str, project_dir: str = "."):
    """Empaqueta intent DEV execution con estructura unificada"""
    project_path = Path(project_dir).resolve()
    bloom_path = project_path / ".bloom"
    intent_path = bloom_path / ".intents" / ".dev" / intent_name
    execution_source_path = intent_path / ".execution"
    
    # Validar estructura básica
    if not intent_path.exists():
        print(f"❌ Intent no existe: {intent_name}")
        sys.exit(1)
    
    # Verificar que briefing se haya ejecutado
    session_state_path = intent_path / ".session_state.json"
    if not session_state_path.exists():
        print(f"❌ Falta session_state.json")
        print(f"   Debe ejecutar primero: pack_intent_dev_briefing.py {intent_name}")
        sys.exit(1)
    
    session_state = json.loads(session_state_path.read_text(encoding='utf-8'))
    if "pipeline" not in session_state or "briefing" not in session_state.get("pipeline", {}):
        print(f"❌ Briefing no completado")
        print(f"   Debe ejecutar primero: pack_intent_dev_briefing.py {intent_name}")
        sys.exit(1)
    
    # Verificar archivos requeridos de execution
    answers_file = execution_source_path / ".answers.json"
    files_dir = execution_source_path / ".files"
    
    if not answers_file.exists():
        print(f"❌ Falta: {answers_file}")
        print(f"   Debe crear primero las respuestas a las preguntas de briefing")
        sys.exit(1)
    
    print(f"📦 Empaquetando execution para: {intent_name}\n")
    
    # Inicializar calculadora de compresión
    compressor = CompressionCalculator()
    
    # Crear estructura de salida
    pipeline_path = intent_path / ".pipeline"
    output_path = pipeline_path / ".execution"
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"📁 Estructura de salida: {output_path.relative_to(project_path)}\n")
    
    # ===== CARGAR ANSWERS =====
    print("🔄 Procesando respuestas...")
    
    answers = json.loads(answers_file.read_text(encoding='utf-8'))
    answers_str = json.dumps(answers, ensure_ascii=False)
    answers_size = len(answers_str.encode('utf-8'))
    print(f"   ✓ .answers.json ({compressor.format_bytes(answers_size)})")
    
    # ===== PROCESAR CARPETA .files/ (SI EXISTE) =====
    files_payload = {}
    files_metadata = []
    
    if files_dir.exists():
        print("\n🔄 Procesando archivos en .files/...")
        files_payload, files_metadata = process_files_directory(files_dir, compressor, "execution")
        
        if files_payload:
            # Imprimir resumen de archivos procesados
            for fm in files_metadata:
                if fm["type"] == "text":
                    ratio = fm["compression_ratio"]
                    print(f"   ✓ {fm['path']} (text, {compressor.format_bytes(fm['original_size'])} → {compressor.format_bytes(fm['compressed_size'])}, {ratio:.1%})")
                else:
                    print(f"   ✓ {fm['path']} (binary, {compressor.format_bytes(fm['size'])})")
        else:
            print(f"   📝 Carpeta .files/ vacía")
    else:
        print("\n📝 Sin archivos adjuntos (.files/ no existe)")
    
    # ===== CONSTRUIR PAYLOAD.JSON =====
    timestamp = datetime.now().isoformat()
    
    payload_json = {
        "type": "dev",
        "phase": "execution",
        "intent_name": intent_name,
        "generated_at": timestamp,
        "payload": {
            "answers": answers,
            "files": files_payload if files_payload else None
        }
    }
    
    # ===== CONSTRUIR INDEX.JSON =====
    index_json = {
        "intent_name": intent_name,
        "type": "dev",
        "phase": "execution",
        "generated_at": timestamp,
        "workflow": {
            "current_turn": 2,
            "previous_phase": "briefing",
            "expects_from_ai": "code_implementation",
            "response_format": "files_with_code"
        },
        "payload_structure": {
            "answers": "JSON object with user responses to 5 questions",
            "files": "Optional: attached files for context (.codebase.bl, designs, docs, etc.)"
        },
        "instructions": """
Este payload contiene SOLO la información nueva de la fase EXECUTION:
- payload.answers: Respuestas del usuario a las 5 preguntas del briefing
- payload.files: Archivos opcionales para contexto adicional
  - .codebase.bl: Código actualizado para esta fase (si cambió)
  - Otros archivos: Diseños, especificaciones, referencias, etc.

IMPORTANTE: Debes combinar esta información con el contexto del briefing anterior.
El briefing ya fue enviado en el turn 1 y contiene:
- El intent original
- El codebase inicial
- Toda la base de conocimiento del proyecto

Genera el código solicitado basándote en:
1. El intent original (ya enviado en briefing)
2. Las respuestas del usuario (payload.answers)
3. Los archivos adjuntos si existen (payload.files)
4. Los estándares y reglas (ya enviados en briefing)

Formato de respuesta esperado:

ARCHIVO: path/to/file.ext
gz:H4sI...

ARCHIVO: path/to/other.ext
gz:H4sI...
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
    
    # Calcular tamaño total del payload (incluyendo answers sin comprimir)
    total_original = metrics.total_original_bytes + answers_size
    total_compressed = metrics.total_compressed_bytes + answers_size
    
    compression_ratio = total_compressed / total_original if total_original > 0 else 0
    space_saved = total_original - total_compressed
    space_saved_percent = (space_saved / total_original * 100) if total_original > 0 else 0
    
    # ===== ACTUALIZAR SESSION STATE =====
    print("\n🔄 Actualizando session_state.json...")
    
    # Agregar información de execution
    session_state["pipeline"]["execution"] = {
        "status": "packed",
        "timestamp": timestamp,
        "output_path": str(output_path.relative_to(intent_path)),
        "files_generated": [
            ".payload.json",
            ".index.json"
        ],
        "source_files": [
            str(answers_file.relative_to(intent_path))
        ] + [f".execution/.files/{fm['path']}" for fm in files_metadata],
        "files_in_payload": len(files_metadata),
        "files_metadata": files_metadata if files_metadata else [],
        "compression": {
            "total_files_processed": metrics.file_count,
            "total_original_bytes": total_original,
            "total_compressed_bytes": total_compressed,
            "compression_ratio": round(compression_ratio, 4),
            "space_saved_bytes": space_saved,
            "space_saved_percent": round(space_saved_percent, 2),
            "answers_size_bytes": answers_size,
            "note": "answers.json no se comprime (ya es JSON estructurado)"
        }
    }
    
    # Actualizar campos de control
    session_state["last_updated"] = timestamp
    session_state["current_phase"] = "execution"
    session_state["current_turn"] = 2
    
    session_state_path.write_text(json.dumps(session_state, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"✅ {session_state_path.relative_to(project_path)}")
    
    # ===== IMPRIMIR RESUMEN =====
    print("\n📊 Resumen de Payload:")
    print(f"   Respuestas (answers): {compressor.format_bytes(answers_size)}")
    
    if files_metadata:
        print(f"   Archivos adjuntos:    {len(files_metadata)}")
        
        # Separar por tipo para mejor visualización
        text_files = [f for f in files_metadata if f["type"] == "text"]
        binary_files = [f for f in files_metadata if f["type"] == "binary"]
        
        if text_files:
            print(f"\n   📄 Archivos de texto comprimidos:")
            for fm in text_files:
                print(f"      • {fm['path']}: {compressor.format_bytes(fm['original_size'])} → {compressor.format_bytes(fm['compressed_size'])} ({fm['compression_ratio']:.1%})")
        
        if binary_files:
            print(f"\n   🖼️  Archivos binarios (base64):")
            for fm in binary_files:
                print(f"      • {fm['path']}: {compressor.format_bytes(fm['size'])}")
    
    if metrics.file_count > 0:
        print(f"\n📊 Compresión total:")
        print(f"   Tamaño original:      {compressor.format_bytes(total_original)}")
        print(f"   Tamaño comprimido:    {compressor.format_bytes(total_compressed)}")
        print(f"   Ratio de compresión:  {compression_ratio:.2%}")
        print(f"   Espacio ahorrado:     {compressor.format_bytes(space_saved)} ({space_saved_percent:.1f}%)")
    
    print(f"\n📋 Archivos listos para subir a AI:")
    print(f"   1. {index_output.name}")
    print(f"   2. {payload_output.name}")
    print(f"\n💡 Nota: Este payload es INCREMENTAL - solo contiene la info nueva de execution")
    print(f"   El AI debe combinar esto con el contexto del briefing (turn 1)")
    print(f"\n✨ Empaquetado completado exitosamente")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("""
╔═══════════════════════════════════════════════════════════════════════════╗
║              EMPAQUETADOR DE INTENT DEV - FASE EXECUTION v3.0             ║
╚═══════════════════════════════════════════════════════════════════════════╝

Uso: python pack_intent_dev_execution.py <intent-name> [project-dir]

Argumentos:
  <intent-name>   Nombre del intent (ej: ui-refactory-uuid)
  [project-dir]   Ruta a la raíz del proyecto (donde está .bloom/)
                  Por defecto: directorio actual

Ejemplos:
  # Desde la raíz del proyecto:
  python pack_intent_dev_execution.py ui-refactory-uuid
  
  # Desde otro directorio:
  python pack_intent_dev_execution.py ui-refactory-uuid /home/user/mi-proyecto

Prerequisitos:
  ✓ Debe haber ejecutado: pack_intent_dev_briefing.py <intent-name>
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.execution/.answers.json
  ✓ Opcional: .bloom/.intents/.dev/<intent-name>/.execution/.files/

Genera:
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.execution/.payload.json
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.execution/.index.json
  → Actualiza .session_state.json

Novedades v3.0:
  • Estructura unificada: Todo va en .files/ (incluido .codebase.bl si aplica)
  • Payload INCREMENTAL: solo answers + archivos adjuntos opcionales
  • Soporte automático para cualquier tipo de archivo
  • Archivos de texto: comprimidos con gzip
  • Archivos binarios: codificados en base64
  • Métricas detalladas por cada archivo

Estructura esperada:
  .execution/
  ├── .answers.json           (obligatorio)
  └── .files/                 (opcional)
      ├── .codebase.bl        (si el código cambió desde briefing)
      ├── design.png          (diseños UI)
      └── requirements.pdf    (especificaciones adicionales)

El payload contiene:
  {
    "payload": {
      "answers": { ... },     // Respuestas a las 5 preguntas
      "files": { ... }        // Archivos opcionales de .files/
    }
  }
        """)
        sys.exit(1)
    
    intent_name = sys.argv[1]
    project_dir = sys.argv[2] if len(sys.argv) > 2 else "."
    
    try:
        pack_execution(intent_name, project_dir)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)