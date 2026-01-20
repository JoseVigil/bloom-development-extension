#include "synapse_logger.h"
#include <sstream>
#include <iomanip>

#if defined(_WIN32) || defined(__MINGW32__) || defined(__MINGW64__)
    #include <windows.h>
    #include <shlobj.h>
    #include <direct.h>
    #define mkdir_impl(path) _mkdir(path)
    #define getpid_impl() _getpid()
#else
    #include <sys/stat.h>
    #include <unistd.h>
    #define mkdir_impl(path) mkdir(path, 0755)
    #define getpid_impl() getpid()
#endif

SynapseLogManager::SynapseLogManager() 
    : initialized(false), logs_opened(false) {}

SynapseLogManager::~SynapseLogManager() {
    if (native_log.is_open()) native_log.close();
    if (browser_log.is_open()) browser_log.close();
}

std::string SynapseLogManager::get_timestamp_ms() {
    auto now = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::stringstream ss;
    ss << std::put_time(std::localtime(&now_t), "%Y-%m-%d %H:%M:%S")
       << "." << std::setfill('0') << std::setw(3) << now_ms.count();
    return ss.str();
}

std::string SynapseLogManager::get_log_directory() {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
        std::string base = std::string(path) + "\\BloomNucleus\\logs";
        mkdir_impl(base.c_str());
        return base;
    }
    return "";
#else
    std::string base = "/tmp/bloom-nucleus/logs";
    mkdir_impl(base.c_str());
    return base;
#endif
}

bool SynapseLogManager::create_directory_recursive(const std::string& path) {
#ifdef _WIN32
    size_t pos = 0;
    do {
        pos = path.find_first_of("\\/", pos + 1);
        std::string subpath = path.substr(0, pos);
        mkdir_impl(subpath.c_str());
    } while (pos != std::string::npos);
    return true;
#else
    size_t pos = 0;
    do {
        pos = path.find('/', pos + 1);
        std::string subpath = path.substr(0, pos);
        mkdir_impl(subpath.c_str());
    } while (pos != std::string::npos);
    return true;
#endif
}

void SynapseLogManager::initialize_with_profile_id(const std::string& profile_id) {
    if (initialized) return;
    
    std::string base_dir = get_log_directory();
    if (base_dir.empty()) return;
    
#ifdef _WIN32
    std::string profile_dir = base_dir + "\\profiles\\" + profile_id;
    create_directory_recursive(profile_dir);
    log_directory = profile_dir;
#else
    std::string profile_dir = base_dir + "/profiles/" + profile_id;
    create_directory_recursive(profile_dir);
    log_directory = profile_dir;
#endif
    
    initialized = true;
}

void SynapseLogManager::initialize_with_launch_id(const std::string& launch_id) {
    if (!initialized || log_directory.empty() || logs_opened) return;
    
#ifdef _WIN32
    native_log.open(log_directory + "\\synapse_native_" + launch_id + ".log", std::ios::app);
    browser_log.open(log_directory + "\\synapse_browser_" + launch_id + ".log", std::ios::app);
#else
    native_log.open(log_directory + "/synapse_native_" + launch_id + ".log", std::ios::app);
    browser_log.open(log_directory + "/synapse_browser_" + launch_id + ".log", std::ios::app);
#endif
    
    if (native_log.is_open()) {
        native_log << "\n========== HOST SESSION " << get_timestamp_ms() 
                  << " PID:" << getpid_impl() 
                  << " LAUNCH:" << launch_id << " ==========\n";
        native_log.flush();
        logs_opened = true;
    }
    
    if (browser_log.is_open()) {
        browser_log << "\n========== EXTENSION SESSION " << get_timestamp_ms() 
                   << " PID:" << getpid_impl()
                   << " LAUNCH:" << launch_id << " ==========\n";
        browser_log.flush();
    }
}

bool SynapseLogManager::is_ready() const {
    return initialized && logs_opened && native_log.is_open();
}

void SynapseLogManager::log_native(const std::string& level, const std::string& message) {
    std::lock_guard<std::mutex> lock(native_mutex);
    if (!native_log.is_open()) return;
    
    native_log << "[" << get_timestamp_ms() << "] [" << level << "] [HOST] " 
               << message << std::endl;
    native_log.flush();
}

void SynapseLogManager::log_browser(const std::string& level, const std::string& message, 
                                   const std::string& timestamp) {
    std::lock_guard<std::mutex> lock(browser_mutex);
    if (!browser_log.is_open()) return;
    
    std::string ts = timestamp.empty() ? get_timestamp_ms() : timestamp;
    browser_log << "[" << ts << "] [" << level << "] [EXTENSION] " 
                << message << std::endl;
    browser_log.flush();
}