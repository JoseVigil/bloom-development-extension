import { websocketStore } from './stores/websocket';

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

export function connectWebSocket(url: string = 'ws://localhost:4124') {
  websocketStore.connect(url);
}

export function disconnectWebSocket() {
  websocketStore.disconnect();
}

export function onWebSocketEvent(event: string, callback: (data: any) => void) {
  websocketStore.on(event, callback);
}

export function sendWebSocketMessage(event: string, data?: any) {
  // Implementation would send message through websocketStore if needed
  console.log('WS Send:', event, data);
}