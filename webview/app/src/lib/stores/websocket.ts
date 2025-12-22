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

function createWebSocketStore() {
  const { subscribe, set, update } = writable<WebSocketState>(initialState);

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

    // Copilot events
    if (event === 'copilot.stream_start') {
      update(state => ({
        ...state,
        streaming: true,
        chunks: [],
        activeContext: data.context,
        activeIntentId: data.intentId || null
      }));
      
      const callbacks = eventCallbacks.get('copilot.stream_start');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'copilot.stream_chunk') {
      update(state => ({
        ...state,
        chunks: [...state.chunks, data.chunk]
      }));
      
      const callbacks = eventCallbacks.get('copilot.stream_chunk');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'copilot.stream_end') {
      update(state => ({
        ...state,
        streaming: false
      }));
      
      const callbacks = eventCallbacks.get('copilot.stream_end');
      if (callbacks) callbacks.forEach(cb => cb(data));
    }

    if (event === 'copilot.error') {
      update(state => ({
        ...state,
        streaming: false
      }));
      
      const callbacks = eventCallbacks.get('copilot.error');
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

  function sendCopilotPrompt(
    context: 'onboarding' | 'genesis' | 'dev' | 'doc',
    text: string,
    intentId?: string
  ) {
    return send('copilot.prompt', {
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

  function clearChunks() {
    update(state => ({ ...state, chunks: [] }));
  }

  return {
    subscribe,
    connect,
    disconnect,
    send,
    sendCopilotPrompt,
    onUpdate,
    on,
    clearChunks
  };
}

export const websocketStore = createWebSocketStore();

export function refreshTree() {
  if (onUpdateCallback) onUpdateCallback();
}