#include "synapse_logger.h"
#include <sstream>
#include <iomanip>
#include <fstream>
#include <ctime>

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
    : initialized(false), logs_opened(false) {
    last_telemetry_update_host = std::chrono::steady_clock::now();
    last_telemetry_update_extension = std::chrono::steady_clock::now();
}

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

std::string SynapseLogManager::get_telemetry_path() {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
        return std::string(path) + "\\BloomNucleus\\logs\\telemetry.json";
    }
    return "";
#else
    return "/tmp/bloom-nucleus/logs/telemetry.json";
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
    
    this->profile_id = profile_id;
    
    std::string base_dir = get_log_directory();
    if (base_dir.empty()) return;
    
    // Nueva estructura: logs/profiles/{uuid}/host/
#ifdef _WIN32
    std::string profile_dir = base_dir + "\\profiles\\" + profile_id + "\\host";
    create_directory_recursive(profile_dir);
    log_directory = profile_dir;
#else
    std::string profile_dir = base_dir + "/profiles/" + profile_id + "/host";
    create_directory_recursive(profile_dir);
    log_directory = profile_dir;
#endif
    
    initialized = true;
}

void SynapseLogManager::initialize_with_launch_id(const std::string& launch_id) {
    if (!initialized || log_directory.empty() || logs_opened) return;
    
    // Obtener timestamp para nombre de archivo
    auto now = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    std::tm tm = *std::localtime(&now_t);
    
    // Formato: synapse_host_027_ecdeed9b_112814.log
    // DDD: Día del mes (3 dígitos)
    // UUUUUUUU: Primeros 8 chars del profile_id
    // HHMMSS: Hora+Minuto+Segundo
    std::stringstream filename_suffix;
    filename_suffix << std::setfill('0') << std::setw(3) << tm.tm_mday << "_"
                    << profile_id.substr(0, 8) << "_"
                    << std::setfill('0') << std::setw(2) << tm.tm_hour
                    << std::setfill('0') << std::setw(2) << tm.tm_min
                    << std::setfill('0') << std::setw(2) << tm.tm_sec;
    
    std::string suffix = filename_suffix.str();
    
    // Crear rutas completas con nuevos nombres
#ifdef _WIN32
    current_host_log_path = log_directory + "\\synapse_host_" + suffix + ".log";
    current_extension_log_path = log_directory + "\\synapse_extension_" + suffix + ".log";
#else
    current_host_log_path = log_directory + "/synapse_host_" + suffix + ".log";
    current_extension_log_path = log_directory + "/synapse_extension_" + suffix + ".log";
#endif
    
    // Abrir archivos
    native_log.open(current_host_log_path, std::ios::app);
    browser_log.open(current_extension_log_path, std::ios::app);
    
    // Escribir headers y registrar en telemetry
    if (native_log.is_open()) {
        native_log << "\n========== HOST SESSION " << get_timestamp_ms() 
                  << " PID:" << getpid_impl() 
                  << " LAUNCH:" << launch_id << " ==========\n";
        native_log.flush();
        logs_opened = true;
        
        // Primera actualización de telemetry para host
        update_telemetry("synapse_host", current_host_log_path);
    }
    
    if (browser_log.is_open()) {
        browser_log << "\n========== EXTENSION SESSION " << get_timestamp_ms() 
                   << " PID:" << getpid_impl()
                   << " LAUNCH:" << launch_id << " ==========\n";
        browser_log.flush();
        
        // Primera actualización de telemetry para extension
        update_telemetry("synapse_extension", current_extension_log_path);
    }
}

bool SynapseLogManager::is_ready() const {
    return initialized && logs_opened && native_log.is_open();
}

void SynapseLogManager::update_telemetry(const std::string& stream_name, 
                                         const std::string& log_path) {
    std::lock_guard<std::mutex> lock(telemetry_mutex);
    
    std::string telemetry_path = get_telemetry_path();
    if (telemetry_path.empty()) return;
    
    // Generar timestamp ISO 8601
    auto now = std::chrono::system_clock::now();
    auto now_t = std::chrono::system_clock::to_time_t(now);
    auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        now.time_since_epoch()) % 1000;
    
    std::stringstream iso_timestamp;
    iso_timestamp << std::put_time(std::gmtime(&now_t), "%Y-%m-%dT%H:%M:%S")
                  << "." << std::setfill('0') << std::setw(6) << (now_ms.count() * 1000);
    
    // Leer telemetry.json existente
    std::ifstream input(telemetry_path);
    std::stringstream buffer;
    
    if (input.is_open()) {
        buffer << input.rdbuf();
        input.close();
    } else {
        // Si no existe, crear estructura básica
        buffer << "{\n  \"active_streams\": {\n  }\n}";
    }
    
    std::string content = buffer.str();
    
    // Determinar label según stream
    std::string label = (stream_name == "synapse_host") ? "🖥️ SYNAPSE HOST" : "🧩 SYNAPSE EXTENSION";
    
    // Escapar backslashes en la ruta para JSON (Windows)
    std::string escaped_path = log_path;
    size_t pos = 0;
    while ((pos = escaped_path.find("\\", pos)) != std::string::npos) {
        escaped_path.replace(pos, 1, "\\\\");
        pos += 2;
    }
    
    // Crear entrada JSON
    std::stringstream new_entry;
    new_entry << "    \"" << stream_name << "\": {\n"
              << "      \"label\": \"" << label << "\",\n"
              << "      \"path\": \"" << escaped_path << "\",\n"
              << "      \"priority\": 2,\n"
              << "      \"last_update\": \"" << iso_timestamp.str() << "\"\n"
              << "    }";
    
    // Buscar si ya existe la entrada
    size_t stream_pos = content.find("\"" + stream_name + "\"");
    
    if (stream_pos != std::string::npos) {
        // Actualizar entrada existente
        // Encontrar el inicio de la entrada (incluye espacios)
        size_t start = stream_pos;
        while (start > 0 && content[start - 1] != '\n') start--;
        
        // Encontrar el final de la entrada (hasta el cierre del objeto)
        size_t end = content.find("}", stream_pos);
        if (end != std::string::npos) {
            // Verificar si hay coma después
            size_t comma_check = end + 1;
            while (comma_check < content.length() && 
                   (content[comma_check] == ' ' || content[comma_check] == '\n')) {
                comma_check++;
            }
            bool has_comma = (comma_check < content.length() && content[comma_check] == ',');
            
            if (has_comma) {
                end = comma_check;
            }
            
            std::string replacement = new_entry.str();
            if (has_comma) replacement += ",";
            
            content.replace(start, end - start + 1, replacement + "\n");
        }
    } else {
        // Agregar nueva entrada
        size_t insert_pos = content.find("\"active_streams\": {");
        if (insert_pos != std::string::npos) {
            insert_pos = content.find("{", insert_pos) + 1;
            
            // Verificar si hay otras entradas
            size_t next_quote = content.find("\"", insert_pos);
            size_t closing_brace = content.find("}", insert_pos);
            
            std::string new_entry_str = new_entry.str();
            if (next_quote < closing_brace) {
                // Hay otras entradas, agregar coma
                new_entry_str += ",";
            }
            
            content.insert(insert_pos, "\n" + new_entry_str + "\n  ");
        }
    }
    
    // Escribir archivo actualizado
    std::ofstream output(telemetry_path);
    if (output.is_open()) {
        output << content;
        output.close();
    }
    
    // Actualizar timestamp de última actualización
    if (stream_name == "synapse_host") {
        last_telemetry_update_host = std::chrono::steady_clock::now();
    } else {
        last_telemetry_update_extension = std::chrono::steady_clock::now();
    }
}

void SynapseLogManager::log_native(const std::string& level, const std::string& message) {
    std::lock_guard<std::mutex> lock(native_mutex);
    if (!native_log.is_open()) return;
    
    native_log << "[" << get_timestamp_ms() << "] [" << level << "] [HOST] " 
               << message << std::endl;
    native_log.flush();
    
    // Actualizar telemetry cada 30 segundos (señal de vida)
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - last_telemetry_update_host).count();
    
    if (elapsed >= TELEMETRY_UPDATE_INTERVAL_SECONDS) {
        update_telemetry("synapse_host", current_host_log_path);
    }
}

void SynapseLogManager::log_browser(const std::string& level, const std::string& message, 
                                   const std::string& timestamp) {
    std::lock_guard<std::mutex> lock(browser_mutex);
    if (!browser_log.is_open()) return;
    
    std::string ts = timestamp.empty() ? get_timestamp_ms() : timestamp;
    browser_log << "[" << ts << "] [" << level << "] [EXTENSION] " 
                << message << std::endl;
    browser_log.flush();
    
    // Actualizar telemetry cada 30 segundos (señal de vida)
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(
        now - last_telemetry_update_extension).count();
    
    if (elapsed >= TELEMETRY_UPDATE_INTERVAL_SECONDS) {
        update_telemetry("synapse_extension", current_extension_log_path);
    }
}
