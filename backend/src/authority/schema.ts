// backend/src/authority/schema.ts
//
// LEGACY HTTP/D1 types below remain for snapshot.ts until lot 1B. They are NOT
// the interoperable wire contract. Wire* types at the end are used by emission.ts.
// Interfaces TS locales del payload full/delta del Authority Snapshot (§4, §5, §7 del
// diseño físico) — mismo patrón que manifest.ts (ReleaseRow/IonEntry/IonManifest):
// interfaces locales, sin Zod ni ninguna librería de validación.
//
// SUPUESTO DE DISEÑO: no tengo `BLOOM_REMOTE_AUTHORITY_PHYSICAL_DESIGN_v0_1.md` en esta
// sesión, así que estos campos son mi inferencia razonable a partir de lo que el encargo
// y la nota técnica describen (wire schema full/delta, versionado anti-downgrade,
// catálogo de roles, envelope firmado). No son una transcripción del §4/§5/§7 reales —
// Génesis debe confrontarlos contra el diseño físico antes de dar esto por cerrado.

export interface AuthoritySnapshotPrincipal {
  id: string;
  external_ids: Record<string, string>;
  display_name: string | null;
}

export interface AuthoritySnapshotMembership {
  id: string;
  principal_id: string;
  organization_id: string;
  status: "active" | "suspended" | "removed";
  effective_from: number;
  effective_until: number | null;
}

export interface AuthoritySnapshotRoleDefinition {
  id: string;
  key: string;
  version: number;
  organization_id: string | null;
  definition: unknown;
}

export interface AuthoritySnapshotRoleAssignment {
  id: string;
  principal_id: string;
  membership_id: string;
  role_definition_id: string;
  scope: unknown | null;
  effective_from: number;
  effective_until: number | null;
}

export interface AuthoritySnapshotRevocation {
  id: string;
  target_type: "principal" | "membership" | "role_assignment";
  target_id: string;
  visible_from_version: number;
  effective_until: number | null;
  reason: string | null;
}

interface AuthoritySnapshotContentBase {
  organization_id: string;
  version: number;
  generated_at: string;
  principals: AuthoritySnapshotPrincipal[];
  memberships: AuthoritySnapshotMembership[];
  role_definitions: AuthoritySnapshotRoleDefinition[];
  role_assignments: AuthoritySnapshotRoleAssignment[];
  revocations: AuthoritySnapshotRevocation[];
}

export interface AuthoritySnapshotContentFull extends AuthoritySnapshotContentBase {
  kind: "full";
}

export interface AuthoritySnapshotContentDelta extends AuthoritySnapshotContentBase {
  kind: "delta";
  base_version: number;
}

export type AuthoritySnapshotContent = AuthoritySnapshotContentFull | AuthoritySnapshotContentDelta;

// Envelope firmado que efectivamente viaja por HTTP (§3, §8.1 del diseño físico).
export interface AuthorityEnvelope {
  content: AuthoritySnapshotContent;
  digest: string; // sha256 hex del JCS-canonical de `content` (sin `version`/`generated_at`, ver canonical.ts)
  signature: string; // base64 de la firma Ed25519 con separador de dominio
  signing_key_id: string;
}

// §11.1 del diseño físico: issuer, organización canónica, claves de firma autorizadas, vigencia.
export interface AuthorityTrustBundleSigningKey {
  key_id: string;
  public_key: string; // base64 raw public key (32 bytes Ed25519)
  effective_from: number;
  effective_until: number | null;
}

export interface AuthorityTrustBundle {
  issuer: string;
  organization_id: string;
  signing_keys: AuthorityTrustBundleSigningKey[];
}

// Canonical wire v1, independent of the legacy database representation above.
export interface WirePrincipal {
  principal_id: string;
  principal_type: "human" | "service";
  status: "active" | "suspended" | "retired";
  external_identities: { provider: string; subject: string; display_handle: string; status: "verified" | "revoked"; verified_at: string }[];
}
export interface WireMembership {
  membership_id: string; principal_id: string; organization_id: string;
  status: "pending" | "active" | "suspended" | "expired" | "revoked";
  valid_from: string; valid_until: string | null; accepted_at: string;
}
export interface WireRoleDefinition {
  role_id: string; role_version: string; role_origin: "builtin" | "organization";
  display_name: string; status: "active" | "suspended" | "retired"; permissions: string[];
}
export interface WireRoleAssignment {
  assignment_id: string; membership_id: string; role_id: string; role_version: string;
  scope: { type: "organization" | "project" | "mandate" | "intent" | "resource" | "environment"; id: string };
  status: WireMembership["status"]; valid_from: string; valid_until: string | null; accepted_at: string;
}
export interface WireRevocation {
  revocation_id: string; target_type: "external_identity" | "membership" | "role_definition" | "role_assignment";
  target_id: string; effective_at: string; recorded_in_authority_version: string; reason_code: string;
}
export interface WireFullContent {
  principals: WirePrincipal[]; memberships: WireMembership[]; role_definitions: WireRoleDefinition[];
  role_assignments: WireRoleAssignment[]; revocations: WireRevocation[];
}
export interface WireEmissionMetadata {
  schema: "bloom.authority.snapshot"; schema_version: "1.0";
  snapshot_id: string; issuer: string; organization_id: string; authority_version: string;
  issued_at: string; not_before: string; expires_at: string;
  audience: { organization_id: string; installation_ids: string[] };
}
export interface WireDeltaOperation {
  sequence: string; operation: "upsert" | "remove"; collection: keyof WireFullContent;
  entity_id: string; value: WireFullContent[keyof WireFullContent][number] | null;
}
export type WireSnapshotPayload = WireEmissionMetadata & (
  { kind: "full"; base_authority_version: null; content: WireFullContent } |
  { kind: "delta"; base_authority_version: string; content: { result_digest: string; operations: WireDeltaOperation[] } }
);
export interface WireEnvelope {
  payload: WireSnapshotPayload;
  integrity: {
    canonicalization: "JCS-RFC8785"; digest_algorithm: "SHA-256"; digest: string;
    signature_algorithm: "Ed25519"; key_id: string; signature: string;
  };
}
