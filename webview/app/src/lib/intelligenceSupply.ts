export type ReadingState = 'available' | 'unavailable' | 'not_evaluable' | 'not_attributable' | 'stale';

type SourceResult = { source: string; status: string; result?: any; error?: string };
type RawReading = {
  read_at: string;
  selection: { source: string; org_slug: string | null; project_id: string | null; error?: string };
  nucleus: SourceResult;
  availability: SourceResult;
  consumption: SourceResult;
};

export type IntelligenceSupplyReading = {
  readAt: string;
  selection: RawReading['selection'];
  context: { source: 'nucleus'; status: ReadingState; evidence: any; reason: string | null };
  authority: { source: 'nucleus'; status: 'not_evaluable'; evidence: any; reason: string };
  availability: { source: 'aitap'; status: ReadingState; observedAt: string | null; validUntil: string | null; evidence: any; reason: string | null };
  consumption: { source: 'aitap'; status: ReadingState; scope: 'consumer_backend'; attribution: 'not_attributable'; readAt: string | null; evidence: any; reason: string | null };
};

export function reconcileIntelligenceSupply(raw: RawReading): IntelligenceSupplyReading {
  const nucleusEvidence = raw.nucleus.status === 'available' ? raw.nucleus.result?.evidence : null;
  const context = nucleusEvidence?.context;
  const authority = nucleusEvidence?.authority;
  const availability = raw.availability.status === 'available' ? raw.availability.result?.data : null;
  const readiness = availability?.readiness;
  const observedAt = typeof readiness?.observed_at === 'string' ? readiness.observed_at : null;
  const ttl = typeof readiness?.ttl_seconds === 'number' ? readiness.ttl_seconds : null;
  const validUntil = observedAt && ttl !== null && Number.isFinite(Date.parse(observedAt))
    ? new Date(Date.parse(observedAt) + ttl * 1000).toISOString() : null;
  const availabilityState: ReadingState = !readiness ? 'unavailable'
    : !validUntil ? 'not_evaluable'
    : Date.parse(raw.read_at) > Date.parse(validUntil) ? 'stale' : 'available';
  const consumption = raw.consumption.status === 'available' ? raw.consumption.result?.data : null;

  return {
    readAt: raw.read_at,
    selection: raw.selection,
    context: {
      source: 'nucleus',
      status: context?.status === 'verified' ? 'available' : 'not_evaluable',
      evidence: context || null,
      reason: context?.reason || (context ? null : raw.nucleus.error || 'material_context_unavailable')
    },
    authority: {
      source: 'nucleus', status: 'not_evaluable', evidence: authority || null,
      reason: authority?.reason || raw.nucleus.error || 'session_subject_grant_link_unavailable'
    },
    availability: {
      source: 'aitap', status: availabilityState, observedAt, validUntil,
      evidence: availability || null,
      reason: availability ? (availabilityState === 'stale' ? 'observation_expired' : null) : raw.availability.error || 'observation_unavailable'
    },
    consumption: {
      source: 'aitap', status: consumption ? 'available' : 'unavailable',
      scope: 'consumer_backend', attribution: 'not_attributable',
      readAt: consumption?.read_at || null, evidence: consumption || null,
      reason: consumption ? null : raw.consumption.error || 'accounting_unavailable'
    }
  };
}

export async function readIntelligenceSupply(): Promise<IntelligenceSupplyReading> {
  const bridge = (window as any).intelligenceSupply;
  if (!bridge?.read) throw new Error('Conductor no está disponible');
  return reconcileIntelligenceSupply(await bridge.read());
}
