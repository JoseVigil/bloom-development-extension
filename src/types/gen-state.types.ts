/**
 * Tipos de dominio para `gen_state.json`.
 * Fuente: BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md, §3.
 *
 * Estos tipos son la ÚNICA fuente de verdad pre-firma (D-B1/D-B2 de §0).
 * `mandate_state.json` post-firma reutiliza el formato ya existente de
 * `standard` y no se redefine acá (ver nota al final de §3).
 */

export type GenMandateType = 'genesis' | 'domain_expansion';

export type GenStatus = 'building' | 'building_paused' | 'building_failed' | 'signed';

export type GenPhase = 'ingest' | 'cluster' | 'validate' | 'scaffold' | 'complete';

export interface PhaseRecord {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  intentId?: string;
  sequenceNumber?: number;
  failureReason?: string;
}

export interface DomainCandidate {
  domainId: string;
  name: string;
  /** 0.0–1.0, mismo rango que --min-cohesion en link-genes */
  cohesionScore: number;
  /** preview, no las Actions reales todavía */
  suggestedActionCount: number;
  /** solo domain_expansion: domainId del genesis base si hay solapamiento */
  overlapsWithExisting?: string;
}

export interface HumanSyncRecord {
  /** escrito por Brain al completar 'cluster' */
  candidateDomains: DomainCandidate[];
  /** escrito por Nucleus al recibir el comando confirm */
  confirmedDomainIds?: string[];
  confirmedAt?: string;
  /** D-9 (§8): sin fuente de verdad de identidad todavía — placeholder */
  confirmedBy?: string;
}

export interface GenState {
  mandateId: string;
  mandateType: GenMandateType;
  /** solo domain_expansion — referencia al genesis del que parte */
  baseGenesisId?: string;
  /** repo/path/URL analizado en ingest */
  source: string;
  project: string;
  name: string;

  status: GenStatus;
  currentPhase: GenPhase;

  phases: {
    ingest: PhaseRecord;
    cluster: PhaseRecord;
    validate: PhaseRecord & { humanSync: HumanSyncRecord };
    // 'scaffold' NO vive acá — a partir de la firma, el progreso de scaffold
    // se lee de mandate_state.json (D-B1), no de gen_state.json.
  };

  createdAt: string; // ISO 8601
  signedAt?: string;
  pausedAt?: string;
  /** nunca 'validate' — ver §7.2 */
  pausedPhase?: 'ingest' | 'cluster';
}

/**
 * Forma mínima de mandate.json que el preHandler de §5.2 necesita leer
 * para validar `--base-genesis`. No es el shape completo de un mandate
 * firmado (eso pertenece al Command Surface v0.2.0, standard) — acá solo
 * los campos que la validación semántica consulta.
 */
export interface SignedMandateSummary {
  mandateId: string;
  mandateType: 'standard' | 'genesis' | 'domain_expansion';
  currentStatus: string;
  [key: string]: unknown;
}
