#pragma once

#include <fstream>
#include <string>
#include <mutex>
#include <chrono>

/**
 * @brief Sistema de logging dual para Synapse Native Bridge
 * 
 * Maneja dos canales de logging separados:
 * - native_log: Eventos del proceso C++ (bloom-host.exe) → synapse_host_*.log
 * - browser_log: Mensajes redirigidos desde la extensión Chrome → synapse_extension_*.log
 * 
 * Los archivos se crean dinámicamente al recibir la identidad del perfil.
 * Integración automática con telemetry.json para monitoreo de streams activos.
 */
class SynapseLogManager {
private:
    std::ofstream native_log;
    std::ofstream browser_log;
    std::mutex native_mutex;
    std::mutex browser_mutex;
    std::mutex telemetry_mutex;
    std::string log_directory;
    std::string profile_id;
    std::string current_host_log_path;
    std::string current_extension_log_path;
    bool initialized;
    bool logs_opened;
    
    // Control de actualización de telemetry (throttling)
    std::chrono::steady_clock::time_point last_telemetry_update_host;
    std::chrono::steady_clock::time_point last_telemetry_update_extension;
    static constexpr int TELEMETRY_UPDATE_INTERVAL_SECONDS = 30;
    
    /**
     * @brief Genera timestamp con precisión de milisegundos
     * @return String en formato "YYYY-MM-DD HH:MM:SS.mmm"
     */
    std::string get_timestamp_ms();
    
    /**
     * @brief Obtiene el directorio base de logs según el SO
     * @return Path completo al directorio de logs
     * 
     * Windows: %LOCALAPPDATA%\BloomNucleus\logs
     * Unix:    /tmp/bloom-nucleus/logs
     */
    std::string get_log_directory();
    
    /**
     * @brief Crea recursivamente un directorio y sus padres
     * @param path Ruta completa a crear
     * @return true si exitoso o ya existía
     */
    bool create_directory_recursive(const std::string& path);
    
    /**
     * @brief Obtiene la ruta completa a telemetry.json
     * @return Path al archivo telemetry.json
     * 
     * Windows: %LOCALAPPDATA%\BloomNucleus\logs\telemetry.json
     * Unix:    /tmp/bloom-nucleus/logs/telemetry.json
     */
    std::string get_telemetry_path();
    
    /**
     * @brief Actualiza entrada en telemetry.json para un stream
     * @param stream_name Nombre del stream ("synapse_host" o "synapse_extension")
     * @param log_path Ruta completa al archivo de log
     * 
     * Crea o actualiza entrada con:
     * - label: Etiqueta descriptiva con emoji
     * - path: Ruta completa al archivo
     * - priority: 2 (fijo)
     * - last_update: Timestamp ISO 8601
     */
    void update_telemetry(const std::string& stream_name, const std::string& log_path);

public:
    SynapseLogManager();
    ~SynapseLogManager();
    
    /**
     * @brief Fase 1: Inicializa el directorio de logs específico del perfil
     * @param profile_id UUID del perfil (e.g., "14c11dbf-7f2a-43be-beba-7ae757cc7486")
     * 
     * Crea la estructura:
     * logs/profiles/{profile_id}/host/
     * 
     * NO crea archivos físicos todavía (espera el launch_id).
     */
    void initialize_with_profile_id(const std::string& profile_id);
    
    /**
     * @brief Fase 2: Crea los archivos de log con el ID de sesión
     * @param launch_id ID de lanzamiento (e.g., "009_14c11dbf_045012")
     * 
     * Crea archivos con formato:
     * - synapse_host_DDD_UUUUUUUU_HHMMSS.log
     * - synapse_extension_DDD_UUUUUUUU_HHMMSS.log
     * 
     * Donde:
     * - DDD: Día del mes (3 dígitos)
     * - UUUUUUUU: Primeros 8 chars del profile_id
     * - HHMMSS: Hora, minuto, segundo
     * 
     * Escribe headers de sesión con timestamp y PID.
     * Registra streams iniciales en telemetry.json.
     */
    void initialize_with_launch_id(const std::string& launch_id);
    
    /**
     * @brief Verifica si el logger está listo para escribir
     * @return true si los archivos están abiertos
     */
    bool is_ready() const;
    
    /**
     * @brief Escribe entrada en el log nativo (bloom-host)
     * @param level Nivel de log (INFO, WARN, ERROR, DEBUG, CRITICAL)
     * @param message Mensaje a registrar
     * 
     * Actualiza telemetry.json cada 30 segundos para mantener señal de vida.
     */
    void log_native(const std::string& level, const std::string& message);
    
    /**
     * @brief Escribe entrada en el log del navegador (extension)
     * @param level Nivel de log
     * @param message Mensaje a registrar
     * @param timestamp Timestamp opcional (si viene de la extensión)
     * 
     * Actualiza telemetry.json cada 30 segundos para mantener señal de vida.
     */
    void log_browser(const std::string& level, const std::string& message, 
                     const std::string& timestamp = "");
};
