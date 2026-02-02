### Pantallazo de la Nueva Estructura para Ollama en los Contratos

Antes de darte el README.md actualizado, te doy un resumen rápido ("pantallazo") de lo nuevo con Ollama en la estructura de contratos. Esto te sirve como guía para crear prompts en todos los contratos (e.g., prompts para Ollama que usen los tipos genéricos de AI, como AIPromptPayload). La idea es que ahora el sistema es "soberano" (Bloom como runtime, Ollama como provider pluggable), sin acoplamiento a Copilot.

**Nueva Estructura General (Post-Migración):**
- **Provider Agnostic:** Todo es genérico. AIProvider ahora solo incluye 'ollama' y 'gemini' (removido 'copilot'). Usa 'bloom.ai.execution.*' para eventos WebSocket.
- **Ollama-Specific:** Ollama es local (no auth externa). Prompts usan AIPromptPayload con provider='ollama'. Streaming via ollamaChat en AIRuntimeAdapter.
- **Para Crear Prompts:** Usa AIPromptPayload como base. Ejemplo de prompt para Ollama:
  ```
  const prompt: AIPromptPayload = {
    context: 'dev',
    text: 'Genera código para un login',
    intentId: 'intent-dev-123',
    provider: 'ollama',
    metadata: { model: 'llama2' }
  };
  ```
  Envialo via WebSocket ('bloom.ai.execution.prompt') o AIRuntimeAdapter.ollamaChat.
- **Beneficios:** Out-of-the-box (Ollama local), soberanía (no extensiones externas), fácil para prompts en contratos (valida con type guards).

**Lista de Todos los Contratos (Archivos en contracts/):**
Basado en lo que me compartiste y el README original, estos son los archivos clave. Usa esta lista para crear prompts (e.g., "Usa types.ts para definir un prompt con AIPromptPayload").

1. **types.ts** - Tipos principales (Nucleus, Intent, AIProvider, AIPromptPayload, BrainResult, etc.).
2. **websocket-protocol.ts** - Protocolo WebSocket (mensajes client/server, eventos bloom.ai.execution.*).
3. **errors.ts** (o errors.js) - Catálogo de errores (AI_EXECUTION_*).
4. **state-machines.ts** - Máquinas de estado (AIExecutionState, transiciones).
5. **integration.test.ts** - Tests de integración (valida contratos E2E).
6. **examples/*.json** - Ejemplos JSON para cada tipo.
7. **README.md** - Documentación general (este archivo).

Para prompts: "Crea un prompt usando AIPromptPayload de types.ts, validando transiciones con AIExecutionState de state-machines.ts, y manejando errores con AI_EXECUTION_STREAM_ERROR de errors.ts".

### README.md Actualizado (Versión Migrada a Ollama)
Aquí la versión completa actualizada. Removí todo lo de Copilot, agregué Ollama, renombré a genéricos (e.g., AIExecutionState, bloom.ai.execution.prompt), actualicé ejemplos y history. Mantuve la estructura original para que sea fácil comparar.

```markdown
# Bloom Integration Contract

**Fuente única de verdad para todos los tipos de sistema, protocolos y manejo de errores.**

Este directorio contiene el contrato formal que define cómo se comunican todas las capas del sistema Bloom:

```
UI (Svelte) ↔ Plugin API ↔ Brain CLI ↔ Filesystem
         ⇕
    Protocolo WebSocket (con streaming AI genérico)
```

---

## 📁 Archivos

### Definiciones de Tipos Principales

- **`types.ts`** - Todos los tipos TypeScript (Nucleus, Intent, Profile, AIProvider, etc.)
- **`websocket-protocol.ts`** - Protocolo de mensajes WebSocket (cliente ↔ servidor, incluyendo streaming AI genérico)
- **`errors.ts`** - Catálogo de errores con severidad y estrategias de retry (incluyendo errores AI genéricos)
- **`state-machines.ts`** - Máquinas de estado para UI con transiciones válidas (incluyendo AIExecutionState)

### Ejemplos y Tests

- **`examples/*.json`** - Ejemplos JSON válidos para cada tipo
- **`integration.test.ts`** - Tests de integración (E2E + unitarios)

---

## 🎯 Propósito

### ✅ Qué Proporciona Este Contrato

1. **Seguridad de Tipos** - Tipos compartidos evitan desviaciones entre UI y Plugin
2. **Definición de Protocolo** - Especificación formal de mensajes WebSocket (incluyendo streaming AI genérico)
3. **Estándares de Errores** - Códigos de error consistentes y estrategias de recuperación
4. **Gestión de Estados** - Transiciones validadas en máquinas de estado
5. **Tests de Integración** - Verifican cumplimiento del contrato
6. **Integración con Ollama** - Protocolo completo para workflows asistidos por AI local (Ollama como provider default)

### ❌ Qué Previene Este Contrato

- Definiciones de tipos duplicadas a través de capas
- Asunciones implícitas sobre estructuras de datos
- Manejo inconsistente de errores
- Transiciones de estado inválidas
- Cambios rompientes sin detección

---

## 📚 Guía de Uso

### Importando Tipos

```typescript
// En componentes UI
import type { Intent, Nucleus } from '@/contracts/types';
import type { AIExecutionState } from '@/contracts/state-machines';
import type { AIPromptPayload } from '@/contracts/websocket-protocol';

// En Plugin API
import type { APIResponse, ErrorResponse } from './contracts/types';
import { createErrorResponse } from './contracts/errors';

// En executor de Brain
import type { BrainResult } from './contracts/types';
```

### Usando la Máquina de Estado AI

```typescript
import { useState } from 'react';
import { isValidTransition, AI_EXECUTION_TRANSITIONS } from '@/contracts/state-machines';
import type { AIExecutionState } from '@/contracts/state-machines';

const [state, setState] = useState<AIExecutionState>({ status: 'idle', streaming: false });

if (isValidTransition(AI_EXECUTION_TRANSITIONS, state.status, 'connecting')) {
  setState({ status: 'connecting', streaming: false, processId: 'proc-123' });
}
```

### Enviando un Prompt a Ollama

```typescript
import type { AIPromptPayload } from '@/contracts/websocket-protocol';
import { ClientMessageBuilder } from '@/contracts/websocket-protocol';

// Enviar prompt via WebSocket
const payload: AIPromptPayload = {
  context: 'dev',
  text: 'Genera código para login',
  provider: 'ollama',
  metadata: { model: 'llama2' }
};

const msg = ClientMessageBuilder.aiExecutionPrompt(payload);
ws.send(JSON.stringify(msg));
```

### Manejando Errores

```typescript
import { isRecoverableError, getRetryDelay, createErrorResponse } from '@/contracts/errors';
import type { ErrorCode } from '@/contracts/types';

const code: ErrorCode = 'AI_EXECUTION_STREAM_ERROR';

if (isRecoverableError(code)) {
  const delay = getRetryDelay(code, 1); // e.g., 1000ms
  setTimeout(retry, delay);
} else {
  const errorResponse = createErrorResponse(code, 'Stream falló');
  // Muestra al usuario
}
```

### Mejores Prácticas

1. **Siempre importa de contracts/** - Nunca dupliques tipos.
2. **Usa type guards** - Narrow unions correctamente (`if (response.ok) { ... }`).
3. **Valida transiciones de estado** - Evita cambios inválidos.
4. **Maneja todos los códigos de error** - Consulta `ERROR_CATALOG` para errores recuperables.
5. **Agrega JSDoc** - Documenta tipos públicos con ejemplos.
6. **No uses `any`** - Usa `unknown` y valida en runtime.
7. **Prueba serialización** - Asegura que tipos sobrevivan JSON round-trip.
8. **Usa máquina de estado AI** - Valida transiciones antes de actualizar UI.
9. **Maneja streaming con gracia** - Acumula chunks, maneja cancelación.
10. **Chequea errores AI** - Usa `isAIExecutionError()` para manejo específico.

---

## 📞 Soporte

- Reporta violaciones de contrato como bugs.
- Propone cambios via RFC (Request for Comments).
- Pregunta en el canal `#bloom-dev`.

---

## 📜 Historia de Versiones

- **v1.2.0** (2026-02-01) - Migración a Ollama (PROMPT MIGRACIÓN)
  - Removido Copilot streaming protocol (reemplazado por AI genérico).
  - Renombrado CopilotState a AIExecutionState.
  - Removidos códigos de error Copilot (reemplazados por AI_EXECUTION_*).
  - Agregadas funciones helper: `isAIExecutionError()`, `formatErrorForUser()`.
  - Actualizado README con ejemplos Ollama.

- **v1.1.0** (2025-12-31) - Integración Copilot (deprecated).
- **v1.0.0** (2025-01-23) - Contrato inicial.

---

## ⚡ Referencia Rápida

```typescript
// Importa todo lo que necesitás
import type {
  Nucleus, Intent, IntentDev, ChromeProfile,
  APIResponse, ErrorResponse, BrainResult,
  AIPromptPayload, StreamChunkPayload
} from '@/contracts/types';

import type {
  AIExecutionState, IntentEditorState, LoadingState
} from '@/contracts/state-machines';

import type {
  ClientMessage, ServerMessage
} from '@/contracts/websocket-protocol';

import {
  createErrorResponse,
  isRecoverableError,
  getRetryDelay,
  isAIExecutionError,
  formatErrorForUser
} from '@/contracts/errors';

import {
  isValidTransition,
  assertValidTransition
} from '@/contracts/state-machines';
```

---

**Este contrato es la base de la arquitectura de Bloom. Trátalo con cuidado.**

Este README actualizado es más corto, enfocado en Ollama, y con ejemplos prácticos para prompts. Úsalo como base para generar prompts en los contratos (e.g., "Usa AIPromptPayload para un prompt en Ollama").

Listado de contratos: Como antes, types.ts, websocket-protocol.ts, errors.ts, state-machines.ts, integration.test.ts, examples/*.json.

Si querés traducción literal al español, decime.