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

    auto now   = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
    gmtime_cross(&now_t, &tm_utc);

    std::ostringstream date_ss;
    date_ss << std::put_time(&tm_utc, "%Y%m%d");
    std::string date_str = date_ss.str();

    host_log_path      = log_directory + PATH_SEP "host_"              + date_str + ".log";
    extension_log_path = log_directory + PATH_SEP "cortex_extension_"  + date_str + ".log";

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

// ============================================================================
// log_native
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
