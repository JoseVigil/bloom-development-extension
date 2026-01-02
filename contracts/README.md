# Bloom Integration Contract

**Single source of truth for all system types, protocols, and error handling.**

This directory contains the formal contract that defines how all layers of the Bloom system communicate:

```
UI (Svelte) ↔ Plugin API ↔ Brain CLI ↔ Filesystem
         ⇕
    WebSocket Protocol (with Copilot streaming)
```

---

## 📁 Files

### Core Type Definitions

- **`types.ts`** - All TypeScript types (Nucleus, Intent, Profile, Copilot, etc.)
- **`websocket-protocol.ts`** - WebSocket message protocol (client ↔ server, including Copilot streaming)
- **`errors.ts`** - Error catalog with severity and retry strategies (including Copilot errors)
- **`state-machines.ts`** - UI state machines with valid transitions (including CopilotState)

### Examples & Tests

- **`examples/*.json`** - Valid JSON examples for each type
- **`integration.test.ts`** - Integration tests (E2E + unit)

---

## 🎯 Purpose

### ✅ What This Contract Provides

1. **Type Safety** - Shared types prevent drift between UI and Plugin
2. **Protocol Definition** - Formal WebSocket message spec (including Copilot streaming)
3. **Error Standards** - Consistent error codes and recovery strategies
4. **State Management** - Validated state machine transitions
5. **Integration Tests** - Verify contract compliance
6. **Copilot Integration** - Full protocol for AI-assisted workflows

### ❌ What This Contract Prevents

- Duplicate type definitions across layers
- Implicit assumptions about data structures
- Inconsistent error handling
- Invalid state transitions
- Breaking changes without detection

---

## 📚 Usage Guide

### Importing Types

```typescript
// In UI components
import type { Intent, Nucleus } from '@/contracts/types';
import type { CopilotState } from '@/contracts/state-machines';
import type { CopilotPromptPayload } from '@/contracts/websocket-protocol';

// In Plugin API
import type { APIResponse, ErrorResponse } from './contracts/types';
import { createErrorResponse } from './contracts/errors';

// In Brain executor
import type { BrainResult } from './contracts/types';
```

### Using Copilot State Machine

```typescript
import { useState } from 'react';
import type { CopilotState } from '@/contracts/state-machines';
import { isValidTransition, COPILOT_STATE_TRANSITIONS } from '@/contracts/state-machines';

const [state, setState] = useState<CopilotState>({ 
  status: 'idle', 
  streaming: false 
});

// Validate transition before updating
function transition(to: CopilotState['status']) {
  if (isValidTransition(COPILOT_STATE_TRANSITIONS, state.status, to)) {
    setState({ status: to, streaming: to === 'streaming', ... });
  } else {
    console.error(`Invalid Copilot transition: ${state.status} → ${to}`);
  }
}

// Example flow:
// idle → connecting → streaming → completed → idle
```

### Handling Copilot Errors

```typescript
import { createErrorResponse, isCopilotError, getRetryDelay } from '@/contracts/errors';
import type { CopilotErrorPayload } from '@/contracts/websocket-protocol';

// Handle WebSocket error event
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.event === 'copilot.error') {
    const errorPayload: CopilotErrorPayload = msg.data;
    
    // Create standardized error response
    const error = createErrorResponse(
      errorPayload.error_code as any,
      errorPayload.details
    );
    
    // Check if Copilot-specific error
    if (isCopilotError(error.error_code)) {
      console.log('Copilot error detected');
    }
    
    // Get retry delay if recoverable
    if (error.recoverable) {
      const delay = getRetryDelay(error.error_code as any, attemptNumber);
      if (delay) {
        setTimeout(() => retryPrompt(), delay);
      }
    }
  }
};
```

### WebSocket Communication with Copilot

```typescript
import { ClientMessageBuilder } from '@/contracts/websocket-protocol';
import type { ServerMessage } from '@/contracts/websocket-protocol';

// Send Copilot prompt
const msg = ClientMessageBuilder.copilotPrompt({
  context: 'dev',
  text: 'Add user authentication with JWT',
  intentId: 'intent-dev-123',
  profileId: 'profile-default'
});
ws.send(JSON.stringify(msg));

// Handle Copilot streaming response
ws.onmessage = (event) => {
  const msg: ServerMessage = JSON.parse(event.data);
  
  switch (msg.event) {
    case 'copilot.stream_start':
      console.log('Process ID:', msg.data.processId);
      console.log('Cancellable:', msg.data.cancellable);
      setStreaming(true);
      break;
      
    case 'copilot.stream_chunk':
      appendChunk(msg.data.chunk);
      console.log('Chunk #', msg.data.sequence);
      break;
      
    case 'copilot.stream_end':
      console.log('Total chunks:', msg.data.total_chunks);
      console.log('Total chars:', msg.data.total_chars);
      console.log('Model used:', msg.data.model_used);
      setStreaming(false);
      finalizeResponse();
      break;
      
    case 'copilot.error':
      handleCopilotError(msg.data);
      setStreaming(false);
      break;
      
    case 'copilot.cancelled':
      console.log('Process cancelled, chunks sent:', msg.data.chunks_sent);
      setStreaming(false);
      break;
  }
};

// Cancel ongoing process
function cancelCopilot(processId: string) {
  const msg = ClientMessageBuilder.copilotCancel(processId);
  ws.send(JSON.stringify(msg));
}
```

---

## 🧪 Testing

### Run All Contract Tests

```bash
npm run test -- contracts/integration.test.ts
```

### Type Checking

```bash
# Check types compile
cd contracts && npx tsc --noEmit

# Watch mode
npx tsc --noEmit --watch
```

### Validate Examples

```bash
# Ensure JSON examples match TypeScript types
npm run validate:examples
```

---

## 📄 Contract Evolution

### Adding New Types

1. Add type definition to `types.ts`
2. Add JSDoc with example
3. Create JSON example in `examples/`
4. Add test case in `integration.test.ts`
5. Update this README

### Modifying Existing Types

1. **BREAKING CHANGE** - Increment protocol version
2. Add migration guide
3. Update all examples
4. Update tests
5. Notify all consumers

### Adding Error Codes

1. Add to `ErrorCode` union in `types.ts`
2. Add entry to `ERROR_CATALOG` in `errors.ts`
3. Add test case
4. Document in API reference

---

## 📖 Type Reference

### Core Entities

| Type | Description | Example |
|------|-------------|---------|
| `Nucleus` | Development workspace | See `examples/nucleus.json` |
| `Intent` | Development/doc task | See `examples/intent-dev.json` |
| `IntentDev` | Development intent | See `examples/intent-dev.json` |
| `IntentDoc` | Documentation intent | See `examples/intent-doc.json` |
| `ChromeProfile` | Chrome profile with AI accounts | See `examples/profile.json` |

### Copilot Types

| Type | Description | Usage |
|------|-------------|-------|
| `CopilotPromptPayload` | User prompt to Copilot | Client → Server |
| `StreamStartPayload` | Streaming begins | Server → Client |
| `StreamChunkPayload` | Text chunk | Server → Client |
| `StreamEndPayload` | Streaming complete | Server → Client |
| `CopilotErrorPayload` | Copilot error | Server → Client |
| `CancelledPayload` | Process cancelled | Server → Client |

### API Types

| Type | Description |
|------|-------------|
| `BrainResult<T>` | Brain CLI command result |
| `APIResponse<T>` | HTTP API response wrapper |
| `APISuccessResponse<T>` | Success response |
| `APIErrorResponse` | Error response |
| `ErrorResponse` | Standard error structure |

### State Machines

| Type | Description | States |
|------|-------------|--------|
| `LoadingState<T>` | Generic async operation | idle, loading, success, error |
| `CopilotState` | Copilot streaming | idle, connecting, streaming, completed, cancelled, error |
| `IntentEditorState` | Intent editor | loading, editing, saving, locked_by_other, error |
| `NucleusListState` | Nucleus list | loading, loaded, empty, error |

---

## 🚨 Error Catalog

### Critical Errors (Not Recoverable)

- `BRAIN_CLI_UNAVAILABLE` - Brain CLI not installed
- `BRAIN_EXECUTION_FAILED` - Brain command failed
- `NOT_AUTHENTICATED` - GitHub auth required
- `NOT_NUCLEUS` - Invalid nucleus directory
- `AI_AUTH_FAILED` - AI service auth failed
- `COPILOT_STREAM_ERROR` - Copilot streaming failed (fatal)
- `INTERNAL_ERROR` - Unexpected error

### Recoverable Errors (Automatic Retry)

- `NUCLEUS_NOT_FOUND` - Retry immediately
- `INTENT_NOT_FOUND` - Retry immediately
- `INTENT_LOCKED` - Exponential backoff
- `AI_TIMEOUT` - Retry immediately
- `COPILOT_PROMPT_INVALID` - Fix and retry (1s delay)
- `COPILOT_CONTEXT_UNKNOWN` - Retry with valid context (500ms)

### Warnings (Manual Intervention)

- `INTENT_LOCKED_BY_OTHER` - User action needed
- `AI_RATE_LIMIT` - Wait or switch account
- `AI_QUOTA_EXCEEDED` - Add API key
- `COPILOT_PROCESS_NOT_FOUND` - Process already completed
- `COPILOT_CANCELLED` - User cancelled

See `errors.ts` for complete catalog with retry strategies.

---

## 🔗 Integration Points

### UI ↔ WebSocket (Copilot Streaming)

```typescript
import { websocketStore } from '@/stores/websocket';
import type { CopilotPromptPayload } from '@/contracts/types';

// Connect to WebSocket
websocketStore.connect();

// Send Copilot prompt
websocketStore.sendPrompt({
  context: 'onboarding',
  text: 'How do I configure GitHub?',
  profileId: 'profile-default'
});

// Subscribe to streaming updates
websocketStore.subscribe($ws => {
  if ($ws.streaming) {
    console.log('Streaming:', $ws.chunks.join(''));
  }
  
  if ($ws.error) {
    console.error('Copilot error:', $ws.error.message);
  }
});

// Cancel process
websocketStore.cancelProcess(processId);
```

### UI → Plugin API

```typescript
// UI sends HTTP request
const response = await fetch('/api/v1/intent/create', {
  method: 'POST',
  body: JSON.stringify({ type: 'dev', name: 'Test', ... })
});

const result: APIResponse<Intent> = await response.json();

if (result.ok) {
  // Handle success
  console.log(result.data);
} else {
  // Handle error
  console.error(result.error.message);
}
```

### Plugin → Brain CLI

```typescript
import type { BrainResult, Intent } from './contracts/types';

const result: BrainResult<Intent> = await brainExecutor('intent:create', {
  type: 'dev',
  name: 'Test Intent',
  files: ['src/test.ts']
});

if (result.status === 'success') {
  return result.data;
} else {
  throw new Error(result.error);
}
```

---

## 📋 Checklist for Contract Changes

Before modifying the contract:

- [ ] Document change in git commit
- [ ] Update TypeScript types
- [ ] Update JSON examples
- [ ] Update integration tests
- [ ] Run `npm run typecheck`
- [ ] Run `npm run test -- contracts/`
- [ ] Update this README
- [ ] Notify downstream consumers
- [ ] Consider backward compatibility

---

## 🛠️ Troubleshooting

### Types not found

```bash
# Verify tsconfig paths
cat tsconfig.json | grep contracts

# Should see:
"@/contracts/*": ["./contracts/*"]
```

### Copilot WebSocket not connecting

```bash
# Check backend is running
curl http://localhost:8080/health

# Check WebSocket endpoint
wscat -c ws://localhost:8080

# Expected: {"event":"connected","data":{...}}
```

### Examples don't match types

```bash
# Validate with TypeScript compiler
npx tsc --noEmit contracts/examples/*.json
```

### State transition errors

```typescript
// Add assertion in development
import { assertValidTransition } from '@/contracts/state-machines';

assertValidTransition(
  COPILOT_STATE_TRANSITIONS,
  currentState,
  nextState,
  'CopilotComponent'
); // Throws if invalid
```

---

## 🎓 Best Practices

1. **Always import from contracts/** - Never duplicate types
2. **Use type guards** - Narrow unions properly (`if (response.ok) { ... }`)
3. **Validate state transitions** - Prevent invalid state changes
4. **Handle all error codes** - Check `ERROR_CATALOG` for recoverable errors
5. **Add JSDoc** - Document all public types with examples
6. **No `any` types** - Use `unknown` and validate at runtime
7. **Test serialization** - Ensure types survive JSON round-trip
8. **Use Copilot state machine** - Always validate transitions before updating UI
9. **Handle streaming gracefully** - Accumulate chunks, handle cancellation
10. **Check Copilot errors** - Use `isCopilotError()` for specific handling

---

## 📞 Support

- Report contract violations as bugs
- Propose changes via RFC (Request for Comments)
- Ask questions in `#bloom-dev` channel

---

## 📜 Version History

- **v1.1.0** (2025-12-31) - Copilot Integration (PROMPT 1)
  - Added Copilot streaming protocol to websocket-protocol.ts
  - Added CopilotState machine to state-machines.ts
  - Added 5 new Copilot error codes to errors.ts
  - Added helper functions: `isCopilotError()`, `formatErrorForUser()`
  - Updated README with Copilot examples

- **v1.0.0** (2025-01-23) - Initial contract (PROMPT 0)
  - Core types: Nucleus, Intent, Profile
  - WebSocket protocol v1.0.0
  - Error catalog with 16 error codes
  - State machines for UI

---

## ⚡ Quick Reference

```typescript
// Import everything you need
import type {
  Nucleus, Intent, IntentDev, ChromeProfile,
  APIResponse, ErrorResponse, BrainResult,
  CopilotPromptPayload, StreamChunkPayload
} from '@/contracts/types';

import type {
  CopilotState, IntentEditorState, LoadingState
} from '@/contracts/state-machines';

import type {
  ClientMessage, ServerMessage
} from '@/contracts/websocket-protocol';

import {
  createErrorResponse,
  isRecoverableError,
  getRetryDelay,
  isCopilotError,
  formatErrorForUser
} from '@/contracts/errors';

import {
  isValidTransition,
  assertValidTransition
} from '@/contracts/state-machines';
```

---

**This contract is the foundation of Bloom's architecture. Treat it with care.**