import { allAssigned, type Consumer, type Destination, type LimitCeiling, type SelectionState, type Validation } from './intentSupplyAssignments.ts';

export type OperationError = { code: string; message: string };
export type OperationResult<T> = { ok: true; value: T } | { ok: false; error: OperationError };
export type Projection = { consumers: Consumer[]; destinations: Destination[] };
type ListValue = { mandateId: string; digest: string; status: string; actions: Array<{
  actionId: string; requiredCapabilities: string[]; eligibility: string;
  destinations: Array<{ backendId: string; provider: string; model: string }>;
  limitCeiling: LimitCeiling;
  errors: string[];
}> };
export type IntentSupplyOperations = {
  read(mandateId: string, digest: string): Promise<OperationResult<Projection>>;
  validate(state: SelectionState): Promise<OperationResult<Validation>>;
  start(state: SelectionState): Promise<OperationResult<{ reference: string }>>;
  close?(mandateId: string, digest: string): Promise<void>;
};

type SessionBridge = {
  list(selection: { mandateId: string; digest: string }): Promise<unknown>;
  validate(selection: { mandateId: string; digest: string; assignments: unknown[] }): Promise<unknown>;
  close(selection: { mandateId: string; digest: string }): Promise<unknown>;
};

function sessionBridge(): SessionBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as any).intentSupplySession;
  return bridge && typeof bridge.list === 'function' && typeof bridge.close === 'function' ? bridge : null;
}

const unavailable = <T>(): OperationResult<T> => ({
  ok: false, error: { code: 'intent_supply_unavailable', message: 'La selección por Intent aún no está disponible en esta instalación.' }
});

function projectionFromList(value: ListValue, mandateId: string, digest: string): Projection | null {
  const expectedDigest = digest.startsWith('sha256:') ? digest : 'sha256:' + digest;
  if (value?.mandateId !== mandateId || value.digest !== expectedDigest ||
      !Array.isArray(value.actions) || value.actions.length === 0) return null;
  const destinations = new Map<string, Destination>();
  const consumers: Consumer[] = [];
  for (const action of value.actions) {
    if (typeof action.actionId !== 'string' || !Array.isArray(action.requiredCapabilities) ||
        !Array.isArray(action.destinations) || !Array.isArray(action.errors) ||
        !action.limitCeiling || !Number.isSafeInteger(action.limitCeiling.maxInferences) ||
        !Number.isSafeInteger(action.limitCeiling.maxTotalTokens) ||
        !Number.isSafeInteger(action.limitCeiling.maxOutputTokens)) return null;
    const eligibleDestinationKeys: string[] = [];
    for (const destination of action.destinations) {
      if (!destination || ['backendId', 'provider', 'model'].some(key =>
          typeof (destination as any)[key] !== 'string')) return null;
      const key = JSON.stringify([destination.backendId, destination.provider, destination.model]);
      destinations.set(key, { key, label: destination.model,
        detail: `${destination.provider} · ${destination.backendId}`,
        backendId: destination.backendId, provider: destination.provider, model: destination.model });
      eligibleDestinationKeys.push(key);
    }
    consumers.push({ actionId: action.actionId, label: action.actionId,
      purpose: action.requiredCapabilities.join(', '), limits: '', eligibleDestinationKeys,
      limitCeiling: action.limitCeiling });
  }
  return { consumers, destinations: [...destinations.values()] };
}

export const productIntentSupplyOperations: IntentSupplyOperations = {
  async read(mandateId, digest) {
    const bridge = sessionBridge();
    if (!bridge) return unavailable<Projection>();
    try {
      const result = await bridge.list({ mandateId, digest }) as {
        ok?: unknown; error?: { code?: unknown }; value?: ListValue;
      };
      if (result?.ok === true && result.value) {
        const projection = projectionFromList(result.value, mandateId, digest);
        if (projection) return { ok: true, value: projection };
      }
      if (result?.ok === false && typeof result.error?.code === 'string') {
        return { ok: false, error: { code: result.error.code,
          message: 'Nucleus no pudo verificar la identidad y el suministro para esta preparación.' } };
      }
    } catch { /* El proceso puede terminar mientras se cierra la pantalla. */ }
    // El frame de éxito público todavía no está definido por Nucleus. Un
    // resultado desconocido no habilita destinos en el renderer.
    return unavailable<Projection>();
  },
  async validate(state) {
    const bridge = sessionBridge();
    if (!bridge || typeof bridge.validate !== 'function' || !allAssigned(state)) return unavailable<Validation>();
    const assignments = state.consumers.map(consumer => {
      const destination = state.destinations.find(item => item.key === state.choices[consumer.actionId]);
      const limits = state.chosenLimits[consumer.actionId];
      if (!destination || !limits) return null;
      return { action_id: consumer.actionId,
        destination: { backend_id: destination.backendId, provider: destination.provider, model: destination.model },
        limits: { max_inferences: limits.maxInferences, max_total_tokens: limits.maxTotalTokens,
          max_output_tokens: limits.maxOutputTokens,
          ...(limits.maxUsd ? { max_usd: limits.maxUsd.includes('.') ? limits.maxUsd : limits.maxUsd + '.0' } : {}) } };
    });
    if (assignments.some(item => !item)) return unavailable<Validation>();
    try {
      const result = await bridge.validate({ mandateId: state.mandateId, digest: state.digest, assignments }) as {
        ok?: unknown; error?: { code?: unknown }; value?: { status?: unknown; fingerprint?: unknown;
          validatedAt?: unknown; validUntil?: unknown; actions?: Array<{ actionId?: unknown; errors?: unknown }> };
      };
      if (result?.ok === true && result.value?.status === 'valid' &&
          typeof result.value.fingerprint === 'string' && typeof result.value.validatedAt === 'string' &&
          typeof result.value.validUntil === 'string' && Array.isArray(result.value.actions)) {
        return { ok: true, value: { fingerprint: result.value.fingerprint,
          validatedAt: result.value.validatedAt, validUntil: result.value.validUntil, rowErrors: [] } };
      }
      if (result?.ok === false && typeof result.error?.code === 'string') {
        return { ok: false, error: { code: result.error.code,
          message: 'Nucleus no pudo validar los límites y destinos elegidos.' } };
      }
    } catch { /* La sesión puede cerrarse durante la aprobación. */ }
    return unavailable<Validation>();
  },
  async start() { return unavailable<{ reference: string }>(); },
  async close(mandateId, digest) {
    try { await sessionBridge()?.close({ mandateId, digest }); } catch { /* Cierre idempotente. */ }
  }
};
