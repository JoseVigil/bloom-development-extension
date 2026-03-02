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
        if (sub.empty()) continue;

        int ret = mkdir_p(sub.c_str());
        if (ret != 0 && errno != EEXIST) {
            std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                      << "mkdir_p failed: path=" << sub
                      << " errno=" << errno << "\n";
            std::cerr.flush();
        }
    } while (pos != std::string::npos);

    // Verificar que el directorio final realmente existe.
    // La función no puede retornar true si el path no está en disco —
    // eso ocultaría el error y open() fallaría silenciosamente después.
#if defined(_WIN32) || defined(__MINGW32__) || defined(__MINGW64__)
    DWORD attr = GetFileAttributesA(path.c_str());
    bool ok = (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY));
#else
    struct stat st;
    bool ok = (stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode));
#endif

    if (!ok) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "DIR_NOT_CREATED path=" << path << "\n";
        std::cerr.flush();
    }

    return ok;
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

    // Sanitizar un string para usarlo como stream_id o categoria (snake_case, alphanum)
    auto sanitize = [](const std::string& s) -> std::string {
        std::string out = s;
        for (char& c : out) {
            if (c == '-') c = '_';
            if (!std::isalnum(static_cast<unsigned char>(c)) && c != '_') c = '_';
        }
        return out;
    };

    std::string safe_profile = sanitize(profile_id);
    std::string safe_launch  = sanitize(launch_id);
    std::string nucleus      = get_nucleus_executable();

    // Dos streams separados — uno por archivo, cada uno con identidad propia.
    // Spec: archivos con identidad propia → stream separado por archivo.
    // cortex_synapse   = eventos del proceso C++ (canal nativo)
    // cortex_extension = mensajes de la extensión Chrome (canal browser)
    struct StreamDef {
        std::string stream_id;
        std::string label;
        std::string path;
        std::string description;
    };

    std::vector<StreamDef> streams = {
        {
            "synapse_host_"      + safe_profile,
            "🌉 HOST",
            fwd(host_log_path),
            "bloom-host native bridge — host process events log"
            " for profile " + profile_id + " launch " + launch_id
        },
        {
            "synapse_extension_" + safe_profile,
            "🔌 EXTENSION",
            fwd(extension_log_path),
            "bloom-host native bridge — Chrome extension messages log"
            " for profile " + profile_id + " launch " + launch_id
        }
    };

    for (const auto& s : streams) {
        std::string cmd =
            "\"" + nucleus + "\""
            " telemetry register"
            " --stream \""      + s.stream_id  + "\""
            " --label \""       + s.label      + "\""
            " --path \""        + s.path       + "\""
            " --priority 2"
            " --category synapse"
            " --category " + safe_profile
            + " --category " + safe_launch
            + " --source host"
            + " --description \"" + s.description + "\"";

#ifdef _WIN32
        // chcp 65001 fuerza UTF-8 en cmd.exe hijo para que el emoji del label
        // no se corrompa al pasar por la codepage del sistema (cp1252 por defecto).
        cmd = "cmd /C \"chcp 65001 >nul & " + cmd + "\"";
#endif

        int ret = std::system(cmd.c_str());
        if (ret != 0) {
            std::cerr << "[" << get_timestamp_ms() << "] [WARN] [HOST] "
                      << "nucleus telemetry register failed (exit=" << ret
                      << ") stream=" << s.stream_id
                      << " nucleus_path=" << nucleus << "\n";
            std::cerr.flush();
        } else {
            std::cerr << "[" << get_timestamp_ms() << "] [INFO] [HOST] "
                      << "telemetry registered stream=" << s.stream_id << "\n";
            std::cerr.flush();
        }
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

    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "INIT_CALLED profile=" << p_profile_id
              << " launch=" << p_launch_id << "\n";
    std::cerr.flush();

    // 1. Directorio base
    std::string base = get_base_log_directory();
    if (base.empty()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "INIT_FAIL base_dir=EMPTY\n";
        std::cerr.flush();
        return;
    }

    // 2. Estructura: logs/host/profiles/{profile_id}/{launch_id}/
    log_directory = base
        + PATH_SEP "host"
        + PATH_SEP "profiles"
        + PATH_SEP + profile_id
        + PATH_SEP + launch_id;

    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "INIT_DIR_ATTEMPT path=" << log_directory << "\n";
    std::cerr.flush();

    if (!create_directory_recursive(log_directory)) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "INIT_FAIL dir_create path=" << log_directory << "\n";
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

    host_log_path      = log_directory + PATH_SEP "cortex_synapse_"    + date_str + ".log";
    extension_log_path = log_directory + PATH_SEP "cortex_extension_"  + date_str + ".log";

    // 4. Abrir archivos en modo append (seguro ante reinicios el mismo día)
    native_log.open(host_log_path,      std::ios::app);
    browser_log.open(extension_log_path, std::ios::app);

    if (!native_log.is_open() || !browser_log.is_open()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "INIT_FAIL open_files"
                  << " host=" << host_log_path
                  << " ext=" << extension_log_path
                  << " native_open=" << native_log.is_open()
                  << " browser_open=" << browser_log.is_open() << "\n";
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
// Getters de rutas — disponibles tras initialize()
// ============================================================================

std::string SynapseLogManager::get_log_directory()      const { return log_directory;      }
std::string SynapseLogManager::get_host_log_path()      const { return host_log_path;      }
std::string SynapseLogManager::get_extension_log_path() const { return extension_log_path; }

// ============================================================================
// register_telemetry_sync — registro sincrono para modo --init
//
// En modo Native Messaging, initialize() lanza register_telemetry() en un
// thread detached para no bloquear el handshake de Chrome (timeout 6s).
// En modo --init el proceso sale con return 0 inmediatamente despues de
// initialize(), matando el thread antes de que ejecute std::system().
// Este metodo publico llama register_telemetry() directamente en el
// thread del caller, garantizando que nucleus sea invocado antes de salir.
// ============================================================================

void SynapseLogManager::register_telemetry_sync() {
    if (!ready) return;
    register_telemetry();
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
