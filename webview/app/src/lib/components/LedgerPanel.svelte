<script lang="ts">
  // src/lib/components/LedgerPanel.svelte
  //
  // Zona 3 del shell de mandate — "Event Bus Feed", solo observabilidad,
  // sin acciones. Estructura y tokens tomados como referencia de diseño de
  // bloom-conductor-genesis-v1_1.html (.ledger-panel), NO se importa ni se
  // edita ese archivo — es HTML/CSS/JS standalone, esto es el componente
  // Svelte real.
  //
  // Datos: ledgerStore.ts, placeholder explícito (ver comentario ahí).
  // Se monta hoy dentro del right-pane del shell cuando el tab activo es
  // un mandate (+layout.svelte), no como ruta propia.

  import { ledgerStore, entriesForMandate } from '$lib/stores/ledgerStore';

  export let mandateId: string;

  $: entries = entriesForMandate(mandateId);
  $: paused = $ledgerStore.paused;
</script>

<aside class="ledger-panel" aria-label="Event Bus Feed">
  <div class="ledger-header">
    <span class="ledger-title-text">Event Bus Feed</span>
    <button
      type="button"
      class="ledger-live"
      class:paused
      on:click={() => ledgerStore.toggleLive()}
      aria-pressed={!paused}
    >
      <span class="ledger-live-dot" />
      <span class="ledger-live-text">{paused ? 'Pausado' : 'Live'}</span>
    </button>
  </div>

  <div class="ledger-body">
    {#if $entries.length === 0}
      <div class="feed-empty">Sin eventos todavía</div>
    {:else}
      {#each $entries as entry (entry.id)}
        <div class="feed-row">
          <div class="feed-row-top">
            <span class="feed-time">{entry.time}</span>
            <span class="feed-event evt-{entry.kind}">{entry.name}</span>
          </div>
          {#if entry.payload}
            <span class="feed-payload">{entry.payload}</span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="ledger-footer">
    <p class="ledger-footer-note">
      Datos de ejemplo (placeholder) — solo observabilidad, sin acciones desde este panel.
    </p>
  </div>
</aside>

<style>
  .ledger-panel {
    --color-surface: #0d1117;
    --color-surface-hover: #131820;
    --color-text-primary: #e8eaf0;
    --color-text-secondary: rgba(232, 234, 240, 0.45);
    --color-text-dim: rgba(232, 234, 240, 0.22);
    --color-border: rgba(255, 255, 255, 0.06);
    --color-accent: #c8f55a;
    --color-error: #ff4444;
    --font-mono: 'DM Mono', monospace;
    --tab-h: 46px;

    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    color: var(--color-text-primary);
  }

  .ledger-header {
    height: var(--tab-h);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px 0.75rem;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .ledger-title-text {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }

  .ledger-live {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
  }

  .ledger-live-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-accent);
    box-shadow: 0 0 5px rgba(200, 245, 90, 0.4);
    animation: pulse-live 2s ease-in-out infinite;
  }

  .ledger-live.paused .ledger-live-dot {
    background: var(--color-text-dim);
    box-shadow: none;
    animation: none;
  }

  .ledger-live-text {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.12em;
    color: var(--color-accent);
    text-transform: uppercase;
  }

  .ledger-live.paused .ledger-live-text {
    color: var(--color-text-dim);
  }

  @keyframes pulse-live {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .ledger-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 0;
    display: flex;
    flex-direction: column;
  }

  .feed-empty {
    padding: 20px 4px;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-dim);
    letter-spacing: 0.06em;
    text-align: center;
  }

  .feed-row {
    padding: 8px 4px;
    border-bottom: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .feed-row-top {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .feed-time {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-dim);
    flex-shrink: 0;
  }

  .feed-event {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-text-primary);
    word-break: break-word;
  }

  .feed-event.evt-genesis {
    color: var(--color-accent);
  }

  .feed-event.evt-error {
    color: var(--color-error);
  }

  .feed-payload {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-secondary);
    line-height: 1.5;
    word-break: break-word;
  }

  .ledger-footer {
    padding: 10px 4px 0;
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .ledger-footer-note {
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
    line-height: 1.6;
    margin: 10px 0 0;
  }
</style>
