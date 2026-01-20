#pragma once

#include <vector>
#include <map>
#include <string>
#include <mutex>
#include <cstdint>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

/**
 * @brief Manejador de mensajes fragmentados entre Extension y Host
 * 
 * Protocolo de chunks:
 * 1. HEADER: {"bloom_chunk": {"type":"header", "message_id":"...", "total_chunks":N}}
 * 2. DATA:   {"bloom_chunk": {"type":"data", "message_id":"...", "data":"base64..."}}
 * 3. FOOTER: {"bloom_chunk": {"type":"footer", "message_id":"...", "checksum_verify":"sha256"}}
 * 
 * Thread-safe mediante mutex interno.
 */
class ChunkedMessageBuffer {
public:
    enum ChunkResult {
        INCOMPLETE,                  // Chunk recibido, esperando más
        COMPLETE_VALID,              // Mensaje completo y checksum válido
        COMPLETE_INVALID_CHECKSUM,   // Mensaje completo pero checksum inválido
        CHUNK_ERROR                  // Error en estructura del chunk
    };
    
    /**
     * @brief Procesa un fragmento de mensaje
     * @param msg JSON del chunk recibido
     * @param out_complete_msg String completo ensamblado (solo si COMPLETE_VALID)
     * @return Estado del procesamiento
     */
    ChunkResult process_chunk(const json& msg, std::string& out_complete_msg);
    
    /**
     * @brief Obtiene número de mensajes en progreso
     * @return Cantidad de buffers activos
     */
    size_t get_active_buffers_count() const;
    
private:
    struct InProgressMessage {
        std::vector<uint8_t> buffer;
        size_t total_chunks;
        size_t received_chunks;
        size_t expected_size;
    };
    
    std::map<std::string, InProgressMessage> active_buffers;
    mutable std::mutex buffer_mutex;
    
    /**
     * @brief Decodifica string base64 a bytes
     * @param encoded String en base64
     * @return Vector de bytes decodificado
     */
    std::vector<uint8_t> base64_decode(const std::string& encoded);
    
    /**
     * @brief Calcula SHA256 de un buffer
     * @param data Vector de bytes
     * @return Hash hexadecimal
     */
    std::string calculate_sha256(const std::vector<uint8_t>& data);
};