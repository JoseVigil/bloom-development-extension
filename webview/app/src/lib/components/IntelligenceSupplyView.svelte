<script lang="ts">
  import { onMount } from 'svelte';
  import { readIntelligenceSupply, type IntelligenceSupplyReading } from '$lib/intelligenceSupply';

  let reading: IntelligenceSupplyReading | null = null;
  let error: string | null = null;
  let loading = true;

  async function refresh() {
    loading = true;
    error = null;
    try { reading = await readIntelligenceSupply(); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Lectura no disponible'; }
    finally { loading = false; }
  }

  onMount(() => { void refresh(); });
</script>

<section class="supply" aria-label="Lectura de Intelligence Supply">
  <header><h2>Intelligence Supply</h2><button type="button" on:click={refresh} disabled={loading}>Actualizar lectura</button></header>
  {#if loading}<p>Leyendo fuentes…</p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if reading}
    <p class="stamp">Lectura: {reading.readAt}</p>
    <div class="grid">
      <article>
        <h3>Contexto</h3>
        <p>Selección de Conductor: {reading.selection.org_slug || 'sin organización'} / {reading.selection.project_id || 'sin proyecto'}</p>
        <p>Nucleus: {reading.context.status === 'available' ? 'organización verificada' : 'no evaluable'}</p>
        {#if reading.context.evidence?.organization_id}<p>Organization ID: {reading.context.evidence.organization_id}</p>{/if}
        {#if reading.context.evidence?.project_status}<p>Proyecto material: no evaluable</p>{/if}
        {#if reading.context.reason}<p>{reading.context.reason}</p>{/if}
      </article>
      <article>
        <h3>Autoridad</h3>
        <p>No evaluable</p>
        <p>{reading.authority.reason}</p>
        <small>Fuente: Nucleus. Ningún grant se presenta como permiso de esta sesión.</small>
      </article>
      <article>
        <h3>Disponibilidad local</h3>
        <p>{reading.availability.status === 'available' ? 'Observación vigente' : reading.availability.status === 'stale' ? 'Observación vencida' : reading.availability.status === 'not_evaluable' ? 'No evaluable' : 'No disponible'}</p>
        {#if reading.availability.observedAt}<p>Observada: {reading.availability.observedAt}</p>{/if}
        {#if reading.availability.validUntil}<p>Vigente hasta: {reading.availability.validUntil}</p>{/if}
        {#if reading.availability.evidence?.readiness?.models}
          {#each Object.entries(reading.availability.evidence.readiness.models) as [model, observed]}
            <p>{model}: {(observed as any).available === true ? 'disponible' : (observed as any).available === false ? 'no disponible' : 'no evaluable'}</p>
          {/each}
        {/if}
        {#if reading.availability.reason}<p>{reading.availability.reason}</p>{/if}
        <small>Fuente: AITAP.</small>
      </article>
      <article>
        <h3>Consumo registrado</h3>
        <p>Alcance: consumidor + backend. Atribución a Tenant/Organization/Project: no atribuible.</p>
        {#if reading.consumption.evidence}
          <p>Leído: {reading.consumption.readAt}; journals inválidos: {reading.consumption.evidence.journals_invalid}</p>
          {#if reading.consumption.evidence.journals_invalid > 0}<p>Cobertura incompleta: existen registros que no pudieron verificarse.</p>{/if}
          {#each reading.consumption.evidence.rows || [] as row}
            <div class="row">
              <strong>{row.consumer_id} / {row.backend_id}</strong>
              <span>{row.input_tokens} entrada · {row.output_tokens} salida · {row.completed} completados</span>
              <span>Costo conocido en registros válidos: USD {row.cost_usd} ({row.cost_coverage === 'partial' ? 'parcial; costo pendiente' : 'sin costo pendiente registrado'})</span>
            </div>
          {:else}<p>Sin consumo registrado para la consulta.</p>{/each}
        {:else}<p>Consumo no disponible: {reading.consumption.reason}</p>{/if}
        <small>Fuente: AITAP.</small>
      </article>
    </div>
  {/if}
</section>

<style>
  .supply { padding: 1rem; background: #151923; color: #f2f4f8; border-radius: 10px; }
  header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
  h2, h3 { margin: 0 0 .7rem; }
  button { padding: .5rem .8rem; cursor: pointer; }
  .stamp, small { color: #adb7c8; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: .8rem; }
  article { padding: 1rem; background: #202637; border: 1px solid #39445a; border-radius: 8px; }
  .row { display: flex; flex-direction: column; gap: .2rem; padding: .6rem 0; border-top: 1px solid #39445a; }
</style>
