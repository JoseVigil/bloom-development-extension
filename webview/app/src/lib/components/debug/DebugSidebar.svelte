<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let filters: Record<string, { on: boolean; count: number; color: string }>;
  export let healthData: { state?: string; components?: Record<string, any> } | null = null;
  export let healthError = false;

  const dispatch = createEventDispatcher<{
    toggleFilter: string;
    clear: void;
    refreshHealth: void;
  }>();

  const HEALTH_COMPONENTS = [
    { key: 'temporal',       label: 'Temporal' },
    { key: 'worker',         label: 'Worker' },
    { key: 'brain_service',  label: 'Brain' },
    { key: 'bloom_api',      label: 'API' },
    { key: 'control_plane',  label: 'Control Plane' },
    { key: 'svelte_dev',     label: 'Svelte' },
    { key: 'harness',        label: 'Harness' },
    { key: 'vault',          label: 'Vault' },
    { key: 'worker_manager', label: 'Profiles' },
  ];

  $: healthComponents = healthData?.components || {};
  $: healthState = healthData?.state || '—';
  $: healthDegraded = healthData?.state !== 'HEALTHY';

  function dotClass(c: any): string {
    if (!c) return '';
    const isStub = c.state === 'STUB' || c.state === 'PRE_ONBOARDING';
    if (isStub) return 'stub';
    return c.healthy ? 'ok' : 'err';
  }
</script>

<div class="sidebar">
  <!-- Health -->
  <div class="sidebar-section">
    <div class="sidebar-section-label">System health</div>
    <div class="health-grid">
      {#if healthError}
        <div class="health-row">
          <div class="h-dot err"></div>
          <span class="h-name" style="color:var(--d-error)">API unreachable</span>
        </div>
      {:else if !healthData}
        <div class="health-row">
          <div class="h-dot"></div>
          <span class="h-name">loading…</span>
        </div>
      {:else}
        {#each HEALTH_COMPONENTS as comp}
          {#if healthComponents[comp.key]}
            {@const c = healthComponents[comp.key]}
            {@const isStub = c.state === 'STUB' || c.state === 'PRE_ONBOARDING'}
            <div class="health-row">
              <div class="h-dot {dotClass(c)}"></div>
              <span class="h-name">{comp.label}</span>
              <span class="h-state" class:h-stub={isStub}>{c.state}</span>
              {#if c.port}<span class="h-state">:{c.port}</span>{/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
    <div class="health-summary" class:degraded={healthDegraded || healthError}>
      {healthError ? 'UNKNOWN' : healthState}
    </div>
  </div>

  <!-- Filters -->
  <div class="sidebar-section-label filters-label">Filters</div>
  <div class="sidebar-filters">
    {#each Object.entries(filters) as [cat, f]}
      <div class="filter-row" on:click={() => dispatch('toggleFilter', cat)} role="button" tabindex="0"
           on:keydown={(e) => e.key === 'Enter' && dispatch('toggleFilter', cat)}>
        <div class="filter-check" class:on={f.on}></div>
        <span class="filter-label" style="color:{f.on ? f.color : 'var(--d-text-dim)'};">{cat}</span>
        <span class="filter-count">{f.count}</span>
      </div>
    {/each}
  </div>

  <!-- Actions -->
  <div class="sidebar-actions">
    <button class="action-btn" on:click={() => dispatch('clear')}>Clear</button>
    <button class="action-btn accent" on:click={() => dispatch('refreshHealth')}>Health ↺</button>
  </div>
</div>

<style>
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    border-right: 1px solid var(--d-border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-section {
    padding: 14px 16px 8px;
    border-bottom: 1px solid var(--d-border);
  }
  .sidebar-section-label {
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    margin-bottom: 10px;
  }
  .filters-label {
    padding: 14px 16px 6px;
    font-family: var(--d-font-mono);
    font-size: 9px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--d-text-dim);
  }

  /* Health */
  .health-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
  }
  .h-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--d-text-dim);
    flex-shrink: 0;
    transition: background 0.4s, box-shadow 0.4s;
  }
  .h-dot.ok   { background: var(--d-success); }
  .h-dot.err  { background: var(--d-error); }
  .h-dot.warn { background: var(--d-warn); }
  .h-dot.stub { background: var(--d-warn); box-shadow: 0 0 5px var(--d-warn); }
  .h-name {
    font-family: var(--d-font-mono);
    font-size: 11px;
    color: var(--d-text-secondary);
    flex: 1;
  }
  .h-state {
    font-family: var(--d-font-mono);
    font-size: 10px;
    color: var(--d-text-dim);
  }
  .h-stub { color: var(--d-warn); }
  .health-summary {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--d-border);
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--d-success);
  }
  .health-summary.degraded { color: var(--d-warn); }

  /* Filters */
  .sidebar-filters {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: auto;
  }
  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.15s;
  }
  .filter-row:hover { background: var(--d-surface-hover); }
  .filter-check {
    width: 12px; height: 12px;
    border: 1px solid var(--d-border-active);
    border-radius: 2px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, border-color 0.2s;
  }
  .filter-check.on { background: var(--d-accent); border-color: var(--d-accent); }
  .filter-check.on::after {
    content: '';
    width: 6px; height: 4px;
    border-left: 1.5px solid #080A0E;
    border-bottom: 1.5px solid #080A0E;
    transform: rotate(-45deg) translate(1px, -1px);
    display: block;
  }
  .filter-label {
    font-family: var(--d-font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--d-text-secondary);
  }
  .filter-count {
    margin-left: auto;
    font-family: var(--d-font-mono);
    font-size: 10px;
    color: var(--d-text-dim);
  }

  /* Actions */
  .sidebar-actions {
    padding: 10px 16px;
    border-top: 1px solid var(--d-border);
    display: flex;
    gap: 8px;
  }
  .action-btn {
    flex: 1;
    background: transparent;
    border: 1px solid var(--d-border);
    border-radius: 2px;
    padding: 7px 0;
    font-family: var(--d-font-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--d-text-dim);
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }
  .action-btn:hover {
    border-color: var(--d-border-active);
    color: var(--d-text-secondary);
    background: var(--d-surface-hover);
  }
  .action-btn.accent {
    border-color: rgba(200,245,90,0.3);
    color: var(--d-accent);
  }
  .action-btn.accent:hover {
    background: var(--d-accent-dim);
    border-color: var(--d-accent);
  }
</style>
