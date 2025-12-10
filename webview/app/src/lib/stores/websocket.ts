import { writable } from 'svelte/store';

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
}

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let onUpdateCallback: (() => void) | null = null;
let eventCallbacks: Map<string, ((data: any) => void)[]> = new Map();

const initialState: WebSocketState = {
  connected: false,
  reconnecting: false
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
        set({ connected: true, reconnecting: false });
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
        set({ connected: false, reconnecting: false });
        ws = null;
        scheduleReconnect(url);
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
      set({ connected: false, reconnecting: false });
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

  function onUpdate(callback: () => void) {
    onUpdateCallback = callback;
  }

  function on(event: string, callback: (data: any) => void) {
    if (!eventCallbacks.has(event)) {
      eventCallbacks.set(event, []);
    }
    eventCallbacks.get(event)!.push(callback);
  }

  return {
    subscribe,
    connect,
    disconnect,
    onUpdate,
    on
  };
}

export const websocketStore = createWebSocketStore();

export function refreshTree() {
  if (onUpdateCallback) onUpdateCallback();
}