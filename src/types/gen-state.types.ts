/**
 * Tipos de dominio para `gen_state.json`.
 * Fuente: BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md, §3.
 *
 * Estos tipos son la ÚNICA fuente de verdad pre-firma (D-B1/D-B2 de §0).
 * `mandate_state.json` post-firma reutiliza el formato ya existente de
 * `standard` y no se redefine acá (ver nota al final de §3).
 *
 * CAMBIO (esta sesión): D-3 cerrado. Se agrega `DomainCandidate.dependsOn`
 * — ver nota en el campo. No requiere clustering multi-dominio real para
 * existir: es el campo que Brain poblaría *si* algún día detecta
 * dependencias, y que signMandateActivity ya sabe consumir (ver
 * mandate_genesis_activities.go). Con N=1 (alcance v1 actual, RESOLUCIÓN
 * v1.4) este campo simplemente nunca se puebla — no cambia el
 * comportamiento existente.
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
  /**
   * D-3 (CERRADO esta sesión): domainIds de otros candidatos de los que
   * este dominio depende, según lo que Brain detecte en 'cluster'.
   * Ausente o [] = sin dependencias, se scaffoldea en paralelo (default
   * histórico, sin cambios). `signMandateActivity` traduce estos
   * `domainId` a `actionId` ("gen-action-{domainName}") al firmar, y
   * solo si el dominio referenciado también está confirmado — una
   * dependencia hacia un dominio rechazado/no confirmado se descarta en
   * silencio, documentado como decisión explícita en
   * mandate_genesis_activities.go, no como comportamiento no
   * especificado.
   */
  dependsOn?: string[];
}

export interface HumanSyncRecord {
  /** escrito por Brain al completar 'cluster' */
  candidateDomains: DomainCandidate[];
  /** escrito por Nucleus al recibir el comando confirm */
  confirmedDomainIds?: string[];
  confirmedAt?: string;
  /**
   * D-9 (PARCIALMENTE CERRADO esta sesión): sigue sin existir un
   * mecanismo de identidad real compartido en el codebase (auth de
   * sesión HTTP, JWT, etc. — no encontrado en ninguna fuente revisada).
   * Lo que sí se cierra: el comando CLI `domains confirm`
   * (mandate_genesis_domains_cmd.go) ya escribe este campo, usando la
   * identidad del usuario del SO (`os/user.Current()`) como fuente
   * interina. Esto cubre el path CLI. El path HTTP/API sigue abierto —
   * necesita su propio mecanismo de sesión antes de poder poblar este
   * campo con la misma seriedad. No se inventa un valor para ese path;
   * queda vacío hasta que exista.
   */
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
