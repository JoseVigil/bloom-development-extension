export type EvidenceStatus = 'verified' | 'incomplete' | 'stale' | 'revoked' | 'conflict' | 'not_evaluable';
export type BindingStatus = 'bound' | 'required' | 'expired' | 'revoked' | 'conflict' | 'unavailable' | 'not_evaluable';

export interface ConfirmedContextV1 {
  schema: 'bloom.confirmed-context/v1';
  evaluatedAt: string;
  selection: { orgSlug: string | null; projectId: string | null };
  identityAndMembership: { status: EvidenceStatus; reason?: string; principalId?: string; tenantId?: string; organizationId?: string; scopeStatus?: 'verified' | 'not_evaluable'; scopeObservedAt?: string; authorityVersion?: string; stateDigest?: string };
  projectBinding: { status: BindingStatus; reason?: string; tenantId?: string; organizationId?: string; projectId?: string; revision?: string; sourceRef?: string; evidenceKind?: string; claimedAt?: string; checkedAt?: string; validUntil?: string };
  localLocation: { status: 'present' | 'absent' | 'inaccessible' | 'not_evaluable'; reason?: string; path?: string; source?: 'conductor_project_catalog'; checkedAt?: string };
  projectIdContinuity: { status: 'matched' | 'mismatch' | 'not_evaluable'; reason?: string; source?: 'nucleus_material_project_catalog'; catalogPath?: string; checkedAt?: string };
  cognitumCompatibility: { status: 'compatible' | 'incompatible' | 'not_evaluable'; reason?: string };
  intelligencePreference: { status: 'selected' | 'not_selected' | 'not_evaluable'; value?: 'local' | 'frontier' | 'both' | 'defer'; reason?: string };
}

export async function readConfirmedContext(): Promise<ConfirmedContextV1> {
  const bridge = (window as any).confirmedContext;
  if (!bridge?.read) throw new Error('confirmed_context_bridge_unavailable');
  const context: ConfirmedContextV1 = await bridge.read();
  if (context?.schema !== 'bloom.confirmed-context/v1') throw new Error('confirmed_context_schema_unsupported');
  if (!context.selection || !context.identityAndMembership?.status || !context.projectBinding?.status || !context.localLocation?.status || !context.projectIdContinuity?.status || !context.cognitumCompatibility?.status || !context.intelligencePreference?.status) {
    throw new Error('confirmed_context_incomplete_response');
  }
  return context;
}
