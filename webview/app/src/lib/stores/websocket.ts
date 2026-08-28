// REPLACE websocket.ts with this enhanced version

import { writable } from 'svelte/store';

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  activeContext: 'onboarding' | 'genesis' | 'dev' | 'doc' | null;
  activeIntentId: string | null;
  streaming: boolean;
  chunks: string[];
}

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let onUpdateCallback: (() => void) | null = null;
let eventCallbacks: Map<string, ((data: any) => void)[]> = new Map();

const initialState: WebSocketState = {
  connected: false,
  reconnecting: false,
  activeContext: null,
  activeIntentId: null,
  streaming: false,
  chunks: []
};

export function createWebSocketStore() {
  const { subscribe, set, update } = writable<WebSocketState>(initialState);
  const reconnectCallbacks: (() => void)[] = [];
  let hasConnectedOnce = false;
  let disconnectedAfterOpen = false;

  function connect(url: string = 'ws://localhost:4124') {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    update(state => ({ ...state, reconnecting: true }));

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[WS] Connected');
        set({ ...initialState, connected: true, reconnecting: false });
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        const isReconnect = hasConnectedOnce && disconnectedAfterOpen;
        hasConnectedOnce = true;
        disconnectedAfterOpen = false;
        if (isReconnect) reconnectCallbacks.forEach((callback) => callback());
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('[WS] Parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        if (hasConnectedOnce) disconnectedAfterOpen = true;
        update(state => ({ ...state, connected: false, reconnecting: false }));
        ws = null;
        scheduleReconnect(url);
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
      update(state => ({ ...state, connected: false, reconnecting: false }));
      scheduleReconnect(url);
    }
  }

  function scheduleReconnect(url: string) {
    if (reconnectTimeout) return;
    reconnectTimeout = window.setTimeout(() => {
      reconnectTimeout = null;
      connect(url);
    }, 3000);
  }

  function handleMessage(message: any) {
    const { event, data } = message;
    
    // Legacy events
    if (event === 'btip:updated' || event === 'intents:updated') {
      if (onUpdateCallback) onUpdateCallback();
    }

    if (event === 'profile:update') {
      const callbacks = eventCallbacks.get('profile:update');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'host_event') {
      const callbacks = eventCallbacks.get('host_event');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    // Mandate events (Mandate_Event_Mechanism_Auditoria_v1.md, frente 3).
    // Antes no había ningún caso acá para 'mandate:*' — un evento de este
    // tipo se ignoraba en silencio (confirmado en la auditoría previa,
    // Core_Mandate_No_Aparece_Auditoria_v1.md, punto 1). Se despacha por
    // wildcard ('mandate:*', un solo suscriptor genérico en +layout.svelte
    // que delega a mandateStore.applyMandateEvent) en vez de agregar un
    // `if` por cada uno de los ~10 eventos de WsEventMap — evita tener que
    // tocar este archivo cada vez que se agregue un evento mandate:* nuevo.
    // También se respeta el patrón exacto ya existente (eventCallbacks.get(event))
    // por si algún caller puntual necesita suscribirse a un evento específico.
    if (typeof event === 'string' && event.startsWith('mandate:')) {
      const wildcardCallbacks = eventCallbacks.get('mandate:*');
      if (wildcardCallbacks) wildcardCallbacks.forEach(cb => cb({ event, data }));

      const specificCallbacks = eventCallbacks.get(event);
      if (specificCallbacks) specificCallbacks.forEach(cb => cb(data));
    }

    // AI events
    if (event === 'bloom.ai.execution.stream_start') {
      update(state => ({
        ...state,
        streaming: true,
        chunks: [],
        activeContext: data.context,
        activeIntentId: data.intentId || null
      }));
      
      const callbacks = eventCallbacks.get('bloom.ai.execution.stream_start');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'bloom.ai.execution.stream_chunk') {
      update(state => ({
        ...state,
        chunks: [...state.chunks, data.chunk]
      }));
      
      const callbacks = eventCallbacks.get('bloom.ai.execution.stream_chunk');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'bloom.ai.execution.stream_end') {
      update(state => ({
        ...state,
        streaming: false
      }));
      
      const callbacks = eventCallbacks.get('bloom.ai.execution.stream_end');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'bloom.ai.execution.error') {
      update(state => ({
        ...state,
        streaming: false
      }));
      
      const callbacks = eventCallbacks.get('bloom.ai.execution.error');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }
  }

  function disconnect() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    set(initialState);
  }

  function send(event: string, data?: any) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] Cannot send, not connected');
      return false;
    }
    
    ws.send(JSON.stringify({ event, data }));
    return true;
  }

  function sendAIPrompt(
    context: 'onboarding' | 'genesis' | 'dev' | 'doc',
    text: string,
    intentId?: string
  ) {
    return send('bloom.ai.execution.prompt', {
      context,
      text,
      intentId
    });
  }

  function onUpdate(callback: () => void) {
    onUpdateCallback = callback;
  }

  function on(event: string, callback: (data: any) => void) {
    if (!eventCallbacks.has(event)) {
      eventCallbacks.set(event, []);
    }
    eventCallbacks.get(event)!.push(callback);
  }

  function onReconnect(callback: () => void) {
    reconnectCallbacks.push(callback);
  }

  function clearChunks() {
    update(state => ({ ...state, chunks: [] }));
  }

  return {
    subscribe,
    connect,
    disconnect,
    send,
    sendAIPrompt,
    onUpdate,
    on,
    onReconnect,
    clearChunks
  };
}

export const websocketStore = createWebSocketStore();

export function refreshTree() {
  if (onUpdateCallback) onUpdateCallback();
}
