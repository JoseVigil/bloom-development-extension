#pragma once

#include <fstream>
#include <string>
#include <mutex>
#include <chrono>
#include <thread>

/**
 * @brief Sistema de logging para Synapse Native Bridge (bloom-host)
 *
 * Maneja dos canales de logging separados:
 *   - native_log:  Eventos del proceso C++ (bloom-host) → synapse_host_YYYYMMDD.log
 *   - browser_log: Mensajes redirigidos desde la extensión Chrome → synapse_extension_YYYYMMDD.log
 *
 * Estructura de directorios:
 *   Windows: %LOCALAPPDATA%\BloomNucleus\logs\host\{profile_id}\{launch_id}\
 *   macOS:   /tmp/bloom-nucleus/logs/host/{profile_id}/{launch_id}/
 *
 * Registro de telemetría:
 *   Delegado a nucleus via CLI — este componente NUNCA escribe telemetry.json directamente.
 *   nucleus.exe se localiza en %LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe (Windows)
 *   o en PATH (macOS). Se invoca `nucleus telemetry register` una sola vez al crear los
 *   archivos, con ambos paths como array en un solo stream.
 *
 * Visibilidad en trace:
 *   Cada entrada se escribe también a stderr para que Sentinel la capture
 *   y la alinee en el trace unificado de Synapse con timestamps consistentes.
 */
class SynapseLogManager {
private:
    std::ofstream native_log;
    std::ofstream browser_log;
    std::mutex    native_mutex;
    std::mutex    browser_mutex;

    std::string log_directory;       // Ruta completa al directorio de sesión
    std::string host_log_path;       // Ruta al archivo synapse_host_YYYYMMDD.log
    std::string extension_log_path;  // Ruta al archivo synapse_extension_YYYYMMDD.log
    std::string profile_id;
    std::string launch_id;

    bool ready;                      // true cuando ambos archivos están abiertos y listos

    // -------------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------------

    /** Timestamp UTC: "YYYY-MM-DD HH:MM:SS.mmm" */
    std::string get_timestamp_ms();

    /**
     * Retorna el directorio raíz de logs de BloomNucleus según el SO.
     *   Windows: %LOCALAPPDATA%\BloomNucleus\logs
     *   macOS:   /tmp/bloom-nucleus/logs
     */
    std::string get_base_log_directory();

    /** Crea recursivamente un directorio y sus padres (cross-platform). */
    bool create_directory_recursive(const std::string& path);

    /**
     * Retorna el path absoluto al ejecutable nucleus según el SO.
     *   Windows: %LOCALAPPDATA%\BloomNucleus\bin\nucleus\nucleus.exe
     *   macOS:   nucleus  (en PATH)
     */
    std::string get_nucleus_executable();

    /**
     * Invoca `nucleus telemetry register` con los dos paths del stream.
     *   stream_id: synapse_host_{launch_id}   (snake_case, único por sesión)
     *   label:     🖥️ HOST
     *   source:    host
     *   category:  synapse
     *
     * Nucleus es el único writer autorizado de telemetry.json.
     * Falla silenciosamente via stderr si nucleus no está disponible.
     */
    void register_telemetry();

public:
    SynapseLogManager();
    ~SynapseLogManager();

    /**
     * @brief Inicialización única — crea directorio, archivos y registra telemetría.
     *
     * @param profile_id UUID del perfil (e.g., "14c11dbf-7f2a-43be-beba-7ae757cc7486")
     * @param launch_id  ID de lanzamiento (e.g., "009_14c11dbf_045012")
     *
     * Estructura creada:
     *   logs/host/{profile_id}/{launch_id}/synapse_host_YYYYMMDD.log
     *   logs/host/{profile_id}/{launch_id}/synapse_extension_YYYYMMDD.log
     *
     * Llama a `nucleus telemetry register` con ambos paths en un solo stream.
     * Es idempotente: llamadas repetidas con los mismos IDs no tienen efecto.
     */
    void initialize(const std::string& profile_id, const std::string& launch_id);

    /** true si los archivos están abiertos y listos para escribir. */
    bool is_ready() const;

    /**
     * @brief Escribe en el log nativo del proceso host.
     * @param level   INFO | WARN | ERROR | DEBUG | CRITICAL
     * @param message Mensaje a registrar
     *
     * Escribe en synapse_host_YYYYMMDD.log y duplica a stderr
     * para visibilidad en el trace unificado de Synapse vía Sentinel.
     */
    void log_native(const std::string& level, const std::string& message);

    /**
     * @brief Escribe en el log de la extensión Chrome.
     * @param level     Nivel de log
     * @param message   Mensaje a registrar
     * @param timestamp Timestamp ISO opcional proveniente de la extensión
     *
     * Escribe en synapse_extension_YYYYMMDD.log y duplica a stderr.
     */
    void log_browser(const std::string& level, const std::string& message,
                     const std::string& timestamp = "");
};
