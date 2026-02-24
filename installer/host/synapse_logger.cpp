#include "synapse_logger.h"

#include <sstream>
#include <iomanip>
#include <fstream>
#include <ctime>
#include <cstdlib>
#include <iostream>

#if defined(_WIN32) || defined(__MINGW32__) || defined(__MINGW64__)
    #include <windows.h>
    #include <shlobj.h>
    #include <direct.h>
    #include <process.h>
    #define PATH_SEP               "\\"
    #define mkdir_p(p)             _mkdir(p)
    #define gmtime_cross(t, tm)    gmtime_s((tm), (t))
    #define getpid_cross()         static_cast<int>(_getpid())
#else
    #include <sys/stat.h>
    #include <unistd.h>
    #define PATH_SEP               "/"
    #define mkdir_p(p)             mkdir((p), 0755)
    #define gmtime_cross(t, tm)    gmtime_r((t), (tm))
    #define getpid_cross()         static_cast<int>(getpid())
#endif

// ============================================================================
// Constructor / Destructor
// ============================================================================

SynapseLogManager::SynapseLogManager() : ready(false) {}

SynapseLogManager::~SynapseLogManager() {
    if (native_log.is_open())  native_log.close();
    if (browser_log.is_open()) browser_log.close();
}

// ============================================================================
// Timestamp UTC — "YYYY-MM-DD HH:MM:SS.mmm"
// ============================================================================

std::string SynapseLogManager::get_timestamp_ms() {
    auto now    = std::chrono::system_clock::now();
    auto now_t  = std::chrono::system_clock::to_time_t(now);
    auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                      now.time_since_epoch()) % 1000;

    std::tm tm_utc{};
    gmtime_cross(&now_t, &tm_utc);

    std::ostringstream ss;
    ss << std::put_time(&tm_utc, "%Y-%m-%d %H:%M:%S")
       << "." << std::setfill('0') << std::setw(3) << now_ms.count();
    return ss.str();
}

// ============================================================================
// Directorio base de logs
// ============================================================================

std::string SynapseLogManager::get_base_log_directory() {
#ifdef _WIN32
    // Preferir SHGetFolderPath; fallback a env var
    char path[MAX_PATH] = {};
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
        return std::string(path) + "\\BloomNucleus\\logs";
    }
    const char* appdata = std::getenv("LOCALAPPDATA");
    if (appdata) return std::string(appdata) + "\\BloomNucleus\\logs";
    return "";
#else
    return "/tmp/bloom-nucleus/logs";
#endif
}

// ============================================================================
// Creación recursiva de directorios
// ============================================================================

bool SynapseLogManager::create_directory_recursive(const std::string& path) {
    if (path.empty()) return false;
    char sep = PATH_SEP[0];
    size_t pos = 0;
    do {
        pos = path.find(sep, pos + 1);
        std::string sub = path.substr(0, pos);
        if (!sub.empty()) mkdir_p(sub.c_str());
    } while (pos != std::string::npos);
    return true;
}

// ============================================================================
// Path al ejecutable nucleus
//   Windows: %LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe
//   macOS:   nucleus  (en PATH)
// ============================================================================

std::string SynapseLogManager::get_nucleus_executable() {
#ifdef _WIN32
    char path[MAX_PATH] = {};
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
        return std::string(path) + "\\BloomNucleus\\bin\\nucleus\\nucleus.exe";
    }
    const char* appdata = std::getenv("LOCALAPPDATA");
    if (appdata) {
        return std::string(appdata) + "\\BloomNucleus\\bin\\nucleus\\nucleus.exe";
    }
    return "nucleus.exe"; // Fallback: PATH
#else
    return "nucleus";     // macOS: en PATH
#endif
}

// ============================================================================
// Registro de telemetría via nucleus CLI
//
// SPEC: Las aplicaciones NUNCA escriben telemetry.json directamente.
//       Nucleus es el único writer autorizado.
//
// stream_id: synapse_host_{launch_id}  — único por sesión, snake_case
// label:     �️ HOST
// paths:     array con host_log_path + extension_log_path
// ============================================================================

void SynapseLogManager::register_telemetry() {
    // Convertir backslashes → forward slashes (spec: paths en telemetry.json usan '/')
    auto fwd = [](std::string p) -> std::string {
        for (char& c : p) if (c == '\\') c = '/';
        return p;
    };

    // Sanitizar launch_id a snake_case válido para stream_id
    std::string stream_id = "synapse_host_" + launch_id;
    for (char& c : stream_id) {
        if (c == '-') c = '_';
        if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_') c = '_';
    }

    std::string nucleus   = get_nucleus_executable();
    std::string host_fwd  = fwd(host_log_path);
    std::string ext_fwd   = fwd(extension_log_path);
    std::string desc      = "bloom-host native bridge — host process events and Chrome extension"
                            " messages for profile " + profile_id;

    // Construir comando
    // Dos --path → nucleus serializa como array en telemetry.json
    std::string cmd =
        "\"" + nucleus + "\""
        " telemetry register"
        " --stream \""      + stream_id + "\""
        " --label \"�️ HOST\""
        " --path \""        + host_fwd  + "\""
        " --path \""        + ext_fwd   + "\""
        " --priority 2"
        " --category synapse"
        " --source host"
        " --description \"" + desc + "\"";

#ifdef _WIN32
    // En Windows envolvemos en cmd /C para que el shell resuelva el path
    cmd = "cmd /C " + cmd;
#endif

    int ret = std::system(cmd.c_str());
    if (ret != 0) {
        // No bloqueamos el host, avisamos por stderr para que Sentinel lo vea en el trace
        std::cerr << "[" << get_timestamp_ms() << "] [WARN] [HOST] "
                  << "nucleus telemetry register failed (exit=" << ret
                  << ") — logs exist but telemetry.json not updated"
                  << " nucleus_path=" << nucleus << "\n";
        std::cerr.flush();
    } else {
        std::cerr << "[" << get_timestamp_ms() << "] [INFO] [HOST] "
                  << "telemetry registered stream=" << stream_id << "\n";
        std::cerr.flush();
    }
}

// ============================================================================
// initialize() — punto de entrada único
// Idempotente: llamadas repetidas con los mismos IDs no tienen efecto.
// ============================================================================

void SynapseLogManager::initialize(const std::string& p_profile_id,
                                   const std::string& p_launch_id) {
    if (ready) return;

    profile_id = p_profile_id;
    launch_id  = p_launch_id;

    // 1. Directorio base
    std::string base = get_base_log_directory();
    if (base.empty()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "Cannot determine base log directory\n";
        std::cerr.flush();
        return;
    }

    // 2. Estructura: logs/host/{profile_id}/{launch_id}/
    log_directory = base
        + PATH_SEP "host"
        + PATH_SEP + profile_id
        + PATH_SEP + launch_id;

    if (!create_directory_recursive(log_directory)) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "Cannot create log directory: " << log_directory << "\n";
        std::cerr.flush();
        return;
    }

    // 3. Filename: synapse_host_YYYYMMDD.log  /  synapse_extension_YYYYMMDD.log
    auto now   = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
    gmtime_cross(&now_t, &tm_utc);

    std::ostringstream date_ss;
    date_ss << std::put_time(&tm_utc, "%Y%m%d");
    std::string date_str = date_ss.str();

    host_log_path      = log_directory + PATH_SEP "synapse_host_"      + date_str + ".log";
    extension_log_path = log_directory + PATH_SEP "synapse_extension_" + date_str + ".log";

    // 4. Abrir archivos en modo append (seguro ante reinicios el mismo día)
    native_log.open(host_log_path,      std::ios::app);
    browser_log.open(extension_log_path, std::ios::app);

    if (!native_log.is_open() || !browser_log.is_open()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "Cannot open log files in: " << log_directory << "\n";
        std::cerr.flush();
        return;
    }

    ready = true;

    // 5. Headers de sesión
    std::string ts = get_timestamp_ms();
    int pid = getpid_cross();

    native_log  << "\n===== HOST SESSION "
                << ts << " UTC"
                << " PID:"     << pid
                << " PROFILE:" << profile_id
                << " LAUNCH:"  << launch_id
                << " =====\n";
    native_log.flush();

    browser_log << "\n===== EXTENSION SESSION "
                << ts << " UTC"
                << " PID:"     << pid
                << " PROFILE:" << profile_id
                << " LAUNCH:"  << launch_id
                << " =====\n";
    browser_log.flush();

    // Mirror a stderr → Sentinel lo captura en el trace unificado
    std::cerr << "[" << ts << "] [INFO] [HOST] "
              << "Logger initialized"
              << " profile=" << profile_id
              << " launch="  << launch_id
              << " dir="     << log_directory << "\n";
    std::cerr.flush();

    // 6. Volcar mensajes encolados antes de que el logger estuviera listo.
    //    Estos son los logs del handshake Fase 1 y Fase 2 que llegaron
    //    antes de que initialize() fuera llamado.
    flush_pending_queue();

    // 7. Registrar ambos archivos en telemetry.json via nucleus CLI.
    //    Se lanza en thread separado (detached) para no bloquear el startup.
    //    std::system() en Windows invoca cmd.exe y puede tardar varios segundos.
    //    Si bloqueara aquí, Chrome mataría el proceso por idle timeout (6s) antes
    //    de que el host responda al handshake con host_ready.
    std::thread([this]() {
        register_telemetry();
    }).detach();
}

// ============================================================================
// is_ready
// ============================================================================

bool SynapseLogManager::is_ready() const {
    return ready;
}

// ============================================================================
// log_native — log del proceso host + mirror a stderr (trace de Synapse)
// ============================================================================

void SynapseLogManager::log_native(const std::string& level,
                                   const std::string& message) {
    std::string ts   = get_timestamp_ms();
    std::string line = "[" + ts + "] [" + level + "] [HOST] " + message;

    // stderr → capturado por Sentinel → trace unificado de Synapse
    // Se escribe SIEMPRE, independientemente del estado del logger.
    std::cerr << line << "\n";
    std::cerr.flush();

    if (!ready) {
        // Logger aún no inicializado: encolar para flush posterior.
        std::lock_guard<std::mutex> lock(pending_mutex);
        if (pending_queue.size() < MAX_PENDING) {
            pending_queue.push_back({ts, level, message});
        }
        return;
    }

    {
        std::lock_guard<std::mutex> lock(native_mutex);
        if (native_log.is_open()) {
            native_log << line << "\n";
            native_log.flush();
        }
    }
}

// ============================================================================
// flush_pending_queue — vuelca mensajes encolados antes de initialize()
// Precondición: native_mutex tomado y ready == true.
// ============================================================================

void SynapseLogManager::flush_pending_queue() {
    // Tomar snapshot de la cola y limpiarla bajo pending_mutex
    std::vector<PendingEntry> snapshot;
    {
        std::lock_guard<std::mutex> lock(pending_mutex);
        snapshot.swap(pending_queue);
    }

    if (snapshot.empty()) return;

    // Escribir snapshot al archivo bajo native_mutex
    std::lock_guard<std::mutex> lock(native_mutex);
    if (!native_log.is_open()) return;

    native_log << "--- PENDING LOG FLUSH (" << snapshot.size() << " entries) ---\n";
    for (const auto& e : snapshot) {
        std::string line = "[" + e.timestamp + "] [" + e.level + "] [HOST] " + e.message;
        native_log << line << "\n";
    }
    native_log << "--- END PENDING FLUSH ---\n";
    native_log.flush();

    std::cerr << "[" << get_timestamp_ms() << "] [INFO] [HOST] "
              << "Flushed " << snapshot.size() << " pending log entries to disk\n";
    std::cerr.flush();
}

// ============================================================================
// log_browser — log de la extensión Chrome + mirror a stderr (trace de Synapse)
// ============================================================================

void SynapseLogManager::log_browser(const std::string& level,
                                    const std::string& message,
                                    const std::string& timestamp) {
    std::string ts   = timestamp.empty() ? get_timestamp_ms() : timestamp;
    std::string line = "[" + ts + "] [" + level + "] [EXTENSION] " + message;

    {
        std::lock_guard<std::mutex> lock(browser_mutex);
        if (browser_log.is_open()) {
            browser_log << line << "\n";
            browser_log.flush();
        }
    }

    std::cerr << line << "\n";
    std::cerr.flush();
}
