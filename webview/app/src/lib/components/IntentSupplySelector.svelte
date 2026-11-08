<script lang="ts">
  import { onMount } from 'svelte';
  import { allAssigned, canStart, chooseDestination, emptySelection, projectionWellFormed, validationWellFormed, withProjection, withValidation, type SelectionState } from '$lib/intentSupplyAssignments';
  import { productIntentSupplyOperations, type IntentSupplyOperations, type OperationError } from '$lib/intentSupplyAssignmentsBridge';

  export let mandateId: string;
  export let digest: string;
  export let operations: IntentSupplyOperations = productIntentSupplyOperations;

  let state: SelectionState = emptySelection(mandateId, digest);
  let loading = true;
  let busy = false;
  let error: OperationError | null = null;
  let now = Date.now();
  let active = true;
  let step: 'select' | 'review' = 'select';
  const failed = { code: 'intent_supply_unavailable', message: 'La verificación de suministro no está disponible. Volvé a intentar más tarde.' };

  onMount(() => {
    active = true;
    const timer = setInterval(() => (now = Date.now()), 1000);
    void load();
    return () => { active = false; clearInterval(timer); void operations.close?.(mandateId, digest); };
  });

  async function load() {
    loading = true;
    error = null;
    try {
      const result = await operations.read(mandateId, digest);
      if (!active) return;
      if (result.ok && projectionWellFormed(result.value?.consumers, result.value?.destinations)) {
        state = withProjection(emptySelection(mandateId, digest), result.value.consumers, result.value.destinations);
      } else if (result.ok) error = { code: 'projection_invalid', message: 'Nucleus no entregó una proyección válida para esta preparación.' };
      else error = result.error;
    } catch { if (active) error = failed; }
    finally { if (active) loading = false; }
  }

  function select(actionId: string, event: Event) {
    state = chooseDestination(state, actionId, (event.currentTarget as HTMLSelectElement).value);
    error = null;
  }

  function next() {
    if (!busy && allAssigned(state)) step = 'review';
  }

  function back() {
    if (!busy) step = 'select';
  }

  async function validate() {
    if (busy || !allAssigned(state)) return;
    busy = true;
    error = null;
    const snapshot = state;
    try {
      const result = await operations.validate(snapshot);
      if (active && state === snapshot) {
        if (result.ok && validationWellFormed(result.value)) {
          state = withValidation(state, result.value);
          if (result.value.rowErrors.length) step = 'select';
        } else if (result.ok) error = failed;
        else error = result.error;
      }
    } catch { if (active && state === snapshot) error = failed; }
    finally { if (active) busy = false; }
  }

</script>

<section class="supply" aria-label="Asignaciones de suministro por Intent" data-testid="intent-supply">
  <h4>Asignaciones por Intent</h4>
  <p class="muted">Elegí un recurso habilitado para cada Intent cognitivo. La confirmación no inicia el Mandate ni consume tokens.</p>
  {#if loading}
    <p class="muted" role="status">Consultando Intents y destinos…</p>
  {:else if error && state.consumers.length === 0}
    <p class="warn" role="status" data-testid="supply-unavailable">Selección no disponible: {error.message}</p>
  {:else if state.consumers.length === 0}
    <p class="warn" role="status">No hay Intents cognitivos verificables para esta preparación.</p>
  {:else}
    {#if step === 'select'}
      <p class="muted" role="status">{Object.keys(state.choices).length} de {state.consumers.length} Intents con destino.</p>
      {#each state.consumers as consumer (consumer.actionId)}
        {@const rowError = state.validation?.rowErrors.find(item => item.actionId === consumer.actionId)}
        <div class="row" data-testid="supply-row">
          <label for={'supply-' + consumer.actionId}>{consumer.label}</label>
          <p class="muted">{consumer.purpose}{consumer.limits ? ` · ${consumer.limits}` : ''}</p>
          <select id={'supply-' + consumer.actionId} value={state.choices[consumer.actionId] || ''} on:change={(event) => select(consumer.actionId, event)} disabled={busy} aria-invalid={!!rowError} aria-describedby={rowError ? 'supply-error-' + consumer.actionId : undefined}>
            <option value="">Elegir destino…</option>
            {#each state.destinations.filter(destination => consumer.eligibleDestinationKeys.includes(destination.key)) as destination (destination.key)}
              <option value={destination.key}>{destination.label} · {destination.detail}</option>
            {/each}
          </select>
          {#if consumer.eligibleDestinationKeys.length === 0}<p class="warn">No hay destinos elegibles para esta acción.</p>{/if}
          {#if rowError}<p id={'supply-error-' + consumer.actionId} class="warn" role="alert">{rowError.message}</p>{/if}
        </div>
      {/each}
      {#if state.destinations.length === 0}<p class="warn">Nucleus no informó destinos elegibles.</p>{/if}
      <button type="button" disabled={busy || !allAssigned(state)} on:click={next} data-testid="next-supply">Siguiente</button>
    {:else}
      <div class="summary" data-testid="supply-summary">
        <strong>Revisar suministro antes de iniciar</strong>
        <ul>
          {#each state.consumers as consumer (consumer.actionId)}
            <li>{consumer.label} → {state.destinations.find(item => item.key === state.choices[consumer.actionId])?.label || 'Sin destino'}</li>
          {/each}
        </ul>
        <p class="muted">Confirmar no consume tokens ni inicia el Mandate.</p>
        {#if state.validation}<p class="muted">La validación vence: {state.validation.validUntil}.</p>{/if}
        {#if state.validation && !canStart(state, now)}<p class="warn" role="status">La validación venció o no coincide con las elecciones. Corregí las filas o volvé a validar.</p>{/if}
        {#if canStart(state, now)}<p role="status">Selección confirmada y conservada por Nucleus para esta preparación. El inicio del Mandate queda para el siguiente gate.</p>{/if}
      </div>
      <button type="button" class="secondary" disabled={busy} on:click={back}>Volver a elegir</button>
      <button type="button" disabled={busy || !allAssigned(state)} on:click={validate} data-testid="validate-supply">{busy ? 'Verificando…' : 'Confirmar selección'}</button>
    {/if}
    {#if error}<p class="warn" role="alert">{error.message}</p>{/if}
  {/if}
</section>

<style>
  .supply { flex-basis: 100%; width: 100%; margin-top: 12px; padding: 14px; border: 1px solid rgba(139, 92, 246, 0.45); border-radius: 8px; background: rgba(139, 92, 246, 0.06); }
  h4 { margin: 0 0 8px; font-family: 'Syne', sans-serif; font-size: 15px; }
  .row { margin: 14px 0; padding: 10px; border: 1px solid rgba(232, 234, 240, 0.12); border-radius: 6px; }
  .row label { display: block; font-weight: 600; }
  .row p { margin: 5px 0; }
  select { min-width: 220px; max-width: 100%; padding: 7px; background: #242233; color: #e8eaf0; border: 1px solid rgba(232, 234, 240, 0.4); border-radius: 5px; }
  select:focus-visible, button:focus-visible { outline: 2px solid #b99aff; outline-offset: 2px; }
  .limit-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-top: 10px; }
  .limit-grid label { font-size: 12px; }
  .limit-grid small { display: block; color: rgba(232, 234, 240, 0.68); font-weight: 400; }
  .limit-grid input { box-sizing: border-box; width: 100%; margin-top: 4px; padding: 6px; background: #242233; color: #e8eaf0; border: 1px solid rgba(232, 234, 240, 0.4); border-radius: 5px; }
  .limit-grid input:focus-visible { outline: 2px solid #b99aff; outline-offset: 2px; }
  .summary { margin: 14px 0; }
  .summary ul { margin: 8px 0; padding-left: 18px; }
  .summary li { margin: 4px 0; }
  .muted { color: rgba(232, 234, 240, 0.68); font-size: 12px; }
  .warn { color: #f08a8a; font-size: 12px; }
  button { margin-top: 8px; margin-right: 8px; font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 6px; border: 1px solid rgba(139, 92, 246, 0.6); background: rgba(139, 92, 246, 0.2); color: #e8eaf0; cursor: pointer; }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button.secondary { background: transparent; border-color: rgba(232, 234, 240, 0.25); }
</style>
