"use strict";
/**
 * BLOOM WEBSOCKET PROTOCOL
 * Formal protocol definition for WebSocket communication
 *
 * Protocol Version: 1.0.0
 *
 * @packageDocumentation
 * @module contracts/websocket-protocol
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerMessageBuilder = exports.ClientMessageBuilder = exports.WS_PROTOCOL_VERSION = void 0;
exports.isClientMessage = isClientMessage;
exports.isServerMessage = isServerMessage;
exports.isAIExecutionEvent = isAIExecutionEvent;
exports.isResourceEvent = isResourceEvent;
// ============================================================================
// PROTOCOL METADATA
// ============================================================================
/**
 * Current WebSocket protocol version
 * Increment when making breaking changes to message formats
 */
exports.WS_PROTOCOL_VERSION = '1.0.0';
// ============================================================================
// TYPE GUARDS
// ============================================================================
/**
 * Type guard for client messages
 */
function isClientMessage(msg) {
    return (typeof msg === 'object' &&
        msg !== null &&
        'event' in msg &&
        'data' in msg &&
        typeof msg.event === 'string');
}
/**
 * Type guard for server messages
 */
function isServerMessage(msg) {
    return (typeof msg === 'object' &&
        msg !== null &&
        'event' in msg &&
        'data' in msg &&
        typeof msg.event === 'string');
}
function isAIExecutionEvent(msg) {
    return msg.event.startsWith('bloom.ai.execution.');
}
/**
 * Type guard for resource update events
 */
function isResourceEvent(msg) {
    return /^(intent|intents|nucleus|profile):/.test(msg.event);
}
// ============================================================================
// MESSAGE BUILDERS
// ============================================================================
exports.ClientMessageBuilder = {
    subscribeIntents: () => ({
        event: 'subscribe_intents',
        data: {}
    }),
    subscribeIntent: (intentId) => ({
        event: 'intent:subscribe',
        data: { intentId }
    }),
    aiExecutionPrompt: (payload) => ({
        event: 'bloom.ai.execution.prompt',
        data: payload
    }),
    aiExecutionCancel: (processId) => ({
        event: 'bloom.ai.execution.cancel',
        data: { processId }
    }),
    ping: () => ({
        event: 'ping',
        data: { timestamp: Date.now() }
    })
};
/**
 * Helper to build server messages with type safety
 */
exports.ServerMessageBuilder = {
    connected: (clientId, protocolVersion) => ({
        event: 'connected',
        data: {
            clientId,
            timestamp: Date.now(),
            protocolVersion
        }
    }),
    streamStart: (processId, context, intentId, provider) => ({
        event: 'bloom.ai.execution.stream_start',
        data: {
            processId,
            context,
            intentId,
            timestamp: Date.now(),
            cancellable: true,
            provider
        }
    }),
    streamChunk: (processId, context, sequence, chunk, intentId) => ({
        event: 'bloom.ai.execution.stream_chunk',
        data: {
            processId,
            context,
            intentId,
            sequence,
            chunk
        }
    }),
    streamEnd: (processId, context, totalChunks, totalChars, intentId, provider) => ({
        event: 'bloom.ai.execution.stream_end',
        data: {
            processId,
            context,
            intentId,
            timestamp: Date.now(),
            total_chunks: totalChunks,
            total_chars: totalChars,
            provider
        }
    }),
    error: (message, code) => ({
        event: 'error',
        data: {
            code,
            message,
            timestamp: Date.now()
        }
    })
};
//# sourceMappingURL=websocket-protocol.js.map