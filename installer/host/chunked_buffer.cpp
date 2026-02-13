#include "chunked_buffer.h"
#include <openssl/sha.h>
#include <sstream>
#include <iomanip>

std::vector<uint8_t> ChunkedMessageBuffer::base64_decode(const std::string& encoded) {
    static const std::string base64_chars = 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::vector<uint8_t> decoded;
    int val = 0, valb = -8;
    for (unsigned char c : encoded) {
        if (c == '=') break;
        size_t pos = base64_chars.find(c);
        if (pos == std::string::npos) continue;
        val = (val << 6) + (int)pos;
        valb += 6;
        if (valb >= 0) {
            decoded.push_back((val >> valb) & 0xFF);
            valb -= 8;
        }
    }
    return decoded;
}

std::string ChunkedMessageBuffer::calculate_sha256(const std::vector<uint8_t>& data) {
    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256(data.data(), data.size(), hash);
    std::stringstream ss;
    for(int i = 0; i < SHA256_DIGEST_LENGTH; i++)
        ss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
    return ss.str();
}

ChunkedMessageBuffer::ChunkResult ChunkedMessageBuffer::process_chunk(
    const json& msg, std::string& out_complete_msg) {
    
    std::lock_guard<std::mutex> lock(buffer_mutex);
    
    if (!msg.contains("bloom_chunk")) {
        return CHUNK_ERROR;
    }
    
    const auto& chunk = msg["bloom_chunk"];
    std::string type = chunk.value("type", "");
    std::string msg_id = chunk.value("message_id", "");
    
    if (type == "header") {
        InProgressMessage ipm;
        ipm.total_chunks = chunk.value("total_chunks", 0);
        ipm.received_chunks = 0;
        ipm.expected_size = chunk.value("total_size_bytes", 0);
        ipm.buffer.reserve(ipm.expected_size);
        active_buffers[msg_id] = std::move(ipm);
        return INCOMPLETE;
    }
    
    auto it = active_buffers.find(msg_id);
    if (it == active_buffers.end()) {
        return CHUNK_ERROR;
    }
    
    if (type == "data") {
        std::vector<uint8_t> decoded = base64_decode(chunk.value("data", ""));
        it->second.buffer.insert(it->second.buffer.end(), decoded.begin(), decoded.end());
        it->second.received_chunks++;
        return INCOMPLETE;
    }
    
    if (type == "footer") {
        std::string computed = calculate_sha256(it->second.buffer);
        if (computed != chunk.value("checksum_verify", "")) {
            active_buffers.erase(it);
            return COMPLETE_INVALID_CHECKSUM;
        }
        out_complete_msg = std::string(it->second.buffer.begin(), it->second.buffer.end());
        active_buffers.erase(it);
        return COMPLETE_VALID;
    }
    
    return CHUNK_ERROR;
}

size_t ChunkedMessageBuffer::get_active_buffers_count() const {
    std::lock_guard<std::mutex> lock(buffer_mutex);
    return active_buffers.size();
}