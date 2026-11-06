// Estado exclusivo de la sesión de configuración de ejecución en iTap.
// actionId identifica la acción cognitiva del contrato preparado; no se infiere del intentType.
export type LimitCeiling = { maxInferences: number; maxTotalTokens: number; maxOutputTokens: number; maxUsd?: string };
export type ChosenLimits = { maxInferences?: number; maxTotalTokens?: number; maxOutputTokens?: number; maxUsd?: string };
export type Consumer = { actionId: string; label: string; purpose: string; limits: string; eligibleDestinationKeys: string[]; limitCeiling: LimitCeiling };
export type Destination = { key: string; label: string; detail: string; backendId?: string; provider?: string; model?: string };
export type RowError = { actionId: string; message: string };
export type Validation = { fingerprint: string; validatedAt: string; validUntil: string; rowErrors: RowError[] };

export type SelectionState = {
  mandateId: string;
  digest: string;
  consumers: Consumer[];
  destinations: Destination[];
  choices: Record<string, string>;
  chosenLimits: Record<string, ChosenLimits>;
  validation: Validation | null;
  validatedFor: { mandateId: string; digest: string; choices: Record<string, string>; chosenLimits: Record<string, ChosenLimits> } | null;
};

export function emptySelection(mandateId: string, digest: string): SelectionState {
  return { mandateId, digest, consumers: [], destinations: [], choices: {}, chosenLimits: {}, validation: null, validatedFor: null };
}

export function withProjection(state: SelectionState, consumers: Consumer[], destinations: Destination[]): SelectionState {
  return { ...state, consumers, destinations, choices: {}, chosenLimits: {}, validation: null, validatedFor: null };
}

export function projectionWellFormed(consumers: Consumer[] | undefined, destinations: Destination[] | undefined): boolean {
  if (!Array.isArray(consumers) || !Array.isArray(destinations)) return false;
  const safeKey = (key: unknown) => typeof key === 'string' && key.length > 0 &&
    !['__proto__', 'prototype', 'constructor'].includes(key);
  if (!destinations.every(item => item && safeKey(item.key))) return false;
  const destinationKeys = new Set(destinations.map(item => item.key));
  return consumers.length > 0 && consumers.every(item => item && safeKey(item.actionId) &&
    item.limitCeiling &&
    (['maxInferences', 'maxTotalTokens', 'maxOutputTokens'] as const).every(field =>
      Number.isSafeInteger(item.limitCeiling[field]) && item.limitCeiling[field] > 0) &&
    (item.limitCeiling.maxUsd === undefined ||
      (typeof item.limitCeiling.maxUsd === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(item.limitCeiling.maxUsd))) &&
    Array.isArray(item.eligibleDestinationKeys) &&
    item.eligibleDestinationKeys.every(key => safeKey(key) && destinationKeys.has(key)) &&
    new Set(item.eligibleDestinationKeys).size === item.eligibleDestinationKeys.length) &&
    new Set(consumers.map(item => item.actionId)).size === consumers.length &&
    destinationKeys.size === destinations.length &&
    consumers.every(item => JSON.stringify(item.limitCeiling) === JSON.stringify(consumers[0].limitCeiling));
}

export function chooseDestination(state: SelectionState, actionId: string, destinationKey: string): SelectionState {
  const consumer = state.consumers.find(item => item.actionId === actionId);
  if (!consumer) return state;
  if (destinationKey && (!state.destinations.some(item => item.key === destinationKey) ||
    !consumer.eligibleDestinationKeys.includes(destinationKey))) return state;
  const choices = { ...state.choices };
  if (destinationKey) choices[actionId] = destinationKey;
  else delete choices[actionId];
  return { ...state, choices, validation: null, validatedFor: null };
}

export function chooseLimit(state: SelectionState, actionId: string, field: keyof ChosenLimits, raw: string): SelectionState {
  const consumer = state.consumers.find(item => item.actionId === actionId);
  if (!consumer?.limitCeiling) return state;
  const value = field === 'maxUsd' ? raw : (raw === '' ? undefined : Number(raw));
  const chosenLimits = { ...state.chosenLimits, [actionId]: { ...state.chosenLimits[actionId], [field]: value } };
  return { ...state, chosenLimits, validation: null, validatedFor: null };
}

function limitsWellFormed(state: SelectionState): boolean {
  const usdMicros = (value: string): number => {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
  };
  const ceiling = state.consumers[0]?.limitCeiling;
  if (!ceiling) return false;
  if (!state.consumers.every(item => item.limitCeiling && JSON.stringify(item.limitCeiling) === JSON.stringify(ceiling))) return false;
  for (const consumer of state.consumers) {
    const chosen = state.chosenLimits[consumer.actionId];
    if (!chosen) return false;
    for (const [field, maximum] of ([['maxInferences', ceiling.maxInferences], ['maxTotalTokens', ceiling.maxTotalTokens], ['maxOutputTokens', ceiling.maxOutputTokens]] as const)) {
      const value = chosen[field];
      if (!Number.isSafeInteger(value) || (value ?? 0) < 1 || (value ?? 0) > maximum) return false;
    }
    if (Number(chosen.maxOutputTokens) > Number(chosen.maxTotalTokens)) return false;
    if (chosen.maxUsd !== undefined && chosen.maxUsd !== '') {
      if (!ceiling.maxUsd || !/^(0|[1-9][0-9]*|(?:0|[1-9][0-9]*)\.[0-9]{1,6})$/.test(chosen.maxUsd) ||
          !Number.isSafeInteger(usdMicros(chosen.maxUsd)) || usdMicros(chosen.maxUsd) > usdMicros(ceiling.maxUsd)) return false;
    }
  }
  return (['maxInferences', 'maxTotalTokens'] as const).every(field =>
    state.consumers.reduce((sum, item) => sum + (state.chosenLimits[item.actionId]?.[field] ?? 0), 0) <= ceiling[field]) &&
    (!ceiling.maxUsd || state.consumers.reduce((sum, item) => sum + usdMicros(state.chosenLimits[item.actionId]?.maxUsd || '0'), 0) <= usdMicros(ceiling.maxUsd));
}

export function allAssigned(state: SelectionState): boolean {
  const consumerKeys = state.consumers.map(item => item.actionId);
  const destinationKeys = state.destinations.map(item => item.key);
  return projectionWellFormed(state.consumers, state.destinations) && consumerKeys.length > 0 && new Set(consumerKeys).size === consumerKeys.length &&
    new Set(destinationKeys).size === destinationKeys.length &&
    Object.keys(state.choices).length === consumerKeys.length && state.consumers.every(item =>
    !!state.choices[item.actionId] && item.eligibleDestinationKeys.includes(state.choices[item.actionId])) && limitsWellFormed(state);
}

export function withValidation(state: SelectionState, validation: Validation): SelectionState {
  return { ...state, validation, validatedFor: {
    mandateId: state.mandateId, digest: state.digest, choices: { ...state.choices },
    chosenLimits: Object.fromEntries(Object.entries(state.chosenLimits).map(([key, value]) => [key, { ...value }]))
  } };
}

export function validationWellFormed(validation: Validation | undefined): boolean {
  return !!validation && /^sha256:[a-f0-9]{64}$/.test(validation.fingerprint) &&
    Number.isFinite(Date.parse(validation.validatedAt)) &&
    Number.isFinite(Date.parse(validation.validUntil)) &&
    Array.isArray(validation.rowErrors) && validation.rowErrors.every(item =>
      item && typeof item.actionId === 'string' && typeof item.message === 'string');
}

export function canStart(state: SelectionState, now = Date.now()): boolean {
  const bound = state.validatedFor;
  return allAssigned(state) && validationWellFormed(state.validation ?? undefined) && state.validation!.rowErrors.length === 0 &&
    !!bound && bound.mandateId === state.mandateId && bound.digest === state.digest &&
    Object.keys(bound.choices).length === Object.keys(state.choices).length &&
    Object.entries(state.choices).every(([key, value]) => bound.choices[key] === value) &&
    JSON.stringify(bound.chosenLimits) === JSON.stringify(state.chosenLimits) &&
    Date.parse(state.validation!.validatedAt) <= now && Date.parse(state.validation!.validUntil) > now;
}
