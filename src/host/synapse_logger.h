#pragma once

#include <fstream>
#include <string>
#include <mutex>
#include <chrono>

/**
 * @brief Sistema de logging dual para Synapse Native Bridge
 * 
 * Maneja dos canales de logging separados:
 * - native_log: Eventos del proceso C++ (bloom-host.exe)
 * - browser_log: Mensajes redirigidos desde la extensión Chrome
 * 
 * Los archivos se crean dinámicamente al recibir la identidad del perfil.
 */
class SynapseLogManager {
private:
    std::ofstream native_log;
    std::ofstream browser_log;
    std::mutex native_mutex;
    std::mutex browser_mutex;
    std::string log_directory;
    bool initialized;
    bool logs_opened;
    
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

public:
    SynapseLogManager();
    ~SynapseLogManager();
    
    /**
     * @brief Fase 1: Inicializa el directorio de logs específico del perfil
     * @param profile_id UUID del perfil (e.g., "14c11dbf-7f2a-43be-beba-7ae757cc7486")
     * 
     * Crea la estructura:
     * logs/profiles/{profile_id}/
     * 
     * NO crea archivos físicos todavía (espera el launch_id).
     */
    void initialize_with_profile_id(const std::string& profile_id);
    
    /**
     * @brief Fase 2: Crea los archivos de log con el ID de sesión
     * @param launch_id ID de lanzamiento (e.g., "009_14c11dbf_045012")
     * 
     * Crea:
     * - synapse_native_{launch_id}.log
     * - synapse_browser_{launch_id}.log
     * 
     * Escribe headers de sesión con timestamp y PID.
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
     */
    void log_native(const std::string& level, const std::string& message);
    
    /**
     * @brief Escribe entrada en el log del navegador (extension)
     * @param level Nivel de log
     * @param message Mensaje a registrar
     * @param timestamp Timestamp opcional (si viene de la extensión)
     */
    void log_browser(const std::string& level, const std::string& message, 
                     const std::string& timestamp = "");
};