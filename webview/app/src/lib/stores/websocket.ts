import { writable } from 'svelte/store';

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
}

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let onUpdateCallback: (() => void) | null = null;

const initialState: WebSocketState = {
  connected: false,
  reconnecting: false
};

function createWebSocketStore() {
  const { subscribe, set, update } = writable<WebSocketState>(initialState);

  function connect(url: string = 'ws://localhost:48216') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      return;
    }

    update(state => ({ ...state, reconnecting: true }));

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected');
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
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        set({ connected: false, reconnecting: false });
        ws = null;
        scheduleReconnect(url);
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      set({ connected: false, reconnecting: false });
      scheduleReconnect(url);
    }
  }

  function scheduleReconnect(url: string) {
    if (reconnectTimeout) {
      return;
    }
    reconnectTimeout = window.setTimeout(() => {
      reconnectTimeout = null;
      connect(url);
    }, 3000);
  }

  function handleMessage(message: any) {
    console.log('WebSocket message:', message);

    if (message.event === 'btip:updated') {
      if (onUpdateCallback) {
        onUpdateCallback();
      }
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

  return {
    subscribe,
    connect,
    disconnect,
    onUpdate
  };
}

export const websocketStore = createWebSocketStore();

export function refreshTree() {
  if (onUpdateCallback) {
    onUpdateCallback();
  }
}