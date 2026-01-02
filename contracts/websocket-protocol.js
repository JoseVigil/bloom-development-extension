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
import type { CopilotContext, CopilotPrompt, ProcessStatus } from './types';  // Updated import for Copilot types

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
 *     profileId: 'profile-dev-456'
 *   }
 * };
 * ```
 */
export type ClientMessage =
  | { event: 'subscribe_intents'; data: {} }
  | { event: 'subscribe_profiles'; data: {} }
  | { event: 'subscribe_accounts'; data: {} }
  | { event: 'subscribe_nuclei'; data: {} }
  | { event: 'subscribe_projects'; data: {} }
  | { event: 'subscribe_auth'; data: {} }
  | { event: 'subscribe_health'; data: {} }
  | { event: 'subscribe_intent_dev'; data: { intentId: string } }
  | { event: 'subscribe_copilot'; data: { context: CopilotContext } }  // New: Subscribe to Copilot updates
  | { event: 'copilot.prompt'; data: CopilotPrompt }  // New: Send Copilot prompt
  | { event: 'copilot.cancel'; data: { processId: string; context: CopilotContext } }  // New: Cancel Copilot process
  | { event: 'intent.dev.submit'; data: { intentId: string; profileId: string } }
  | { event: 'intent.dev.approve'; data: { intentId: string; changes: any[] } }
  | { event: 'intent.dev.reject'; data: { intentId: string; reason: string } }
  | { event: 'intent.dev.cancel'; data: { intentId: string } }
  | { event: 'intent.dev.recover'; data: { intentId: string } }
  | { event: 'intent.dev.edit'; data: { intentId: string; updates: Partial<Intent> } }
  | { event: 'ping'; data: { timestamp: number } };

// ============================================================================
// SERVER → CLIENT MESSAGES
// ============================================================================

/**
 * All possible messages the server can send to client
 * 
 * @example
 * ```typescript
 * // Copilot stream start
 * const msg: ServerMessage = {
 *   event: 'copilot.stream_start',
 *   data: {
 *     processId: 'proc-123',
 *     context: 'onboarding',
 *     intentId: 'intent-456',
 *     timestamp: Date.now(),
 *     cancellable: true
 *   }
 * };
 * 
 * // Copilot chunk
 * const msg: ServerMessage = {
 *   event: 'copilot.stream_chunk',
 *   data: {
 *     processId: 'proc-123',
 *     context: 'onboarding',
 *     sequence: 1,
 *     chunk: 'Partial response...'
 *   }
 * };
 * ```
 */
export type ServerMessage =
  | { event: 'connected'; data: { clientId: string; timestamp: number; protocolVersion: string } }
  | { event: 'intents.updated'; data: { intents: Intent[] } }
  | { event: 'profiles.updated'; data: { profiles: ChromeProfile[] } }
  | { event: 'accounts.updated'; data: { accounts: AIAccount[] } }
  | { event: 'nuclei.updated'; data: { nuclei: Nucleus[] } }
  | { event: 'projects.updated'; data: { projects: Project[] } }
  | { event: 'auth.updated'; data: { githubAuthenticated: boolean; geminiConfigured: boolean } }
  | { event: 'health.updated'; data: { status: 'ok' | 'partial' | 'error'; details: any } }
  | { event: 'intent.dev.updated'; data: { intentId: string; state: IntentDevState; changes?: any[] } }
  | { event: 'copilot.stream_start'; data: { processId: string; context: CopilotContext; intentId?: string; timestamp: number; cancellable: boolean } }  // New
  | { event: 'copilot.stream_chunk'; data: { processId: string; context: CopilotContext; sequence: number; chunk: string; intentId?: string } }  // New
  | { event: 'copilot.stream_end'; data: { processId: string; context: CopilotContext; timestamp: number; total_chunks: number; total_chars: number; intentId?: string } }  // New
  | { event: 'copilot.stream_error'; data: { processId: string; context: CopilotContext; error: string; code?: ErrorCode; intentId?: string } }  // New
  | { event: 'error'; data: { code?: ErrorCode; message: string; timestamp: number } }
  | { event: 'pong'; data: { timestamp: number; serverTime: number } };

// (Rest of the file unchanged, including helpers like ClientMessageBuilder and ServerMessageBuilder)

// Add Copilot-specific builders
export const ClientMessageBuilder = {
  // Existing...
  copilotPrompt: (data: CopilotPrompt): ClientMessage => ({
    event: 'copilot.prompt',
    data
  }),
  copilotCancel: (processId: string, context: CopilotContext): ClientMessage => ({
    event: 'copilot.cancel',
    data: { processId, context }
  })
};

export const ServerMessageBuilder = {
  // Existing...
  streamStart: (processId: string, context: CopilotContext, intentId?: string): ServerMessage => ({
    event: 'copilot.stream_start',
    data: {
      processId,
      context,
      intentId,
      timestamp: Date.now(),
      cancellable: true
    }
  }),
  streamChunk: (processId: string, context: CopilotContext, sequence: number, chunk: string, intentId?: string): ServerMessage => ({
    event: 'copilot.stream_chunk',
    data: {
      processId,
      context,
      intentId,
      sequence,
      chunk
    }
  }),
  streamEnd: (processId: string, context: CopilotContext, totalChunks: number, totalChars: number, intentId?: string): ServerMessage => ({
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
  streamError: (processId: string, context: CopilotContext, error: string, code?: ErrorCode, intentId?: string): ServerMessage => ({
    event: 'copilot.stream_error',
    data: {
      processId,
      context,
      intentId,
      error,
      code
    }
  })
};