#pragma once

#include <fstream>
#include <string>
#include <mutex>
#include <chrono>
#include <thread>
#include <vector>
#include <utility>

/**
 * @brief Sistema de logging para Synapse Native Bridge (bloom-host)
 *
 * Maneja dos canales de logging separados:
 *   - native_log:  Eventos del proceso C++ (bloom-host) → host_YYYYMMDD.log
 *   - browser_log: Mensajes redirigidos desde la extensión Chrome → cortex_extension_YYYYMMDD.log
 *
 * Estructura de directorios:
 *   Windows: %LOCALAPPDATA%\BloomNucleus\logs\host\profiles\{profile_id}\{launch_id}\
 *   macOS:   /tmp/bloom-nucleus/logs/host/profiles/{profile_id}/{launch_id}/
 *
 * Registro de telemetría:
 *   Responsabilidad exclusiva de Brain. bloom-host no llama a nucleus CLI.
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
    std::string host_log_path;       // Ruta al archivo host_YYYYMMDD.log
    std::string extension_log_path;  // Ruta al archivo cortex_extension_YYYYMMDD.log
    std::string profile_id;
    std::string launch_id;

    bool ready;                      // true cuando ambos archivos están abiertos y listos
    std::string user_base_dir;       // Override de AppDataDir pasado via --user-base-dir (CLI)

    // Cola de mensajes nativos emitidos antes de que initialize() sea llamado.
    // Cada entrada guarda el timestamp original para preservar orden cronológico.
    // Límite: 100 entradas — más que suficiente para cubrir el handshake completo.
    struct PendingEntry {
        std::string timestamp;
        std::string level;
        std::string message;
    };
    std::vector<PendingEntry> pending_queue;
    std::mutex                pending_mutex;
    static constexpr size_t   MAX_PENDING = 100;

    /** Vuelca pending_queue al archivo nativo. Llamar solo con native_mutex tomado y ready==true. */
    void flush_pending_queue();

    /** Timestamp UTC: "YYYY-MM-DD HH:MM:SS.mmm" */
    std::string get_timestamp_ms();

    /**
     * Retorna el directorio raíz de logs de BloomNucleus según el SO.
     *   Windows: %LOCALAPPDATA%\BloomNucleus\logs
     *   macOS:   /tmp/bloom-nucleus/logs
     */
    std::string get_base_log_directory();

    /**
     * Retorna la raíz de instalación de BloomNucleus derivada desde el ejecutable.
     *   Windows: directorio padre de bin\host\ (tres niveles arriba de bloom-host.exe)
     *   macOS:   /tmp/bloom-nucleus
     */
    std::string get_bloom_root();

    /** Crea recursivamente un directorio y sus padres (cross-platform). */
    bool create_directory_recursive(const std::string& path);

public:
    SynapseLogManager();
    ~SynapseLogManager();

    /**
     * @brief Establece el directorio base de BloomNucleus resuelto por Sentinel
     *        con el token del usuario real. Debe llamarse ANTES de initialize().
     *
     * Cuando bloom-host es spawneado por Chrome (Session 0 / SYSTEM context),
     * %LOCALAPPDATA% resuelve al perfil de SYSTEM en lugar del usuario interactivo.
     * Sentinel pasa el path correcto via --user-base-dir en el NM manifest args,
     * y main() llama a este método antes de initialize().
     *
     * @param base_dir  Ej: "C:\\Users\\josev\\AppData\\Local\\BloomNucleus"
     */
    void set_user_base_dir(const std::string& base_dir);

    /**
     * @brief Inicialización única — crea directorio y archivos de log.
     *
     * @param profile_id UUID del perfil (e.g., "14c11dbf-7f2a-43be-beba-7ae757cc7486")
     * @param launch_id  ID de lanzamiento (e.g., "009_14c11dbf_045012")
     *
     * Estructura creada:
     *   logs/host/profiles/{profile_id}/{launch_id}/host_YYYYMMDD.log
     *   logs/host/profiles/{profile_id}/{launch_id}/cortex_extension_YYYYMMDD.log
     *
     * El registro de telemetría en nucleus es responsabilidad exclusiva de Brain.
     * Es idempotente: llamadas repetidas con los mismos IDs no tienen efecto.
     */
    void initialize(const std::string& profile_id, const std::string& launch_id);

    /**
     * @brief Inicialización desde telemetry.json — usa los paths absolutos ya
     *        resueltos por Brain, evitando la dependencia de %LOCALAPPDATA% que
     *        falla cuando Chrome spawna el host en Session 0 / System context.
     *
     * @param p_launch_id     ID de lanzamiento (e.g., "009_14c11dbf_045012")
     * @param telemetry_path  Ruta absoluta a telemetry.json
     *
     * Busca active_streams["host_{launch_id}"]["path"] y
     *        active_streams["cortex_{launch_id}"]["path"] en telemetry.json.
     * Abre ambos archivos en append mode.
     *
     * @return true si la inicialización fue exitosa, false si no.
     */
    bool initialize_from_telemetry(const std::string& p_launch_id,
                                   const std::string& telemetry_path);

    /** true si los archivos están abiertos y listos para escribir. */
    bool is_ready() const;

    /** Rutas a los archivos de log creados. Vacías si is_ready() == false. */
    std::string get_log_directory()      const;
    std::string get_host_log_path()      const;
    std::string get_extension_log_path() const;
    /** Alias semántico para get_extension_log_path() — usado en handshake cortex. */
    std::string get_cortex_log_path()    const;

    /**
     * @brief Escribe en el log nativo del proceso host.
     * @param level   INFO | WARN | ERROR | DEBUG | CRITICAL
     * @param message Mensaje a registrar
     *
     * Escribe en host_YYYYMMDD.log y duplica a stderr
     * para visibilidad en el trace unificado de Synapse vía Sentinel.
     */
    void log_native(const std::string& level, const std::string& message);

    /**
     * @brief Escribe en el log de la extensión Chrome.
     * @param level     Nivel de log
     * @param message   Mensaje a registrar
     * @param timestamp Timestamp ISO opcional proveniente de la extensión
     *
     * Escribe en cortex_extension_YYYYMMDD.log y duplica a stderr.
     */
    void log_browser(const std::string& level, const std::string& message,
                     const std::string& timestamp = "");
};