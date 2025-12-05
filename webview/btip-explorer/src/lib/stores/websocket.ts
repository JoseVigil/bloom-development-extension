import { writable, derived } from 'svelte/store';
import type { Writable } from 'svelte/store';

export interface BTIPMessage {
	event: string;
	[key: string]: any;
}

export type MessageHandler = (message: BTIPMessage) => void;

interface WebSocketStore {
	socket: WebSocket | null;
	connected: boolean;
	reconnecting: boolean;
	handlers: Map<string, Set<MessageHandler>>;
}

const initialState: WebSocketStore = {
	socket: null,
	connected: false,
	reconnecting: false,
	handlers: new Map()
};

const wsStore: Writable<WebSocketStore> = writable(initialState);

let reconnectTimeout: number | null = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
const reconnectDelay = 2000;

export const ws = derived(wsStore, ($wsStore) => $wsStore.socket);
export const connected = derived(wsStore, ($wsStore) => $wsStore.connected);

export function connect(): void {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const wsUrl = `${protocol}//${window.location.host}/ws`;

	const socket = new WebSocket(wsUrl);

	socket.onopen = () => {
		console.log('WebSocket connected');
		reconnectAttempts = 0;
		wsStore.update((state) => ({
			...state,
			socket,
			connected: true,
			reconnecting: false
		}));

		// Send ping to keep connection alive
		startPingInterval(socket);
	};

	socket.onmessage = (event) => {
		try {
			const message: BTIPMessage = JSON.parse(event.data);
			handleMessage(message);
		} catch (error) {
			console.error('Failed to parse WebSocket message:', error);
		}
	};

	socket.onerror = (error) => {
		console.error('WebSocket error:', error);
	};

	socket.onclose = () => {
		console.log('WebSocket disconnected');
		wsStore.update((state) => ({
			...state,
			socket: null,
			connected: false
		}));

		// Attempt to reconnect
		attemptReconnect();
	};

	wsStore.update((state) => ({ ...state, socket }));
}

function handleMessage(message: BTIPMessage): void {
	wsStore.update((state) => {
		const handlers = state.handlers.get(message.event);
		if (handlers) {
			handlers.forEach((handler) => handler(message));
		}

		// Global handlers (listening to all events)
		const globalHandlers = state.handlers.get('*');
		if (globalHandlers) {
			globalHandlers.forEach((handler) => handler(message));
		}

		return state;
	});
}

function attemptReconnect(): void {
	if (reconnectAttempts >= maxReconnectAttempts) {
		console.error('Max reconnection attempts reached');
		return;
	}

	wsStore.update((state) => ({ ...state, reconnecting: true }));

	reconnectTimeout = window.setTimeout(() => {
		reconnectAttempts++;
		console.log(`Reconnecting... (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
		connect();
	}, reconnectDelay);
}

let pingInterval: number | null = null;

function startPingInterval(socket: WebSocket): void {
	if (pingInterval) {
		clearInterval(pingInterval);
	}

	pingInterval = window.setInterval(() => {
		if (socket.readyState === WebSocket.OPEN) {
			send({ event: 'ping' });
		}
	}, 30000); // Ping every 30 seconds
}

export function send(message: BTIPMessage): void {
	wsStore.update((state) => {
		if (state.socket && state.connected) {
			state.socket.send(JSON.stringify(message));
		} else {
			console.warn('WebSocket not connected, message not sent:', message);
		}
		return state;
	});
}

export function on(event: string, handler: MessageHandler): () => void {
	wsStore.update((state) => {
		if (!state.handlers.has(event)) {
			state.handlers.set(event, new Set());
		}
		state.handlers.get(event)!.add(handler);
		return state;
	});

	// Return unsubscribe function
	return () => {
		wsStore.update((state) => {
			const handlers = state.handlers.get(event);
			if (handlers) {
				handlers.delete(handler);
				if (handlers.size === 0) {
					state.handlers.delete(event);
				}
			}
			return state;
		});
	};
}

export function disconnect(): void {
	if (reconnectTimeout) {
		clearTimeout(reconnectTimeout);
		reconnectTimeout = null;
	}

	if (pingInterval) {
		clearInterval(pingInterval);
		pingInterval = null;
	}

	wsStore.update((state) => {
		if (state.socket) {
			state.socket.close();
		}
		return {
			...initialState,
			handlers: state.handlers
		};
	});
}