import assert from 'node:assert/strict';
import test from 'node:test';
import { allAssigned, canStart, chooseDestination, chooseLimit, emptySelection, projectionWellFormed, validationWellFormed, withProjection, withValidation } from './intentSupplyAssignments.ts';
import { productIntentSupplyOperations } from './intentSupplyAssignmentsBridge.ts';

const ceiling = { maxInferences: 2, maxTotalTokens: 10000, maxOutputTokens: 4096 };
const consumers = [
  { actionId: 'a', label: 'A', purpose: 'A', limits: 'A', eligibleDestinationKeys: ['x', 'y'], limitCeiling: ceiling },
  { actionId: 'b', label: 'B', purpose: 'B', limits: 'B', eligibleDestinationKeys: ['x', 'y'], limitCeiling: ceiling }
];
const destinations = [
  { key: 'x', label: 'X', detail: 'X' },
  { key: 'y', label: 'Y', detail: 'Y' }
];
const validValidation = { fingerprint: 'sha256:' + 'a'.repeat(64), validatedAt: '2026-01-01T00:00:00Z', validUntil: '2099-01-01T00:00:00Z', rowErrors: [] };
function chooseTestLimits(state) {
  for (const actionId of state.consumers.map(item => item.actionId)) {
    state = chooseLimit(state, actionId, 'maxInferences', '1');
    state = chooseLimit(state, actionId, 'maxTotalTokens', '3000');
    state = chooseLimit(state, actionId, 'maxOutputTokens', '1024');
  }
  return state;
}

test('cada consumidor requiere una selección; se puede compartir destino', () => {
  let state = withProjection(emptySelection('mandate', 'digest'), consumers, destinations);
  state = chooseDestination(state, 'a', 'x');
  assert.equal(allAssigned(state), false);
  state = chooseDestination(state, 'b', 'x');
  assert.equal(allAssigned(state), true);
  state = chooseTestLimits(state);
  assert.equal(allAssigned(state), true);
  assert.deepEqual(state.choices, { a: 'x', b: 'x' });
});

test('acciones con el mismo intentType conservan asignaciones distintas por actionId', () => {
  const repeatedIntent = [
    { actionId: 'exp-4', intentType: 'exp', label: 'Explorar', purpose: 'Primera acción', limits: '', eligibleDestinationKeys: ['x'], limitCeiling: ceiling },
    { actionId: 'exp-6', intentType: 'exp', label: 'Explorar', purpose: 'Segunda acción', limits: '', eligibleDestinationKeys: ['y'], limitCeiling: ceiling }
  ];
  let state = withProjection(emptySelection('mandate', 'digest'), repeatedIntent, destinations);
  state = chooseDestination(state, 'exp-4', 'x');
  assert.equal(allAssigned(state), false);
  state = chooseDestination(state, 'exp-6', 'y');
  state = chooseTestLimits(state);
  assert.equal(allAssigned(state), true);
  assert.deepEqual(state.choices, { 'exp-4': 'x', 'exp-6': 'y' });
});

test('cada acción rechaza destinos que son elegibles sólo para otra', () => {
  const scoped = [
    { ...consumers[0], eligibleDestinationKeys: ['x'] },
    { ...consumers[1], eligibleDestinationKeys: ['y'] }
  ];
  let state = withProjection(emptySelection('mandate', 'digest'), scoped, destinations);
  assert.equal(chooseDestination(state, 'a', 'y'), state);
  assert.equal(chooseDestination(state, 'b', 'x'), state);
  state = chooseDestination(state, 'a', 'x');
  state = chooseDestination(state, 'b', 'y');
  state = chooseTestLimits(state);
  assert.equal(allAssigned(state), true);
  assert.equal(allAssigned({ ...state, choices: { a: 'y', b: 'x' } }), false);
});

test('cambiar un destino invalida la validación y proyección nueva descarta elecciones', () => {
  let state = withProjection(emptySelection('mandate', 'digest'), consumers, destinations);
  state = chooseDestination(chooseDestination(state, 'a', 'x'), 'b', 'y');
  state = chooseTestLimits(state);
  state = withValidation(state, validValidation);
  assert.equal(canStart(state), true);
  state = chooseDestination(state, 'b', 'x');
  assert.equal(canStart(state), false);
  state = withProjection(state, consumers, destinations);
  assert.deepEqual(state.choices, {});
});

test('validación vencida o con errores bloquea inicio; no hay preselección', () => {
  let state = withProjection(emptySelection('mandate', 'digest'), consumers, destinations);
  assert.equal(canStart(state), false);
  state = chooseDestination(chooseDestination(state, 'a', 'x'), 'b', 'y');
  state = chooseTestLimits(state);
  const validation = { ...validValidation, validUntil: '2020-01-01T00:00:00Z' };
  assert.equal(canStart(withValidation(state, validation)), false);
  assert.equal(canStart(withValidation(state, { ...validation, validUntil: '2099-01-01T00:00:00Z', rowErrors: [{ actionId: 'a', message: 'denied' }] })), false);
  assert.equal(canStart(withValidation(state, { ...validation, validUntil: '2099-01-01T00:00:00Z', fingerprint: '' })), false);
  assert.equal(validationWellFormed({ ...validValidation, fingerprint: '' }), false);
});

test('la validación queda vinculada al mandato, digest y elecciones de esta sesión', () => {
  let state = withProjection(emptySelection('mandate-a', 'digest-a'), consumers, destinations);
  state = chooseDestination(chooseDestination(state, 'a', 'x'), 'b', 'y');
  state = chooseTestLimits(state);
  state = withValidation(state, validValidation);
  assert.equal(canStart(state), true);
  assert.equal(canStart({ ...state, mandateId: 'mandate-b' }), false);
  assert.equal(canStart({ ...state, digest: 'digest-b' }), false);
  assert.equal(canStart({ ...state, choices: { a: 'x', b: 'x' } }), false);
});

test('sin puente real, lectura, validación e inicio fallan cerrados', async () => {
  const state = emptySelection('mandate', 'digest');
  for (const result of [
    await productIntentSupplyOperations.read(state.mandateId, state.digest),
    await productIntentSupplyOperations.validate(state),
    await productIntentSupplyOperations.start(state)
  ]) {
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'intent_supply_unavailable');
  }
});

test('el rechazo de identidad de Nucleus no se convierte en destinos elegibles', async () => {
  let closed = false;
  globalThis.window = { intentSupplySession: {
    list: async () => ({ ok: false, error: { code: 'actor_human_approval_unavailable' } }),
    close: async () => { closed = true; }
  } };
  try {
    const result = await productIntentSupplyOperations.read('mandate', 'sha256:' + 'a'.repeat(64));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'actor_human_approval_unavailable');
    await productIntentSupplyOperations.close('mandate', 'sha256:' + 'a'.repeat(64));
    assert.equal(closed, true);
  } finally { delete globalThis.window; }
});

test('un listado autenticado conserva destinos distintos por Action ID', async () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  globalThis.window = { intentSupplySession: {
    list: async () => ({ ok: true, value: { mandateId: 'mandate', digest, status: 'eligible', actions: [
      { actionId: 'ing-1', requiredCapabilities: ['text.generate'], eligibility: 'eligible',
        destinations: [{ backendId: 'gemini_api', provider: 'google', model: 'gemini-pro' }],
        limitCeiling: { maxInferences: 2, maxTotalTokens: 20000, maxOutputTokens: 4096 }, errors: [] },
      { actionId: 'dis-2', requiredCapabilities: ['text.generate'], eligibility: 'eligible',
        destinations: [{ backendId: 'anthropic_api', provider: 'anthropic', model: 'claude' }],
        limitCeiling: { maxInferences: 2, maxTotalTokens: 20000, maxOutputTokens: 4096 }, errors: [] }
    ] } }),
    close: async () => {}
  } };
  try {
    const result = await productIntentSupplyOperations.read('mandate', digest);
    assert.equal(result.ok, true);
    assert.equal(result.value.consumers.length, 2);
    const state = withProjection(emptySelection('mandate', digest), result.value.consumers, result.value.destinations);
    const wrong = result.value.consumers[1].eligibleDestinationKeys[0];
    assert.equal(chooseDestination(state, 'ing-1', wrong), state);
  } finally { delete globalThis.window; }
});

test('la selección de recursos no exige presupuesto por acción', () => {
  let state = withProjection(emptySelection('mandate', 'digest'),
    consumers.map(({ limitCeiling, ...item }) => item), destinations);
  state = chooseDestination(chooseDestination(state, 'a', 'x'), 'b', 'y');
  assert.equal(allAssigned(state), true);
});

test('validate envía sólo el destino elegido', async () => {
  const ceiling = { maxInferences: 1, maxTotalTokens: 5000, maxOutputTokens: 2048, maxUsd: '1' };
  let state = withProjection(emptySelection('mandate', 'sha256:' + 'a'.repeat(64)),
    [{ ...consumers[0], eligibleDestinationKeys: ['x'], limitCeiling: ceiling }],
    [{ ...destinations[0], backendId: 'gemini_api', provider: 'google', model: 'gemini-pro' }]);
  state = chooseDestination(state, 'a', 'x');
  state = chooseLimit(state, 'a', 'maxInferences', '1');
  state = chooseLimit(state, 'a', 'maxTotalTokens', '3000');
  state = chooseLimit(state, 'a', 'maxOutputTokens', '1024');
  state = chooseLimit(state, 'a', 'maxUsd', '1');
  let sent;
  globalThis.window = { intentSupplySession: {
    list: async () => ({}), close: async () => ({}),
    validate: async payload => { sent = payload; return { ok: false, error: { code: 'test_denied' } }; }
  } };
  try {
    const result = await productIntentSupplyOperations.validate(state);
    assert.equal(result.ok, false);
    assert.deepEqual(sent.assignments, [{ action_id: 'a',
      destination: { backend_id: 'gemini_api', provider: 'google', model: 'gemini-pro' } }]);
  } finally { delete globalThis.window; }
});

test('proyección duplicada o con claves no seguras se rechaza', () => {
  assert.equal(projectionWellFormed(consumers, destinations), true);
  assert.equal(projectionWellFormed([...consumers, consumers[0]], destinations), false);
  assert.equal(projectionWellFormed(consumers, [...destinations, destinations[0]]), false);
  assert.equal(projectionWellFormed(consumers, [null]), false);
  assert.equal(projectionWellFormed([{ ...consumers[0], actionId: '__proto__' }], destinations), false);
  assert.equal(projectionWellFormed([{ ...consumers[0], eligibleDestinationKeys: ['missing'] }], destinations), false);
  assert.equal(projectionWellFormed([{ ...consumers[0], eligibleDestinationKeys: ['x', 'x'] }], destinations), false);
  assert.equal(projectionWellFormed([], destinations), false);
  assert.equal(projectionWellFormed([{ ...consumers[0], limitCeiling: undefined }], destinations), true);
});

test('sin límites explícitos se valida sólo después de elegir destinos', async () => {
  let state = withProjection(emptySelection('mandate', 'digest'), consumers, destinations);
  state = chooseDestination(chooseDestination(state, 'a', 'x'), 'b', 'y');
  assert.equal(allAssigned(state), true);
  assert.equal(allAssigned({ ...state, consumers: consumers.map(({ limitCeiling, ...item }) => item) }), true);
  let called = false;
  globalThis.window = { intentSupplySession: {
    list: async () => ({}), close: async () => ({}),
    validate: async () => { called = true; return { ok: true }; }
  } };
  try {
    const result = await productIntentSupplyOperations.validate(state);
    assert.equal(result.ok, false);
    assert.equal(called, true);
  } finally { delete globalThis.window; }
});
