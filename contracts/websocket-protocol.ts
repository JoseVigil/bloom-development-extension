/**
 * BLOOM WEBSOCKET PROTOCOL
 * Formal protocol definition for WebSocket communication
 * 
 * Protocol Version: 1.0.0
 * 
 * @packageDocumentation
 * @module contracts/websocket-protocol
 */

import type { Intent, AIAccount, ErrorCode, AIPromptPayload } from './types';

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
 * // Send AI prompt
 * const msg: ClientMessage = {
 *   event: 'bloom.ai.execution.prompt',
 *   data: {
 *     context: 'dev',
 *     text: 'Add user authentication',
 *     intentId: 'intent-dev-123',
 *     profileId: 'profile-default',
 *     provider: 'ollama'
 *   }
 * };
 * ```
 */
export type ClientMessage =
  | { event: 'subscribe_intents'; data: Record<string, never> }
  | { event: 'unsubscribe_intents'; data: Record<string, never> }
  | { event: 'intent:subscribe'; data: IntentSubscribePayload }
  | { event: 'intent:unsubscribe'; data: IntentUnsubscribePayload }
  | { event: 'bloom.ai.execution.prompt'; data: AIPromptPayload }
  | { event: 'bloom.ai.execution.cancel'; data: AIExecutionCancelPayload }
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
  intentId: string;
}

export interface AIExecutionCancelPayload {
  processId: string;
}

export interface PingPayload {
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
 * // AI streaming chunk
 * const msg: ServerMessage = {
 *   event: 'bloom.ai.execution.stream_chunk',
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
  | { event: 'connected'; data: ConnectedPayload }
  | { event: 'subscribed'; data: SubscribedPayload }
  | { event: 'unsubscribed'; data: UnsubscribedPayload }
  | { event: 'pong'; data: PongPayload }
  | { event: 'bloom.ai.execution.stream_start'; data: StreamStartPayload }
  | { event: 'bloom.ai.execution.stream_chunk'; data: StreamChunkPayload }
  | { event: 'bloom.ai.execution.stream_end'; data: StreamEndPayload }
  | { event: 'bloom.ai.execution.error'; data: AIExecutionErrorPayload }
  | { event: 'bloom.ai.execution.cancelled'; data: CancelledPayload }
  | { event: 'intents:updated'; data: IntentsUpdatedPayload }
  | { event: 'intents:created'; data: IntentCreatedPayload }
  | { event: 'intent:updated'; data: IntentUpdatedPayload }
  | { event: 'intent:locked'; data: IntentLockedPayload }
  | { event: 'intent:unlocked'; data: IntentUnlockedPayload }
  | { event: 'nucleus:created'; data: NucleusCreatedPayload }
  | { event: 'nucleus:updated'; data: NucleusUpdatedPayload }
  | { event: 'profile:update'; data: ProfileUpdatePayload }
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
    ollama: boolean;
    gemini: boolean;
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
// AI STREAMING PAYLOADS
// ============================================================================

/**
 * AI starts streaming a response
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
  /** AI provider being used */
  provider?: 'ollama' | 'gemini';
}

/**
 * AI streams a text chunk
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
 * AI finishes streaming
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
  /** AI provider used */
  provider?: 'ollama' | 'gemini';
  /** Token usage stats (if available from provider) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface AIExecutionErrorPayload {
  processId: string;
  context?: string;
  intentId?: string;
  error_code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  retry_after?: number;
}

/**
 * AI process was cancelled
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

export function isAIExecutionEvent(msg: ServerMessage): msg is Extract<ServerMessage, { event: `bloom.ai.execution.${string}` }> {
  return msg.event.startsWith('bloom.ai.execution.');
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

export const ClientMessageBuilder = {
  subscribeIntents: (): ClientMessage => ({
    event: 'subscribe_intents',
    data: {}
  }),

  subscribeIntent: (intentId: string): ClientMessage => ({
    event: 'intent:subscribe',
    data: { intentId }
  }),

  aiExecutionPrompt: (payload: AIPromptPayload): ClientMessage => ({
    event: 'bloom.ai.execution.prompt',
    data: payload
  }),

  aiExecutionCancel: (processId: string): ClientMessage => ({
    event: 'bloom.ai.execution.cancel',
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

  streamStart: (processId: string, context: string, intentId?: string, provider?: 'ollama' | 'gemini'): ServerMessage => ({
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

  streamChunk: (processId: string, context: string, sequence: number, chunk: string, intentId?: string): ServerMessage => ({
    event: 'bloom.ai.execution.stream_chunk',
    data: {
      processId,
      context,
      intentId,
      sequence,
      chunk
    }
  }),

  streamEnd: (processId: string, context: string, totalChunks: number, totalChars: number, intentId?: string, provider?: 'ollama' | 'gemini'): ServerMessage => ({
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

  error: (message: string, code?: ErrorCode): ServerMessage => ({
    event: 'error',
    data: {
      code,
      message,
      timestamp: Date.now()
    }
  })
};