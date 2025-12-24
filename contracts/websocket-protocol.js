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
exports.isCopilotEvent = isCopilotEvent;
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
/**
 * Type guard for Copilot streaming events
 */
function isCopilotEvent(msg) {
    return msg.event.startsWith('copilot.');
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
/**
 * Helper to build client messages with type safety
 */
exports.ClientMessageBuilder = {
    subscribeIntents: () => ({
        event: 'subscribe_intents',
        data: {}
    }),
    subscribeIntent: (intentId) => ({
        event: 'intent:subscribe',
        data: { intentId }
    }),
    copilotPrompt: (payload) => ({
        event: 'copilot.prompt',
        data: payload
    }),
    copilotCancel: (processId) => ({
        event: 'copilot.cancel',
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
    streamStart: (processId, context, intentId) => ({
        event: 'copilot.stream_start',
        data: {
            processId,
            context,
            intentId,
            timestamp: Date.now(),
            cancellable: true
        }
    }),
    streamChunk: (processId, context, sequence, chunk, intentId) => ({
        event: 'copilot.stream_chunk',
        data: {
            processId,
            context,
            intentId,
            sequence,
            chunk
        }
    }),
    streamEnd: (processId, context, totalChunks, totalChars, intentId) => ({
        event: 'copilot.stream_end',
        data: {
            processId,
            context,
            intentId,
            timestamp: Date.now(),
            total_chunks: totalChunks,
            total_chars: totalChars
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