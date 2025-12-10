#!/usr/bin/env python3
"""
Empaqueta Intent DEV - Fase Refinement
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
        phase_name: Nombre de la fase para labels (ej: "refinement.turn_1")
    
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


def pack_refinement(intent_name: str, turn: int, project_dir: str = "."):
    """Empaqueta intent DEV refinement con estructura unificada"""
    project_path = Path(project_dir).resolve()
    bloom_path = project_path / ".bloom"
    intent_path = bloom_path / ".intents" / ".dev" / intent_name
    refinement_path = intent_path / ".refinement"
    turn_source_path = refinement_path / f".turn_{turn}"
    
    # Validar estructura básica
    if not intent_path.exists():
        print(f"❌ Intent no existe: {intent_name}")
        sys.exit(1)
    
    # Verificar que las fases previas se hayan ejecutado
    session_state_path = intent_path / ".session_state.json"
    if not session_state_path.exists():
        print(f"❌ Falta session_state.json")
        print(f"   Debe ejecutar primero briefing y execution")
        sys.exit(1)
    
    session_state = json.loads(session_state_path.read_text(encoding='utf-8'))
    
    # Verificar que briefing y execution estén completos
    if "pipeline" not in session_state:
        print(f"❌ Pipeline no inicializado")
        print(f"   Debe ejecutar briefing y execution primero")
        sys.exit(1)
    
    if "briefing" not in session_state["pipeline"]:
        print(f"❌ Briefing no completado")
        print(f"   Debe ejecutar: pack_intent_dev_briefing.py {intent_name}")
        sys.exit(1)
    
    if "execution" not in session_state["pipeline"]:
        print(f"❌ Execution no completado")
        print(f"   Debe ejecutar: pack_intent_dev_execution.py {intent_name}")
        sys.exit(1)
    
    # Verificar archivos requeridos del turn
    turn_file = turn_source_path / ".turn.json"
    files_dir = turn_source_path / ".files"
    
    if not turn_source_path.exists():
        print(f"❌ No existe: {turn_source_path}")
        print(f"   Debe crear la carpeta .turn_{turn}/")
        sys.exit(1)
    
    if not turn_file.exists():
        print(f"❌ Falta: {turn_file}")
        print(f"   Debe crear el feedback/request del usuario en .turn.json")
        sys.exit(1)
    
    print(f"📦 Empaquetando refinement turn {turn} para: {intent_name}\n")
    
    # Inicializar calculadora de compresión
    compressor = CompressionCalculator()
    
    # Crear estructura de salida
    pipeline_path = intent_path / ".pipeline"
    output_path = pipeline_path / ".refinement" / f".turn_{turn}"
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"📁 Estructura de salida: {output_path.relative_to(project_path)}\n")
    
    # ===== CARGAR TURN REQUEST =====
    print("🔄 Procesando feedback/request...")
    
    turn_data = json.loads(turn_file.read_text(encoding='utf-8'))
    turn_str = json.dumps(turn_data, ensure_ascii=False)
    turn_size = len(turn_str.encode('utf-8'))
    print(f"   ✓ .turn.json ({compressor.format_bytes(turn_size)})")
    
    # ===== PROCESAR CARPETA .files/ (SI EXISTE) =====
    files_payload = {}
    files_metadata = []
    
    if files_dir.exists():
        print("\n🔄 Procesando archivos en .files/...")
        files_payload, files_metadata = process_files_directory(
            files_dir, 
            compressor, 
            f"refinement.turn_{turn}"
        )
        
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
        "phase": "refinement",
        "intent_name": intent_name,
        "turn": turn,
        "generated_at": timestamp,
        "payload": {
            "turn_request": turn_data,
            "files": files_payload if files_payload else None
        }
    }
    
    # ===== CONSTRUIR INDEX.JSON =====
    # El turn counter global: briefing=1, execution=2, refinement=3+
    global_turn = turn + 2
    
    index_json = {
        "intent_name": intent_name,
        "type": "dev",
        "phase": "refinement",
        "turn": turn,
        "generated_at": timestamp,
        "workflow": {
            "current_turn": global_turn,
            "refinement_iteration": turn,
            "previous_phase": "execution" if turn == 1 else "refinement",
            "expects_from_ai": "adjusted_code",
            "response_format": "files_with_code"
        },
        "payload_structure": {
            "turn_request": "JSON object with user feedback/changes requested",
            "files": "Optional: updated files (.codebase.bl, diagrams, specs, etc.)"
        },
        "instructions": f"""
Este payload contiene SOLO la información nueva del REFINEMENT turn {turn}:
- payload.turn_request: Feedback/cambios solicitados por el usuario
- payload.files: Archivos opcionales actualizados
  - .codebase.bl: Código actualizado si cambió desde execution
  - Otros archivos: Diagramas, especificaciones adicionales, etc.

IMPORTANTE: Debes combinar esta información con el contexto completo anterior.
Ya has recibido en turns previos:
- Turn 1 (briefing): Intent original + codebase inicial + base de conocimiento
- Turn 2 (execution): Respuestas a las 5 preguntas + archivos adjuntos
- Turns 3+ (refinement previos): Feedback anterior si aplica

Ajusta el código basándote en:
1. Todo el contexto acumulado de turns anteriores
2. El feedback específico de este turn (payload.turn_request)
3. Los archivos actualizados si existen (payload.files)
4. Los estándares y reglas del proyecto (ya enviados en briefing)

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
    
    # Calcular tamaño total del payload (incluyendo turn_request sin comprimir)
    total_original = metrics.total_original_bytes + turn_size
    total_compressed = metrics.total_compressed_bytes + turn_size
    
    compression_ratio = total_compressed / total_original if total_original > 0 else 0
    space_saved = total_original - total_compressed
    space_saved_percent = (space_saved / total_original * 100) if total_original > 0 else 0
    
    # ===== ACTUALIZAR SESSION STATE =====
    print("\n🔄 Actualizando session_state.json...")
    
    # Inicializar estructura de refinement si no existe
    if "refinement" not in session_state["pipeline"]:
        session_state["pipeline"]["refinement"] = {
            "turns": {}
        }
    
    # Agregar información de este turn
    session_state["pipeline"]["refinement"]["turns"][f"turn_{turn}"] = {
        "status": "packed",
        "timestamp": timestamp,
        "output_path": str(output_path.relative_to(intent_path)),
        "files_generated": [
            ".payload.json",
            ".index.json"
        ],
        "source_files": [
            str(turn_file.relative_to(intent_path))
        ] + [f".refinement/.turn_{turn}/.files/{fm['path']}" for fm in files_metadata],
        "files_in_payload": len(files_metadata),
        "files_metadata": files_metadata if files_metadata else [],
        "compression": {
            "total_files_processed": metrics.file_count,
            "total_original_bytes": total_original,
            "total_compressed_bytes": total_compressed,
            "compression_ratio": round(compression_ratio, 4),
            "space_saved_bytes": space_saved,
            "space_saved_percent": round(space_saved_percent, 2),
            "turn_request_size_bytes": turn_size,
            "note": ".turn.json no se comprime (ya es JSON estructurado)"
        }
    }
    
    # Actualizar campos de control
    session_state["last_updated"] = timestamp
    session_state["current_phase"] = "refinement"
    session_state["current_turn"] = global_turn
    session_state["refinement_iteration"] = turn
    
    session_state_path.write_text(json.dumps(session_state, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"✅ {session_state_path.relative_to(project_path)}")
    
    # ===== IMPRIMIR RESUMEN =====
    print(f"\n📊 Resumen de Payload (Turn {turn}):")
    print(f"   Feedback/request:     {compressor.format_bytes(turn_size)}")
    
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
    print(f"\n💡 Nota: Este payload es INCREMENTAL - solo contiene la info nueva del turn {turn}")
    print(f"   El AI debe combinar esto con todo el contexto anterior (turns 1-{global_turn-1})")
    print(f"\n✨ Empaquetado completado exitosamente")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("""
╔═══════════════════════════════════════════════════════════════════════════╗
║             EMPAQUETADOR DE INTENT DEV - FASE REFINEMENT v3.0             ║
╚═══════════════════════════════════════════════════════════════════════════╝

Uso: python pack_intent_dev_refinement.py <intent-name> <turn> [project-dir]

Argumentos:
  <intent-name>   Nombre del intent (ej: ui-refactory-uuid)
  <turn>          Número de iteración de refinement (1, 2, 3, ...)
  [project-dir]   Ruta a la raíz del proyecto (donde está .bloom/)
                  Por defecto: directorio actual

Ejemplos:
  # Primera iteración de refinement (turn 1):
  python pack_intent_dev_refinement.py ui-refactory-uuid 1
  
  # Segunda iteración de refinement (turn 2):
  python pack_intent_dev_refinement.py ui-refactory-uuid 2
  
  # Desde otro directorio:
  python pack_intent_dev_refinement.py ui-refactory-uuid 1 /home/user/mi-proyecto

Prerequisitos:
  ✓ Debe haber ejecutado: pack_intent_dev_briefing.py <intent-name>
  ✓ Debe haber ejecutado: pack_intent_dev_execution.py <intent-name>
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.refinement/.turn_X/
  ✓ Debe existir: .bloom/.intents/.dev/<intent-name>/.refinement/.turn_X/.turn.json
  ✓ Opcional: .bloom/.intents/.dev/<intent-name>/.refinement/.turn_X/.files/

Genera:
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.refinement/.turn_X/.payload.json
  → .bloom/.intents/.dev/<intent-name>/.pipeline/.refinement/.turn_X/.index.json
  → Actualiza .session_state.json

Novedades v3.0:
  • Estructura unificada: Todo va en .files/ (igual que briefing/execution)
  • Payload INCREMENTAL: solo feedback/request + archivos adjuntos opcionales
  • Soporte para múltiples iteraciones (turn 1, 2, 3, ...)
  • Archivos de texto: comprimidos con gzip
  • Archivos binarios: codificados en base64
  • Tracking completo de todas las iteraciones en session_state

Estructura esperada:
  .refinement/
  └── .turn_X/
      ├── .turn.json          (feedback del usuario - obligatorio)
      └── .files/             (opcional)
          ├── .codebase.bl    (código actualizado si cambió)
          ├── diagram.png     (diagramas adicionales)
          └── notes.md        (notas del usuario)

El payload contiene:
  {
    "payload": {
      "turn_request": { ... },    // Feedback/cambios del usuario
      "files": { ... }            // Archivos opcionales de .files/
    }
  }

Contador de turns:
  - Turn 1: Briefing
  - Turn 2: Execution
  - Turn 3+: Refinement (turn 1, 2, 3, ...)
        """)
        sys.exit(1)
    
    intent_name = sys.argv[1]
    
    try:
        turn = int(sys.argv[2])
        if turn < 1:
            raise ValueError("Turn debe ser >= 1")
    except ValueError as e:
        print(f"\n❌ Error: Turn debe ser un número entero >= 1")
        print(f"   Recibido: '{sys.argv[2]}'")
        sys.exit(1)
    
    project_dir = sys.argv[3] if len(sys.argv) > 3 else "."
    
    try:
        pack_refinement(intent_name, turn, project_dir)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)