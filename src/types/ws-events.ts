/**
 * ws-events.ts
 * Contrato de tipos para todos los eventos del WebSocket en :4124.
 * Protocolo: { event: string, data: T }
 *
 * Secciones:
 *   1. Eventos AI (bloom.ai.execution.*) — existentes, no modificar
 *   2. Eventos filesystem (btip:*)        — existentes, no modificar
 *   3. Eventos Mandate Genesis (mandate:genesis:*) — pre-firma, Fases 1-3
 *   4. Eventos Mandate Action (mandate:action:*)   — post-firma, Fase 4 / scaffold
 */

// ---------------------------------------------------------------------------
// 1. EVENTOS AI — existentes
// ---------------------------------------------------------------------------

export interface AiExecutionConnectedPayload {
  clientId: string;
  timestamp: number;
}

export interface AiExecutionStreamStartPayload {
  processId: string;
  context: 'onboarding' | 'genesis' | 'dev' | 'doc';
  intentId?: string;
  timestamp: number;
  cancellable: boolean;
}

export interface AiExecutionStreamChunkPayload {
  processId: string;
  context: string;
  intentId?: string;
  sequence: number;
  chunk: string;
}

export interface AiExecutionStreamEndPayload {
  processId: string;
  context: string;
  intentId?: string;
  timestamp: number;
  total_chunks: number;
  total_chars: number;
}

export interface AiExecutionCancelledPayload {
  processId: string;
  reason: 'user_request' | 'server_shutdown';
}

export interface AiExecutionErrorPayload {
  processId: string;
  error_code:
    | 'AI_RATE_LIMIT'
    | 'AI_QUOTA_EXCEEDED'
    | 'AI_AUTH_FAILED'
    | 'AI_TIMEOUT'
    | 'PROCESS_CANCELLED'
    | 'AI_EXECUTION_OLLAMA_NOT_RUNNING'
    | 'AI_EXECUTION_FAILED';
  details: string;
}

// ---------------------------------------------------------------------------
// 2. EVENTOS FILESYSTEM — existentes
// ---------------------------------------------------------------------------

export interface BtipUpdatedPayload {
  path: string;
}

export interface BtipDeletedPayload {
  path: string;
}

// ---------------------------------------------------------------------------
// 3. EVENTOS MANDATE GENESIS (mandate:genesis:*)
// Emitidos por el Daemon (Control Plane autónomo en :4124).
// Cubren el ciclo pre-firma: desde que el usuario dispara el genesis
// hasta que confirma los dominios y el mandate.json queda firmado.
// ---------------------------------------------------------------------------

/**
 * mandate:genesis:initiated
 * El Daemon creó el estado intermedio del Mandate Genesis.
 * mandate_state.json existe con status: "building".
 * El mandate.json NO existe todavía.
 */
export interface MandateGenesisInitiatedPayload {
  mandateId: string;          // "genesis-{project-name}-{uuid}"
  projectName: string;
  source: string;             // path local o URL de repositorio
  initiatedAt: string;        // ISO 8601
}

/**
 * mandate:genesis:ingest_progress
 * Progreso periódico durante la Fase 1 (ingest).
 * El cliente puede usar esto para actualizar una barra de progreso.
 */
export interface MandateGenesisIngestProgressPayload {
  mandateId: string;
  filesTotal: number;
  filesProcessed: number;
  currentFile: string;        // path relativo del archivo en proceso
}

/**
 * mandate:genesis:ingest_complete
 * La Fase 1 completó. Todos los archivos están vectorizados en ChromaDB.
 * Brain pasa automáticamente a la Fase 2 (cluster).
 */
export interface MandateGenesisIngestCompletePayload {
  mandateId: string;
  filesTotal: number;
  vectorsCreated: number;
  completedAt: string;        // ISO 8601
}

/**
 * mandate:genesis:domains_proposed
 * La Fase 2 completó. Brain propone N dominios.
 * Este evento activa el punto de sincronización humana (Fase 3):
 * el cliente debe presentar la pantalla de validación de dominios.
 * El payload lleva la propuesta completa — el cliente no necesita
 * hacer un fetch adicional para renderizar la pantalla.
 */
export interface DomainProposal {
  domainName: string;
  files: string[];            // paths relativos al source original
  cohesionScore: number;      // 0.0 – 1.0
  possibleOverlapWith?: string; // nombre de un gene existente si score > 0.85
                                // solo presente en domain_expansion, ver §12.8
}

export interface MandateGenesisDomainsProposedPayload {
  mandateId: string;
  mandateType: 'genesis' | 'domain_expansion';
  domains: DomainProposal[];
  proposedAt: string;         // ISO 8601
}

/**
 * mandate:genesis:signed
 * El usuario confirmó los dominios. Nucleus firmó el mandate.json.
 * A partir de este evento el mandate existe formalmente.
 * mandate_state.json pasa de "building" → "pending" → "running".
 */
export interface MandateGenesisSignedPayload {
  mandateId: string;
  domainsConfirmed: number;   // cuántos dominios quedaron tras la edición del usuario
  actionsCreated: number;     // = domainsConfirmed (una action .gen por dominio)
  signedAt: string;           // ISO 8601
  workflowId: string;         // ID del workflow Temporal arrancado
}

/**
 * mandate:genesis:error
 * Error en cualquier punto del ciclo pre-firma.
 * Si resumable: true, el cliente puede ofrecer "Reintentar" via
 * nucleus mandate resume <mandateId>.
 */
export interface MandateGenesisErrorPayload {
  mandateId: string;
  phase: 'ingest' | 'cluster' | 'validate' | 'sign';
  message: string;
  resumable: boolean;
}

// ---------------------------------------------------------------------------
// 4. EVENTOS MANDATE ACTION (mandate:action:*)
// Emitidos por el Daemon durante la Fase 4 (scaffold).
// Cubren la ejecución del MandateWorkflow en Temporal:
// una action .gen por dominio confirmado.
// ---------------------------------------------------------------------------

/**
 * mandate:action:started
 * El MandateWorkflow arrancó el scaffold de un dominio específico.
 */
export interface MandateActionStartedPayload {
  mandateId: string;
  actionId: string;           // "gen-action-{domainName}"
  domainName: string;
  startedAt: string;          // ISO 8601
}

/**
 * mandate:action:completed
 * El scaffold de un dominio completó. El gene existe en disco.
 * resultRef apunta al report.json del pipeline del intent .gen.
 */
export interface MandateActionCompletedPayload {
  mandateId: string;
  actionId: string;
  domainName: string;
  resultRef: string;          // path relativo a .intents/.gen/.../report.json
  completedAt: string;        // ISO 8601
}

/**
 * mandate:action:failed
 * El scaffold de un dominio falló.
 * El MandateWorkflow registra failedAction en mandate_state.json
 * y el mandate pasa a status: "failed".
 */
export interface MandateActionFailedPayload {
  mandateId: string;
  actionId: string;
  domainName: string;
  error: string;
  failedAt: string;           // ISO 8601
}

/**
 * mandate:action:all_complete
 * Todos los dominios scaffoldeados. El Mandate Genesis completó.
 * mandate_state.json: status → "completed".
 * El cliente debe mostrar el resumen final.
 */
export interface MandateActionAllCompletePayload {
  mandateId: string;
  domainsScaffolded: number;
  completedAt: string;        // ISO 8601
}

/**
 * mandate:draft:created
 * Se creó un borrador de mandate de tipo "standard" (distinto al flujo
 * de Genesis). Punto de entrada para mandates que no pasan por ingest/cluster.
 */
export interface MandateDraftCreatedPayload {
  mandateId: string;
  projectName: string;
  mandateType: 'standard';
}

// ---------------------------------------------------------------------------
// MAPA DE EVENTOS — registro central para el WebSocketManager
// Une cada string de evento con su tipo de payload.
// Uso: WsEventMap[E] da el tipo del payload para el evento E.
// ---------------------------------------------------------------------------

export interface WsEventMap {
  // AI
  'bloom.ai.execution.connected':    AiExecutionConnectedPayload;
  'bloom.ai.execution.stream_start': AiExecutionStreamStartPayload;
  'bloom.ai.execution.stream_chunk': AiExecutionStreamChunkPayload;
  'bloom.ai.execution.stream_end':   AiExecutionStreamEndPayload;
  'bloom.ai.execution.cancelled':    AiExecutionCancelledPayload;
  'bloom.ai.execution.error':        AiExecutionErrorPayload;

  // Filesystem
  'btip:updated': BtipUpdatedPayload;
  'btip:deleted': BtipDeletedPayload;

  // Mandate Genesis (pre-firma)
  'mandate:genesis:initiated':        MandateGenesisInitiatedPayload;
  'mandate:genesis:ingest_progress':  MandateGenesisIngestProgressPayload;
  'mandate:genesis:ingest_complete':  MandateGenesisIngestCompletePayload;
  'mandate:genesis:domains_proposed': MandateGenesisDomainsProposedPayload;
  'mandate:genesis:signed':           MandateGenesisSignedPayload;
  'mandate:genesis:error':            MandateGenesisErrorPayload;

  // Mandate Action (post-firma / scaffold)
  'mandate:action:started':      MandateActionStartedPayload;
  'mandate:action:completed':    MandateActionCompletedPayload;
  'mandate:action:failed':       MandateActionFailedPayload;
  'mandate:action:all_complete': MandateActionAllCompletePayload;

  // Mandate Draft (standard, no-genesis)
  'mandate:draft:created': MandateDraftCreatedPayload;
}

export type WsEventName = keyof WsEventMap;
