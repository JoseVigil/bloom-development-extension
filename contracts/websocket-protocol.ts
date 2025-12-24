/**
 * BLOOM WEBSOCKET PROTOCOL
 * Formal protocol definition for WebSocket communication
 * 
 * Protocol Version: 1.0.0
 * 
 * @packageDocumentation
 * @module contracts/websocket-protocol
 */

import type { Intent, AIAccount, ErrorCode } from './types';

// ============================================================================
// PROTOCOL METADATA
// ============================================================================

/**
 * Current WebSocket protocol version
 * Increment when making breaking changes to message formats
 */
export const WS_PROTOCOL_VERSION = '1.0.0';

/**
 * WebSocket connection states
 */
export type ConnectionState = 
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'disconnected'
  | 'error';

// ============================================================================
// CLIENT → SERVER MESSAGES
// ============================================================================

/**
 * All possible messages the client can send to server
 * 
 * @example
 * ```typescript
 * // Subscribe to all intents
 * const msg: ClientMessage = { 
 *   event: 'subscribe_intents', 
 *   data: {} 
 * };
 * 
 * // Send copilot prompt
 * const msg: ClientMessage = {
 *   event: 'copilot.prompt',
 *   data: {
 *     context: 'dev',
 *     text: 'Add user authentication',
 *     intentId: 'intent-dev-123',
 *     profileId: 'profile-default'
 *   }
 * };
 * ```
 */
export type ClientMessage =
  | { event: 'subscribe_intents'; data: Record<string, never> }
  | { event: 'unsubscribe_intents'; data: Record<string, never> }
  | { event: 'intent:subscribe'; data: IntentSubscribePayload }
  | { event: 'intent:unsubscribe'; data: IntentUnsubscribePayload }
  | { event: 'copilot.prompt'; data: CopilotPromptPayload }
  | { event: 'copilot.cancel'; data: CopilotCancelPayload }
  | { event: 'ping'; data: PingPayload };

/**
 * Subscribe to specific intent updates
 */
export interface IntentSubscribePayload {
  /** Intent ID to subscribe to */
  intentId: string;
}

/**
 * Unsubscribe from specific intent updates
 */
export interface IntentUnsubscribePayload {
  /** Intent ID to unsubscribe from */
  intentId: string;
}

/**
 * Send a prompt to Copilot AI
 */
export interface CopilotPromptPayload {
  /** Conversation context */
  context: 'onboarding' | 'genesis' | 'dev' | 'doc' | 'general';
  /** User's prompt text */
  text: string;
  /** Intent ID (if in intent context) */
  intentId?: string;
  /** Chrome profile ID (for AI account selection) */
  profileId?: string;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Cancel an ongoing Copilot process
 */
export interface CopilotCancelPayload {
  /** Process ID to cancel (from stream_start) */
  processId: string;
}

/**
 * Ping message for keep-alive
 */
export interface PingPayload {
  /** Client timestamp (ms since epoch) */
  timestamp: number;
}

// ============================================================================
// SERVER → CLIENT MESSAGES
// ============================================================================

/**
 * All possible messages the server can send to client
 * 
 * @example
 * ```typescript
 * // Connection established
 * const msg: ServerMessage = {
 *   event: 'connected',
 *   data: {
 *     clientId: 'client-abc123',
 *     timestamp: Date.now(),
 *     protocolVersion: '1.0.0'
 *   }
 * };
 * 
 * // Copilot streaming chunk
 * const msg: ServerMessage = {
 *   event: 'copilot.stream_chunk',
 *   data: {
 *     processId: 'process-xyz',
 *     context: 'dev',
 *     intentId: 'intent-dev-123',
 *     sequence: 5,
 *     chunk: 'Sure, I can help you with that...'
 *   }
 * };
 * ```
 */
export type ServerMessage =
  // Connection lifecycle
  | { event: 'connected'; data: ConnectedPayload }
  | { event: 'subscribed'; data: SubscribedPayload }
  | { event: 'unsubscribed'; data: UnsubscribedPayload }
  | { event: 'pong'; data: PongPayload }
  // Copilot streaming
  | { event: 'copilot.stream_start'; data: StreamStartPayload }
  | { event: 'copilot.stream_chunk'; data: StreamChunkPayload }
  | { event: 'copilot.stream_end'; data: StreamEndPayload }
  | { event: 'copilot.error'; data: CopilotErrorPayload }
  | { event: 'copilot.cancelled'; data: CancelledPayload }
  // Resource updates
  | { event: 'intents:updated'; data: IntentsUpdatedPayload }
  | { event: 'intents:created'; data: IntentCreatedPayload }
  | { event: 'intent:updated'; data: IntentUpdatedPayload }
  | { event: 'intent:locked'; data: IntentLockedPayload }
  | { event: 'intent:unlocked'; data: IntentUnlockedPayload }
  | { event: 'nucleus:created'; data: NucleusCreatedPayload }
  | { event: 'nucleus:updated'; data: NucleusUpdatedPayload }
  | { event: 'profile:update'; data: ProfileUpdatePayload }
  // Errors
  | { event: 'error'; data: ErrorPayload };

// ============================================================================
// CONNECTION PAYLOADS
// ============================================================================

/**
 * Server confirms connection established
 */
export interface ConnectedPayload {
  /** Unique client ID for this connection */
  clientId: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
  /** WebSocket protocol version */
  protocolVersion: string;
  /** Server capabilities */
  capabilities?: {
    copilot: boolean;
    file_watching: boolean;
    real_time_sync: boolean;
  };
}

/**
 * Server confirms subscription
 */
export interface SubscribedPayload {
  /** Subscription type (e.g., 'intents', 'intent:123') */
  type: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Server confirms unsubscription
 */
export interface UnsubscribedPayload {
  /** Subscription type that was removed */
  type: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Server responds to ping
 */
export interface PongPayload {
  /** Original client timestamp */
  client_timestamp: number;
  /** Server timestamp (ms since epoch) */
  server_timestamp: number;
}

// ============================================================================
// COPILOT STREAMING PAYLOADS
// ============================================================================

/**
 * Copilot starts streaming a response
 */
export interface StreamStartPayload {
  /** Unique process identifier */
  processId: string;
  /** Conversation context */
  context: string;
  /** Intent ID (if applicable) */
  intentId?: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
  /** Whether process can be cancelled */
  cancellable: boolean;
  /** Estimated response length (if available) */
  estimated_length?: number;
}

/**
 * Copilot streams a text chunk
 */
export interface StreamChunkPayload {
  /** Process identifier (from stream_start) */
  processId: string;
  /** Conversation context */
  context: string;
  /** Intent ID (if applicable) */
  intentId?: string;
  /** Chunk sequence number (0-indexed) */
  sequence: number;
  /** Text chunk content */
  chunk: string;
  /** Whether this is the final chunk */
  is_final?: boolean;
}

/**
 * Copilot finishes streaming
 */
export interface StreamEndPayload {
  /** Process identifier */
  processId: string;
  /** Conversation context */
  context: string;
  /** Intent ID (if applicable) */
  intentId?: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
  /** Total chunks sent */
  total_chunks: number;
  /** Total characters streamed */
  total_chars: number;
  /** AI model used */
  model_used?: string;
  /** Token usage stats */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Copilot encountered an error
 */
export interface CopilotErrorPayload {
  /** Process identifier (if available) */
  processId: string;
  /** Conversation context */
  context?: string;
  /** Intent ID (if applicable) */
  intentId?: string;
  /** Standard error code */
  error_code: ErrorCode;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Whether error is recoverable */
  recoverable: boolean;
  /** Milliseconds to wait before retry */
  retry_after?: number;
}

/**
 * Copilot process was cancelled
 */
export interface CancelledPayload {
  /** Process identifier */
  processId: string;
  /** Whether partial output was generated */
  partial_output: boolean;
  /** Number of chunks sent before cancellation */
  chunks_sent?: number;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

// ============================================================================
// RESOURCE UPDATE PAYLOADS
// ============================================================================

/**
 * Global intents list was updated
 */
export interface IntentsUpdatedPayload {
  /** Update reason */
  reason?: 'created' | 'updated' | 'deleted' | 'reordered';
  /** Number of intents affected */
  count?: number;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * New intent was created
 */
export interface IntentCreatedPayload {
  /** Created intent */
  intent: Intent;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Specific intent was updated
 */
export interface IntentUpdatedPayload {
  /** Intent ID */
  intentId: string;
  /** Updated intent data */
  intent: Intent;
  /** Fields that changed */
  changed_fields?: string[];
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Intent was locked
 */
export interface IntentLockedPayload {
  /** Intent ID */
  intentId: string;
  /** User/process that locked it */
  locked_by: string;
  /** ISO 8601 lock timestamp */
  locked_at: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Intent was unlocked
 */
export interface IntentUnlockedPayload {
  /** Intent ID */
  intentId: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * New nucleus was created
 */
export interface NucleusCreatedPayload {
  /** Nucleus organization name */
  name: string;
  /** Nucleus filesystem path */
  path: string;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Nucleus was updated
 */
export interface NucleusUpdatedPayload {
  /** Nucleus ID */
  nucleusId: string;
  /** Fields that changed */
  changed_fields?: string[];
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Chrome profile AI accounts updated
 */
export interface ProfileUpdatePayload {
  /** Chrome profile ID */
  profileId: string;
  /** Updated AI accounts */
  aiAccounts: AIAccount[];
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

/**
 * Generic error message
 */
export interface ErrorPayload {
  /** Error code (if standardized) */
  code?: ErrorCode;
  /** Error message */
  message: string;
  /** Additional context */
  details?: Record<string, unknown>;
  /** Server timestamp (ms since epoch) */
  timestamp: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for client messages
 */
export function isClientMessage(msg: unknown): msg is ClientMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'event' in msg &&
    'data' in msg &&
    typeof (msg as { event: unknown }).event === 'string'
  );
}

/**
 * Type guard for server messages
 */
export function isServerMessage(msg: unknown): msg is ServerMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'event' in msg &&
    'data' in msg &&
    typeof (msg as { event: unknown }).event === 'string'
  );
}

/**
 * Type guard for Copilot streaming events
 */
export function isCopilotEvent(msg: ServerMessage): msg is Extract<ServerMessage, { event: `copilot.${string}` }> {
  return msg.event.startsWith('copilot.');
}

/**
 * Type guard for resource update events
 */
export function isResourceEvent(msg: ServerMessage): msg is Extract<ServerMessage, { event: `${'intent' | 'intents' | 'nucleus' | 'profile'}:${string}` }> {
  return /^(intent|intents|nucleus|profile):/.test(msg.event);
}

// ============================================================================
// MESSAGE BUILDERS
// ============================================================================

/**
 * Helper to build client messages with type safety
 */
export const ClientMessageBuilder = {
  subscribeIntents: (): ClientMessage => ({
    event: 'subscribe_intents',
    data: {}
  }),

  subscribeIntent: (intentId: string): ClientMessage => ({
    event: 'intent:subscribe',
    data: { intentId }
  }),

  copilotPrompt: (payload: CopilotPromptPayload): ClientMessage => ({
    event: 'copilot.prompt',
    data: payload
  }),

  copilotCancel: (processId: string): ClientMessage => ({
    event: 'copilot.cancel',
    data: { processId }
  }),

  ping: (): ClientMessage => ({
    event: 'ping',
    data: { timestamp: Date.now() }
  })
};

/**
 * Helper to build server messages with type safety
 */
export const ServerMessageBuilder = {
  connected: (clientId: string, protocolVersion: string): ServerMessage => ({
    event: 'connected',
    data: {
      clientId,
      timestamp: Date.now(),
      protocolVersion
    }
  }),

  streamStart: (processId: string, context: string, intentId?: string): ServerMessage => ({
    event: 'copilot.stream_start',
    data: {
      processId,
      context,
      intentId,
      timestamp: Date.now(),
      cancellable: true
    }
  }),

  streamChunk: (processId: string, context: string, sequence: number, chunk: string, intentId?: string): ServerMessage => ({
    event: 'copilot.stream_chunk',
    data: {
      processId,
      context,
      intentId,
      sequence,
      chunk
    }
  }),

  streamEnd: (processId: string, context: string, totalChunks: number, totalChars: number, intentId?: string): ServerMessage => ({
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

  error: (message: string, code?: ErrorCode): ServerMessage => ({
    event: 'error',
    data: {
      code,
      message,
      timestamp: Date.now()
    }
  })
};