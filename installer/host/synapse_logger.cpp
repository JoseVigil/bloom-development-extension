#include "synapse_logger.h"

#include <sstream>
#include <thread>
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
// set_user_base_dir — debe llamarse antes de initialize()
// ============================================================================

void SynapseLogManager::set_user_base_dir(const std::string& base_dir) {
    if (base_dir.empty()) return;
    user_base_dir = base_dir;
    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "USER_BASE_DIR_SET path=" << user_base_dir << "\n";
    std::cerr.flush();
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
    // Priority 1: explicit path passed by Sentinel via --user-base-dir.
    // This is the path Sentinel resolved with the real user token, so it is
    // always correct regardless of whether the process runs in Session 0
    // (spawned by Chrome) or in the user session (spawned by Sentinel --init).
    if (!user_base_dir.empty()) {
        return user_base_dir + PATH_SEP "logs";
    }

#ifdef _WIN32
    // LOCALAPPDATA del entorno tiene prioridad sobre SHGetFolderPathA.
    // Cuando bloom-host es spawneado por Brain (servicio SYSTEM), el manager
    // inyecta LOCALAPPDATA del usuario real en el entorno del proceso.
    const char* appdata = std::getenv("LOCALAPPDATA");
    if (appdata && appdata[0] != '\0') {
        return std::string(appdata) + "\\BloomNucleus\\logs";
    }
    // Fallback: SHGetFolderPathA (puede devolver perfil SYSTEM si no hay env)
    char path[MAX_PATH] = {};
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
        return std::string(path) + "\\BloomNucleus\\logs";
    }
    return "";
#else
    return "/tmp/bloom-nucleus/logs";
#endif
}

// ============================================================================
// get_bloom_root — raíz de BloomNucleus derivada desde el ejecutable
//
// bloom-host.exe vive en <root>/bin/host/bloom-host.exe
// Subimos dos niveles: bin/host → bin → <root>
// ============================================================================

static std::string strip_last_component(const std::string& s) {
    size_t pos = s.find_last_of("/\\");
    return (pos == std::string::npos) ? s : s.substr(0, pos);
}

std::string SynapseLogManager::get_bloom_root() {
#ifdef _WIN32
    char exePath[MAX_PATH] = {};
    if (GetModuleFileNameA(NULL, exePath, MAX_PATH) == 0) {
        char path[MAX_PATH] = {};
        if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
            return std::string(path) + "\\BloomNucleus";
        }
        const char* appdata = std::getenv("LOCALAPPDATA");
        return appdata ? std::string(appdata) + "\\BloomNucleus" : "";
    }
    std::string p(exePath);
    p = strip_last_component(p); // → .../bin/host
    p = strip_last_component(p); // → .../bin
    p = strip_last_component(p); // → .../BloomNucleus
    return p;
#else
    return "/tmp/bloom-nucleus";
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
// initialize() — punto de entrada único
// ============================================================================

void SynapseLogManager::initialize(const std::string& p_profile_id,
                                   const std::string& p_launch_id) {
    if (ready) return;

    // DIAG: escribe diagnóstico de inicialización.
    //
    // Path strategy (misma cascada que write_boot_log en main):
    //   1. Una vez que log_directory esta construido -> launch dir canonico:
    //        logs/host/profiles/{profile_id}/{launch_id}/nm_init_diag_{launch_id}.log
    //   2. Fallback legacy hasta ese momento:
    //        {user_base_dir}/logs/nm_init_diag.log  (o Windows\Temp)
    //
    // diag_log_path se actualiza a (1) ni bien log_directory es valido,
    // para que todas las entradas siguientes vayan al lugar correcto.
    auto diag_write = [&](const std::string& msg) {
        std::string target = diag_log_path;  // vacio hasta que log_directory este listo
        if (target.empty()) {
            // Fallback legacy: solo para las primeras lineas antes de tener log_directory.
            if (!user_base_dir.empty()) {
#ifdef _WIN32
                target = user_base_dir + "\\logs\\nm_init_diag.log";
#else
                target = user_base_dir + "/logs/nm_init_diag.log";
#endif
            } else {
                target = "C:\\Windows\\Temp\\nm_init_diag.log";
            }
        }
        std::ofstream df(target, std::ios::app);
        if (df.is_open()) { df << msg << "\n"; df.flush(); }
    };
    diag_write("[DIAG] initialize() called profile=" + p_profile_id
               + " launch=" + p_launch_id
               + " user_base_dir=" + user_base_dir);

    profile_id = p_profile_id;
    launch_id  = p_launch_id;

    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "INIT_CALLED profile=" << p_profile_id
              << " launch=" << p_launch_id << "\n";
    std::cerr.flush();

    std::string base = get_base_log_directory();
    if (base.empty()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "INIT_FAIL base_dir=EMPTY\n";
        std::cerr.flush();
        return;
    }

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

    // Desde aqui log_directory existe — redirigir diag al launch dir canonico.
    // Todas las entradas siguientes van a nm_init_diag_{launch_id}.log en lugar
    // del fallback legacy logs/nm_init_diag.log.
    diag_log_path = log_directory + PATH_SEP + "nm_init_diag_" + p_launch_id + ".log";

    auto now   = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
    gmtime_cross(&now_t, &tm_utc);

    std::ostringstream date_ss;
    date_ss << std::put_time(&tm_utc, "%Y%m%d");
    std::string date_str = date_ss.str();

    host_log_path      = log_directory + PATH_SEP "host_"              + date_str + ".log";
    extension_log_path = log_directory + PATH_SEP "cortex_extension_"  + date_str + ".log";

    diag_write("[DIAG] attempting open host=" + host_log_path
               + " ext=" + extension_log_path);

    for (int attempt = 0; attempt < 3 && !native_log.is_open(); ++attempt) {
        if (attempt > 0) std::this_thread::sleep_for(std::chrono::milliseconds(50));
        native_log.open(host_log_path, std::ios::app);
    }
    for (int attempt = 0; attempt < 3 && !browser_log.is_open(); ++attempt) {
        if (attempt > 0) std::this_thread::sleep_for(std::chrono::milliseconds(50));
        browser_log.open(extension_log_path, std::ios::app);
    }

    diag_write("[DIAG] open results native=" + std::string(native_log.is_open() ? "OK" : "FAIL")
               + " browser=" + std::string(browser_log.is_open() ? "OK" : "FAIL"));

    if (!native_log.is_open() || !browser_log.is_open()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "INIT_FAIL open_files (after retries)"
                  << " host=" << host_log_path
                  << " ext=" << extension_log_path
                  << " native_open=" << native_log.is_open()
                  << " browser_open=" << browser_log.is_open() << "\n";
        std::cerr.flush();
        diag_write("[DIAG] INIT_FAIL — returning without ready=true");
        return;
    }
    diag_write("[DIAG] INIT_SUCCESS ready=true");

    ready = true;

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

    std::cerr << "[" << ts << "] [INFO] [HOST] "
              << "Logger initialized"
              << " profile=" << profile_id
              << " launch="  << launch_id
              << " dir="     << log_directory << "\n";
    std::cerr.flush();

    flush_pending_queue();
}

// ============================================================================
// is_ready
// ============================================================================

bool SynapseLogManager::is_ready() const {
    return ready;
}

// ============================================================================
// Getters
// ============================================================================

std::string SynapseLogManager::get_log_directory()      const { return log_directory;      }
std::string SynapseLogManager::get_host_log_path()      const { return host_log_path;      }
std::string SynapseLogManager::get_extension_log_path() const { return extension_log_path; }
std::string SynapseLogManager::get_cortex_log_path()    const { return extension_log_path; }
std::string SynapseLogManager::get_diag_log_path()      const { return diag_log_path;      }

// ============================================================================
// initialize_from_telemetry() — NM mode path resolution via telemetry.json
//
// Instead of constructing paths from %LOCALAPPDATA% (which resolves to the
// System profile when Chrome spawns the host), we read the absolute paths
// that Brain already wrote to telemetry.json before Chrome was launched.
//
// Expected telemetry.json structure (relevant excerpt):
//   {
//     "active_streams": {
//       "host_{launch_id}":   { "path": "C:\\...\\host_20260308.log",   ... },
//       "cortex_{launch_id}": { "path": "C:\\...\\cortex_ext_20260308.log", ... }
//     }
//   }
//
// Falls back to initialize(profile_id, launch_id) if telemetry.json cannot
// be read or the expected keys are absent.
// ============================================================================

// Minimal JSON string extractor: finds "key": "value" and returns value.
// Handles Windows backslash-escaped paths (\\Users\\...).
static std::string extract_json_string(const std::string& json,
                                       const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string::npos) return "";

    // Skip past key, colon, optional whitespace, opening quote
    pos = json.find(':', pos + needle.size());
    if (pos == std::string::npos) return "";
    pos = json.find('"', pos + 1);
    if (pos == std::string::npos) return "";
    pos++; // step past opening quote

    std::string result;
    while (pos < json.size()) {
        char c = json[pos++];
        if (c == '\\' && pos < json.size()) {
            char esc = json[pos++];
            if      (esc == '\\') result += '\\';
            else if (esc == '/')  result += '/';
            else if (esc == '"')  result += '"';
            else if (esc == 'n')  result += '\n';
            else if (esc == 'r')  result += '\r';
            else if (esc == 't')  result += '\t';
            else                  result += esc;
        } else if (c == '"') {
            break; // closing quote
        } else {
            result += c;
        }
    }
    return result;
}

bool SynapseLogManager::initialize_from_telemetry(const std::string& p_launch_id,
                                                   const std::string& telemetry_path) {
    if (ready) return true;

    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "TELEMETRY_INIT_CALLED launch=" << p_launch_id
              << " telemetry=" << telemetry_path << "\n";
    std::cerr.flush();

    // ── 1. Read telemetry.json ────────────────────────────────────────────────
    std::ifstream tf(telemetry_path);
    if (!tf.is_open()) {
        std::cerr << "[" << get_timestamp_ms() << "] [WARN] [HOST] "
                  << "TELEMETRY_OPEN_FAIL path=" << telemetry_path
                  << " — falling back to directory-based init\n";
        std::cerr.flush();
        return false;
    }

    std::string content((std::istreambuf_iterator<char>(tf)),
                         std::istreambuf_iterator<char>());
    tf.close();

    // ── 2. Extract host stream path ───────────────────────────────────────────
    // We need the "path" field that sits inside the "host_{launch_id}" object.
    // Strategy: find the stream key, then find the next "path" occurrence after it.
    std::string host_stream_key  = "host_"   + p_launch_id;
    std::string cortex_stream_key = "cortex_" + p_launch_id;

    auto extract_stream_path = [&](const std::string& stream_key) -> std::string {
        size_t key_pos = content.find("\"" + stream_key + "\"");
        if (key_pos == std::string::npos) return "";

        // Find the opening brace of this stream object
        size_t brace = content.find('{', key_pos);
        if (brace == std::string::npos) return "";

        // Find the matching closing brace (depth tracking)
        int depth = 0;
        size_t end = brace;
        for (; end < content.size(); ++end) {
            if (content[end] == '{') ++depth;
            else if (content[end] == '}') { --depth; if (depth == 0) break; }
        }

        std::string stream_obj = content.substr(brace, end - brace + 1);
        return extract_json_string(stream_obj, "path");
    };

    std::string resolved_host_path   = extract_stream_path(host_stream_key);
    std::string resolved_cortex_path = extract_stream_path(cortex_stream_key);

    if (resolved_host_path.empty()) {
        std::cerr << "[" << get_timestamp_ms() << "] [WARN] [HOST] "
                  << "TELEMETRY_KEY_NOT_FOUND key=" << host_stream_key
                  << " — falling back to directory-based init\n";
        std::cerr.flush();
        return false;
    }

    std::cerr << "[" << get_timestamp_ms() << "] [DEBUG] [HOST] "
              << "TELEMETRY_RESOLVED"
              << " host="   << resolved_host_path
              << " cortex=" << resolved_cortex_path << "\n";
    std::cerr.flush();

    // ── 3. Open files in append mode ─────────────────────────────────────────
    launch_id          = p_launch_id;
    host_log_path      = resolved_host_path;
    extension_log_path = resolved_cortex_path.empty() ? resolved_host_path : resolved_cortex_path;

    // Derive log_directory from host path for informational purposes
    {
        size_t sep = host_log_path.find_last_of("/\\");
        log_directory = (sep != std::string::npos) ? host_log_path.substr(0, sep) : ".";
    }

    native_log.open(host_log_path, std::ios::app);
    if (!native_log.is_open()) {
        std::cerr << "[" << get_timestamp_ms() << "] [ERROR] [HOST] "
                  << "TELEMETRY_OPEN_HOST_FAIL path=" << host_log_path << "\n";
        std::cerr.flush();
        return false;
    }

    if (!resolved_cortex_path.empty()) {
        browser_log.open(extension_log_path, std::ios::app);
        if (!browser_log.is_open()) {
            std::cerr << "[" << get_timestamp_ms() << "] [WARN] [HOST] "
                      << "TELEMETRY_OPEN_CORTEX_FAIL path=" << extension_log_path
                      << " — cortex log will be skipped\n";
            std::cerr.flush();
            // Non-fatal: host log is open; cortex log will silently drop
        }
    }

    ready = true;

    // ── 4. Write session header ───────────────────────────────────────────────
    std::string ts  = get_timestamp_ms();
    int         pid = getpid_cross();

    native_log << "\n===== HOST SESSION (NM) "
               << ts << " UTC"
               << " PID:"     << pid
               << " LAUNCH:"  << launch_id
               << " SRC:telemetry"
               << " =====\n";
    native_log.flush();

    if (browser_log.is_open()) {
        browser_log << "\n===== EXTENSION SESSION (NM) "
                    << ts << " UTC"
                    << " PID:"     << pid
                    << " LAUNCH:"  << launch_id
                    << " SRC:telemetry"
                    << " =====\n";
        browser_log.flush();
    }

    std::cerr << "[" << ts << "] [INFO] [HOST] "
              << "Logger initialized via telemetry.json"
              << " launch=" << launch_id
              << " dir="    << log_directory << "\n";
    std::cerr.flush();

    flush_pending_queue();
    return true;
}

// ============================================================================
// ============================================================================

void SynapseLogManager::log_native(const std::string& level,
                                   const std::string& message) {
    std::string ts   = get_timestamp_ms();
    std::string line = "[" + ts + "] [" + level + "] [HOST] " + message;

    std::cerr << line << "\n";
    std::cerr.flush();

    if (!ready) {
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
// flush_pending_queue
// ============================================================================

void SynapseLogManager::flush_pending_queue() {
    std::vector<PendingEntry> snapshot;
    {
        std::lock_guard<std::mutex> lock(pending_mutex);
        snapshot.swap(pending_queue);
    }

    if (snapshot.empty()) return;

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
// log_browser
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
