<script lang="ts">
  // webview/app/src/lib/components/TabBar.svelte
  //
  // TabBar del shell — faltaba físicamente en el repo aunque +layout.svelte
  // ya la importaba (ver PROMPT_Fix_TabBar_y_Errores_Consola.md). Consume
  // $lib/stores/tabs para la lista de tabs abiertos, y emite los mismos dos
  // eventos que +layout.svelte ya escucha: `newmandate` y `togglealfred`.
  //
  // Paleta / tokens copiados de Sidebar.svelte para mantener identidad
  // visual consistente en el rail + tab strip.

  import { createEventDispatcher } from 'svelte';
  import { tabsStore } from '$lib/stores/tabs';

  const dispatch = createEventDispatcher<{ newmandate: void; togglealfred: void }>();

  $: tabs = $tabsStore.tabs;
  $: activeId = $tabsStore.activeId;

  function selectTab(id: string) {
    tabsStore.setActive(id);
  }

  function closeTab(event: MouseEvent, id: string) {
    event.stopPropagation();
    tabsStore.closeTab(id);
  }

  function handleTabKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectTab(id);
    }
  }
</script>

<div class="tab-bar">
  <div class="tab-strip" role="tablist" aria-label="Tabs abiertos">
    {#if tabs.length === 0}
      <div class="tab-strip-empty">Sin pestañas abiertas</div>
    {:else}
      {#each tabs as tab (tab.id)}
        <div
          class="tab"
          class:active={tab.id === activeId}
          role="tab"
          tabindex="0"
          aria-selected={tab.id === activeId}
          on:click={() => selectTab(tab.id)}
          on:keydown={(e) => handleTabKeydown(e, tab.id)}
        >
          <span class="tab-title">{tab.title}</span>
          {#if tab.closable !== false}
            <button
              class="tab-close"
              type="button"
              aria-label={`Cerrar ${tab.title}`}
              on:click={(e) => closeTab(e, tab.id)}
            >
              ×
            </button>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="tab-actions">
    <button
      class="action-btn"
      type="button"
      title="Nuevo Mandate"
      aria-label="Nuevo Mandate"
      on:click={() => dispatch('newmandate')}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M10 4v12M4 10h12" />
      </svg>
    </button>
    <button
      class="action-btn"
      type="button"
      title="Alfred"
      aria-label="Alternar panel de Alfred"
      on:click={() => dispatch('togglealfred')}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <circle cx="10" cy="7.5" r="3.5" />
        <path d="M4.5 17c0-2.9 2.462-5.25 5.5-5.25s5.5 2.35 5.5 5.25" />
      </svg>
    </button>
  </div>
</div>

<style>
  .tab-bar {
    --color-surface: #0d1117;
    --color-surface-hover: #131820;
    --color-text-primary: #e8eaf0;
    --color-text-secondary: rgba(232, 234, 240, 0.45);
    --color-text-dim: rgba(232, 234, 240, 0.22);
    --color-border: rgba(255, 255, 255, 0.06);
    --color-border-active: rgba(255, 255, 255, 0.18);
    --color-accent: #c8f55a;
    --color-accent-dim: rgba(200, 245, 90, 0.12);
    --font-mono: 'DM Mono', monospace;
    --tab-h: 46px;

    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--tab-h);
    flex-shrink: 0;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    padding: 0 0.5rem;
    overflow: hidden;
  }

  .tab-strip {
    display: flex;
    align-items: stretch;
    height: 100%;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .tab-strip-empty {
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--color-text-dim);
    white-space: nowrap;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    max-width: 220px;
    border-right: 1px solid var(--color-border);
    cursor: pointer;
    color: var(--color-text-secondary);
    transition: background 150ms ease, color 150ms ease;
    white-space: nowrap;
  }

  .tab:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .tab.active {
    background: var(--color-accent-dim);
    color: var(--color-text-primary);
    box-shadow: inset 0 -2px 0 var(--color-accent);
  }

  .tab:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px;
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.8125rem;
  }

  .tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.6;
    cursor: pointer;
    border-radius: 3px;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .tab-close:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
  }

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
    padding-left: 0.5rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  .action-btn svg {
    width: 15px;
    height: 15px;
  }

  .action-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-accent);
    border-color: var(--color-border-active);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
