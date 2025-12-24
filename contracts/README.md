# Bloom Integration Contract

**Single source of truth for all system types, protocols, and error handling.**

This directory contains the formal contract that defines how all layers of the Bloom system communicate:

```
UI (Svelte) ↔ Plugin API ↔ Brain CLI ↔ Filesystem
         ↕
    WebSocket Protocol
```

---

## 📁 Files

### Core Type Definitions

- **`types.ts`** - All TypeScript types (Nucleus, Intent, Profile, etc.)
- **`websocket-protocol.ts`** - WebSocket message protocol (client ↔ server)
- **`errors.ts`** - Error catalog with severity and retry strategies
- **`state-machines.ts`** - UI state machines with valid transitions

### Examples & Tests

- **`examples/*.json`** - Valid JSON examples for each type
- **`integration.test.ts`** - Integration tests (E2E + unit)

---

## 🎯 Purpose

### ✅ What This Contract Provides

1. **Type Safety** - Shared types prevent drift between UI and Plugin
2. **Protocol Definition** - Formal WebSocket message spec
3. **Error Standards** - Consistent error codes and recovery strategies
4. **State Management** - Validated state machine transitions
5. **Integration Tests** - Verify contract compliance

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

// In Plugin API
import type { APIResponse, ErrorResponse } from './contracts/types';
import { createErrorResponse } from './contracts/errors';

// In Brain executor
import type { BrainResult } from './contracts/types';
```

### Using State Machines

```typescript
import { useState } from 'react';
import type { CopilotState } from '@/contracts/state-machines';
import { isValidTransition, COPILOT_STATE_TRANSITIONS } from '@/contracts/state-machines';

const [state, setState] = useState<CopilotState>({ status: 'idle', streaming: false });

// Validate transition before updating
function transition(to: CopilotState['status']) {
  if (isValidTransition(COPILOT_STATE_TRANSITIONS, state.status, to)) {
    setState({ status: to, ... });
  } else {
    console.error(`Invalid transition: ${state.status} → ${to}`);
  }
}
```

### Handling Errors

```typescript
import { createErrorResponse, getRetryDelay } from '@/contracts/errors';
import type { APIResponse } from '@/contracts/types';

async function fetchNucleus(id: string): Promise<APIResponse<Nucleus>> {
  try {
    const result = await brainExecutor('nucleus:get', { id });
    
    if (result.status === 'success') {
      return {
        ok: true,
        data: result.data,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        ok: false,
        error: createErrorResponse('NUCLEUS_NOT_FOUND', result.error)
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: createErrorResponse('BRAIN_EXECUTION_FAILED', err.message)
    };
  }
}

// Retry logic
const delay = getRetryDelay('INTENT_LOCKED', attemptNumber);
if (delay) {
  setTimeout(() => retry(), delay);
}
```

### WebSocket Communication

```typescript
import { ClientMessageBuilder } from '@/contracts/websocket-protocol';
import type { ServerMessage } from '@/contracts/websocket-protocol';

// Send message
const msg = ClientMessageBuilder.copilotPrompt({
  context: 'dev',
  text: 'Add authentication',
  intentId: 'intent-dev-123'
});
ws.send(JSON.stringify(msg));

// Handle response
ws.onmessage = (event) => {
  const msg: ServerMessage = JSON.parse(event.data);
  
  switch (msg.event) {
    case 'copilot.stream_start':
      console.log('Process ID:', msg.data.processId);
      break;
    case 'copilot.stream_chunk':
      appendChunk(msg.data.chunk);
      break;
    case 'copilot.stream_end':
      finalizeResponse();
      break;
  }
};
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

## 🔄 Contract Evolution

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
| `CopilotState` | Copilot streaming | idle, connecting, streaming, completed, error |
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
- `INTERNAL_ERROR` - Unexpected error

### Recoverable Errors (Automatic Retry)

- `NUCLEUS_NOT_FOUND` - Retry immediately
- `INTENT_NOT_FOUND` - Retry immediately
- `INTENT_LOCKED` - Exponential backoff
- `AI_TIMEOUT` - Retry immediately

### Warnings (Manual Intervention)

- `INTENT_LOCKED_BY_OTHER` - User action needed
- `AI_RATE_LIMIT` - Wait or switch account
- `AI_QUOTA_EXCEEDED` - Add API key

See `errors.ts` for complete catalog with retry strategies.

---

## 🔗 Integration Points

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

### UI ↔ WebSocket

```typescript
// Client → Server
const msg = ClientMessageBuilder.copilotPrompt({
  context: 'dev',
  text: 'Add auth'
});
ws.send(JSON.stringify(msg));

// Server → Client
ws.onmessage = (event) => {
  const msg: ServerMessage = JSON.parse(event.data);
  if (msg.event === 'copilot.stream_chunk') {
    // Handle streaming chunk
  }
};
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

---

## 📞 Support

- Report contract violations as bugs
- Propose changes via RFC (Request for Comments)
- Ask questions in `#bloom-dev` channel

---

## 📜 Version History

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
  APIResponse, ErrorResponse, BrainResult
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
  getRetryDelay
} from '@/contracts/errors';

import {
  isValidTransition,
  assertValidTransition
} from '@/contracts/state-machines';
```

---

**This contract is the foundation of Bloom's architecture. Treat it with care.**