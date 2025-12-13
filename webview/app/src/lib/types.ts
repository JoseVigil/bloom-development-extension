export interface SystemStatus {
  plugin: boolean;
  host: boolean;
  extension: boolean;
}

export interface Nucleus {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  nucleusId: string;
}

// NUEVO: Tipos para el Chat BTIP Voice
export interface ChatStreamChunk {
  intentId: string;
  chunk: string;
}

export interface ChatStreamEvent {
  event: 'chat_stream_start' | 'chat_stream_chunk' | 'chat_stream_end';
  data: ChatStreamChunk | { intentId: string, timestamp: number };
}