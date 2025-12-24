/**
 * BLOOM INTEGRATION TESTS
 * End-to-end contract validation tests
 * 
 * These tests validate the integration contract across layers:
 * UI ↔ Plugin API ↔ Brain CLI ↔ Filesystem
 * 
 * @packageDocumentation
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type {
  Nucleus,
  Intent,
  IntentDev,
  ChromeProfile,
  APIResponse,
  ErrorResponse,
  BrainResult
} from './types';
import {
  createErrorResponse,
  isRecoverableError,
  getRetryDelay
} from './errors';
import {
  isValidTransition,
  COPILOT_STATE_TRANSITIONS,
  INTENT_EDITOR_TRANSITIONS
} from './state-machines';
import type { ClientMessage, ServerMessage } from './websocket-protocol';
import { isClientMessage, isServerMessage, ClientMessageBuilder } from './websocket-protocol';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_BASE_URL = 'http://localhost:48215/api/v1';
const WS_URL = 'ws://localhost:48215/ws';

// ============================================================================
// E2E TESTS (Currently Skipped - Require Running System)
// ============================================================================

describe('Integration Contract - E2E', () => {
  describe.skip('End-to-End: Create Intent', () => {
    test('UI → Plugin → Brain → Filesystem → UI', async () => {
      // 1. UI calls Plugin API to create intent
      const response = await fetch(`${API_BASE_URL}/intent/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dev',
          name: 'Test Intent',
          files: ['src/test.ts'],
          nucleus: '/tmp/test-nucleus'
        })
      });

      // 2. Validate Plugin response
      expect(response.status).toBe(201);
      const result: APIResponse<Intent> = await response.json();
      expect(result.ok).toBe(true);
      
      if (!result.ok) throw new Error('Response not ok');
      
      // 3. Validate intent structure
      const intent = result.data;
      expect(intent.type).toBe('dev');
      expect(intent.name).toBe('Test Intent');
      expect(intent.status).toBe('draft');
      expect(intent.phase).toBe('briefing');
      expect(intent.initial_files).toContain('src/test.ts');
      expect(intent.id).toMatch(/^intent-dev-/);

      // 4. Verify filesystem (requires Brain CLI access)
      // TODO: Implement when Brain is available
    });
  });

  describe.skip('End-to-End: WebSocket Copilot Streaming', () => {
    let ws: WebSocket;

    beforeAll(() => {
      ws = new WebSocket(WS_URL);
    });

    afterAll(() => {
      ws.close();
    });

    test('Client → Server → AI → Client streaming', async () => {
      // Wait for connection
      await new Promise((resolve) => {
        ws.onopen = resolve;
      });

      // Send copilot prompt
      const prompt = ClientMessageBuilder.copilotPrompt({
        context: 'dev',
        text: 'Add user authentication',
        intentId: 'intent-dev-123'
      });

      ws.send(JSON.stringify(prompt));

      // Collect streaming chunks
      const chunks: string[] = [];
      let processId: string | undefined;

      await new Promise((resolve) => {
        ws.onmessage = (event) => {
          const msg: ServerMessage = JSON.parse(event.data);

          if (msg.event === 'copilot.stream_start') {
            processId = msg.data.processId;
            expect(processId).toBeDefined();
          }

          if (msg.event === 'copilot.stream_chunk') {
            chunks.push(msg.data.chunk);
          }

          if (msg.event === 'copilot.stream_end') {
            resolve(undefined);
          }
        };
      });

      expect(chunks.length).toBeGreaterThan(0);
      const fullResponse = chunks.join('');
      expect(fullResponse.length).toBeGreaterThan(10);
    });
  });
});

// ============================================================================
// TYPE SAFETY TESTS (Always Run)
// ============================================================================

describe('Integration Contract - Type Safety', () => {
  describe('Nucleus Types', () => {
    test('Nucleus type is valid', () => {
      const nucleus: Nucleus = {
        id: 'nucleus-test-123',
        organization: 'test-org',
        path: '/tmp/test-nucleus',
        repo_url: 'https://github.com/test/nucleus',
        projects_count: 0,
        intents_count: 0,
        created_at: new Date().toISOString()
      };
      
      expect(nucleus.id).toBeDefined();
      expect(nucleus.organization).toBe('test-org');
      expect(nucleus.path).toBe('/tmp/test-nucleus');
      expect(nucleus.projects_count).toBe(0);
    });
  });

  describe('Intent Types', () => {
    test('Base Intent type is valid', () => {
      const intent: Intent = {
        id: 'intent-dev-456',
        type: 'dev',
        name: 'Test Intent',
        slug: 'test-intent-456',
        status: 'draft',
        phase: 'briefing',
        locked: false,
        initial_files: ['src/test.ts'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      expect(intent.type).toBe('dev');
      expect(intent.status).toBe('draft');
      expect(intent.phase).toBe('briefing');
    });

    test('IntentDev type with all fields', () => {
      const intent: IntentDev = {
        id: 'intent-dev-789',
        type: 'dev',
        name: 'Full Test Intent',
        slug: 'full-test-789',
        status: 'active',
        phase: 'execution',
        locked: false,
        initial_files: ['src/auth.ts'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        briefing: {
          problem: 'Need authentication',
          expected_output: 'JWT auth system',
          constraints: ['Use RS256'],
          acceptance_criteria: ['Login returns JWT']
        },
        questions: [
          {
            id: 'q1',
            text: 'Support refresh tokens?',
            answer: 'Yes',
            answered_at: new Date().toISOString()
          }
        ],
        turns: [],
        context_plan: {
          strategy: 'focused',
          files_included: ['src/auth.ts'],
          token_estimate: 2000,
          generated_at: new Date().toISOString()
        }
      };
      
      expect(intent.type).toBe('dev');
      expect(intent.briefing?.problem).toBe('Need authentication');
      expect(intent.questions?.length).toBe(1);
      expect(intent.context_plan?.strategy).toBe('focused');
    });
  });

  describe('Profile Types', () => {
    test('ChromeProfile with AI accounts', () => {
      const profile: ChromeProfile = {
        id: 'profile-default',
        name: 'Default',
        path: '/path/to/chrome/profile',
        ai_accounts: [
          {
            provider: 'google',
            account_id: 'test@gmail.com',
            status: 'active',
            usage_remaining: 500,
            quota: 1000,
            last_checked: new Date().toISOString()
          },
          {
            provider: 'openai',
            account_id: 'test-openai',
            status: 'quota_exceeded',
            usage_remaining: 0,
            quota: 500,
            last_checked: new Date().toISOString()
          }
        ]
      };
      
      expect(profile.ai_accounts).toHaveLength(2);
      expect(profile.ai_accounts[0].provider).toBe('google');
      expect(profile.ai_accounts[1].status).toBe('quota_exceeded');
    });
  });

  describe('API Response Types', () => {
    test('APISuccessResponse type', () => {
      const response: APIResponse<Nucleus> = {
        ok: true,
        data: {
          id: 'nucleus-1',
          organization: 'test',
          path: '/test',
          projects_count: 0,
          intents_count: 0,
          created_at: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };
      
      if (response.ok) {
        expect(response.data.id).toBe('nucleus-1');
      }
    });

    test('APIErrorResponse type', () => {
      const response: APIResponse<Nucleus> = {
        ok: false,
        error: {
          error: 'NUCLEUS_NOT_FOUND',
          error_code: 'NUCLEUS_NOT_FOUND',
          message: 'Nucleus not found',
          recoverable: true,
          timestamp: new Date().toISOString()
        }
      };
      
      if (!response.ok) {
        expect(response.error.error_code).toBe('NUCLEUS_NOT_FOUND');
        expect(response.error.recoverable).toBe(true);
      }
    });
  });

  describe('BrainResult Types', () => {
    test('Success result', () => {
      const result: BrainResult<Nucleus> = {
        status: 'success',
        operation: 'nucleus:get',
        data: {
          id: 'nucleus-1',
          organization: 'test',
          path: '/test',
          projects_count: 0,
          intents_count: 0,
          created_at: new Date().toISOString()
        }
      };
      
      expect(result.status).toBe('success');
      expect(result.data).toBeDefined();
    });

    test('Error result', () => {
      const result: BrainResult = {
        status: 'error',
        operation: 'intent:create',
        error: 'Invalid type'
      };
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Invalid type');
    });
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Integration Contract - Error Handling', () => {
  test('createErrorResponse generates valid ErrorResponse', () => {
    const error = createErrorResponse('INTENT_LOCKED', undefined, {
      locked_by: 'process-123'
    });
    
    expect(error.error).toBe('INTENT_LOCKED');
    expect(error.error_code).toBe('INTENT_LOCKED');
    expect(error.recoverable).toBe(true);
    expect(error.retry_after).toBeDefined();
    expect(error.details?.locked_by).toBe('process-123');
  });

  test('isRecoverableError correctly identifies errors', () => {
    expect(isRecoverableError('INTENT_LOCKED')).toBe(true);
    expect(isRecoverableError('BRAIN_CLI_UNAVAILABLE')).toBe(false);
    expect(isRecoverableError('AI_TIMEOUT')).toBe(true);
    expect(isRecoverableError('INTERNAL_ERROR')).toBe(false);
  });

  test('getRetryDelay returns correct delays', () => {
    // Immediate retry
    expect(getRetryDelay('AI_TIMEOUT', 1)).toBe(1000);
    
    // Exponential backoff
    expect(getRetryDelay('INTENT_LOCKED', 1)).toBe(5000);
    expect(getRetryDelay('INTENT_LOCKED', 2)).toBe(10000);
    expect(getRetryDelay('INTENT_LOCKED', 3)).toBe(20000);
    
    // Manual (no auto-retry)
    expect(getRetryDelay('NOT_AUTHENTICATED', 1)).toBeNull();
  });
});

// ============================================================================
// STATE MACHINE TESTS
// ============================================================================

describe('Integration Contract - State Machines', () => {
  test('Valid Copilot state transitions', () => {
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'idle', 'connecting')).toBe(true);
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'connecting', 'streaming')).toBe(true);
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'streaming', 'completed')).toBe(true);
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'completed', 'idle')).toBe(true);
  });

  test('Invalid Copilot state transitions', () => {
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'idle', 'streaming')).toBe(false);
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'streaming', 'idle')).toBe(false);
    expect(isValidTransition(COPILOT_STATE_TRANSITIONS, 'completed', 'streaming')).toBe(false);
  });

  test('Valid Intent Editor state transitions', () => {
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'loading', 'editing')).toBe(true);
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'editing', 'saving')).toBe(true);
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'saving', 'editing')).toBe(true);
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'error', 'loading')).toBe(true);
  });

  test('Invalid Intent Editor state transitions', () => {
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'loading', 'saving')).toBe(false);
    expect(isValidTransition(INTENT_EDITOR_TRANSITIONS, 'editing', 'loading')).toBe(false);
  });
});

// ============================================================================
// WEBSOCKET PROTOCOL TESTS
// ============================================================================

describe('Integration Contract - WebSocket Protocol', () => {
  test('ClientMessage type guards', () => {
    const validMsg: ClientMessage = {
      event: 'subscribe_intents',
      data: {}
    };
    
    expect(isClientMessage(validMsg)).toBe(true);
    expect(isClientMessage(null)).toBe(false);
    expect(isClientMessage({ foo: 'bar' })).toBe(false);
  });

  test('ServerMessage type guards', () => {
    const validMsg: ServerMessage = {
      event: 'connected',
      data: {
        clientId: 'client-123',
        timestamp: Date.now(),
        protocolVersion: '1.0.0'
      }
    };
    
    expect(isServerMessage(validMsg)).toBe(true);
    expect(isServerMessage(null)).toBe(false);
  });

  test('ClientMessageBuilder creates valid messages', () => {
    const msg1 = ClientMessageBuilder.subscribeIntents();
    expect(msg1.event).toBe('subscribe_intents');
    expect(msg1.data).toEqual({});

    const msg2 = ClientMessageBuilder.copilotPrompt({
      context: 'dev',
      text: 'Test prompt',
      intentId: 'intent-123'
    });
    expect(msg2.event).toBe('copilot.prompt');
    expect(msg2.data.context).toBe('dev');
    expect(msg2.data.text).toBe('Test prompt');
  });
});

// ============================================================================
// SERIALIZATION TESTS
// ============================================================================

describe('Integration Contract - Serialization', () => {
  test('Intent serializes to JSON', () => {
    const intent: Intent = {
      id: 'intent-dev-123',
      type: 'dev',
      name: 'Test',
      slug: 'test-123',
      status: 'draft',
      phase: 'briefing',
      locked: false,
      initial_files: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const json = JSON.stringify(intent);
    const parsed = JSON.parse(json) as Intent;
    
    expect(parsed.id).toBe(intent.id);
    expect(parsed.type).toBe(intent.type);
  });

  test('ErrorResponse serializes to JSON', () => {
    const error = createErrorResponse('INTENT_LOCKED');
    const json = JSON.stringify(error);
    const parsed = JSON.parse(json) as ErrorResponse;
    
    expect(parsed.error_code).toBe('INTENT_LOCKED');
    expect(parsed.recoverable).toBe(true);
  });
});