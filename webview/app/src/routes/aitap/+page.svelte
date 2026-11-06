<script lang="ts">
  import { onMount } from 'svelte';
  import IntentSupplySelector from '$lib/components/IntentSupplySelector.svelte';
  import { readInstallations, shortDigest, type InstalledInstance, type Failure } from '$lib/wisdomOffer';

  let installations: InstalledInstance[] = [];
  let error: Failure | null = null;
  let loading = true;
  let selectedMandateId: string | null = null;

  $: prepared = installations.filter(item => item.instance.status === 'prepared' && item.consistent && !!item.instance.preparation?.contractDigest);
  $: selected = prepared.find(item => item.instance.mandateId === selectedMandateId) || null;

  async function refresh() {
    loading = true;
    const result = await readInstallations();
    if (result.ok) {
      installations = result.value;
      error = null;
      if (!installations.some(item => item.instance.mandateId === selectedMandateId && item.instance.status === 'prepared' && item.consistent)) selectedMandateId = null;
    } else {
      installations = [];
      selectedMandateId = null;
      error = result.error;
    }
    loading = false;
  }

  onMount(() => { void refresh(); });
</script>

<div class="aitap">
  <header>
    <div>
      <h1>iTap</h1>
      <p>Configuración del suministro de inteligencia al iniciar un Mandate</p>
    </div>
    <button type="button" on:click={refresh} disabled={loading}>Actualizar</button>
  </header>

  <section aria-labelledby="mandates-title">
    <h2 id="mandates-title">Mandates preparados para ejecución</h2>
    {#if loading}
      <p role="status" class="muted">Leyendo Mandates preparados…</p>
    {:else if error}
      <p role="alert" class="warn">No se pudieron leer las instalaciones: {error.code}</p>
    {:else if prepared.length === 0}
      <p class="muted">No hay Mandates preparados y verificables. La instalación y preparación se realizan en <a href="/wisdom">Wisdom</a>.</p>
    {:else}
      <ul class="mandates">
        {#each prepared as item (item.instance.mandateId)}
          <li>
            <div>
              <strong>{item.instance.definition.label}</strong>
              <span class="muted">Proyecto {item.instance.projectId} · Contrato {shortDigest(item.instance.preparation?.contractDigest || '')}</span>
            </div>
            <button type="button" aria-pressed={selectedMandateId === item.instance.mandateId} on:click={() => (selectedMandateId = item.instance.mandateId)}>Configurar ejecución</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if selected}
    {#key selected.instance.mandateId + ':' + selected.instance.preparation?.contractDigest}
      <IntentSupplySelector mandateId={selected.instance.mandateId} digest={selected.instance.preparation?.contractDigest || ''} />
    {/key}
    <button type="button" class="secondary" on:click={() => (selectedMandateId = null)}>Cancelar configuración</button>
  {/if}
</div>

<style>
  .aitap { min-height: 100%; padding: 24px 28px; color: #e8eaf0; background: #080a0e; }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  h1 { margin: 0; font: 600 20px 'Syne', sans-serif; }
  h2 { margin: 26px 0 12px; font: 600 13px 'Syne', sans-serif; letter-spacing: .04em; }
  header p, .muted { color: rgba(232,234,240,.6); font: 12px 'DM Mono', monospace; }
  .warn { color: #f08a8a; font: 12px 'DM Mono', monospace; }
  a { color: #c8f55a; }
  .mandates { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .mandates li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px; border: 1px solid rgba(232,234,240,.12); border-radius: 8px; background: rgba(232,234,240,.03); }
  .mandates li div { display: grid; gap: 5px; }
  button { font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 6px; border: 1px solid rgba(139,92,246,.6); background: rgba(139,92,246,.2); color: #e8eaf0; cursor: pointer; }
  button.secondary { margin-top: 12px; background: transparent; border-color: rgba(232,234,240,.25); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button:focus-visible, a:focus-visible { outline: 2px solid #c8f55a; outline-offset: 2px; }
</style>
