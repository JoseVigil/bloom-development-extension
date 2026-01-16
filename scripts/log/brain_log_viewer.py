"""
Brain Log Viewer - Flask Standalone
Visualizador de logs para Brain y Host con soporte multi-formato
"""

from flask import Flask, jsonify, request, send_file
from pathlib import Path
from datetime import datetime
import re
import io
import os

app = Flask(__name__)

# Ruta de logs usando variable de entorno
LOGS_DIR = Path(os.environ.get('LOCALAPPDATA', os.path.expanduser('~/.local/share'))) / 'BloomNucleus' / 'logs'

# Patrones de parseo
BRAIN_PATTERN = re.compile(
    r'^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*\|\s*'
    r'(?P<level>\w+)\s*\|\s*'
    r'(?P<module>[\w\.]+)\s*\|\s*'
    r'(?P<function>\w+)\s*\|\s*'
    r'(?P<message>.+)$'
)

HOST_PATTERN = re.compile(
    r'^\[(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]\s*'
    r'\[(?P<level>\w+)\]\s*'
    r'(?P<message>.+)$'
)


def parse_brain_log(line):
    """Parse formato brain_*.log"""
    match = BRAIN_PATTERN.match(line)
    if match:
        return {
            'timestamp': match.group('timestamp'),
            'level': match.group('level'),
            'module': match.group('module'),
            'function': match.group('function'),
            'message': match.group('message'),
            'source': 'brain'
        }
    return None


def parse_host_log(line):
    """Parse formato host_*.log"""
    match = HOST_PATTERN.match(line)
    if match:
        return {
            'timestamp': match.group('timestamp'),
            'level': match.group('level'),
            'module': 'host',
            'function': '-',
            'message': match.group('message'),
            'source': 'host'
        }
    return None


def get_log_files():
    """Obtiene todos los archivos de log disponibles"""
    print(f"[DEBUG] Buscando logs en: {LOGS_DIR}")
    
    if not LOGS_DIR.exists():
        print(f"[ERROR] Directory no existe: {LOGS_DIR}")
        return []
    
    files = []
    for file in LOGS_DIR.glob("*.log"):
        if file.name.startswith(('brain_', 'host_')):
            file_info = {
                'name': file.name,
                'path': str(file),
                'size': file.stat().st_size,
                'modified': datetime.fromtimestamp(file.stat().st_mtime).isoformat(),
                'type': 'brain' if file.name.startswith('brain_') else 'host'
            }
            files.append(file_info)
            print(f"[DEBUG] Encontrado: {file.name} ({file_info['size']} bytes)")
    
    print(f"[DEBUG] Total archivos encontrados: {len(files)}")
    return sorted(files, key=lambda x: x['modified'], reverse=True)


def read_and_parse_logs(filenames=None, levels=None, modules=None, search=None):
    """Lee y parsea los logs con filtros"""
    print(f"[DEBUG] read_and_parse_logs called")
    
    logs = []
    
    # Determinar qué archivos leer
    if not filenames:
        files = [f['name'] for f in get_log_files()]
    else:
        files = filenames
    
    print(f"[DEBUG] Archivos a procesar: {files}")
    
    for filename in files:
        filepath = LOGS_DIR / filename
        if not filepath.exists():
            print(f"[WARNING] Archivo no existe: {filepath}")
            continue
        
        print(f"[DEBUG] Procesando: {filename}")
        
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                parsed_count = 0
                
                for line_num, line in enumerate(f, 1):
                    line = line.strip()
                    if not line:
                        continue
                    
                    # Intentar parsear según el tipo
                    log_entry = None
                    if filename.startswith('brain_'):
                        log_entry = parse_brain_log(line)
                    elif filename.startswith('host_'):
                        log_entry = parse_host_log(line)
                    
                    if log_entry:
                        parsed_count += 1
                        log_entry['file'] = filename
                        log_entry['line_num'] = line_num
                        
                        # Aplicar filtros
                        if levels and log_entry['level'] not in levels:
                            continue
                        if modules and log_entry['module'] not in modules:
                            continue
                        if search and search.lower() not in log_entry['message'].lower():
                            continue
                        
                        logs.append(log_entry)
                
                print(f"[DEBUG] {filename}: {parsed_count} parseadas")
                
        except Exception as e:
            print(f"[ERROR] Error leyendo {filename}: {e}")
    
    print(f"[DEBUG] Total logs retornados: {len(logs)}")
    return logs


@app.route('/')
def index():
    """Página principal del dashboard"""
    html = '''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Brain Log Viewer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif; background: #0d1117; color: #c9d1d9; height: 100vh; overflow: hidden; }
        .container { display: grid; grid-template-rows: auto 1fr; height: 100vh; }
        .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 1rem 1.5rem; }
        .header h1 { font-size: 1.5rem; color: #58a6ff; margin-bottom: 1rem; }
        .controls { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
        .control-group { display: flex; gap: 0.5rem; align-items: center; }
        .filter-btn { padding: 0.5rem 1rem; border: 1px solid #30363d; background: #21262d; color: #c9d1d9; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.9rem; }
        .filter-btn:hover { background: #30363d; }
        .filter-btn.active { background: #388bfd; border-color: #388bfd; color: white; }
        .action-btn { padding: 0.5rem 1rem; background: #238636; border: none; border-radius: 6px; color: white; cursor: pointer; transition: background 0.2s; font-weight: bold; }
        .action-btn:hover { background: #2ea043; }
        .action-btn.secondary { background: #58a6ff; }
        .action-btn.secondary:hover { background: #79c0ff; }
        input[type="text"] { padding: 0.5rem; background: #21262d; border: 1px solid #30363d; border-radius: 6px; color: #c9d1d9; width: 300px; }
        .main-content { display: grid; grid-template-columns: 250px 1fr 250px; gap: 1px; background: #30363d; overflow: hidden; }
        .sidebar { background: #161b22; padding: 1rem; overflow-y: auto; }
        .sidebar h3 { font-size: 0.9rem; color: #8b949e; text-transform: uppercase; margin-bottom: 1rem; }
        .file-item, .module-item { padding: 0.5rem; background: #21262d; border-radius: 6px; cursor: pointer; transition: all 0.2s; font-size: 0.85rem; margin-bottom: 0.5rem; }
        .file-item:hover, .module-item:hover { background: #30363d; }
        .file-item.active, .module-item.active { background: #388bfd; color: white; }
        .file-item .badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 10px; font-size: 0.7rem; margin-left: 0.5rem; }
        .file-item .badge.brain { background: #58a6ff; color: #0d1117; }
        .file-item .badge.host { background: #d29922; color: #0d1117; }
        .log-container { background: #0d1117; overflow-y: auto; padding: 1rem; font-family: "Consolas", "Monaco", monospace; font-size: 0.85rem; }
        .log-entry { padding: 0.75rem; margin-bottom: 0.5rem; background: #161b22; border-left: 3px solid #30363d; border-radius: 4px; transition: all 0.2s; }
        .log-entry:hover { background: #1c2128; }
        .log-entry.DEBUG { border-left-color: #8b949e; }
        .log-entry.INFO { border-left-color: #58a6ff; }
        .log-entry.WARNING { border-left-color: #d29922; }
        .log-entry.ERROR { border-left-color: #f85149; }
        .log-entry.CRITICAL, .log-entry.EMERGENCY { border-left-color: #da3633; background: #1a0f0f; }
        .log-header { display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; }
        .log-time { color: #8b949e; }
        .log-level { padding: 0.1rem 0.5rem; border-radius: 3px; font-weight: bold; font-size: 0.75rem; }
        .log-level.DEBUG { background: #8b949e; color: #0d1117; }
        .log-level.INFO { background: #58a6ff; color: #0d1117; }
        .log-level.WARNING { background: #d29922; color: #0d1117; }
        .log-level.ERROR { background: #f85149; color: white; }
        .log-level.CRITICAL, .log-level.EMERGENCY { background: #da3633; color: white; }
        .log-meta { font-size: 0.8rem; color: #8b949e; margin-bottom: 0.3rem; }
        .log-message { color: #c9d1d9; line-height: 1.5; }
        .stats { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
        .stat-card { background: #21262d; padding: 0.75rem 1rem; border-radius: 6px; text-align: center; }
        .stat-card .label { font-size: 0.75rem; color: #8b949e; text-transform: uppercase; }
        .stat-card .value { font-size: 1.5rem; font-weight: bold; color: #58a6ff; }
        .loading { text-align: center; padding: 2rem; color: #8b949e; }
        .error { background: #1a0f0f; border: 1px solid #f85149; padding: 1rem; margin: 1rem; border-radius: 6px; color: #f85149; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Brain Log Viewer</h1>
            <div class="controls">
                <div class="control-group">
                    <button class="filter-btn active" data-level="DEBUG">DEBUG</button>
                    <button class="filter-btn active" data-level="INFO">INFO</button>
                    <button class="filter-btn active" data-level="WARNING">WARN</button>
                    <button class="filter-btn active" data-level="ERROR">ERROR</button>
                    <button class="filter-btn active" data-level="CRITICAL">CRIT</button>
                </div>
                <div class="control-group">
                    <input type="text" id="searchBox" placeholder="🔍 Buscar...">
                </div>
                <div class="control-group">
                    <button class="action-btn" id="refreshBtn">🔄 Refresh</button>
                    <button class="action-btn secondary" id="copyBtn">📋 Copiar</button>
                    <button class="action-btn secondary" id="exportBtn">💾 Exportar</button>
                </div>
            </div>
            <div class="stats">
                <div class="stat-card"><div class="label">Total Logs</div><div class="value" id="totalLogs">0</div></div>
                <div class="stat-card"><div class="label">Archivos</div><div class="value" id="totalFiles">0</div></div>
                <div class="stat-card"><div class="label">Filtrados</div><div class="value" id="filteredLogs">0</div></div>
            </div>
        </div>
        <div class="main-content">
            <div class="sidebar"><h3>Archivos</h3><div id="fileList"></div></div>
            <div class="log-container" id="logContainer"><div class="loading">Cargando logs...</div></div>
            <div class="sidebar"><h3>Módulos</h3><div id="moduleList"></div></div>
        </div>
    </div>
    <script>
        let allLogs = [];
        let selectedFiles = [];
        let selectedModules = [];
        let activeLevels = new Set(["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL", "EMERGENCY"]);
        let searchTerm = "";

        async function loadFiles() {
            console.log("[DEBUG] loadFiles()");
            try {
                const res = await fetch("/api/files");
                const files = await res.json();
                console.log("[DEBUG] Files:", files);
                
                const fileList = document.getElementById("fileList");
                fileList.innerHTML = "";
                
                files.forEach(file => {
                    const item = document.createElement("div");
                    item.className = "file-item active";
                    item.dataset.file = file.name;
                    item.innerHTML = file.name + ' <span class="badge ' + file.type + '">' + file.type + '</span>';
                    fileList.appendChild(item);
                });

                selectedFiles = files.map(f => f.name);
                document.getElementById("totalFiles").textContent = files.length;
            } catch (error) {
                console.error("[ERROR] loadFiles:", error);
                document.getElementById("fileList").innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            }
        }

        async function loadLogs() {
            console.log("[DEBUG] loadLogs()");
            try {
                const params = new URLSearchParams();
                selectedFiles.forEach(f => params.append("files", f));
                Array.from(activeLevels).forEach(l => params.append("levels", l));
                selectedModules.forEach(m => params.append("modules", m));
                if (searchTerm) params.append("search", searchTerm);

                const res = await fetch("/api/logs?" + params);
                allLogs = await res.json();
                console.log("[DEBUG] Logs:", allLogs.length);
                
                renderLogs();
                updateStats();
                await loadModules();
            } catch (error) {
                console.error("[ERROR] loadLogs:", error);
                document.getElementById("logContainer").innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            }
        }

        async function loadModules() {
            try {
                const res = await fetch("/api/modules");
                const modules = await res.json();
                const moduleList = document.getElementById("moduleList");
                moduleList.innerHTML = "";
                modules.forEach(module => {
                    const item = document.createElement("div");
                    item.className = "module-item";
                    item.dataset.module = module;
                    item.textContent = module;
                    moduleList.appendChild(item);
                });
            } catch (error) {
                console.error("[ERROR] loadModules:", error);
            }
        }

        function renderLogs() {
            const container = document.getElementById("logContainer");
            container.innerHTML = "";
            if (allLogs.length === 0) {
                container.innerHTML = '<div class="loading">No hay logs</div>';
                return;
            }
            allLogs.forEach(log => {
                const entry = document.createElement("div");
                entry.className = "log-entry " + log.level;
                entry.innerHTML = '<div class="log-header"><span class="log-time">' + log.timestamp + '</span><span class="log-level ' + log.level + '">' + log.level + '</span></div><div class="log-meta">' + log.module + ' → ' + log.function + ' (' + log.file + ':' + log.line_num + ')</div><div class="log-message">' + log.message + '</div>';
                container.appendChild(entry);
            });
        }

        function updateStats() {
            document.getElementById("totalLogs").textContent = allLogs.length;
            document.getElementById("filteredLogs").textContent = allLogs.length;
        }

        async function copyLogs() {
            const text = allLogs.map(log => "[" + log.timestamp + "] [" + log.level + "] " + log.module + "\\n  " + log.message + "\\n").join("\\n");
            await navigator.clipboard.writeText(text);
            alert("✅ Logs copiados");
        }

        function exportLogs() {
            const params = new URLSearchParams();
            selectedFiles.forEach(f => params.append("files", f));
            Array.from(activeLevels).forEach(l => params.append("levels", l));
            window.location.href = "/api/export?" + params;
        }

        document.getElementById("fileList").addEventListener("click", e => {
            const item = e.target.closest(".file-item");
            if (item) {
                item.classList.toggle("active");
                const file = item.dataset.file;
                if (selectedFiles.includes(file)) {
                    selectedFiles = selectedFiles.filter(f => f !== file);
                } else {
                    selectedFiles.push(file);
                }
                loadLogs();
            }
        });

        document.getElementById("moduleList").addEventListener("click", e => {
            const item = e.target.closest(".module-item");
            if (item) {
                item.classList.toggle("active");
                const module = item.dataset.module;
                if (selectedModules.includes(module)) {
                    selectedModules = selectedModules.filter(m => m !== module);
                } else {
                    selectedModules.push(module);
                }
                loadLogs();
            }
        });

        document.querySelectorAll(".filter-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const level = btn.dataset.level;
                if (activeLevels.has(level)) {
                    activeLevels.delete(level);
                    btn.classList.remove("active");
                } else {
                    activeLevels.add(level);
                    btn.classList.add("active");
                }
                loadLogs();
            });
        });

        document.getElementById("searchBox").addEventListener("input", e => {
            searchTerm = e.target.value;
            loadLogs();
        });

        document.getElementById("refreshBtn").addEventListener("click", () => loadFiles().then(loadLogs));
        document.getElementById("copyBtn").addEventListener("click", copyLogs);
        document.getElementById("exportBtn").addEventListener("click", exportLogs);

        console.log("[DEBUG] Inicializando...");
        loadFiles().then(loadLogs);
    </script>
</body>
</html>'''
    return html


@app.route('/api/files')
def api_files():
    """Lista archivos de log disponibles"""
    try:
        files = get_log_files()
        print(f"[API] /api/files retornando {len(files)} archivos")
        return jsonify(files)
    except Exception as e:
        print(f"[ERROR] /api/files: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/logs')
def api_logs():
    """Obtiene logs con filtros"""
    try:
        filenames = request.args.getlist('files')
        levels = request.args.getlist('levels')
        modules = request.args.getlist('modules')
        search = request.args.get('search', '')
        
        logs = read_and_parse_logs(
            filenames=filenames if filenames else None,
            levels=levels if levels else None,
            modules=modules if modules else None,
            search=search if search else None
        )
        
        print(f"[API] /api/logs retornando {len(logs)} logs")
        return jsonify(logs)
    except Exception as e:
        print(f"[ERROR] /api/logs: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/modules')
def api_modules():
    """Obtiene lista de módulos únicos"""
    try:
        logs = read_and_parse_logs()
        modules = list(set(log['module'] for log in logs))
        print(f"[API] /api/modules retornando {len(modules)} módulos")
        return jsonify(sorted(modules))
    except Exception as e:
        print(f"[ERROR] /api/modules: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/export')
def api_export():
    """Exporta logs filtrados como texto"""
    try:
        filenames = request.args.getlist('files')
        levels = request.args.getlist('levels')
        
        logs = read_and_parse_logs(
            filenames=filenames if filenames else None,
            levels=levels if levels else None
        )
        
        output = io.StringIO()
        output.write("=" * 80 + "\n")
        output.write("BRAIN LOG EXPORT\n")
        output.write(f"Generated: {datetime.now().isoformat()}\n")
        output.write(f"Total Entries: {len(logs)}\n")
        output.write("=" * 80 + "\n\n")
        
        for log in logs:
            output.write(f"[{log['timestamp']}] [{log['level']}] {log['module']}\n")
            output.write(f"  {log['message']}\n")
            output.write(f"  (File: {log['file']}, Line: {log['line_num']})\n\n")
        
        mem_file = io.BytesIO()
        mem_file.write(output.getvalue().encode('utf-8'))
        mem_file.seek(0)
        
        return send_file(
            mem_file,
            mimetype='text/plain',
            as_attachment=True,
            download_name=f'brain_logs_{datetime.now().strftime("%Y%m%d_%H%M%S")}.txt'
        )
    except Exception as e:
        print(f"[ERROR] /api/export: {e}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Brain Log Viewer Starting...")
    print("=" * 60)
    print(f"📁 Logs Directory: {LOGS_DIR}")
    
    if not LOGS_DIR.exists():
        print(f"⚠️  WARNING: Directory does not exist!")
    else:
        log_files = list(LOGS_DIR.glob("*.log"))
        print(f"📄 Found {len(log_files)} .log files")
        for f in log_files:
            print(f"   - {f.name}")
    
    print(f"🌐 Dashboard: http://localhost:8080")
    print("=" * 60)
    print()
    
    app.run(host='0.0.0.0', port=8080, debug=True)