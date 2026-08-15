// src/ai/adapters/OllamaNativeAdapter.ts
//
// Antes: shelleaba `brain ollama chat --json` (vía AIRuntimeAdapter.ollamaChat),
// comando que no existe en brain/ — cada llamada fallaba, y el streaming era
// fake: se partía palabra por palabra una respuesta que nunca se generó.
//
// Ahora: se conecta de verdad a installer/alfred/src/alfred/server.py (WS
// /ws/chat), que habla con Ollama local vía OllamaTextProvider. El streaming
// es real — cada chunk viene del campo "response" de Ollama, no de un split()
// artificial. Ver installer/alfred/AGENTS.md para el resto del contrato.
//
// Nota deliberada: el `context` string de AIPromptPayload ('general' | 'dev' |
// ...) no viaja hoy desde WebSocketManager.handleAIExecutionPrompt hasta acá
// — ese método solo pasa un objeto `context: { intentId, profileId, metadata }`
// como bolsa de metadata, no el enum semántico. Se mantiene ese mismo gap (no
// se resuelve en este cambio, que es sobre el punto de ejecución, no sobre el
// resto del pipe) — a Alfred se le manda 'general' por default hasta que se
// decida forwardear el valor real.

import WebSocket from 'ws';

const ALFRED_WS_URL = process.env.ALFRED_SERVER_WS_URL || 'ws://127.0.0.1:48219/ws/chat';

interface AlfredWsMessage {
  type: 'chunk' | 'done' | 'error';
  text?: string;
  error_code?: string;
  message?: string;
}

/** Error con el código estructurado que devuelve Alfred (ProviderError.response.error_code),
 * para que WebSocketManager.classifyError() no tenga que adivinar por texto libre. */
export class AlfredProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AlfredProviderError';
  }
}

export default class OllamaNativeAdapter {
  private activeSockets: Map<string, WebSocket> = new Map();

  async executePrompt(params: {
    prompt: string;
    context?: Record<string, any>;
    stream?: boolean;
    processId?: string;
  }): Promise<{ chunks: AsyncIterable<string>; totalChars: number }> {
    // `result` se retorna antes de que el streaming termine, pero `totalChars`
    // se sigue leyendo por referencia después del `for await` (ver
    // WebSocketManager.handleAIExecutionPrompt) — por eso es un objeto mutable
    // que el generador va actualizando a medida que yieldea chunks reales,
    // en vez de un número fijo calculado de antemano.
    const result: { chunks: AsyncIterable<string>; totalChars: number } = {
      chunks: null as unknown as AsyncIterable<string>,
      totalChars: 0
    };
    result.chunks = this.streamFromAlfred(params, result);
    return result;
  }

  private async *streamFromAlfred(
    params: { prompt: string; context?: Record<string, any>; processId?: string },
    result: { totalChars: number }
  ): AsyncGenerator<string> {
    const ws = new WebSocket(ALFRED_WS_URL);
    const socketKey = params.processId ?? `alfred_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.activeSockets.set(socketKey, ws);

    const queue: string[] = [];
    let finished = false;
    let failure: Error | null = null;
    let wake: (() => void) | null = null;

    const notify = () => {
      if (wake) {
        const w = wake;
        wake = null;
        w();
      }
    };

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          text: params.prompt,
          context: 'general', // ver nota de módulo: el enum real no llega hasta acá todavía
          intentId: params.context?.intentId ?? null,
          profileId: params.context?.profileId ?? null,
          metadata: params.context?.metadata ?? null
        })
      );
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      let msg: AlfredWsMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        failure = new Error('Respuesta no-JSON del servidor de Alfred');
        finished = true;
        notify();
        return;
      }

      if (msg.type === 'chunk' && msg.text) {
        queue.push(msg.text);
        notify();
      } else if (msg.type === 'done') {
        finished = true;
        notify();
      } else if (msg.type === 'error') {
        failure = new AlfredProviderError(
          msg.error_code || 'AI_EXECUTION_FAILED',
          msg.message || 'Alfred devolvió un error sin mensaje'
        );
        finished = true;
        notify();
      }
    });

    ws.on('error', (err: Error) => {
      // No hay servidor de Alfred escuchando en ALFRED_WS_URL, o se cayó la conexión.
      failure = new AlfredProviderError(
        'AI_EXECUTION_PROCESS_NOT_FOUND',
        `No se pudo conectar al servidor de Alfred (${ALFRED_WS_URL}): ${err.message}`
      );
      finished = true;
      notify();
    });

    ws.on('close', () => {
      finished = true;
      notify();
    });

    try {
      while (true) {
        if (queue.length > 0) {
          const chunk = queue.shift()!;
          result.totalChars += chunk.length;
          yield chunk;
          continue;
        }
        if (finished) {
          if (failure) throw failure;
          return;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      this.activeSockets.delete(socketKey);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  async cancelProcess(processId: string): Promise<void> {
    const ws = this.activeSockets.get(processId);
    if (!ws) {
      // Comportamiento pre-existente: WebSocketManager no pasaba processId
      // acá antes de este cambio, así que un caller viejo (o un processId
      // que ya terminó) simplemente no encuentra nada que cancelar. No es
      // un error — no había nada real que cancelar tampoco antes de este
      // cambio (el adapter fake solo hacía console.log).
      return;
    }
    ws.close();
    this.activeSockets.delete(processId);
  }
}
